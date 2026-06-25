/**
 * HelpTab — l'aide en onglet dédié, en 5 sous-onglets. Remplace l'ancienne modale.
 * Les illustrations sont des MiniGantt / MiniList (répliques fidèles, lecture seule) annotés —
 * plus de Mermaid. Voir plans/agent-conversations.md §1.13 et plans/conflicts.md.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { t } from '@/i18n/fr';
import { IconSettings } from '@/ui/common/icons';
import { usePersistedState } from '@/ui/common/persist';
import { ANNOTATION_CSS } from './Annotated';
import { MiniGantt, type MiniGanttNumber } from './MiniGantt';
import { MiniList, type MiniListRow, type MiniListNumber } from './MiniList';

type SubTab = 'guide' | 'concepts' | 'legend' | 'gestures' | 'howto';
const SUBTABS: SubTab[] = ['guide', 'concepts', 'legend', 'gestures', 'howto'];


const BLUE = '#4f8ef7';
const ORANGE = '#e0863c';
const GREEN = '#3fae6b';
const PURPLE = '#8b6fd6';

const LEGEND_KEYS = [
  // Colonne 1 — interactions Gantt
  'dragBar', 'dragEdge', 'progressDrag', 'ctrlDrag',
  'linkHandle', 'shiftDrag', 'shiftDrop',
  'rightClickBar', 'rightClickRow', 'enclosingGroup', 'cycleSplit',
  // Colonne 2 — navigation & clavier
  'panDrag', 'middleClick', 'ctrlWheel', 'doubleClick',
  'arrows', 'altArrows', 'insertKey',
  'undoRedo', 'ctrlS',
  'cancelled',
] as const;

export function HelpTab() {
  const [tab, setTab] = usePersistedState<SubTab>('crewgantt.ui.helpSubtab', 'guide');
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) {
      const saved = sessionStorage.getItem(`crewgantt.help.scroll.${tab}`);
      scrollRef.current.scrollTop = saved ? Number(saved) : 0;
    }
  }, [tab]);

  const selectTab = (id: SubTab) => {
    if (scrollRef.current)
      sessionStorage.setItem(`crewgantt.help.scroll.${tab}`, String(scrollRef.current.scrollTop));
    setTab(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper-deep/30">
      <style>{ANNOTATION_CSS}</style>
      <div className="shrink-0 border-b border-line bg-surface px-6 pt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[18px] font-bold text-ink">{t('tabs.help')}</h1>
          <span className="text-[12px] text-ink-faint">{t('help.tagline')}</span>
        </div>
        <div className="mt-2 flex gap-0">
          {SUBTABS.map((id) => (
            <button
              key={id}
              onClick={() => selectTab(id)}
              className={`border-b-2 px-3 py-2 text-[12.5px] font-medium transition ${
                tab === id ? 'border-accent text-accent' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t(`help.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        onScroll={(e) => { sessionStorage.setItem(`crewgantt.help.scroll.${tab}`, String(e.currentTarget.scrollTop)); }}
      >
        <div className="mx-auto max-w-4xl">
          {tab === 'guide' && <GuideTab />}
          {tab === 'concepts' && <ConceptsTab />}
          {tab === 'legend' && <LegendTab />}
          {tab === 'gestures' && <GesturesTab />}
          {tab === 'howto' && <HowtoTab />}
        </div>
      </div>
    </div>
  );
}

/* ——— Briques de mise en page ——— */

function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-5 text-[13px] leading-relaxed text-ink-soft">{children}</p>;
}

function Block({ title, children, figure, legend }: { title: string; children?: ReactNode; figure?: ReactNode; legend?: ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="mb-1.5 font-display text-[14px] font-semibold text-ink">{title}</h3>
      <div className="text-[12.5px] leading-relaxed text-ink-soft">{children}</div>
      {figure && <Figure>{figure}</Figure>}
      {legend}
    </section>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface px-5 py-11">
      <div className="min-w-fit">{children}</div>
    </div>
  );
}

/** Rend un texte en paragraphes : coupe sur les sauts `\n\n` (lisibilité). */
function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split('\n\n').map((para, i) => (
        <p key={i} className={i > 0 ? `mt-2 ${className ?? ''}`.trim() : className}>
          {para}
        </p>
      ))}
    </>
  );
}

