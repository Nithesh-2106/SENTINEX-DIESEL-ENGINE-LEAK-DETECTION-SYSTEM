import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./IntroTriggerBtn.module.css";

export default function IntroTriggerBtn() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={styles.introTriggerBtn}
      onClick={() => navigate("/intro")}
      title="About SENTINEX"
      aria-label="About SENTINEX"
    >
      ◈
    </button>
  );
}
