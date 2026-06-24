import { useState } from 'react';
import { useAppStore } from '@/state/store';
import { IconHelp } from '@/ui/common/icons';
import { t } from '@/i18n/fr';

const LEGEND_KEYS = [
  'dragBar',
  'dragEdge',
  'progressDrag',
  'linkHandle',
  'shiftDrag',
  'shiftDrop',
  'enclosingGroup',
  'cycleSplit',
  'rightClickBar',
  'rightClickRow',
  'panDrag',
  'middleClick',
  'ctrlWheel',
  'doubleClick',
  'arrows',
  'insertKey',
  'altArrows',
  'undoRedo',
  'cancelled',
  'ctrlDrag',
  'orangeBand',
] as const;

/**
 * Bouton d'aide du bandeau : au survol, légende compacte des gestes/raccourcis ;
 * au clic, bascule sur l'onglet Aide (prise en main, concepts, légende visuelle…).
 */
export function HelpButton() {
  const [hover, setHover] = useState(false);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        className="rounded-full border border-line p-1 text-ink-soft transition hover:border-accent hover:text-accent"
        title={t('help.button')}
        aria-label={t('help.button')}
        onClick={() => {
          setHover(false);
          setActiveTab('help');
        }}
      >
        <IconHelp size={14} />
      </button>
      {hover && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-80 rounded-lg border border-line bg-surface p-3 shadow-float">
          <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t('help.legendTitle')}
          </div>
          <ul className="flex flex-col gap-1 text-[11.5px] leading-snug text-ink-soft">
            {LEGEND_KEYS.map((k) => (
              <li key={k}>{t(`help.legend.${k}`)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