/** Liste numérotée (légende des repères ①②③ posés sur une figure). Flux colonne par colonne. */
function NumberedLegend({ items }: { items: { n: number; label: string }[] }) {
  const half = Math.ceil(items.length / 2);
  const renderItem = (it: { n: number; label: string }) => (
    <li key={it.n} className="flex items-start gap-2 text-[12px] leading-snug text-ink-soft">
      <span className="mt-px inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
        {it.n}
      </span>
      <span>{it.label}</span>
    </li>
  );
  return (
    <div className="mt-3 flex gap-6">
      <ol className="flex flex-1 flex-col gap-1.5">{items.slice(0, half).map(renderItem)}</ol>
      <ol className="flex flex-1 flex-col gap-1.5" start={half + 1}>{items.slice(half).map(renderItem)}</ol>
    </div>
  );
}

/* ——— 1. Prise en main ——— */

function GuideTab() {
  return (
    <div>
      <section className="mb-6">
        <Prose text={t('help.guide.overviewBody')} className="mb-3 text-[13px] leading-relaxed text-ink-soft" />
        <Figure><LayoutSketch /></Figure>
      </section>

      <Lead>{t('help.guideIntro')}</Lead>

      <Block title={t('help.guide.s1Title')} figure={sceneStart()}>
        <Prose text={t('help.guide.s1Body')} />
      </Block>

      <Block title={t('help.guide.s2Title')} figure={
        <MiniGantt
          scene={{
            days: 11, labelWidth: 78,
            rows: [
              { kind: 'task', name: 'À placer', color: BLUE, scheduling: 'effort', blocks: [], ghosts: [{ from: 1, to: 1 }, { from: 6, to: 6 }], marker: 'unplanned' },
              { kind: 'task', name: 'Posée', color: GREEN, scheduling: 'effort', blocks: [{ from: 4, to: 8 }] },
            ],
          }}
          callouts={[
            { day: 1, row: 0, edge: 'mid', label: t('help.guide.caGhost'), place: 'top', cursor: 'pointer' },
            { day: 8, row: 1, edge: 'end', yAnchor: 'lower', label: t('help.guide.caResize'), place: 'bottom', cursor: 'resize-x', animate: true },
          ]}
        />
      }>
        <Prose text={t('help.guide.s2Body')} />
      </Block>

      <Block title={t('help.guide.s3Title')} figure={
        <MiniGantt
          scene={{
            days: 12, labelWidth: 70,
            rows: [
              { kind: 'task', name: 'Spéc', color: BLUE, scheduling: 'fixed', blocks: [{ from: 0, to: 3 }], linkHandle: true },
              { kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 5, to: 9 }] },
            ],
            links: [{ fromRow: 0, fromDay: 3, toRow: 1, toDay: 5 }],
          }}
          callouts={[{ day: 3, row: 0, edge: 'end', dx: 8, label: t('help.guide.caLink'), place: 'top', cursor: 'crosshair' }]}
        />
      }>
        <Prose text={t('help.guide.s3Body')} />
      </Block>

      <Block title={t('help.guide.s4Title')} figure={
        <MiniList
          columns={['name', 'effort', 'remaining', 'assignees']}
          rows={[{ name: 'Dev', effort: '8 j', remaining: '5 j', assignees: [{ label: 'AL', color: BLUE, units: 100 }, { label: 'BM', color: ORANGE, units: 50 }] }]}
          callouts={[{ col: 'assignees', row: 0, label: t('help.visual.list.assignees'), place: 'bottom' }]}
        />
      }>
        <Prose text={t('help.guide.s4Body')} />
      </Block>

      <Block title={t('help.guide.s5Title')} figure={
        <MiniGantt
          scene={{ days: 10, labelWidth: 70, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 2, to: 6 }], baseline: { from: 1, to: 4 } }] }}
          callouts={[{ day: 1, row: 0, edge: 'start', yAnchor: 'lower', dy: 6, label: t('help.guide.caBaseline'), place: 'bottom' }]}
        />
      }>
        {t('help.guide.s5Body').split('\n\n').map((para, i, arr) => (
          <p key={i} className={i > 0 ? 'mt-2' : undefined}>
            {para}
            {i === arr.length - 1 && (
              <span className="ml-1 inline-flex items-center gap-1 rounded border border-line bg-paper-deep/60 px-1.5 py-0.5 align-middle text-[11px] text-ink-soft">
                <IconSettings size={12} /> {t('help.guide.caControls')}
              </span>
            )}
          </p>
        ))}
      </Block>

      <Block title={t('help.guide.s6Title')} figure={
        <MiniGantt
          scene={{ days: 11, labelWidth: 70, today: 5, todayLine: 5, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 8 }], progress: 0.12 }] }}
          callouts={[
            { day: 5, row: 0, edge: 'start', label: t('help.guide.caToday'), place: 'top' },
            { day: 3, row: 0, edge: 'start', label: t('help.visual.gantt.realized'), place: 'bottom' },
            { day: 7, row: 0, edge: 'start', label: t('help.visual.gantt.remaining'), place: 'right', dist: 80 },
          ]}
        />
      }>
        <Prose text={t('help.guide.s6Body')} />
      </Block>

      <Block title={t('help.guide.s7Title')} figure={
        <MiniGantt
          scene={{
            days: 12, labelWidth: 70,
            rows: [
              { kind: 'group', name: 'Lot UI', color: PURPLE, intervals: [{ from: 1, to: 4 }, { from: 6, to: 9 }], progress: 0.4 },
              { kind: 'task', name: 'Écrans', color: PURPLE, scheduling: 'effort', blocks: [{ from: 1, to: 4 }] },
              { kind: 'task', name: 'Revue', color: PURPLE, scheduling: 'fixed', blocks: [{ from: 6, to: 9 }] },
            ],
          }}
          callouts={[{ day: 1, row: 0, edge: 'start', label: t('help.visual.gantt.group'), place: 'top' }]}
        />
      }>
        <Prose text={t('help.guide.s7Body')} />
      </Block>

      <Block title={t('help.guide.s8Title')} figure={
        <div className="flex flex-col gap-12">
          <MiniList
            columns={['name', 'effort', 'remaining', 'status']}
            rows={[{ name: 'Intégration', type: 'task', scheduling: 'Pilotée', effort: '4 j', remaining: '4 j', status: { label: 'En cours', color: 'var(--color-accent)' }, conflictCount: 1 }]}
            callouts={[{ col: 'name', row: 0, dx: 100, label: t('help.guide.caBadge'), place: 'top' }]}
          />
          <MiniGantt
            scene={{ days: 13, labelWidth: 70, rows: [{ kind: 'task', name: 'Intégration', color: ORANGE, scheduling: 'effort', blocks: [{ from: 2, to: 6 }], conflict: true, proposal: { from: 5, to: 9, delta: '+3 j' } }] }}
            callouts={[{ day: 8, row: 0, edge: 'mid', dy: -7, label: t('help.guide.caProposal'), place: 'top' }]}
          />
        </div>
      }>
        <Prose text={t('help.guide.s8Body')} />
      </Block>
    </div>
  );
}

