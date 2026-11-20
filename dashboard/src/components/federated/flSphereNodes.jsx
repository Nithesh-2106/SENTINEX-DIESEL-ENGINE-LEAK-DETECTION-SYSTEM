/** Static glowing fed nodes — reference GLOBAL RIC / BS style, no orbit rings. */

export function GlowingFedNode({ r, color, rgb, innerText = "", glowId = "fl-node-glow" }) {
  return (
    <g className="fl-fed-node">
      <circle r={r + 8} fill={`rgba(${rgb},0.08)`} filter={`url(#${glowId})`} />
      <circle
        r={r}
        fill={`rgba(${rgb},0.22)`}
        stroke={color}
        strokeWidth="2.8"
        filter={`url(#${glowId})`}
      />
      {innerText && (
        <text
          y={4}
          textAnchor="middle"
          fill="#F8FCFF"
          fontSize={Math.max(8, r * 0.36)}
          fontWeight="800"
          fontFamily="JetBrains Mono, monospace"
        >
          {innerText}
        </text>
      )}
    </g>
  );
}

export function GlowingFedHub({ r, round, glowId = "fl-hub-glow" }) {
  return (
    <g className="fl-fed-hub">
      <circle r={r + 10} fill="rgba(240,165,0,0.1)" filter={`url(#${glowId})`} />
      <circle r={r} fill="rgba(240,165,0,0.24)" stroke="#F0A500" strokeWidth="3" filter={`url(#${glowId})`} />
      <text y={-6} textAnchor="middle" fill="#FFB820" fontSize="10" fontWeight="900" letterSpacing="0.06em">
        GLOBAL
      </text>
      <text y={7} textAnchor="middle" fill="#FFB820" fontSize="10" fontWeight="900" letterSpacing="0.06em">
        MODEL
      </text>
      <text y={20} textAnchor="middle" fill="rgba(255,255,255,0.88)" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        Rnd: {round}
      </text>
    </g>
  );
}

export function edgeLabelPosition(x1, y1, x2, y2, t = 0.42, perpOffset = 14) {
  const mx = x1 + (x2 - x1) * t;
  const my = y1 + (y2 - y1) * t;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: mx + (-dy / len) * perpOffset,
    y: my + (dx / len) * perpOffset,
  };
}
