import { useMemo, useState } from 'react';
import { addDays, mondayOf, todayIso } from '@/core/calendar/dates';
import { buildMeetingSnapshot, progressSince, type ProgressSince } from '@/core/diff/diff';
import { maskedTaskIds } from '@/core/model/visibility';
import type { IsoDate, JournalEntry, Resource, Task } from '@/core/model/types';
import { hasUpcomingLoad } from '@/core/scheduler/workload';
import { useAppStore } from '@/state/store';
import { useSchedule } from '@/state/schedule';
import { closeMeeting, meetingReference, quickAbsence, quickShareChange } from '@/state/meetingActions';
import { setTaskProgress, setTaskRemaining, setTaskStatus, updateTask } from '@/state/taskActions';
import { ProjectFilter } from '@/ui/app/ProjectFilter';
import { EditableNumber } from '@/ui/common/inline';
import { IconCheck, IconExchange, IconNote, IconTarget, IconWarning } from '@/ui/common/icons';
import { Avatar } from '@/ui/common/Avatar';
import { BlockAssignPopover } from '@/ui/common/BlockAssignPopover';
import { PriorityDot } from '@/ui/common/PriorityDot';
import { TaskPanel } from '@/ui/gantt/TaskPanel';
import { t } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';
import type { Schedule } from '@/core/scheduler/schedule';

interface PersonTasks {
  current: Task[];
  late: Task[];
  soon: Task[];
  /** Terminées depuis la réunion précédente. */
  done: Task[];
  /** Reportées depuis la réunion précédente, pas déjà listées ailleurs. */
  postponed: Task[];
}

/**
 * Tâches qu'on suit en réunion : tâches simples qui comptent (ni annulées, ni d'un projet archivé),
 * hors tâches masquées (« hors vue »), filtrées par projet.
 */
function meetingTasks(schedule: Schedule, filter: Set<string> | null): Task[] {
  const masked = maskedTaskIds(schedule.ctx.file.tasks);
  return schedule.ctx.file.tasks.filter(
    (task) =>
      task.type === 'task' &&
      schedule.ctx.isCounted(task) &&
      !masked.has(task.id) &&
      (!filter || filter.has(task.projectId)),
  );
}

function sortedResolved(schedule: Schedule, task: Task) {
  return [...(schedule.resolvedByTask.get(task.id) ?? [])].sort((a, b) => a.from.localeCompare(b.from));
}

function categorize(
  schedule: Schedule,
  tasks: Task[],
  resourceId: string,
  date: IsoDate,
  progress: ProgressSince,
): PersonTasks {
  const out: PersonTasks = { current: [], late: [], soon: [], done: [], postponed: [] };
  const weekStart = mondayOf(date);
  const weekEnd = addDays(weekStart, 6);
  for (const task of tasks) {
    const resolved = sortedResolved(schedule, task);
    const mine = resolved.filter((r) => r.block.assignments.some((a) => a.resourceId === resourceId));
    if (mine.length === 0) continue;
    const last = resolved[resolved.length - 1]!;
    const onCurrentTeam = last.block.assignments.some((a) => a.resourceId === resourceId);
    if (task.status === 'done') {
      if (progress.done.has(task.id)) out.done.push(task);
      continue;
    }
    if (mine.some((r) => r.from <= date && date <= r.to)) {
      out.current.push(task);
    } else if (onCurrentTeam && last.to < date && task.remaining > 0) {
      out.late.push(task);
    } else if (onCurrentTeam && mine.some((r) => r.from > date && r.from <= weekEnd)) {
      out.soon.push(task);
    } else if (onCurrentTeam && progress.postponed.has(task.id)) {
      out.postponed.push(task);
    }
  }
  return out;
}

/** Tâches à venir sans personne : dernier bloc sans affecté (ou pas de bloc ni d'équipe prévue). */
function unassignedTasks(schedule: Schedule, tasks: Task[]): Task[] {
  return tasks.filter((task) => {
    if (task.status === 'done') return false;
    const resolved = sortedResolved(schedule, task);
    if (resolved.length === 0) return (task.plannedAssignments?.length ?? 0) === 0;
    return resolved[resolved.length - 1]!.block.assignments.length === 0;
  });
}

