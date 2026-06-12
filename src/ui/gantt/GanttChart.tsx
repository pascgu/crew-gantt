import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { eachDay, todayIso } from '@/core/calendar/dates';
import { progressBarDays, taskProgress } from '@/core/scheduler/groups';
import { workedDaysReachedOn, workedDaysUpTo } from '@/core/scheduler/links';
import type { Schedule } from '@/core/scheduler/schedule';
import type { IsoDate, Task } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import {
  addBlockToTask,
  addLink,
  deleteBlock,
  mergeWithNextBlock,
  moveBlock,
  setBlockDates,
  splitBlock,
} from '@/state/taskActions';
import { darken, rgba } from '@/ui/common/color';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import { t } from '@/i18n/fr';
import type { TaskChange } from '@/core/propose/propose';
import type { Baseline } from '@/core/model/types';
import { ROW_HEIGHT, type TimeScale } from './timescale';
import type { GanttRow } from './rows';

const BAR_Y = 6;
const BAR_H = 12;

interface DragMove {
  kind: 'move';
  taskId: string;
  blockId: string;
  startX: number;
  deltaDays: number;
}
interface DragResize {
  kind: 'resize-start' | 'resize-end';
  taskId: string;
  blockId: string;
  day: IsoDate;
  otherEdge: IsoDate;
  openEnd: boolean;
}
interface DragLink {
  kind: 'link';
  sourceTaskId: string;
  /** Point d'ancrage (lien « après N jours ») ou null (après la fin). */
  anchorDate: IsoDate | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  targetTaskId: string | null;
}
type Drag = DragMove | DragResize | DragLink;

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

interface GanttChartProps {
  rows: GanttRow[];
  schedule: Schedule;
  scale: TimeScale;
  /** Fenêtre de virtualisation (indices de lignes). */
  windowStart: number;
  windowEnd: number;
  conflictTaskIds: ReadonlySet<string>;
  /** Fantômes du plan proposé (surimpression). */
  proposalByTask?: ReadonlyMap<string, TaskChange>;
  /** Baseline active affichée (fantômes gris). */
  baseline?: Baseline | null;
  /** Chaîne contraignante du jalon sélectionné. */
  chainTaskIds?: ReadonlySet<string>;
  chainPairs?: ReadonlySet<string>;
  onOpenPanel: (taskId: string) => void;
  /** Pan au clic gauche sur le fond : décale le conteneur de scroll. */
  onPanBy: (dx: number, dy: number) => void;
  hoveredTaskId: string | null;
  onHoverTask: (taskId: string | null) => void;
}

