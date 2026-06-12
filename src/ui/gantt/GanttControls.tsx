import { useState } from 'react';
import { format } from 'date-fns';
import type { ZoomLevel } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { setZoom } from '@/state/taskActions';
import { createBaseline, deleteBaseline, setActiveBaseline } from '@/state/baselineActions';
import { ContextMenu, type MenuEntry } from '@/ui/common/ContextMenu';
import { IconDots, IconTarget } from '@/ui/common/icons';
import { t } from '@/i18n/fr';

const ZOOMS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const NEW_BASELINE = '__new__';

interface GanttControlsProps {
  zoom: ZoomLevel;
  onToday: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;
}

/**
 * Contrôles flottants en haut à droite du volet Gantt : échelle de temps,
 * « aller à aujourd'hui », baseline et menu « … » (exports…). Tout ce qui
 * n'agit que sur le Gantt vit ici, pas dans la barre d'outils globale.
 */
export function GanttControls({ zoom, onToday, onExportPng, onExportCsv }: GanttControlsProps) {
  const baselines = useAppStore((s) => s.file.baselines);
  const activeBl = baselines.find((b) => b.active) ?? null;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const selectCls =
    'rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-soft outline-none transition hover:border-accent';

  function onBaselineChange(value: string) {
    if (value === NEW_BASELINE) {
      const name = window.prompt(
        t('baseline.freezePrompt'),
        t('baseline.defaultName', { date: format(new Date(), 'dd/MM/yyyy') }),
      );
      if (name) createBaseline(name);
      // sans nom : le select contrôlé revient tout seul à la valeur active
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
    <div className="absolute right-2 top-1.5 z-30 flex items-center gap-1.5 rounded-lg border border-line bg-surface/90 px-1.5 py-1 shadow-sm backdrop-blur-sm">
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
      {/* Aller à aujourd'hui */}
      <button
        className="rounded-md border border-line p-1 text-ink-soft transition hover:border-accent hover:text-accent"
        title={t('gantt.goToday')}
        aria-label={t('gantt.goToday')}
        onClick={onToday}
      >
        <IconTarget size={13} />
      </button>
      {/* Baseline : « aucune » désactive, « figer… » crée */}
      <select
        className={`${selectCls} max-w-36`}
        value={activeBl?.id ?? ''}
        title={t('baseline.active')}
        onChange={(e) => onBaselineChange(e.target.value)}
      >
        <option value="">{t('baseline.none')}</option>
        <option value={NEW_BASELINE}>{t('baseline.addCurrent')}</option>
        {baselines.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {/* Menu … : exports et actions secondaires */}
      <button
        className="rounded-md border border-line p-1 text-ink-soft transition hover:border-accent hover:text-accent"
        title={t('gantt.more')}
        aria-label={t('gantt.more')}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.right - 208, y: rect.bottom + 4 });
        }}
      >
        <IconDots size={13} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
    </div>
  );
}
