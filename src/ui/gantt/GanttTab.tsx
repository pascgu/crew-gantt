import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { todayIso } from '@/core/calendar/dates';
import { constrainingChain } from '@/core/scheduler/links';
import type { IsoDate, ZoomLevel } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { useConflictsByTask, useSchedule } from '@/state/schedule';
import {
  addTask,
  collapseAll,
  deleteTask,
  deleteTasks,
  expandAll,
  indentTask,
  indentTasks,
  moveTaskDown,
  moveTaskUp,
  moveTasksDown,
  moveTasksUp,
  outdentTask,
  outdentTasks,
  setZoom,
} from '@/state/taskActions';
import { useProposal } from '@/state/proposalActions';
import { usePersistedState } from '@/ui/common/persist';
import { IconChevronDown, IconChevronRight, IconFilter, IconPlus } from '@/ui/common/icons';
import { ContextMenu } from '@/ui/common/ContextMenu';
import { TaskRowCells, type DropIndicator } from '@/ui/table/TaskRowCells';
import { TABLE_WIDTH } from '@/ui/table/columns';
import { useTableStore } from '@/ui/table/tableStore';
import { useUiStore } from '@/state/uiStore';
import { t } from '@/i18n/fr';
import { GanttChart } from './GanttChart';
import { GanttControls } from './GanttControls';
import { TaskPanel } from './TaskPanel';
import { WorkloadGauges, WorkloadNamesOverlay } from './WorkloadPanel';
import { useGanttRows } from './rows';
import {
  bottomTicks,
  buildTimeScale,
  dayHoverTicks,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  topTicks,
  weekHoverTicks,
} from './timescale';

const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const OVERSCAN = 6;
const EXTEND_THRESHOLD = 200;
const EXTEND_CHUNK: Record<ZoomLevel, number> = { day: 60, week: 120, month: 365, quarter: 730 };

