import { useMemo } from 'react';
import { eachDay, maxIso, minIso } from '@/core/calendar/dates';
import type { Schedule } from '@/core/scheduler/schedule';
import { t } from '@/i18n/fr';
import { Avatar } from '@/ui/common/Avatar';
import type { TimeScale } from './timescale';

interface WorkloadGaugesProps {
  schedule: Schedule;
  scale: TimeScale;
  /** Hauteur d'une ligne de personne (réglable par la poignée). */
  rowH: number;
  /** Plage horizontale visible (virtualisation). */
  visibleFrom: string;
  visibleTo: string;
}

/** Noms des ressources en overlay pincé à gauche du bandeau de charge, non affectés par le translateX. */
export function WorkloadNamesOverlay({ schedule, rowH }: { schedule: Schedule; rowH: number }) {
  const persons = schedule.ctx.file.resources;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col">
      {persons.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-1 overflow-hidden rounded-r px-1.5"
          style={{ height: rowH }}
        >
          <Avatar resource={r} size="xs" />
          <span
            className="truncate rounded bg-surface/80 px-1 text-[9.5px] font-medium text-ink-soft"
            style={{ maxWidth: 100 }}
          >
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Histogramme de charge : une ligne par personne ; pour chaque jour une jauge
 * empilée par projet (couleur projet). Trait = présence du jour (100 %) ;
 * au-delà du trait = sur-engagement ; surcharge projet en rouge ; absences hachurées.
 */
export function WorkloadGauges({ schedule, scale, rowH, visibleFrom, visibleTo }: WorkloadGaugesProps) {
  const persons = schedule.ctx.file.resources;
  const projects = schedule.ctx.file.projects;
  const colorOf = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects]);

  // px par j-h, proportionnel à la hauteur de ligne (38px ↔ 24px historiquement)
  const unit = Math.max(8, rowH - 14);
  const maxH = rowH - 4;

  const from = maxIso(scale.origin, visibleFrom);
  const to = minIso(scale.end, visibleTo);
  const height = persons.length * rowH;

  return (
    <svg width={scale.width} height={height} className="block shrink-0 bg-surface">
      <defs>
        <pattern id="absent-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgb(33 31 26 / 0.04)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(33 31 26 / 0.16)" strokeWidth="1.5" />
        </pattern>
      </defs>
      {persons.map((resource, ri) => {
        const baseline = ri * rowH + rowH - 2;
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
              <rect key={`a${day}`} x={x} y={ri * rowH + 2} width={w} height={maxH} fill="url(#absent-hatch)" />,
            );
            continue;
          }
          if (!workingDay) continue;
          const load = days?.get(day);
          if (load) {
            let y = baseline;
            for (const [projectId, jh] of Object.entries(load.perProject)) {
              if (jh <= 0) continue;
              const h = Math.min(jh * unit, maxH);
              y -= h;
              const overload = (load.unitsByProject[projectId] ?? 0) > 100 + 1e-9;
              cells.push(
                <rect
                  key={`${day}-${projectId}`}
                  x={x}
                  y={Math.max(ri * rowH + 1, y)}
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
              y1={baseline - presence * unit}
              y2={baseline - presence * unit}
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
              y1={(ri + 1) * rowH}
              y2={(ri + 1) * rowH}
              stroke="rgb(33 31 26 / 0.07)"
            />
          </g>
        );
      })}
    </svg>
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
