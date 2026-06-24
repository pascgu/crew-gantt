/**
 * MiniGantt — réplique SVG, en lecture seule, d'une portion de Gantt, pour illustrer l'aide.
 * Reproduit fidèlement les tokens visuels de `RowBars` (cf. GanttChart.tsx) : coins ronds/carrés
 * (effort/fixed), teintes réalisé/reste séparées au trait de revue (opacité passé 0.6), encoche
 * d'avancement, losange de jalon, crochets de groupe, baseline grise, bande orange, marqueurs de
 * conflit, liens. La scène est décrite en données simples (index de jour) — pas de scheduler, pas
 * de store : illustrations déterministes.
 */
import { ROW_HEIGHT } from '@/ui/gantt/timescale';
import { darken, rgba } from '@/ui/common/color';
import { Callout, CursorGlyph, type CursorKind, type Place } from './Annotated';

const BAR_H = 11;
const ACCENT = 'var(--color-accent)';

type Status = 'todo' | 'in_progress' | 'done' | 'cancelled';
type MarkerKind = 'unplanned' | 'unassigned' | 'effort-overflow';

interface MiniBlock {
  from: number;
  /** Jour de fin inclus. */
  to: number;
}

export interface MiniTaskRow {
  kind: 'task';
  name?: string;
  color?: string;
  scheduling?: 'effort' | 'fixed';
  blocks: MiniBlock[];
  progress?: number;
  status?: Status;
  conflict?: boolean;
  /** Intervalle [from,to] de jours en surcharge (bande orange). */
  overload?: MiniBlock;
  deadline?: number;
  baseline?: MiniBlock;
  marker?: MarkerKind;
  /** Ghosts de placement (barres fantômes pointillées) — une par ancre. */
  ghosts?: MiniBlock[];
  /** Poignée ronde de création de lien, décalée après le bord droit du dernier bloc. */
  linkHandle?: boolean;
  /** Barre de proposition (réordonnancement proposé) : bande pointillée + ✓ + « +X j ». */
  proposal?: { from: number; to: number; delta?: string };
}

export interface MiniMilestoneRow {
  kind: 'milestone';
  name?: string;
  day: number;
  color?: string;
  conflict?: boolean;
}

export interface MiniGroupRow {
  kind: 'group';
  name?: string;
  color?: string;
  intervals: MiniBlock[];
  progress?: number;
}

export type MiniRow = MiniTaskRow | MiniMilestoneRow | MiniGroupRow;

export interface MiniLink {
  fromRow: number;
  fromDay: number;
  toRow: number;
  toDay: number;
  violated?: boolean;
}

export interface MiniGanttCallout {
  day: number;
  row: number;
  edge?: 'start' | 'end' | 'mid';
  /** Position verticale dans la ligne : milieu (défaut), moitié basse (poignées de resize) ou haute. */
  yAnchor?: 'mid' | 'lower' | 'upper';
  /** Décalages px fins (ex. cibler la poignée de lien décalée). */
  dx?: number;
  dy?: number;
  label: string;
  place?: Place;
  /** Longueur du trait de rappel (défaut 22). */
  dist?: number;
  cursor?: CursorKind;
  animate?: boolean;
}

/** Décalage horizontal de la poignée de lien après le bord droit de la barre. */
const LINK_HANDLE_DX = 8;

export interface MiniScene {
  days: number;
  dayWidth?: number;
  labelWidth?: number;
  /** Jour du trait de revue : avant = réalisé (clair), après = reste (sombre). */
  today?: number;
  /** Trait « aujourd'hui » bleu (souvent = today). */
  todayLine?: number;
  /** Trait rouge « date de réunion ». */
  reviewLine?: number;
  /** Jours chômés (grisés). */
  offDays?: number[];
  rows: MiniRow[];
  links?: MiniLink[];
}

interface Props {
  scene: MiniScene;
  callouts?: MiniGanttCallout[];
  className?: string;
}

