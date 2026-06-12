import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('CrewGantt').first()).toBeVisible();
});

test('la démo se charge et les cinq onglets répondent', async ({ page }) => {
  // équipe de démonstration à l'accueil — jamais d'écran vide
  await expect(page.locator('input[title="Nom de l\'équipe"]')).toHaveValue('Équipe Web (démo)');
  // le Gantt affiche des barres SVG
  await expect(page.locator('#gantt-chart-svg rect').first()).toBeVisible();

  for (const tab of ['Réunion', 'Tableau de bord', 'Équipe', 'Paramètres', 'Gantt']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
  }
  await expect(page.locator('#gantt-chart-svg')).toBeVisible();
});

test('créer une tâche, la renommer dans le panneau, la voir dans le tableau', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajouter une tâche' }).click();
  // le panneau latéral s'ouvre sur la nouvelle tâche
  const panel = page.locator('aside');
  await expect(panel).toBeVisible();
  await panel.getByText('Nouvelle tâche').first().click();
  await panel.locator('input').first().fill('Tâche E2E');
  await panel.locator('input').first().press('Enter');
  // visible dans le tableau de gauche
  await expect(page.getByText('Tâche E2E').first()).toBeVisible();
});

test('annuler / rétablir au clavier', async ({ page }) => {
  const name = page.locator('input[title="Nom de l\'équipe"]');
  await name.fill('Équipe Modifiée');
  await name.blur();
  await page.keyboard.press('Control+z');
  await expect(name).toHaveValue('Équipe Web (démo)');
  await page.keyboard.press('Control+y');
  await expect(name).toHaveValue('Équipe Modifiée');
});

test('réunion : mise à jour du reste, clôture, journal', async ({ page }) => {
  await page.getByRole('button', { name: 'Réunion', exact: true }).click();
  await expect(page.getByText('Réunion d’équipe')).toBeVisible();

  // « Dév. back » (Chloé) : reste 12 → 10, édition inline
  const line = page.locator('div.group\\/line', { hasText: 'Dév. back' });
  await line.getByText('12', { exact: true }).click();
  const input = line.locator('input');
  await input.fill('10');
  await input.press('Enter');

  // clôture avec note libre
  page.once('dialog', (dialog) => void dialog.accept('Réunion E2E'));
  await page.getByRole('button', { name: 'Clore la réunion' }).click();
  await expect(page.getByText(/Journal mis à jour/)).toBeVisible();
  await expect(page.getByText('Dév. back : reste 10 j-h (était 12)')).toBeVisible();
  await expect(page.getByText('Réunion E2E')).toBeVisible();
});

test('réaffectation rapide : l’historique reste, la nouvelle équipe prend', async ({ page }) => {
  await page.getByRole('button', { name: 'Réunion', exact: true }).click();
  const line = page.locator('div.group\\/line', { hasText: 'Dév. back' });
  await line.hover();
  await line.getByRole('button', { name: 'Réaffecter' }).click();
  await page.getByRole('button', { name: '→ Bob (100 %)' }).click();

  // côté Gantt : la tâche porte désormais Bob (initiales « B » dans Affectés)
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  const row = page.locator('div.group\\/row', { hasText: 'Dév. back' });
  await expect(row.getByText('B', { exact: true })).toBeVisible();
});

test('export CSV des tâches', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('taches.csv');
});

test('paramètres : créer un projet et le voir dans le filtre', async ({ page }) => {
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Projet 3' })).toBeVisible();
});
