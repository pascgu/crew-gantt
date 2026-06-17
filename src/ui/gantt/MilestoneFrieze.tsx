import type { MouseEvent } from 'react';
import type { Project, Task } from '@/core/model/types';
import { t } from '@/i18n/fr';
import { taskColor } from './format';
import { FRIEZE_LANE_H } from './timescale';

const DIAMOND = 6;
const HALF = DIAMOND / 2;
const GAP = 3; // espace losange ↔ texte
const MIN_GAP = 3; // espace minimum entre deux losanges d'une même lane
const MAX_LABEL = 150; // largeur max d'un libellé (px)
const MIN_VIS = 12; // en-dessous : pas de texte (losange seul), le nom passe en infobulle
const MAX_LANES = 4; // au-delà : regroupement en multi-losange
const OVERFLOW_SPAN = 12; // proximité (px) pour regrouper les jalons qui ne tiennent pas

export interface FriezeMarker {
  key: string;
  x: number; // centre du jour (px)
  lane: number;
  color: string;
  /** Libellé visible (vide pour un marqueur de dépassement). */
  label: string;
  /** Infobulle (nom complet, ou liste pour un dépassement). */
  title: string;
  /** Largeur allouée au texte (px). */
  labelW: number;
  overflow?: boolean;
}

export interface FriezeLayout {
  markers: FriezeMarker[];
  height: number;
}

interface FriezeInput {
  task: Task;
  date: string;
  x: number;
  color: string;
}

/** Largeur estimée d'un libellé (placement seulement ; le rendu se fait en pixels géométriques). */
function estWidth(name: string): number {
  return Math.min(name.length * 5.4 + 4, MAX_LABEL);
}

interface Lane {
  diamondRight: number; // bord droit du dernier losange
  textEnd: number; // fin estimée du dernier texte
}

/** Packing par losange (le texte n'impose pas de lane) ; préfère ne pas tronquer le voisin. */
function packDiamonds(items: FriezeInput[], maxLanes: number) {
  const lanes: Lane[] = [];
  const placed: { it: FriezeInput; lane: number }[] = [];
  const overflow: FriezeInput[] = [];
  for (const it of items) {
    const left = it.x - HALF;
    const fits: number[] = [];
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l]!.diamondRight + MIN_GAP <= left) fits.push(l);
    }
    const full = fits.filter((l) => lanes[l]!.textEnd + GAP <= left);
    let lane: number;
    if (full.length) {
      // Lane la plus haute où le losange ET le texte du voisin tiennent (remplissage top-first).
      lane = full[0]!;
    } else if (lanes.length < maxLanes) {
      lane = lanes.length;
      lanes.push({ diamondRight: -Infinity, textEnd: -Infinity });
    } else if (fits.length) {
      // Plus de place sans tronquer : lane la plus haute où le losange tient (texte tronqué).
      lane = fits[0]!;
    } else {
      overflow.push(it);
      continue;
    }
    lanes[lane]!.diamondRight = it.x + HALF;
    lanes[lane]!.textEnd = it.x + HALF + GAP + estWidth(it.task.name);
    placed.push({ it, lane });
  }
  return { placed, overflow, laneCount: lanes.length };
}