function sceneStart(): ReactNode {
  const rows: MiniListRow[] = [
    { name: 'Projet Alpha', type: 'group', hasChildren: true, depth: 0 },
    { name: 'Cadrage', type: 'task', depth: 1, scheduling: 'Dates', effort: '3 j', hovered: true, showAdd: true },
  ];
  return (
    <MiniList
      columns={['name', 'scheduling', 'effort', 'status']}
      rows={rows}
      callouts={[
        { col: 'name', row: 1, dx: -90, dy: 14, label: t('help.guide.caAdd'), place: 'bottom' },
        { col: 'name', row: 1, dx: 112, label: t('help.guide.caMenu'), place: 'top' },
      ]}
    />
  );
}

/** Schéma d'ensemble de l'interface : barre d'outils en haut, liste à gauche, Gantt à droite. */
function LayoutSketch() {
  return (
    <svg viewBox="0 0 520 168" width="100%" style={{ maxWidth: 520, height: 'auto' }} role="img">
      {/* Barre d'outils */}
      <rect x={4} y={4} width={512} height={22} rx={4} fill="var(--color-paper-deep)" stroke="var(--color-line)" />
      <text x={260} y={19} textAnchor="middle" fontSize={11} fontWeight="bold" fill="var(--color-ink-soft)">{t('help.guide.overviewTop')}</text>

      {/* Liste (gauche) */}
      <rect x={4} y={32} width={196} height={132} rx={4} fill="var(--color-surface)" stroke="var(--color-line)" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={16} y1={56 + i * 22} x2={120} y2={56 + i * 22} stroke="var(--color-line-strong)" strokeWidth={2} opacity={0.5} />
          <line x1={150} y1={56 + i * 22} x2={186} y2={56 + i * 22} stroke="var(--color-line)" strokeWidth={2} />
        </g>
      ))}
      <text x={102} y={156} textAnchor="middle" fontSize={11} fontWeight="bold" fill="var(--color-accent)">{t('help.guide.overviewLeft')}</text>

      {/* Gantt (droite) */}
      <rect x={206} y={32} width={310} height={132} rx={4} fill="var(--color-surface)" stroke="var(--color-line)" />
      {[
        { y: 50, x: 230, w: 120, c: BLUE },
        { y: 72, x: 280, w: 90, c: GREEN },
        { y: 94, x: 250, w: 150, c: ORANGE },
        { y: 116, x: 330, w: 80, c: PURPLE },
      ].map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={11} rx={3} fill={b.c} opacity={0.6} />
      ))}
      <text x={361} y={156} textAnchor="middle" fontSize={11} fontWeight="bold" fill="var(--color-accent)">{t('help.guide.overviewRight')}</text>
    </svg>
  );
}

