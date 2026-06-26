import { useMemo, useState } from 'react';
import { diffDays, todayIso } from '@/core/calendar/dates';
import { totalRemaining } from '@/core/diff/diff';
import type { Project, Task } from '@/core/model/types';
import type { Schedule } from '@/core/scheduler/schedule';
import { useAppStore } from '@/state/store';
import { useConflicts, useSchedule } from '@/state/schedule';
import { activeBaseline } from '@/state/baselineActions';
import { ProjectFilter } from '@/ui/app/ProjectFilter';
import { rgba } from '@/ui/common/color';
import { t } from '@/i18n/fr';
import { fmtDay, fmtDays } from '@/ui/gantt/format';

interface ProjectHealth {
  project: Project;
  driftingMilestones: number;
  lateDeadlines: number;
  blockedTasks: number;
  overrun: number;
  progress: number;
  estimate: number;
  effort: number;
  remaining: number;
  level: 'ok' | 'warn' | 'danger';
}

function computeHealth(schedule: Schedule, project: Project): ProjectHealth {
  const file = schedule.ctx.file;
  const baseline = activeBaseline(file);
  const tasks = file.tasks.filter((tk) => tk.projectId === project.id);
  let driftingMilestones = 0;
  let lateDeadlines = 0;
  let blockedTasks = 0;
  let estimate = 0;
  let effort = 0;
  let remaining = 0;

  for (const task of tasks) {
    if (task.type === 'milestone' && task.date && baseline) {
      const ref = baseline.milestones[task.id];
      if (ref && task.date > ref) driftingMilestones += 1;
    }
    if (task.type !== 'task') continue;
    if (task.status === 'blocked') blockedTasks += 1;
    estimate += task.estimate ?? 0;
    effort += task.effort;
    remaining += task.remaining;
    const span = schedule.spanByTask.get(task.id);
    if (task.deadline && span && span.end > task.deadline) lateDeadlines += 1;
  }
  const overrun = Math.max(0, effort - estimate);
  const level: ProjectHealth['level'] =
    blockedTasks > 0 || lateDeadlines > 0
      ? 'danger'
      : driftingMilestones > 0 || (estimate > 0 && overrun > 0)
        ? 'warn'
        : 'ok';
  return {
    project,
    driftingMilestones,
    lateDeadlines,
    blockedTasks,
    overrun: estimate > 0 ? overrun : 0,
    progress: effort > 0 ? (effort - remaining) / effort : 0,
    estimate,
    effort,
    remaining,
    level,
  };
}

