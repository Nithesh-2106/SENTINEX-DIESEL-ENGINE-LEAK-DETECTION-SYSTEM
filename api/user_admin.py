"""
user_admin.py — Head-only tester account management via Supabase Admin API.
Username login uses internal emails: {username}@sentinex.auth
"""

import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

AUTH_EMAIL_DOMAIN = "sentinex.auth"
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")

router = APIRouter(prefix="/admin", tags=["admin"])
chat_router = APIRouter(prefix="/chat", tags=["chat"])


def _supabase_url() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise HTTPException(503, "SUPABASE_URL is not configured")
    return url


def _anon_key() -> str:
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not key:
        raise HTTPException(503, "SUPABASE_ANON_KEY is not configured")
    return key


def _service_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise HTTPException(503, "SUPABASE_SERVICE_ROLE_KEY is not configured")
    return key


def username_to_auth_email(username: str) -> str:
    return f"{username.strip()}@{AUTH_EMAIL_DOMAIN}"


def _admin_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_service_key()}",
        "apikey": _service_key(),
        "Content-Type": "application/json",
    }


def _user_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "apikey": _anon_key(),
    }


async def require_active_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Any authenticated user with an active profile (head or tester)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization bearer token")

    token = authorization[7:].strip()
    base = _supabase_url()

    async with httpx.AsyncClient(timeout=15.0) as client:
        user_resp = await client.get(
            f"{base}/auth/v1/user",
            headers=_user_headers(token),
        )
        if user_resp.status_code != 200:
            raise HTTPException(401, "Invalid or expired session")

        user = user_resp.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(401, "Invalid session user")

        profile_resp = await client.get(
            f"{base}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "id,username,role,is_active"},
            headers={
                **_admin_headers(),
                "Accept": "application/json",
            },
        )
        if profile_resp.status_code != 200:
            raise HTTPException(503, "Could not load profile")

        rows = profile_resp.json()
        if not rows:
            raise HTTPException(403, "Profile not found")

        profile = rows[0]
        if profile.get("is_active") is False:
            raise HTTPException(403, "Account deactivated")

        return {"user_id": user_id, "profile": profile}


async def require_head(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization bearer token")

    token = authorization[7:].strip()
    base = _supabase_url()

    async with httpx.AsyncClient(timeout=15.0) as client:
        user_resp = await client.get(
            f"{base}/auth/v1/user",
            headers=_user_headers(token),
        )
        if user_resp.status_code != 200:
            raise HTTPException(401, "Invalid or expired session")

        user = user_resp.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(401, "Invalid session user")

        profile_resp = await client.get(
            f"{base}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "id,username,role,is_active"},
            headers={
                **_admin_headers(),
                "Accept": "application/json",
            },
        )
        if profile_resp.status_code != 200:
            raise HTTPException(503, "Could not load profile")

        rows = profile_resp.json()
        if not rows:
            raise HTTPException(403, "Profile not found")

        profile = rows[0]
        if profile.get("role") != "head" or profile.get("is_active") is False:
            raise HTTPException(403, "Head access required")

        return {"user_id": user_id, "profile": profile}


class CreateTesterRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=80)
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=64)


class TesterResponse(BaseModel):
    id: str
    display_name: str
    username: str
    bay_id: Optional[str]
    is_active: bool


async def _rest_delete(
    client: httpx.AsyncClient,
    base: str,
    table: str,
    params: Dict[str, str],
) -> None:
    """Delete rows; ignore missing table / empty result (schema may be partial)."""
    resp = await client.delete(
        f"{base}/rest/v1/{table}",
        params=params,
        headers={**_admin_headers(), "Prefer": "return=minimal"},
    )
    if resp.status_code in (200, 204):
        return
    try:
        body = resp.json()
        code = body.get("code")
        if code in ("PGRST205", "42P01"):
            # Table not created yet (migrations pending)
            return
    except Exception:
        pass
    if resp.status_code == 404:
        return
    raise HTTPException(502, f"Failed to delete from {table}: {resp.text}")


async def _list_active_testers() -> List[Dict[str, Any]]:
    base = _supabase_url()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{base}/rest/v1/profiles",
            params={
                "role": "eq.tester",
                "is_active": "eq.true",
                "select": "id,display_name,username,bay_id,is_active",
                "order": "created_at.asc",
            },
            headers={**_admin_headers(), "Accept": "application/json"},
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"Failed to list testers: {resp.text}")
        return resp.json()


@router.get("/testers", response_model=List[TesterResponse])
async def list_testers(_head: Dict[str, Any] = Depends(require_head)):
    return await _list_active_testers()


@chat_router.get("/peers", response_model=List[TesterResponse])
async def list_chat_peers(_user: Dict[str, Any] = Depends(require_active_user)):
    """Active testers for Ops Chat (head + tester consoles)."""
    return await _list_active_testers()