export function GanttTab() {
  const schedule = useSchedule();
  const rows = useGanttRows();
  const conflictsByTask = useConflictsByTask();
  const zoom = useAppStore((s) => s.file.ui.zoom);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectedTaskIds = useAppStore((s) => s.selectedTaskIds);
  const selectTask = useAppStore((s) => s.selectTask);
  const toggleTaskSelection = useAppStore((s) => s.toggleTaskSelection);
  const setSelectedRange = useAppStore((s) => s.setSelectedRange);
  const tasks = useAppStore((s) => s.file.tasks);
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);

  const tableColWidths = useTableStore((s) => s.widths);
  const tableColHidden = useTableStore((s) => s.hidden);
  const TABLE_TRAIL = 14; // espace après la dernière colonne pour attraper sa poignée de resize
  const tableInnerWidth = useMemo(
    () =>
      (Object.keys(tableColWidths) as (keyof typeof tableColWidths)[])
        .filter((k) => !tableColHidden.includes(k))
        .reduce((s, k) => s + tableColWidths[k], 0) + TABLE_TRAIL,
    [tableColWidths, tableColHidden],
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [viewportW, setViewportW] = useState(800);
  /** Hauteur du corps de liste (pleine hauteur, sans bandeau de charge). */
  const [tableViewportH, setTableViewportH] = useState(800);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [workloadMenu, setWorkloadMenu] = useState<{ x: number; y: number } | null>(null);
  const [workloadFilter, setWorkloadFilter] = useState<DOMRect | null>(null);

  // Préférences d'affichage (hors fichier : ne marquent pas dirty)
  const [tableWidth, setTableWidth] = usePersistedState('crewgantt.ui.tableWidth', TABLE_WIDTH);
  const [workloadOpen, setWorkloadOpen] = usePersistedState('crewgantt.ui.workloadOpen', true);
  const [workloadRowH, setWorkloadRowH] = usePersistedState('crewgantt.ui.workloadRowH', 28);
  const [workloadHidden, setWorkloadHidden] = usePersistedState(
    'crewgantt.ui.workloadHidden',
    [] as string[],
  );

  // Ressources réellement affichées dans le bandeau de charge (filtre utilisateur).
  const visibleResources = useMemo(
    () => resources.filter((r) => !workloadHidden.includes(r.id)),
    [resources, workloadHidden],
  );

  const proposal = useProposal();
  const baselines = useAppStore((s) => s.file.baselines);
  const activeBl = baselines.find((b) => b.active) ?? null;

  const proposalByTask = useMemo(
    () =>
      proposal ? new Map(proposal.changes.map((c) => [c.taskId, c])) : undefined,
    [proposal],
  );

  const [extend, setExtend] = useState({ before: 0, after: 0 });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tableBodyRef = useRef<HTMLDivElement | null>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const workloadInnerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const tableResizeObserver = useRef<ResizeObserver | null>(null);
  const hasAutoScrolled = useRef(false);
  const zoomAnchor = useRef<{ date: IsoDate; offsetX: number } | null>(null);
  const scrollAnchor = useRef<{ date: IsoDate; offsetX: number } | null>(null);

  // Mesure du viewport pour la virtualisation des lignes et calcul todayVisible.
  const attachScroll = (el: HTMLDivElement | null) => {
    scrollRef.current = el;
    resizeObserver.current?.disconnect();
    if (el) {
      setViewportH(el.clientHeight);
      setViewportW(el.clientWidth);
      resizeObserver.current = new ResizeObserver(() => {
        setViewportH(el.clientHeight);
        setViewportW(el.clientWidth);
      });
      resizeObserver.current.observe(el);
    }
  };

  // Mesure du corps de liste : sert à calculer l'espace bas qui compense le bandeau de charge.
  const attachTableBody = (el: HTMLDivElement | null) => {
    tableBodyRef.current = el;
    tableResizeObserver.current?.disconnect();
    if (el) {
      setTableViewportH(el.clientHeight);
      tableResizeObserver.current = new ResizeObserver(() => {
        setTableViewportH(el.clientHeight);
      });
      tableResizeObserver.current.observe(el);
    }
  };

  const today = todayIso();
  const scale = useMemo(
    () => buildTimeScale(schedule.planSpan, zoom, today, extend),
    [schedule.planSpan, zoom, today, extend],
  );

  const windowStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const windowEnd = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );

  // Espace bas de la liste = écart de viewport avec le Gantt (= hauteur du bandeau de charge),
  // pour que la liste puisse scroller la même distance et rester alignée jusqu'à la dernière ligne.
  const bottomSpacer = Math.max(0, tableViewportH - viewportH);

  const selectedTask = panelOpen ? tasks.find((tk) => tk.id === selectedTaskId) : undefined;

  /** Plage d'ids visibles entre deux lignes (inclus), dans l'ordre du tableau. */
  const rangeBetween = (anchorId: string, targetId: string): string[] => {
    const a = rows.findIndex((r) => r.task.id === anchorId);
    const b = rows.findIndex((r) => r.task.id === targetId);
    if (a < 0 || b < 0) return [targetId];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return rows.slice(lo, hi + 1).map((r) => r.task.id);
  };

  /** Clic sur une ligne : simple / Ctrl (toggle) / Maj (plage depuis l'ancre). */
  const handleSelectRow = (taskId: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) {
      toggleTaskSelection(taskId);
    } else if (e.shiftKey) {
      const anchor = selectedTaskId ?? taskId;
      setSelectedRange(rangeBetween(anchor, taskId), anchor);
    } else {
      selectTask(taskId);
    }
  };

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

  const todayX = scale.x(today);
  const todayVisible = todayX >= scrollLeft && todayX <= scrollLeft + viewportW;

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = scale.x(today) - el.clientWidth * 0.3;
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

    // Extension infinie : étendre la timescale si le scroll approche d'un bord
    const chunk = EXTEND_CHUNK[zoom];
    if (el.scrollLeft < EXTEND_THRESHOLD && !scrollAnchor.current) {
      scrollAnchor.current = { date: scale.dateAt(el.scrollLeft), offsetX: 0 };
      setExtend((prev) => ({ ...prev, before: prev.before + chunk }));
    } else if (el.scrollLeft + el.clientWidth > scale.width - EXTEND_THRESHOLD && !scrollAnchor.current) {
      setExtend((prev) => ({ ...prev, after: prev.after + chunk }));
    }
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
    if (!el) return;
    const za = zoomAnchor.current;
    if (za) {
      zoomAnchor.current = null;
      el.scrollLeft = scale.x(za.date) - za.offsetX;
      return;
    }
    const sa = scrollAnchor.current;
    if (sa) {
      scrollAnchor.current = null;
      el.scrollLeft = scale.x(sa.date) - sa.offsetX;
      return;
    }
    // Centrage initial sur aujourd'hui (une seule fois à l'ouverture de l'onglet)
    if (!hasAutoScrolled.current) {
      hasAutoScrolled.current = true;
      el.scrollLeft = scale.x(today) - el.clientWidth * 0.3;
    }
  }, [scale, today]);

  // Le div interne du bandeau de charge est démonté quand replié : à sa réapparition,
  // réappliquer le décalage horizontal courant (sinon les jauges virtualisées rendent
  // hors écran jusqu'au prochain scroll).
  useLayoutEffect(() => {
    const inner = workloadInnerRef.current;
    const el = scrollRef.current;
    if (workloadOpen && inner && el) {
      inner.style.transform = `translateX(${-el.scrollLeft}px)`;
    }
  }, [workloadOpen, scale]);

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
      const multi = selectedTaskIds.length > 1;
      // Ctrl+flèches : déplacer/indenter (ALT évité car Alt+←/→ = retour navigateur)
      if ((e.ctrlKey || e.metaKey) && sel) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (multi) moveTasksUp(selectedTaskIds);
          else moveTaskUp(sel);
          return;
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (multi) moveTasksDown(selectedTaskIds);
          else moveTaskDown(sel);
          return;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (multi) indentTasks(selectedTaskIds);
          else indentTask(sel);
          return;
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (multi) outdentTasks(selectedTaskIds);
          else outdentTask(sel);
          return;
        }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && rows.length > 0) {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        // Maj+flèche : le curseur (dernière ligne sélectionnée) bouge, l'ancre reste fixe.
        const cursorId = e.shiftKey ? (selectedTaskIds[selectedTaskIds.length - 1] ?? sel) : sel;
        const idx = rows.findIndex((r) => r.task.id === cursorId);
        const nextIdx = idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + dir));
        const nextId = rows[nextIdx]!.task.id;
        if (e.shiftKey && sel) setSelectedRange(rangeBetween(sel, nextId), sel);
        else selectTask(nextId);
        const el = scrollRef.current;
        if (el) {
          const y = nextIdx * ROW_HEIGHT;
          if (y < el.scrollTop) el.scrollTop = y;
          else if (y + ROW_HEIGHT > el.scrollTop + el.clientHeight)
            el.scrollTop = y + ROW_HEIGHT - el.clientHeight;
        }
      } else if (e.key === 'ArrowLeft' && sel) {
        const task = tasks.find((tk) => tk.id === sel);
        if (task?.parentId) {
          e.preventDefault();
          selectTask(task.parentId);
          const el = scrollRef.current;
          if (el) {
            const parentIdx = rows.findIndex((r) => r.task.id === task.parentId);
            if (parentIdx >= 0) {
              const y = parentIdx * ROW_HEIGHT;
              if (y < el.scrollTop) el.scrollTop = y;
              else if (y + ROW_HEIGHT > el.scrollTop + el.clientHeight)
                el.scrollTop = y + ROW_HEIGHT - el.clientHeight;
            }
          }
        }
      } else if (e.key === 'Enter' && sel) {
        e.preventDefault();
        openPanel(sel);
      } else if (e.key === 'Insert') {
        e.preventDefault();
        const newId = addTask(sel ? { afterId: sel } : {});
        selectTask(newId);
        useUiStore.getState().setEditingTaskId(newId);
      } else if (e.key === 'Delete' && sel) {
        if (multi) {
          if (window.confirm(t('tasks.confirmDeleteMany', { count: selectedTaskIds.length }))) {
            deleteTasks(selectedTaskIds);
            selectTask(null);
          }
        } else {
          const task = tasks.find((tk) => tk.id === sel);
          if (task && window.confirm(t('tasks.confirmDelete', { name: task.name }))) deleteTask(sel);
        }
      } else if (e.key === 'Escape') {
        if (panelOpen) setPanelOpen(false);
        else selectTask(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedTaskId, selectedTaskIds, panelOpen, tasks]);

  // ——— Splitter table ↔ gantt et poignée de hauteur de charge ———

  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  const startSplit = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = tableWidth;
    const containerW = splitContainerRef.current?.clientWidth ?? 1200;
    const onMove = (ev: PointerEvent) => {
      setTableWidth(Math.max(0, Math.min(containerW - 6, startW + ev.clientX - startX)));
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
    const count = Math.max(1, visibleResources.length);
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

  const hasResources = resources.length > 0;
  const workloadH = visibleResources.length * workloadRowH;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {projects.length === 0 ? (
          <div className="p-8 text-sm text-ink-faint">{t('tasks.noProject')}</div>
        ) : (
          <div ref={splitContainerRef} className="flex min-h-0 flex-1">
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
              <div ref={attachTableBody} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
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
                  <div className="relative" style={{ height: rows.length * ROW_HEIGHT + bottomSpacer, width: tableInnerWidth }}>
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
                          onSelectRow={handleSelectRow}
                          hovered={hoveredTaskId === row.task.id}
                          onHover={setHoveredTaskId}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ——— Splitter ——— */}
            <div
              className="w-1.5 shrink-0 cursor-col-resize border-x border-line bg-paper-deep transition hover:bg-accent/40"
              onPointerDown={startSplit}
              onDoubleClick={() => setTableWidth((splitContainerRef.current?.clientWidth ?? 1200) / 2)}
            />

            {/* ——— Volet Gantt ——— */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <GanttControls
                zoom={zoom}
                todayVisible={todayVisible}
                onToday={scrollToToday}
              />
              {/* En-tête timescale, synchronisé en translateX */}
              <div
                className="shrink-0 overflow-hidden border-b border-line bg-surface"
                style={{ height: HEADER_HEIGHT }}
              >
                <div ref={headerInnerRef} style={{ width: scale.width, willChange: 'transform' }}>
                  <HeaderTimescale scale={scale} visibleLeft={scrollLeft} visibleRight={scrollLeft + viewportW} />
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
                  minHeight={viewportH}
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
                  <div className="absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1">
                    <button
                      className="rounded-full border border-line bg-surface p-0.5 text-ink-soft shadow-sm transition hover:border-accent hover:text-accent"
                      title={workloadOpen ? t('workload.hide') : t('workload.show')}
                      aria-label={workloadOpen ? t('workload.hide') : t('workload.show')}
                      onClick={() => setWorkloadOpen((v) => !v)}
                    >
                      <IconChevronDown size={12} className={workloadOpen ? '' : 'rotate-180'} />
                    </button>
                    {workloadOpen && (
                      <button
                        className={`rounded-full border bg-surface p-0.5 shadow-sm transition hover:border-accent hover:text-accent ${
                          workloadHidden.length > 0
                            ? 'border-accent text-accent'
                            : 'border-line text-ink-soft'
                        }`}
                        title={t('workload.filter')}
                        aria-label={t('workload.filter')}
                        onClick={(e) =>
                          setWorkloadFilter((prev) =>
                            prev ? null : (e.currentTarget as HTMLElement).getBoundingClientRect(),
                          )
                        }
                      >
                        <IconFilter size={11} />
                      </button>
                    )}
                  </div>
                  {workloadOpen ? (
                    <div className="relative overflow-hidden" style={{ height: workloadH }}>
                      <WorkloadNamesOverlay schedule={schedule} rowH={workloadRowH} resources={visibleResources} />
                      <div
                        ref={workloadInnerRef}
                        style={{ width: scale.width, willChange: 'transform' }}
                      >
                        <WorkloadGauges
                          schedule={schedule}
                          scale={scale}
                          rowH={workloadRowH}
                          resources={visibleResources}
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
                  {workloadFilter && createPortal(
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setWorkloadFilter(null)} />
                      <div
                        className="fixed z-50 flex max-h-72 min-w-44 flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-float"
                        style={{
                          left: Math.min(workloadFilter.left, window.innerWidth - 200),
                          // Le bandeau de charge est en bas de l'écran : ouvrir le popover vers le haut.
                          bottom: window.innerHeight - workloadFilter.top + 4,
                        }}
                      >
                        {resources.map((r) => {
                          const shown = !workloadHidden.includes(r.id);
                          return (
                            <label key={r.id} className="flex cursor-pointer items-center gap-2 text-[12px]">
                              <input
                                type="checkbox"
                                checked={shown}
                                onChange={() =>
                                  setWorkloadHidden((prev) =>
                                    shown ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                                  )
                                }
                              />
                              {r.name}
                            </label>
                          );
                        })}
                        {workloadHidden.length > 0 && (
                          <button
                            className="mt-1 text-left text-[11px] text-ink-faint hover:text-ink"
                            onClick={() => setWorkloadHidden([])}
                          >
                            {t('workload.showAll')}
                          </button>
                        )}
                      </div>
                    </>,
                    document.body,
                  )}
                </div>
              )}
            </div>
          </div>
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
  const { widths, hidden, setWidth, toggleHidden, setStatusFilter, setAssigneeFilter, setNameQuery, statusFilter, assigneeFilter, nameQuery } = useTableStore();
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);
  const projectFilter = useAppStore((s) => s.file.ui.projectFilter);
  const setProjectFilter = useAppStore((s) => s.mutate);
  const [filterCol, setFilterCol] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);
  const [visMenu, setVisMenu] = useState(false);
  const [visAnchor, setVisAnchor] = useState<DOMRect | null>(null);

  type ColDef = { key: string; label: string; filterable?: boolean };
  const labels: ColDef[] = [
    { key: 'name', label: t('tasks.columns.name') },
    { key: 'project', label: t('tasks.columns.project'), filterable: true },
    { key: 'scheduling', label: t('tasks.columns.scheduling') },
    { key: 'estimate', label: t('tasks.columns.estimate') },
    { key: 'effort', label: t('tasks.columns.effort') },
    { key: 'realized', label: t('tasks.columns.realized') },
    { key: 'remaining', label: t('tasks.columns.remaining') },
    { key: 'progress', label: t('tasks.columns.progress') },
    { key: 'assignees', label: t('tasks.columns.assignees'), filterable: true },
    { key: 'start', label: t('tasks.columns.start') },
    { key: 'end', label: t('tasks.columns.end') },
    { key: 'status', label: t('tasks.columns.status'), filterable: true },
  ];

  const visibleLabels = labels.filter((l) => !hidden.includes(l.key as keyof typeof widths));
  const totalWidth = visibleLabels.reduce((s, l) => s + widths[l.key as keyof typeof widths], 0);

  const startColResize = (e: ReactPointerEvent<HTMLDivElement>, col: string) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[col as keyof typeof widths];
    const onMove = (ev: PointerEvent) => setWidth(col as keyof typeof widths, startW + ev.clientX - startX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const hasFilter = (col: string) => {
    if (col === 'name') return nameQuery !== '';
    if (col === 'status') return statusFilter !== null && statusFilter.length > 0;
    if (col === 'assignees') return assigneeFilter !== null && assigneeFilter.length > 0;
    if (col === 'project') return projectFilter !== null && projectFilter.length > 0;
    return false;
  };

  const openFilter = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    if (filterCol === key) { setFilterCol(null); setFilterAnchor(null); }
    else { setFilterCol(key); setFilterAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); }
  };

  const closeAll = () => { setFilterCol(null); setFilterAnchor(null); setVisMenu(false); setVisAnchor(null); };

  const filterPopover = filterCol && filterAnchor ? createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={closeAll} />
      <div
        className="fixed z-50 min-w-40 rounded-lg border border-line bg-surface shadow-float"
        style={{ left: filterAnchor.left, top: filterAnchor.bottom + 2 }}
      >
        {filterCol === 'name' && (
          <div className="p-2">
            <input
              autoFocus
              className="w-full rounded border border-line px-2 py-1 text-[12px] outline-none focus:border-accent"
              placeholder={t('columns.filterAll')}
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
            {nameQuery && <button className="mt-1 text-[11px] text-ink-faint hover:text-ink" onClick={() => { setNameQuery(''); closeAll(); }}>✕ Effacer</button>}
          </div>
        )}
        {filterCol === 'status' && (
          <div className="p-2 flex flex-col gap-1">
            {(['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const).map((s) => {
              const checked = (statusFilter ?? []).includes(s);
              return (
                <label key={s} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => {
                    const cur = statusFilter ?? [];
                    const next = checked ? cur.filter((v) => v !== s) : [...cur, s];
                    setStatusFilter(next.length > 0 ? next : null);
                  }} />
                  {t(`tasks.status.${s}`)}
                </label>
              );
            })}
            {statusFilter && <button className="mt-1 text-left text-[11px] text-ink-faint hover:text-ink" onClick={() => setStatusFilter(null)}>✕ Effacer</button>}
          </div>
        )}
        {filterCol === 'assignees' && (
          <div className="p-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
            {resources.map((r) => {
              const checked = (assigneeFilter ?? []).includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => {
                    const cur = assigneeFilter ?? [];
                    const next = checked ? cur.filter((v) => v !== r.id) : [...cur, r.id];
                    setAssigneeFilter(next.length > 0 ? next : null);
                  }} />
                  {r.name}
                </label>
              );
            })}
            {assigneeFilter && <button className="mt-1 text-left text-[11px] text-ink-faint hover:text-ink" onClick={() => setAssigneeFilter(null)}>✕ Effacer</button>}
          </div>
        )}
        {filterCol === 'project' && (
          <div className="p-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
            {projects.filter((p) => !p.archived).map((p) => {
              const cur = projectFilter ?? [];
              const checked = cur.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => {
                    const next = checked ? cur.filter((v) => v !== p.id) : [...cur, p.id];
                    setProjectFilter((f) => { f.ui.projectFilter = next.length > 0 ? next : null; });
                  }} />
                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: p.color }} />
                  {p.name}
                </label>
              );
            })}
            {projectFilter && <button className="mt-1 text-left text-[11px] text-ink-faint hover:text-ink" onClick={() => setProjectFilter((f) => { f.ui.projectFilter = null; })}>✕ Effacer</button>}
          </div>
        )}
      </div>
    </>,
    document.body,
  ) : null;

  const visPopover = visMenu && visAnchor ? createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={closeAll} />
      <div
        className="fixed z-50 min-w-36 rounded-lg border border-line bg-surface p-2 shadow-float"
        style={{ right: window.innerWidth - visAnchor.right, top: visAnchor.bottom + 2 }}
      >
        {labels.filter((l) => l.key !== 'name').map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 py-0.5 text-[12px] cursor-pointer">
            <input type="checkbox" checked={!hidden.includes(key as keyof typeof widths)} onChange={() => toggleHidden(key as keyof typeof widths)} />
            {label}
          </label>
        ))}
        <button className="mt-1 w-full text-left text-[11px] text-ink-faint hover:text-ink" onClick={() => { useTableStore.getState().resetWidths(); closeAll(); }}>{t('columns.resetWidths')}</button>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative h-full bg-surface">
      {/* Colonnes : déborde à droite (clippé par le parent overflow-hidden) */}
      <div className="flex h-full items-end pb-1" style={{ width: totalWidth + 14 }}>
        {visibleLabels.map(({ key, label, filterable }) => {
          const w = widths[key as keyof typeof widths];
          const right = ['estimate', 'effort', 'remaining', 'start', 'end'].includes(key);
          const active = hasFilter(key);
          return (
            <div
              key={key}
              className="relative flex shrink-0 items-center overflow-hidden border-r border-line/40"
              style={{ width: w }}
            >
              {key === 'name' ? (
                <span className="flex items-center gap-0 pl-1 overflow-hidden w-full pr-4">
                  <button className="rounded p-0 text-ink-faint transition hover:text-ink shrink-0" title={t('tasks.expandAll')} onClick={expandAll}><IconChevronDown size={10} /></button>
                  <button className="rounded p-0 text-ink-faint transition hover:text-ink shrink-0" title={t('tasks.collapseAll')} onClick={collapseAll}><IconChevronRight size={10} /></button>
                  <span className="shrink-0 px-0.5 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
                  <input
                    className="ml-1 min-w-0 flex-1 rounded border border-line/60 bg-transparent px-1 text-[10px] text-ink outline-none focus:border-accent placeholder:text-ink-faint/60"
                    placeholder={t('columns.searchTask')}
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                  />
                  {nameQuery && (
                    <button className="ml-0.5 shrink-0 text-[9px] text-ink-faint hover:text-ink" onClick={() => setNameQuery('')}>✕</button>
                  )}
                </span>
              ) : (
                <span className={`flex-1 truncate px-1.5 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint ${right ? 'text-right' : ''}`}>
                  {label}
                </span>
              )}
              {filterable && (
                <button
                  className={`mr-0.5 shrink-0 rounded p-0.5 transition ${active ? 'text-accent' : 'text-ink-faint hover:text-ink'}`}
                  title={t('columns.filter')}
                  onClick={(e) => openFilter(e, key)}
                >
                  <IconFilter size={11} />
                </button>
              )}
              {/* Poignée de redimension (visible via border-r sur la cellule) */}
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/50"
                onPointerDown={(e) => startColResize(e, key)}
              />
            </div>
          );
        })}
        {/* Espace de fin pour attraper la poignée de la dernière colonne */}
        <div style={{ width: 14, flexShrink: 0 }} />
      </div>
      {/* Bouton « … » sticky — toujours visible hors du flux des colonnes */}
      <div className="absolute right-0 top-0 h-full flex items-center bg-surface pl-0.5 z-10">
        <button
          className="rounded px-1 py-0.5 text-[10px] text-ink-faint transition hover:text-ink"
          title={t('columns.choose')}
          onClick={(e) => {
            e.stopPropagation();
            if (visMenu) { setVisMenu(false); setVisAnchor(null); }
            else { setVisMenu(true); setVisAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); }
          }}
        >
          …
        </button>
      </div>
      {filterPopover}
      {visPopover}
    </div>
  );
}

