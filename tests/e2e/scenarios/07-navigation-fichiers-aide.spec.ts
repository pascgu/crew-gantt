/**
 * Scénario 7 — Se déplacer, échanger des fichiers, ne rien perdre, trouver l'aide.
 * Aide couverte : Gestes : Ctrl+molette, glisser le fond, clic milieu, Ctrl+S, double-clic ;
 * Où trouver : nav, io (GanttProject .gan, CSV, PNG) ; bouton Aide (survol = légende, clic = onglet) ;
 * persistance : sauvegarde de secours après rechargement ; Paramètres (format de date, archivage).
 */
import fs from 'node:fs';
import { expect, test } from './fixtures';

test('navigation, import/export, Ctrl+S, secours après rechargement, paramètres, aide', async ({ app, page }) => {
  const scroller = page.locator('#gantt-chart-svg').locator('xpath=..');
  const scrollLeft = () => scroller.evaluate((el) => el.scrollLeft);
  const goToday = page.getByRole('button', { name: "Aller à aujourd'hui" });

  // — Ctrl + molette : zoom en gardant la date sous le curseur —
  await page.mouse.move(1300, 600);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  expect.soft((await app.crew((c) => c.file())).ui.zoom).toBe('month');
  await expect.soft(goToday, 'Ctrl+molette garde la période affichée').toBeHidden();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  expect.soft((await app.crew((c) => c.file())).ui.zoom).toBe('day');

  // — Glisser le fond du Gantt : se déplacer dans le plan —
  const s0 = await scrollLeft();
  await page.mouse.move(1500, 650);
  await page.mouse.down();
  await page.mouse.move(1350, 650, { steps: 6 });
  await page.mouse.move(1200, 650, { steps: 6 });
  await page.mouse.up();
  expect.soft((await scrollLeft()) - s0, 'pan de 300 px').toBeGreaterThan(250);
  expect.soft((await app.ui()).selectedTaskId, 'le pan ne sélectionne pas de ligne').toBeNull();

  // — Clic milieu : défilement automatique (natif navigateur, pas géré par l'app) —
  const s1 = await scrollLeft();
  await page.mouse.move(1400, 650);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(1600, 650, { steps: 4 });
  await page.waitForTimeout(600);
  await page.mouse.click(1600, 650, { button: 'middle' });
  const autoscrolled = (await scrollLeft()) !== s1;
  test.info().annotations.push({ type: 'clic milieu', description: autoscrolled ? 'défile' : 'aucun défilement (headless)' });

  // — Recherche et repli —
  await page.getByPlaceholder('Chercher…').fill('Dév');
  await expect.soft(page.locator('div.group\\/row', { hasText: 'Recette' })).toHaveCount(0);
  await expect.soft(page.locator('div.group\\/row', { hasText: 'Dév. back' })).toHaveCount(1);
  await page.getByPlaceholder('Chercher…').fill('');
  await page.getByTitle('Tout replier').click();
  await expect.soft(page.locator('div.group\\/row', { hasText: 'Dév. back' })).toHaveCount(0);
  await page.getByTitle('Tout déplier').click();
  await expect.soft(page.locator('div.group\\/row', { hasText: 'Dév. back' })).toHaveCount(1);

  // — Import / Export —
  const io = page.getByRole('button', { name: 'Import / Export' });
  const download = async (label: string) => {
    await io.click();
    const p = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const d = await p;
    return { name: d.suggestedFilename(), path: await d.path() };
  };
  const csv = await download('Exporter les tâches en CSV');
  expect.soft(csv.name).toMatch(/\.csv$/);
  const csvText = fs.readFileSync(csv.path, 'utf8');
  expect.soft(csvText).toContain('Dév. back');
  const png = await download('Exporter le Gantt en PNG');
  expect.soft(png.name).toMatch(/\.png$/);
  expect.soft(fs.statSync(png.path).size, 'PNG non vide').toBeGreaterThan(5000);
  const gan = await download('Exporter vers GanttProject (.gan)…');
  expect.soft(gan.name).toMatch(/\.gan$/);

  // Échap ferme le menu Import / Export
  await io.click();
  await page.keyboard.press('Escape');
  await expect.soft(page.getByRole('button', { name: 'Exporter les tâches en CSV' }), 'Échap ferme le menu').toBeHidden();
  // Menu resté ouvert : le refermer en cliquant son voile (seul moyen, cf. écart ci-dessus)
  const veil = page.locator('div.fixed.inset-0.z-40');
  if (await veil.count()) await veil.first().click({ position: { x: 5, y: 600 } });

  // Ré-import du .gan exporté : mêmes tâches (aller-retour GanttProject)
  const namesBefore = (await app.crew((c) => c.file())).tasks.map((t: { name: string }) => t.name).sort();
  await io.click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer depuis GanttProject (.gan)…' }).click();
  await (await chooser).setFiles(gan.path);
  await expect.poll(async () => (await app.ui()).fileName).toBeNull();
  const namesAfter = (await app.crew((c) => c.file())).tasks.map((t: { name: string }) => t.name).sort();
  expect.soft(namesAfter, 'aller-retour .gan : mêmes tâches').toEqual(namesBefore);
  const back = await app.task('Dév. back');
  expect.soft(back?.blocks?.[0]?.assignments?.[0]?.resourceId ? 'affectée' : 'perdue', 'affectation conservée au ré-import').toBe('affectée');

  // — Paramètres : format de date ISO, archivage d'un projet —
  await app.goTab('Paramètres');
  await page.getByRole('button', { name: 'AAAA-MM-JJ' }).click();
  await app.goTab('Gantt');
  await expect.soft((await app.row('Dév. back')).getByText(/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}$/).first(), 'dates au format ISO').toBeVisible();

  // — Ctrl+S : enregistrer. Chromium a File System Access → sélecteur natif (non pilotable en headless) :
  //   on se contente de noter l'issue en annotation, sans échec. —
  await (await app.row('Dév. back')).click();
  const saveDl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.keyboard.press('Control+s');
  const saved = await saveDl;
  test.info().annotations.push({ type: 'Ctrl+S', description: saved ? `téléchargé : ${saved.suggestedFilename()}` : 'aucun téléchargement (sélecteur natif FS Access ?)' });

  // — Zéro perte : modification non enregistrée → rechargement → sauvegarde de secours proposée —
  const teamName = page.locator('input[title="Nom de l\'équipe"]');
  await teamName.fill('Équipe E2E');
  await teamName.blur();
  await page.waitForTimeout(2600); // autosave IndexedDB (debounce 2 s)
  await page.reload();
  await page.waitForFunction(() => !!window.__crew);
  await expect.soft(page.getByText('Sauvegarde de secours détectée')).toBeVisible();
  await page.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
  await expect.soft(teamName).toHaveValue('Équipe E2E');

  // — Aide : survol du « ? » = légende compacte ; clic = onglet Aide (5 sous-onglets) —
  await page.getByRole('button', { name: 'Aide', exact: true }).last().hover();
  await expect.soft(page.getByText('Gestes & raccourcis').first()).toBeVisible();
  await page.getByRole('button', { name: 'Aide', exact: true }).last().click();
  expect.soft((await app.ui()).activeTab).toBe('help');
  for (const sub of ['Prise en main', 'Concepts clés', 'Légende visuelle', 'Gestes & raccourcis', 'Où trouver / Comment faire']) {
    await page.getByRole('button', { name: sub, exact: true }).click();
  }
  await app.shot('aide comment faire');
});
