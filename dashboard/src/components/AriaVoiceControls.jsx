import React from "react";

export default function AriaVoiceControls({
  supported,
  listening,
  speaking,
  voiceReplyEnabled,
  onToggleListen,
  onToggleVoiceReply,
  onStopSpeaking,
  disabled = false,
  liveTranscript = "",
}) {
  if (!supported.stt && !supported.tts) {
    return (
      <p className="aria-voice-unsupported">
        Voice requires Chrome, Edge, or Safari with microphone access.
      </p>
    );
  }

  return (
    <div className="aria-voice-controls">
      <div className="aria-voice-controls__actions">
        {supported.stt && (
          <button
            type="button"
            className={`aria-voice-btn aria-voice-btn--mic ${listening ? "active" : ""}`}
            onClick={onToggleListen}
            disabled={disabled}
            title={listening ? "Stop listening" : "Speak to ARIA"}
            aria-pressed={listening}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
          >
            <svg className="aria-voice-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0M12 19v3" />
            </svg>
            <span>{listening ? "Listening…" : "Speak"}</span>
          </button>
        )}

        {supported.tts && (
          <button
            type="button"
            className={`aria-voice-btn aria-voice-btn--speaker ${voiceReplyEnabled ? "active" : ""}`}
            onClick={onToggleVoiceReply}
            title={voiceReplyEnabled ? "ARIA will speak answers in a warm feminine voice" : "Voice replies off"}
            aria-pressed={voiceReplyEnabled}
            aria-label="Toggle ARIA voice replies"
          >
            <svg className="aria-voice-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              {voiceReplyEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6l-6 4v4l6 4V6zm8 4a9 9 0 01-2.343 6.071" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </>
              )}
            </svg>
            <span>{voiceReplyEnabled ? "Voice on" : "Voice off"}</span>
          </button>
        )}

        {speaking && (
          <button
            type="button"
            className="aria-voice-btn aria-voice-btn--stop"
            onClick={onStopSpeaking}
            title="Stop ARIA speaking"
            aria-label="Stop ARIA speaking"
          >
            <svg className="aria-voice-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <span>Stop</span>
          </button>
        )}
      </div>

      {listening && (
        <div className="aria-voice-listening" role="status" aria-live="polite">
          <span className="aria-voice-listening__pulse" aria-hidden />
          <span className="aria-voice-listening__label">
            {liveTranscript ? `Hearing: “${liveTranscript}”` : "Listening… speak your question"}
          </span>
        </div>
      )}
    </div>
  );
}