function HeaderTimescale({
  scale,
  visibleLeft,
  visibleRight,
}: {
  scale: ReturnType<typeof buildTimeScale>;
  visibleLeft: number;
  visibleRight: number;
}) {
  const MARGIN = 400;
  const vl = visibleLeft - MARGIN;
  const vr = visibleRight + MARGIN;

  const top = topTicks(scale);
  const bottom = bottomTicks(scale);
  const perDay = scale.zoom === 'day' || scale.zoom === 'week';
  const dayHovers = dayHoverTicks(scale);

  // Lazy filtering for dense tick types (day/week zoom)
  const visBottom = perDay ? bottom.filter((t) => t.x + t.width >= vl && t.x <= vr) : bottom;
  const visHovers = dayHovers.filter((d) => d.x + d.width >= vl && d.x <= vr);
  const visWeekHovers = weekHoverTicks(scale).filter((w) => w.x + w.width >= vl && w.x <= vr);

  return (
    <svg width={scale.width} height={HEADER_HEIGHT} className="shrink-0">
      {top.map((tick, i) => (
        <g key={`t${i}`}>
          <line
            x1={tick.x}
            x2={tick.x}
            y1={3}
            y2={HEADER_HEIGHT}
            stroke="var(--color-line)"
          />
          <text
            x={tick.x + 5}
            y={13}
            fontSize={10.5}
            fontWeight={600}
            fill="var(--color-ink-soft)"
            className="font-display"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {visBottom.map((tick, i) => (
        <g key={`b${i}`}>
          {(scale.zoom !== 'week' || tick.emphasis) && (
            <line
              x1={tick.x}
              x2={tick.x}
              y1={18}
              y2={HEADER_HEIGHT}
              stroke="var(--color-line)"
              opacity={0.7}
            />
          )}
          <text
            x={tick.x + (perDay ? tick.width / 2 : 4)}
            y={29}
            fontSize={scale.zoom === 'week' ? 8 : 9.5}
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
      {visWeekHovers.map((w, i) => (
        <rect key={`w${i}`} x={w.x} y={18} width={w.width} height={HEADER_HEIGHT - 18} fill="transparent">
          <title>{w.label}</title>
        </rect>
      ))}
      {/* date complète DD/MM/YYYY au survol du jour (zoom jour et semaine) */}
      {visHovers.map((d, i) => (
        <rect key={`d${i}`} x={d.x} y={0} width={d.width} height={HEADER_HEIGHT} fill="transparent">
          <title>{d.label}</title>
        </rect>
      ))}
    </svg>
  );
}
