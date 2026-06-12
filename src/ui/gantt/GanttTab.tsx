import { useMemo, useRef, useState } from 'react';
import { todayIso } from '@/core/calendar/dates';
import type { ZoomLevel } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { useConflictsByTask, useSchedule } from '@/state/schedule';
import { addTask, setZoom } from '@/state/taskActions';
import { ProjectFilter } from '@/ui/app/ProjectFilter';
import { IconDiamond, IconPlus } from '@/ui/common/icons';
import { TaskRowCells, type DropIndicator } from '@/ui/table/TaskRowCells';
import { COLS, TABLE_WIDTH } from '@/ui/table/columns';
import { t } from '@/i18n/fr';
import { GanttChart } from './GanttChart';
import { TaskPanel } from './TaskPanel';
import { WorkloadPanel } from './WorkloadPanel';
import { useGanttRows } from './rows';
import {
  bottomTicks,
  buildTimeScale,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  topTicks,
} from './timescale';

const ZOOMS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const OVERSCAN = 6;

export function GanttTab() {
  const schedule = useSchedule();
  const rows = useGanttRows();
  const conflictsByTask = useConflictsByTask();
  const zoom = useAppStore((s) => s.file.ui.zoom);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectTask = useAppStore((s) => s.selectTask);
  const tasks = useAppStore((s) => s.file.tasks);
  const projects = useAppStore((s) => s.file.projects);
  const cycle = schedule.cycle;

  const [panelOpen, setPanelOpen] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [showWorkload, setShowWorkload] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  // Mesure du viewport pour la virtualisation des lignes.
  const attachScroll = (el: HTMLDivElement | null) => {
    scrollRef.current = el;
    resizeObserver.current?.disconnect();
    if (el) {
      setViewportH(el.clientHeight);
      resizeObserver.current = new ResizeObserver(() => setViewportH(el.clientHeight));
      resizeObserver.current.observe(el);
    }
  };

  const today = todayIso();
  const scale = useMemo(
    () => buildTimeScale(schedule.planSpan, zoom, today),
    [schedule.planSpan, zoom, today],
  );

  const windowStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const windowEnd = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );

  const selectedTask = panelOpen ? tasks.find((tk) => tk.id === selectedTaskId) : undefined;

  const openPanel = (taskId: string) => {
    selectTask(taskId);
    setPanelOpen(true);
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = TABLE_WIDTH + scale.x(today) - (el.clientWidth - TABLE_WIDTH) / 2;
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre d'outils */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
          <ProjectFilter />
          <span className="mx-1 h-5 w-px bg-line" />
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-deep p-0.5">
            {ZOOMS.map((z) => (
              <button
                key={z}
                className={`rounded-md px-2 py-0.5 text-[11.5px] font-medium transition ${
                  zoom === z ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                }`}
                onClick={() => setZoom(z)}
              >
                {t(`gantt.zoom.${z}`)}
              </button>
            ))}
          </div>
          <button
            className="rounded-md border border-line px-2 py-0.5 text-[11.5px] font-medium text-ink-soft transition hover:border-accent hover:text-accent"
            onClick={scrollToToday}
          >
            {t('gantt.today')}
          </button>
          <button
            className={`rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition ${
              showWorkload
                ? 'border-accent bg-accent-wash text-accent-deep'
                : 'border-line text-ink-soft hover:text-ink'
            }`}
            onClick={() => setShowWorkload((v) => !v)}
          >
            {showWorkload ? t('workload.hide') : t('workload.show')}
          </button>
          <span className="flex-1" />
          {cycle && (
            <span className="rounded bg-danger-wash px-2 py-0.5 text-[11.5px] font-medium text-danger">
              {t('conflicts.cycle', {
                tasks: cycle
                  .map((id) => tasks.find((tk) => tk.id === id)?.name ?? id)
                  .join(' → '),
              })}
            </span>
          )}
          <button
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] font-medium text-ink-soft transition hover:border-accent hover:text-accent"
            onClick={() => openPanel(addTask({ type: 'group' }))}
          >
            <IconPlus size={11} /> {t('tasks.addGroup')}
          </button>
          <button
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] font-medium text-ink-soft transition hover:border-accent hover:text-accent"
            onClick={() => openPanel(addTask({ type: 'milestone' }))}
          >
            <IconDiamond size={11} /> {t('tasks.addMilestone')}
          </button>
          <button
            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
            onClick={() => openPanel(addTask({}))}
          >
            <IconPlus size={11} /> {t('tasks.addTask')}
          </button>
        </div>

        {/* Zone défilante : tableau collant à gauche + timeline */}
        <div
          ref={attachScroll}
          className="min-h-0 flex-1 overflow-auto"
          onScroll={(e) => {
            setScrollTop(e.currentTarget.scrollTop);
            setScrollLeft(e.currentTarget.scrollLeft);
          }}
        >
          <div style={{ width: TABLE_WIDTH + scale.width }} className="relative">
            {/* En-tête collant */}
            <div
              className="sticky top-0 z-20 flex border-b border-line bg-surface"
              style={{ height: HEADER_HEIGHT }}
            >
              <HeaderLeft />
              <HeaderTimescale scale={scale} />
            </div>

            {projects.length === 0 ? (
              <div className="sticky left-0 p-8 text-sm text-ink-faint" style={{ width: 500 }}>
                {t('tasks.noProject')}
              </div>
            ) : rows.length === 0 ? (
              <div className="sticky left-0 p-8 text-sm text-ink-faint" style={{ width: 500 }}>
                {t('tasks.emptyPlan')}
              </div>
            ) : (
              <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
                {/* Timeline SVG (toutes lignes, barres virtualisées) */}
                <div className="absolute top-0" style={{ left: TABLE_WIDTH }}>
                  <GanttChart
                    rows={rows}
                    schedule={schedule}
                    scale={scale}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    conflictTaskIds={new Set(conflictsByTask.keys())}
                    onOpenPanel={openPanel}
                  />
                </div>
                {/* Colonnes du tableau, collantes à gauche (lignes virtualisées) */}
                <div
                  className="sticky left-0 z-10"
                  style={{
                    width: TABLE_WIDTH,
                    transform: `translateY(${windowStart * ROW_HEIGHT}px)`,
                  }}
                >
                  <div className="border-r border-line-strong shadow-[2px_0_6px_rgb(33_31_26/0.05)]">
                    {rows.slice(windowStart, windowEnd).map((row) => (
                      <TaskRowCells
                        key={row.task.id}
                        row={row}
                        schedule={schedule}
                        conflicts={conflictsByTask.get(row.task.id)}
                        dropIndicator={dropIndicator}
                        onDropIndicator={setDropIndicator}
                        onOpenPanel={openPanel}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Volet de charge par personne (repliable), aligné sur la timeline */}
            {showWorkload && schedule.ctx.file.resources.length > 0 && (
              <div className="sticky bottom-0 z-20">
                <WorkloadPanel
                  schedule={schedule}
                  scale={scale}
                  visibleFrom={scale.dateAt(Math.max(0, scrollLeft - 200))}
                  visibleTo={scale.dateAt(
                    Math.min(scale.width - 1, scrollLeft + window.innerWidth),
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panneau latéral d'édition */}
      {selectedTask && (
        <TaskPanel task={selectedTask} schedule={schedule} onClose={() => setPanelOpen(false)} />
      )}
    </div>
  );
}

function HeaderLeft() {
  const labels: { key: keyof typeof COLS; label: string }[] = [
    { key: 'name', label: t('tasks.columns.name') },
    { key: 'project', label: t('tasks.columns.project') },
    { key: 'estimate', label: t('tasks.columns.estimate') },
    { key: 'effort', label: t('tasks.columns.effort') },
    { key: 'remaining', label: t('tasks.columns.remaining') },
    { key: 'assignees', label: t('tasks.columns.assignees') },
    { key: 'start', label: t('tasks.columns.start') },
    { key: 'end', label: t('tasks.columns.end') },
    { key: 'status', label: t('tasks.columns.status') },
  ];
  return (
    <div
      className="sticky left-0 z-30 flex h-full items-end border-r border-line-strong bg-surface pb-1.5"
      style={{ width: TABLE_WIDTH, minWidth: TABLE_WIDTH }}
    >
      {labels.map(({ key, label }) => (
        <span
          key={key}
          className={`truncate px-1.5 font-display text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint ${
            ['estimate', 'effort', 'remaining', 'start', 'end'].includes(key) ? 'text-right' : ''
          }`}
          style={{ width: COLS[key] }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function HeaderTimescale({ scale }: { scale: ReturnType<typeof buildTimeScale> }) {
  const top = topTicks(scale);
  const bottom = bottomTicks(scale);
  return (
    <svg width={scale.width} height={HEADER_HEIGHT} className="shrink-0">
      {top.map((tick, i) => (
        <g key={`t${i}`}>
          <line
            x1={tick.x}
            x2={tick.x}
            y1={4}
            y2={HEADER_HEIGHT}
            stroke="var(--color-line)"
          />
          <text
            x={tick.x + 6}
            y={16}
            fontSize={11}
            fontWeight={600}
            fill="var(--color-ink-soft)"
            className="font-display"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {bottom.map((tick, i) => (
        <g key={`b${i}`}>
          <line
            x1={tick.x}
            x2={tick.x}
            y1={26}
            y2={HEADER_HEIGHT}
            stroke="var(--color-line)"
            opacity={0.7}
          />
          <text
            x={tick.x + (scale.zoom === 'day' ? tick.width / 2 : 4)}
            y={38}
            fontSize={10}
            fill="var(--color-ink-faint)"
            textAnchor={scale.zoom === 'day' ? 'middle' : 'start'}
            className="font-mono"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
