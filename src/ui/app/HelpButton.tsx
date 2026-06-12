import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconHelp } from '@/ui/common/icons';
import { t } from '@/i18n/fr';

const LEGEND_KEYS = [
  'dragBar',
  'dragEdge',
  'linkHandle',
  'shiftDrag',
  'rightClickBar',
  'rightClickRow',
  'panDrag',
  'middleClick',
  'ctrlWheel',
  'doubleClick',
  'arrows',
  'altArrows',
  'undoRedo',
] as const;

const GUIDE_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;

/**
 * Aide intégrée : au survol, légende compacte des gestes/raccourcis ;
 * au clic, modal de prise en main (scénarios).
 */
export function HelpButton() {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);

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
          setOpen(true);
        }}
      >
        <IconHelp size={14} />
      </button>
      {hover && !open && (
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
      {open && <HelpModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[680px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <span className="font-display text-[15px] font-bold text-ink">{t('help.guideTitle')}</span>
          <button
            className="rounded-md p-1 text-ink-soft transition hover:bg-paper-deep hover:text-ink"
            aria-label={t('help.close')}
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            {GUIDE_SECTIONS.map((s) => (
              <section key={s}>
                <h3 className="mb-1 font-display text-[13px] font-semibold text-ink">
                  {t(`help.guide.${s}Title`)}
                </h3>
                <p className="text-[12.5px] leading-relaxed text-ink-soft">
                  {t(`help.guide.${s}Body`)}
                </p>
              </section>
            ))}
          </div>
          <div>
            <h3 className="mb-2 font-display text-[13px] font-semibold text-ink">
              {t('help.legendTitle')}
            </h3>
            <ul className="flex flex-col gap-1.5 text-[12px] leading-snug text-ink-soft">
              {LEGEND_KEYS.map((k) => (
                <li key={k} className="rounded-md bg-paper-deep/60 px-2 py-1">
                  {t(`help.legend.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
