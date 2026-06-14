import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { ZoomLevel } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { setZoom } from '@/state/taskActions';
import { createBaseline, deleteBaseline, setActiveBaseline } from '@/state/baselineActions';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import { usePersistedState } from '@/ui/common/persist';
import { IconDots, IconSettings, IconTarget } from '@/ui/common/icons';
import { t } from '@/i18n/fr';

const ZOOMS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const NEW_BASELINE = '__new__';

interface GanttControlsProps {
  zoom: ZoomLevel;
  todayVisible: boolean;
  onToday: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;
}

/**
 * Contrôles flottants sous l'en-tête du Gantt (top-[38px]).
 * ⚙ seul par défaut ; au clic : popover avec échelle, baseline, "…".
 * 🎯 s'affiche sous ⚙ uniquement si la ligne "aujourd'hui" est hors viewport.
 */
export function GanttControls({ zoom, todayVisible, onToday, onExportPng, onExportCsv }: GanttControlsProps) {
  const baselines = useAppStore((s) => s.file.baselines);
  const activeBl = baselines.find((b) => b.active) ?? null;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [expanded, setExpanded] = usePersistedState('crewgantt.ui.controlsOpen', false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded, setExpanded]);

  const selectCls =
    'rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-soft outline-none transition hover:border-accent';

  const iconBtnCls = 'p-1 text-ink-soft transition hover:text-accent';

  function onBaselineChange(value: string) {
    if (value === NEW_BASELINE) {
      const name = window.prompt(
        t('baseline.freezePrompt'),
        t('baseline.defaultName', { date: format(new Date(), 'dd/MM/yyyy') }),
      );
      if (name) createBaseline(name);
      return;
    }
    setActiveBaseline(value || null);
  }

  const menuEntries: MenuEntry[] = [
    { label: t('export.pngTitle'), onClick: onExportPng },
    { label: t('export.csvTitle'), onClick: onExportCsv },
    {
      label: t('baseline.deleteActive'),
      danger: true,
      disabled: !activeBl,
      onClick: () => {
        if (activeBl) deleteBaseline(activeBl.id);
      },
    },
  ];

  return (
    <div ref={containerRef} className="absolute right-2 top-[38px] z-30 flex flex-col items-end gap-0.5">
      {/* Bouton toggle ⚙ — icône seule, sans bordure */}
      <button
        className={`${iconBtnCls} ${expanded ? 'text-accent' : ''}`}
        title={t('gantt.controls')}
        aria-label={t('gantt.controls')}
        onClick={() => setExpanded((v) => !v)}
      >
        <IconSettings size={14} />
      </button>

      {/* Bouton Aujourd'hui — affiché uniquement si hors fenêtre */}
      {!todayVisible && (
        <button
          className={iconBtnCls}
          title={t('gantt.goToday')}
          aria-label={t('gantt.goToday')}
          onClick={onToday}
        >
          <IconTarget size={14} />
        </button>
      )}

      {/* Panneau dépliable — popover flottant par-dessus le Gantt */}
      {expanded && (
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-1.5 py-1 shadow-md backdrop-blur-sm">
          {/* Échelle de temps */}
          <select
            className={selectCls}
            value={zoom}
            title={t('gantt.scale')}
            onChange={(e) => setZoom(e.target.value as ZoomLevel)}
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {t(`gantt.zoom.${z}`)}
              </option>
            ))}
          </select>
          {/* Baseline */}
          <select
            className={`${selectCls} max-w-36`}
            value={activeBl?.id ?? ''}
            title={t('baseline.active')}
            onChange={(e) => onBaselineChange(e.target.value)}
          >
            <option value="">{t('baseline.none')}</option>
            <option value={NEW_BASELINE}>{t('baseline.addCurrent')}</option>
            <option disabled>──────────</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {/* Menu … */}
          <button
            className={iconBtnCls}
            title={t('gantt.more')}
            aria-label={t('gantt.more')}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.right - 208, y: rect.bottom + 4 });
            }}
          >
            <IconDots size={13} />
          </button>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
    </div>
  );
}
