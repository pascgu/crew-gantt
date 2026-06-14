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

test('créer une tâche via le menu de ligne, la renommer inline', async ({ page }) => {
  // menu « ⋯ » de la première ligne → insérer une tâche après
  const firstRow = page.locator('div.group\\/row').first();
  await firstRow.hover();
  await firstRow.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('button', { name: 'Insérer une tâche après' }).click();
  // renommage inline dans le tableau
  const newName = page.getByText('Nouvelle tâche').first();
  await expect(newName).toBeVisible();
  await newName.click();
  const input = page.locator('div.group\\/row input:focus');
  await input.fill('Tâche E2E');
  await input.press('Enter');
  await expect(page.getByText('Tâche E2E').first()).toBeVisible();
});

test('boutons « + » par niveau : ajouter une sous-tâche à la ligne sélectionnée', async ({
  page,
}) => {
  const firstRow = page.locator('div.group\\/row').first();
  await firstRow.click();
  await page.getByRole('button', { name: 'Ajouter une sous-tâche' }).first().click();
  await expect(page.getByText('Nouvelle tâche').first()).toBeVisible();
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
  await expect(page.getByText("Réunion d’équipe")).toBeVisible();

  // « Dév. back » (Chloé) : reste 12 → 10, édition inline
  const line = page.locator('div.group\\/line', { hasText: 'Dév. back' });
  await line.getByText('12', { exact: true }).click();
  const input = line.locator('input');
  await input.fill('10');
  await input.press('Enter');

  // saisir une note dans la zone permanente, puis clore (confirm natif)
  await page.locator('textarea').first().fill('Réunion E2E');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Clore la réunion' }).click();
  await expect(page.getByText(/Journal mis à jour/)).toBeVisible();
  await expect(page.getByText('Dév. back : reste 10 j-h (était 12)')).toBeVisible();
  await expect(page.getByText('Réunion E2E')).toBeVisible();
});

test('réunion : double-clic sur une ligne ouvre le panneau de tâche', async ({ page }) => {
  await page.getByRole('button', { name: 'Réunion', exact: true }).click();
  const line = page.locator('div.group\\/line', { hasText: 'Dév. back' });
  await line.dblclick();
  // le panneau de droite s'ouvre avec le nom de la tâche
  await expect(page.getByText('Dév. back').nth(1)).toBeVisible();
});

test('export CSV des tâches via le menu « … » du Gantt', async ({ page }) => {
  // Les contrôles sont repliés par défaut — ouvrir le panneau ⚙ d'abord
  await page.getByRole('button', { name: 'Contrôles Gantt' }).click();
  await page.getByRole('button', { name: "Plus d'actions" }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter les tâches en CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('taches.csv');
});

test('paramètres : créer un projet et le voir dans le sélecteur Gantt', async ({ page }) => {
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  // Le nouveau projet doit apparaître dans les sélecteurs de projet des lignes de tâches
  await expect(page.locator('option', { hasText: 'Projet 3' }).first()).toBeAttached();
});

test('alignement géométrique table/Gantt : chaque ligne fait exactement 21px', async ({ page }) => {
  // Déplier tout pour avoir plusieurs lignes visibles
  await page.getByTitle('Tout déplier').click();
  await page.waitForTimeout(100);

  const rows = page.locator('div.group\\/row');
  const count = await rows.count();
  expect(count).toBeGreaterThan(4);

  const svgBox = await page.locator('#gantt-chart-svg').boundingBox();
  expect(svgBox).not.toBeNull();

  // Vérifier les lignes 0, 1, 2 et la dernière
  for (const i of [0, 1, 2, count - 1]) {
    const box = await rows.nth(i).boundingBox();
    expect(box).not.toBeNull();
    // Chaque ligne doit mesurer exactement 21px de haut
    expect(Math.round(box!.height)).toBe(21);
  }

  // Le top de la ligne 0 doit être aligné avec le top du SVG Gantt
  const row0 = await rows.nth(0).boundingBox();
  expect(Math.round(row0!.y)).toBe(Math.round(svgBox!.y));

  // Les lignes ne doivent pas dériver : ligne N démarre à N × 21px après la ligne 0
  for (const i of [1, 2, 3]) {
    const box = await rows.nth(i).boundingBox();
    expect(Math.round(box!.y - row0!.y)).toBe(i * 21);
  }
});
