import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoginScreen from "../components/LoginScreen.jsx";
import IntroTriggerBtn from "../components/IntroTriggerBtn.jsx";
import { logCellActivity } from "../utils/testerPresence.js";
import { getTesterDisplayName } from "../utils/testerRegistry.js";
import { getAppRole, loadAuthSession } from "../lib/authSession.js";

export default function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (getAppRole()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleLogin = useCallback(
    (sessionKey) => {
      const session = loadAuthSession();
      logCellActivity({
        role: sessionKey,
        displayName: session?.displayName || getTesterDisplayName(sessionKey),
        type: "LOGIN",
        message: `${session?.displayName || getTesterDisplayName(sessionKey)} entered console`,
      });
      navigate("/dashboard");
    },
    [navigate]
  );

  return (
    <>
      <LoginScreen onLogin={handleLogin} />
      <IntroTriggerBtn />
    </>
  );
}
