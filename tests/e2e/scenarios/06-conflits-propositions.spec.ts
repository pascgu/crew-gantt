/**
 * Scénario 6 — Conflits, plan proposé, baseline et dérive.
 * Aide couverte : Prise en main §5 (figer une référence) et §8 (conflits & propositions) ;
 * Concepts « L'outil propose, l'humain dispose » ; Légende marqueurs (bordure, fantôme,
 * personnage, éclair) ; Où trouver : conflict, baseline ; Tableau de bord (dérive des jalons).
 */
import { expect, test } from './fixtures';

test('conflits & propositions : panneau, ignorer, marqueurs, appliquer, annuler, baseline et dérive', async ({
  app,
  page,
}) => {
  const panelTitle = page.locator('h3', { hasText: /^Conflits/ });
  const nActive = (await app.conflicts()).length;
  await expect.soft(page.getByTitle('Conflits')).toHaveText(String(nActive));

  // — Bouton ⚠ du bandeau → panneau Conflits (un fait par ligne) —
  await page.getByTitle('Conflits').click();
  await expect.soft(panelTitle).toContainText(`(${nActive})`);
  // Ignorer un conflit → il passe dans « Conflits ignorés », réactivable
  const firstIgnore = page.getByRole('button', { name: 'Ignorer', exact: true }).first();
  await firstIgnore.click();
  expect.soft((await app.conflicts()).length).toBe(nActive - 1);
  await expect.soft(page.getByText(/Conflits ignorés \(1\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Réactiver' }).click();
  expect.soft((await app.conflicts()).length).toBe(nActive);
  await page.getByTitle('Conflits').click(); // referme

  // — Badge rouge de la ligne → panneau filtré sur la tâche —
  await (await app.row('Recette')).locator('button.bg-danger').click();
  await expect.soft(panelTitle).toBeVisible();
  await expect.soft(page.locator('select').filter({ has: page.locator('option', { hasText: 'Toutes les tâches' }) })).toHaveValue('t-recette');

  // — Marqueur « personnage rouge » (non affectée) sur le Gantt → panneau sur la tâche —
  await page.getByTitle('Conflits').click();
  const unassignedMarker = page.locator('#gantt-chart-svg g').filter({ has: page.locator('> title', { hasText: 'Tâche sans affectation' }) }).first();
  await unassignedMarker.click({ force: true });
  await expect.soft(panelTitle).toBeVisible();
  expect.soft((await app.ui()).selectedTaskId).toBe('t-api');
  await page.getByTitle('Conflits').click();

  // — Proposition dessinée par-dessus le plan : bande pointillée ; au survol « +X j » et bouton ✓ —
  const bands = page.locator('#gantt-chart-svg rect[stroke-dasharray="3 2"][stroke="var(--color-accent)"]');
  const nBands = await bands.count();
  expect.soft(nBands, 'bandes pointillées de proposition').toBeGreaterThan(0);
  await app.shot('conflits et proposition sur le gantt');

  // Conflits ↔ propositions : chaque tâche proposée doit avoir un conflit (ou une cascade)
  await page.getByRole('button', { name: 'Plan proposé' }).click();
  // Une carte = le premier ancêtre du bouton « Appliquer » qui contient la « raison : »
  const cardTexts = await page.getByRole('button', { name: 'Appliquer', exact: true }).evaluateAll((btns) =>
    btns.map((b) => {
      let el: HTMLElement | null = b.parentElement;
      while (el && !el.innerText.includes('raison :')) el = el.parentElement;
      return el?.innerText ?? '';
    }),
  );
  const conflictTasks = new Set((await app.conflicts()).map((c) => c.taskName));
  const reasonsWithoutConflict = cardTexts
    .filter((txt) => !/cascade/.test(txt) && !conflictTasks.has(txt.split('\n')[0]!.trim()))
    .map((txt) => txt.replace(/\s+/g, ' '));
  expect.soft(reasonsWithoutConflict, 'propositions dont la raison ne correspond à aucun conflit actif').toEqual([]);
  await page.getByRole('button', { name: 'Plan proposé' }).click();

  // A4 : le « +X j » d'une proposition qui décale est visible sans survol
  await expect.soft(page.locator('#gantt-chart-svg text', { hasText: /^[+-]\d+ j$/ }).first(), '« +X j » visible sans survol').toBeVisible();
  // R3 : plus de proposition « gratuite » sur une tâche saine (Migration CI : mercredis d'Alice)
  expect.soft(cardTexts.some((txt) => txt.startsWith('Migration CI')), 'aucune proposition sur Migration CI').toBe(false);

  // Bouton ✓ au survol d'une bande : il reste dans la vue même si la bande déborde à droite (A4).
  const scroller = page.locator('#gantt-chart-svg').locator('xpath=..');
  const viewBox = (await scroller.evaluate((el) => el.getBoundingClientRect().toJSON())) as DOMRect;
  // amener le début de la première bande dans la vue
  const first = (await bands.first().boundingBox())!;
  await scroller.evaluate((el, dx) => { el.scrollLeft += dx; }, first.x - viewBox.left - 80);
  const band = (await bands.first().boundingBox())!;
  await page.mouse.move(band.x + 40, band.y + band.height / 2); // loin du trait de lien entrant
  const check = page.locator('#gantt-chart-svg g[data-proposal-apply] > circle').first();
  await expect.soft(check, 'bouton ✓ au survol de la bande').toBeVisible();
  if (await check.isVisible()) {
    const cb = (await check.boundingBox())!;
    const view = (await page.locator('#gantt-chart-svg').evaluate((svg) => (svg.parentElement as HTMLElement).getBoundingClientRect().toJSON())) as DOMRect;
    expect.soft(cb.x + cb.width <= view.right, '✓ dans la zone visible').toBe(true);
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    expect.soft(await bands.count(), '✓ applique la proposition (moins de bandes)').toBeLessThan(nBands);
  }

  // — Figer une référence (⚙ → Baseline → « + Figer le plan actuel… ») —
  await page.getByRole('button', { name: 'Contrôles Gantt' }).click();
  app.answerNextDialogs('Ref E2E');
  await page.getByTitle('Baseline active').selectOption('__new__');
  const bls = (await app.crew((c) => c.file())).baselines as { name: string; active: boolean }[];
  expect.soft(bls.map((b) => [b.name, b.active])).toEqual([
    ['Plan initial', false],
    ['Ref E2E', true],
  ]);
  await page.mouse.click(1400, 700);

  // — Plan proposé : appliquer une tâche, puis tout appliquer —
  const livraison0 = (await app.task('Livraison V1'))?.date as string;
  await page.getByRole('button', { name: 'Plan proposé' }).click();
  await expect.soft(page.getByText('Impacts du plan proposé')).toBeVisible();
  const nCards = await page.getByRole('button', { name: 'Appliquer', exact: true }).count();
  await page.getByRole('button', { name: 'Appliquer', exact: true }).first().click();
  expect.soft(await page.getByRole('button', { name: 'Appliquer', exact: true }).count(), 'une carte de moins').toBeLessThan(nCards);
  const nAfterOne = (await app.conflicts()).length;
  await page.getByRole('button', { name: 'Tout appliquer' }).click();
  const after = await app.conflicts();
  expect.soft(after.length, 'tout appliquer → moins de conflits').toBeLessThan(nAfterOne);
  // « Chaque application recalcule et propose à nouveau jusqu'à stabilité »
  const stillProposed = await page.getByRole('button', { name: 'Plan proposé' }).isVisible();
  if (stillProposed) {
    await page.getByRole('button', { name: 'Plan proposé' }).click();
    await page.getByRole('button', { name: 'Tout appliquer' }).click().catch(() => {});
  }
  const livraison1 = (await app.task('Livraison V1'))?.date as string;
  expect.soft(livraison1 > livraison0, 'le jalon Livraison V1 a été repoussé').toBe(true);

  // — Tableau de bord : dérive des jalons par rapport à la baseline figée —
  await app.goTab('Tableau de bord');
  const livraisonRow = page.locator('div, tr').filter({ hasText: /^Livraison V1/ }).last();
  await expect.soft(livraisonRow).toContainText(/\+\d+ j/);
  await app.shot('tableau de bord derive');

  // — Ctrl+Z : l'application de « Tout appliquer » s'annule —
  await app.goTab('Gantt');
  await page.keyboard.press('Control+z');
  if (stillProposed) await page.keyboard.press('Control+z');
  expect.soft((await app.conflicts()).length, 'Ctrl+Z après « Tout appliquer »').toBe(nAfterOne);

  // — Supprimer la baseline affichée (⚙ → …) —
  await page.getByRole('button', { name: 'Contrôles Gantt' }).click();
  await page.getByRole('button', { name: "Plus d'actions" }).click();
  await page.getByRole('button', { name: 'Supprimer la baseline affichée' }).click();
  expect.soft(((await app.crew((c) => c.file())).baselines as { name: string }[]).map((b) => b.name)).toEqual(['Plan initial']);
});
