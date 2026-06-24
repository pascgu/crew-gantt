/**
 * MiniList — réplique HTML statique de la table arborescente (liste de gauche), pour l'aide.
 * Réutilise les largeurs `COLS` et les libellés de colonnes (`tasks.columns.*`) et imite les
 * cellules de TaskRowCells (jauge d'affectation, badges, boutons « + »). Lecture seule : données
 * figées en props. Un overlay SVG superpose les callouts/curseurs (mêmes primitives que MiniGantt).
 */
import { Fragment } from 'react';
import { COLS } from '@/ui/table/columns';
import type { ColKey } from '@/ui/table/tableStore';
import { t } from '@/i18n/fr';
import { IconChevronDown, IconChevronRight, IconDiamond, IconDots, IconPlus } from '@/ui/common/icons';
import { Callout, CursorGlyph, type CursorKind, type Place } from './Annotated';

const HEADER_H = 22;
const ROW_H = 21;

export interface MiniAssignee {
  label: string;
  color: string;
  units: number;
}

export interface MiniListRow {
  name: string;
  depth?: number;
  type?: 'task' | 'group' | 'milestone';
  hasChildren?: boolean;
  collapsed?: boolean;
  project?: { name: string; color: string };
  scheduling?: string;
  estimate?: string;
  effort?: string;
  realized?: string;
  remaining?: string;
  progress?: string;
  assignees?: MiniAssignee[];
  start?: string;
  end?: string;
  status?: { label: string; color: string };
  conflictCount?: number;
  selected?: boolean;
  hovered?: boolean;
  /** Affiche les boutons ronds « + » sous la ligne (un par niveau). */
  showAdd?: boolean;
}

export interface MiniListCallout {
  col: ColKey;
  row: number; // -1 = en-tête
  /** Décalages px fins pour viser un élément précis (ex. le « ⋯ » à droite, les « + » sous la ligne). */
  dx?: number;
  dy?: number;
  label: string;
  place?: Place;
  cursor?: CursorKind;
  animate?: boolean;
}

const DEFAULT_COLS: ColKey[] = [
  'name',
  'scheduling',
  'estimate',
  'effort',
  'realized',
  'remaining',
  'progress',
  'assignees',
  'start',
  'status',
];

interface Props {
  rows: MiniListRow[];
  columns?: ColKey[];
  callouts?: MiniListCallout[];
  className?: string;
}

