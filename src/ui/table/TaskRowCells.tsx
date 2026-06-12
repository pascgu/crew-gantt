import { useState, type DragEvent } from 'react';
import type { Schedule } from '@/core/scheduler/schedule';
import type { Conflict } from '@/core/conflicts/detect';
import { useAppStore } from '@/state/store';
import type { TaskType } from '@/core/model/types';
import {
  addTask,
  convertTaskType,
  deleteTask,
  moveTask,
  setTaskEffort,
  setTaskProject,
  setTaskRemaining,
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
import { fmtDay, fmtDays, initials } from '@/ui/gantt/format';
import type { GanttRow } from '@/ui/gantt/rows';
import { COLS } from './columns';

const STATUS_COLOR: Record<string, string> = {
  todo: 'var(--color-ink-faint)',
  in_progress: 'var(--color-accent)',
  done: 'var(--color-ok)',
  blocked: 'var(--color-danger)',
};

export interface DropIndicator {
  taskId: string;
  position: MovePosition;
}

interface TaskRowCellsProps {
  row: GanttRow;
  schedule: Schedule;
  conflicts: Conflict[] | undefined;
  dropIndicator: DropIndicator | null;
  onDropIndicator: (ind: DropIndicator | null) => void;
  onOpenPanel: (taskId: string) => void;
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
  hovered,
  onHover,
}: TaskRowCellsProps) {
  const { task, depth, hasChildren, collapsed } = row;
  const selectTask = useAppStore((s) => s.selectTask);
  const selected = useAppStore((s) => s.selectedTaskId === task.id);
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const span = schedule.spanByTask.get(task.id) ?? null;
  const agg = task.type === 'group' ? schedule.groupAggByTask.get(task.id) : undefined;
  const isChild = task.parentId !== null;

  // — affectés : le dernier bloc (le plus récent) fait foi
  const resolved = schedule.resolvedByTask.get(task.id) ?? [];
  const lastBlock = resolved.length > 0 ? resolved[resolved.length - 1]!.block : null;
  const assignees = (lastBlock?.assignments ?? [])
    .map((a) => resources.find((r) => r.id === a.resourceId)?.name ?? '?')
    .map(initials);

  // — glisser-déposer : réordonner / ré-indenter
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: MovePosition = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'child';
    if (dropIndicator?.taskId !== task.id || dropIndicator.position !== position) {
      onDropIndicator({ taskId: task.id, position });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/crewgantt-task');
    if (sourceId && dropIndicator) {
      moveTask(sourceId, task.id, dropIndicator.position);
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
    ...convertEntries,
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

  const dropClass =
    dropIndicator?.taskId === task.id
      ? dropIndicator.position === 'before'
        ? 'shadow-[inset_0_2px_0_var(--color-accent)]'
        : dropIndicator.position === 'after'
          ? 'shadow-[inset_0_-2px_0_var(--color-accent)]'
          : 'bg-accent-wash'
      : '';

  return (
    <div
      className={`group/row relative flex h-6 items-center border-b border-line/60 text-[12.5px] ${
        selected ? 'bg-accent-wash/60' : hovered ? 'bg-ink/[0.03]' : 'bg-surface'
      } ${dropClass}`}
      onClick={() => selectTask(task.id)}
      onDoubleClick={() => onOpenPanel(task.id)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      onDragOver={onDragOver}
      onDragLeave={() => onDropIndicator(null)}
      onDrop={onDrop}
    >
      {/* Nom (indentation, pli, type) */}
      <div
        className="flex min-w-0 items-center gap-0.5 pr-1"
        style={{ width: COLS.name, paddingLeft: 6 + depth * 16 }}
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
          <EditableText value={task.name} onCommit={(name) => updateTask(task.id, { name })} />
        </span>
        {conflicts && conflicts.length > 0 && (
          <span
            className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white"
            title={conflicts.map((c) => t(`conflicts.types.${c.type}`)).join(' · ')}
          >
            {conflicts.length}
          </span>
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

      {/* « + » par niveau, sous la ligne sélectionnée : choisir directement la profondeur */}
      {selected && (
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

      {/* Projet */}
      <div className="flex items-center gap-1.5 px-1" style={{ width: COLS.project }}>
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
            onChange={(e) => setTaskProject(task.id, e.target.value)}
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

      {/* Estim / Effort / Reste */}
      <div style={{ width: COLS.estimate }} className="px-0.5">
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
      <div style={{ width: COLS.effort }} className="px-0.5">
        {task.type === 'task' ? (
          <EditableNumber
            value={task.effort}
            onCommit={(v) => setTaskEffort(task.id, v ?? 0)}
            className={
              task.estimate !== null && task.effort > task.estimate ? 'text-danger' : undefined
            }
          />
        ) : task.type === 'group' && agg ? (
          <span className="block px-1 text-right font-mono text-ink-soft">
            {fmtDays(agg.effortTotal)}
          </span>
        ) : (
          <span className="block px-1 text-right font-mono text-ink-faint">—</span>
        )}
      </div>
      <div style={{ width: COLS.remaining }} className="px-0.5">
        {task.type === 'task' ? (
          <EditableNumber value={task.remaining} onCommit={(v) => setTaskRemaining(task.id, v ?? 0)} />
        ) : task.type === 'group' && agg ? (
          <span className="block px-1 text-right font-mono text-ink-soft">
            {fmtDays(agg.effortTotal - agg.effortRealized)}
          </span>
        ) : (
          <span className="block px-1 text-right font-mono text-ink-faint">—</span>
        )}
      </div>

      {/* Affectés */}
      <div className="flex items-center gap-0.5 overflow-hidden px-1" style={{ width: COLS.assignees }}>
        {assignees.length > 0 ? (
          assignees.map((a, i) => (
            <span
              key={i}
              className="inline-flex h-[18px] items-center rounded-full bg-paper-deep px-1.5 font-mono text-[10px] font-medium text-ink-soft"
            >
              {a}
            </span>
          ))
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>

      {/* Début / Fin */}
      <div style={{ width: COLS.start }} className="px-1 text-right font-mono text-[11.5px] text-ink-soft">
        {fmtDay(span?.start)}
      </div>
      <div style={{ width: COLS.end }} className="px-1 text-right font-mono text-[11.5px] text-ink-soft">
        {fmtDay(span?.end)}
      </div>

      {/* Statut */}
      <div className="flex items-center gap-1.5 px-1.5" style={{ width: COLS.status }}>
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
            </select>
          </>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={addEntries} onClose={() => setMenu(null)} />}
    </div>
  );
}