export function MeetingTab() {
  const [closedMsg, setClosedMsg] = useState<string | null>(null);
  const [meetingNote, setMeetingNote] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const schedule = useSchedule();
  const file = useAppStore((s) => s.file);
  const fileAtLoad = useAppStore((s) => s.fileAtLoad);
  const resources = file.resources;
  const journal = file.journal;
  const projectFilter = file.ui.projectFilter;
  const filter = projectFilter ? new Set(projectFilter) : null;
  const reviewDate = useAppStore((s) => s.reviewDate);
  const setReviewDate = useAppStore((s) => s.setReviewDate);
  const clearReviewDate = useAppStore((s) => s.clearReviewDate);
  const today = todayIso();
  const date = reviewDate ?? today;

  // Base de comparaison : la dernière réunion close (son instantané), sinon le fichier à l'ouverture.
  const reference = useMemo(() => meetingReference(file, fileAtLoad, date), [file.journal, fileAtLoad, date]);
  const progress = useMemo(
    () => progressSince(reference.snapshot, buildMeetingSnapshot(schedule)),
    [reference, schedule],
  );
  const sinceLabel = reference.since ? fmtDay(reference.since) : null;

  const tasks = meetingTasks(schedule, filter);
  const detailTask = detailTaskId ? (schedule.hierarchy.tasksById.get(detailTaskId) ?? null) : null;
  const unassigned = unassignedTasks(schedule, tasks);

  // La date de réunion est une simple vue : la changer ne modifie rien dans le fichier (R1) — les
  // restes sont vus à cette date, et reviennent tels quels en revenant à aujourd'hui.
  function changeDate(value: string) {
    if (value) setReviewDate(value);
  }

  function handleClose() {
    if (!window.confirm(t('meeting.closeConfirm'))) return;
    const summary = closeMeeting(meetingNote, date);
    clearReviewDate(); // la clôture remet la date du jour (trait masqué)
    setClosedMsg(t('meeting.closed', { count: summary.length }));
    setMeetingNote('');
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-xl font-bold">{t('meeting.title')}</h1>
            <input
              type="date"
              className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-sm outline-none focus:border-accent"
              value={date}
              title={reviewDate && reviewDate !== today ? t('meeting.reviewHint') : undefined}
              onChange={(e) => changeDate(e.target.value)}
            />
            {reviewDate && reviewDate !== today && (
              <button
                className="rounded-lg border border-line p-1.5 text-ink-soft transition hover:border-accent hover:text-accent"
                title={t('meeting.backToToday')}
                aria-label={t('meeting.backToToday')}
                onClick={clearReviewDate}
              >
                <IconTarget size={14} />
              </button>
            )}
            <ProjectFilter />
            <span className="flex-1" />
            <button
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-deep"
              onClick={handleClose}
            >
              {t('meeting.close')}
            </button>
          </header>

          {/* Note de réunion globale permanente */}
          <div className="rounded-xl border border-line bg-surface p-3 shadow-panel">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
              {t('meeting.note')}
            </p>
            <textarea
              className="w-full resize-none rounded border border-line bg-paper px-2 py-1.5 text-[12.5px] outline-none focus:border-accent"
              rows={2}
              placeholder={t('meeting.notePlaceholder')}
              value={meetingNote}
              onChange={(e) => setMeetingNote(e.target.value)}
            />
          </div>

          {closedMsg && (
            <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[13px] text-ok">
              {closedMsg}
            </p>
          )}

          {resources.map((resource) => {
            const personTasks = categorize(schedule, tasks, resource.id, date, progress);
            const stillBusy =
              personTasks.current.length + personTasks.late.length + personTasks.soon.length > 0 ||
              hasUpcomingLoad(schedule.loadIndex, resource.id, date);
            // Ressource masquée (personne partie…) : absente, sauf si elle porte encore du travail.
            if (resource.hidden && !stillBusy) return null;
            return (
              <PersonSection
                key={resource.id}
                resource={resource}
                date={date}
                schedule={schedule}
                tasks={personTasks}
                progress={progress}
                sinceLabel={sinceLabel}
                onOpenDetail={setDetailTaskId}
              />
            );
          })}

          {unassigned.length > 0 && (
            <section className="rounded-xl border border-dashed border-line bg-surface shadow-panel">
              <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                <span className="font-display text-[15px] font-semibold text-ink-soft">{t('meeting.unassigned')}</span>
              </header>
              <div className="px-4 py-2">
                <TaskGroup label={t('meeting.unassigned')} tasks={unassigned} tone="danger" schedule={schedule} progress={progress} onOpenDetail={setDetailTaskId} />
              </div>
            </section>
          )}

          <JournalSection journal={journal} />
        </div>
      </div>

      {/* Panneau de détail de tâche */}
      {detailTask && (
        <TaskPanel
          task={detailTask}
          schedule={schedule}
          onClose={() => setDetailTaskId(null)}
        />
      )}
    </div>
  );
}

