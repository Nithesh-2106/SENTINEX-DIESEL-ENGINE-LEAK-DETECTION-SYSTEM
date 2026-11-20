import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import IntroPage from "./pages/IntroPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

const INTRO_SEEN_KEY = "sentinex_intro_seen";

function RootRedirect() {
  let seen = null;
  try {
    seen = localStorage.getItem(INTRO_SEEN_KEY);
  } catch {
    seen = null;
  }
  return <Navigate to={seen === "true" ? "/login" : "/intro"} replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
