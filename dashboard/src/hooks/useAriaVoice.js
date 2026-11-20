import { useCallback, useEffect, useRef, useState } from "react";
import { ARIA_VOICE_PROFILE, pickAriaVoice } from "../utils/speechText.js";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Browser speech input + output for ARIA.
 * Uses Web Speech API (Chrome / Edge / Safari).
 */
export function useAriaVoice({ onFinalTranscript, lang = "en-US" } = {}) {
  const [supported, setSupported] = useState({ stt: false, tts: false });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef(null);
  const finalBufferRef = useRef("");
  const interimRef = useRef("");
  const ariaVoiceRef = useRef(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  useEffect(() => {
    setSupported({
      stt: Boolean(getSpeechRecognition()),
      tts: typeof window !== "undefined" && "speechSynthesis" in window,
    });

    const refreshVoice = () => {
      ariaVoiceRef.current = pickAriaVoice();
    };
    refreshVoice();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refreshVoice);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", refreshVoice);
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
    interimRef.current = "";
    setLiveTranscript("");
  }, []);

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR || listening) return false;

    window.speechSynthesis?.cancel();
    setSpeaking(false);
    finalBufferRef.current = "";
    interimRef.current = "";
    setInterimText("");
    setLiveTranscript("");

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = "";
      let finals = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finals += chunk;
        else interim += chunk;
      }
      if (finals) {
        finalBufferRef.current = `${finalBufferRef.current} ${finals}`.trim();
      }
      interimRef.current = interim;
      setInterimText(interim);
      setLiveTranscript(`${finalBufferRef.current} ${interim}`.trim());
    };

    rec.onerror = () => {
      stopListening();
    };

    rec.onend = () => {
      const spoken = `${finalBufferRef.current} ${interimRef.current}`.trim();
      setListening(false);
      setInterimText("");
      setLiveTranscript("");
      interimRef.current = "";
      recognitionRef.current = null;
      if (spoken) onFinalRef.current?.(spoken);
      finalBufferRef.current = "";
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      return true;
    } catch {
      return false;
    }
  }, [lang, listening, stopListening]);

  const toggleListening = useCallback(() => {
    if (listening) {
      const spoken = `${finalBufferRef.current} ${interimRef.current}`.trim();
      stopListening();
      if (spoken) onFinalRef.current?.(spoken);
      finalBufferRef.current = "";
      return;
    }
    startListening();
  }, [listening, startListening, stopListening]);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis || !text?.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = ariaVoiceRef.current || pickAriaVoice();
    if (voice) {
      utter.voice = voice;
      ariaVoiceRef.current = voice;
    }
    utter.pitch = ARIA_VOICE_PROFILE.pitch;
    utter.rate = ARIA_VOICE_PROFILE.rate;
    utter.volume = ARIA_VOICE_PROFILE.volume;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => () => {
    stopListening();
    stopSpeaking();
  }, [stopListening, stopSpeaking]);

  return {
    supported,
    listening,
    speaking,
    interimText,
    liveTranscript,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
