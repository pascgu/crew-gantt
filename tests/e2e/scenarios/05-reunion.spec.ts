/**
 * Scénario 5 — Rituel hebdo : la réunion d'équipe, puis le tableau de bord.
 * Aide couverte : Prise en main §6 (restes, absences, réaffecter, trait de revue) ;
 * Où trouver : review (date, « Revenir à aujourd’hui », clôture, journal) ;
 * Légende : trait rouge = date de réunion ; Tableau de bord (burndown, alertes).
 */
import { expect, test } from './fixtures';

test('réunion : date de revue, restes, statuts, note, absence, part projet, clôture, journal, tableau de bord', async ({
  app,
  page,
}) => {
  await app.goTab('Réunion');
  await expect(page.getByText('Réunion d’équipe')).toBeVisible();

  const line = (name: string) => page.locator('div.group\\/line', { hasText: name });

  // — Tâche annulée : ne doit pas apparaître « En retard » —
  await expect.soft(line('Prototype mobile (abandonné)'), 'tâche annulée listée « En retard » en réunion').toHaveCount(0);

  // — Aller-retour de date sans rien saisir : les restes doivent revenir à l'identique —
  const remainings = () =>
    app.crew((c) => Object.fromEntries(c.file().tasks.map((t: { name: string; remaining: number }) => [t.name, t.remaining])));
  const rem0 = await remainings();
  const dateInput = page.locator('header input[type="date"]').first();
  await dateInput.fill('2026-10-30');
  await page.getByRole('button', { name: /aujourd/ }).click();
  expect.soft((await app.ui()).reviewDate).toBeNull();
  expect.soft(await remainings(), 'aller-retour de date de réunion = restes inchangés').toEqual(rem0);
  if (await app.crew((c) => c.canUndo())) {
    // l'aller-retour a laissé des modifications dans l'historique
    expect.soft((await app.ui()).dirty, 'simple consultation d’une date = fichier modifié').toBe(false);
  }

  // — Date de réunion = trait de revue (frontière passé/futur) —
  await dateInput.fill('2026-10-23');
  expect.soft((await app.ui()).reviewDate).toBe('2026-10-23');
  const back = page.getByRole('button', { name: /aujourd/ });
  await expect.soft(back).toBeVisible();
  expect.soft(await back.getAttribute('title'), 'libellé du bouton').toBe('Revenir à aujourd’hui');

  // — Mise à jour du reste (inline) —
  // R1 : le reste est VU à la date de réunion (il baisse du travail prévu d'ici là) sans rien écrire.
  const seen = (n: string) => app.crew((c, name) => c.seen(name)?.remaining as number, n);
  const remBefore = await seen('Dév. back');
  expect.soft(remBefore, 'à une date plus tard, le reste vu baisse (réalisé ↑)').toBeLessThan(12);
  expect.soft((await app.task('Dév. back'))?.remaining, 'le reste stocké, lui, ne bouge pas').toBe(12);
  await line('Dév. back').locator('span.w-\\[58px\\]').click();
  await line('Dév. back').locator('input').fill('10');
  await line('Dév. back').locator('input').press('Enter');
  expect.soft(await seen('Dév. back'), 'saisie à la date de réunion').toBe(10);

  // — Statuts : Terminé / Bloqué —
  await line('Script de reporting').hover();
  await line('Script de reporting').getByTitle('Terminé').click();
  expect.soft((await app.task('Script de reporting'))?.status).toBe('done');
  await line('Maquettes').hover();
  await line('Maquettes').getByTitle('Bloqué').click();
  expect.soft((await app.task('Maquettes'))?.status).toBe('blocked');
  await expect.soft(line('Maquettes').getByText('Bloqué', { exact: true })).toBeVisible();

  // — Note datée sur une tâche (prompt) —
  app.answerNextDialogs('Attente retour client');
  await line('Maquettes').hover();
  await line('Maquettes').getByTitle('Note…').click();
  const notes = (await app.task('Maquettes'))?.notes as { date: string; text: string }[];
  expect.soft(notes.at(-1)?.text).toBe('Attente retour client');
  expect.soft(notes.at(-1)?.date, 'note datée du jour de la réunion ou du jour ?').toBeDefined();

  // — Absence rapide (Bob, 2 jours) et part projet (Chloé) —
  const person = (name: string) => page.locator('section').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).first();
  await person('Bob').getByRole('button', { name: '+ Absence' }).click();
  const absForm = person('Bob').locator('div.bg-warn-wash\\/40');
  await absForm.locator('input[type="date"]').first().fill('2026-10-26');
  await absForm.locator('input[type="date"]').last().fill('2026-10-27');
  await absForm.getByRole('button', { name: 'Appliquer' }).click();
  const bobEx = (await app.crew((c) => c.file())).resources.find((r: { id: string }) => r.id === 'r-bob').exceptions;
  expect.soft(bobEx).toEqual([expect.objectContaining({ from: '2026-10-26', to: '2026-10-27', percent: 0 })]);

  await person('Chloé').getByRole('button', { name: '± Part projet' }).click();
  const shareForm = person('Chloé').locator('div.bg-accent-wash\\/40');
  await shareForm.locator('input[type="number"]').fill('60');
  await shareForm.getByRole('button', { name: 'Appliquer' }).click();
  const chloeShares = (await app.crew((c) => c.file())).resources.find((r: { id: string }) => r.id === 'r-chloe').projectShares;
  expect.soft(chloeShares.some((s: { projectId: string; percent: number }) => s.projectId === 'p-portail' && s.percent === 60)).toBe(true);

  // — « Réaffecter » (cité par l'aide §6 et « Où trouver ») : un bouton par ligne (A2) —
  await line('Dév. back').hover();
  await line('Dév. back').getByRole('button', { name: 'Réaffecter' }).click();
  await expect.soft(page.getByText('Affectation du bloc'), 'Réaffecter ouvre l’affectation').toBeVisible();
  await page.keyboard.press('Escape');
  // Tâches sans personne (« Intégration API partenaires », bloc sans affecté) listées à part (A2)
  await expect.soft(page.locator('section', { hasText: 'Sans personne (à affecter)' }).getByText('Intégration API partenaires')).toBeVisible();

  // — Filtre projet : seules les tâches du projet restent —
  await page.getByRole('button', { name: 'Outils internes' }).first().click();
  await expect.soft(line('Dév. back')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tous les projets' }).click();

  // Le trait de revue est visible sur le Gantt
  await app.goTab('Gantt');
  await expect.soft(page.locator('#gantt-chart-svg').getByText('Date de réunion')).toBeAttached();
  await app.goTab('Réunion');
  await app.shot('reunion avant cloture');

  // — Clôture : confirmation, journal, retour au jour —
  await page.locator('textarea').first().fill('Réunion E2E');
  app.answerNextDialogs(true);
  await page.getByRole('button', { name: 'Clore la réunion' }).click();
  await expect.soft(page.getByText(/Journal mis à jour/)).toBeVisible();
  const journal = (await app.crew((c) => c.file())).journal as { date: string; summary: string[]; note: string }[];
  const entry = journal.at(-1)!;
  expect.soft(entry.date, 'entrée datée de la réunion').toBe('2026-10-23');
  expect.soft(entry.note).toBe('Réunion E2E');
  expect.soft(entry.summary.join('\n')).toContain('Dév. back');
  expect.soft((await app.ui()).reviewDate, 'clôture → retour à aujourd’hui').toBeNull();

  // — Tableau de bord : burndown alimenté, alerte « bloquée » —
  await app.goTab('Tableau de bord');
  await expect.soft(page.getByText(/1 tâche\(s\) bloquée\(s\)/).first()).toBeVisible();
  await app.shot('tableau de bord apres cloture');
});
