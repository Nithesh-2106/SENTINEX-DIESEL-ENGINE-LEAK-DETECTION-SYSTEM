export const THEME_TOKENS = {
  dark: {
    canvasBg: "rgba(5,8,16,0)",
    particleColour: "13, 184, 240",
    connectionLine: "rgba(13,184,240,0.06)",
    gridLine: "rgba(13,184,240,0.025)",

    okColour: "10, 255, 170",
    leakColour: "255, 71, 87",
    warnColour: "255, 176, 32",
    cyanColour: "13, 184, 240",
    violetColour: "168, 85, 247",
    amberColour: "240, 165, 0",

    okHex: "#10FFAA",
    leakHex: "#FF4757",
    warnHex: "#FFB020",
    cyanHex: "#0DB8F0",
    violetHex: "#A855F7",
    amberHex: "#F0A500",

    labelColour: "rgba(255,255,255,0.7)",
    labelDim: "rgba(255,255,255,0.35)",
    labelMono: "rgba(255,255,255,0.85)",

    meshBg: 0x050a12,
    meshSurface: 0x0c1626,
    meshEmissiveDim: 0x0c1a30,
    wireColour: 0x0db8f0,
    wireOpacity: 0.4,

    nodeColour: "13, 184, 240",
    edgeColour: "rgba(13,184,240,0.04)",
    pulseColour: "168, 85, 247",

    orbLine: "rgba(13,184,240,0.08)",
    orbGlow1: "rgba(13,184,240,0.12)",
    orbGlow2: "rgba(168,85,247,0.06)",

    streamColour: "13, 184, 240",

    packetColour: "#0DB8F0",
    serverGlow: "rgba(240,165,0,0.25)",
    edgeLine: "rgba(255,255,255,0.04)",

    labelBg: "rgba(8,12,20,0.88)",
    labelBorder: "rgba(13,184,240,0.3)",
    labelText: "rgba(255,255,255,0.9)",
    labelSub: "rgba(255,255,255,0.45)",

    sceneBg: 0x050a12,
    rendererClear: 0x050a12,
    intakePipe: 0x0d4f40,
    exhaustPipe: 0x4a2800,
  },

  light: {
    canvasBg: "rgba(240,244,248,0)",
    particleColour: "8, 145, 178",
    connectionLine: "rgba(8,145,178,0.12)",
    gridLine: "rgba(8,145,178,0.06)",

    okColour: "5, 150, 105",
    leakColour: "220, 38, 38",
    warnColour: "217, 119, 6",
    cyanColour: "8, 145, 178",
    violetColour: "124, 58, 237",
    amberColour: "180, 120, 0",

    okHex: "#059669",
    leakHex: "#DC2626",
    warnHex: "#D97706",
    cyanHex: "#0891B2",
    violetHex: "#7C3AED",
    amberHex: "#B47800",

    labelColour: "rgba(15,23,42,0.80)",
    labelDim: "rgba(15,23,42,0.45)",
    labelMono: "rgba(15,23,42,0.90)",

    meshBg: 0xf0f4f8,
    meshSurface: 0xe2eaf4,
    meshEmissiveDim: 0xd0dcf0,
    wireColour: 0x0891b2,
    wireOpacity: 0.5,

    nodeColour: "8, 145, 178",
    edgeColour: "rgba(8,145,178,0.08)",
    pulseColour: "124, 58, 237",

    orbLine: "rgba(8,145,178,0.10)",
    orbGlow1: "rgba(8,145,178,0.10)",
    orbGlow2: "rgba(124,58,237,0.07)",

    streamColour: "8, 145, 178",

    packetColour: "#0891B2",
    serverGlow: "rgba(180,120,0,0.15)",
    edgeLine: "rgba(15,23,42,0.06)",

    labelBg: "rgba(255,255,255,0.92)",
    labelBorder: "rgba(8,145,178,0.25)",
    labelText: "rgba(15,23,42,0.90)",
    labelSub: "rgba(15,23,42,0.50)",

    sceneBg: 0xeef3fa,
    rendererClear: 0xeef3fa,
    intakePipe: 0xb2f5ea,
    exhaustPipe: 0xfed7aa,
  },
};

export function getTokens(theme) {
  return THEME_TOKENS[theme] || THEME_TOKENS.dark;
}

export function hexToInt(hex) {
  return parseInt(hex.replace("#", ""), 16);
}