export function MiniList({ rows, columns = DEFAULT_COLS, callouts, className }: Props) {
  const widths = columns.map((c) => COLS[c]);
  const tableWidth = widths.reduce((a, b) => a + b, 0);
  const colLeft = (key: ColKey): number => {
    let acc = 0;
    for (const c of columns) {
      if (c === key) return acc;
      acc += COLS[c];
    }
    return acc;
  };
  const colCenter = (key: ColKey) => colLeft(key) + COLS[key] / 2;
  const overlayH = HEADER_H + rows.length * ROW_H + 44;

  return (
    <div className={`relative inline-block text-[11px] ${className ?? ''}`} style={{ width: tableWidth }}>
      {/* En-tête */}
      <div className="flex border-b border-line bg-paper-deep/60 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint" style={{ height: HEADER_H }}>
        {columns.map((c) => (
          <div key={c} className="flex items-center overflow-hidden px-1" style={{ width: COLS[c] }}>
            <span className="truncate">{t(`tasks.columns.${c}`)}</span>
          </div>
        ))}
      </div>

      {/* Lignes */}
      {rows.map((r, i) => (
        <div
          key={i}
          className={`relative flex items-center border-b border-line/60 ${
            r.selected ? 'bg-accent-wash/60' : r.hovered ? 'bg-ink/[0.03]' : 'bg-surface'
          }`}
          style={{ height: ROW_H }}
        >
          {columns.map((c) => (
            <Cell key={c} col={c} row={r} />
          ))}
          {r.showAdd && <AddButtons depth={r.depth ?? 0} />}
        </div>
      ))}

      {/* Overlay callouts/curseurs */}
      {callouts && callouts.length > 0 && (
        <svg className="pointer-events-none absolute left-0 top-0" style={{ overflow: 'visible' }} width={tableWidth} height={overlayH} viewBox={`0 0 ${tableWidth} ${overlayH}`}>
          {callouts.map((c, i) => {
            const cx = colCenter(c.col) + (c.dx ?? 0);
            const cy = (c.row < 0 ? HEADER_H / 2 : HEADER_H + c.row * ROW_H + ROW_H / 2) + (c.dy ?? 0);
            return (
              <Fragment key={i}>
                {c.cursor && <CursorGlyph kind={c.cursor} x={cx} y={cy} animate={c.animate} />}
                <Callout ax={cx} ay={cy} label={c.label} place={c.place ?? 'top'} />
              </Fragment>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Cell({ col, row }: { col: ColKey; row: MiniListRow }) {
  const w = COLS[col];
  const mono = 'block px-1 text-right font-mono text-[11px] text-ink-soft';
  switch (col) {
    case 'name':
      return (
        <div className="group/row flex min-w-0 items-center gap-0.5 pr-1" style={{ width: w, paddingLeft: 6 + (row.depth ?? 0) * 16 }}>
          {row.hasChildren ? (
            <span className="shrink-0 text-ink-faint">
              {row.collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
            </span>
          ) : (
            <span className="w-[17px] shrink-0" />
          )}
          {row.type === 'milestone' && <IconDiamond size={11} className="shrink-0 text-ink-soft" />}
          <span className={`min-w-0 flex-1 truncate ${row.type === 'group' ? 'font-semibold' : ''}`}>{row.name}</span>
          {row.conflictCount ? (
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white">
              {row.conflictCount}
            </span>
          ) : null}
          <span className="shrink-0 text-ink-faint opacity-60">
            <IconDots size={12} />
          </span>
        </div>
      );
    case 'project':
      return (
        <div className="flex items-center gap-1.5 overflow-hidden px-1" style={{ width: w }}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: row.project?.color ?? '#888' }} />
          <span className="truncate text-ink-faint">{row.project?.name ?? '—'}</span>
        </div>
      );
    case 'scheduling':
      return (
        <div className="overflow-hidden px-0.5" style={{ width: w }}>
          <span className="block truncate text-ink-faint">{row.scheduling ?? '—'}</span>
        </div>
      );
    case 'estimate':
      return <div className="overflow-hidden px-0.5" style={{ width: w }}><span className={mono}>{row.estimate ?? '—'}</span></div>;
    case 'effort':
      return <div className="overflow-hidden px-0.5" style={{ width: w }}><span className={mono}>{row.effort ?? '—'}</span></div>;
    case 'realized':
      return <div className="overflow-hidden px-0.5" style={{ width: w }}><span className={mono}>{row.realized ?? '—'}</span></div>;
    case 'remaining':
      return <div className="overflow-hidden px-0.5" style={{ width: w }}><span className={mono}>{row.remaining ?? '—'}</span></div>;
    case 'progress':
      return <div className="overflow-hidden px-0.5" style={{ width: w }}><span className={mono}>{row.progress ?? '—'}</span></div>;
    case 'assignees':
      return (
        <div className="flex items-center gap-0.5 overflow-hidden px-1" style={{ width: w }}>
          {row.assignees && row.assignees.length > 0 ? (
            row.assignees.map((a, i) => <AssigneeAvatar key={i} a={a} />)
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </div>
      );
    case 'start':
      return <div className="overflow-hidden px-1 text-right font-mono text-[11px] text-ink-soft" style={{ width: w }}>{row.start ?? '—'}</div>;
    case 'end':
      return <div className="overflow-hidden px-1 text-right font-mono text-[11px] text-ink-soft" style={{ width: w }}>{row.end ?? '—'}</div>;
    case 'status':
      return (
        <div className="flex items-center gap-1.5 overflow-hidden px-1.5" style={{ width: w }}>
          {row.status ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.status.color }} />
              <span className="truncate">{row.status.label}</span>
            </>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </div>
      );
    default:
      return <div style={{ width: w }} />;
  }
}

function AssigneeAvatar({ a }: { a: MiniAssignee }) {
  const stripes = `repeating-linear-gradient(-45deg, ${a.color} 0px, ${a.color} 2px, rgba(255,255,255,0.45) 2px, rgba(255,255,255,0.45) 4px)`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }} title={`${a.label} : ${a.units}%`}>
      <span
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-display text-[9px] font-bold text-white"
        style={{ background: a.color }}
      >
        {a.label}
      </span>
      <div style={{ width: 3, height: 18, background: 'var(--color-line)', borderRadius: 1.5, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${Math.min(a.units, 100)}%`,
            background: a.units > 100 ? stripes : a.color,
            borderRadius: 1.5,
          }}
        />
      </div>
    </div>
  );
}

function AddButtons({ depth }: { depth: number }) {
  return (
    <div className="absolute -bottom-[9px] left-0 z-10 h-[18px]">
      {Array.from({ length: depth + 2 }, (_, level) => (
        <span
          key={level}
          className="absolute flex h-[18px] w-[18px] items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-sm"
          style={{ left: 4 + level * 16 }}
        >
          <IconPlus size={10} />
        </span>
      ))}
    </div>
  );
}
