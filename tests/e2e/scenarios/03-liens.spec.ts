/**
 * Scénario 3 — Lier les tâches.
 * Aide couverte : Prise en main §3 ; Concepts « les liens sont au plus tôt » (code FD, P…D) ;
 * Gestes : poignée ronde, Shift au départ, Shift au relâcher, lien qui boucle → scinder ;
 * Légende : flèche = lien, trait rouge = lien violé ; Où trouver : link.
 */
import { expect, test } from './fixtures';

test('liens : poignée, Shift départ/arrivée, infobulle code, violation, cycle → scission, panneau', async ({
  app,
  page,
}) => {
  // Zoom Mois pour avoir toutes les barres à l'écran (teste aussi le sélecteur d'échelle ⚙)
  await page.getByRole('button', { name: 'Contrôles Gantt' }).click();
  await page.getByTitle('Échelle de temps').selectOption('month');
  expect.soft((await app.crew((c) => c.file())).ui.zoom).toBe('month');
  await page.mouse.click(1400, 700); // referme le popover
  // Le changement d'échelle doit garder la période affichée (aujourd'hui reste visible)
  await expect
    .soft(page.getByRole('button', { name: "Aller à aujourd'hui" }), 'changer d’échelle fait perdre la position (vue vide)')
    .toBeHidden();
  const goToday = page.getByRole('button', { name: "Aller à aujourd'hui" });
  if (await goToday.isVisible()) await goToday.click();

  const handle = async (name: string) => (await app.ganttRow(name)).locator('circle[data-link-handle]');
  const linksOf = async (name: string) => ((await app.task(name))?.links ?? []) as { on: string; type: string; progressDays?: number; targetDays?: number }[];

  // — Poignée ronde → relâcher sur la tâche qui doit attendre : lien « après la fin » —
  await (await app.bar('Script de reporting')).hover({ force: true });
  await app.dragTo(await handle('Script de reporting'), await app.bar('Documentation interne'));
  let links = await linksOf('Documentation interne');
  expect.soft(links.map((l) => [l.on, l.type])).toEqual([['t-report', 'after-end']]);
  // Un lien est une borne au plus tôt : il ne déplace rien tout seul
  expect.soft((await app.blocks('Documentation interne'))?.[0]?.from).toBe('2026-11-16');

  // Infobulle du lien : code compact « FD »
  const linkKey = `t-doc-0`;
  await app.hoverLink(linkKey);
  await expect.soft(page.locator('#gantt-chart-svg text', { hasText: /^FD « Outillage interne \/ Script de reporting »/ })).toBeVisible();

  // — Shift au départ (depuis le corps de la barre) : « après N jours de travail » —
  await (await app.bar('Maquettes')).hover({ force: true });
  await app.dragTo(await app.bar('Maquettes', 1), await app.bar('Recette'), { fx: 0.3, keys: ['Shift'] });
  links = await linksOf('Recette');
  const ap = links.find((l) => l.on === 't-maq');
  expect.soft(ap?.type, 'Shift au départ → après N jours').toBe('after-progress');
  expect.soft(ap?.progressDays ?? 0).toBeGreaterThan(0);

  // — Shift au relâcher : ancre « à N jours » sur le successeur —
  await (await app.bar('Spécifications')).hover({ force: true });
  await app.dragTo(await handle('Spécifications'), await app.bar('Migration CI'), { tx: 0.5, dropKeys: ['Shift'] });
  const td = (await linksOf('Migration CI')).find((l) => l.on === 't-spec');
  expect.soft(td?.type).toBe('after-end');
  expect.soft(td?.targetDays ?? 0, 'Shift au relâcher → targetDays').toBeGreaterThan(0);

  // — Lien violé : Migration CI (finit en décembre) → Documentation interne (16/11) —
  await (await app.bar('Migration CI')).hover({ force: true });
  await app.dragTo(await handle('Migration CI'), await app.bar('Documentation interne'));
  const violated = (await app.conflicts()).filter((c) => c.type === 'link-violated' && c.taskName === 'Documentation interne');
  expect.soft(violated.length, 'lien violé détecté').toBe(1);
  await expect.soft((await app.row('Documentation interne')).locator('button.bg-danger')).toBeVisible();
  await expect.soft(page.locator('path[stroke="var(--color-danger)"]').first()).toBeAttached();
  await app.shot('liens crees et lien viole');

  // — Panneau de détail : liste des prédécesseurs, « au plus tôt », retrait d'un lien —
  await (await app.row('Documentation interne')).dblclick();
  await expect.soft(page.getByText('Liens (prédécesseurs)')).toBeVisible();
  await expect.soft(page.getByText(/Au plus tôt :/)).toBeVisible();
  await page.getByTitle('Retirer ce lien').last().click();
  expect.soft((await linksOf('Documentation interne')).map((l) => l.on)).toEqual(['t-report']);
  expect.soft((await app.conflicts()).some((c) => c.type === 'link-violated' && c.taskName === 'Documentation interne')).toBe(false);
  await page.keyboard.press('Escape');

  // — Lien qui boucle : Recette attend Dév. back ; tirer Recette → Dév. back = cycle —
  app.answerNextDialogs(true); // « Scinder la tâche pour le résoudre ? » → oui
  await (await app.bar('Recette')).hover({ force: true });
  await app.dragTo(await handle('Recette'), await app.bar('Dév. back'));
  const d = app.lastDialog();
  expect.soft(d?.message ?? '', 'proposition de scission sur cycle').toMatch(/cycle/i);
  expect.soft(await app.crew((c) => c.cycle()), 'aucun cycle après scission').toBeNull();
  const backKids = await app.children('Dév. back');
  expect.soft(backKids.length, 'Dév. back scindée (sa fin devient une sous-tâche dépendante)').toBeGreaterThan(0);
  await app.shot('cycle resolu par scission');

  // Refus de la scission : Maquettes attend Spécifications ; tirer Maquettes → Spécifications, refuser
  const nDialogs = app.dialogs.length;
  app.answerNextDialogs(false);
  await (await app.bar('Maquettes', 1)).hover({ force: true });
  await app.dragTo(await handle('Maquettes'), await app.bar('Spécifications'));
  expect.soft(app.dialogs.length, 'un dialogue de cycle').toBeGreaterThan(nDialogs);
  expect.soft(await linksOf('Spécifications'), 'cycle refusé → aucun lien créé').toEqual([]);
  expect.soft(await app.children('Spécifications')).toEqual([]);
});
