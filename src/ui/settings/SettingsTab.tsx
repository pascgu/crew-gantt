import { useState } from 'react';
import { frenchHolidaysRange } from '@/core/calendar/frenchHolidays';
import { createProject } from '@/core/model/factory';
import type { Weekday } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { EditableText } from '@/ui/common/inline';
import { IconClose, IconPlus } from '@/ui/common/icons';
import { t, tList } from '@/i18n/fr';
import { fmtDayFull } from '@/ui/gantt/format';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-panel">
      <h2 className="mb-4 font-display text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsTab() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <CalendarCard />
        <ProjectsCard />
      </div>
    </div>
  );
}

function CalendarCard() {
  const calendar = useAppStore((s) => s.file.team.calendar);
  const mutate = useAppStore((s) => s.mutate);
  const [newHoliday, setNewHoliday] = useState('');
  const weekdays = tList('settings.weekdaysShort');
  const year = new Date().getFullYear();

  const toggleDay = (day: Weekday) => {
    mutate((f) => {
      const days = f.team.calendar.workingDays;
      const i = days.indexOf(day);
      if (i >= 0) days.splice(i, 1);
      else {
        days.push(day);
        days.sort((a, b) => a - b);
      }
    });
  };

  const sortedHolidays = [...calendar.holidays].sort();

  return (
    <Card title={t('settings.calendar')}>
      <p className="mb-2 text-[12px] font-medium text-ink-soft">{t('settings.workingDays')}</p>
      <div className="mb-5 flex gap-1.5">
        {weekdays.map((label, i) => {
          const day = (i + 1) as Weekday;
          const active = calendar.workingDays.includes(day);
          return (
            <button
              key={day}
              className={`w-12 rounded-lg border py-1.5 text-[12px] font-medium capitalize transition ${
                active
                  ? 'border-accent bg-accent-wash text-accent-deep'
                  : 'border-line text-ink-faint hover:text-ink'
              }`}
              onClick={() => toggleDay(day)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-medium text-ink-soft">
          {t('settings.holidays')}{' '}
          <span className="text-ink-faint">
            — {t('settings.holidayCount', { count: calendar.holidays.length })}
          </span>
        </p>
        <button
          className="rounded border border-line px-2 py-1 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
          onClick={() =>
            mutate((f) => {
              const merged = new Set([
                ...f.team.calendar.holidays,
                ...frenchHolidaysRange(year, year + 1),
              ]);
              f.team.calendar.holidays = [...merged].sort();
            })
          }
        >
          {t('settings.prefillHolidays', { year, nextYear: year + 1 })}
        </button>
      </div>
      <div className="flex max-h-44 flex-wrap content-start gap-1.5 overflow-y-auto rounded-lg border border-line bg-paper/50 p-2">
        {sortedHolidays.map((h) => (
          <span
            key={h}
            className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft shadow-sm"
          >
            {fmtDayFull(h)}
            <button
              className="text-ink-faint hover:text-danger"
              onClick={() =>
                mutate((f) => {
                  f.team.calendar.holidays = f.team.calendar.holidays.filter((x) => x !== h);
                })
              }
            >
              <IconClose size={10} />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            type="date"
            className="rounded border border-dashed border-line bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-soft outline-none focus:border-accent"
            value={newHoliday}
            onChange={(e) => setNewHoliday(e.target.value)}
          />
          <button
            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-soft transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
            disabled={!newHoliday}
            onClick={() => {
              mutate((f) => {
                if (!f.team.calendar.holidays.includes(newHoliday)) {
                  f.team.calendar.holidays.push(newHoliday);
                  f.team.calendar.holidays.sort();
                }
              });
              setNewHoliday('');
            }}
          >
            {t('settings.addHoliday')}
          </button>
        </span>
      </div>
    </Card>
  );
}

function ProjectsCard() {
  const projects = useAppStore((s) => s.file.projects);
  const tasks = useAppStore((s) => s.file.tasks);
  const mutate = useAppStore((s) => s.mutate);

  return (
    <Card title={t('settings.projects')}>
      <div className="flex flex-col gap-2">
        {projects.map((p) => {
          const taskCount = tasks.filter((tk) => tk.projectId === p.id).length;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-lg border border-line px-3 py-2 ${p.archived ? 'opacity-55' : ''}`}
            >
              <input
                type="color"
                className="h-7 w-9 cursor-pointer rounded border-none bg-transparent"
                value={p.color}
                title={t('settings.projectColor')}
                onChange={(e) =>
                  mutate((f) => {
                    const proj = f.projects.find((x) => x.id === p.id);
                    if (proj) proj.color = e.target.value;
                  })
                }
              />
              <span className="min-w-0 flex-1 font-medium">
                <EditableText
                  value={p.name}
                  onCommit={(name) =>
                    mutate((f) => {
                      const proj = f.projects.find((x) => x.id === p.id);
                      if (proj) proj.name = name;
                    })
                  }
                />
              </span>
              <span className="font-mono text-[11px] text-ink-faint">
                {taskCount} {taskCount > 1 ? 'tâches' : 'tâche'}
              </span>
              <button
                className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
                onClick={() =>
                  mutate((f) => {
                    const proj = f.projects.find((x) => x.id === p.id);
                    if (proj) proj.archived = !proj.archived;
                  })
                }
              >
                {p.archived ? t('settings.unarchive') : t('settings.archive')}
              </button>
              <button
                className="rounded p-1 text-ink-faint transition enabled:hover:text-danger disabled:opacity-30"
                disabled={taskCount > 0}
                title={taskCount > 0 ? t('settings.confirmDeleteProject', { name: p.name }) : t('settings.deleteProject')}
                onClick={() =>
                  mutate((f) => {
                    f.projects = f.projects.filter((x) => x.id !== p.id);
                  })
                }
              >
                <IconClose size={13} />
              </button>
            </div>
          );
        })}
        <button
          className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] text-ink-soft transition hover:border-accent hover:text-accent"
          onClick={() =>
            mutate((f) => {
              const palette = ['#4f8ef7', '#7bc47f', '#e0823d', '#b56cc8', '#d9534f', '#3aada8'];
              f.projects.push(
                createProject({
                  name: `Projet ${f.projects.length + 1}`,
                  color: palette[f.projects.length % palette.length]!,
                }),
              );
            })
          }
        >
          <IconPlus size={12} /> {t('settings.addProject')}
        </button>
      </div>
    </Card>
  );
}