/* ——— 2. Concepts clés ——— */

function ConceptsTab() {
  const effortItems: (MiniGanttNumber & { label: string })[] = [
    { n: 1, day: 4, row: 0, edge: 'start', label: t('help.visual.gantt.realized') },
    { n: 2, day: 8, row: 0, edge: 'start', label: t('help.visual.gantt.remaining') },
    { n: 3, day: 1, row: 0, edge: 'mid', dy: 7, label: t('help.visual.gantt.progress') },
    { n: 4, day: 5, row: 0, edge: 'start', dy: -9, label: t('help.visual.gantt.reviewLine') },
  ];
  return (
    <div>
      <Lead>{t('help.concepts.intro')}</Lead>

      <Block
        title={t('help.concepts.effortTitle')}
        legend={<NumberedLegend items={effortItems} />}
        figure={
          <MiniGantt
            numbers={effortItems}
            scene={{ days: 12, labelWidth: 70, today: 5, todayLine: 5, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 9 }], progress: 0.3 }] }}
          />
        }
      >
        <Prose text={t('help.concepts.effortBody')} />
        <ul className="mt-2 space-y-1">
          <li className="rounded-md bg-paper-deep/60 px-2.5 py-1.5">{t('help.concepts.effortEx1')}</li>
          <li className="rounded-md bg-paper-deep/60 px-2.5 py-1.5">{t('help.concepts.effortEx2')}</li>
        </ul>
        <p className="mt-2">{t('help.concepts.effortReading')}</p>
        <p className="mt-2 text-ink-faint">{t('help.concepts.effortLimit')}</p>
      </Block>

      <Block
        title={t('help.concepts.halfBarTitle')}
        figure={
          <MiniGantt
            scene={{ days: 11, dayWidth: 30, labelWidth: 56, rows: [{ kind: 'task', name: 'Tâche', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 8 }], progress: 0.4 }] }}
            callouts={[
              { day: 1, row: 0, edge: 'start', yAnchor: 'upper', label: t('help.concepts.halfBarProgress'), place: 'top' },
              { day: 7, row: 0, edge: 'start', yAnchor: 'upper', label: t('help.concepts.halfBarMove'), place: 'top', cursor: 'move' },
              { day: 8, row: 0, edge: 'end', yAnchor: 'lower', label: t('help.concepts.halfBarResize'), place: 'bottom', cursor: 'resize-x' },
            ]}
          />
        }
      >
        <Prose text={t('help.concepts.halfBarBody')} />
      </Block>

      <Block
        title={t('help.concepts.typesTitle')}
        figure={
          <MiniGantt
            scene={{
              days: 10, labelWidth: 80,
              rows: [
                { kind: 'task', name: 'Pilotée', color: BLUE, scheduling: 'effort', blocks: [{ from: 1, to: 5 }] },
                { kind: 'task', name: 'Dates', color: ORANGE, scheduling: 'fixed', blocks: [{ from: 1, to: 5 }] },
              ],
            }}
            callouts={[
              { day: 5, row: 0, edge: 'end', label: t('help.visual.gantt.rounded'), place: 'right' },
              { day: 5, row: 1, edge: 'end', label: t('help.visual.gantt.square'), place: 'right' },
            ]}
          />
        }
      >
        <Prose text={t('help.concepts.typesBody')} />
      </Block>

      <Block
        title={t('help.concepts.equationTitle')}
        figure={
          <MiniGantt
            scene={{
              days: 6, dayWidth: 26, labelWidth: 88,
              rows: [
                { kind: 'task', name: '1 pers.', color: BLUE, scheduling: 'effort', blocks: [{ from: 0, to: 3 }] },
                { kind: 'task', name: '2 pers.', color: BLUE, scheduling: 'effort', blocks: [{ from: 0, to: 1 }] },
                { kind: 'task', name: '2 × 50 %', color: BLUE, scheduling: 'effort', blocks: [{ from: 0, to: 3 }] },
              ],
            }}
            callouts={[{ day: 3, row: 0, edge: 'end', label: '4 j-h de travail', place: 'top' }]}
          />
        }
      >
        <Prose text={t('help.concepts.equationBody')} />
      </Block>

      <Block
        title={t('help.concepts.blocksTitle')}
        figure={
          <MiniGantt
            scene={{ days: 12, labelWidth: 70, rows: [{ kind: 'task', name: 'Tâche', color: BLUE, scheduling: 'effort', blocks: [{ from: 1, to: 3 }, { from: 7, to: 10 }] }] }}
            callouts={[
              { day: 1, row: 0, edge: 'start', label: 'Bloc 1', place: 'top' },
              { day: 7, row: 0, edge: 'start', label: 'Bloc 2', place: 'top' },
            ]}
          />
        }
      >
        <Prose text={t('help.concepts.blocksBody')} />
      </Block>

      <Block
        title={t('help.concepts.linksTitle')}
        figure={
          <div className="flex flex-col gap-9">
            <MiniGantt
              scene={{
                days: 11, labelWidth: 26,
                rows: [
                  { kind: 'task', name: 'A', color: GREEN, scheduling: 'fixed',  blocks: [{ from: 1, to: 4 }] },
                  { kind: 'task', name: 'B', color: GREEN, scheduling: 'effort', blocks: [{ from: 5, to: 9 }] },
                ],
                links: [{ fromRow: 0, fromDay: 4, toRow: 1, toDay: 5 }],
              }}
              callouts={[{ day: 5, row: 1, edge: 'start', label: 'FD', place: 'bottom' }]}
            />
            <MiniGantt
              scene={{
                days: 12, labelWidth: 26,
                rows: [
                  { kind: 'task', name: 'C', color: BLUE, scheduling: 'fixed',  blocks: [{ from: 1, to: 7 }] },
                  { kind: 'task', name: 'D', color: BLUE, scheduling: 'effort', blocks: [{ from: 5, to: 10 }] },
                ],
                links: [{ fromRow: 0, fromDay: 1, toRow: 1, toDay: 8 }],
              }}
              callouts={[{ day: 4, row: 1, edge: 'start', label: 'P1D3', place: 'bottom' }]}
            />
          </div>
        }
      >
        <Prose text={t('help.concepts.linksBody')} />
      </Block>

      <Block
        title={t('help.concepts.loadTitle')}
        figure={
          <MiniGantt
            scene={{ days: 11, labelWidth: 70, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 8 }], overload: { from: 4, to: 6 } }] }}
            callouts={[{ day: 5, row: 0, edge: 'start', label: t('help.visual.gantt.orange'), place: 'top' }]}
          />
        }
      >
        <Prose text={t('help.concepts.loadBody')} />
      </Block>

      <Block
        title={t('help.concepts.proposalTitle')}
        figure={
          <MiniGantt
            scene={{
              days: 13, labelWidth: 70,
              rows: [{ kind: 'task', name: 'Dev', color: ORANGE, scheduling: 'effort', blocks: [{ from: 2, to: 6 }], conflict: true, proposal: { from: 5, to: 9, delta: '+3 j' } }],
            }}
            callouts={[{ day: 8, row: 0, edge: 'mid', dy: -7, label: t('help.guide.caProposal'), place: 'top' }]}
          />
        }
      >
        <Prose text={t('help.concepts.proposalBody')} />
      </Block>
    </div>
  );
}

