/**
 * Primitives d'annotation partagées par les illustrations de l'aide (MiniGantt, MiniList).
 * Tout est dessiné en SVG pour être superposable aussi bien sur le Gantt (SVG natif) que sur
 * la liste (overlay SVG absolu) — un seul style de callout / curseur pour les deux.
 *
 * Aide figée : on dessine les curseurs (pas de vraie interaction). Quelques animations CSS
 * légères animent le geste ; elles se coupent avec `prefers-reduced-motion` (cf. ANNOTATION_CSS).
 */

export type CursorKind = 'resize-x' | 'move' | 'crosshair' | 'pointer' | 'resize-col';

export type Place = 'top' | 'bottom' | 'left' | 'right';

/** Feuille de style injectée une fois par HelpTab (animations + halo de lisibilité). */
export const ANNOTATION_CSS = `
@keyframes help-slide-x { 0%,100% { transform: translateX(-3px); } 50% { transform: translateX(4px); } }
@keyframes help-slide-col { 0%,100% { transform: translateX(-2px); } 50% { transform: translateX(3px); } }
.help-anim-slide-x { animation: help-slide-x 1.6s ease-in-out infinite; }
.help-anim-slide-col { animation: help-slide-col 1.6s ease-in-out infinite; }
.help-cursor { transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) {
  .help-anim-slide-x, .help-anim-slide-col { animation: none !important; }
}
`;

/** Largeur approximative d'un libellé (même heuristique que le Gantt : ~0.55em par caractère). */
function labelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55 + 10;
}

interface CalloutProps {
  /** Point ciblé (px, dans le repère du SVG hôte). */
  ax: number;
  ay: number;
  label: string;
  /** Côté où poser le libellé par rapport au point. */
  place?: Place;
  /** Distance du libellé au point. */
  dist?: number;
  color?: string;
  fontSize?: number;
}

/** Un appel-out : un point ancré + une ligne de rappel + un libellé encadré. */
export function Callout({
  ax,
  ay,
  label,
  place = 'top',
  dist = 22,
  color = 'var(--color-accent)',
  fontSize = 10,
}: CalloutProps) {
  const off: Record<Place, [number, number]> = {
    top: [0, -dist],
    bottom: [0, dist],
    left: [-dist, 0],
    right: [dist, 0],
  };
  const [dx, dy] = off[place];
  const lx = ax + dx;
  const ly = ay + dy;
  const w = labelWidth(label, fontSize);
  const h = fontSize + 6;
  // Position de la boîte : centrée puis décalée selon le côté pour ne pas chevaucher le point.
  let bx = lx - w / 2;
  let by = ly - h / 2;
  let tx = lx;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (place === 'left') {
    bx = lx - w;
    tx = lx - w + 5;
    anchor = 'start';
  } else if (place === 'right') {
    bx = lx;
    tx = lx + 5;
    anchor = 'start';
  } else if (place === 'top') {
    by = ly - h;
  } else {
    by = ly;
  }
  return (
    <g pointerEvents="none">
      <line x1={ax} y1={ay} x2={lx} y2={ly} stroke={color} strokeWidth={0.9} opacity={0.7} />
      <circle cx={ax} cy={ay} r={1.8} fill={color} />
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        rx={3}
        fill="var(--color-surface)"
        stroke={color}
        strokeWidth={0.8}
        opacity={0.98}
      />
      <text
        x={anchor === 'middle' ? lx : tx}
        y={by + h / 2 + fontSize * 0.35}
        textAnchor={anchor}
        fontSize={fontSize}
        fill="var(--color-ink)"
      >
        {label}
      </text>
    </g>
  );
}

interface CursorGlyphProps {
  kind: CursorKind;
  x: number;
  y: number;
  /** Anime le curseur (glissement) pour suggérer le geste. */
  animate?: boolean;
}

/** Glyphe de curseur figé (avec halo blanc pour rester lisible sur une barre colorée). */
export function CursorGlyph({ kind, x, y, animate }: CursorGlyphProps) {
  const animClass =
    animate && (kind === 'resize-x' || kind === 'crosshair')
      ? 'help-anim-slide-x'
      : animate && kind === 'resize-col'
        ? 'help-anim-slide-col'
        : '';
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <g className={`help-cursor ${animClass}`.trim()}>
        <GlyphPath kind={kind} />
      </g>
    </g>
  );
}

function GlyphPath({ kind }: { kind: CursorKind }) {
  const halo = { stroke: 'white', strokeWidth: 2.6, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const ink = 'var(--color-ink)';
  if (kind === 'resize-x' || kind === 'resize-col') {
    // double flèche horizontale ↔
    const d = 'M -6 0 L 6 0 M -6 0 L -3 -3 M -6 0 L -3 3 M 6 0 L 3 -3 M 6 0 L 3 3';
    return (
      <>
        <path d={d} {...halo} />
        <path d={d} stroke={ink} strokeWidth={1.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </>
    );
  }
  if (kind === 'crosshair') {
    const d = 'M -6 0 H 6 M 0 -6 V 6';
    return (
      <>
        <path d={d} {...halo} />
        <path d={d} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
        <circle cx={0} cy={0} r={2.4} fill="none" stroke="white" strokeWidth={2.6} />
        <circle cx={0} cy={0} r={2.4} fill="none" stroke={ink} strokeWidth={1.4} />
      </>
    );
  }
  if (kind === 'move') {
    // quatre flèches (déplacement / main qui saisit)
    const d =
      'M 0 -7 V 7 M -7 0 H 7 M 0 -7 L -2.5 -4 M 0 -7 L 2.5 -4 M 0 7 L -2.5 4 M 0 7 L 2.5 4 M -7 0 L -4 -2.5 M -7 0 L -4 2.5 M 7 0 L 4 -2.5 M 7 0 L 4 2.5';
    return (
      <>
        <path d={d} {...halo} />
        <path d={d} stroke={ink} strokeWidth={1.3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </>
    );
  }
  // pointer : flèche de curseur classique
  const d = 'M 0 0 L 0 11 L 3 8 L 5.5 13 L 7 12 L 4.5 7.5 L 9 7 Z';
  return (
    <>
      <path d={d} fill="white" stroke="white" strokeWidth={2.4} strokeLinejoin="round" />
      <path d={d} fill={ink} stroke={ink} strokeWidth={0.6} strokeLinejoin="round" />
    </>
  );
}
