"""
SMTP delivery for SENTINEX session report PDFs.
Configure via environment variables (see .env.example).
"""

from __future__ import annotations

import base64
import logging
import os
import re
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict

logger = logging.getLogger("caterpillar_api.report_email")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_PDF_BYTES = 12 * 1024 * 1024  # 12 MB


def smtp_configured() -> bool:
    host = os.getenv("SMTP_HOST", "").strip()
    from_addr = os.getenv("SMTP_FROM", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    if not host or not from_addr:
        return False
    # Allow relay without auth when user/password omitted (internal relay)
    return True


def smtp_public_config() -> Dict[str, Any]:
    host = os.getenv("SMTP_HOST", "").strip()
    from_addr = os.getenv("SMTP_FROM", "").strip()
    return {
        "configured": smtp_configured(),
        "from_address": from_addr or None,
        "host": host or None,
        "port": int(os.getenv("SMTP_PORT", "587")),
        "use_tls": _env_bool("SMTP_USE_TLS", True),
    }


def _env_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def send_report_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    pdf_base64: str,
    pdf_filename: str,
    sender_name: str | None = None,
) -> Dict[str, Any]:
    if not smtp_configured():
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_FROM, and credentials in .env"
        )

    to_email = (to_email or "").strip()
    if not _EMAIL_RE.match(to_email):
        raise ValueError("Invalid recipient email address")

    try:
        pdf_bytes = base64.b64decode(pdf_base64, validate=True)
    except Exception as exc:
        raise ValueError("Invalid PDF attachment payload") from exc

    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("Attachment is not a valid PDF file")
    if len(pdf_bytes) > _MAX_PDF_BYTES:
        raise ValueError("PDF attachment exceeds size limit")

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_addr = os.getenv("SMTP_FROM", "").strip()
    use_tls = _env_bool("SMTP_USE_TLS", True)

    safe_name = (pdf_filename or "SENTINEX_Session_Report.pdf").strip()
    if not safe_name.lower().endswith(".pdf"):
        safe_name += ".pdf"

    msg = MIMEMultipart()
    msg["Subject"] = subject.strip() or "SENTINEX Test Cell Session Report"
    msg["From"] = from_addr
    msg["To"] = to_email
    if sender_name:
        msg["Reply-To"] = from_addr

    msg.attach(MIMEText(body_text.strip() or "SENTINEX session report attached.", "plain", "utf-8"))

    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=safe_name)
    msg.attach(attachment)

    logger.info("Sending session report email to %s via %s:%s", to_email, host, port)

    if use_tls:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=30) as server:
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())

    return {
        "status": "sent",
        "to": to_email,
        "from": from_addr,
        "filename": safe_name,
        "bytes": len(pdf_bytes),
    }
