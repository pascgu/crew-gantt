import { useEffect, useState } from 'react';
import { addDays, mondayOf, todayIso } from '@/core/calendar/dates';
import { taskProgress } from '@/core/scheduler/groups';
import type { IsoDate, JournalEntry, Resource, Task } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { useSchedule } from '@/state/schedule';
import {
  closeMeeting,
  ensureMeetingSession,
  quickAbsence,
  quickShareChange,
  reassignTask,
} from '@/state/meetingActions';
import { setTaskProgress, setTaskRemaining, setTaskStatus, updateTask } from '@/state/taskActions';
import { ProjectFilter } from '@/ui/app/ProjectFilter';
import { EditableNumber } from '@/ui/common/inline';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import { IconCheck, IconNote, IconWarning } from '@/ui/common/icons';
import { t } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';
import type { Schedule } from '@/core/scheduler/schedule';

interface PersonTasks {
  current: Task[];
  late: Task[];
  soon: Task[];
}

function categorize(schedule: Schedule, resourceId: string, date: IsoDate, filter: Set<string> | null): PersonTasks {
  const out: PersonTasks = { current: [], late: [], soon: [] };
  const weekStart = mondayOf(date);
  const weekEnd = addDays(weekStart, 6);
  for (const task of schedule.ctx.file.tasks) {
    if (task.type !== 'task' || task.status === 'done') continue;
    if (filter && !filter.has(task.projectId)) continue;
    const resolved = [...(schedule.resolvedByTask.get(task.id) ?? [])].sort((a, b) =>
      a.from.localeCompare(b.from),
    );
    const mine = resolved.filter((r) => r.block.assignments.some((a) => a.resourceId === resourceId));
    if (mine.length === 0) continue;
    const last = resolved[resolved.length - 1]!;
    const onCurrentTeam = last.block.assignments.some((a) => a.resourceId === resourceId);
    if (mine.some((r) => r.from <= date && date <= r.to)) {
      out.current.push(task);
    } else if (onCurrentTeam && last.to < date && task.remaining > 0) {
      // en retard : du reste à faire, mais plus aucun bloc planifié devant soi
      out.late.push(task);
    } else if (onCurrentTeam) {
      const next = mine.find((r) => r.from > date);
      if (next && next.from <= weekEnd) out.soon.push(task);
    }
  }
  return out;
}

export function MeetingTab() {
  const [date, setDate] = useState(todayIso());
  const [closedMsg, setClosedMsg] = useState<string | null>(null);
  const schedule = useSchedule();
  const resources = useAppStore((s) => s.file.resources);
  const journal = useAppStore((s) => s.file.journal);
  const projectFilter = useAppStore((s) => s.file.ui.projectFilter);
  const filter = projectFilter ? new Set(projectFilter) : null;

  useEffect(() => ensureMeetingSession(), []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <header className="flex items-center gap-4">
          <h1 className="font-display text-xl font-bold">{t('meeting.title')}</h1>
          <input
            type="date"
            className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-sm outline-none focus:border-accent"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <ProjectFilter />
          <span className="flex-1" />
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-deep"
            onClick={() => {
              const note = window.prompt(t('meeting.closeNote'), '') ?? '';
              const summary = closeMeeting(note);
              setClosedMsg(t('meeting.closed', { count: summary.length }));
            }}
          >
            {t('meeting.close')}
          </button>
        </header>

        {closedMsg && (
          <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[13px] text-ok">
            {closedMsg}
          </p>
        )}

        {resources.map((resource) => (
          <PersonSection
            key={resource.id}
            resource={resource}
            date={date}
            schedule={schedule}
            tasks={categorize(schedule, resource.id, date, filter)}
          />
        ))}

        <JournalSection journal={journal} />
      </div>
    </div>
  );
}