export function MiniGantt({ scene, callouts, className }: Props) {
  const dayWidth = scene.dayWidth ?? 20;
  const gutter = scene.labelWidth ?? 0;
  const x = (day: number) => gutter + day * dayWidth;
  const xEnd = (day: number) => gutter + (day + 1) * dayWidth;
  const rowMid = (i: number) => i * ROW_HEIGHT + ROW_HEIGHT / 2;
  const barY = (i: number) => rowMid(i) - 5.5;
  const width = gutter + scene.days * dayWidth;
  const height = scene.rows.length * ROW_HEIGHT;
  const reviewX = scene.today != null ? x(scene.today) : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, height: 'auto', overflow: 'visible' }}
      className={className}
      role="img"
    >
      <defs>
        <pattern id="mini-cancelled-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(33,31,26,0.35)" strokeWidth="3" />
        </pattern>
      </defs>

      {/* Jours chômés */}
      {scene.offDays?.map((d) => (
        <rect key={`off${d}`} x={x(d)} y={0} width={dayWidth} height={height} fill="rgb(33 31 26 / 0.045)" />
      ))}

      {/* Séparateurs de lignes */}
      {scene.rows.map((_, i) => (
        <line key={`sep${i}`} x1={gutter} x2={width} y1={(i + 1) * ROW_HEIGHT} y2={(i + 1) * ROW_HEIGHT} stroke="rgb(33 31 26 / 0.05)" />
      ))}

      {/* Lignes verticales (aujourd'hui / réunion) */}
      {scene.todayLine != null && (
        <line x1={x(scene.todayLine)} x2={x(scene.todayLine)} y1={0} y2={height} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.65} />
      )}
      {scene.reviewLine != null && (
        <line x1={x(scene.reviewLine)} x2={x(scene.reviewLine)} y1={0} y2={height} stroke="var(--color-danger)" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
      )}

      {/* Lignes */}
      {scene.rows.map((row, i) => (
        <Row key={i} row={row} i={i} x={x} xEnd={xEnd} barY={barY} rowMid={rowMid} dayWidth={dayWidth} reviewX={reviewX} gutter={gutter} />
      ))}

      {/* Liens (après les barres) */}
      {scene.links?.map((lk, i) => (
        <Link key={`lk${i}`} link={lk} x={x} xEnd={xEnd} rowMid={rowMid} />
      ))}

      {/* Noms de lignes (gouttière gauche) */}
      {gutter > 0 &&
        scene.rows.map((row, i) =>
          row.name ? (
            <text key={`nm${i}`} x={gutter - 6} y={rowMid(i) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink-soft)">
              {row.name}
            </text>
          ) : null,
        )}

      {/* Callouts */}
      {callouts?.map((c, i) => {
        const baseX = c.edge === 'end' ? xEnd(c.day) : c.edge === 'mid' ? x(c.day) + dayWidth / 2 : x(c.day);
        const cx = baseX + (c.dx ?? 0);
        const yShift = c.yAnchor === 'lower' ? 2.75 : c.yAnchor === 'upper' ? -2.75 : 0;
        const cy = rowMid(c.row) + yShift + (c.dy ?? 0);
        return (
          <g key={`co${i}`}>
            {c.cursor && <CursorGlyph kind={c.cursor} x={cx} y={cy} animate={c.animate} />}
            <Callout ax={cx} ay={cy} label={c.label} place={c.place ?? 'top'} dist={c.dist} />
          </g>
        );
      })}
    </svg>
  );
}

interface RowProps {
  row: MiniRow;
  i: number;
  x: (d: number) => number;
  xEnd: (d: number) => number;
  barY: (i: number) => number;
  rowMid: (i: number) => number;
  dayWidth: number;
  reviewX: number | null;
  gutter: number;
}