function layout(items: FriezeInput[]): FriezeLayout {
  const first = packDiamonds(items, MAX_LANES);
  let { placed, overflow } = first;
  // Si dépassement, réserver la dernière lane : repack sur MAX_LANES-1, le reste y sera regroupé.
  let overflowLane = first.laneCount;
  let visibleLanes = first.laneCount;
  if (overflow.length > 0 && MAX_LANES > 1) {
    const second = packDiamonds(items, MAX_LANES - 1);
    placed = second.placed;
    overflow = second.overflow;
    overflowLane = MAX_LANES - 1;
    visibleLanes = MAX_LANES;
  }

  // Largeur de texte géométrique = jusqu'au prochain losange de la même lane (placed trié par x).
  const markers: FriezeMarker[] = placed.map((p, i) => {
    let nextX: number | null = null;
    for (let j = i + 1; j < placed.length; j++) {
      if (placed[j]!.lane === p.lane) {
        nextX = placed[j]!.it.x;
        break;
      }
    }
    const right = nextX !== null ? nextX - HALF - MIN_GAP : p.it.x + HALF + GAP + MAX_LABEL;
    const avail = Math.max(0, Math.min(right - (p.it.x + HALF + GAP), MAX_LABEL));
    const showText = avail >= MIN_VIS;
    return {
      key: p.it.task.id,
      x: p.it.x,
      lane: p.lane,
      color: p.it.color,
      label: showText ? p.it.task.name : '',
      title: p.it.task.name,
      labelW: showText ? avail : 0,
    };
  });

  // Dépassement : regrouper par proximité ; un seul → marqueur normal, plusieurs → multi-losange.
  let i = 0;
  while (i < overflow.length) {
    const start = overflow[i]!;
    const group = [start];
    let j = i + 1;
    while (j < overflow.length && overflow[j]!.x - start.x < OVERFLOW_SPAN) {
      group.push(overflow[j]!);
      j++;
    }
    if (group.length === 1) {
      markers.push({
        key: start.task.id,
        x: start.x,
        lane: overflowLane,
        color: start.color,
        label: '',
        title: start.task.name,
        labelW: 0,
      });
    } else {
      markers.push({
        key: `ov-${start.task.id}`,
        x: start.x,
        lane: overflowLane,
        color: start.color,
        label: '',
        title: `${t('gantt.friezeMore', { count: group.length })}\n${group.map((g) => g.task.name).join('\n')}`,
        labelW: 0,
        overflow: true,
      });
    }
    i = j;
  }

  return { markers, height: visibleLanes * FRIEZE_LANE_H + 2 };
}

/** Construit la disposition de la frise à partir des tâches (jalons marqués `frieze`). */
export function buildFriezeLayout(
  tasks: Task[],
  projects: Project[],
  xOf: (date: string) => number,
): FriezeLayout {
  const items: FriezeInput[] = tasks
    .filter((tk) => tk.type === 'milestone' && tk.frieze && tk.date)
    .map((tk) => ({ task: tk, date: tk.date!, color: taskColor(tk, projects) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((it) => ({ ...it, x: xOf(it.date) }));
  if (items.length === 0) return { markers: [], height: 0 };
  return layout(items);
}

function setTitleIfTruncated(e: MouseEvent<HTMLSpanElement>, title: string) {
  const el = e.currentTarget;
  el.title = el.scrollWidth > el.clientWidth ? title : '';
}

export function MilestoneFrieze({ layout: lay }: { layout: FriezeLayout }) {
  return (
    <div className="relative" style={{ height: lay.height }}>
      {lay.markers.map((m) => (
        <div
          key={m.key}
          className="absolute flex items-center"
          style={{ left: m.x - HALF, top: m.lane * FRIEZE_LANE_H, height: FRIEZE_LANE_H }}
          title={m.overflow ? m.title : undefined}
        >
          {m.overflow ? (
            <span className="relative inline-block shrink-0" style={{ width: DIAMOND + 4, height: DIAMOND }}>
              <span className="absolute" style={{ left: 0, top: 0, width: DIAMOND, height: DIAMOND, background: m.color, transform: 'rotate(45deg)' }} />
              <span className="absolute" style={{ left: 4, top: 0, width: DIAMOND, height: DIAMOND, background: m.color, transform: 'rotate(45deg)' }} />
            </span>
          ) : (
            <span
              className="shrink-0"
              style={{ width: DIAMOND, height: DIAMOND, background: m.color, transform: 'rotate(45deg)', marginRight: GAP }}
              title={m.label ? undefined : m.title}
            />
          )}
          {m.label && (
            <span
              className="truncate font-display text-[9px] font-semibold leading-none tracking-tight"
              style={{ maxWidth: m.labelW, color: m.color }}
              onMouseEnter={(e) => setTitleIfTruncated(e, m.title)}
            >
              {m.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
