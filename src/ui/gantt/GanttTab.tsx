import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { todayIso } from '@/core/calendar/dates';
import { constrainingChain } from '@/core/scheduler/links';
import type { IsoDate, ZoomLevel } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { useConflicts, useConflictsByTask, useSchedule } from '@/state/schedule';
import {
  addTask,
  collapseAll,
  deleteTask,
  expandAll,
  indentTask,
  moveTaskDown,
  moveTaskUp,
  outdentTask,
  setZoom,
} from '@/state/taskActions';
import { proposalKey, useProposal } from '@/state/proposalActions';
import { exportGanttPng, exportTasksCsv } from '@/io/export';
import { defaultFileName } from '@/io/fileAccess';
import { ProjectFilter } from '@/ui/app/ProjectFilter';
import { HelpButton } from '@/ui/app/HelpButton';
import { usePersistedState } from '@/ui/common/persist';
import { IconChevronDown, IconChevronRight, IconPlus, IconWarning } from '@/ui/common/icons';
import { ContextMenu } from '@/ui/common/ContextMenu';
import { ProposalBar } from '@/ui/proposal/ProposalBar';
import { ImpactsPanel } from '@/ui/proposal/ImpactsPanel';
import { ConflictsPanel } from '@/ui/proposal/ConflictsPanel';
import { TaskRowCells, type DropIndicator } from '@/ui/table/TaskRowCells';
import { COLS, TABLE_WIDTH } from '@/ui/table/columns';
import { t } from '@/i18n/fr';
import { GanttChart } from './GanttChart';
import { GanttControls } from './GanttControls';
import { TaskPanel } from './TaskPanel';
import { WorkloadGauges, WorkloadNames } from './WorkloadPanel';
import { useGanttRows } from './rows';
import {
  bottomTicks,
  buildTimeScale,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  topTicks,
  weekHoverTicks,
} from './timescale';

const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const OVERSCAN = 6;
const MIN_TABLE_WIDTH = 280;

