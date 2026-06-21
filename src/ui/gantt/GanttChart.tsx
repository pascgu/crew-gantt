import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { addDays, diffDays, eachDay, todayIso } from '@/core/calendar/dates';
import { progressBarDays, taskProgress } from '@/core/scheduler/groups';
import { workedDaysReachedOn, workedDaysUpTo } from '@/core/scheduler/links';
import { realizedOf, remainingForEndDate, remainingOf, scheduledEffort } from '@/core/scheduler/blocks';
import type { Schedule } from '@/core/scheduler/schedule';
import type { Assignment, IsoDate, Task } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { useUiStore } from '@/state/uiStore';
import { reassignTask } from '@/state/meetingActions';
import {
  addBlockToTask,
  addLink,
  canEncloseInGroup,
  createEnclosingGroup,
  createSubtaskFromPoint,
  deleteBlock,
  dissolveGroup,
  mergeOverlappingBlocks,
  mergeWithNextBlock,
  moveBlock,
  removeLink,
  relinkSuccessor,
  resolveCycleBySplit,
  resyncRemaining,
  setBlockAssignments,
  setBlockDates,
  setTaskProgress,
  setTaskRemaining,
  shiftTasksDates,
  splitBlock,
  updateTask,
} from '@/state/taskActions';
import { applyProposalChange, applyProposalChanges } from '@/state/proposalActions';
import { darken, rgba } from '@/ui/common/color';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import { t } from '@/i18n/fr';
import type { TaskChange } from '@/core/propose/propose';
import type { Baseline, TaskLink } from '@/core/model/types';
import { ROW_HEIGHT, type TimeScale } from './timescale';
import type { GanttRow } from './rows';
import { useGanttColumnsStore } from './ganttColumnsStore';
import type { ColKey } from '@/ui/table/tableStore';
import { resourceAvatar } from '@/ui/common/Avatar';


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
  /** Si présent : re-ciblage d'un lien existant (supprimer l'ancien sur pointerUp). */
  relinkFrom?: { successorTaskId: string; linkIdx: number; link: TaskLink };
}
interface DragProgress {
  kind: 'progress';
  taskId: string;
  /** x du bord gauche de la barre de la tâche (scale.x(span.start)) */
  xStart: number;
  /** x du bord droit de la barre de la tâche (scale.xEnd(span.end)) */
  xEnd: number;
  frac: number;
}
interface DragMoveMilestone {
  kind: 'move-milestone';
  taskId: string;
  day: IsoDate;
}
interface DragMoveSelection {
  kind: 'move-selection';
  taskIds: string[];
  startX: number;
  deltaDays: number;
}
type Drag =
  | DragMove
  | DragResize
  | DragLink
  | DragProgress
  | DragMoveMilestone
  | DragMoveSelection;

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

