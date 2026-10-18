/**
 * Scénario 8 — Reproduction des tickets de Pascal (plans/20261018-plan-v1-3.md, section « Tickets »).
 * Un test par ticket testable ; chacun échoue (expect.soft) tant que le ticket n'est pas traité.
 * Les tickets purement « nouvelle fonction » sans comportement existant à vérifier (T2, T3, T6, T10,
 * T12) ne sont pas testés ici.
 */
import { expect, test, TODAY, type App } from './fixtures';

async function freezeBaseline(app: App, name: string) {
  await app.page.getByRole('button', { name: 'Contrôles Gantt' }).click();
  app.answerNextDialogs(name);
  await app.page.getByTitle('Baseline active').selectOption('__new__');
  await app.page.mouse.click(1400, 700);
}

test('T1 — Ctrl+glisser un jalon quand une baseline active a la même date', async ({ app, page }) => {
  await freezeBaseline(app, 'Ref T1'); // baseline = plan actuel → losange fantôme pile sur le jalon
  const before = (await app.task('Maquettes validées'))?.date as string;
  const diamond = (await app.ganttRow('Maquettes validées')).locator('path').first();
  const box = (await diamond.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('g[data-task-id]')?.getAttribute('data-task-id') ?? 'autre',
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect.soft(hit, 'le centre du jalon appartient au jalon (pas au fantôme de baseline)').toBe('m-maq');
  await app.drag(diamond, 7 * 14, 0, { keys: ['Control'] });
  expect.soft((await app.task('Maquettes validées'))?.date, 'Ctrl+glisser au centre déplace le jalon').not.toBe(before);
});

test('T3 (piste) — archiver un projet doit permettre de cacher ses tâches', async ({ app, page }) => {
  await app.goTab('Paramètres');
  const card = page.locator('div.rounded-lg', { has: page.locator('input[value="Outils internes"]') }).first();
  const archive = card.getByRole('button', { name: 'Archiver' });
  if (await archive.count()) await archive.click();
  else await page.getByRole('button', { name: 'Archiver' }).last().click();
  expect.soft(((await app.crew((c) => c.file())).projects as { id: string; archived: boolean }[]).find((p) => p.id === 'p-interne')?.archived).toBe(true);
  await app.goTab('Gantt');
  const shown = await page.locator('div.group\\/row', { hasText: 'Migration CI' }).count();
  const filterable = await page.getByRole('button', { name: 'Outils internes' }).count();
  expect.soft(shown === 0 || filterable > 0, 'tâches d’un projet archivé : ni masquées, ni filtrables').toBe(true);
});

test('T4 — glisser-déposer une ligne de la liste pour la réordonner', async ({ app, page }) => {
  const before = await app.children(null);
  const src = (await app.row('Livraison V1')).locator('div[draggable="true"]');
  const dst = await app.row('Recette');
  await src.dragTo(dst, { targetPosition: { x: 60, y: 3 } }); // moitié haute → « avant »
  const after = await app.children(null);
  expect.soft(after.indexOf('Livraison V1'), 'Livraison V1 passe avant Recette').toBe(after.indexOf('Recette') - 1);
  expect.soft(after, 'l’ordre a changé').not.toEqual(before);
  void page;
});

test('T5 — le trait « aujourd’hui » ne doit pas capter le pointeur au-dessus des barres', async ({ app, page }) => {
  const todayZone = page.locator('#gantt-chart-svg rect').filter({ has: page.locator('> title', { hasText: /^Aujourd/ }) });
  const tz = (await todayZone.boundingBox())!;
  const x = tz.x + tz.width / 2;
  // « Dév. back » enjambe aujourd'hui : au droit du trait, le pointeur doit atteindre la barre
  const bar = (await (await app.bar('Dév. back')).boundingBox())!;
  const hit = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px!, py!);
      return el?.querySelector(':scope > title')?.textContent ?? el?.getAttribute('data-block-id') ?? el?.tagName ?? 'rien';
    },
    [x, bar.y + bar.height / 2],
  );
  expect.soft(hit, 'élément sous le trait aujourd’hui, sur la barre').not.toMatch(/^Aujourd/);
});