export function GanttChart({
  rows,
  schedule,
  scale,
  windowStart,
  windowEnd,
  conflictTaskIds,
  proposalByTask,
  baseline,
  chainTaskIds,
  chainPairs,
  onOpenPanel,
  onPanBy,
  hoveredTaskId,
  onHoverTask,
}: GanttChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectTask = useAppStore((s) => s.selectTask);
  const projectColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of schedule.ctx.file.projects) map.set(p.id, p.color);
    return map;
  }, [schedule]);

  const rowIndexByTask = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.task.id, i));
    return map;
  }, [rows]);

  const height = rows.length * ROW_HEIGHT;
  const today = todayIso();

  function svgPoint(e: ReactPointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ——— Interactions blocs ———

  function startMove(e: ReactPointerEvent, task: Task, blockId: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectTask(task.id);
    if (e.shiftKey) {
      // Shift + glisser depuis un point précis : lien ancré « après N jours de travail »
      const { x, y } = svgPoint(e);
      const anchorDate = scale.dateAt(x);
      setDrag({
        kind: 'link',
        sourceTaskId: task.id,
        anchorDate,
        fromX: x,
        fromY: y,
        toX: x,
        toY: y,
        targetTaskId: null,
      });
    } else {
      setDrag({ kind: 'move', taskId: task.id, blockId, startX: e.clientX, deltaDays: 0 });
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function startResize(
    e: ReactPointerEvent,
    task: Task,
    blockId: string,
    edge: 'start' | 'end',
    from: IsoDate,
    to: IsoDate,
    openEnd: boolean,
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectTask(task.id);
    setDrag({
      kind: edge === 'start' ? 'resize-start' : 'resize-end',
      taskId: task.id,
      blockId,
      day: edge === 'start' ? from : to,
      otherEdge: edge === 'start' ? to : from,
      openEnd,
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function startLink(e: ReactPointerEvent, task: Task) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { x, y } = svgPoint(e);
    setDrag({
      kind: 'link',
      sourceTaskId: task.id,
      anchorDate: null,
      fromX: x,
      fromY: y,
      toX: x,
      toY: y,
      targetTaskId: null,
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  // ——— Pan : clic gauche maintenu sur le fond (les barres stoppent la propagation) ———

  function onRootPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0 || drag) return;
    panRef.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const pan = panRef.current;
    if (pan && !drag) {
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!pan.moved) {
        pan.moved = true;
        setPanning(true);
      }
      onPanBy(-dx, -dy);
      pan.x = e.clientX;
      pan.y = e.clientY;
      return;
    }
    if (!drag) return;
    if (drag.kind === 'move') {
      const deltaDays = Math.round((e.clientX - drag.startX) / scale.dayWidth);
      if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays });
    } else if (drag.kind === 'link') {
      const { x, y } = svgPoint(e);
      const index = Math.floor(y / ROW_HEIGHT);
      const target = rows[index]?.task ?? null;
      setDrag({
        ...drag,
        toX: x,
        toY: y,
        targetTaskId: target && target.id !== drag.sourceTaskId ? target.id : null,
      });
    } else {
      const { x } = svgPoint(e);
      const day = scale.dateAt(x);
      if (day !== drag.day) setDrag({ ...drag, day });
    }
  }

  function onPointerUp() {
    if (panRef.current) {
      // après un vrai pan, étouffer le clic qui suit (sinon il sélectionne une ligne)
      suppressClickRef.current = panRef.current.moved;
      panRef.current = null;
      setPanning(false);
    }
    if (!drag) return;
    if (drag.kind === 'move') {
      if (drag.deltaDays !== 0) moveBlock(drag.taskId, drag.blockId, drag.deltaDays);
    } else if (drag.kind === 'resize-start') {
      const from = drag.day <= drag.otherEdge ? drag.day : drag.otherEdge;
      setBlockDates(drag.taskId, drag.blockId, from, drag.openEnd ? null : drag.otherEdge);
    } else if (drag.kind === 'resize-end') {
      const to = drag.day >= drag.otherEdge ? drag.day : drag.otherEdge;
      setBlockDates(drag.taskId, drag.blockId, drag.otherEdge, to);
    } else if (drag.kind === 'link' && drag.targetTaskId) {
      if (drag.anchorDate) {
        const progressDays = workedDaysUpTo(schedule.linkInputs, drag.sourceTaskId, drag.anchorDate);
        const error = addLink(drag.targetTaskId, {
          on: drag.sourceTaskId,
          type: 'after-progress',
          progressDays: Math.max(0.5, progressDays),
          lag: 0,
        });
        if (error) window.alert(error);
      } else {
        const error = addLink(drag.targetTaskId, {
          on: drag.sourceTaskId,
          type: 'after-end',
          lag: 0,
        });
        if (error) window.alert(error);
      }
    }
    setDrag(null);
  }

  function blockMenu(e: ReactPointerEvent | React.MouseEvent, task: Task, blockId: string) {
    e.preventDefault();
    e.stopPropagation();
    const { x } = svgPoint(e as ReactPointerEvent);
    const cutDay = scale.dateAt(x);
    const resolved = schedule.resolvedByTask.get(task.id) ?? [];
    const r = resolved.find((rb) => rb.block.id === blockId);
    const sorted = [...resolved].sort((a, b) => a.from.localeCompare(b.from));
    const idx = sorted.findIndex((rb) => rb.block.id === blockId);
    const hasNext = idx >= 0 && idx < sorted.length - 1;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        {
          label: `✂ ${t('gantt.cutHere')} (${cutDay.slice(8)}/${cutDay.slice(5, 7)})`,
          disabled: !r || cutDay <= r.from || cutDay > r.to,
          onClick: () => r && splitBlock(task.id, blockId, cutDay, r.to),
        },
        {
          label: t('gantt.mergeNext'),
          disabled: !hasNext,
          onClick: () => mergeWithNextBlock(task.id, blockId),
        },
        {
          label: t('gantt.deleteBlock'),
          danger: true,
          onClick: () => deleteBlock(task.id, blockId),
        },
      ],
    });
  }

  function rowMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const day = scale.dateAt(e.clientX - rect.left);
    if (task.type !== 'task') return;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [{ label: t('gantt.addBlock'), onClick: () => addBlockToTask(task.id, day) }],
    });
  }

  // ——— Couches ———

  const gridColumns = useMemo(() => {
    const cols: { x: number; w: number }[] = [];
    for (const day of eachDay(scale.origin, scale.end)) {
      if (!schedule.ctx.isGlobalWorkingDay(day)) {
        cols.push({ x: scale.x(day), w: scale.dayWidth });
      }
    }
    // fusionne les colonnes contiguës (week-ends) pour réduire le DOM
    const merged: { x: number; w: number }[] = [];
    for (const c of cols) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.x + last.w - c.x) < 0.01) last.w += c.w;
      else merged.push({ ...c });
    }
    return merged;
  }, [scale, schedule]);

  const visible = rows.slice(windowStart, windowEnd);

  return (
    <>
      <svg
        id="gantt-chart-svg"
        ref={svgRef}
        width={scale.width}
        height={height}
        className={`block select-none ${panning ? 'cursor-grabbing' : ''}`}
        onPointerDown={onRootPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => onHoverTask(null)}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.stopPropagation();
          }
        }}
      >
        {/* Jours chômés */}
        {gridColumns.map((c, i) => (
          <rect key={i} x={c.x} y={0} width={c.w} height={height} fill="rgb(33 31 26 / 0.045)" />
        ))}
        {/* Séparateurs de lignes */}
        {visible.map((_, i) => {
          const y = (windowStart + i + 1) * ROW_HEIGHT;
          return <line key={i} x1={0} x2={scale.width} y1={y} y2={y} stroke="rgb(33 31 26 / 0.05)" />;
        })}
        {/* Ligne aujourd'hui */}
        <line
          x1={scale.x(today) + scale.dayWidth / 2}
          x2={scale.x(today) + scale.dayWidth / 2}
          y1={0}
          y2={height}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.65}
        />
        {/* Chaîne contraignante du jalon sélectionné */}
        {chainTaskIds &&
          visible.map((row, i) =>
            chainTaskIds.has(row.task.id) ? (
              <rect
                key={`chain-${row.task.id}`}
                x={0}
                y={(windowStart + i) * ROW_HEIGHT}
                width={scale.width}
                height={ROW_HEIGHT}
                fill="var(--color-warn)"
                opacity={0.09}
              />
            ) : null,
          )}
        {/* Survol (synchronisé avec la table) */}
        {hoveredTaskId !== null &&
          hoveredTaskId !== selectedTaskId &&
          rowIndexByTask.has(hoveredTaskId) && (
            <rect
              x={0}
              y={rowIndexByTask.get(hoveredTaskId)! * ROW_HEIGHT}
              width={scale.width}
              height={ROW_HEIGHT}
              fill="var(--color-ink)"
              opacity={0.035}
              pointerEvents="none"
            />
          )}
        {/* Sélection */}
        {selectedTaskId !== null && rowIndexByTask.has(selectedTaskId) && (
          <rect
            x={0}
            y={rowIndexByTask.get(selectedTaskId)! * ROW_HEIGHT}
            width={scale.width}
            height={ROW_HEIGHT}
            fill="var(--color-accent)"
            opacity={0.06}
          />
        )}
        {/* Liens */}
        <LinksLayer
          rows={rows}
          schedule={schedule}
          scale={scale}
          rowIndexByTask={rowIndexByTask}
          chainPairs={chainPairs}
        />
        {/* Fantômes gris de la baseline active */}
        {baseline &&
          visible.map((row, i) => (
            <BaselineGhost
              key={`bl-${row.task.id}`}
              baseline={baseline}
              task={row.task}
              y={(windowStart + i) * ROW_HEIGHT}
              scale={scale}
            />
          ))}
        {/* Fantômes colorés du plan proposé */}
        {proposalByTask &&
          visible.map((row, i) => {
            const change = proposalByTask.get(row.task.id);
            if (!change) return null;
            return (
              <ProposalGhost
                key={`prop-${row.task.id}`}
                change={change}
                y={(windowStart + i) * ROW_HEIGHT}
                scale={scale}
                color={projectColor.get(row.task.projectId) ?? '#888888'}
              />
            );
          })}
        {/* Barres (lignes visibles seulement) */}
        {visible.map((row, i) => (
          <g
            key={row.task.id}
            transform={`translate(0, ${(windowStart + i) * ROW_HEIGHT})`}
            onContextMenu={(e) => rowMenu(e, row.task)}
            onClick={() => selectTask(row.task.id)}
            onDoubleClick={() => onOpenPanel(row.task.id)}
            onMouseEnter={() => onHoverTask(row.task.id)}
          >
            {/* zone cliquable de la ligne */}
            <rect x={0} y={0} width={scale.width} height={ROW_HEIGHT} fill="transparent" />
            <RowBars
              row={row}
              schedule={schedule}
              scale={scale}
              color={projectColor.get(row.task.projectId) ?? '#888888'}
              hasConflict={conflictTaskIds.has(row.task.id)}
              drag={drag}
              isLinkTarget={drag?.kind === 'link' && drag.targetTaskId === row.task.id}
              onBlockPointerDown={startMove}
              onResizePointerDown={startResize}
              onLinkPointerDown={startLink}
              onBlockContextMenu={blockMenu}
            />
          </g>
        ))}
        {/* Fantôme de lien en cours */}
        {drag?.kind === 'link' && (
          <g pointerEvents="none">
            <line
              x1={drag.fromX}
              y1={drag.fromY}
              x2={drag.toX}
              y2={drag.toY}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle cx={drag.fromX} cy={drag.fromY} r={3.5} fill="var(--color-accent)" />
            <circle cx={drag.toX} cy={drag.toY} r={3.5} fill="var(--color-accent)" />
          </g>
        )}
      </svg>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}
    </>
  );
}