/* ——— 3. Légende visuelle ——— */

function LegendTab() {
  const listRows: MiniListRow[] = [
    {
      name: 'Refonte UI', type: 'group', hasChildren: true, depth: 0, scheduling: '—',
      effort: '12 j', realized: '4 j', remaining: '8 j', progress: '33 %', status: { label: '—', color: 'var(--color-ink-faint)' },
    },
    {
      name: 'Maquettes', type: 'task', depth: 1, scheduling: 'Pilotée',
      estimate: '5 j', effort: '6 j', realized: '2 j', remaining: '4 j', progress: '40 %',
      assignees: [{ label: 'AL', color: BLUE, units: 100 }], start: '02/06', status: { label: 'En cours', color: 'var(--color-accent)' },
      conflictCount: 1, hovered: true,
    },
    {
      name: 'Intégration', type: 'task', depth: 1, scheduling: 'Dates',
      estimate: '4 j', effort: '4 j', realized: '0 j', remaining: '4 j', progress: '0 %',
      assignees: [{ label: 'BM', color: ORANGE, units: 120 }], start: '09/06', status: { label: 'À faire', color: 'var(--color-ink-faint)' },
    },
  ];

  // Repères de la liste (badge sur l'en-tête de colonne, ou sur la cellule concernée).
  const listItems: (MiniListNumber & { label: string })[] = [
    { n: 1, col: 'name', row: 1, dx: -55, label: t('help.visual.list.name') },
    { n: 2, col: 'scheduling', row: -1, dy: -9, label: t('help.visual.list.scheduling') },
    { n: 3, col: 'effort', row: -1, dy: -9, label: t('help.visual.list.effort') },
    { n: 4, col: 'realized', row: -1, dy: -9, label: t('help.visual.list.realized') },
    { n: 5, col: 'remaining', row: -1, dy: -9, label: t('help.visual.list.remaining') },
    { n: 6, col: 'progress', row: -1, dy: -9, label: t('help.visual.list.progress') },
    { n: 7, col: 'assignees', row: 1, label: t('help.visual.list.assignees') },
    { n: 8, col: 'status', row: -1, dy: -9, label: t('help.visual.list.status') },
  ];

  // Repères de l'anatomie du Gantt.
  const ganttItems: (MiniGanttNumber & { label: string })[] = [
    { n: 1,  day: 8,  row: 0, edge: 'end',   dx: 9,         label: t('help.visual.gantt.rounded') },
    { n: 2,  day: 4,  row: 0, edge: 'mid',                  label: t('help.visual.gantt.realized') },
    { n: 3,  day: 7,  row: 0, edge: 'mid',                  label: t('help.visual.gantt.remaining') },
    { n: 4,  day: 2,  row: 0, edge: 'mid',   dy: -9,        label: t('help.visual.gantt.progress') },
    { n: 5,  day: 0,  row: 0, edge: 'mid',   dy: 14,        label: t('help.visual.gantt.baseline') },
    { n: 6,  day: 6,  row: 3, edge: 'start', dy: 7,         label: t('help.visual.gantt.todayLine') },
    { n: 7,  day: 10, row: 3, edge: 'start', dy: 7,         label: t('help.visual.gantt.reviewLine') },
    { n: 8,  day: 6,  row: 1, edge: 'end',   dx: 9,         label: t('help.visual.gantt.square') },
    { n: 9,  day: 8,  row: 1, edge: 'end',   dy: 15,        label: t('help.visual.gantt.deadline') },
    { n: 10, day: 12, row: 2, edge: 'mid',   dy: -14,       label: t('help.visual.gantt.milestone') },
    { n: 11, day: 14, row: 3, edge: 'mid',                  label: t('help.visual.gantt.group') },
  ];

  // Repères des marqueurs & conflits.
  const markerItems: (MiniGanttNumber & { label: string })[] = [
    { n: 1, day: 4, row: 0, edge: 'end', dx: 17, dy: 7, label: t('help.visual.gantt.link') },
    { n: 2, day: 8, row: 1, edge: 'start', label: t('help.visual.gantt.conflict') },
    { n: 3, day: 6, row: 2, edge: 'mid', label: t('help.visual.gantt.orange') },
    { n: 4, day: 0, row: 3, edge: 'start', dx: 24, label: t('help.visual.gantt.unplanned') },
    { n: 5, day: 0, row: 4, edge: 'start', dx: 24, label: t('help.visual.gantt.unassigned') },
    { n: 6, day: 0, row: 5, edge: 'start', dx: 24, label: t('help.visual.gantt.overflow') },
    { n: 7, day: 4, row: 6, edge: 'mid', label: t('help.visual.gantt.cancelled') },
    { n: 8, day: 9, row: 7, edge: 'end', dx: 9, label: t('help.visual.gantt.ghost') },
  ];

  return (
    <div>
      <Lead>{t('help.visual.intro')}</Lead>

      <Block title={t('help.visual.listTitle')} figure={<MiniList rows={listRows} numbers={listItems} />} legend={<NumberedLegend items={listItems} />}>
        {t('help.visual.list.addButtons')} · {t('help.visual.list.resize')}.
      </Block>

      <Block title={t('help.visual.ganttTitle')} legend={<NumberedLegend items={ganttItems} />} figure={
        <MiniGantt
          numbers={ganttItems}
          scene={{
            days: 17, labelWidth: 64, today: 6, todayLine: 6, reviewLine: 10,
            rows: [
              { kind: 'task', name: 'Effort', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 8 }], progress: 0.3, baseline: { from: 0, to: 6 } },
              { kind: 'task', name: 'Dates', color: ORANGE, scheduling: 'fixed', blocks: [{ from: 2, to: 6 }], deadline: 8 },
              { kind: 'milestone', name: 'Jalon', color: PURPLE, day: 12 },
              { kind: 'group', name: 'Groupe', color: BLUE, intervals: [{ from: 13, to: 15 }] },
            ],
          }}
        />
      }>
      </Block>

      <Block title={t('help.visual.markersTitle')} legend={<NumberedLegend items={markerItems} />} figure={
        <MiniGantt
          numbers={markerItems}
          scene={{
            days: 14, labelWidth: 86, today: 5, todayLine: 5,
            links: [{ fromRow: 0, fromDay: 4, toRow: 1, toDay: 6, violated: true }],
            rows: [
              { kind: 'task', name: 'Prédécesseur', color: BLUE, scheduling: 'fixed', blocks: [{ from: 1, to: 4 }], linkHandle: true },
              { kind: 'task', name: 'Conflit (lien)', color: GREEN, scheduling: 'effort', blocks: [{ from: 6, to: 9 }], conflict: true },
              { kind: 'task', name: 'Surcharge', color: GREEN, scheduling: 'effort', blocks: [{ from: 2, to: 8 }], overload: { from: 5, to: 7 } },
              { kind: 'task', name: 'Non planifiée', color: BLUE, scheduling: 'effort', blocks: [], marker: 'unplanned' },
              { kind: 'task', name: 'Non affectée', color: BLUE, scheduling: 'effort', blocks: [{ from: 9, to: 12 }], marker: 'unassigned' },
              { kind: 'task', name: 'Effort non casé', color: BLUE, scheduling: 'effort', blocks: [{ from: 9, to: 12 }], marker: 'effort-overflow' },
              { kind: 'task', name: 'Annulée', color: BLUE, scheduling: 'fixed', blocks: [{ from: 2, to: 6 }], status: 'cancelled' },
              { kind: 'task', name: 'Non planifiée (ghost)', color: PURPLE, scheduling: 'effort', blocks: [], ghosts: [{ from: 9, to: 9 }] },
            ],
          }}
        />
      }>
      </Block>
    </div>
  );
}

