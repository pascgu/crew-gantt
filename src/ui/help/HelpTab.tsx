/**
 * HelpTab — l'aide en onglet dédié, en 5 sous-onglets. Remplace l'ancienne modale.
 * Les illustrations sont des MiniGantt / MiniList (répliques fidèles, lecture seule) annotés —
 * plus de Mermaid. Voir plans/agent-conversations.md §1.13 et plans/conflicts.md.
 */
import { useState, type ReactNode } from 'react';
import { t } from '@/i18n/fr';
import { IconSettings } from '@/ui/common/icons';
import { ANNOTATION_CSS } from './Annotated';
import { MiniGantt } from './MiniGantt';
import { MiniList, type MiniListRow } from './MiniList';

type SubTab = 'guide' | 'concepts' | 'legend' | 'gestures' | 'howto';
const SUBTABS: SubTab[] = ['guide', 'concepts', 'legend', 'gestures', 'howto'];

const BLUE = '#4f8ef7';
const ORANGE = '#e0863c';
const GREEN = '#3fae6b';
const PURPLE = '#8b6fd6';

const LEGEND_KEYS = [
  'dragBar', 'dragEdge', 'progressDrag', 'linkHandle', 'shiftDrag', 'shiftDrop',
  'enclosingGroup', 'cycleSplit', 'rightClickBar', 'rightClickRow', 'panDrag',
  'middleClick', 'ctrlWheel', 'doubleClick', 'arrows', 'insertKey', 'altArrows',
  'undoRedo', 'cancelled', 'ctrlDrag', 'orangeBand',
] as const;