function PersonSection({
  resource,
  date,
  schedule,
  tasks,
  progress,
  sinceLabel,
  onOpenDetail,
}: {
  resource: Resource;
  date: IsoDate;
  schedule: Schedule;
  tasks: PersonTasks;
  progress: ProgressSince;
  sinceLabel: string | null;
  onOpenDetail: (id: string) => void;
}) {
  const presence = schedule.ctx.presence(resource.id, date);
  const [quickForm, setQuickForm] = useState<'absence' | 'share' | null>(null);

  const isEmpty =
    tasks.current.length + tasks.late.length + tasks.soon.length + tasks.done.length + tasks.postponed.length === 0;
  const doneLabel = sinceLabel ? t('meeting.doneSince', { date: sinceLabel }) : t('meeting.doneSinceLoad');
  const postponedLabel = sinceLabel
    ? t('meeting.postponedSince', { date: sinceLabel })
    : t('meeting.postponedSinceLoad');

  return (
    <section className={`rounded-xl border border-line bg-surface shadow-panel ${resource.hidden ? 'opacity-75' : ''}`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span className={presence === 0 ? 'opacity-50 line-through' : ''}>
          <Avatar resource={resource} size="md" />
        </span>
        <span className="font-display text-[15px] font-semibold">{resource.name}</span>
        {presence === 0 && (
          <span className="rounded bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint">{t('meeting.absent')}</span>
        )}
        {resource.hidden && (
          <span className="rounded bg-warn-wash px-1.5 py-0.5 text-[10.5px] text-warn" title={t('team.hiddenStillAssigned')}>
            {t('meeting.hiddenPerson')}
          </span>
        )}
        <span className="flex-1" />
        <button
          className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
          onClick={() => setQuickForm(quickForm === 'absence' ? null : 'absence')}
        >
          {t('meeting.absence')}
        </button>
        <button
          className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
          onClick={() => setQuickForm(quickForm === 'share' ? null : 'share')}
        >
          {t('meeting.shareChange')}
        </button>
      </header>

      {quickForm === 'absence' && (
        <QuickAbsenceForm resourceId={resource.id} date={date} onDone={() => setQuickForm(null)} />
      )}
      {quickForm === 'share' && (
        <QuickShareForm resourceId={resource.id} date={date} onDone={() => setQuickForm(null)} />
      )}

      <div className="px-4 py-2">
        {isEmpty && <p className="py-1 text-[12px] text-ink-faint">{t('meeting.nothing')}</p>}
        <TaskGroup label={t('meeting.inProgress')} tasks={tasks.current} tone="ok" schedule={schedule} progress={progress} onOpenDetail={onOpenDetail} />
        <TaskGroup label={t('meeting.late')} tasks={tasks.late} tone="danger" schedule={schedule} progress={progress} onOpenDetail={onOpenDetail} />
        <TaskGroup label={t('meeting.startingSoon')} tasks={tasks.soon} tone="soft" schedule={schedule} progress={progress} onOpenDetail={onOpenDetail} />
        <TaskGroup label={postponedLabel} tasks={tasks.postponed} tone="warn" schedule={schedule} progress={progress} onOpenDetail={onOpenDetail} />
        <TaskGroup label={doneLabel} tasks={tasks.done} tone="done" schedule={schedule} progress={progress} onOpenDetail={onOpenDetail} />
      </div>
    </section>
  );
}

function TaskGroup({
  label,
  tasks,
  tone,
  schedule,
  progress,
  onOpenDetail,
}: {
  label: string;
  tasks: Task[];
  tone: 'ok' | 'danger' | 'soft' | 'warn' | 'done';
  schedule: Schedule;
  progress: ProgressSince;
  onOpenDetail: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  const toneClass =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'ok'
        ? 'text-accent-deep'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'done'
            ? 'text-ok'
            : 'text-ink-faint';
  return (
    <div className="mb-2">
      {/* En-tête : libellé groupe + colonnes alignées sur les données */}
      <div className={`mb-1 flex items-center gap-2 px-2 text-[10.5px] font-semibold uppercase tracking-wider ${toneClass}`}>
        {/* pastille invisible pour aligner avec les points couleur des TaskLine */}
        <span className="h-2.5 w-2.5 shrink-0" />
        <span className="flex-1">{label} ({tasks.length})</span>
        <span className="w-[120px] shrink-0 text-center text-ink-faint">{t('meeting.colPeriod')}</span>
        <span className="w-[58px] shrink-0 text-center text-ink-faint">{t('columns.remaining')}</span>
        <span className="w-[54px] shrink-0 text-center text-ink-faint">{t('columns.progress')}</span>
        <span className="w-[62px] shrink-0" />
      </div>
      {tasks.map((task) => (
        <TaskLine
          key={task.id}
          task={task}
          schedule={schedule}
          postponedBy={progress.postponed.get(task.id)}
          readOnly={tone === 'done'}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}

function TaskLine({
  task,
  schedule,
  postponedBy,
  readOnly,
  onOpenDetail,
}: {
  task: Task;
  schedule: Schedule;
  /** Recul de la fin depuis la réunion précédente (jours), s'il y en a un. */
  postponedBy?: number;
  /** Tâche terminée : rappel seulement, sans actions. */
  readOnly?: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const projects = useAppStore((s) => s.file.projects);
  const color = projects.find((p) => p.id === task.projectId)?.color ?? '#888';
  const span = schedule.spanByTask.get(task.id);
  const [assign, setAssign] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="group/line flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-paper/70" onDoubleClick={() => onOpenDetail(task.id)}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${readOnly ? 'text-ink-soft line-through decoration-ink-faint/60' : ''}`}>
        <PriorityDot priority={task.priority} />
        {task.priority !== 'normal' && task.priority !== 'hidden' && ' '}
        {task.name}
        {task.status === 'blocked' && (
          <span className="ml-2 rounded bg-danger-wash px-1.5 py-0.5 text-[10px] font-semibold text-danger">
            {t('tasks.status.blocked')}
          </span>
        )}
        {postponedBy !== undefined && !readOnly && (
          <span className="ml-2 rounded bg-warn-wash px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">
            {t('meeting.postponedBy', { days: postponedBy })}
          </span>
        )}
      </span>
      {/* Période */}
      <span className="w-[120px] shrink-0 text-center font-mono text-[11px] text-ink-faint">
        {fmtDay(span?.start)}–{fmtDay(span?.end)}
      </span>
      {/* Reste (vu à la date de réunion) */}
      <span className="w-[58px] shrink-0">
        {readOnly ? (
          <span className="block text-right font-mono text-[11px] text-ink-faint">—</span>
        ) : (
          <EditableNumber value={task.remaining} onCommit={(v) => setTaskRemaining(task.id, v ?? 0)} />
        )}
      </span>
      {/* Avancement (saisi, indépendant du réalisé/reste) */}
      <span className="w-[54px] shrink-0 text-center">
        <EditableNumber
          value={Math.round(task.progress * 100)}
          onCommit={(v) => setTaskProgress(task.id, (v ?? 0) / 100)}
          suffix="%"
        />
      </span>
      {/* Actions (M8 : bouton Détail supprimé — double-clic sur la ligne ouvre le panneau) */}
      <span className="flex w-[62px] shrink-0 items-center gap-0.5 opacity-50 transition group-hover/line:opacity-100">
        {!readOnly && (
          <>
            <button
              className="rounded p-1 text-ok transition hover:bg-ok/10"
              title={t('meeting.markDone')}
              onClick={() => setTaskStatus(task.id, 'done')}
            >
              <IconCheck size={13} />
            </button>
            <button
              className="rounded p-1 text-warn transition hover:bg-warn-wash"
              title={t('meeting.markBlocked')}
              onClick={() => setTaskStatus(task.id, task.status === 'blocked' ? 'in_progress' : 'blocked')}
            >
              <IconWarning size={13} />
            </button>
            <button
              className="rounded p-1 text-ink-soft transition hover:bg-paper-deep"
              title={t('meeting.reassign')}
              aria-label={t('meeting.reassign')}
              onClick={(e) => setAssign({ x: e.clientX, y: e.clientY })}
            >
              <IconExchange size={13} />
            </button>
          </>
        )}
        <button
          className="rounded p-1 text-ink-soft transition hover:bg-paper-deep"
          title={t('meeting.addNote')}
          onClick={() => {
            const text = window.prompt(t('meeting.notePrompt', { task: task.name }));
            if (text?.trim()) {
              updateTask(task.id, { notes: [...task.notes, { date: todayIso(), text: text.trim() }] });
            }
          }}
        >
          <IconNote size={13} />
        </button>
      </span>
      {assign && (
        <BlockAssignPopover
          x={assign.x}
          y={assign.y}
          taskIds={[task.id]}
          schedule={schedule}
          onClose={() => setAssign(null)}
        />
      )}
    </div>
  );
}

function QuickAbsenceForm({
  resourceId,
  date,
  onDone,
}: {
  resourceId: string;
  date: IsoDate;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState('');
  const [percent, setPercent] = useState(0);

  return (
    <div className="flex items-center gap-2 border-b border-line bg-warn-wash/40 px-4 py-2 text-[12px]">
      <span className="text-ink-soft">{t('meeting.absenceFrom')}</span>
      <input type="date" className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[11.5px]" value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="text-ink-soft">{t('meeting.absenceTo')}</span>
      <input type="date" className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[11.5px]" value={to} onChange={(e) => setTo(e.target.value)} />
      <select
        className="rounded border border-line bg-surface px-1 py-0.5 text-[11.5px]"
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
      >
        <option value={0}>{t('meeting.absence0')}</option>
        <option value={50}>{t('meeting.absence50')}</option>
        <option value={100}>{t('meeting.absence100')}</option>
      </select>
      <button
        className="rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
        onClick={() => {
          quickAbsence(resourceId, from, to || undefined, percent, '');
          onDone();
        }}
      >
        {t('common.apply')}
      </button>
      <button className="text-[11.5px] text-ink-faint hover:text-ink" onClick={onDone}>
        {t('common.cancel')}
      </button>
    </div>
  );
}

function QuickShareForm({
  resourceId,
  date,
  onDone,
}: {
  resourceId: string;
  date: IsoDate;
  onDone: () => void;
}) {
  const projects = useAppStore((s) => s.file.projects).filter((p) => !p.archived);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [percent, setPercent] = useState(50);
  const [from, setFrom] = useState(date);

  return (
    <div className="flex items-center gap-2 border-b border-line bg-accent-wash/40 px-4 py-2 text-[12px]">
      <span className="text-ink-soft">{t('meeting.shareOn')}</span>
      <select
        className="rounded border border-line bg-surface px-1 py-0.5 text-[11.5px]"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="text-ink-soft">{t('meeting.shareAt')}</span>
      <input
        type="number"
        className="w-16 rounded border border-line bg-surface px-1 py-0.5 text-right font-mono text-[11.5px]"
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
      />
      <span className="text-ink-soft">%</span>
      <span className="text-ink-soft">{t('meeting.shareFromDate')}</span>
      <input type="date" className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[11.5px]" value={from} onChange={(e) => setFrom(e.target.value)} />
      <button
        className="rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
        onClick={() => {
          if (projectId) quickShareChange(resourceId, projectId, percent, from);
          onDone();
        }}
      >
        {t('common.apply')}
      </button>
      <button className="text-[11.5px] text-ink-faint hover:text-ink" onClick={onDone}>
        {t('common.cancel')}
      </button>
    </div>
  );
}

function JournalSection({ journal }: { journal: readonly JournalEntry[] }) {
  const entries = [...journal].reverse();
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <h2 className="mb-2 font-display text-[15px] font-semibold">{t('meeting.journal')}</h2>
      {entries.length === 0 && <p className="text-[12px] text-ink-faint">{t('meeting.journalEmpty')}</p>}
      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div key={i} className="border-l-2 border-accent/40 pl-3">
            <p className="font-mono text-[11px] font-medium text-accent-deep">{fmtDay(entry.date)}</p>
            <ul className="mt-0.5 list-inside list-disc text-[12.5px] text-ink">
              {entry.summary.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
            {entry.note && <p className="mt-0.5 text-[12px] italic text-ink-soft">{entry.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