function Row({ row, i, x, xEnd, barY, rowMid, dayWidth, reviewX, gutter }: RowProps) {
  const mid = rowMid(i);
  const y = barY(i);

  if (row.kind === 'milestone') {
    const cx = x(row.day) + dayWidth / 2;
    const color = row.color ?? ACCENT;
    return (
      <g>
        <Diamond cx={cx} cy={mid} size={6} color={color} conflict={row.conflict} />
        {row.name && (
          <text x={cx + 10} y={mid + 3.5} fontSize={10.5} fill="var(--color-ink-soft)">
            {row.name}
          </text>
        )}
      </g>
    );
  }

  if (row.kind === 'group') {
    const color = row.color ?? ACCENT;
    const border = darken(color, 0.45);
    const gx0 = x(row.intervals[0]!.from);
    const gx1 = xEnd(row.intervals[row.intervals.length - 1]!.to);
    const progW = row.progress ? (gx1 - gx0) * row.progress : 0;
    return (
      <g>
        <rect x={gx0} y={mid - 3} width={gx1 - gx0} height={6} fill={rgba(color, 0.28)} />
        {row.intervals.map((itv, k) => {
          const ix0 = x(itv.from);
          const ix1 = xEnd(itv.to);
          return (
            <g key={k}>
              <rect x={ix0} y={y} width={Math.max(3, ix1 - ix0)} height={BAR_H} rx={0} fill={border} />
              <path d={`M ${ix0} ${y + BAR_H} L ${ix0 + 5} ${y + BAR_H} L ${ix0} ${y + BAR_H + 5} Z`} fill={border} />
              <path d={`M ${ix1} ${y + BAR_H} L ${ix1 - 5} ${y + BAR_H} L ${ix1} ${y + BAR_H + 5} Z`} fill={border} />
            </g>
          );
        })}
        {progW > 0 && <rect x={gx0} y={mid - 1.25} width={progW} height={2.5} rx={1} fill="var(--color-ink)" opacity={0.95} />}
      </g>
    );
  }

  // task
  const color = row.color ?? ACCENT;
  const status = row.status ?? 'in_progress';
  const rx = (row.scheduling ?? 'effort') === 'effort' ? 3 : 0;
  const baseOpacity = status === 'cancelled' ? 0.4 : status === 'done' ? 0.5 : 0.6;
  const stroke = row.conflict ? 'var(--color-danger)' : darken(color, 0.3);
  const strokeW = row.conflict ? 1.6 : 0.5;
  const blocks = row.blocks;
  const xStart = blocks.length ? x(blocks[0]!.from) : 0;
  const xFin = blocks.length ? xEnd(blocks[blocks.length - 1]!.to) : 0;
  const progW = row.progress ? (xFin - xStart) * row.progress : 0;

  return (
    <g>
      {/* Baseline grise (sous la barre) */}
      {row.baseline && (
        <rect x={x(row.baseline.from)} y={mid + 5.5 - 1.5} width={xEnd(row.baseline.to) - x(row.baseline.from)} height={3} rx={1} fill="var(--color-line-strong)" opacity={0.9} />
      )}

      {/* Liaisons estompées entre blocs */}
      {blocks.slice(0, -1).map((b, k) => {
        const x1 = xEnd(b.to);
        const x2 = x(blocks[k + 1]!.from);
        if (x2 <= x1) return null;
        return <rect key={`g${k}`} x={x1} y={mid - 3.5} width={x2 - x1} height={7} fill={rgba(color, 0.3)} />;
      })}

      {/* Blocs */}
      {blocks.map((b, k) => {
        const bx = x(b.from);
        const bw = Math.max(4, xEnd(b.to) - bx);
        const darkX = reviewX != null ? Math.max(bx, reviewX) : bx + bw;
        const darkW = bx + bw - darkX;
        return (
          <g key={k}>
            <rect x={bx} y={y} width={bw} height={BAR_H} rx={rx} fill={color} opacity={baseOpacity} stroke={stroke} strokeWidth={strokeW} />
            {status !== 'cancelled' && darkW > 0 && (
              <rect x={darkX} y={y} width={darkW} height={BAR_H} rx={rx} fill={color} opacity={status === 'done' ? 0.3 : 0.9} />
            )}
            {status === 'cancelled' && <rect x={bx} y={y} width={bw} height={BAR_H} rx={rx} fill="url(#mini-cancelled-hatch)" />}
          </g>
        );
      })}

      {/* Ghosts de placement (pointillés) — une barre par ancre */}
      {row.ghosts?.map((g, k) => (
        <rect
          key={`gh${k}`}
          x={x(g.from)}
          y={y}
          width={Math.max(4, xEnd(g.to) - x(g.from))}
          height={BAR_H}
          rx={rx}
          fill={color}
          opacity={0.32}
          stroke={darken(color, 0.3)}
          strokeWidth={0.8}
          strokeDasharray="3 2"
        />
      ))}

      {/* Bande orange (surcharge) */}
      {row.overload && (
        <rect x={x(row.overload.from)} y={y} width={xEnd(row.overload.to) - x(row.overload.from)} height={2} fill="var(--color-warn)" opacity={0.9} />
      )}

      {/* Avancement (encoche noire centrée) */}
      {progW > 0 && <rect x={xStart} y={mid - 1.25} width={progW} height={2.5} rx={1} fill="var(--color-ink)" opacity={0.95} />}

      {/* Deadline (drapeau rouge) */}
      {row.deadline != null && (
        <path
          d={`M ${xEnd(row.deadline)} 4 v ${ROW_HEIGHT - 8} m 0 ${-(ROW_HEIGHT - 8)} h -5 M ${xEnd(row.deadline)} ${ROW_HEIGHT - 4} h -5`}
          stroke="var(--color-danger)"
          strokeWidth={1.5}
          fill="none"
          opacity={0.8}
        />
      )}

      {/* Poignée de création de lien (cercle blanc décalé après le bord droit) */}
      {row.linkHandle && blocks.length > 0 && (
        <circle cx={xFin + LINK_HANDLE_DX} cy={mid} r={4} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.5} />
      )}

      {/* Barre de proposition (réordonnancement proposé) */}
      {row.proposal && (
        <Proposal proposal={row.proposal} top={mid - ROW_HEIGHT / 2} x={x} xEnd={xEnd} color={color} />
      )}

      {/* Marqueur de conflit épinglé au bord gauche */}
      {row.marker && <Marker kind={row.marker} x={gutter + 8} y={mid} />}
    </g>
  );
}