/* ——— 4. Gestes & raccourcis ——— */

function GesturesTab() {
  const half = Math.ceil(LEGEND_KEYS.length / 2);
  const col1 = LEGEND_KEYS.slice(0, half);
  const col2 = LEGEND_KEYS.slice(half);
  const renderItem = (k: typeof LEGEND_KEYS[number]) => (
    <li key={k} className="rounded-md bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-ink-soft ring-1 ring-line">
      {t(`help.legend.${k}`)}
    </li>
  );
  return (
    <div>
      <Lead>{t('help.legendTitle')}</Lead>
      <div className="flex gap-1.5">
        <ul className="flex flex-1 flex-col gap-1.5">{col1.map(renderItem)}</ul>
        <ul className="flex flex-1 flex-col gap-1.5">{col2.map(renderItem)}</ul>
      </div>
    </div>
  );
}

/* ——— 5. Où trouver / Comment faire ——— */

const HOWTO_KEYS = [
  'addTask', 'place', 'assign', 'link', 'mode', 'split', 'group', 'baseline', 'review', 'conflict', 'nav', 'io',
] as const;

function HowtoTab() {
  return (
    <div>
      <Lead>{t('help.howto.intro')}</Lead>
      <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
        {HOWTO_KEYS.map((k) => (
          <div key={k} className="px-4 py-3">
            <dt className="font-display text-[13px] font-semibold text-ink">{t(`help.howto.${k}Q`)}</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
              <Prose text={t(`help.howto.${k}A`)} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