@router.post("/testers", response_model=TesterResponse)
async def create_tester(
    body: CreateTesterRequest,
    head: Dict[str, Any] = Depends(require_head),
):
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            400,
            "Username must be 3–32 characters: letters, numbers, underscore only.",
        )

    email = username_to_auth_email(username)
    base = _supabase_url()
    head_id = head["user_id"]

    async with httpx.AsyncClient(timeout=20.0) as client:
        create_resp = await client.post(
            f"{base}/auth/v1/admin/users",
            headers=_admin_headers(),
            json={
                "email": email,
                "password": body.password,
                "email_confirm": True,
                "user_metadata": {
                    "username": username,
                    "display_name": body.display_name.strip(),
                },
            },
        )
        if create_resp.status_code not in (200, 201):
            detail = create_resp.text
            if "already been registered" in detail or "duplicate" in detail.lower():
                raise HTTPException(409, f"Username '{username}' is already taken.")
            raise HTTPException(502, f"Failed to create auth user: {detail}")

        auth_user = create_resp.json()
        user_id = auth_user.get("id")
        if not user_id:
            raise HTTPException(502, "Auth user created without id")

        profile_resp = await client.post(
            f"{base}/rest/v1/profiles",
            headers={
                **_admin_headers(),
                "Accept": "application/json",
                "Prefer": "return=representation",
            },
            json={
                "id": user_id,
                "display_name": body.display_name.strip(),
                "username": username,
                "role": "tester",
                "created_by": head_id,
            },
        )
        if profile_resp.status_code not in (200, 201):
            await client.delete(
                f"{base}/auth/v1/admin/users/{user_id}",
                headers=_admin_headers(),
            )
            raise HTTPException(502, f"Failed to create profile: {profile_resp.text}")

        rows = profile_resp.json()
        row = rows[0] if isinstance(rows, list) else rows
        return {
            "id": row["id"],
            "display_name": row["display_name"],
            "username": row["username"],
            "bay_id": row.get("bay_id"),
            "is_active": row.get("is_active", True),
        }


@router.delete("/testers/{tester_id}")
async def delete_tester(
    tester_id: str,
    head: Dict[str, Any] = Depends(require_head),
):
    """Remove tester completely: sessions, bay, profile, and Auth login."""
    base = _supabase_url()

    async with httpx.AsyncClient(timeout=30.0) as client:
        profile_resp = await client.get(
            f"{base}/rest/v1/profiles",
            params={
                "id": f"eq.{tester_id}",
                "role": "eq.tester",
                "select": "id,username,bay_id,display_name",
            },
            headers={**_admin_headers(), "Accept": "application/json"},
        )
        if profile_resp.status_code != 200:
            raise HTTPException(502, f"Could not load tester: {profile_resp.text}")

        rows = profile_resp.json()
        if not rows:
            raise HTTPException(404, "Tester not found")

        profile = rows[0]
        bay_id = profile.get("bay_id")
        username = profile.get("username")

        if bay_id:
            await _rest_delete(
                client,
                base,
                "change_requests",
                {"bay_id": f"eq.{bay_id}"},
            )

        await _rest_delete(
            client,
            base,
            "change_requests",
            {"requested_by": f"eq.{tester_id}"},
        )

        # session_records cascade when test_sessions are removed
        await _rest_delete(
            client,
            base,
            "test_sessions",
            {"profile_id": f"eq.{tester_id}"},
        )

        if bay_id:
            await _rest_delete(
                client,
                base,
                "bay_live_state",
                {"bay_id": f"eq.{bay_id}"},
            )

        await _rest_delete(
            client,
            base,
            "audit_events",
            {"profile_id": f"eq.{tester_id}"},
        )

        await _rest_delete(
            client,
            base,
            "chat_messages",
            {"sender_profile_id": f"eq.{tester_id}"},
        )

        del_profile = await client.delete(
            f"{base}/rest/v1/profiles",
            params={"id": f"eq.{tester_id}"},
            headers={**_admin_headers(), "Prefer": "return=minimal"},
        )
        if del_profile.status_code not in (200, 204):
            raise HTTPException(502, f"Failed to delete profile: {del_profile.text}")

        auth_del = await client.delete(
            f"{base}/auth/v1/admin/users/{tester_id}",
            headers=_admin_headers(),
        )
        if auth_del.status_code not in (200, 204):
            raise HTTPException(502, f"Failed to delete auth user: {auth_del.text}")

        if bay_id:
            await _rest_delete(client, base, "bays", {"id": f"eq.{bay_id}"})

    return {
        "ok": True,
        "id": tester_id,
        "username": username,
        "bay_id": bay_id,
    }
