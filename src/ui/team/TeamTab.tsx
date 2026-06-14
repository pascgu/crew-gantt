import { useState } from 'react';
import type { Resource, Weekday } from '@/core/model/types';
import { EditableAvatar } from '@/ui/common/Avatar';
import { todayIso } from '@/core/calendar/dates';
import { useAppStore } from '@/state/store';
import { useSchedule } from '@/state/schedule';
import {
  addException,
  addProjectShare,
  addResource,
  deleteResource,
  removeException,
  removeProjectShare,
  resetResourceDays,
  toggleResourceDay,
  updateException,
  updateProjectShare,
  updateResource,
} from '@/state/resourceActions';
import { DateInput, EditableNumber, EditableText } from '@/ui/common/inline';
import { IconClose, IconPlus } from '@/ui/common/icons';
import { rgba } from '@/ui/common/color';
import { t, tList } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';

export function TeamTab() {
  const resources = useAppStore((s) => s.file.resources);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        {resources.length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-faint">
            {t('team.empty')}
          </p>
        )}
        {resources.map((r) => (
          <ResourceCard key={r.id} resource={r} />
        ))}
        <button
          className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-ink-soft transition hover:border-accent hover:text-accent"
          onClick={() => addResource(t('team.newResourceName'))}
        >
          <IconPlus size={13} /> {t('team.addResource')}
        </button>
      </div>
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const schedule = useSchedule();
  const projects = useAppStore((s) => s.file.projects);
  const globalDays = useAppStore((s) => s.file.team.calendar.workingDays);
  const weekdays = tList('settings.weekdaysShort');
  const [newExceptionFrom, setNewExceptionFrom] = useState('');

  const pattern = resource.workingDays ?? globalDays;
  const inherited = resource.workingDays === undefined;
  const today = todayIso();
  const visibleProjects = projects.filter((p) => !p.archived);

  // Cumul des parts aujourd'hui (libre : peut être ≠ 100 %)
  const totalShare = visibleProjects.reduce(
    (sum, p) => sum + schedule.ctx.projectShare(resource.id, p.id, today) * 100,
    0,
  );
  const weeklyDays = Math.round(pattern.length * (totalShare / 100) * 10) / 10;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-panel">
      <header className="mb-4 flex items-center gap-3">
        <EditableAvatar
          resource={resource}
          onChangeColor={(color) => updateResource(resource.id, { avatarColor: color })}
          onChangeInitials={(initials) => updateResource(resource.id, { avatarInitials: initials })}
        />
        <span className="min-w-0 flex-1 font-display text-base font-semibold">
          <EditableText value={resource.name} onCommit={(name) => updateResource(resource.id, { name })} bold />
        </span>
        <select
          className="rounded border border-line bg-surface px-2 py-1 text-[12px] outline-none"
          value={resource.kind}
          onChange={(e) => updateResource(resource.id, { kind: e.target.value as Resource['kind'] })}
        >
          <option value="person">{t('team.kindPerson')}</option>
          <option value="material">{t('team.kindMaterial')}</option>
        </select>
        <button
          className="rounded border border-danger/40 px-2 py-1 text-[12px] text-danger transition hover:bg-danger-wash"
          onClick={() => {
            if (window.confirm(t('team.confirmDelete', { name: resource.name }))) {
              deleteResource(resource.id);
            }
          }}
        >
          {t('team.delete')}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-5">
        {/* Motif hebdo */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[12px] font-medium text-ink-soft">{t('team.pattern')}</p>
            <span className="font-mono text-[11px] text-ink-faint">
              {t('team.patternSummary', { count: pattern.length })}
            </span>
          </div>
          <div className="flex gap-1">
            {weekdays.map((label, i) => {
              const day = (i + 1) as Weekday;
              const active = pattern.includes(day);
              return (
                <button
                  key={day}
                  className={`w-10 rounded-md border py-1 text-[11px] font-medium capitalize transition ${
                    active
                      ? 'border-accent bg-accent-wash text-accent-deep'
                      : 'border-line text-ink-faint hover:text-ink'
                  }`}
                  onClick={() => toggleResourceDay(resource.id, day)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">
            {inherited ? (
              t('team.patternInherited')
            ) : (
              <>
                {t('team.patternCustom')} ·{' '}
                <button className="underline hover:text-accent" onClick={() => resetResourceDays(resource.id)}>
                  {t('team.patternReset')}
                </button>
              </>
            )}
          </p>

          {/* Exceptions datées */}
          <p className="mb-1.5 mt-4 text-[12px] font-medium text-ink-soft">{t('team.exceptions')}</p>
          <div className="flex flex-col gap-1">
            {resource.exceptions.map((ex, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded bg-paper/70 px-1.5 py-1 text-[12px]">
                <DateInput
                  value={ex.from}
                  onCommit={(v) => v && updateException(resource.id, i, { from: v })}
                />
                <span className="text-ink-faint">{t('team.exceptionTo')}</span>
                <DateInput
                  value={ex.to ?? null}
                  nullable
                  onCommit={(v) => updateException(resource.id, i, { to: v ?? undefined })}
                />
                <span className="w-12">
                  <EditableNumber
                    value={ex.percent}
                    suffix=" %"
                    max={100}
                    onCommit={(v) => updateException(resource.id, i, { percent: v ?? 0 })}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <EditableText
                    value={ex.reason ?? ''}
                    placeholder={t('team.exceptionReason')}
                    onCommit={(v) => updateException(resource.id, i, { reason: v })}
                  />
                </span>
                <button
                  className="shrink-0 rounded p-0.5 text-ink-faint hover:text-danger"
                  onClick={() => removeException(resource.id, i)}
                >
                  <IconClose size={11} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="rounded border border-dashed border-line bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-soft outline-none focus:border-accent"
                value={newExceptionFrom}
                onChange={(e) => setNewExceptionFrom(e.target.value)}
              />
              <button
                className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-soft transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
                disabled={!newExceptionFrom}
                onClick={() => {
                  addException(resource.id, { from: newExceptionFrom, percent: 0 });
                  setNewExceptionFrom('');
                }}
              >
                + {t('team.exceptionAdd')}
              </button>
            </div>
            <p className="text-[10.5px] leading-snug text-ink-faint">{t('team.exceptionsHint')}</p>
          </div>
        </div>

        {/* Parts projet */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[12px] font-medium text-ink-soft">{t('team.shares')}</p>
            <span className="font-mono text-[11px] text-ink-faint">
              {t('team.shareTotal', {
                date: fmtDay(today),
                total: Math.round(totalShare),
                days: String(weeklyDays).replace('.', ','),
              })}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {visibleProjects.map((project) => {
              const entries = resource.projectShares
                .map((share, index) => ({ share, index }))
                .filter(({ share }) => share.projectId === project.id);
              const current = schedule.ctx.projectShare(resource.id, project.id, today) * 100;
              return (
                <div
                  key={project.id}
                  className="rounded-lg border p-2"
                  style={{ borderColor: rgba(project.color, 0.45), background: rgba(project.color, 0.06) }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: project.color }} />
                    <span className="flex-1 text-[12.5px] font-medium">{project.name}</span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      {Math.round(current)} % ·{' '}
                      {String(Math.round(pattern.length * current) / 100).replace('.', ',')} j/sem
                    </span>
                  </div>
                  {entries.length === 0 && (
                    <p className="text-[10.5px] text-ink-faint">{t('team.shareDefault')}</p>
                  )}
                  {entries.map(({ share, index }) => (
                    <div key={index} className="flex items-center gap-1.5 py-0.5 text-[12px]">
                      <span className="whitespace-nowrap text-ink-faint">{t('team.shareFrom')}</span>
                      <DateInput
                        value={share.from}
                        onCommit={(v) => v && updateProjectShare(resource.id, index, { from: v })}
                      />
                      <span className="whitespace-nowrap text-ink-faint">{t('team.shareTo')}</span>
                      <DateInput
                        value={share.to ?? null}
                        nullable
                        placeholder={t('team.shareOpenEnd')}
                        onCommit={(v) => updateProjectShare(resource.id, index, { to: v ?? undefined })}
                      />
                      <span className="w-14">
                        <EditableNumber
                          value={share.percent}
                          suffix=" %"
                          max={200}
                          onCommit={(v) => updateProjectShare(resource.id, index, { percent: v ?? 0 })}
                        />
                      </span>
                      <button
                        className="shrink-0 rounded p-0.5 text-ink-faint hover:text-danger"
                        onClick={() => removeProjectShare(resource.id, index)}
                      >
                        <IconClose size={11} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="mt-0.5 text-[11px] text-ink-faint underline hover:text-accent"
                    onClick={() =>
                      addProjectShare(resource.id, { projectId: project.id, from: today, percent: 50 })
                    }
                  >
                    + {t('team.shareAdd')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
