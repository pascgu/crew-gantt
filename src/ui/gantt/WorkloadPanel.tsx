import { useMemo } from 'react';
import { eachDay, maxIso, minIso } from '@/core/calendar/dates';
import type { Schedule } from '@/core/scheduler/schedule';
import { TABLE_WIDTH } from '@/ui/table/columns';
import { t } from '@/i18n/fr';
import type { TimeScale } from './timescale';

const ROW_H = 38;
/** Pixels par j-h (1,0 = présence pleine). */
const UNIT = 24;
const MAX_H = ROW_H - 4;

interface WorkloadPanelProps {
  schedule: Schedule;
  scale: TimeScale;
  /** Plage horizontale visible (virtualisation). */
  visibleFrom: string;
  visibleTo: string;
}

/**
 * Histogramme de charge : une ligne par personne ; pour chaque jour une jauge
 * empilée par projet (couleur projet). Trait = présence du jour (100 %) ;
 * au-delà du trait = sur-engagement ; surcharge projet en rouge ; absences hachurées.
 */
export function WorkloadPanel({ schedule, scale, visibleFrom, visibleTo }: WorkloadPanelProps) {
  const persons = schedule.ctx.file.resources;
  const projects = schedule.ctx.file.projects;
  const colorOf = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects]);

  const from = maxIso(scale.origin, visibleFrom);
  const to = minIso(scale.end, visibleTo);
  const height = persons.length * ROW_H;

  return (
    <div className="flex border-t-2 border-line-strong bg-surface">
      {/* Colonne gauche collante : noms + légende */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r border-line-strong bg-surface"
        style={{ width: TABLE_WIDTH }}
      >
        <div className="flex h-full flex-col">
          {persons.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 border-b border-line/50 px-3 text-[12px] font-medium text-ink"
              style={{ height: ROW_H }}
            >
              {r.name}
            </div>
          ))}
        </div>
      </div>
      {/* Jauges */}
      <svg width={scale.width} height={height} className="block shrink-0">
        <defs>
          <pattern id="absent-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgb(33 31 26 / 0.04)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(33 31 26 / 0.16)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {persons.map((resource, ri) => {
          const baseline = ri * ROW_H + ROW_H - 2;
          const days = schedule.loadIndex.get(resource.id);
          const cells = [];
          for (const day of eachDay(from, to)) {
            const x = scale.x(day);
            const w = Math.max(1, scale.dayWidth - 1);
            const workingDay = schedule.ctx.isGlobalWorkingDay(day);
            const presence = schedule.ctx.presence(resource.id, day);
            if (workingDay && presence <= 0) {
              // jour d'absence : hachuré
              cells.push(
                <rect key={`a${day}`} x={x} y={ri * ROW_H + 2} width={w} height={MAX_H} fill="url(#absent-hatch)" />,
              );
              continue;
            }
            if (!workingDay) continue;
            const load = days?.get(day);
            if (load) {
              let y = baseline;
              for (const [projectId, jh] of Object.entries(load.perProject)) {
                if (jh <= 0) continue;
                const h = Math.min(jh * UNIT, MAX_H);
                y -= h;
                const overload = (load.unitsByProject[projectId] ?? 0) > 100 + 1e-9;
                cells.push(
                  <rect
                    key={`${day}-${projectId}`}
                    x={x}
                    y={Math.max(ri * ROW_H + 1, y)}
                    width={w}
                    height={h}
                    fill={overload ? 'var(--color-danger)' : (colorOf.get(projectId) ?? '#999')}
                    opacity={overload ? 0.9 : 0.85}
                  />,
                );
              }
            }
            // trait de référence : présence du jour
            cells.push(
              <line
                key={`p${day}`}
                x1={x}
                x2={x + w}
                y1={baseline - presence * UNIT}
                y2={baseline - presence * UNIT}
                stroke="var(--color-ink)"
                strokeWidth={1.4}
                opacity={0.7}
              />,
            );
          }
          return (
            <g key={resource.id}>
              {cells}
              <line
                x1={0}
                x2={scale.width}
                y1={(ri + 1) * ROW_H}
                y2={(ri + 1) * ROW_H}
                stroke="rgb(33 31 26 / 0.07)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WorkloadLegend() {
  return (
    <span className="flex items-center gap-3 text-[10.5px] text-ink-faint">
      <span>— {t('workload.legendLine')}</span>
      <span>{t('workload.legendOver')}</span>
      <span className="text-danger">{t('workload.legendOverload')}</span>
    </span>
  );
}
