/**
 * Scénario 2 — Planifier le travail et manipuler les barres.
 * Aide couverte : Prise en main §2 (ghosts, étirer) ; Concepts « deux moitiés d'une barre »,
 * « deux types de tâches », « une tâche = des blocs » ; Gestes : glisser barre / bord / encoche,
 * Ctrl+glisser (tâche et jalon), clic droit bloc (couper, fusionner, sous-tâche, supprimer),
 * clic droit ligne (ajouter un bloc), statut Annulé ; Où trouver : place, mode (Ctrl+P), split.
 */
import { expect, test, TODAY } from './fixtures';

const DAY = 14; // px par jour en zoom Semaine (zoom de la démo)

test('barres : ghost, étirer, déplacer, avancement, Ctrl+glisser, couper/fusionner, sous-tâche, annulée', async ({
  app,
  page,
}) => {
  const editor = page.locator('div.group\\/row input:focus');

  // — Nouvelle tâche non planifiée → ghost de placement —
  await (await app.row('Documentation interne')).click();
  await page.keyboard.press('Insert');
  await editor.fill('Tâche E2E');
  await editor.press('Enter');
  expect.soft(await app.blocks('Tâche E2E')).toEqual([]);
  expect.soft((await app.conflicts()).some((c) => c.type === 'unplanned' && c.taskName === 'Tâche E2E')).toBe(true);

  await (await app.row('Tâche E2E')).click();
  const ghostNow = page
    .locator('#gantt-chart-svg g')
    .filter({ has: page.locator('> title', { hasText: /^Planifier aujourd/ }) })
    .locator('> rect')
    .first();
  await ghostNow.click();
  let b = await app.blocks('Tâche E2E');
  expect.soft(b?.length).toBe(1);
  expect.soft(b?.[0]?.from).toBe(TODAY);

  // Mode par défaut d'une tâche créée dans un projet de la démo
  const sched = (await app.task('Tâche E2E'))?.scheduling;

  // — Étirer le bord droit (moitié basse) : +6 jours —
  let bar = await app.bar('Tâche E2E');
  await app.drag(bar, 6 * DAY, 0, { fx: 1, ox: -3, fy: 0.8 });
  b = await app.blocks('Tâche E2E');
  if (sched === 'fixed') expect.soft(b?.[0]?.to, 'étirer la fin (dates fixées)').toBe('2026-10-27');
  else expect.soft(b?.[0]?.to, 'étirer la fin (pilotée)').toBe('2026-10-27');

  // — Déplacer en attrapant la moitié haute droite : +7 jours —
  bar = await app.bar('Tâche E2E');
  await app.drag(bar, 7 * DAY, 0, { fx: 0.8, fy: 0.2 });
  b = await app.blocks('Tâche E2E');
  expect.soft(b?.[0]?.from, 'déplacer (haut-droite)').toBe('2026-10-28');

  // — Encoche d'avancement : moitié haute gauche, glisser jusqu'au milieu —
  bar = await app.bar('Tâche E2E');
  await bar.hover({ position: { x: 3, y: 2 } });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + 1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 1, { steps: 6 });
  await page.mouse.up();
  const prog = (await app.task('Tâche E2E'))?.progress as number;
  expect.soft(prog, 'avancement réglé par l’encoche').toBeGreaterThan(0.3);
  expect.soft(prog).toBeLessThan(0.7);
  expect.soft((await app.blocks('Tâche E2E'))?.[0]?.from, 'l’encoche ne déplace pas la barre').toBe('2026-10-28');

  // — Ctrl + glisser depuis le bord bas-droit : force le déplacement (pas de redimensionnement) —
  const before = (await app.blocks('Tâche E2E'))![0]!;
  bar = await app.bar('Tâche E2E');
  await app.drag(bar, 7 * DAY, 0, { fx: 1, ox: -3, fy: 0.8, keys: ['Control'] });
  b = await app.blocks('Tâche E2E');
  expect.soft(b?.[0]?.from, 'Ctrl+glisser déplace').toBe('2026-11-04');
  expect.soft(b?.[0]?.to).not.toBe(before.to);

  await app.shot('tache placee etiree deplacee');

  // — Clic droit sur le bloc : couper ici → 2 blocs ; fusionner → 1 bloc —
  bar = await app.bar('Tâche E2E');
  await app.contextMenu(bar, /Couper ici/, { fx: 0.5 });
  expect.soft((await app.blocks('Tâche E2E'))?.length, 'couper ici').toBe(2);
  await app.contextMenu(await app.bar('Tâche E2E', 0), 'Fusionner avec le bloc suivant', { fx: 0.5 });
  expect.soft((await app.blocks('Tâche E2E'))?.length, 'fusionner').toBe(1);

  // — Clic droit sur la ligne (hors barre) : ajouter un bloc ici —
  const origFrom = (await app.blocks('Tâche E2E'))![0]!.from;
  const rbox = (await (await app.bar('Tâche E2E')).boundingBox())!;
  // 7 jours avant le bloc = un mercredi (jour ouvré)
  await page.mouse.click(rbox.x - 7 * DAY + 3, rbox.y + rbox.height / 2, { button: 'right' });
  await page.getByRole('button', { name: 'Ajouter un bloc de travail ici' }).click();
  b = await app.blocks('Tâche E2E');
  expect.soft(b?.length, 'ajouter un bloc').toBe(2);
  expect.soft(b?.find((x) => x.from !== origFrom)?.from, 'bloc ajouté au jour cliqué').toBe('2026-10-28');
  const added = b!.findIndex((x) => x.from !== origFrom);
  await app.contextMenu(await app.bar('Tâche E2E', added), 'Supprimer ce bloc');
  b = await app.blocks('Tâche E2E');
  expect.soft(b?.map((x) => x.from), 'supprimer le bloc ajouté').toEqual([origFrom]);

  // — Ctrl+P : bascule Pilotée ↔ Dates fixées ; forme des coins (rond = effort, carré = dates) —
  await (await app.row('Tâche E2E')).click();
  await page.keyboard.press('Control+p');
  const sched2 = (await app.task('Tâche E2E'))?.scheduling;
  expect.soft(sched2, 'Ctrl+P bascule le mode').not.toBe(sched);
  await expect.soft(await app.bar('Tâche E2E')).toHaveAttribute('rx', sched2 === 'effort' ? '3' : '0');

  // — Pilotée : étirer la fin ajuste le reste à faire —
  const remBefore = (await app.task('Script de reporting'))?.remaining as number;
  await app.drag(await app.bar('Script de reporting'), 2 * DAY, 0, { fx: 1, ox: -3, fy: 0.8 });
  expect.soft((await app.task('Script de reporting'))?.remaining, 'étirer une barre pilotée → reste ↑').toBeGreaterThan(
    remBefore,
  );
  expect.soft((await app.span('Script de reporting'))?.end).toBe('2026-10-30');

  // — Clic droit sur la barre : « Créer une sous-tâche à partir d’ici » (aide : la tâche devient un groupe) —
  await app.contextMenu(await app.bar('Dév. back'), 'Créer une sous-tâche à partir d’ici', { fx: 0.05 });
  await editor.press('Enter').catch(() => {});
  const kids = await app.children('Dév. back');
  expect.soft(kids.length, 'sous-tâche créée sous Dév. back').toBeGreaterThan(0);
  expect.soft((await app.task('Dév. back'))?.type, 'aide : « la tâche devient un groupe »').toBe('group');

  // — Jalon : Ctrl+glisser déplace la date —
  const msBefore = (await app.task('Maquettes validées'))?.date as string;
  const diamond = (await app.ganttRow('Maquettes validées')).locator('path').first();
  await app.drag(diamond, 7 * DAY, 0, { keys: ['Control'] });
  const msAfter = (await app.task('Maquettes validées'))?.date as string;
  expect.soft(msAfter > msBefore, 'Ctrl+glisser un jalon le décale').toBe(true);
  // Sans Ctrl, glisser un jalon ne fait rien
  await app.drag(diamond, 7 * DAY, 0);
  expect.soft((await app.task('Maquettes validées'))?.date).toBe(msAfter);

  // — Statut Annulé : barre hachurée, exclue des calculs (plus de conflit sur la tâche) —
  const statusSelect = (await app.row('Migration CI')).locator('select').last();
  await statusSelect.selectOption('cancelled');
  expect.soft((await app.task('Migration CI'))?.status).toBe('cancelled');
  await expect.soft((await app.ganttRow('Migration CI')).locator('rect[fill="url(#cancelled-hatch)"]').first()).toBeAttached();
  const cancelledConflicts = (await app.conflicts()).filter((c) => c.taskName === 'Migration CI' || c.taskName === 'Prototype mobile (abandonné)');
  expect.soft(cancelledConflicts, 'aucun conflit sur une tâche annulée').toEqual([]);

  await app.shot('apres sous-tache et annulation');
});