// ——— Barres d'une ligne ———

interface RowBarsProps {
  row: GanttRow;
  schedule: Schedule;
  scale: TimeScale;
  color: string;
  hasConflict: boolean;
  drag: Drag | null;
  isLinkTarget: boolean;
  onBlockPointerDown: (e: ReactPointerEvent, task: Task, blockId: string) => void;
  onResizePointerDown: (
    e: ReactPointerEvent,
    task: Task,
    blockId: string,
    edge: 'start' | 'end',
    from: IsoDate,
    to: IsoDate,
    openEnd: boolean,
  ) => void;
  onLinkPointerDown: (e: ReactPointerEvent, task: Task) => void;
  onBlockContextMenu: (e: React.MouseEvent, task: Task, blockId: string) => void;
}

function RowBars({
  row,
  schedule,
  scale,
  color,
  hasConflict,
  drag,
  isLinkTarget,
  onBlockPointerDown,
  onResizePointerDown,
  onLinkPointerDown,
  onBlockContextMenu,
}: RowBarsProps) {
  const { task } = row;
  const mid = ROW_HEIGHT / 2;

  if (task.type === 'milestone') {
    if (!task.date) return null;
    const cx = scale.x(task.date) + scale.dayWidth / 2;
    return (
      <g className="cursor-pointer">
        <Diamond cx={cx} cy={mid} size={6} color={color} conflict={hasConflict} />
        <text x={cx + 10} y={mid + 3.5} fontSize={10.5} fill="var(--color-ink-soft)">
          {task.name}
        </text>
      </g>
    );
  }

  if (task.type === 'group') {
    const agg = schedule.groupAggByTask.get(task.id);
    if (!agg || !agg.span) return null;
    const dark = darken(color, 0.25);
    const progressW = progressBarDays(agg.span, agg.progress) * scale.dayWidth;
    return (
      <g>
        {/* liaison fine sur toute l'étendue */}
        <rect
          x={scale.x(agg.span.start)}
          y={mid - 1.5}
          width={scale.xEnd(agg.span.end) - scale.x(agg.span.start)}
          height={3}
          fill={rgba(color, 0.28)}
        />
        {/* union des blocs descendants — découpée pareil */}
        {agg.intervals.map((itv, i) => (
          <rect
            key={i}
            x={scale.x(itv.from)}
            y={mid - 4}
            width={Math.max(3, scale.xEnd(itv.to) - scale.x(itv.from))}
            height={8}
            rx={2}
            fill={dark}
          />
        ))}
        {/* avancement : % de la largeur calendaire totale, liaisons comprises */}
        {progressW > 0 && (
          <rect
            x={scale.x(agg.span.start)}
            y={mid + 5.5}
            width={progressW}
            height={2.5}
            rx={1.25}
            fill={darken(color, 0.5)}
          />
        )}
        {/* jalons des descendants quand le groupe est replié */}
        {row.collapsedMilestones.map(
          (m) =>
            m.date && (
              <Diamond
                key={m.id}
                cx={scale.x(m.date) + scale.dayWidth / 2}
                cy={mid}
                size={5}
                color={color}
              />
            ),
        )}
        {isLinkTarget && <TargetHalo width={scale.width} />}
      </g>
    );
  }

  // ——— Tâche simple : blocs + liaisons + avancement sur le ruban ———
  const resolved = [...(schedule.resolvedByTask.get(task.id) ?? [])].sort((a, b) =>
    a.from.localeCompare(b.from),
  );
  if (resolved.length === 0) {
    return isLinkTarget ? <TargetHalo width={scale.width} /> : null;
  }
  const span = { start: resolved[0]!.from, end: resolved[resolved.length - 1]!.to };
  const progress = taskProgress(task);
  const progressW = progressBarDays(span, progress) * scale.dayWidth;
  const dragOffset = (blockId: string) =>
    drag?.kind === 'move' && drag.taskId === task.id && drag.blockId === blockId
      ? drag.deltaDays * scale.dayWidth
      : 0;

  return (
    <g className="group">
      {/* liaisons estompées entre blocs */}
      {resolved.slice(0, -1).map((r, i) => {
        const next = resolved[i + 1]!;
        const x1 = scale.xEnd(r.to);
        const x2 = scale.x(next.from);
        if (x2 <= x1) return null;
        return (
          <rect key={`l${i}`} x={x1} y={mid - 2} width={x2 - x1} height={4} fill={rgba(color, 0.3)} />
        );
      })}
      {/* blocs */}
      {resolved.map((r) => {
        let from = r.from;
        let to = r.to;
        if (drag?.kind === 'resize-start' && drag.taskId === task.id && drag.blockId === r.block.id) {
          from = drag.day <= drag.otherEdge ? drag.day : drag.otherEdge;
        }
        if (drag?.kind === 'resize-end' && drag.taskId === task.id && drag.blockId === r.block.id) {
          to = drag.day >= drag.otherEdge ? drag.day : drag.otherEdge;
        }
        const x = scale.x(from) + dragOffset(r.block.id);
        const w = Math.max(4, scale.xEnd(to) - scale.x(from));
        const openEnd = r.block.to === null;
        const who = r.block.assignments
          .map((a) => {
            const res = schedule.ctx.file.resources.find((rs) => rs.id === a.resourceId);
            return res ? `${res.name} (${a.units} %)` : null;
          })
          .filter(Boolean)
          .join(', ');
        return (
          <g key={r.block.id}>
            <rect
              x={x}
              y={BAR_Y}
              width={w}
              height={BAR_H}
              rx={3}
              fill={color}
              opacity={task.status === 'done' ? 0.55 : 1}
              stroke={r.overflow || hasConflict ? 'var(--color-danger)' : darken(color, 0.3)}
              strokeWidth={r.overflow || hasConflict ? 1.6 : 0.5}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => onBlockPointerDown(e, task, r.block.id)}
              onContextMenu={(e) => onBlockContextMenu(e, task, r.block.id)}
            >
              <title>
                {t('gantt.blockOf', { name: task.name })} — {from} → {to}
                {who ? `\n${who}` : ''}
                {`\n${t('panel.remaining')} : ${task.remaining} ${t('common.days')}`}
              </title>
            </rect>
            {/* fin calculée : bord droit en dégradé (travail qui « s'arrête tout seul ») */}
            {openEnd && (
              <rect x={x + w - 3} y={BAR_Y} width={3} height={BAR_H} fill={rgba('#ffffff', 0.45)} />
            )}
            {/* poignées de redimensionnement */}
            <rect
              x={x - 3}
              y={BAR_Y}
              width={7}
              height={BAR_H}
              fill="transparent"
              className="cursor-ew-resize"
              onPointerDown={(e) =>
                onResizePointerDown(e, task, r.block.id, 'start', r.from, r.to, openEnd)
              }
            />
            {!openEnd && (
              <rect
                x={x + w - 4}
                y={BAR_Y}
                width={8}
                height={BAR_H}
                fill="transparent"
                className="cursor-ew-resize"
                onPointerDown={(e) =>
                  onResizePointerDown(e, task, r.block.id, 'end', r.from, r.to, openEnd)
                }
              />
            )}
          </g>
        );
      })}
      {/* avancement superposé au ruban (règle unique, peut finir dans un trou) */}
      {progressW > 0 && (
        <rect
          x={scale.x(span.start)}
          y={BAR_Y + BAR_H - 4}
          width={progressW}
          height={3}
          rx={1.5}
          fill={darken(color, 0.55)}
          pointerEvents="none"
        />
      )}
      {/* deadline */}
      {task.deadline && (
        <path
          d={`M ${scale.xEnd(task.deadline)} 4 v ${ROW_HEIGHT - 8} m 0 ${-(ROW_HEIGHT - 8)} h -5 M ${scale.xEnd(task.deadline)} ${ROW_HEIGHT - 4} h -5`}
          stroke="var(--color-danger)"
          strokeWidth={1.5}
          fill="none"
          opacity={0.8}
        />
      )}
      {/* poignée de création de lien (apparaît au survol de la ligne) */}
      <circle
        cx={scale.xEnd(span.end) + 7}
        cy={mid}
        r={4}
        fill="var(--color-surface)"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        className="cursor-crosshair opacity-0 transition-opacity group-hover:opacity-100"
        onPointerDown={(e) => onLinkPointerDown(e, task)}
      >
        <title>{t('gantt.newLinkTo')}</title>
      </circle>
      {isLinkTarget && <TargetHalo width={scale.width} />}
    </g>
  );
}