export function DashboardTab() {
  const schedule = useSchedule();
  const [openProject, setOpenProject] = useState<string | null>(null);
  const projects = schedule.ctx.file.projects.filter((p) => !p.archived);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
        {openProject ? (
          <ProjectSheet
            projectId={openProject}
            schedule={schedule}
            onBack={() => setOpenProject(null)}
          />
        ) : (
          <>
            <header className="flex items-center gap-4">
              <h1 className="font-display text-xl font-bold">{t('dashboard.title')}</h1>
              <ProjectFilter />
            </header>
            <div className="grid grid-cols-3 gap-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  health={computeHealth(schedule, p)}
                  onOpen={() => setOpenProject(p.id)}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-5">
              <MilestonesCard schedule={schedule} />
              <div className="flex flex-col gap-5">
                <BurndownCard />
                <AlertsCard schedule={schedule} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const LEVEL_COLOR = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
};

function ProjectCard({ health, onOpen }: { health: ProjectHealth; onOpen: () => void }) {
  const { project } = health;
  const indicators: string[] = [];
  if (health.driftingMilestones > 0)
    indicators.push(t('dashboard.health.driftingMilestones', { count: health.driftingMilestones }));
  if (health.lateDeadlines > 0)
    indicators.push(t('dashboard.health.lateDeadlines', { count: health.lateDeadlines }));
  if (health.blockedTasks > 0)
    indicators.push(t('dashboard.health.blockedTasks', { count: health.blockedTasks }));
  if (health.overrun > 0)
    indicators.push(t('dashboard.health.overrun', { days: fmtDays(health.overrun) }));

  return (
    <button
      className="rounded-xl border border-line bg-surface p-4 text-left shadow-panel transition hover:border-accent/50 hover:shadow-float"
      onClick={onOpen}
      style={{ borderTopColor: project.color, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-[15px] font-semibold">{project.name}</span>
        <span
          className="ml-auto h-3 w-3 rounded-full"
          style={{ background: LEVEL_COLOR[health.level] }}
        />
      </div>
      {/* avancement */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(health.progress * 100)}%`, background: project.color }}
        />
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink-soft">
        {t('dashboard.progress')} {Math.round(health.progress * 100)} % · {t('dashboard.remaining')}{' '}
        {fmtDays(health.remaining)} j-h
      </p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {indicators.length === 0 ? (
          <li className="text-[12px] text-ok">{t('dashboard.health.ok')}</li>
        ) : (
          indicators.map((line, i) => (
            <li key={i} className="text-[12px] text-ink-soft">
              • {line}
            </li>
          ))
        )}
      </ul>
    </button>
  );
}

function MilestonesCard({ schedule }: { schedule: Schedule }) {
  const file = schedule.ctx.file;
  const baseline = activeBaseline(file);
  const filter = file.ui.projectFilter ? new Set(file.ui.projectFilter) : null;
  const milestones = file.tasks.filter(
    (tk) => tk.type === 'milestone' && tk.date && (!filter || filter.has(tk.projectId)),
  );

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <h2 className="mb-3 font-display text-[15px] font-semibold">{t('dashboard.milestones')}</h2>
      {!baseline && <p className="mb-2 text-[11.5px] text-ink-faint">{t('dashboard.noBaseline')}</p>}
      {milestones.length === 0 && <p className="text-[12px] text-ink-faint">{t('dashboard.noMilestones')}</p>}
      <table className="w-full text-[12.5px]">
        <tbody>
          {milestones.map((m) => {
            const ref = baseline?.milestones[m.id];
            const delta = ref && m.date ? diffDays(ref, m.date) : null;
            const badge =
              delta === null ? 'var(--color-line-strong)' : delta <= 0 ? 'var(--color-ok)' : delta <= 5 ? 'var(--color-warn)' : 'var(--color-danger)';
            const project = file.projects.find((p) => p.id === m.projectId);
            return (
              <tr key={m.id} className="border-b border-line/50 last:border-0">
                <td className="py-1.5">
                  <span className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: project?.color }} />
                  <span className="font-medium">{m.name}</span>
                </td>
                <td className="py-1.5 text-right font-mono text-[11.5px] text-ink-faint">{ref ? fmtDay(ref) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-[11.5px]">{fmtDay(m.date)}</td>
                <td className="w-16 py-1.5 text-right">
                  <span
                    className="inline-block min-w-10 rounded-full px-1.5 py-0.5 text-center font-mono text-[10.5px] font-bold text-white"
                    style={{ background: badge }}
                  >
                    {delta === null ? '—' : delta > 0 ? `+${delta} j` : `${delta} j`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function BurndownCard() {
  const file = useAppStore((s) => s.file);
  const points = useMemo(() => {
    const entries = file.journal
      .filter((e) => e.type === 'meeting' && e.remainingTotal !== undefined)
      .map((e) => ({ date: e.date, value: e.remainingTotal! }));
    entries.push({ date: todayIso(), value: totalRemaining(file) });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [file]);

  const W = 520;
  const H = 140;
  const max = Math.max(...points.map((p) => p.value), 1);
  const first = points[0]!.date;
  const span = Math.max(diffDays(first, points[points.length - 1]!.date), 1);
  const coords = points.map((p) => ({
    x: 30 + (diffDays(first, p.date) / span) * (W - 50),
    y: 12 + (1 - p.value / max) * (H - 36),
    ...p,
  }));

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <h2 className="mb-2 font-display text-[15px] font-semibold">{t('dashboard.burndown')}</h2>
      {points.length < 2 ? (
        <p className="text-[12px] text-ink-faint">{t('dashboard.burndownEmpty')}</p>
      ) : null}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <line x1={30} x2={W - 16} y1={H - 22} y2={H - 22} stroke="var(--color-line)" />
        <line x1={30} x2={30} y1={10} y2={H - 22} stroke="var(--color-line)" />
        <text x={4} y={16} fontSize={9} fill="var(--color-ink-faint)" className="font-mono">
          {Math.round(max)}
        </text>
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
        />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={3} fill="var(--color-accent)" />
            <text x={c.x} y={H - 8} fontSize={8.5} textAnchor="middle" fill="var(--color-ink-faint)" className="font-mono">
              {fmtDay(c.date)}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}

function AlertsCard({ schedule }: { schedule: Schedule }) {
  const { active } = useConflicts();
  const file = schedule.ctx.file;
  const unassigned = active.filter((c) => c.type === 'unassigned').length;
  const deadlines = active.filter((c) => c.type === 'deadline').length;
  const blocked = file.tasks.filter((tk) => tk.type === 'task' && tk.status === 'blocked').length;

  const lines: { text: string; tone: string }[] = [];
  if (active.length > 0)
    lines.push({ text: t('dashboard.alertConflicts', { count: active.length }), tone: 'var(--color-danger)' });
  if (unassigned > 0)
    lines.push({ text: t('dashboard.alertUnassigned', { count: unassigned }), tone: 'var(--color-warn)' });
  if (deadlines > 0)
    lines.push({ text: t('dashboard.alertDeadlines', { count: deadlines }), tone: 'var(--color-danger)' });
  if (blocked > 0)
    lines.push({ text: t('dashboard.alertBlocked', { count: blocked }), tone: 'var(--color-warn)' });

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <h2 className="mb-2 font-display text-[15px] font-semibold">{t('dashboard.alerts')}</h2>
      {lines.length === 0 ? (
        <p className="text-[12.5px] text-ok">{t('dashboard.allClear')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-2 w-2 rounded-full" style={{ background: l.tone }} />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ——— Fiche projet ———

function ProjectSheet({
  projectId,
  schedule,
  onBack,
}: {
  projectId: string;
  schedule: Schedule;
  onBack: () => void;
}) {
  const mutate = useAppStore((s) => s.mutate);
  const file = schedule.ctx.file;
  const project = file.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const health = computeHealth(schedule, project);
  const baseline = activeBaseline(file);
  const tasks = file.tasks.filter((tk) => tk.projectId === projectId);
  const blocked = tasks.filter((tk) => tk.type === 'task' && tk.status === 'blocked');
  const milestones = tasks.filter((tk) => tk.type === 'milestone' && tk.date);
  const roots = tasks.filter((tk) => tk.parentId === null);

  const branchTotals = (root: Task) => {
    const ids = new Set([root.id, ...schedule.hierarchy.descendantsOf(root.id).map((d) => d.id)]);
    let estimate = 0;
    let effort = 0;
    for (const tk of tasks) {
      if (ids.has(tk.id) && tk.type === 'task') {
        estimate += tk.estimate ?? 0;
        effort += tk.effort;
      }
    }
    return { estimate, effort };
  };

  return (
    <>
      <header className="flex items-center gap-4">
        <button className="text-[13px] text-accent hover:underline" onClick={onBack}>
          {t('dashboard.backToOverview')}
        </button>
        <span className="h-4 w-4 rounded" style={{ background: project.color }} />
        <h1 className="font-display text-xl font-bold">{project.name}</h1>
        <span className="ml-2 h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[health.level] }} />
      </header>

      <div className="grid grid-cols-4 gap-4">
        {[
          [t('dashboard.progress'), `${Math.round(health.progress * 100)} %`],
          [t('dashboard.estimate'), `${fmtDays(health.estimate)} j-h`],
          [t('dashboard.effortPlanned'), `${fmtDays(health.effort)} j-h`],
          [t('dashboard.remaining'), `${fmtDays(health.remaining)} j-h`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4 text-center shadow-panel">
            <p className="font-display text-2xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
          <h2 className="mb-2 font-display text-[15px] font-semibold">{t('dashboard.milestones')}</h2>
          {milestones.map((m) => {
            const ref = baseline?.milestones[m.id];
            const delta = ref && m.date ? diffDays(ref, m.date) : null;
            return (
              <p key={m.id} className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px] last:border-0">
                <span className="font-medium">◇ {m.name}</span>
                <span className="font-mono text-[11.5px] text-ink-soft">
                  {fmtDay(m.date)}
                  {delta !== null && delta !== 0 && (
                    <span className={delta > 0 ? 'text-danger' : 'text-ok'}> ({delta > 0 ? '+' : ''}{delta} j)</span>
                  )}
                </span>
              </p>
            );
          })}
          <h2 className="mb-1 mt-4 font-display text-[15px] font-semibold">
            {t('dashboard.blockedBy')} ({blocked.length})
          </h2>
          {blocked.map((tk) => (
            <div key={tk.id} className="mb-1 rounded bg-danger-wash/60 px-2 py-1 text-[12.5px]">
              <span className="font-medium">{tk.name}</span>
              {(tk.notes[tk.notes.length - 1]?.text || tk.requirements) && (
                <span className="text-ink-soft"> — {tk.notes[tk.notes.length - 1]?.text ?? tk.requirements}</span>
              )}
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 shadow-panel">
          <h2 className="mb-2 font-display text-[15px] font-semibold">{t('dashboard.estimGaps')}</h2>
          {roots.map((root) => {
            const { estimate, effort } = branchTotals(root);
            if (estimate === 0 && effort === 0) return null;
            const gap = effort - estimate;
            return (
              <p key={root.id} className="flex items-center justify-between border-b border-line/50 py-1 text-[12.5px] last:border-0">
                <span>{root.name}</span>
                <span className="font-mono text-[11.5px]">
                  {fmtDays(estimate)} → {fmtDays(effort)}{' '}
                  <span className={gap > 0 ? 'font-bold text-danger' : 'text-ok'}>
                    ({gap > 0 ? '+' : ''}{fmtDays(gap)})
                  </span>
                </span>
              </p>
            );
          })}
          <h2 className="mb-1 mt-4 font-display text-[15px] font-semibold">{t('dashboard.projectNotes')}</h2>
          <textarea
            className="w-full resize-none rounded-lg border border-line p-2 text-[12.5px] outline-none focus:border-accent"
            style={{ background: rgba(project.color, 0.04) }}
            rows={5}
            value={project.notes}
            onChange={(e) =>
              mutate((f) => {
                const p = f.projects.find((x) => x.id === projectId);
                if (p) p.notes = e.target.value;
              })
            }
          />
        </section>
      </div>
    </>
  );
}
