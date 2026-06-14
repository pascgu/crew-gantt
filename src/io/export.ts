import type { Schedule } from '@/core/scheduler/schedule';
import type { TeamFile } from '@/core/model/types';

/** Jetons de thème à inliner pour que le SVG exporté soit autonome. */
const THEME_VARS = [
  '--color-paper',
  '--color-paper-deep',
  '--color-surface',
  '--color-ink',
  '--color-ink-soft',
  '--color-ink-faint',
  '--color-line',
  '--color-line-strong',
  '--color-accent',
  '--color-accent-deep',
  '--color-accent-wash',
  '--color-ok',
  '--color-warn',
  '--color-warn-wash',
  '--color-danger',
  '--color-danger-wash',
];

/** Export PNG du Gantt : sérialise le SVG, le rastérise en 2× sur canvas. */
export async function exportGanttPng(svg: SVGSVGElement, fileName: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const rootStyle = getComputedStyle(document.documentElement);
  for (const name of THEME_VARS) {
    clone.style.setProperty(name, rootStyle.getPropertyValue(name));
  }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.style.fontFamily = "'IBM Plex Sans', sans-serif";
  clone.style.background = rootStyle.getPropertyValue('--color-surface') || '#ffffff';

  const width = Number(svg.getAttribute('width')) || svg.clientWidth;
  const height = Number(svg.getAttribute('height')) || svg.clientHeight;
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = rootStyle.getPropertyValue('--color-surface') || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(blob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

const CSV_SEPARATOR = ';';

/** Export CSV des tâches (séparateur ; — convention française). */
export function tasksToCsv(file: TeamFile, schedule: Schedule): string {
  const header = [
    'Tâche',
    'Projet',
    'Type',
    'Statut',
    'Estim (j-h)',
    'Effort (j-h)',
    'Reste (j-h)',
    'Début',
    'Fin',
    'Affectés',
    'Prérequis',
  ];
  const lines = [header.join(CSV_SEPARATOR)];
  const projectName = new Map(file.projects.map((p) => [p.id, p.name]));
  const resourceName = new Map(file.resources.map((r) => [r.id, r.name]));

  for (const { task, depth } of schedule.hierarchy.flatten()) {
    const span = schedule.spanByTask.get(task.id);
    const resolved = schedule.resolvedByTask.get(task.id) ?? [];
    const last = resolved[resolved.length - 1];
    const assignees = (last?.block.assignments ?? [])
      .map((a) => `${resourceName.get(a.resourceId) ?? a.resourceId} (${a.units} %)`)
      .join(', ');
    lines.push(
      [
        `${'  '.repeat(depth)}${task.name}`,
        projectName.get(task.projectId) ?? '',
        task.type,
        task.status,
        task.estimate ?? '',
        task.type === 'task' ? task.effort : '',
        task.type === 'task' ? task.remaining : '',
        span?.start ?? '',
        span?.end ?? '',
        assignees,
        task.requirements,
      ]
        .map(csvEscape)
        .join(CSV_SEPARATOR),
    );
  }
  return lines.join('\r\n');
}

export function exportTasksCsv(file: TeamFile, schedule: Schedule, fileName: string): void {
  // BOM pour qu'Excel ouvre l'UTF-8 correctement
  const blob = new Blob(['﻿' + tasksToCsv(file, schedule)], {
    type: 'text/csv;charset=utf-8',
  });
  downloadBlob(blob, fileName);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