function Diamond({
  cx,
  cy,
  size,
  color,
  conflict,
}: {
  cx: number;
  cy: number;
  size: number;
  color: string;
  conflict?: boolean;
}) {
  return (
    <path
      d={`M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`}
      fill={darken(color, 0.2)}
      stroke={conflict ? 'var(--color-danger)' : darken(color, 0.45)}
      strokeWidth={conflict ? 1.8 : 1}
    />
  );
}

function TargetHalo({ width }: { width: number }) {
  return (
    <rect
      x={0}
      y={1}
      width={width}
      height={ROW_HEIGHT - 2}
      fill="var(--color-accent)"
      opacity={0.1}
      pointerEvents="none"
    />
  );
}

// ——— Fantômes ———

/** Barres grises du plan de référence (baseline active). */
function BaselineGhost({
  baseline,
  task,
  y,
  scale,
}: {
  baseline: Baseline;
  task: { id: string; type: string };
  y: number;
  scale: TimeScale;
}) {
  if (task.type === 'milestone') {
    const date = baseline.milestones[task.id];
    if (!date) return null;
    const cx = scale.x(date) + scale.dayWidth / 2;
    const cy = y + ROW_HEIGHT / 2;
    return (
      <path
        d={`M ${cx} ${cy - 5} L ${cx + 5} ${cy} L ${cx} ${cy + 5} L ${cx - 5} ${cy} Z`}
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth={1.5}
        pointerEvents="none"
      />
    );
  }
  const snapshot = baseline.tasks[task.id];
  if (!snapshot) return null;
  return (
    <g pointerEvents="none">
      {snapshot.blocks.map((b, i) => (
        <rect
          key={i}
          x={scale.x(b.from)}
          y={y + ROW_HEIGHT - 5}
          width={Math.max(2, scale.xEnd(b.to) - scale.x(b.from))}
          height={3}
          rx={1.5}
          fill="var(--color-line-strong)"
          opacity={0.9}
        />
      ))}
    </g>
  );
}