function PersonSection({
  resource,
  date,
  schedule,
  tasks,
}: {
  resource: Resource;
  date: IsoDate;
  schedule: Schedule;
  tasks: PersonTasks;
}) {
  const presence = schedule.ctx.presence(resource.id, date);
  const [quickForm, setQuickForm] = useState<'absence' | 'share' | null>(null);

  const isEmpty = tasks.current.length + tasks.late.length + tasks.soon.length === 0;

  return (
    <section className="rounded-xl border border-line bg-surface shadow-panel">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-[13px] font-bold ${
            presence > 0 ? 'bg-accent-wash text-accent-deep' : 'bg-paper-deep text-ink-faint line-through'
          }`}
        >
          {resource.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-display text-[15px] font-semibold">{resource.name}</span>
        {presence === 0 && (
          <span className="rounded bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint">absent(e)</span>
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
        <TaskGroup label={t('meeting.inProgress')} tasks={tasks.current} tone="ok" date={date} schedule={schedule} />
        <TaskGroup label={t('meeting.late')} tasks={tasks.late} tone="danger" date={date} schedule={schedule} />
        <TaskGroup label={t('meeting.startingSoon')} tasks={tasks.soon} tone="soft" date={date} schedule={schedule} />
      </div>
    </section>
  );
}

function TaskGroup({
  label,
  tasks,
  tone,
  date,
  schedule,
}: {
  label: string;
  tasks: Task[];
  tone: 'ok' | 'danger' | 'soft';
  date: IsoDate;
  schedule: Schedule;
}) {
  if (tasks.length === 0) return null;
  const toneClass =
    tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-accent-deep' : 'text-ink-faint';
  return (
    <div className="mb-2">
      <p className={`mb-1 text-[10.5px] font-semibold uppercase tracking-wider ${toneClass}`}>
        {label} ({tasks.length})
      </p>
      {tasks.map((task) => (
        <TaskLine key={task.id} task={task} date={date} schedule={schedule} />
      ))}
    </div>
  );
}

function TaskLine({ task, date, schedule }: { task: Task; date: IsoDate; schedule: Schedule }) {
  const projects = useAppStore((s) => s.file.projects);
  const resources = useAppStore((s) => s.file.resources);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const color = projects.find((p) => p.id === task.projectId)?.color ?? '#888';
  const span = schedule.spanByTask.get(task.id);
  const progress = Math.round(taskProgress(task) * 100);

  const reassignEntries: MenuEntry[] = resources.map((r) => ({
    label: `→ ${r.name} (100 %)`,
    onClick: () => reassignTask(task.id, [{ resourceId: r.id, units: 100 }], date),
  }));

  return (
    <div className="group/line flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-paper/70">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {task.name}
        {task.status === 'blocked' && (
          <span className="ml-2 rounded bg-danger-wash px-1.5 py-0.5 text-[10px] font-semibold text-danger">
            {t('tasks.status.blocked')}
          </span>
        )}
      </span>
      <span className="font-mono text-[11px] text-ink-faint">
        {fmtDay(span?.start)}–{fmtDay(span?.end)}
      </span>
      <label className="flex items-center gap-1 text-[11.5px] text-ink-soft">
        {t('meeting.remaining')}
        <span className="w-12">
          <EditableNumber value={task.remaining} onCommit={(v) => setTaskRemaining(task.id, v ?? 0)} />
        </span>
      </label>
      <label className="flex items-center gap-1 text-[11.5px] text-ink-soft">
        <span className="w-12">
          <EditableNumber value={progress} suffix=" %" max={100} onCommit={(v) => setTaskProgress(task.id, v ?? 0)} />
        </span>
      </label>
      <span className="flex shrink-0 items-center gap-0.5 opacity-50 transition group-hover/line:opacity-100">
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
        <button
          className="rounded border border-accent/40 px-1.5 py-0.5 text-[11px] font-medium text-accent transition hover:bg-accent-wash"
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        >
          {t('meeting.reassign')}
        </button>
      </span>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} entries={reassignEntries} onClose={() => setMenu(null)} />
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
        <option value={0}>0 % (absent)</option>
        <option value={50}>50 % (demi-journée)</option>
        <option value={100}>100 % (jour travaillé)</option>
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