test('T7 — deux tâches à 0 j le même jour, liées : pas de lien violé', async ({ app }) => {
  const file = await app.crew((c) => c.file());
  const base = file.tasks.find((t: { id: string }) => t.id === 't-doc');
  const zero = (id: string, name: string, order: number, links: unknown[]) => ({
    ...base,
    id,
    name,
    order,
    estimate: null,
    effort: 0,
    remaining: 0,
    links,
    blocks: [{ id: `b-${id}`, from: TODAY, to: null, assignments: [{ resourceId: 'r-chloe', units: 100 }] }],
  });
  file.tasks.push(zero('t-z1', 'Zéro A', 10, []), zero('t-z2', 'Zéro B', 11, [{ on: 't-z1', type: 'after-end', lag: 0 }]));
  await app.crew((c, f) => c.load(f), file);
  expect.soft((await app.span('Zéro B'))?.start).toBe(TODAY);
  const violated = (await app.conflicts()).filter((c) => c.taskName === 'Zéro B' && c.type === 'link-violated');
  expect.soft(violated, 'une tâche à 0 j n’empêche pas la suivante le même jour').toEqual([]);
});

test('T8 — affecter plusieurs lignes sélectionnées en une fois', async ({ app, page }) => {
  await (await app.row('Dév. front')).click();
  await (await app.row('Dév. back')).click({ modifiers: ['Control'] });
  await (await app.row('Dév. back')).getByTitle('Modifier l’affectation').click();
  await page.getByTitle('Ajouter Alice').click();
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  const has = async (n: string) => ((await app.blocks(n)) ?? []).at(-1)?.assignments.some((a) => a.resourceId === 'r-alice');
  expect.soft(await has('Dév. back')).toBe(true);
  expect.soft(await has('Dév. front'), 'la 2ᵉ ligne sélectionnée est aussi affectée').toBe(true);
  // Décision T8 : « Remplacer l'équipe » → les deux tâches ont exactement la même équipe
  const team = async (n: string) => ((await app.blocks(n)) ?? []).at(-1)?.assignments;
  expect.soft(await team('Dév. front'), 'même équipe sur toute la sélection (remplacement)').toEqual(await team('Dév. back'));
});

test('T9 — affecter une tâche avant de l’avoir placée sur le Gantt', async ({ app, page }) => {
  await (await app.row('Recette')).click();
  await page.keyboard.press('Insert');
  await page.locator('div.group\\/row input:focus').fill('Non placée');
  await page.keyboard.press('Enter');
  await expect.soft((await app.row('Non placée')).getByTitle('Modifier l’affectation'), 'cellule Affectés active sans bloc').toBeVisible();
});

test('T11 — la clôture de réunion reprend tout depuis la dernière réunion', async ({ app, page }) => {
  // Changement fait dans le Gantt AVANT d'ouvrir l'onglet Réunion (cas d'une semaine normale)
  await (await app.row('Script de reporting')).locator('select').last().selectOption('done');
  await app.goTab('Réunion');
  // Pendant la réunion, Chloé devrait voir aussi ce qu'elle a terminé depuis la dernière réunion
  await expect.soft(page.locator('div.group\\/line', { hasText: 'Script de reporting' }), 'tâches terminées depuis la dernière réunion').toHaveCount(1);
  app.answerNextDialogs(true);
  await page.getByRole('button', { name: 'Clore la réunion' }).click();
  const journal = (await app.crew((c) => c.file())).journal as { summary: string[] }[];
  expect.soft(journal.at(-1)!.summary.join('\n'), 'journal : tâche terminée avant l’ouverture de l’onglet').toContain('Script de reporting');
});