export function HelpTab() {
  const [tab, setTab] = useState<SubTab>('guide');
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
              onClick={() => setTab(id)}
              className={`border-b-2 px-3 py-2 text-[12.5px] font-medium transition ${
                tab === id ? 'border-accent text-accent' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t(`help.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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

function Block({ title, children, figure }: { title: string; children: ReactNode; figure?: ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="mb-1.5 font-display text-[14px] font-semibold text-ink">{title}</h3>
      <div className="text-[12.5px] leading-relaxed text-ink-soft">{children}</div>
      {figure && <Figure>{figure}</Figure>}
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

/* ——— 1. Prise en main ——— */

function GuideTab() {
  return (
    <div>
      <section className="mb-6">
        <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">{t('help.guide.overviewBody')}</p>
        <Figure><LayoutSketch /></Figure>
      </section>

      <Lead>{t('help.guideIntro')}</Lead>

      <Block title={t('help.guide.s1Title')} figure={sceneStart()}>
        {t('help.guide.s1Body')}
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
        {t('help.guide.s2Body')}
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
        {t('help.guide.s3Body')}
      </Block>

      <Block title={t('help.guide.s4Title')} figure={
        <MiniList
          columns={['name', 'effort', 'remaining', 'assignees']}
          rows={[{ name: 'Dev', effort: '8 j', remaining: '5 j', assignees: [{ label: 'AL', color: BLUE, units: 100 }, { label: 'BM', color: ORANGE, units: 50 }] }]}
          callouts={[{ col: 'assignees', row: 0, label: t('help.visual.list.assignees'), place: 'bottom' }]}
        />
      }>
        {t('help.guide.s4Body')}
      </Block>

      <Block title={t('help.guide.s5Title')} figure={
        <MiniGantt
          scene={{ days: 10, labelWidth: 70, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 2, to: 6 }], baseline: { from: 1, to: 4 } }] }}
          callouts={[{ day: 1, row: 0, edge: 'start', yAnchor: 'lower', dy: 6, label: t('help.guide.caBaseline'), place: 'bottom' }]}
        />
      }>
        <span>{t('help.guide.s5Body')}</span>
        <span className="ml-1 inline-flex items-center gap-1 rounded border border-line bg-paper-deep/60 px-1.5 py-0.5 align-middle text-[11px] text-ink-soft">
          <IconSettings size={12} /> {t('help.guide.caControls')}
        </span>
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
        {t('help.guide.s6Body')}
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
        {t('help.guide.s7Body')}
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
        {t('help.guide.s8Body')}
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
  return (
    <div>
      <Lead>{t('help.concepts.intro')}</Lead>

      <Block
        title={t('help.concepts.effortTitle')}
        figure={
          <MiniGantt
            scene={{ days: 12, labelWidth: 70, today: 5, todayLine: 5, rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 9 }], progress: 0.3 }] }}
            callouts={[
              { day: 3, row: 0, edge: 'start', label: t('help.visual.gantt.realized'), place: 'top' },
              { day: 7, row: 0, edge: 'start', label: t('help.visual.gantt.remaining'), place: 'top' },
              { day: 1, row: 0, edge: 'mid', label: t('help.visual.gantt.progress'), place: 'bottom' },
              { day: 5, row: 0, edge: 'start', label: t('help.visual.gantt.reviewLine'), place: 'bottom' },
            ]}
          />
        }
      >
        <p>{t('help.concepts.effortBody')}</p>
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
        {t('help.concepts.halfBarBody')}
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
        {t('help.concepts.typesBody')}
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
        {t('help.concepts.equationBody')}
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
        {t('help.concepts.blocksBody')}
      </Block>

      <Block
        title={t('help.concepts.linksTitle')}
        figure={
          <MiniGantt
            scene={{
              days: 12, labelWidth: 70,
              rows: [
                { kind: 'task', name: 'A', color: BLUE, scheduling: 'fixed', blocks: [{ from: 1, to: 4 }] },
                { kind: 'task', name: 'B', color: GREEN, scheduling: 'effort', blocks: [{ from: 6, to: 10 }] },
              ],
              links: [{ fromRow: 0, fromDay: 4, toRow: 1, toDay: 6 }],
            }}
            callouts={[{ day: 5, row: 0, edge: 'end', label: 'FD', place: 'bottom' }]}
          />
        }
      >
        {t('help.concepts.linksBody')}
      </Block>

      <Block title={t('help.concepts.loadTitle')}>{t('help.concepts.loadBody')}</Block>

      <Block
        title={t('help.concepts.proposalTitle')}
        figure={
          <MiniGantt
            scene={{
              days: 13, labelWidth: 70,
              rows: [{ kind: 'task', name: 'Dev', color: GREEN, scheduling: 'effort', blocks: [{ from: 2, to: 6 }], ghosts: [{ from: 5, to: 9 }] }],
            }}
            callouts={[{ day: 5, row: 0, edge: 'start', label: t('help.visual.gantt.ghost') + ' → +3 j', place: 'top' }]}
          />
        }
      >
        {t('help.concepts.proposalBody')}
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
  return (
    <div>
      <Lead>{t('help.visual.intro')}</Lead>

      <Block title={t('help.visual.listTitle')} figure={
        <MiniList
          rows={listRows}
          callouts={[
            { col: 'name', row: 1, label: t('help.visual.list.name'), place: 'top' },
            { col: 'scheduling', row: 0, label: t('help.visual.list.scheduling'), place: 'top' },
            { col: 'effort', row: 0, label: t('help.visual.list.effort'), place: 'top' },
            { col: 'realized', row: 2, label: t('help.visual.list.realized'), place: 'bottom' },
            { col: 'remaining', row: 2, label: t('help.visual.list.remaining'), place: 'bottom' },
            { col: 'progress', row: 0, label: t('help.visual.list.progress'), place: 'top' },
            { col: 'assignees', row: 2, label: t('help.visual.list.assignees'), place: 'bottom' },
            { col: 'status', row: 0, label: t('help.visual.list.status'), place: 'top' },
          ]}
        />
      }>
        {t('help.visual.list.addButtons')} · {t('help.visual.list.resize')}.
      </Block>

      <Block title={t('help.visual.ganttTitle')} figure={
        <MiniGantt
          scene={{
            days: 16, labelWidth: 64, today: 6, todayLine: 6,
            rows: [
              { kind: 'task', name: 'Effort', color: GREEN, scheduling: 'effort', blocks: [{ from: 1, to: 9 }], progress: 0.3, baseline: { from: 0, to: 7 } },
              { kind: 'task', name: 'Dates', color: ORANGE, scheduling: 'fixed', blocks: [{ from: 2, to: 7 }], deadline: 6 },
              { kind: 'milestone', name: 'Jalon', color: PURPLE, day: 11 },
              { kind: 'group', name: 'Groupe', color: BLUE, intervals: [{ from: 12, to: 14 }] },
            ],
          }}
          callouts={[
            { day: 9, row: 0, edge: 'end', label: t('help.visual.gantt.rounded'), place: 'right' },
            { day: 3, row: 0, edge: 'start', label: t('help.visual.gantt.realized'), place: 'top' },
            { day: 8, row: 0, edge: 'start', label: t('help.visual.gantt.remaining'), place: 'top' },
            { day: 1, row: 0, edge: 'mid', label: t('help.visual.gantt.progress'), place: 'bottom' },
            { day: 0, row: 0, edge: 'start', label: t('help.visual.gantt.baseline'), place: 'bottom' },
            { day: 7, row: 1, edge: 'end', label: t('help.visual.gantt.square'), place: 'bottom' },
            { day: 6, row: 1, edge: 'end', label: t('help.visual.gantt.deadline'), place: 'right' },
            { day: 6, row: 3, edge: 'start', label: t('help.visual.gantt.todayLine'), place: 'bottom' },
            { day: 11, row: 2, edge: 'mid', label: t('help.visual.gantt.milestone'), place: 'top' },
            { day: 12, row: 3, edge: 'start', label: t('help.visual.gantt.group'), place: 'top' },
          ]}
        />
      }>
        {t('help.visual.gantt.reviewLine')}.
      </Block>

      <Block title={t('help.visual.markersTitle')} figure={
        <MiniGantt
          scene={{
            days: 14, labelWidth: 74, today: 5, todayLine: 5,
            rows: [
              { kind: 'task', name: 'Surcharge', color: GREEN, scheduling: 'effort', blocks: [{ from: 2, to: 8 }], overload: { from: 5, to: 7 } },
              { kind: 'task', name: 'Conflit', color: ORANGE, scheduling: 'fixed', blocks: [{ from: 3, to: 7 }], conflict: true },
              { kind: 'task', name: 'Non planifiée', color: BLUE, scheduling: 'effort', blocks: [], marker: 'unplanned' },
              { kind: 'task', name: 'Non affectée', color: BLUE, scheduling: 'effort', blocks: [{ from: 9, to: 12 }], marker: 'unassigned' },
              { kind: 'task', name: 'Annulée', color: BLUE, scheduling: 'fixed', blocks: [{ from: 2, to: 6 }], status: 'cancelled' },
            ],
          }}
          callouts={[
            { day: 5, row: 0, edge: 'start', label: t('help.visual.gantt.orange'), place: 'top' },
            { day: 7, row: 1, edge: 'end', label: t('help.visual.gantt.conflict'), place: 'right' },
            { day: 0, row: 2, edge: 'start', label: t('help.visual.gantt.unplanned'), place: 'top' },
            { day: 0, row: 3, edge: 'start', label: t('help.visual.gantt.unassigned'), place: 'bottom' },
            { day: 4, row: 4, edge: 'mid', label: t('help.visual.gantt.cancelled'), place: 'bottom' },
          ]}
        />
      }>
        {t('help.visual.gantt.link')} · {t('help.visual.gantt.overflow')} · {t('help.visual.gantt.ghost')}.
      </Block>
    </div>
  );
}

/* ——— 4. Gestes & raccourcis ——— */

function GesturesTab() {
  return (
    <div>
      <Lead>{t('help.legendTitle')}</Lead>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {LEGEND_KEYS.map((k) => (
          <li key={k} className="rounded-md bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-ink-soft ring-1 ring-line">
            {t(`help.legend.${k}`)}
          </li>
        ))}
      </ul>
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
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{t(`help.howto.${k}A`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
