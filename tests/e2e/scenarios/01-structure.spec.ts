/**
 * Scénario 1 — Construire la structure du plan.
 * Aide couverte : Prise en main §1 (Démarrer) et §7 (Grouper) ; Gestes : Inser, ↑/↓, Entrée,
 * Suppr, ALT+flèches, Ctrl+Z/Ctrl+Y, clic droit sur une sélection ; Où trouver : addTask, group.
 */
import { expect, test } from './fixtures';

test('structure : projets, boutons +, clavier, groupe englobant, suppression et annulation', async ({
  app,
  page,
}) => {
  const editor = page.locator('div.group\\/row input:focus');

  // — §1 Démarrer : créer un projet dans Paramètres —
  const before = (await app.crew((c) => c.file())).projects.length;
  await app.goTab('Paramètres');
  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  expect.soft((await app.crew((c) => c.file())).projects.length).toBe(before + 1);
  await app.goTab('Gantt');

  // — Boutons ronds « + » : un par niveau, sous la ligne survolée —
  const spec = await app.row('Spécifications');
  await spec.click();
  await spec.hover();
  await spec.getByRole('button', { name: 'Ajouter une tâche au niveau 2' }).click();
  await expect(editor).toBeVisible(); // la nouvelle tâche s'ouvre directement en renommage
  await editor.fill('Rédaction CDC');
  await editor.press('Enter');
  expect.soft(await app.children('Conception')).toEqual([
    'Spécifications',
    'Rédaction CDC',
    'Maquettes',
    'Maquettes validées',
  ]);

  // SHIFT sur un « + » = jalon, CTRL = groupe (aide §1)
  const cdc = await app.row('Rédaction CDC');
  await cdc.hover();
  await page.keyboard.down('Shift');
  await cdc.getByRole('button', { name: 'Ajouter un jalon au niveau 2' }).click();
  await page.keyboard.up('Shift');
  await expect(editor).toBeVisible();
  await editor.fill('CDC validé');
  await editor.press('Enter');
  expect.soft((await app.task('CDC validé'))?.type).toBe('milestone');

  await cdc.hover();
  await page.keyboard.down('Control');
  await cdc.getByRole('button', { name: 'Ajouter un groupe au niveau 2' }).click();
  await page.keyboard.up('Control');
  await expect(editor).toBeVisible();
  await editor.fill('Lot E2E');
  await editor.press('Enter');
  expect.soft((await app.task('Lot E2E'))?.type).toBe('group');

  // — Touche Inser : une sœur après la sélection —
  await (await app.row('Recette')).click();
  await page.keyboard.press('Insert');
  await expect(editor).toBeVisible();
  await editor.fill('Inser E2E');
  await editor.press('Enter');
  const roots = await app.children(null);
  expect.soft(roots.indexOf('Inser E2E')).toBe(roots.indexOf('Recette') + 1);

  await app.shot('structure apres creations');

  // — ↑/↓ change de tâche, Entrée ouvre le détail, Échap le ferme —
  await (await app.row('Recette')).click();
  await page.keyboard.press('ArrowDown');
  expect.soft((await app.ui()).selectedTaskId).toBe(await app.taskId('Inser E2E'));
  await page.keyboard.press('ArrowUp');
  expect.soft((await app.ui()).selectedTaskId).toBe(await app.taskId('Recette'));
  await page.keyboard.press('Enter');
  const panelDelete = page.getByRole('button', { name: 'Supprimer la tâche' });
  await expect.soft(panelDelete).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.soft(panelDelete).toBeHidden();

  // — ALT + ↑/↓ déplace la tâche, ALT + ←/→ change de niveau (texte de l'aide) —
  await (await app.row('Inser E2E')).click();
  await page.keyboard.press('Alt+ArrowUp');
  let r = await app.children(null);
  expect.soft(r.indexOf('Inser E2E'), 'ALT+↑ (documenté dans l’aide) doit remonter la tâche').toBe(
    r.indexOf('Recette') - 1,
  );
  // Comportement effectif du code : Ctrl+flèches
  await page.keyboard.press('Control+ArrowUp');
  r = await app.children(null);
  expect.soft(r.indexOf('Inser E2E'), 'Ctrl+↑ remonte la tâche').toBeLessThan(r.indexOf('Recette'));
  // Ctrl+→ : indenter sous la sœur précédente (Développement)
  await page.keyboard.press('Control+ArrowRight');
  expect.soft((await app.task('Inser E2E'))?.parentId).toBe('g-dev');
  await page.keyboard.press('Control+ArrowLeft');
  expect.soft((await app.task('Inser E2E'))?.parentId).toBeNull();

  // — §7 Grouper : clic droit sur une sélection multiple → groupe englobant, puis dégrouper —
  await (await app.row('Dév. front')).click();
  await (await app.row('Dév. back')).click({ modifiers: ['Control'] });
  expect.soft((await app.ui()).selectedTaskIds).toHaveLength(2);
  await (await app.row('Dév. back')).click({ button: 'right' });
  await page.getByRole('button', { name: 'Créer un groupe englobant' }).click();
  await expect(editor).toBeVisible();
  await editor.fill('Lot dev');
  await editor.press('Enter');
  expect.soft(await app.children('Lot dev')).toEqual(['Dév. front', 'Dév. back']);
  expect.soft((await app.task('Lot dev'))?.parentId).toBe('g-dev');
  // Après un Ctrl+clic, Ctrl relâché : le « + » rouge (supprimer sans confirmation) ne doit pas rester
  await page.mouse.move(5, 600);
  await (await app.row('Dév. back')).hover();
  await expect
    .soft(
      (await app.row('Dév. back')).getByRole('button', { name: 'Supprimer', exact: true }),
      '« + » rouge visible sans Ctrl après un Ctrl+clic',
    )
    .toBeHidden();
  await app.shot('groupe englobant');

  await (await app.row('Lot dev')).click({ button: 'right' });
  await page.getByRole('button', { name: 'Dégrouper' }).click();
  expect.soft(await app.task('Lot dev')).toBeNull();
  expect.soft((await app.task('Dév. front'))?.parentId).toBe('g-dev');

  // — Suppr (avec confirmation), Ctrl+Z / Ctrl+Y —
  await (await app.row('Inser E2E')).click();
  app.answerNextDialogs(true);
  await page.keyboard.press('Delete');
  expect.soft(app.lastDialog()?.message).toContain('Inser E2E');
  expect.soft(await app.task('Inser E2E')).toBeNull();
  await page.keyboard.press('Control+z');
  expect.soft(await app.task('Inser E2E')).not.toBeNull();
  await page.keyboard.press('Control+y');
  expect.soft(await app.task('Inser E2E')).toBeNull();

  // — Bouton « + » rouge en mode modificateur : supprime sans confirmation —
  const nDialogs = app.dialogs.length;
  const cdc2 = await app.row('Rédaction CDC');
  await cdc2.hover();
  await page.keyboard.down('Control');
  const redDelete = cdc2.getByRole('button', { name: 'Supprimer', exact: true });
  await expect.soft(redDelete).toBeVisible();
  await page.keyboard.up('Control');
  expect.soft(app.dialogs.length).toBe(nDialogs);
});
