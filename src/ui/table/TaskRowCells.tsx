import { useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { Schedule } from '@/core/scheduler/schedule';
import { realizedOf, scheduledEffort } from '@/core/scheduler/blocks';
import type { Conflict } from '@/core/conflicts/detect';
import { useAppStore } from '@/state/store';
import { useUiStore } from '@/state/uiStore';
import type { TaskType } from '@/core/model/types';
import {
  addTask,
  convertTaskType,
  deleteTask,
  moveTask,
  moveTasks,
  setTaskEffort,
  setTaskProgress,
  setTaskProject,
  setTaskRemaining,
  setTaskScheduling,
  setTaskStatus,
  toggleCollapsed,
  updateTask,
  type MovePosition,
} from '@/state/taskActions';
import { EditableNumber, EditableText } from '@/ui/common/inline';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import {
  IconChevronDown,
  IconChevronRight,
  IconDiamond,
  IconDots,
  IconPlus,
} from '@/ui/common/icons';
import { t } from '@/i18n/fr';
import { fmtDay, fmtDays } from '@/ui/gantt/format';
import { resourceAvatar } from '@/ui/common/Avatar';
import type { GanttRow } from '@/ui/gantt/rows';
import { useTableStore, type ColKey } from './tableStore';

const STATUS_COLOR: Record<string, string> = {
  todo: 'var(--color-ink-faint)',
  in_progress: 'var(--color-accent)',
  done: 'var(--color-ok)',
  blocked: 'var(--color-danger)',
  cancelled: 'var(--color-ink-faint)',
};

export interface DropIndicator {
  taskId: string;
  position: MovePosition;
  /** Niveau cible (0 = racine) déduit de la position horizontale du curseur. */
  level?: number;
}

interface TaskRowCellsProps {
  row: GanttRow;
  schedule: Schedule;
  conflicts: Conflict[] | undefined;
  dropIndicator: DropIndicator | null;
  onDropIndicator: (ind: DropIndicator | null) => void;
  onOpenPanel: (taskId: string) => void;
  /** Clic sur la ligne — gère sélection simple / Ctrl (toggle) / Maj (plage). */
  onSelectRow: (taskId: string, e: ReactMouseEvent) => void;
  /** Survol synchronisé avec la timeline. */
  hovered: boolean;
  onHover: (taskId: string | null) => void;
}

export function TaskRowCells({
  row,
  schedule,
  conflicts,
  dropIndicator,
  onDropIndicator,
  onOpenPanel,
  onSelectRow,
  hovered,
  onHover,
}: TaskRowCellsProps) {
  const { task, depth, hasChildren, collapsed } = row;
  const selectTask = useAppStore((s) => s.selectTask);
  const selected = useAppStore((s) => s.selectedTaskIds.includes(task.id));
  /** Ancre en sélection simple : seul cas où l'on montre les boutons « + niveau ». */
  const isLoneAnchor = useAppStore(
    (s) => s.selectedTaskId === task.id && s.selectedTaskIds.length === 1,
  );
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const cols = useTableStore((s) => s.widths);
  const hidden = useTableStore((s) => s.hidden);
  const order = useTableStore((s) => s.order);
  const fontSize = useTableStore((s) => s.fontSize);
  const show = (col: string) => !hidden.includes(col as keyof typeof cols);
  const editingTaskId = useUiStore((s) => s.editingTaskId);
  const setEditingTaskId = useUiStore((s) => s.setEditingTaskId);

  const span = schedule.spanByTask.get(task.id) ?? null;
  const agg = task.type === 'group' ? schedule.groupAggByTask.get(task.id) : undefined;
  const isChild = task.parentId !== null;

  // — affectés : le dernier bloc (le plus récent) fait foi
  const resolved = schedule.resolvedByTask.get(task.id) ?? [];
  const lastBlock = resolved.length > 0 ? resolved[resolved.length - 1]!.block : null;
  const assigneeResources = (lastBlock?.assignments ?? [])
    .map((a) => resources.find((r) => r.id === a.resourceId))
    .filter(Boolean);

  // — glisser-déposer : réordonner / ré-indenter avec niveau horizontal
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: MovePosition = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'child';
    // Le niveau cible est déduit de la position X dans la cellule Nom (16px par niveau)
    const relX = Math.max(0, e.clientX - rect.left - 6);
    const maxLevel = position === 'child' ? depth + 1 : depth;
    const level = Math.min(Math.floor(relX / 16), maxLevel);
    if (
      dropIndicator?.taskId !== task.id ||
      dropIndicator.position !== position ||
      dropIndicator.level !== level
    ) {
      onDropIndicator({ taskId: task.id, position, level });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/crewgantt-task');
    if (sourceId && dropIndicator) {
      // Si le niveau cible est inférieur à la profondeur de la cible, remonter aux ancêtres
      const targetLevel = dropIndicator.level ?? depth;
      let targetId = task.id;
      if (targetLevel < depth && dropIndicator.position !== 'child') {
        const all = useAppStore.getState().file.tasks;
        let anchor = task;
        for (let d = depth; d > targetLevel; d--) {
          const parent = all.find((tk) => tk.id === anchor.parentId);
          if (!parent) break;
          anchor = parent;
        }
        targetId = anchor.id;
      }
      // Si on traîne une ligne de la sélection multiple, tout le groupe suit (comme Ctrl+↑/↓).
      const selIds = useAppStore.getState().selectedTaskIds;
      if (selIds.length > 1 && selIds.includes(sourceId)) {
        moveTasks(selIds, targetId, dropIndicator.position);
      } else {
        moveTask(sourceId, targetId, dropIndicator.position);
      }
    }
    onDropIndicator(null);
  }

  const convertEntries: MenuEntry[] = (['task', 'group', 'milestone'] as TaskType[])
    .filter((ty) => ty !== task.type)
    .map((ty) => ({
      label: t(`tasks.convertTo.${ty}`),
      disabled: ty === 'milestone' && hasChildren,
      onClick: () => {
        const losesBlocks = ty !== 'task' && task.blocks.length > 0;
        if (losesBlocks && !window.confirm(t('tasks.convertConfirmBlocks', { name: task.name })))
          return;
        convertTaskType(task.id, ty);
      },
    }));

  const addEntries: MenuEntry[] = [
    ...convertEntries,
    { label: t('tasks.addAfter'), onClick: () => selectTask(addTask({ afterId: task.id })) },
    {
      label: t('tasks.addChild'),
      onClick: () => selectTask(addTask({ parentId: task.id })),
      disabled: task.type === 'milestone',
    },
    {
      label: t('tasks.addMilestone'),
      onClick: () => selectTask(addTask({ afterId: task.id, type: 'milestone' })),
    },
    {
      label: t('tasks.addGroup'),
      onClick: () => selectTask(addTask({ afterId: task.id, type: 'group' })),
    },
    {
      label: t('tasks.delete'),
      danger: true,
      onClick: () => {
        if (window.confirm(t('tasks.confirmDelete', { name: task.name }))) deleteTask(task.id);
      },
    },
  ];

  /** Boutons ronds « + » de la ligne sélectionnée : un par niveau (0…profondeur+1). */
  function addAtLevel(level: number) {
    if (level === depth + 1) {
      selectTask(addTask({ parentId: task.id }));
      return;
    }
    // remonter la chaîne des parents jusqu'à l'ancêtre du niveau visé
    const all = useAppStore.getState().file.tasks;
    let anchor = task;
    for (let d = depth; d > level; d--) {
      const parent = all.find((tk) => tk.id === anchor.parentId);
      if (!parent) break;
      anchor = parent;
    }
    selectTask(addTask({ afterId: anchor.id }));
  }

  const isDropTarget = dropIndicator?.taskId === task.id;
  const dropLevelX = 6 + (dropIndicator?.level ?? depth) * 16;
  const dropClass = isDropTarget && dropIndicator?.position === 'child' ? 'bg-accent-wash' : '';

  // Cellules rendues dans l'ordre stocké (`order`). `name` reste épinglé en première position.
  function renderCell(key: ColKey) {
    switch (key) {
      case 'name':
        return (
          <div
            key="name"
            className="flex min-w-0 items-center gap-0.5 pr-1"
            style={{ width: cols.name, paddingLeft: 6 + depth * 16 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/crewgantt-task', task.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            {hasChildren ? (
              <button
                className="shrink-0 rounded p-0.5 text-ink-faint hover:text-ink"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(task.id);
                }}
              >
                {collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
              </button>
            ) : (
              <span className="w-[17px] shrink-0" />
            )}
            {task.type === 'milestone' && (
              <IconDiamond size={11} className="shrink-0 text-ink-soft" />
            )}
            <span className={`min-w-0 flex-1 ${task.type === 'group' ? 'font-semibold' : ''}`}>
              <EditableText
                value={task.name}
                onCommit={(name) => updateTask(task.id, { name })}
                autoEdit={editingTaskId === task.id}
                onAutoEditConsumed={() => setEditingTaskId(null)}
              />
            </span>
            {conflicts && conflicts.length > 0 && (
              <button
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white cursor-pointer hover:bg-danger/80"
                title={conflicts.map((c) => t(`conflicts.types.${c.type}`)).join(' · ')}
                onClick={(e) => {
                  e.stopPropagation();
                  selectTask(task.id);
                  useUiStore.getState().openConflicts(task.id);
                }}
              >
                {conflicts.length}
              </button>
            )}
            <button
              className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition hover:text-accent group-hover/row:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY });
              }}
              title={t('tasks.rowActions')}
              aria-label={t('tasks.rowActions')}
            >
              <IconDots size={12} />
            </button>
          </div>
        );
      case 'project':
        return (
          <div key="project" className="flex items-center gap-1.5 overflow-hidden px-1" style={{ width: show('project') ? cols.project : 0, display: show('project') ? undefined : 'none' }}>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: projects.find((p) => p.id === task.projectId)?.color ?? '#888' }}
            />
            {isChild ? (
              <span className="truncate text-ink-faint">
                {projects.find((p) => p.id === task.projectId)?.name ?? '—'}
              </span>
            ) : (
              <select
                className="w-full cursor-pointer truncate bg-transparent outline-none"
                value={task.projectId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const newProjectId = e.target.value;
                  setTaskProject(task.id, newProjectId);
                  const newProject = projects.find((p) => p.id === newProjectId);
                  const defaultScheduling = newProject?.defaultScheduling ?? 'fixed';
                  if (task.scheduling !== defaultScheduling) {
                    const modeLabel = defaultScheduling === 'effort' ? t('panel.schedulingEffort') : t('panel.schedulingFixed');
                    if (window.confirm(t('tasks.switchScheduling', { mode: modeLabel }))) {
                      setTaskScheduling(task.id, defaultScheduling);
                    }
                  }
                }}
              >
                {projects
                  .filter((p) => !p.archived || p.id === task.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        );
      case 'scheduling':
        return (
          <div key="scheduling" style={{ width: show('scheduling') ? cols.scheduling : 0, display: show('scheduling') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            <span className="truncate text-ink-faint block">
              {task.type === 'task'
                ? task.scheduling === 'effort'
                  ? t('tasks.schedulingShort.effort')
                  : t('tasks.schedulingShort.fixed')
                : '—'}
            </span>
          </div>
        );
      case 'estimate':
        return (
          <div key="estimate" style={{ width: show('estimate') ? cols.estimate : 0, display: show('estimate') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            {task.type === 'task' ? (
              <EditableNumber
                value={task.estimate}
                nullable
                onCommit={(v) => updateTask(task.id, { estimate: v })}
              />
            ) : (
              <span className="block px-1 text-right font-mono text-ink-faint">—</span>
            )}
          </div>
        );
      case 'effort':
        return (
          <div key="effort" style={{ width: show('effort') ? cols.effort : 0, display: show('effort') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            {task.type === 'task' && task.scheduling === 'effort' ? (
              <EditableNumber
                value={task.effort}
                onCommit={(v) => setTaskEffort(task.id, v ?? 0)}
                className={
                  task.estimate !== null && task.effort > task.estimate ? 'text-danger' : undefined
                }
              />
            ) : task.type === 'task' ? (
              // fixed : effort = capacité des dates posées (lecture seule)
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(scheduledEffort(schedule.ctx, task, resolved))}
              </span>
            ) : task.type === 'group' && agg ? (
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(agg.effortTotal)}
              </span>
            ) : (
              <span className="block px-1 text-right font-mono text-ink-faint">—</span>
            )}
          </div>
        );
      case 'realized':
        return (
          <div key="realized" style={{ width: show('realized') ? cols.realized : 0, display: show('realized') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            {task.type === 'task' ? (
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(realizedOf(schedule.ctx, task))}
              </span>
            ) : task.type === 'group' && agg ? (
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(agg.effortRealized)}
              </span>
            ) : (
              <span className="block px-1 text-right font-mono text-ink-faint">—</span>
            )}
          </div>
        );
      case 'remaining':
        return (
          <div key="remaining" style={{ width: show('remaining') ? cols.remaining : 0, display: show('remaining') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            {task.type === 'task' && task.scheduling === 'effort' ? (
              <EditableNumber value={task.remaining} onCommit={(v) => setTaskRemaining(task.id, v ?? 0)} />
            ) : task.type === 'task' ? (
              // fixed : reste = effort − réalisé (lecture seule)
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(Math.max(0, scheduledEffort(schedule.ctx, task, resolved) - realizedOf(schedule.ctx, task)))}
              </span>
            ) : task.type === 'group' && agg ? (
              <span className="block px-1 text-right font-mono text-ink-soft">
                {fmtDays(agg.effortTotal - agg.effortRealized)}
              </span>
            ) : (
              <span className="block px-1 text-right font-mono text-ink-faint">—</span>
            )}
          </div>
        );
      case 'progress':
        return (
          <div key="progress" style={{ width: show('progress') ? cols.progress : 0, display: show('progress') ? undefined : 'none' }} className="overflow-hidden px-0.5">
            {task.type === 'task' ? (
              <EditableNumber
                value={Math.round(task.progress * 100)}
                onCommit={(v) => setTaskProgress(task.id, (v ?? 0) / 100)}
                suffix="%"
              />
            ) : task.type === 'group' && agg && agg.effortTotal > 0 ? (
              <span className="block px-1 text-right font-mono text-[11.5px] text-ink-soft">
                {Math.round(agg.progress * 100)} %
              </span>
            ) : (
              <span className="block px-1 text-right font-mono text-[11.5px] text-ink-faint">—</span>
            )}
          </div>
        );
      case 'assignees':
        return (
          <div key="assignees" className="flex items-center gap-0.5 overflow-hidden px-1" style={{ width: show('assignees') ? cols.assignees : 0, display: show('assignees') ? undefined : 'none' }}>
            {assigneeResources.length > 0 ? (
              assigneeResources.map((r, i) => {
                const { color, label } = resourceAvatar(r!);
                return (
                  <span
                    key={i}
                    className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-display text-[9px] font-bold text-white"
                    style={{ background: color }}
                    title={r!.name}
                  >
                    {label}
                  </span>
                );
              })
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </div>
        );
      case 'start':
        return (
          <div key="start" style={{ width: show('start') ? cols.start : 0, display: show('start') ? undefined : 'none' }} className="overflow-hidden px-1 text-right font-mono text-[11.5px] text-ink-soft">
            {fmtDay(span?.start)}
          </div>
        );
      case 'end':
        return (
          <div key="end" style={{ width: show('end') ? cols.end : 0, display: show('end') ? undefined : 'none' }} className="overflow-hidden px-1 text-right font-mono text-[11.5px] text-ink-soft">
            {fmtDay(span?.end)}
          </div>
        );
      case 'status':
        return (
          <div key="status" className="flex items-center gap-1.5 overflow-hidden px-1.5" style={{ width: show('status') ? cols.status : 0, display: show('status') ? undefined : 'none' }}>
            {task.type !== 'group' ? (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[task.status] }}
                />
                <select
                  className="w-full cursor-pointer bg-transparent text-[12px] outline-none"
                  value={task.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setTaskStatus(task.id, e.target.value as typeof task.status)}
                >
                  <option value="todo">{t('tasks.status.todo')}</option>
                  <option value="in_progress">{t('tasks.status.in_progress')}</option>
                  <option value="done">{t('tasks.status.done')}</option>
                  <option value="blocked">{t('tasks.status.blocked')}</option>
                  <option value="cancelled">{t('tasks.status.cancelled')}</option>
                </select>
              </>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div
      style={{ fontSize }}
      className={`group/row relative flex h-[21px] items-center border-b border-line/60 ${
        selected ? 'bg-accent-wash/60' : hovered ? 'bg-ink/[0.03]' : 'bg-surface'
      } ${dropClass}`}
      onClick={(e) => onSelectRow(task.id, e)}
      onDoubleClick={() => onOpenPanel(task.id)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      onDragOver={onDragOver}
      onDragLeave={() => onDropIndicator(null)}
      onDrop={onDrop}
    >
      {/* Indicateur de drop : trait bleu aligné sur le niveau cible */}
      {isDropTarget && dropIndicator?.position !== 'child' && (
        <div
          className={`pointer-events-none absolute ${dropIndicator.position === 'before' ? 'top-0' : 'bottom-0'} right-0 h-0.5 bg-accent`}
          style={{ left: dropLevelX }}
        />
      )}
      {/* Cellules dans l'ordre stocké (`name` épinglé en tête) */}
      {order.map((key) => renderCell(key))}

      {/* « + » par niveau, sous la ligne sélectionnée : choisir directement la profondeur */}
      {isLoneAnchor && (
        <div className="pointer-events-none absolute -bottom-[9px] left-0 z-20 h-[18px]">
          {Array.from({ length: depth + 2 }, (_, level) => {
            const isChild = level === depth + 1;
            if (isChild && task.type === 'milestone') return null;
            const title = isChild
              ? t('tasks.addChild')
              : t('tasks.addAtLevel', { level: level + 1 });
            return (
              <button
                key={level}
                className="pointer-events-auto absolute flex h-[18px] w-[18px] items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-sm transition hover:bg-accent hover:text-white"
                style={{ left: 4 + level * 16 }}
                title={title}
                aria-label={title}
                onClick={(e) => {
                  e.stopPropagation();
                  addAtLevel(level);
                }}
              >
                <IconPlus size={10} />
              </button>
            );
          })}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={addEntries} onClose={() => setMenu(null)} />}
    </div>
  );
}
