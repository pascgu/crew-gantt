/**
 * Scénario 4 — Affecter les personnes, lire la charge, gérer l'équipe.
 * Aide couverte : Prise en main §4 ; Concepts « Travail = Durée × Capacité », « Charge & capacité »
 * (bouton Afficher/Masquer la charge) ; Où trouver : assign (panneau + cellule Affectés) ;
 * Légende : personnage rouge = non affectée.
 */
import { expect, test } from './fixtures';

test('affectations : assistant, popover Affectés, Travail = Durée × Capacité, charge, équipe', async ({
  app,
  page,
}) => {
  // — Panneau de détail : « Affecter quelqu’un » ouvre l’assistant (qui est libre ?) —
  const endBefore = (await app.span('Dév. front'))!.end;
  await (await app.row('Dév. front')).dblclick();
  await page.getByRole('button', { name: 'Affecter quelqu’un' }).click();
  await expect.soft(page.getByText('Qui est libre sur cette fenêtre ?')).toBeVisible();
  // Les prérequis de la tâche sont rappelés au moment d'affecter
  await expect.soft(page.getByText('Maquettes en partie validées').last()).toBeVisible();
  await app.shot('assistant affectation');
  await page.locator('button', { hasText: /^Alice/ }).last().click();
  const asg = (await app.blocks('Dév. front'))![0]!.assignments.map((a) => a.resourceId);
  expect.soft(asg).toEqual(['r-bob', 'r-alice']);
  // Travail fixe en mode effort : ajouter du monde raccourcit la barre
  const endAfter = (await app.span('Dév. front'))!.end;
  expect.soft(endAfter < endBefore, `fin ${endBefore} → ${endAfter} : doit raccourcir`).toBe(true);
  await page.keyboard.press('Escape');

  // — Cellule « Affectés » : popover d'affectation sur une tâche non affectée —
  const unassigned = () => app.conflicts().then((cs) => cs.filter((c) => c.type === 'unassigned').map((c) => c.taskName));
  expect.soft(await unassigned()).toContain('Intégration API partenaires');
  await (await app.row('Intégration API partenaires')).getByTitle('Modifier l’affectation').click();
  await expect.soft(page.getByText('Affectation du bloc')).toBeVisible();
  await page.getByTitle('Ajouter Bob').click();
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  expect.soft((await app.blocks('Intégration API partenaires'))![0]!.assignments).toEqual([{ resourceId: 'r-bob', units: 100 }]);
  expect.soft(await unassigned(), 'conflit « non affectée » levé').not.toContain('Intégration API partenaires');

  // — Bandeau de charge : masquer / réafficher (bouton en bas au centre) —
  const band = page.getByText('Chloé', { exact: true }).last();
  await page.getByRole('button', { name: 'Masquer la charge' }).click();
  await expect.soft(page.getByRole('button', { name: 'Afficher la charge' })).toBeVisible();
  await page.getByRole('button', { name: 'Afficher la charge' }).click();
  await expect.soft(band).toBeVisible();

  // — Onglet Équipe : ajouter une personne, poser une absence, changer un motif hebdo —
  const frontEnd0 = (await app.span('Dév. front'))!.end;
  const maqEnd0 = (await app.span('Maquettes'))!.end;
  await app.goTab('Équipe');
  const nRes = (await app.crew((c) => c.file())).resources.length;
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  expect.soft((await app.crew((c) => c.file())).resources.length).toBe(nRes + 1);

  const cards = page.locator('section').filter({ has: page.getByRole('button', { name: 'Supprimer', exact: true }) });
  const bob = cards.nth(1);
  await bob.locator('input[type="date"]').first().fill('2026-11-02');
  await bob.getByRole('button', { name: '+ Ajouter une exception' }).click();
  const bobEx = (await app.crew((c) => c.file())).resources.find((r: { id: string }) => r.id === 'r-bob').exceptions;
  expect.soft(bobEx).toEqual([{ from: '2026-11-02', percent: 0 }]);
  expect.soft((await app.span('Dév. front'))!.end >= frontEnd0, 'absence de Bob → Dév. front ne finit pas plus tôt').toBe(true);

  // Alice travaille désormais le mercredi → Maquettes (Alice 80 %) finit plus tôt
  const alice = cards.nth(0);
  await alice.getByRole('button', { name: 'mer', exact: true }).click();
  const aliceDays = (await app.crew((c) => c.file())).resources.find((r: { id: string }) => r.id === 'r-alice').workingDays;
  expect.soft(aliceDays).toContain(3);
  expect.soft((await app.span('Maquettes'))!.end < maqEnd0, 'motif + mercredi → fin plus tôt').toBe(true);
  await app.shot('equipe apres modifications');

  // — Réunion : Alice n'est plus « absente » un mercredi —
  await app.goTab('Réunion');
  const aliceMeeting = page.locator('div', { hasText: /^Alice/ }).first();
  void aliceMeeting;
  await expect.soft(page.getByText('absent(e)')).toHaveCount(0);
});