interface AssignPopoverState {
  x: number;
  y: number;
  taskId: string;
  blockId: string;
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
  /** Clic simple dans le SVG (hors drag/pan) — permet de fermer le panneau latéral. */
  onAreaClick?: () => void;
  hoveredTaskId: string | null;
  onHoverTask: (taskId: string | null) => void;
  /** Hauteur minimale du SVG (= hauteur du viewport) pour rendre le fond pnable. */
  minHeight?: number;
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
  onAreaClick,
  hoveredTaskId,
  onHoverTask,
  minHeight,
}: GanttChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [assignPopover, setAssignPopover] = useState<AssignPopoverState | null>(null);
  const [panning, setPanning] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);
  const panRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const selectedTaskIds = useAppStore((s) => s.selectedTaskIds);
  const selectTask = useAppStore((s) => s.selectTask);
  const toggleTaskSelection = useAppStore((s) => s.toggleTaskSelection);
  const setSelectedRange = useAppStore((s) => s.setSelectedRange);
  /** La ligne `id` fait-elle partie d'une sélection multiple (≥2) ? */
  const isMultiSel = (id: string) => selectedTaskIds.length > 1 && selectedTaskIds.includes(id);

  // Validation groupée : propositions des lignes sélectionnées (survol d'un ✓ → valider tout le groupe).
  const [groupGhostHover, setGroupGhostHover] = useState(false);
  const groupChanges = useMemo(() => {
    if (!proposalByTask || selectedTaskIds.length < 2) return [] as TaskChange[];
    return selectedTaskIds
      .map((id) => proposalByTask.get(id))
      .filter((c): c is TaskChange => c != null);
  }, [proposalByTask, selectedTaskIds]);

  // Shift tenu : curseur « lien ancré » (indice du geste « depuis / vers N jours »).
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(e.type === 'keydown');
    };
    // La perte de focus (ex. un window.confirm) avale le keyup de Shift → on réinitialise.
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /** Sélectionne une nouvelle ligne et ouvre l'édition de son nom. */
  const focusNew = (id: string | null) => {
    if (!id) return;
    selectTask(id);
    useUiStore.getState().setEditingTaskId(id);
  };

  const rangeBetween = (anchorId: string, targetId: string): string[] => {
    const a = rows.findIndex((r) => r.task.id === anchorId);
    const b = rows.findIndex((r) => r.task.id === targetId);
    if (a < 0 || b < 0) return [targetId];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return rows.slice(lo, hi + 1).map((r) => r.task.id);
  };

  function handleRowClick(taskId: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
    if (e.ctrlKey || e.metaKey) {
      toggleTaskSelection(taskId);
    } else if (e.shiftKey) {
      const anchor = selectedTaskId ?? taskId;
      setSelectedRange(rangeBetween(anchor, taskId), anchor);
    } else {
      selectTask(taskId);
    }
  }
  /** Démarre le décalage horizontal groupé des lignes sélectionnées (sans toucher la sélection). */
  function startSelectionDrag(e: ReactPointerEvent) {
    e.stopPropagation();
    setDrag({ kind: 'move-selection', taskIds: selectedTaskIds, startX: e.clientX, deltaDays: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  }
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

  const height = Math.max(rows.length * ROW_HEIGHT + 8, minHeight ?? 0);
  const today = todayIso();

  function svgPoint(e: ReactPointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ——— Interactions blocs ———

  function startMove(e: ReactPointerEvent, task: Task, blockId: string) {
    if (e.button !== 0) return;
    if (!e.shiftKey && isMultiSel(task.id)) return startSelectionDrag(e);
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
    if (!e.shiftKey && isMultiSel(task.id)) return startSelectionDrag(e);
    e.stopPropagation();
    selectTask(task.id);
    if (e.ctrlKey) {
      // Ctrl = forcer le déplacement même depuis un bord de redimensionnement
      setDrag({ kind: 'move', taskId: task.id, blockId, startX: e.clientX, deltaDays: 0 });
    } else {
      setDrag({
        kind: edge === 'start' ? 'resize-start' : 'resize-end',
        taskId: task.id,
        blockId,
        day: edge === 'start' ? from : to,
        otherEdge: edge === 'start' ? to : from,
        openEnd,
      });
    }
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

  function startProgress(
    e: ReactPointerEvent,
    task: Task,
    xStart: number,
    xEnd: number,
  ) {
    if (e.button !== 0) return;
    if (!e.shiftKey && isMultiSel(task.id)) return startSelectionDrag(e);
    e.stopPropagation();
    if (e.ctrlKey) {
      // Ctrl = forcer le déplacement du premier bloc
      const resolved = [...(schedule.resolvedByTask.get(task.id) ?? [])].sort((a, b) =>
        a.from.localeCompare(b.from),
      );
      const blockId = resolved[0]?.block.id;
      if (blockId) {
        setDrag({ kind: 'move', taskId: task.id, blockId, startX: e.clientX, deltaDays: 0 });
        (e.target as Element).setPointerCapture(e.pointerId);
      }
      return;
    }
    const frac = Math.max(0, Math.min(1, (svgPoint(e).x - xStart) / (xEnd - xStart)));
    setDrag({ kind: 'progress', taskId: task.id, xStart, xEnd, frac });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function startMilestoneDrag(e: ReactPointerEvent, task: Task) {
    if (e.button !== 0) return;
    if (!e.shiftKey && isMultiSel(task.id)) return startSelectionDrag(e);
    if (!e.ctrlKey || !task.date) return;
    e.stopPropagation();
    selectTask(task.id);
    setDrag({ kind: 'move-milestone', taskId: task.id, day: task.date });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  /** Re-ciblage d'un lien existant : glisser depuis la poignée de lien vers une nouvelle tâche. */
  function startRelink(
    e: ReactPointerEvent,
    sourceTaskId: string,
    anchorDate: IsoDate | null,
    successorTaskId: string,
    linkIdx: number,
    link: TaskLink,
    fromX: number,
    fromY: number,
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag({
      kind: 'link',
      sourceTaskId,
      anchorDate,
      fromX,
      fromY,
      toX: fromX,
      toY: fromY,
      targetTaskId: null,
      relinkFrom: { successorTaskId, linkIdx, link },
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  /** CTRL + glisser sur la barre de groupe → déplace tous les descendants (tâches + jalons). */
  function startGroupDrag(e: ReactPointerEvent, task: Task) {
    if (e.button !== 0 || !e.ctrlKey) return;
    e.stopPropagation();
    selectTask(task.id);
    const descendants = schedule.hierarchy
      .descendantsOf(task.id)
      .filter((d) => d.type === 'task' || d.type === 'milestone')
      .map((d) => d.id);
    if (descendants.length === 0) return;
    setDrag({ kind: 'move-selection', taskIds: descendants, startX: e.clientX, deltaDays: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  // ——— Pan : clic gauche maintenu sur le fond (les barres stoppent la propagation) ———

  function onRootPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0 || drag) return;
    panRef.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    // Resynchronise l'état Shift (au cas où un keyup aurait été manqué : dialog, perte de focus…).
    if (e.shiftKey !== shiftHeld) setShiftHeld(e.shiftKey);
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
    if (drag.kind === 'move' || drag.kind === 'move-selection') {
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
    } else if (drag.kind === 'progress') {
      const { x } = svgPoint(e);
      const frac = Math.max(0, Math.min(1, (x - drag.xStart) / (drag.xEnd - drag.xStart)));
      if (Math.abs(frac - drag.frac) > 0.001) setDrag({ ...drag, frac });
    } else if (drag.kind === 'move-milestone') {
      const { x } = svgPoint(e);
      const day = scale.dateAt(x);
      if (day !== drag.day) setDrag({ ...drag, day });
    } else {
      // resize-start / resize-end
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
      if (drag.deltaDays !== 0) {
        moveBlock(drag.taskId, drag.blockId, drag.deltaDays);
        mergeOverlappingBlocks(drag.taskId);
      }
    } else if (drag.kind === 'move-selection') {
      if (drag.deltaDays !== 0) shiftTasksDates(drag.taskIds, drag.deltaDays);
      // éviter que le clic suivant ne réduise la sélection à une seule ligne
      suppressClickRef.current = true;
    } else if (drag.kind === 'move-milestone') {
      updateTask(drag.taskId, { date: drag.day });
    } else if (drag.kind === 'resize-start') {
      const from = drag.day; // pas de borne : croiser la fin encode un bloc « 0 jour »
      const startResizeTask = schedule.ctx.file.tasks.find((t) => t.id === drag.taskId);
      if (startResizeTask?.scheduling === 'effort') {
        // Poignée de début : on garde la FIN fixe et on ajuste le reste (≡ ce que montre l'infobulle).
        // Tirer le début vers la gauche allonge (plus de reste), vers la droite raccourcit ; croiser la
        // fin → reste 0 (tâche à 0 j). `drag.otherEdge` = la fin du bloc.
        const remaining = remainingForEndDate(
          schedule.ctx,
          startResizeTask,
          drag.blockId,
          drag.otherEdge,
          from,
        );
        setBlockDates(drag.taskId, drag.blockId, from, null);
        setTaskRemaining(drag.taskId, Math.max(0, remaining));
      } else {
        // Mode fixed : toujours passer un `to` explicite (jamais null, même pour un bloc ouvert)
        setBlockDates(drag.taskId, drag.blockId, from, drag.otherEdge);
        mergeOverlappingBlocks(drag.taskId);
      }
    } else if (drag.kind === 'resize-end') {
      const to = drag.day; // pas de borne : croiser le début → reste 0 (effort) ou bloc « 0 jour » (fixed)
      const resizeTask = schedule.ctx.file.tasks.find((t) => t.id === drag.taskId);
      if (resizeTask?.scheduling === 'effort') {
        // Poignée de fin (ou bloc fermé converti) : ajuster le reste, ouvrir le bloc si nécessaire
        const remaining = remainingForEndDate(schedule.ctx, resizeTask, drag.blockId, to);
        if (!drag.openEnd) {
          setBlockDates(drag.taskId, drag.blockId, drag.otherEdge, null);
        }
        setTaskRemaining(drag.taskId, Math.max(0, remaining));
      } else {
        setBlockDates(drag.taskId, drag.blockId, drag.otherEdge, to);
        mergeOverlappingBlocks(drag.taskId);
      }
    } else if (drag.kind === 'progress') {
      // Avancement = % saisi, indépendant du réalisé/reste — pour les deux types de tâches.
      setTaskProgress(drag.taskId, Math.max(0, Math.min(1, drag.frac)));
    } else if (drag.kind === 'link' && drag.targetTaskId) {
      const targetId = drag.targetTaskId;
      if (drag.relinkFrom) {
        // Re-ciblage : changer le successeur du lien existant (la source reste identique).
        // Action atomique → un seul undo restaure le lien d'origine.
        const { successorTaskId, linkIdx, link: oldLink } = drag.relinkFrom;
        if (targetId !== successorTaskId) {
          const err = relinkSuccessor(successorTaskId, linkIdx, targetId, { ...oldLink });
          if (err && window.confirm(t('links.cycleSplitPrompt'))) {
            if (!resolveCycleBySplit(targetId, drag.sourceTaskId)) window.alert(t('links.cycleSplitImpossible'));
          } else if (err) {
            window.alert(err);
          }
        }
      } else {
        const sourceId = drag.sourceTaskId;
        // Ancre prédécesseur : Shift au départ → « après N j » (anchorDate), sinon « après la fin ».
        const link: Parameters<typeof addLink>[1] = drag.anchorDate
          ? {
              on: sourceId,
              type: 'after-progress',
              progressDays: Math.max(0.5, workedDaysUpTo(schedule.linkInputs, sourceId, drag.anchorDate)),
              lag: 0,
            }
          : { on: sourceId, type: 'after-end', lag: 0 };
        // Ancre successeur : Shift au relâchement → « vers N j » au point de drop, sinon au début.
        if (shiftHeld) {
          const td = workedDaysUpTo(schedule.linkInputs, targetId, scale.dateAt(drag.toX));
          if (td > 0) link.targetDays = Math.max(0.5, td);
        }
        const error = addLink(targetId, link);
        // Cycle refusé : proposer de scinder le successeur (sa fin devient une sous-tâche dépendante).
        if (error && window.confirm(t('links.cycleSplitPrompt'))) {
          if (!resolveCycleBySplit(targetId, sourceId)) window.alert(t('links.cycleSplitImpossible'));
        } else if (error) {
          window.alert(error);
        }
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
    // G5 : hasNext basé sur les blocs stockés (pas résolus) pour éviter les faux positifs
    const storedSorted = [...task.blocks].sort((a, b) => a.from.localeCompare(b.from));
    const storedIdx = storedSorted.findIndex((b) => b.id === blockId);
    const hasNext = storedIdx >= 0 && storedIdx < storedSorted.length - 1;
    const earliestResult = schedule.earliestByTask.get(task.id);
    const earliestDate = earliestResult?.date ?? null;
    const snapBlock = task.blocks.find((b) => b.id === blockId);
    const multiGroup =
      isMultiSel(task.id) && canEncloseInGroup(schedule.ctx.file, selectedTaskIds);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        ...(multiGroup
          ? [
              {
                label: t('tasks.createEnclosingGroup'),
                onClick: () => focusNew(createEnclosingGroup(selectedTaskIds)),
              },
            ]
          : []),
        {
          label: t('gantt.changeAssign'),
          onClick: () => {
            setMenu(null);
            setAssignPopover({ x: e.clientX, y: e.clientY, taskId: task.id, blockId });
          },
        },
        {
          label: `✂ ${t('gantt.cutHere')} (${cutDay.slice(8)}/${cutDay.slice(5, 7)})`,
          disabled: !r || cutDay <= r.from || cutDay > r.to,
          onClick: () => r && splitBlock(task.id, blockId, cutDay, r.to),
        },
        {
          label: t('gantt.subtaskFromHere'),
          disabled: task.type !== 'task',
          onClick: () => focusNew(createSubtaskFromPoint(task.id, cutDay)),
        },
        {
          label: t('gantt.mergeNext'),
          disabled: !hasNext,
          onClick: () => mergeWithNextBlock(task.id, blockId),
        },
        {
          label: t('gantt.snapToPredecessor'),
          disabled: !earliestDate || !snapBlock || snapBlock.from === earliestDate,
          onClick: () => {
            if (!earliestDate || !snapBlock) return;
            const delta = diffDays(snapBlock.from, earliestDate);
            if (delta !== 0) moveBlock(task.id, blockId, delta);
          },
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
    // « Groupe englobant » : sur la sélection si la ligne en fait partie, sinon la ligne seule (≥ 1).
    const groupIds =
      selectedTaskIds.includes(task.id) && selectedTaskIds.length > 0 ? selectedTaskIds : [task.id];
    const canGroup = canEncloseInGroup(schedule.ctx.file, groupIds);
    const entries: MenuEntry[] = [
      {
        label: t('tasks.createEnclosingGroup'),
        disabled: !canGroup,
        title: canGroup ? undefined : t('tasks.createEnclosingGroupHint'),
        onClick: () => focusNew(createEnclosingGroup(groupIds)),
      },
    ];
    if (task.type === 'group') {
      entries.push({ label: t('tasks.ungroup'), onClick: () => dissolveGroup(task.id) });
    }
    if (task.type === 'task') {
      entries.push({ label: t('gantt.addBlock'), onClick: () => addBlockToTask(task.id, day) });
      entries.push({
        label: t('gantt.subtaskFromHere'),
        onClick: () => focusNew(createSubtaskFromPoint(task.id, day)),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, entries });
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
        onClick={(e) => {
          const svgRect = svgRef.current!.getBoundingClientRect();
          const y = e.clientY - svgRect.top;
          const rowIndex = Math.floor(y / ROW_HEIGHT);
          const row = rows[rowIndex];
          if (row) handleRowClick(row.task.id, e);
          onAreaClick?.();
        }}
        onDoubleClick={(e) => {
          const svgRect = svgRef.current!.getBoundingClientRect();
          const x = e.clientX - svgRect.left;
          const y = e.clientY - svgRect.top;
          const rowIndex = Math.floor(y / ROW_HEIGHT);
          const row = rows[rowIndex];
          if (!row) return;
          if (row.task.type === 'milestone') {
            // Double-clic sur le losange → détail ; dans le vide → (re)poser la date du jalon.
            const cx = row.task.date ? scale.x(row.task.date) + scale.dayWidth / 2 : null;
            if (cx !== null && Math.abs(x - cx) <= 8) onOpenPanel(row.task.id);
            else updateTask(row.task.id, { date: scale.dateAt(x) });
            return;
          }
          if (row.task.type !== 'task') { onOpenPanel(row.task.id); return; }
          const resolved = schedule.resolvedByTask.get(row.task.id) ?? [];
          const clickedOnBlock = resolved.some((r) => x >= scale.x(r.from) && x <= scale.xEnd(r.to));
          if (clickedOnBlock) onOpenPanel(row.task.id);
          else addBlockToTask(row.task.id, scale.dateAt(x));
        }}
      >
        <defs>
          <pattern id="cancelled-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(33,31,26,0.35)" strokeWidth="3" />
          </pattern>
        </defs>
        {/* Jours chômés */}
        {gridColumns.map((c, i) => (
          <rect key={i} x={c.x} y={0} width={c.w} height={height} fill="rgb(33 31 26 / 0.045)" />
        ))}
        {/* Séparateurs de lignes */}
        {visible.map((_, i) => {
          const y = (windowStart + i + 1) * ROW_HEIGHT;
          return <line key={i} x1={0} x2={scale.width} y1={y} y2={y} stroke="rgb(33 31 26 / 0.05)" />;
        })}
        {/* Lignes verticales (aujourd'hui / revue) : rendues plus bas, par-dessus les barres,
            avec une bande de survol assez large pour afficher l'infobulle. */}
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
        {/* Sélection (simple ou multiple) */}
        {visible.map((row, i) =>
          selectedTaskIds.includes(row.task.id) ? (
            <rect
              key={`sel-${row.task.id}`}
              x={0}
              y={(windowStart + i) * ROW_HEIGHT}
              width={scale.width}
              height={ROW_HEIGHT}
              fill="var(--color-accent)"
              opacity={0.06}
            />
          ) : null,
        )}
        {/* Barres (lignes visibles seulement) */}
        {visible.map((row, i) => (
          <g
            key={row.task.id}
            transform={`translate(0, ${(windowStart + i) * ROW_HEIGHT})`}
            onContextMenu={(e) => rowMenu(e, row.task)}
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
              ctrlHeld={ctrlHeld}
              shiftHeld={shiftHeld}
              isLinkTarget={drag?.kind === 'link' && drag.targetTaskId === row.task.id}
              onBlockPointerDown={startMove}
              onResizePointerDown={startResize}
              onLinkPointerDown={startLink}
              onBlockContextMenu={blockMenu}
              onProgressPointerDown={startProgress}
              onMilestonePointerDown={startMilestoneDrag}
              onGroupPointerDown={startGroupDrag}
            />
          </g>
        ))}
        {/* Fantômes colorés du plan proposé — après les barres pour capter le survol */}
        {proposalByTask &&
          visible.map((row, i) => {
            const change = proposalByTask.get(row.task.id);
            if (!change) return null;
            // Groupe actif : la ligne est sélectionnée et ≥2 lignes sélectionnées ont une proposition.
            const inGroup = groupChanges.length >= 2 && selectedTaskIds.includes(row.task.id);
            return (
              <ProposalGhost
                key={`prop-${row.task.id}`}
                change={change}
                y={(windowStart + i) * ROW_HEIGHT}
                scale={scale}
                color={projectColor.get(row.task.projectId) ?? '#888888'}
                onApply={applyProposalChange}
                inGroup={inGroup}
                groupCount={groupChanges.length}
                groupHovered={groupGhostHover}
                onGroupHover={setGroupGhostHover}
                onApplyGroup={() => applyProposalChanges(groupChanges)}
              />
            );
          })}
        {/* Liens — rendus après les barres pour capter les événements pointer */}
        <LinksLayer
          schedule={schedule}
          scale={scale}
          rowIndexByTask={rowIndexByTask}
          chainPairs={chainPairs}
          onDeleteLink={removeLink}
          onRelinkPointerDown={startRelink}
        />
        {/* Fantômes gris de la baseline active — peints APRÈS les barres pour que le survol fonctionne */}
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
        {/* Ligne aujourd'hui (bleue) — au début de la journée, par-dessus les barres.
            Bande transparente plus large pour capter le survol (l'infobulle SVG ne s'affiche
            que sur l'élément réellement survolé) ; les gestes (pan, double-clic) remontent au SVG. */}
        <line
          x1={scale.x(today)}
          x2={scale.x(today)}
          y1={0}
          y2={height}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.65}
          pointerEvents="none"
        />
        <rect x={scale.x(today) - 3} y={0} width={6} height={height} fill="transparent">
          <title>{t('gantt.today')}</title>
        </rect>
        {/* Ligne date de réunion (rouge) — visible seulement si différente d'aujourd'hui */}
        {schedule.ctx.today !== today && (
          <>
            <line
              x1={scale.x(schedule.ctx.today)}
              x2={scale.x(schedule.ctx.today)}
              y1={0}
              y2={height}
              stroke="var(--color-danger)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              opacity={0.7}
              pointerEvents="none"
            />
            <rect x={scale.x(schedule.ctx.today) - 3} y={0} width={6} height={height} fill="transparent">
              <title>{t('gantt.reviewDateLine')}</title>
            </rect>
          </>
        )}
        {/* Tooltip Reste pendant resize (effort ET dates fixées, resize-start et resize-end) */}
        {(drag?.kind === 'resize-end' || drag?.kind === 'resize-start') && (() => {
          const rt = schedule.ctx.file.tasks.find((t) => t.id === drag.taskId);
          if (!rt || rt.type !== 'task') return null;
          const rowIdx = rowIndexByTask.get(drag.taskId) ?? 0;
          const ty = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
          let remaining: number;
          if (drag.kind === 'resize-end') {
            remaining = remainingForEndDate(schedule.ctx, rt, drag.blockId, drag.day);
          } else {
            remaining = remainingForEndDate(schedule.ctx, rt, drag.blockId, drag.otherEdge, drag.day);
          }
          const label = t('gantt.remainingTooltip', { days: Math.round(remaining * 10) / 10 });
          const labelWidth = label.length * 6.5 + 8;
          const tx = drag.kind === 'resize-end'
            ? scale.xEnd(drag.day) + 6
            : scale.x(drag.day) - 6 - labelWidth;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty - 9} rx={3} width={labelWidth} height={18} fill="var(--color-ink)" opacity={0.85} />
              <text x={tx + 4} y={ty + 4} fontSize={11} fill="white">{label}</text>
            </g>
          );
        })()}
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
      {assignPopover && (
        <BlockAssignPopover
          x={assignPopover.x}
          y={assignPopover.y}
          taskId={assignPopover.taskId}
          blockId={assignPopover.blockId}
          schedule={schedule}
          onClose={() => setAssignPopover(null)}
        />
      )}
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
  ctrlHeld: boolean;
  shiftHeld: boolean;
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
  onProgressPointerDown: (e: ReactPointerEvent, task: Task, xStart: number, xEnd: number) => void;
  onMilestonePointerDown: (e: ReactPointerEvent, task: Task) => void;
  onGroupPointerDown: (e: ReactPointerEvent, task: Task) => void;
}

function RowBars({
  row,
  schedule,
  scale,
  color,
  hasConflict,
  drag,
  ctrlHeld,
  shiftHeld,
  isLinkTarget,
  onBlockPointerDown,
  onResizePointerDown,
  onLinkPointerDown,
  onBlockContextMenu,
  onProgressPointerDown,
  onMilestonePointerDown,
  onGroupPointerDown,
}: RowBarsProps) {
  const { task } = row;
  const mid = ROW_HEIGHT / 2;
  const barY = mid - 5.5;
  const barH = 11;
  const [barHovered, setBarHovered] = useState(false);
  const { before: colsBefore, after: colsAfter, center: colsCenter, centerMode, centerOverflow, fontSize: ganttFontSize } =
    useGanttColumnsStore();

  if (task.type === 'milestone') {
    if (!task.date) return null;
    const isMsDrag = drag?.kind === 'move-milestone' && drag.taskId === task.id;
    const isSelDrag = drag?.kind === 'move-selection' && drag.taskIds.includes(task.id);
    const msDay = isMsDrag
      ? (drag as DragMoveMilestone).day
      : isSelDrag
        ? addDays(task.date, (drag as DragMoveSelection).deltaDays)
        : task.date;
    const cx = scale.x(msDay) + scale.dayWidth / 2;
    const msColor = task.color ?? color;
    return (
      <g
        className="cursor-pointer"
        onPointerDown={(e) => onMilestonePointerDown(e, task)}
      >
        <Diamond cx={cx} cy={mid} size={6} color={msColor} conflict={hasConflict} />
        <text x={cx + 10} y={mid + 3.5} fontSize={10.5} fill="var(--color-ink-soft)">
          {task.name}
        </text>
      </g>
    );
  }

  if (task.type === 'group') {
    const agg = schedule.groupAggByTask.get(task.id);
    if (!agg || !agg.span) {
      // Groupe sans barre (ex. ne contient que des jalons) : afficher le nom + une fine liaison +
      // les losanges, ANCRÉS sur les jalons descendants (pas à x=0, sinon invisibles si on a défilé).
      const msDates = schedule.hierarchy
        .descendantsOf(task.id)
        .filter((d) => d.type === 'milestone' && d.date)
        .map((d) => d.date!)
        .sort();
      const firstX = msDates.length ? scale.x(msDates[0]!) : 4;
      const lastX = msDates.length ? scale.x(msDates[msDates.length - 1]!) + scale.dayWidth : firstX;
      const lineColor = darken(color, 0.45); // teinte « jalon », plus sombre
      // Côté du nom selon le réglage « si le texte ne tient pas » (la barre est inexistante ici).
      const nameBefore = centerOverflow === 'before';
      return (
        <g>
          {msDates.length > 1 && (
            <rect x={firstX} y={mid - 1} width={lastX - firstX} height={2} fill={lineColor} />
          )}
          {row.collapsedMilestones.map(
            (m) =>
              m.date && (
                <Diamond
                  key={m.id}
                  cx={scale.x(m.date) + scale.dayWidth / 2}
                  cy={mid}
                  size={5}
                  color={m.color ?? color}
                />
              ),
          )}
          <text
            x={nameBefore ? firstX - 4 : lastX + 4}
            y={mid + ganttFontSize / 2 - 1}
            fontSize={ganttFontSize}
            fontWeight="bold"
            textAnchor={nameBefore ? 'end' : 'start'}
            fill="var(--color-ink-soft)"
            pointerEvents="none"
          >
            {task.name}
          </text>
          {isLinkTarget && <TargetHalo width={scale.width} />}
        </g>
      );
    }
    const border = darken(color, 0.45);
    const progressW = progressBarDays(agg.span, agg.progress) * scale.dayWidth;
    const gx0 = scale.x(agg.span.start);
    const gx1 = scale.xEnd(agg.span.end);
    return (
      <g
        onPointerDown={(e) => onGroupPointerDown(e, task)}
        style={{ cursor: ctrlHeld ? 'grab' : undefined }}
      >
        {/* liaison fine sur toute l'étendue — G8 : légèrement plus haute */}
        <rect
          x={gx0}
          y={mid - 3}
          width={gx1 - gx0}
          height={6}
          fill={rgba(color, 0.28)}
        />
        {/* G7 : union des blocs descendants — bords droits (rx=0), crochets par intervalle */}
        {agg.intervals.map((itv, i) => {
          const ix0 = scale.x(itv.from);
          const ix1 = scale.xEnd(itv.to);
          return (
            <g key={i}>
              <rect
                x={ix0}
                y={barY}
                width={Math.max(3, ix1 - ix0)}
                height={barH}
                rx={0}
                fill={border}
              />
              {/* crochet gauche — part exactement du coin bas-gauche */}
              <path
                d={`M ${ix0} ${barY + barH} L ${ix0 + 5} ${barY + barH} L ${ix0} ${barY + barH + 5} Z`}
                fill={border}
              />
              {/* crochet droit — part exactement du coin bas-droit */}
              <path
                d={`M ${ix1} ${barY + barH} L ${ix1 - 5} ${barY + barH} L ${ix1} ${barY + barH + 5} Z`}
                fill={border}
              />
            </g>
          );
        })}
        {/* avancement : barre noire centrée */}
        {progressW > 0 && (
          <rect
            x={scale.x(agg.span.start)}
            y={mid - 1.25}
            width={progressW}
            height={2.5}
            rx={1}
            fill="var(--color-ink)"
            opacity={0.95}
            pointerEvents="none"
          />
        )}
        {/* P5 : textes colonnes sur barres de groupe (same logic, group zone) */}
        {(() => {
          const txtY = mid + ganttFontSize / 2 - 1;
          const hasGroupCol = [...colsBefore, ...colsAfter, ...colsCenter].includes('group');
          const groupFontWeight = hasGroupCol ? 'bold' : undefined;
          const groupCenterTxt = colsCenter.map((k) => cellText(task, k, schedule)).filter(Boolean).join(' · ');
          const groupBeforeParts = colsBefore.map((k) => cellText(task, k, schedule)).filter(Boolean);
          const groupAfterParts = colsAfter.map((k) => cellText(task, k, schedule)).filter(Boolean);
          const barW = gx1 - gx0;
          const estW = groupCenterTxt.length * (ganttFontSize * 0.55) + 4;
          const fits = estW <= barW;
          const someIntervalFits = centerMode === 'perBlock'
            ? agg.intervals.some((itv) => (scale.xEnd(itv.to) - scale.x(itv.from)) >= estW)
            : fits;
          const ov = !someIntervalFits && centerOverflow !== 'none' ? centerOverflow : null;
          if (ov === 'before' && groupCenterTxt) groupBeforeParts.unshift(groupCenterTxt);
          if (ov === 'after' && groupCenterTxt) groupAfterParts.unshift(groupCenterTxt);
          return (
            <>
              {groupBeforeParts.length > 0 && (
                <text x={gx0 - 4} y={txtY} fontSize={ganttFontSize} fontWeight={groupFontWeight} textAnchor="end" fill="var(--color-ink-soft)" pointerEvents="none">
                  {groupBeforeParts.join(' · ')}
                </text>
              )}
              {groupAfterParts.length > 0 && (
                <text x={gx1 + 4} y={txtY} fontSize={ganttFontSize} fontWeight={groupFontWeight} textAnchor="start" fill="var(--color-ink-soft)" pointerEvents="none">
                  {groupAfterParts.join(' · ')}
                </text>
              )}
              {colsCenter.length > 0 && centerMode === 'unique' && fits && groupCenterTxt && (
                <text x={(gx0 + gx1) / 2} y={txtY} fontSize={ganttFontSize} fontWeight={groupFontWeight} textAnchor="middle" fill="var(--color-surface)" pointerEvents="none">
                  {groupCenterTxt}
                </text>
              )}
              {colsCenter.length > 0 && centerMode === 'perBlock' && agg.intervals.map((itv, i) => {
                const ix0 = scale.x(itv.from);
                const ix1 = scale.xEnd(itv.to);
                const iw = ix1 - ix0;
                if (iw < estW) return null;
                return (
                  <text key={i} x={(ix0 + ix1) / 2} y={txtY} fontSize={ganttFontSize} fontWeight={groupFontWeight} textAnchor="middle" fill="var(--color-surface)" pointerEvents="none">
                    {groupCenterTxt}
                  </text>
                );
              })}
            </>
          );
        })()}
        {/* jalons des descendants quand le groupe est replié */}
        {row.collapsedMilestones.map(
          (m) =>
            m.date && (
              <Diamond
                key={m.id}
                cx={scale.x(m.date) + scale.dayWidth / 2}
                cy={mid}
                size={5}
                color={m.color ?? color}
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
  // Tâche à 0 j-h (volontaire : note / micro-rappel) → petit marqueur au lieu d'une barre d'un jour.
  const zeroEffort =
    (task.scheduling === 'effort' ? task.effort : scheduledEffort(schedule.ctx, task, resolved)) <= 1e-9;
  const progress = taskProgress(task);
  const realized = realizedOf(schedule.ctx, task);
  const xStart = scale.x(span.start);
  const xEnd = scale.xEnd(span.end);
  const activeFrac =
    drag?.kind === 'progress' && drag.taskId === task.id ? drag.frac : progress;
  const progressW = (xEnd - xStart) * activeFrac;
  const isDraggingProgress = drag?.kind === 'progress' && drag.taskId === task.id;
  const handleW = 5;
  const rawHandleX = xStart + activeFrac * (xEnd - xStart) - handleW / 2;
  const handleX = Math.max(xStart, Math.min(xEnd - handleW, rawHandleX));
  const dragOffset = (blockId: string) => {
    if (drag?.kind === 'move' && drag.taskId === task.id && drag.blockId === blockId)
      return drag.deltaDays * scale.dayWidth;
    if (drag?.kind === 'move-selection' && drag.taskIds.includes(task.id))
      return drag.deltaDays * scale.dayWidth;
    return 0;
  };

  return (
    <g className="group">
      <g
        onMouseEnter={() => setBarHovered(true)}
        onMouseLeave={() => setBarHovered(false)}
      >
      {/* liaisons estompées entre blocs — G8 : plus hautes pour rester visibles derrière la barre d'avancement */}
      {resolved.slice(0, -1).map((r, i) => {
        const next = resolved[i + 1]!;
        const x1 = scale.xEnd(r.to);
        const x2 = scale.x(next.from);
        if (x2 <= x1) return null;
        return (
          <rect key={`l${i}`} x={x1} y={mid - 3.5} width={x2 - x1} height={7} fill={rgba(color, 0.3)} />
        );
      })}
      {/* blocs */}
      {resolved.map((r) => {
        let from = r.from;
        let to = r.to;
        if (drag?.kind === 'resize-start' && drag.taskId === task.id && drag.blockId === r.block.id) {
          from = drag.day;
        }
        if (drag?.kind === 'resize-end' && drag.taskId === task.id && drag.blockId === r.block.id) {
          to = drag.day;
        }
        const x = scale.x(from) + dragOffset(r.block.id);
        const w = zeroEffort ? 5 : Math.max(4, scale.xEnd(to) - scale.x(from));
        const openEnd = r.block.to === null;
        // effort = coins arrondis (fin calculée, souple) ; fixed = coins carrés (dates posées)
        const rx = task.scheduling === 'effort' ? 3 : 0;
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
              y={barY}
              width={w}
              height={barH}
              rx={rx}
              fill={color}
              // Teinte claire = passé (réalisé). Proche du sombre : l'écart ne ressort que sur les
              // tâches en cours (qui enjambent le trait de revue).
              opacity={task.status === 'cancelled' ? 0.4 : task.status === 'done' ? 0.5 : 0.6}
              stroke={r.overflow || hasConflict ? 'var(--color-danger)' : darken(color, 0.3)}
              strokeWidth={r.overflow || hasConflict ? 1.6 : 0.5}
              className="cursor-grab active:cursor-grabbing"
              style={shiftHeld ? { cursor: 'crosshair' } : undefined}
              onPointerDown={(e) => onBlockPointerDown(e, task, r.block.id)}
              onContextMenu={(e) => onBlockContextMenu(e, task, r.block.id)}
            >
              <title>
                {t('gantt.blockOf', { name: task.name })} — {from} → {to}
                {who ? `\n${who}` : ''}
                {`\n${t('panel.realized')} : ${Math.round(realized * 10) / 10} ${t('common.days')}`}
                {`\n${t('panel.remaining')} : ${Math.round(remainingOf(schedule.ctx, task, resolved) * 10) / 10} ${t('common.days')}`}
                {`\n${t('gantt.progressTooltipIndep', { pct: Math.round(task.progress * 100) })}`}
              </title>
            </rect>
            {/* teinte sombre = reste à faire/futur (après le trait de revue) — les DEUX types */}
            {task.status !== 'cancelled' && (() => {
              const reviewX = scale.x(schedule.ctx.today);
              const darkX = Math.max(x, reviewX);
              const darkW = (x + w) - darkX;
              if (darkW <= 0) return null;
              return (
                <rect
                  x={darkX} y={barY} width={darkW} height={barH} rx={rx}
                  fill={color}
                  opacity={task.status === 'done' ? 0.3 : 0.9}
                  pointerEvents="none"
                />
              );
            })()}
            {/* hachures diagonales si annulé */}
            {task.status === 'cancelled' && (
              <rect x={x} y={barY} width={w} height={barH} rx={rx} fill="url(#cancelled-hatch)" pointerEvents="none" />
            )}
            {/* poignée de début — moitié basse seulement (haut = déplacer) */}
            <rect
              x={x - 3}
              y={barY + barH / 2}
              width={10}
              height={barH / 2}
              fill="transparent"
              style={{ cursor: ctrlHeld ? 'grab' : 'ew-resize' }}
              onPointerDown={(e) =>
                onResizePointerDown(e, task, r.block.id, 'start', r.from, r.to, openEnd)
              }
            />
          </g>
        );
      })}
      {/* avancement : barre noire centrée (saisi, indépendant du réalisé/reste) — les deux types */}
      {progressW > 0 && (
        <rect
          x={xStart}
          y={mid - 1.25}
          width={progressW}
          height={2.5}
          rx={1}
          fill="var(--color-ink)"
          opacity={0.95}
          pointerEvents="none"
        />
      )}
      {/* poignée d'avancement (les deux types) — règle task.progress */}
      {task.status !== 'cancelled' && (barHovered || isDraggingProgress) && (
        <rect
          x={handleX}
          y={barY - 2}
          width={handleW}
          height={barH / 2 + 2}
          rx={1.5}
          fill="var(--color-ink)"
          opacity={0.8}
          style={{ cursor: ctrlHeld ? 'grab' : 'col-resize' }}
          onPointerDown={(e) => onProgressPointerDown(e, task, xStart, xEnd)}
        >
          <title>{t('gantt.progressTooltip', { pct: Math.round(activeFrac * 100) })}</title>
        </rect>
      )}
      </g>
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
      {/* textes colonnes Gantt — avant / après / centre (P5 + P6) */}
      {(() => {
        const txtY = mid + ganttFontSize / 2 - 1;
        const centerTxt = colsCenter.map((k) => cellText(task, k, schedule)).filter(Boolean).join(' · ');
        const barW = xEnd - xStart;
        const estW = centerTxt.length * (ganttFontSize * 0.55) + 4;
        const fitsInBar = estW <= barW;
        // P6 : repli si texte centre ne tient pas
        const someBlockFits = centerMode === 'perBlock'
          ? resolved.some((r) => Math.max(4, scale.xEnd(r.to) - scale.x(r.from)) >= estW)
          : fitsInBar;
        const overflow = !someBlockFits && centerOverflow !== 'none' ? centerOverflow : null;
        const beforeParts = colsBefore.map((k) => cellText(task, k, schedule)).filter(Boolean);
        const afterParts = colsAfter.map((k) => cellText(task, k, schedule)).filter(Boolean);
        if (overflow === 'before' && centerTxt) beforeParts.unshift(centerTxt);
        if (overflow === 'after' && centerTxt) afterParts.unshift(centerTxt);
        return (
          <>
            {beforeParts.length > 0 && (
              <text x={xStart - 4} y={txtY} fontSize={ganttFontSize} textAnchor="end" fill="var(--color-ink-soft)" pointerEvents="none">
                {beforeParts.join(' · ')}
              </text>
            )}
            {afterParts.length > 0 && (
              <text x={xEnd + 4} y={txtY} fontSize={ganttFontSize} textAnchor="start" fill="var(--color-ink-soft)" pointerEvents="none">
                {afterParts.join(' · ')}
              </text>
            )}
            {colsCenter.length > 0 && centerMode === 'unique' && fitsInBar && centerTxt && (
              <text x={(xStart + xEnd) / 2} y={txtY} fontSize={ganttFontSize} textAnchor="middle" fill="var(--color-surface)" pointerEvents="none">
                {centerTxt}
              </text>
            )}
            {colsCenter.length > 0 && centerMode === 'perBlock' && resolved.map((r) => {
              const rx = scale.x(r.from) + dragOffset(r.block.id);
              const rw = Math.max(4, scale.xEnd(r.to) - scale.x(r.from));
              if (rw < estW) return null;
              return (
                <text key={`ct-${r.block.id}`} x={rx + rw / 2} y={txtY} fontSize={ganttFontSize} textAnchor="middle" fill="var(--color-surface)" pointerEvents="none">
                  {centerTxt}
                </text>
              );
            })}
          </>
        );
      })()}
      {/* poignée de création de lien (décalée à +11 pour ne pas chevaucher la poignée de fin) */}
      {/* Tâche à 0 j : le marqueur ne fait que 5px, on se cale sur son bord droit visuel et non sur xEnd (un jour plus loin). */}
      <circle
        cx={(zeroEffort ? xStart + 5 : xEnd) + 11}
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
      {/* poignées de fin — rendues après le cercle de lien pour capter le pointeur en priorité */}
      {resolved.map((r) => {
        const openEnd = r.block.to === null;
        const dragOff =
          drag?.kind === 'move' && drag.taskId === task.id && drag.blockId === r.block.id
            ? drag.deltaDays * scale.dayWidth
            : 0;
        let from = r.from;
        let to = r.to;
        if (drag?.kind === 'resize-start' && drag.taskId === task.id && drag.blockId === r.block.id) {
          from = drag.day;
        }
        if (drag?.kind === 'resize-end' && drag.taskId === task.id && drag.blockId === r.block.id) {
          to = drag.day;
        }
        const bx = scale.x(from) + dragOff;
        const bw = zeroEffort ? 5 : Math.max(4, scale.xEnd(to) - scale.x(from));
        return (
          <rect
            key={`end-${r.block.id}`}
            x={bx + bw - 4}
            y={barY + barH / 2}
            width={10}
            height={barH / 2}
            fill="transparent"
            style={{ cursor: ctrlHeld ? 'grab' : 'ew-resize' }}
            onPointerDown={(e) =>
              onResizePointerDown(e, task, r.block.id, 'end', r.from, r.to, openEnd)
            }
          />
        );
      })}
      {isLinkTarget && <TargetHalo width={scale.width} />}
    </g>
  );
}

function cellText(task: Task, key: ColKey, schedule: Schedule): string {
  switch (key) {
    case 'name': return task.name;
    case 'group': {
      // Colonne « Groupe » = nom du groupe parent (utile sur une feuille). Pour un groupe, vide :
      // son nom est déjà porté par la colonne « Tâche » → évite le doublon dans les barres.
      const parent = task.parentId ? schedule.hierarchy.tasksById.get(task.parentId) : null;
      return parent && parent.type === 'group' ? parent.name : '';
    }
    case 'project': {
      const p = schedule.ctx.file.projects.find((x) => x.id === task.projectId);
      return p?.name ?? '';
    }
    case 'scheduling':
      return task.type === 'task' ? (task.scheduling === 'effort' ? t('tasks.schedulingShort.effort') : t('tasks.schedulingShort.fixed')) : '';
    case 'estimate': return task.estimate != null ? `${task.estimate}j` : '';
    case 'effort':
      return task.scheduling === 'effort'
        ? `${task.effort}j`
        : `${Math.round(scheduledEffort(schedule.ctx, task, schedule.resolvedByTask.get(task.id) ?? []) * 10) / 10}j`;
    case 'realized': return `${Math.round(realizedOf(schedule.ctx, task) * 10) / 10}j`;
    case 'remaining': return `${Math.round(remainingOf(schedule.ctx, task, schedule.resolvedByTask.get(task.id) ?? []) * 10) / 10}j`;
    case 'progress': return `${Math.round(taskProgress(task) * 100)}%`;
    case 'assignees': {
      const res = schedule.ctx.file.resources;
      const ids = new Set(task.blocks.flatMap((b) => b.assignments.map((a) => a.resourceId)));
      return [...ids].map((id) => {
        const r = res.find((x) => x.id === id);
        return r ? resourceAvatar(r).label : '';
      }).filter(Boolean).join(' ');
    }
    case 'start': {
      const resolved = schedule.resolvedByTask.get(task.id);
      return resolved?.[0]?.from ?? '';
    }
    case 'end': {
      const resolved = schedule.resolvedByTask.get(task.id);
      return resolved?.[resolved.length - 1]?.to ?? '';
    }
    case 'status': return task.status ?? '';
    default: return '';
  }
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
      >
        <title>baseline : {baseline.name}</title>
      </path>
    );
  }
  const snapshot = baseline.tasks[task.id];
  if (!snapshot) return null;
  return (
    <g>
      <title>baseline : {baseline.name}</title>
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

/** Surimpression du plan proposé : contours en pointillés + bouton ✓ au survol. */
function ProposalGhost({
  change,
  y,
  scale,
  color,
  onApply,
  inGroup,
  groupCount,
  groupHovered,
  onGroupHover,
  onApplyGroup,
}: {
  change: TaskChange;
  y: number;
  scale: TimeScale;
  color: string;
  onApply: (change: TaskChange) => void;
  /** La ligne fait partie d'une sélection multiple dont ≥2 lignes ont une proposition. */
  inGroup: boolean;
  groupCount: number;
  groupHovered: boolean;
  onGroupHover: (hovered: boolean) => void;
  onApplyGroup: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const enter = () => {
    setHovered(true);
    if (inGroup) onGroupHover(true);
  };
  const leave = () => {
    setHovered(false);
    if (inGroup) onGroupHover(false);
  };
  // En groupe, survoler un ✓ allume les ✓ de toutes les lignes sélectionnées qui ont une proposition.
  const showCheck = hovered || (inGroup && groupHovered);
  const applyAction = () => (inGroup ? onApplyGroup() : onApply(change));
  const mid = ROW_HEIGHT / 2;
  const ghostCy = y + 3; // centre vertical de la bande fantôme (y+1 à y+5)

  const deltaDays = change.newStart && change.oldStart
    ? diffDays(change.oldStart, change.newStart)
    : change.date && change.oldStart
      ? diffDays(change.oldStart, change.date)
      : 0;
  const deltaLabel = deltaDays === 0 ? '' : `${deltaDays > 0 ? '+' : ''}${deltaDays} j`;
  // Label au survol : en groupe → « Valider N propositions », sinon le delta de décalage.
  const hoverLabel = inGroup ? t('proposal.applyGroup', { count: groupCount }) : deltaLabel;

  const openImpacts = (e: ReactPointerEvent | React.MouseEvent) => {
    e.stopPropagation(); // sinon le onClick racine (onAreaClick) referme aussitôt le panneau
    useUiStore.getState().openImpacts(change.taskId);
  };

  // Bouton ✓ : déclenché sur pointerdown (fiable, l'élément n'existe qu'au survol).
  const applyBtn = (cx: number, cy: number) => (
    <g
      style={{ cursor: 'pointer' }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); applyAction(); }}
    >
      <circle cx={cx} cy={cy} r={7} fill="var(--color-accent)" />
      <path
        d={`M ${cx - 3} ${cy} L ${cx - 1} ${cy + 2.5} L ${cx + 3.2} ${cy - 2.8}`}
        fill="none"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );

  if (change.date) {
    const cx = scale.x(change.date) + scale.dayWidth / 2;
    const cy = y + mid;
    const btnCx = cx + 16;
    // Zone de survol = le losange lui-même (+ le bouton à droite, à hauteur du losange).
    return (
      <g
        onPointerEnter={enter}
        onPointerLeave={leave}
        onPointerDown={(e) => e.stopPropagation()} // empêche la capture pointer racine de détourner le clic
        onClick={openImpacts}
        style={{ cursor: 'pointer' }}
      >
        <rect x={cx - 7} y={cy - 8} width={btnCx + 7 - (cx - 7)} height={16} fill="transparent" />
        <path
          d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
          fill={rgba(color, 0.25)}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          pointerEvents="none"
        />
        {showCheck && (
          <>
            {/* « +X j » (ou « Valider N propositions » en groupe), au-dessus, seulement sous le pointeur */}
            {hovered && hoverLabel && (
              <text x={cx} y={cy - 9} textAnchor="middle" fontSize={9} fill="var(--color-accent)" pointerEvents="none">{hoverLabel}</text>
            )}
            {applyBtn(btnCx, cy)}
          </>
        )}
      </g>
    );
  }
  if (!change.blocks) return null;

  const firstFrom = change.blocks[0]?.from;
  const lastBlock = change.blocks[change.blocks.length - 1];
  const lastTo = lastBlock?.to ?? change.newEnd;
  if (!firstFrom || !lastTo) return null;

  const firstX = scale.x(firstFrom);
  // Bloc « 0 jour » (note/micro-rappel) : marqueur étroit, jamais une journée pleine.
  const lastEndX = lastBlock?.zero ? scale.x(lastBlock.from) + 5 : scale.xEnd(lastTo);
  const btnCx = lastEndX + 11; // centre du bouton ✓, collé au bord droit de la dernière bande
  const labelX = (firstX + lastEndX) / 2;

  return (
    <g
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={(e) => e.stopPropagation()} // empêche la capture pointer racine de détourner le clic
      onClick={openImpacts}
      style={{ cursor: 'pointer' }}
    >
      {/* Zone de survol restreinte à la bande haute (y..y+8) : ne gêne plus la barre réelle (y+5..y+16). */}
      <rect x={firstX - 2} y={y} width={btnCx + 7 - (firstX - 2)} height={8} fill="transparent" />
      {/* Bandes fantôme */}
      {change.blocks.map((b, i) => {
        const to = b.to ?? change.newEnd;
        if (!to || to < b.from) return null;
        return (
          <rect
            key={i}
            x={scale.x(b.from)}
            y={y + 1}
            width={b.zero ? 5 : Math.max(3, scale.xEnd(to) - scale.x(b.from))}
            height={4}
            rx={2}
            fill={rgba(color, 0.3)}
            stroke="var(--color-accent)"
            strokeWidth={1.1}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        );
      })}
      {showCheck && (
        <>
          {/* « +X j » (ou « Valider N propositions » en groupe) au-dessus, seulement sous le pointeur */}
          {hovered && hoverLabel && (
            <text x={labelX + 3} y={y} textAnchor="middle" fontSize={9} fill="var(--color-accent)" pointerEvents="none">{hoverLabel}</text>
          )}
          {applyBtn(btnCx, ghostCy)}
        </>
      )}
    </g>
  );
}

// ——— Liens entre tâches ———

interface LinkPathEntry {
  d: string;
  /** Zone de survol : segment vertical seul (évite les portions horizontales proches des barres). */
  hitD: string;
  violated: boolean;
  inChain: boolean;
  key: string;
  arrow: { x: number; y: number; dir: 'right' | 'down' };
  taskId: string;
  linkIdx: number;
  link: TaskLink;
  sourceTaskId: string;
  anchorDate: IsoDate | null;
  midX: number;
  midY: number;
  arrowFromX: number;
  arrowFromY: number;
}

/**
 * Code compact d'un lien pour l'infobulle : [ancre prédécesseur][délai][ancre successeur][délai].
 * F = fin, D = début, P = après N j travaillés. Délais en j ouvrés, 0 omis.
 * Ex. : FD (fin→début), F1D3 (fin+1→début+3), DD1 (début→début+1).
 */
function linkCode(link: TaskLink): string {
  let pred: string;
  if (link.type === 'with-start') pred = 'D';
  else if (link.type === 'after-progress') pred = `P${link.progressDays ?? 0}`;
  else pred = 'F';
  if (link.lag) pred += `${link.lag}`; // 0 omis ; signe conservé pour les délais négatifs
  let succ = 'D';
  if (link.targetDays) succ += `${link.targetDays}`;
  return pred + succ;
}

function LinksLayer({
  schedule,
  scale,
  rowIndexByTask,
  chainPairs,
  onDeleteLink,
  onRelinkPointerDown,
}: {
  schedule: Schedule;
  scale: TimeScale;
  rowIndexByTask: ReadonlyMap<string, number>;
  chainPairs?: ReadonlySet<string>;
  onDeleteLink: (taskId: string, linkIdx: number) => void;
  onRelinkPointerDown: (
    e: ReactPointerEvent,
    sourceTaskId: string,
    anchorDate: IsoDate | null,
    successorTaskId: string,
    linkIdx: number,
    link: TaskLink,
    fromX: number,
    fromY: number,
  ) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const paths: LinkPathEntry[] = [];

  // Une feuille repliée (cachée) reporte son lien sur la ligne de son ancêtre visible le plus proche.
  const resolveRow = (taskId: string): number | undefined => {
    let id: string | null | undefined = taskId;
    while (id != null) {
      const idx = rowIndexByTask.get(id);
      if (idx !== undefined) return idx;
      id = schedule.hierarchy.tasksById.get(id)?.parentId ?? null;
    }
    return undefined;
  };

  for (const task of schedule.ctx.file.tasks) {
    if (task.links.length === 0) continue;
    const targetIndex = resolveRow(task.id);
    if (targetIndex === undefined) continue;
    const targetSpan = schedule.spanByTask.get(task.id);
    if (!targetSpan) continue;
    const earliest = schedule.earliestByTask.get(task.id);

    for (const [li, link] of task.links.entries()) {
      const sourceIndex = resolveRow(link.on);
      // Lien entièrement interne à un groupe replié (deux feuilles cachées) : rien à tracer.
      if (sourceIndex === undefined || sourceIndex === targetIndex) continue;
      const sourceSpan = schedule.spanByTask.get(link.on);
      if (!sourceSpan) continue;

      let sx: number;
      let anchorDate: IsoDate | null = null;
      if (link.type === 'with-start') {
        sx = scale.x(sourceSpan.start);
      } else if (link.type === 'after-progress') {
        const reached = workedDaysReachedOn(schedule.linkInputs, link.on, link.progressDays ?? 0);
        sx = scale.xEnd(reached ?? sourceSpan.end);
        anchorDate = reached ?? null;
      } else {
        sx = scale.xEnd(sourceSpan.end);
      }
      const sy = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

      // Ancre cible : point interne « N jours » (targetDays) si défini, sinon le début de la tâche.
      let targetAnchor = targetSpan.start;
      let violated: boolean;
      if (link.targetDays != null) {
        const reached = workedDaysReachedOn(schedule.linkInputs, task.id, link.targetDays);
        if (reached) targetAnchor = reached;
        const required = earliest?.perLink.find((p) => p.link === link)?.date ?? null;
        violated = Boolean(required && targetAnchor < required);
      } else {
        violated = Boolean(earliest?.date && targetSpan.start < earliest.date);
      }
      const tx = scale.x(targetAnchor);
      const ty = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const bend = sx + 7;
      // Lien « retour arrière »
      const backward = tx - 4 < bend;
      const d = backward
        ? `M ${sx} ${sy} L ${bend} ${sy} L ${bend} ${targetIndex * ROW_HEIGHT + 3} L ${tx} ${targetIndex * ROW_HEIGHT + 3} L ${tx} ${ty}`
        : `M ${sx} ${sy} L ${bend} ${sy} L ${bend} ${ty} L ${tx - 4} ${ty}`;
      const midX = backward ? bend : bend;
      const vertBotY = backward ? targetIndex * ROW_HEIGHT + 3 : ty;
      const midY = (sy + vertBotY) / 2;
      // Zone de survol = segment vertical + le trait horizontal qui le suit, tronqué pour garder
      // 10px de marge avec l'ancre du successeur (et ignoré si ce trait fait moins de 10px).
      let hitD = `M ${bend} ${sy} L ${bend} ${vertBotY}`;
      const drawnEndX = backward ? tx : tx - 4;
      const rightward = drawnEndX > bend;
      if (Math.abs(drawnEndX - bend) >= 10) {
        const trimEnd = rightward ? tx - 10 : tx + 10;
        if (rightward ? trimEnd > bend : trimEnd < bend) {
          hitD += ` M ${bend} ${vertBotY} L ${trimEnd} ${vertBotY}`;
        }
      }
      paths.push({
        key: `${task.id}-${li}`,
        violated,
        inChain: chainPairs?.has(`${task.id}:${link.on}`) ?? false,
        d,
        hitD,
        arrow: backward ? { x: tx, y: ty, dir: 'down' } : { x: tx - 4, y: ty, dir: 'right' },
        taskId: task.id,
        linkIdx: li,
        link,
        sourceTaskId: link.on,
        anchorDate,
        midX,
        midY,
        arrowFromX: sx,
        arrowFromY: sy,
      });
    }
  }

  return (
    <g>
      {paths.map((p) => {
        const isHovered = hoveredKey === p.key;
        const stroke = p.violated
          ? 'var(--color-danger)'
          : p.inChain
            ? 'var(--color-warn)'
            : 'var(--color-ink-faint)';
        const sw = p.violated || p.inChain ? (isHovered ? 2.4 : 1.8) : (isHovered ? 1.6 : 1.1);
        const sourceName = schedule.hierarchy.tasksById.get(p.sourceTaskId)?.name ?? p.sourceTaskId;
        // Groupe parent (direct ou indirect) du prédécesseur, s'il existe.
        let groupName: string | null = null;
        let ancId = schedule.hierarchy.tasksById.get(p.sourceTaskId)?.parentId ?? null;
        while (ancId) {
          const anc = schedule.hierarchy.tasksById.get(ancId);
          if (!anc) break;
          if (anc.type === 'group') { groupName = anc.name; break; }
          ancId = anc.parentId ?? null;
        }
        const sourceLabel = groupName ? `${groupName} / ${sourceName}` : sourceName;
        const conflictLabel = p.violated ? ` · ${t('conflicts.types.link-violated')}` : '';
        const tooltipText = `${linkCode(p.link)} « ${sourceLabel} »${conflictLabel}`;
        const tooltipW = Math.min(300, tooltipText.length * 6.2 + 12);
        const tooltipX = Math.max(4, p.midX - tooltipW / 2);
        const tooltipY = p.midY - 28;

        return (
          <g key={p.key}>
            {/* Zone de hit fine (≈ épaisseur du trait, sans marge), vertical + horizontal tronqué */}
            <path
              d={p.hitD}
              fill="none"
              stroke="transparent"
              strokeWidth={4}
              style={{ cursor: 'pointer' }}
              onPointerEnter={() => setHoveredKey(p.key)}
              onPointerLeave={() => setHoveredKey(null)}
            />
            {/* Trait visuel */}
            <path
              d={p.d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              opacity={0.9}
              pointerEvents="none"
            />
            <ArrowHead arrow={p.arrow} color={stroke} />

            {/* Éléments interactifs visibles au survol */}
            {isHovered && (
              <g>
                {/* Infobulle */}
                <g pointerEvents="none">
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipW}
                    height={18}
                    rx={3}
                    fill="var(--color-ink)"
                    opacity={0.88}
                  />
                  <text
                    x={tooltipX + 6}
                    y={tooltipY + 12}
                    fontSize={10}
                    fill="white"
                  >
                    {tooltipText}
                  </text>
                </g>
                {/* Bouton × supprimer — à gauche du trait (le trait passe entre les deux boutons) */}
                {/* Sur pointerdown : la capture pointer racine détourne sinon le clic. */}
                <g
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteLink(p.taskId, p.linkIdx); setHoveredKey(null); }}
                  onPointerEnter={() => setHoveredKey(p.key)}
                  onPointerLeave={() => setHoveredKey(null)}
                >
                  <circle cx={p.midX - 8} cy={p.midY} r={7} fill="var(--color-danger)" opacity={0.9} />
                  <path
                    d={`M ${p.midX - 11} ${p.midY - 3} L ${p.midX - 5} ${p.midY + 3} M ${p.midX - 5} ${p.midY - 3} L ${p.midX - 11} ${p.midY + 3}`}
                    stroke="white" strokeWidth={1.5} strokeLinecap="round" pointerEvents="none"
                  />
                  <title>{t('links.remove')}</title>
                </g>
                {/* Poignée re-ciblage → — à droite du trait */}
                <g
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => onRelinkPointerDown(e, p.sourceTaskId, p.anchorDate, p.taskId, p.linkIdx, p.link, p.arrowFromX, p.arrowFromY)}
                  onPointerEnter={() => setHoveredKey(p.key)}
                  onPointerLeave={() => setHoveredKey(null)}
                >
                  <circle cx={p.midX + 8} cy={p.midY} r={7} fill="var(--color-accent)" opacity={0.9} />
                  <path
                    d={`M ${p.midX + 4.5} ${p.midY} L ${p.midX + 11} ${p.midY} M ${p.midX + 8.5} ${p.midY - 2.5} L ${p.midX + 11} ${p.midY} L ${p.midX + 8.5} ${p.midY + 2.5}`}
                    fill="none" stroke="white" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
                  />
                  <title>{t('gantt.linkRelinkHint')}</title>
                </g>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function ArrowHead({
  arrow,
  color,
}: {
  arrow: { x: number; y: number; dir: 'right' | 'down' };
  color: string;
}) {
  const d =
    arrow.dir === 'down'
      ? `M ${arrow.x} ${arrow.y} l -3.5 -5 h 7 Z`
      : `M ${arrow.x} ${arrow.y} l -5 -3.5 v 7 Z`;
  return <path d={d} fill={color} />;
}

// ——— Popover d'affectation de bloc — sliders par personne/matériel ———

function BlockAssignPopover({
  x,
  y,
  taskId,
  blockId,
  schedule,
  onClose,
}: {
  x: number;
  y: number;
  taskId: string;
  blockId: string;
  schedule: Schedule;
  onClose: () => void;
}) {
  const file = schedule.ctx.file;
  const reviewDate = useAppStore((s) => s.reviewDate);
  const block = file.tasks.find((t) => t.id === taskId)?.blocks.find((b) => b.id === blockId);
  const [assignments, setAssignmentsState] = useState<Assignment[]>(
    block?.assignments.map((a) => ({ ...a })) ?? [],
  );
  const [splitHisto, setSplitHisto] = useState(false);

  const setUnits = (resourceId: string, units: number) => {
    const u = Math.max(0, Math.min(1000, units));
    setAssignmentsState((prev) => {
      if (u === 0) return prev.filter((a) => a.resourceId !== resourceId);
      if (prev.some((a) => a.resourceId === resourceId)) {
        return prev.map((a) => (a.resourceId === resourceId ? { ...a, units: u } : a));
      }
      return [...prev, { resourceId, units: u }];
    });
  };

  const toggle = (resourceId: string) => {
    const cur = assignments.find((a) => a.resourceId === resourceId);
    setUnits(resourceId, cur ? 0 : 100);
  };

  const handleSave = () => {
    if (splitHisto) {
      // Nouveau bloc à la date de revue : l'ancienne équipe reste figée dans le passé.
      reassignTask(taskId, assignments, reviewDate ?? todayIso());
    } else {
      setBlockAssignments(taskId, blockId, assignments);
    }
    resyncRemaining(taskId);
    onClose();
  };

  // Clic en dehors = fermer sans sauvegarder
  const popRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const left = Math.min(x, window.innerWidth - 280);
  const top = Math.min(y, window.innerHeight - 360);

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-50 w-[260px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl"
      style={{ left, top }}
    >
      <div className="border-b border-[var(--color-line)] px-3 py-2 text-[11px] font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide">
        {t('gantt.assignPopoverTitle')}
      </div>
      <div className="max-h-60 overflow-y-auto p-2 space-y-2">
        {file.resources.map((r) => {
          const units = assignments.find((a) => a.resourceId === r.id)?.units ?? 0;
          const active = units > 0;
          const { color, label } = resourceAvatar(r);
          return (
            <div key={r.id} className={`flex items-center gap-2 rounded px-1 py-0.5 ${active ? '' : 'opacity-40'}`}>
              {/* Avatar = poignée / bouton bascule */}
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white transition hover:scale-110 cursor-pointer"
                style={{ background: color }}
                title={active ? `${r.name} — cliquer pour retirer` : `Ajouter ${r.name}`}
                onClick={() => toggle(r.id)}
              >
                {label}
              </button>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={units}
                onChange={(e) => setUnits(r.id, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)]"
                title={`${r.name} : ${units} %`}
              />
              <span className="w-9 shrink-0 text-right font-mono text-[11px] text-[var(--color-ink-soft)]">
                {units} %
              </span>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 border-t border-[var(--color-line)] px-3 py-2 text-[11.5px] text-[var(--color-ink-soft)]">
        <input
          type="checkbox"
          checked={splitHisto}
          onChange={(e) => setSplitHisto(e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        {t('gantt.newBlockHisto')}
      </label>
      <div className="flex gap-2 border-t border-[var(--color-line)] px-3 py-2">
        <button
          className="flex-1 rounded bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          onClick={handleSave}
        >
          {t('common.apply')}
        </button>
        <button
          className="flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-[11px] hover:bg-[var(--color-wash)]"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
