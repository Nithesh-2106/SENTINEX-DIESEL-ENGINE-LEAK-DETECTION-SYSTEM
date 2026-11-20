/** Strip markdown / diagram blocks for text-to-speech. */
export function stripMarkdownForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/⚠️/g, "Warning.")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Keep spoken answers concise for long markdown replies. */
export function truncateForSpeech(text, maxChars = 1200) {
  const clean = stripMarkdownForSpeech(text);
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  if (lastStop > maxChars * 0.6) return `${cut.slice(0, lastStop + 1)} For more detail, read the full answer on screen.`;
  return `${cut}… For more detail, read the full answer on screen.`;
}

/** Warm, polished feminine voice hints (platform TTS names). */
const ARIA_FEMALE_VOICE_HINTS = [
  /samantha/i,
  /victoria/i,
  /karen/i,
  /moira/i,
  /kate/i,
  /fiona/i,
  /serena/i,
  /tessa/i,
  /zira/i,
  /jenny/i,
  /aria/i,
  /natasha/i,
  /sonia/i,
  /susan/i,
  /hazel/i,
  /sara/i,
  /emma/i,
  /linda/i,
  /female/i,
  /woman/i,
];

const ARIA_MALE_VOICE_HINTS = [
  /daniel/i,
  /david/i,
  /mark\b/i,
  /james/i,
  /tom\b/i,
  /fred/i,
  /ralph/i,
  /bruce/i,
  /aaron/i,
  /gordon/i,
  /\blee\b/i,
  /male/i,
  /man\b/i,
];

/** Tuning for ARIA's spoken persona — smooth, warm delivery. */
export const ARIA_VOICE_PROFILE = {
  pitch: 1.1,
  rate: 0.92,
  volume: 1,
};

function scoreAriaVoice(voice) {
  if (!voice?.lang?.startsWith("en")) return -100;
  const name = voice.name || "";
  let score = 0;

  if (ARIA_MALE_VOICE_HINTS.some((re) => re.test(name))) score -= 60;
  if (ARIA_FEMALE_VOICE_HINTS.some((re) => re.test(name))) score += 35;
  if (/premium|enhanced|natural|neural|wavenet/i.test(name)) score += 18;
  if (/google/i.test(name) && /female/i.test(name)) score += 28;
  if (/microsoft/i.test(name) && /(zira|jenny|aria|natasha)/i.test(name)) score += 28;
  if (/samantha/i.test(name)) score += 42;
  if (voice.lang === "en-US" || voice.lang === "en-GB") score += 6;
  if (voice.default && score > 0) score += 4;

  return score;
}

/** Pick the best available feminine English voice for ARIA. */
export function pickAriaVoice() {
  const voices = typeof window !== "undefined" ? window.speechSynthesis?.getVoices?.() || [] : [];
  if (!voices.length) return null;

  const ranked = voices
    .map((v) => ({ v, score: scoreAriaVoice(v) }))
    .filter((row) => row.score > -30)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.v
    || voices.find((v) => v.lang.startsWith("en") && !ARIA_MALE_VOICE_HINTS.some((re) => re.test(v.name)))
    || voices.find((v) => v.lang.startsWith("en"))
    || null;
}