function Proposal({
  proposal,
  top,
  x,
  xEnd,
  color,
}: {
  proposal: { from: number; to: number; delta?: string };
  top: number;
  x: (d: number) => number;
  xEnd: (d: number) => number;
  color: string;
}) {
  const px = x(proposal.from);
  const pEnd = xEnd(proposal.to);
  const btnCx = pEnd + 11;
  const btnCy = top + 3;
  return (
    <g pointerEvents="none">
      <rect x={px} y={top + 1} width={Math.max(3, pEnd - px)} height={4} rx={2} fill={rgba(color, 0.3)} stroke="var(--color-accent)" strokeWidth={1.1} strokeDasharray="3 2" />
      {proposal.delta && (
        <text x={(px + pEnd) / 2} y={top} textAnchor="middle" fontSize={9} fill="var(--color-accent)">
          {proposal.delta}
        </text>
      )}
      <circle cx={btnCx} cy={btnCy} r={7} fill="var(--color-accent)" />
      <path d={`M ${btnCx - 3} ${btnCy} L ${btnCx - 1} ${btnCy + 2.5} L ${btnCx + 3.2} ${btnCy - 2.8}`} fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Diamond({ cx, cy, size, color, conflict }: { cx: number; cy: number; size: number; color: string; conflict?: boolean }) {
  return (
    <path
      d={`M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`}
      fill={darken(color, 0.2)}
      stroke={conflict ? 'var(--color-danger)' : darken(color, 0.45)}
      strokeWidth={conflict ? 1.8 : 1}
    />
  );
}

function Marker({ kind, x, y }: { kind: MarkerKind; x: number; y: number }) {
  if (kind === 'unassigned') {
    return (
      <g transform={`translate(${x}, ${y})`}>
        <circle cx={0} cy={0} r={6} fill="none" stroke="var(--color-danger)" strokeWidth={1.2} />
        <circle cx={0} cy={-2} r={1.8} fill="var(--color-danger)" />
        <path d="M-2.5,3.5 Q-2.5,0.5 0,0.5 Q2.5,0.5 2.5,3.5" fill="var(--color-danger)" />
      </g>
    );
  }
  if (kind === 'effort-overflow') {
    return (
      <g transform={`translate(${x}, ${y})`}>
        <path d="M3,-1.5 H0.5 L2.5,-5 H0 L-3,0 H-0.5 L-3,5 Z" fill="var(--color-warn)" />
      </g>
    );
  }
  // unplanned : fantôme rouge
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path
        d="M -5 6 L -5 -1 A 5 5 0 0 1 5 -1 L 5 6 L 3 4.5 L 1 6 L -1 4.5 L -3 6 Z"
        fill="var(--color-danger)"
      />
      <circle cx={-1.9} cy={-1} r={1.05} fill="white" />
      <circle cx={1.9} cy={-1} r={1.05} fill="white" />
    </g>
  );
}

function Link({
  link,
  x,
  xEnd,
  rowMid,
}: {
  link: MiniLink;
  x: (d: number) => number;
  xEnd: (d: number) => number;
  rowMid: (i: number) => number;
}) {
  const sx = xEnd(link.fromDay);
  const sy = rowMid(link.fromRow);
  const tx = x(link.toDay);
  const ty = rowMid(link.toRow);
  const color = link.violated ? 'var(--color-danger)' : 'var(--color-ink-faint)';
  const bend = Math.min(sx + 8, tx - 6);
  const d = `M ${sx} ${sy} H ${Math.max(sx + 6, bend)} V ${ty} H ${tx - 4}`;
  return (
    <g pointerEvents="none">
      <path d={d} fill="none" stroke={color} strokeWidth={link.violated ? 1.8 : 1.2} />
      <path d={`M ${tx} ${ty} L ${tx - 5} ${ty - 3} L ${tx - 5} ${ty + 3} Z`} fill={color} />
    </g>
  );
}
