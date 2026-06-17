import { useState } from 'react';
import { todayIso } from '@/core/calendar/dates';
import { taskProgress } from '@/core/scheduler/groups';
import { realizedOf, scheduledEffort } from '@/core/scheduler/blocks';
import type { Schedule } from '@/core/scheduler/schedule';
import type { Task, TaskLink } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import {
  addBlockToTask,
  addLink,
  deleteBlock,
  deleteTask,
  initEffortFromEstimate,
  removeLink,
  setBlockAssignments,
  setBlockDates,
  setTaskEffort,
  setTaskProgress,
  setTaskRemaining,
  updateLink,
  updateTask,
} from '@/state/taskActions';
import { DateInput, EditableNumber, EditableText } from '@/ui/common/inline';
import { IconClose, IconPlus } from '@/ui/common/icons';
import { AssignmentAssistant } from '@/ui/team/AssignmentAssistant';
import { t } from '@/i18n/fr';
import { fmtDayFull, taskColor, weeklyEquivalent } from './format';

interface TaskPanelProps {
  task: Task;
  schedule: Schedule;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12.5px]">
      <span className="text-ink-soft">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </label>
  );
}

export function TaskPanel({ task, schedule, onClose }: TaskPanelProps) {
  const resources = useAppStore((s) => s.file.resources);
  const tasks = useAppStore((s) => s.file.tasks);
  const projects = useAppStore((s) => s.file.projects);
  const [newNote, setNewNote] = useState('');
  const [linkTarget, setLinkTarget] = useState('');

  const resolved = schedule.resolvedByTask.get(task.id) ?? [];
  const earliest = schedule.earliestByTask.get(task.id);
  const progress = Math.round(taskProgress(task) * 100);
  const isTask = task.type === 'task';

  const linkCandidates = tasks.filter(
    (other) => other.id !== task.id && !task.links.some((l) => l.on === other.id),
  );

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface shadow-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
          {t(`tasks.type.${task.type}`)}
        </span>
        <span className="min-w-0 flex-1 font-display text-sm font-semibold">
          <EditableText value={task.name} onCommit={(name) => updateTask(task.id, { name })} bold />
        </span>
        <button className="rounded p-1 text-ink-soft hover:bg-paper-deep hover:text-ink" onClick={onClose}>
          <IconClose size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Description & prérequis */}
        <Section title={t('panel.description')}>
          <textarea
            className="w-full resize-none rounded border border-line bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-accent"
            rows={2}
            value={task.description}
            onChange={(e) => updateTask(task.id, { description: e.target.value })}
          />
          <p className="mb-1 mt-2 text-[11px] font-medium text-ink-soft">
            {t('panel.requirements')}
          </p>
          <textarea
            className="w-full resize-none rounded border border-warn/40 bg-warn-wash/40 px-2 py-1 text-[12.5px] outline-none focus:border-warn"
            rows={2}
            value={task.requirements}
            placeholder={t('panel.requirementsHint')}
            onChange={(e) => updateTask(task.id, { requirements: e.target.value })}
          />
        </Section>

        {/* Effort */}
        {isTask && (
          <Section title={t('panel.scheduling')}>
            <Field label={t('panel.scheduling')}>
              <select
                className="rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] outline-none"
                value={task.scheduling}
                onChange={(e) =>
                  updateTask(task.id, { scheduling: e.target.value as Task['scheduling'] })
                }
              >
                <option value="effort">{t('panel.schedulingEffort')}</option>
                <option value="fixed">{t('panel.schedulingFixed')}</option>
              </select>
            </Field>
            <Field label={t('panel.estimate')}>
              <span className="w-16">
                <EditableNumber
                  value={task.estimate}
                  nullable
                  onCommit={(v) => updateTask(task.id, { estimate: v })}
                />
              </span>
            </Field>
            <Field label={t('panel.effort')}>
              <span className="w-16">
                {task.scheduling === 'effort' ? (
                  <EditableNumber value={task.effort} onCommit={(v) => setTaskEffort(task.id, v ?? 0)} />
                ) : (
                  <span className="block text-right font-mono text-[12.5px] text-ink-soft">
                    {Math.round(scheduledEffort(schedule.ctx, task, resolved) * 10) / 10}
                  </span>
                )}
              </span>
            </Field>
            <Field label={t('panel.realized')}>
              <span className="w-16 text-right font-mono text-[12.5px] text-ink-soft">
                {Math.round(realizedOf(schedule.ctx, task) * 10) / 10}
              </span>
            </Field>
            <Field label={t('panel.remaining')}>
              <span className="w-16">
                {task.scheduling === 'effort' ? (
                  <EditableNumber
                    value={task.remaining}
                    onCommit={(v) => setTaskRemaining(task.id, v ?? 0)}
                  />
                ) : (
                  <span className="block text-right font-mono text-[12.5px] text-ink-soft">
                    {Math.round(Math.max(0, scheduledEffort(schedule.ctx, task, resolved) - realizedOf(schedule.ctx, task)) * 10) / 10}
                  </span>
                )}
              </span>
            </Field>
            <Field label={t('panel.progress')}>
              <span className="flex items-center gap-1" title={t('panel.progressHint')}>
                <EditableNumber
                  value={progress}
                  onCommit={(v) => setTaskProgress(task.id, (v ?? 0) / 100)}
                  suffix="%"
                />
              </span>
            </Field>
            {task.estimate !== null && (
              <button
                className="mt-1 rounded border border-line px-2 py-1 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
                onClick={() => initEffortFromEstimate(task.id)}
              >
                {t('panel.initFromEstimate')}
              </button>
            )}
            <Field label={t('panel.deadline')}>
              <DateInput
                value={task.deadline}
                nullable
                onCommit={(deadline) => updateTask(task.id, { deadline })}
              />
            </Field>
          </Section>
        )}

        {/* Jalon : date posée + suggestion */}
        {task.type === 'milestone' && (
          <Section title={t('panel.milestoneDate')}>
            <Field label={t('panel.milestoneDate')}>
              <DateInput value={task.date} onCommit={(date) => updateTask(task.id, { date })} />
            </Field>
            <Field label={t('panel.milestoneColor')}>
              {task.color !== undefined && (
                <button
                  className="text-[11px] text-ink-faint hover:text-ink"
                  onClick={() => updateTask(task.id, { color: undefined })}
                >
                  {t('panel.milestoneColorReset')}
                </button>
              )}
              <input
                type="color"
                className="h-6 w-8 cursor-pointer rounded border-none bg-transparent"
                value={taskColor(task, projects)}
                onChange={(e) => updateTask(task.id, { color: e.target.value })}
              />
            </Field>
            <Field label={t('panel.milestoneFrieze')}>
              <input
                type="checkbox"
                checked={task.frieze ?? false}
                onChange={(e) => updateTask(task.id, { frieze: e.target.checked })}
              />
            </Field>
            {earliest?.date && (
              <div className="mt-1 flex items-center justify-between rounded bg-accent-wash px-2 py-1.5 text-[12px] text-accent-deep">
                <span>{t('panel.suggestedDate', { date: fmtDayFull(earliest.date) })}</span>
                <button
                  className="rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-deep"
                  onClick={() => updateTask(task.id, { date: earliest.date })}
                >
                  {t('panel.applySuggested')}
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Blocs + affectations */}
        {isTask && (
          <Section title={t('panel.blocks')}>
            <div className="flex flex-col gap-2">
              {[...task.blocks]
                .sort((a, b) => a.from.localeCompare(b.from))
                .map((block) => {
                  const r = resolved.find((rb) => rb.block.id === block.id);
                  return (
                    <div key={block.id} className="rounded-lg border border-line bg-paper/60 p-2">
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <span className="text-ink-soft">{t('panel.blockFrom')}</span>
                        <DateInput
                          value={block.from}
                          onCommit={(v) => v && setBlockDates(task.id, block.id, v, block.to)}
                        />
                        <span className="text-ink-soft">{t('panel.blockTo')}</span>
                        {block.to !== null ? (
                          <DateInput
                            value={block.to}
                            onCommit={(v) => v && setBlockDates(task.id, block.id, block.from, v)}
                          />
                        ) : (
                          <span
                            className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[11px] text-accent-deep"
                            title={t('panel.blockOpenEnd')}
                          >
                            {r ? fmtDayFull(r.to) : '…'} ⚙
                          </span>
                        )}
                        <button
                          className="ml-auto rounded p-0.5 text-ink-faint hover:text-danger"
                          onClick={() => deleteBlock(task.id, block.id)}
                          title={t('gantt.deleteBlock')}
                        >
                          <IconClose size={12} />
                        </button>
                      </div>
                      {/* Affectations du bloc */}
                      <div className="mt-1.5 flex flex-col gap-1">
                        {block.assignments.map((a, ai) => {
                          const equiv = weeklyEquivalent(
                            schedule.ctx,
                            a.resourceId,
                            task.projectId,
                            a.units,
                            block.from,
                          );
                          return (
                            <div key={ai} className="flex items-center gap-1.5 text-[12px]">
                              <select
                                className="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 outline-none"
                                value={a.resourceId}
                                onChange={(e) => {
                                  const next = block.assignments.map((x, i) =>
                                    i === ai ? { ...x, resourceId: e.target.value } : x,
                                  );
                                  setBlockAssignments(task.id, block.id, next);
                                }}
                              >
                                {resources.map((res) => (
                                  <option key={res.id} value={res.id}>
                                    {res.name}
                                  </option>
                                ))}
                              </select>
                              <span className="w-14">
                                <EditableNumber
                                  value={a.units}
                                  suffix=" %"
                                  max={1000}
                                  onCommit={(v) => {
                                    const next = block.assignments.map((x, i) =>
                                      i === ai ? { ...x, units: v ?? 100 } : x,
                                    );
                                    setBlockAssignments(task.id, block.id, next);
                                  }}
                                />
                              </span>
                              <span className="w-20 shrink-0 text-right font-mono text-[11px] text-ink-faint">
                                {t('panel.perWeek', { days: String(equiv).replace('.', ',') })}
                              </span>
                              <button
                                className="rounded p-0.5 text-ink-faint hover:text-danger"
                                onClick={() =>
                                  setBlockAssignments(
                                    task.id,
                                    block.id,
                                    block.assignments.filter((_, i) => i !== ai),
                                  )
                                }
                              >
                                <IconClose size={11} />
                              </button>
                            </div>
                          );
                        })}
                        <AssignmentAssistant
                          task={task}
                          block={block}
                          resolvedTo={r?.to ?? null}
                          schedule={schedule}
                        />
                      </div>
                    </div>
                  );
                })}
              <button
                className="flex items-center gap-1 self-start rounded border border-dashed border-line px-2 py-1 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
                onClick={() => addBlockToTask(task.id, schedule.ctx.nextWorkingDay(todayIso()))}
              >
                <IconPlus size={11} /> {t('gantt.addBlock')}
              </button>
            </div>
          </Section>
        )}

        {/* Liens */}
        {task.type !== 'group' && (
          <Section title={t('links.title')}>
            <div className="flex flex-col gap-1.5">
              {task.links.map((link, li) => {
                const pred = tasks.find((other) => other.id === link.on);
                return (
                  <div key={li} className="rounded-lg border border-line bg-paper/60 p-2 text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <select
                        className="rounded border border-line bg-surface px-1 py-0.5 outline-none"
                        value={link.type}
                        onChange={(e) =>
                          updateLink(task.id, li, { type: e.target.value as TaskLink['type'] })
                        }
                      >
                        <option value="after-end">{t('links.type.after-end')}</option>
                        <option value="with-start">{t('links.type.with-start')}</option>
                        <option value="after-progress">{t('links.type.after-progress')}</option>
                      </select>
                      <span className="min-w-0 flex-1 truncate font-medium">{pred?.name ?? link.on}</span>
                      <button
                        className="rounded p-0.5 text-ink-faint hover:text-danger"
                        onClick={() => removeLink(task.id, li)}
                        title={t('links.remove')}
                      >
                        <IconClose size={11} />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      {link.type === 'after-progress' && (
                        <label className="flex items-center gap-1 text-ink-soft">
                          {t('links.progressDays')}
                          <span className="w-12">
                            <EditableNumber
                              value={link.progressDays ?? 0}
                              onCommit={(v) => updateLink(task.id, li, { progressDays: v ?? 0 })}
                            />
                          </span>
                        </label>
                      )}
                      <label className="flex items-center gap-1 text-ink-soft">
                        {t('links.lag')}
                        <span className="w-12">
                          <EditableNumber
                            value={link.lag}
                            min={-365}
                            onCommit={(v) => updateLink(task.id, li, { lag: v ?? 0 })}
                          />
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-1.5">
                <select
                  className="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-1 text-[12px] outline-none"
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                >
                  <option value="">{t('links.add')}…</option>
                  {linkCandidates.map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded bg-accent px-2 py-1 text-[11.5px] font-medium text-white transition enabled:hover:bg-accent-deep disabled:opacity-40"
                  disabled={!linkTarget}
                  onClick={() => {
                    const error = addLink(task.id, { on: linkTarget, type: 'after-end', lag: 0 });
                    if (error) window.alert(error);
                    setLinkTarget('');
                  }}
                >
                  {t('common.add')}
                </button>
              </div>
              {earliest?.date && (
                <p className="text-[11.5px] text-ink-faint">
                  {t('links.earliest', { date: fmtDayFull(earliest.date) })}
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Notes datées */}
        <Section title={t('panel.notes')}>
          <div className="flex flex-col gap-1">
            {[...task.notes].reverse().map((note, i) => (
              <div key={i} className="rounded bg-paper/80 px-2 py-1 text-[12px]">
                <span className="mr-2 font-mono text-[10.5px] text-ink-faint">
                  {fmtDayFull(note.date)}
                </span>
                {note.text}
              </div>
            ))}
            <div className="flex gap-1.5">
              <input
                className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent"
                value={newNote}
                placeholder={t('panel.addNote')}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newNote.trim()) {
                    updateTask(task.id, {
                      notes: [...task.notes, { date: todayIso(), text: newNote.trim() }],
                    });
                    setNewNote('');
                  }
                }}
              />
            </div>
          </div>
        </Section>

        <div className="px-4 py-3">
          <button
            className="rounded border border-danger/40 px-2.5 py-1 text-[12px] text-danger transition hover:bg-danger-wash"
            onClick={() => {
              if (window.confirm(t('tasks.confirmDelete', { name: task.name }))) {
                deleteTask(task.id);
                onClose();
              }
            }}
          >
            {t('panel.delete')}
          </button>
        </div>
      </div>
    </aside>
  );
}