export function GanttTab() {
  const schedule = useSchedule();
  const rows = useGanttRows();
  const conflictsByTask = useConflictsByTask();
  const zoom = useAppStore((s) => s.file.ui.zoom);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectTask = useAppStore((s) => s.selectTask);
  const tasks = useAppStore((s) => s.file.tasks);
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);
  const teamName = useAppStore((s) => s.file.team.name);
  const cycle = schedule.cycle;

  const [panelOpen, setPanelOpen] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [showImpacts, setShowImpacts] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [dismissedProposal, setDismissedProposal] = useState('');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [workloadMenu, setWorkloadMenu] = useState<{ x: number; y: number } | null>(null);

  // Préférences d'affichage (hors fichier : ne marquent pas dirty)
  const [tableWidth, setTableWidth] = usePersistedState('crewgantt.ui.tableWidth', TABLE_WIDTH);
  const [workloadOpen, setWorkloadOpen] = usePersistedState('crewgantt.ui.workloadOpen', true);
  const [workloadRowH, setWorkloadRowH] = usePersistedState('crewgantt.ui.workloadRowH', 28);

  const proposal = useProposal();
  const { active: activeConflicts } = useConflicts();
  const baselines = useAppStore((s) => s.file.baselines);
  const activeBl = baselines.find((b) => b.active) ?? null;

  const proposalVisible = proposal !== null && proposalKey(proposal) !== dismissedProposal;
  const proposalByTask = useMemo(
    () =>
      proposalVisible && proposal
        ? new Map(proposal.changes.map((c) => [c.taskId, c]))
        : undefined,
    [proposal, proposalVisible],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tableBodyRef = useRef<HTMLDivElement | null>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const workloadInnerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const zoomAnchor = useRef<{ date: IsoDate; offsetX: number } | null>(null);

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

  // Chaîne contraignante : sélectionner un jalon surligne ce qui détermine sa date.
  const chain = useMemo(() => {
    const selected = tasks.find((tk) => tk.id === selectedTaskId);
    if (!selected || selected.type !== 'milestone') return null;
    const steps = constrainingChain(schedule.linkInputs, schedule.earliestByTask, selected.id);
    if (steps.length <= 1) return null;
    const ids = new Set(steps.map((s) => s.taskId));
    const pairs = new Set<string>();
    for (let i = 1; i < steps.length; i++) {
      pairs.add(`${steps[i - 1]!.taskId}:${steps[i]!.taskId}`);
    }
    return { ids, pairs };
  }, [tasks, selectedTaskId, schedule]);

  const openPanel = (taskId: string) => {
    selectTask(taskId);
    setPanelOpen(true);
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = scale.x(today) - el.clientWidth / 2;
  };

  // ——— Synchronisation : le conteneur du chart est le scroll master ———

  const onChartScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (headerInnerRef.current)
      headerInnerRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
    if (workloadInnerRef.current)
      workloadInnerRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
    if (tableBodyRef.current) tableBodyRef.current.scrollTop = el.scrollTop;
    setScrollTop(el.scrollTop);
    setScrollLeft(el.scrollLeft);
  };

  const panBy = (dx: number, dy: number) => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft += dx;
      el.scrollTop += dy;
    }
  };

  // Ctrl+molette : zoomer en gardant la date sous le curseur.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + (e.deltaY > 0 ? 1 : -1)];
      if (!next) return;
      const offsetX = e.clientX - el.getBoundingClientRect().left;
      zoomAnchor.current = { date: scale.dateAt(el.scrollLeft + offsetX), offsetX };
      setZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, scale]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchor.current;
    if (el && anchor) {
      zoomAnchor.current = null;
      el.scrollLeft = scale.x(anchor.date) - anchor.offsetX;
    }
  }, [scale]);

  // ——— Clavier : navigation, ALT+flèches, Entrée/Suppr/Échap ———

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target !== null && target.isContentEditable);
      if (typing) return;
      const sel = selectedTaskId;
      if (e.altKey && sel) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveTaskUp(sel);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveTaskDown(sel);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          indentTask(sel);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          outdentTask(sel);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && rows.length > 0) {
        e.preventDefault();
        const idx = rows.findIndex((r) => r.task.id === sel);
        const nextIdx =
          idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)));
        selectTask(rows[nextIdx]!.task.id);
        const el = scrollRef.current;
        if (el) {
          const y = nextIdx * ROW_HEIGHT;
          if (y < el.scrollTop) el.scrollTop = y;
          else if (y + ROW_HEIGHT > el.scrollTop + el.clientHeight)
            el.scrollTop = y + ROW_HEIGHT - el.clientHeight;
        }
      } else if (e.key === 'Enter' && sel) {
        e.preventDefault();
        openPanel(sel);
      } else if (e.key === 'Delete' && sel) {
        const task = tasks.find((tk) => tk.id === sel);
        if (task && window.confirm(t('tasks.confirmDelete', { name: task.name }))) deleteTask(sel);
      } else if (e.key === 'Escape') {
        if (panelOpen) setPanelOpen(false);
        else selectTask(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedTaskId, panelOpen, tasks]);

  // ——— Splitter table ↔ gantt et poignée de hauteur de charge ———

  const startSplit = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = tableWidth;
    const onMove = (ev: PointerEvent) => {
      setTableWidth(Math.max(MIN_TABLE_WIDTH, Math.min(TABLE_WIDTH, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startWorkloadResize = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = workloadRowH;
    const count = Math.max(1, resources.length);
    const onMove = (ev: PointerEvent) => {
      setWorkloadRowH(
        Math.max(16, Math.min(48, Math.round(startH + (startY - ev.clientY) / count))),
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const exportPng = () => {
    const svg = document.getElementById('gantt-chart-svg');
    if (svg instanceof SVGSVGElement) {
      void exportGanttPng(svg, `${defaultFileName(teamName).replace('.crewgantt.json', '')}-gantt.png`);
    }
  };
  const exportCsv = () =>
    exportTasksCsv(
      useAppStore.getState().file,
      schedule,
      `${defaultFileName(teamName).replace('.crewgantt.json', '')}-taches.csv`,
    );

  const hasResources = resources.length > 0;
  const workloadH = resources.length * workloadRowH;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Barre d'outils allégée : filtre, conflits, aide */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
          <ProjectFilter />
          <span className="flex-1" />
          <button
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition ${
              activeConflicts.length > 0
                ? 'border-danger/40 bg-danger-wash text-danger'
                : 'border-line text-ink-soft hover:text-ink'
            }`}
            onClick={() => {
              setShowConflicts((v) => !v);
              setShowImpacts(false);
            }}
          >
            <IconWarning size={12} />
            {t('conflicts.title')} ({activeConflicts.length})
          </button>
          {cycle && (
            <span className="rounded bg-danger-wash px-2 py-0.5 text-[11.5px] font-medium text-danger">
              {t('conflicts.cycle', {
                tasks: cycle
                  .map((id) => tasks.find((tk) => tk.id === id)?.name ?? id)
                  .join(' → '),
              })}
            </span>
          )}
          <HelpButton />
        </div>

        {/* Bandeau de proposition : l'outil propose, l'humain dispose */}
        {proposalVisible && proposal && (
          <ProposalBar
            proposal={proposal}
            onSeeImpacts={() => {
              setShowImpacts((v) => !v);
              setShowConflicts(false);
            }}
            onDismiss={() => setDismissedProposal(proposalKey(proposal))}
          />
        )}

        {projects.length === 0 ? (
          <div className="p-8 text-sm text-ink-faint">{t('tasks.noProject')}</div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* ——— Volet table ——— */}
            <div
              className="flex shrink-0 flex-col overflow-hidden bg-surface"
              style={{ width: tableWidth }}
              onWheel={(e) => {
                const el = scrollRef.current;
                if (el) el.scrollTop += e.deltaY;
              }}
            >
              <div
                className="shrink-0 overflow-hidden border-b border-line"
                style={{ height: HEADER_HEIGHT }}
              >
                <HeaderLeft />
              </div>
              <div ref={tableBodyRef} className="min-h-0 flex-1 overflow-hidden">
                {rows.length === 0 ? (
                  <div className="p-6 text-sm text-ink-faint">
                    <p>{t('tasks.emptyPlan')}</p>
                    <button
                      className="mt-3 flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
                      onClick={() => openPanel(addTask({}))}
                    >
                      <IconPlus size={11} /> {t('tasks.addTask')}
                    </button>
                  </div>
                ) : (
                  <div className="relative" style={{ height: rows.length * ROW_HEIGHT, width: TABLE_WIDTH }}>
                    <div style={{ transform: `translateY(${windowStart * ROW_HEIGHT}px)` }}>
                      {rows.slice(windowStart, windowEnd).map((row) => (
                        <TaskRowCells
                          key={row.task.id}
                          row={row}
                          schedule={schedule}
                          conflicts={conflictsByTask.get(row.task.id)}
                          dropIndicator={dropIndicator}
                          onDropIndicator={setDropIndicator}
                          onOpenPanel={openPanel}
                          hovered={hoveredTaskId === row.task.id}
                          onHover={setHoveredTaskId}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Noms du bandeau de charge, alignés sur les jauges */}
              {hasResources && workloadOpen && (
                <div
                  className="shrink-0 overflow-hidden border-t-2 border-line-strong"
                  style={{ height: workloadH }}
                >
                  <WorkloadNames schedule={schedule} rowH={workloadRowH} />
                </div>
              )}
              {hasResources && !workloadOpen && (
                <div className="h-2 shrink-0 border-t-2 border-line-strong" />
              )}
            </div>

            {/* ——— Splitter ——— */}
            <div
              className="w-1.5 shrink-0 cursor-col-resize border-x border-line bg-paper-deep transition hover:bg-accent/40"
              onPointerDown={startSplit}
              onDoubleClick={() => setTableWidth(TABLE_WIDTH)}
            />

            {/* ——— Volet Gantt ——— */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <GanttControls
                zoom={zoom}
                onToday={scrollToToday}
                onExportPng={exportPng}
                onExportCsv={exportCsv}
              />
              {/* En-tête timescale, synchronisé en translateX */}
              <div
                className="shrink-0 overflow-hidden border-b border-line bg-surface"
                style={{ height: HEADER_HEIGHT }}
              >
                <div ref={headerInnerRef} style={{ width: scale.width, willChange: 'transform' }}>
                  <HeaderTimescale scale={scale} />
                </div>
              </div>
              {/* Conteneur scroll : les deux ascenseurs natifs vivent ici, sous/à droite du Gantt */}
              <div ref={attachScroll} className="min-h-0 flex-1 overflow-auto" onScroll={onChartScroll}>
                <GanttChart
                  rows={rows}
                  schedule={schedule}
                  scale={scale}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  conflictTaskIds={new Set(conflictsByTask.keys())}
                  proposalByTask={proposalByTask}
                  baseline={activeBl}
                  chainTaskIds={chain?.ids}
                  chainPairs={chain?.pairs}
                  onOpenPanel={openPanel}
                  onPanBy={panBy}
                  hoveredTaskId={hoveredTaskId}
                  onHoverTask={setHoveredTaskId}
                />
              </div>
              {/* Bandeau de charge : repliable (chevron) et redimensionnable (poignée) */}
              {hasResources && (
                <div className="relative shrink-0 border-t-2 border-line-strong bg-surface">
                  {workloadOpen && (
                    <div
                      className="absolute -top-1.5 left-0 right-0 z-20 h-2.5 cursor-row-resize"
                      title={t('workload.resizeHint')}
                      onPointerDown={startWorkloadResize}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setWorkloadMenu({ x: e.clientX, y: e.clientY });
                      }}
                    />
                  )}
                  <button
                    className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-surface p-0.5 text-ink-soft shadow-sm transition hover:border-accent hover:text-accent"
                    title={workloadOpen ? t('workload.hide') : t('workload.show')}
                    aria-label={workloadOpen ? t('workload.hide') : t('workload.show')}
                    onClick={() => setWorkloadOpen((v) => !v)}
                  >
                    <IconChevronDown size={12} className={workloadOpen ? '' : 'rotate-180'} />
                  </button>
                  {workloadOpen ? (
                    <div className="overflow-hidden" style={{ height: workloadH }}>
                      <div
                        ref={workloadInnerRef}
                        style={{ width: scale.width, willChange: 'transform' }}
                      >
                        <WorkloadGauges
                          schedule={schedule}
                          scale={scale}
                          rowH={workloadRowH}
                          visibleFrom={scale.dateAt(Math.max(0, scrollLeft - 200))}
                          visibleTo={scale.dateAt(
                            Math.min(scale.width - 1, scrollLeft + window.innerWidth),
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-2" />
                  )}
                  {workloadMenu && (
                    <ContextMenu
                      x={workloadMenu.x}
                      y={workloadMenu.y}
                      entries={[
                        {
                          label: workloadOpen ? t('workload.hide') : t('workload.show'),
                          onClick: () => setWorkloadOpen((v) => !v),
                        },
                      ]}
                      onClose={() => setWorkloadMenu(null)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Panneaux flottants */}
        {showImpacts && proposal && (
          <ImpactsPanel proposal={proposal} onClose={() => setShowImpacts(false)} />
        )}
        {showConflicts && (
          <ConflictsPanel
            onClose={() => setShowConflicts(false)}
            onSelectTask={(id) => selectTask(id)}
          />
        )}
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
      className="flex h-full items-end bg-surface pb-1.5"
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
          {key === 'name' ? (
            <span className="flex items-center gap-1">
              <button
                className="rounded p-0.5 text-ink-faint transition hover:text-ink"
                title={t('tasks.collapseAll')}
                aria-label={t('tasks.collapseAll')}
                onClick={collapseAll}
              >
                <IconChevronRight size={11} />
              </button>
              <button
                className="rounded p-0.5 text-ink-faint transition hover:text-ink"
                title={t('tasks.expandAll')}
                aria-label={t('tasks.expandAll')}
                onClick={expandAll}
              >
                <IconChevronDown size={11} />
              </button>
              {label}
            </span>
          ) : (
            label
          )}
        </span>
      ))}
    </div>
  );
}

function HeaderTimescale({ scale }: { scale: ReturnType<typeof buildTimeScale> }) {
  const top = topTicks(scale);
  const bottom = bottomTicks(scale);
  const perDay = scale.zoom === 'day' || scale.zoom === 'week';
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
          {(scale.zoom !== 'week' || tick.emphasis) && (
            <line
              x1={tick.x}
              x2={tick.x}
              y1={26}
              y2={HEADER_HEIGHT}
              stroke="var(--color-line)"
              opacity={0.7}
            />
          )}
          <text
            x={tick.x + (perDay ? tick.width / 2 : 4)}
            y={38}
            fontSize={scale.zoom === 'week' ? 8.5 : 10}
            fill="var(--color-ink-faint)"
            opacity={tick.faint ? 0.45 : 1}
            fontWeight={tick.emphasis && scale.zoom === 'week' ? 700 : 400}
            textAnchor={perDay ? 'middle' : 'start'}
            className="font-mono"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {/* n° de semaine au survol (zoom semaine) */}
      {weekHoverTicks(scale).map((w, i) => (
        <rect key={`w${i}`} x={w.x} y={22} width={w.width} height={HEADER_HEIGHT - 22} fill="transparent">
          <title>{w.label}</title>
        </rect>
      ))}
    </svg>
  );
}
