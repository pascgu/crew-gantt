import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconHelp } from '@/ui/common/icons';
import { Mermaid } from '@/ui/common/Mermaid';
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
] as const;

const GUIDE_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'] as const;
const PLANNING_SECTIONS = ['s1', 's2', 's3', 's4', 's5'] as const;

const PLANNING_CHARTS: Partial<Record<string, string>> = {
  // s1 : arbre de décision en LR pour rester compact horizontalement
  s1: `flowchart LR
  A[Tâche] --> B{Date imposée ?}
  B -->|Oui| C[Dates fixées]
  B -->|Non| D{Charge en j-h ?}
  D -->|Oui| E[Pilotée par l'effort]
  D -->|Non| C`,
  // s2 : deux diagrammes séparés côte à côte (s2effort + s2fixed)
  s2effort: `flowchart TB
  E1[Travail FIXÉ] --> E2[Durée calculée]`,
  s2fixed: `flowchart TB
  F1[Durée FIXÉE] --> F2[Travail implicite]`,
  // s3 : remplacé par EffortSketch (SVG personnalisé)
  s4: `flowchart LR
  A[Effort prévu\nj-h] --> B[Poser le début] --> C[Affecter] --> D[Fin calculée]
  D --> E{Chaque semaine}
  E -->|Baisser le Reste| D
  E -->|Tirer la fin| D
  D --> F[Terminé\nReste = 0]`,
};

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
  const [tab, setTab] = useState<'guide' | 'planning'>('guide');

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
        className="flex max-h-full w-[720px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
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

        {/* Onglets */}
        <div className="flex shrink-0 gap-0 border-b border-line px-5">
          {(['guide', 'planning'] as const).map((id) => (
            <button
              key={id}
              className={`border-b-2 px-3 py-2 text-[12px] font-medium transition ${
                tab === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
              onClick={() => setTab(id)}
            >
              {t(`help.tabs.${id}`)}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {tab === 'guide' && (
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
        )}

        {tab === 'planning' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mx-auto flex max-w-xl flex-col gap-6">
              {PLANNING_SECTIONS.map((s) => {
                const chart = PLANNING_CHARTS[s];
                return (
                  <section key={s}>
                    <h3 className="mb-1 font-display text-[13px] font-semibold text-ink">
                      {t(`help.planning.${s}Title`)}
                    </h3>
                    <p className={`mb-3 text-[12.5px] leading-relaxed text-ink-soft${s === 's4' ? ' whitespace-pre-line' : ''}`}>
                      {t(`help.planning.${s}Body`)}
                    </p>
                    {/* s2 : deux diagrammes côte à côte */}
                    {s === 's2' && (
                      <div className="grid grid-cols-2 gap-3">
                        {(['effort', 'fixed'] as const).map((mode) => {
                          const c = PLANNING_CHARTS[`s2${mode}`];
                          return c ? (
                            <div key={mode} className="flex flex-col items-center gap-1">
                              <span className="text-[10.5px] font-medium text-ink-faint">
                                {mode === 'effort' ? "Pilotée par l'effort" : 'Dates fixées'}
                              </span>
                              <div className="w-full overflow-hidden rounded-lg border border-line bg-paper-deep/40 p-2">
                                <Mermaid chart={c} maxHeight="5rem" />
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                    {/* s3 : croquis SVG illustrant l'effet de l'affectation */}
                    {s === 's3' && (
                      <div className="mx-auto max-w-sm">
                        <EffortSketch />
                      </div>
                    )}
                    {/* autres sections : diagramme Mermaid standard */}
                    {chart && s !== 's2' && s !== 's3' && (
                      <Mermaid chart={chart} className="rounded-lg border border-line bg-paper-deep/40 p-3" />
                    )}
                    {s === 's5' && (
                      <div className="mx-auto max-w-xs">
                        <GestureSketch />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** SVG illustrant l'effet de l'affectation : même travail (4 j-h), durée variable selon personnes et %. */
function EffortSketch() {
  const barColor = 'var(--color-accent, #4f8ef7)';
  const lx = 52; // fin des labels
  const bx = 58; // début des barres
  const unit = 38; // px par jour
  const bh = 14;
  const r1y = 22;
  const r2y = 44; // 1 pers. → 4 j
  const r3y = 66; // 2 pers. 50 % → 4 j (même durée que r1, % influe)
  return (
    <svg
      width="100%"
      viewBox="0 0 270 90"
      className="mt-2 rounded-lg border border-line bg-paper-deep/40"
      aria-label="Effet de l'affectation sur la durée"
    >
      <text x={135} y={13} textAnchor="middle" fontSize={8.5} fontWeight="bold" fill="#555">4 j-h de travail</text>
      <text x={lx} y={r1y + bh / 2 + 3} textAnchor="end" fontSize={8} fill="#666">1 pers.</text>
      <rect x={bx} y={r1y} width={unit * 4} height={bh} rx={2} fill={barColor} opacity={0.85} />
      <text x={bx + unit * 4 + 5} y={r1y + bh / 2 + 3} textAnchor="start" fontSize={8} fill="#444">4 jours</text>
      <text x={lx} y={r2y + bh / 2 + 3} textAnchor="end" fontSize={8} fill="#666">2 pers.</text>
      <rect x={bx} y={r2y} width={unit * 2} height={bh} rx={2} fill={barColor} opacity={0.55} />
      <text x={bx + unit * 2 + 5} y={r2y + bh / 2 + 3} textAnchor="start" fontSize={8} fill="#444">2 jours</text>
      <text x={lx} y={r3y + bh / 2 + 3} textAnchor="end" fontSize={8} fill="#666">2×50 %</text>
      <rect x={bx} y={r3y} width={unit * 4} height={bh} rx={2} fill={barColor} opacity={0.38} />
      <text x={bx + unit * 4 + 5} y={r3y + bh / 2 + 3} textAnchor="start" fontSize={8} fill="#444">4 jours</text>
      <line x1={bx} y1={r1y - 3} x2={bx} y2={r3y + bh + 3} stroke="#ccc" strokeWidth={1} />
    </svg>
  );
}

/** Mini-Gantt SVG illustrant les deux gestes clés sur les deux types de tâche. */
function GestureSketch() {
  const barColor = 'var(--color-accent, #4f8ef7)';
  const bx = 72;   // début des barres (marge gauche pour "Début / = Effort" et "Début / = date")
  const bw = 136;
  const by = 12;
  const bh = 14;
  const b2y = by + bh + 22; // y barre 2 = 48
  // "Coins ronds" : by+bh+12 = 38
  // "Coins carrés" : b2y+bh+10 = 72  → viewBox height = 80
  return (
    <svg
      width="100%"
      viewBox="0 0 280 80"
      className="mt-2 rounded-lg border border-line bg-paper-deep/40 p-2"
      aria-label="Schéma des gestes"
    >
      {/* Barre avec coins arrondis = mode effort */}
      <rect x={bx} y={by} width={bw} height={bh} rx={3} fill={barColor} opacity={0.85} />
      <line x1={bx - 16} y1={by + bh / 2} x2={bx} y2={by + bh / 2} stroke="#888" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={bx - 18} y={by + bh / 2 - 4} textAnchor="end" fontSize={8} fill="#666">Début</text>
      <text x={bx - 18} y={by + bh / 2 + 6} textAnchor="end" fontSize={8} fill="#888">= Effort</text>
      <line x1={bx + bw} y1={by + bh / 2} x2={bx + bw + 16} y2={by + bh / 2} stroke="#888" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={bx + bw + 19} y={by + bh / 2 - 4} textAnchor="start" fontSize={8} fill="#666">Fin</text>
      <text x={bx + bw + 19} y={by + bh / 2 + 6} textAnchor="start" fontSize={8} fill="#888">= Effort</text>
      <text x={bx + bw / 2} y={by + bh + 12} textAnchor="middle" fontSize={8} fill="#888">Coins ronds = Pilotée par l'effort</text>
      {/* Barre carrée = dates fixées */}
      <rect x={bx} y={b2y} width={bw} height={bh} rx={0} fill="#aaa" opacity={0.7} />
      <line x1={bx - 16} y1={b2y + bh / 2} x2={bx} y2={b2y + bh / 2} stroke="#888" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={bx - 18} y={b2y + bh / 2 - 4} textAnchor="end" fontSize={8} fill="#666">Début</text>
      <text x={bx - 18} y={b2y + bh / 2 + 6} textAnchor="end" fontSize={8} fill="#888">= date</text>
      <line x1={bx + bw} y1={b2y + bh / 2} x2={bx + bw + 16} y2={b2y + bh / 2} stroke="#888" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={bx + bw + 19} y={b2y + bh / 2 - 4} textAnchor="start" fontSize={8} fill="#666">Fin</text>
      <text x={bx + bw + 19} y={b2y + bh / 2 + 6} textAnchor="start" fontSize={8} fill="#888">= date</text>
      <text x={bx + bw / 2} y={b2y + bh + 10} textAnchor="middle" fontSize={8} fill="#888">Coins carrés = Dates fixées</text>
      <defs>
        <marker id="arr" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#888" />
        </marker>
      </defs>
    </svg>
  );
}