/** Surimpression du plan proposé : contours en pointillés au-dessus de la barre. */
function ProposalGhost({
  change,
  y,
  scale,
  color,
}: {
  change: TaskChange;
  y: number;
  scale: TimeScale;
  color: string;
}) {
  if (change.date) {
    const cx = scale.x(change.date) + scale.dayWidth / 2;
    const cy = y + ROW_HEIGHT / 2;
    return (
      <path
        d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
        fill={rgba(color, 0.25)}
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        pointerEvents="none"
      />
    );
  }
  if (!change.blocks) return null;
  // fin du dernier bloc (ouvert) : newEnd calculé par la proposition
  return (
    <g pointerEvents="none">
      {change.blocks.map((b, i) => {
        const to = b.to ?? change.newEnd;
        if (!to || to < b.from) return null;
        return (
          <rect
            key={i}
            x={scale.x(b.from)}
            y={y + 1}
            width={Math.max(3, scale.xEnd(to) - scale.x(b.from))}
            height={4}
            rx={2}
            fill={rgba(color, 0.3)}
            stroke="var(--color-accent)"
            strokeWidth={1.1}
            strokeDasharray="3 2"
          />
        );
      })}
    </g>
  );
}

// ——— Liens entre tâches ———

function LinksLayer({
  rows,
  schedule,
  scale,
  rowIndexByTask,
  chainPairs,
}: {
  rows: GanttRow[];
  schedule: Schedule;
  scale: TimeScale;
  rowIndexByTask: ReadonlyMap<string, number>;
  chainPairs?: ReadonlySet<string>;
}) {
  const paths: { d: string; violated: boolean; inChain: boolean; key: string }[] = [];

  for (const row of rows) {
    const task = row.task;
    if (task.links.length === 0) continue;
    const targetIndex = rowIndexByTask.get(task.id);
    if (targetIndex === undefined) continue;
    const targetSpan = schedule.spanByTask.get(task.id);
    if (!targetSpan) continue;
    const earliest = schedule.earliestByTask.get(task.id);

    for (const [li, link] of task.links.entries()) {
      const sourceIndex = rowIndexByTask.get(link.on);
      if (sourceIndex === undefined) continue;
      const sourceSpan = schedule.spanByTask.get(link.on);
      if (!sourceSpan) continue;

      let sx: number;
      if (link.type === 'with-start') {
        sx = scale.x(sourceSpan.start);
      } else if (link.type === 'after-progress') {
        const reached = workedDaysReachedOn(schedule.linkInputs, link.on, link.progressDays ?? 0);
        sx = scale.xEnd(reached ?? sourceSpan.end);
      } else {
        sx = scale.xEnd(sourceSpan.end);
      }
      const sy = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const tx = scale.x(targetSpan.start);
      const ty = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const violated = Boolean(earliest?.date && targetSpan.start < earliest.date);
      const bend = sx + 7;
      paths.push({
        key: `${task.id}-${li}`,
        violated,
        inChain: chainPairs?.has(`${task.id}:${link.on}`) ?? false,
        d: `M ${sx} ${sy} L ${bend} ${sy} L ${bend} ${ty} L ${tx - 4} ${ty}`,
      });
    }
  }

  return (
    <g pointerEvents="none">
      {paths.map((p) => {
        const stroke = p.violated
          ? 'var(--color-danger)'
          : p.inChain
            ? 'var(--color-warn)'
            : 'var(--color-ink-faint)';
        return (
          <g key={p.key}>
            <path
              d={p.d}
              fill="none"
              stroke={stroke}
              strokeWidth={p.violated || p.inChain ? 1.8 : 1.1}
              opacity={0.9}
            />
            <ArrowHead d={p.d} color={stroke} />
          </g>
        );
      })}
    </g>
  );
}

function ArrowHead({ d, color }: { d: string; color: string }) {
  // pointe au bout du path (dernier point « L x y »)
  const m = d.match(/L ([-\d.]+) ([-\d.]+)$/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return <path d={`M ${x} ${y} l -5 -3.5 v 7 Z`} fill={color} />;
}
