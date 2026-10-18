/**
 * Outillage des scénarios E2E « bout en bout » (tests/e2e/scenarios).
 *
 * Principes :
 * - Horloge figée sur TODAY (mercredi) : la démo embarquée est ancrée sur la semaine courante,
 *   donc dates, conflits et captures sont reproductibles d'un lancement à l'autre.
 * - L'état métier se lit via le hook dev `window.__crew` (src/devHook.ts) : on vérifie le modèle
 *   et le planning calculé plutôt que des pixels.
 * - Les vérifications de comportement documenté utilisent `expect.soft` : un écart est consigné
 *   mais le scénario continue, pour couvrir un maximum de fonctionnalités par passage.
 * - Captures peu nombreuses, rangées dans tests/e2e/.shots/<scénario>/ (ignoré par git).
 */
import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Mercredi — Alice ne travaille pas le mercredi dans la démo (motif lun/mar/jeu/ven). */
export const TODAY = '2026-10-21';

type Crew = NonNullable<Window['__crew']>;

export interface Dialog {
  type: string;
  message: string;
}

export class App {
  /** Dialogues natifs vus (confirm/prompt/alert), dans l'ordre. */
  readonly dialogs: Dialog[] = [];
  /** Erreurs JS de la page (console.error + exceptions non rattrapées). */
  readonly errors: string[] = [];
  /** Réponses à donner aux prochains dialogues (FIFO). `true` = accepter, `false` = refuser, string = saisie. */
  private replies: (boolean | string)[] = [];
  private shotIndex = 0;

  constructor(
    readonly page: Page,
    private readonly info: TestInfo,
  ) {
    page.on('dialog', (d) => {
      this.dialogs.push({ type: d.type(), message: d.message() });
      const reply = this.replies.shift();
      if (reply === false) void d.dismiss();
      else if (typeof reply === 'string') void d.accept(reply);
      else void d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined);
    });
    page.on('pageerror', (e) => this.errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(`console: ${m.text()}`);
    });
  }

  /** Réponse(s) aux prochains dialogues natifs. Par défaut tout est accepté. */
  answerNextDialogs(...replies: (boolean | string)[]) {
    this.replies.push(...replies);
  }

  lastDialog(): Dialog | undefined {
    return this.dialogs[this.dialogs.length - 1];
  }

  // ——— Lecture de l'état métier (hook dev) ———

  crew<R, A = undefined>(fn: (crew: Crew, arg: A) => R, arg?: A): Promise<R> {
    return this.page.evaluate(
      ([src, a]) => {
        const f = new Function('crew', 'arg', `return (${src})(crew, arg);`);
        return f(window.__crew, a);
      },
      [fn.toString(), arg] as const,
    ) as Promise<R>;
  }

  task(name: string) {
    return this.crew((c, n) => c.task(n), name);
  }
  blocks(name: string) {
    return this.crew((c, n) => c.blocks(n), name);
  }
  span(name: string) {
    return this.crew((c, n) => c.span(n), name);
  }
  conflicts() {
    return this.crew((c) => c.conflicts());
  }
  ui() {
    return this.crew((c) => c.ui());
  }
  children(parent: string | null) {
    return this.crew((c, p) => c.children(p), parent);
  }
  async taskId(name: string): Promise<string> {
    const t = await this.task(name);
    if (!t) throw new Error(`Tâche introuvable : ${name}`);
    return t.id as string;
  }

  // ——— Localisateurs ———

  tab(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
  async goTab(name: string) {
    await this.tab(name).click();
  }
  /** Ligne de la liste (table de gauche). */
  async row(name: string): Promise<Locator> {
    return this.page.locator(`div.group\\/row[data-task-id="${await this.taskId(name)}"]`);
  }
  /**
   * Sélectionne une ligne de la liste (clic simple, ou avec modificateurs / bouton droit) en cliquant
   * dans la marge gauche de la cellule Nom : cliquer au centre de la ligne peut tomber sur une cellule
   * éditable (le focus part alors dans un champ et les raccourcis clavier ne s'appliquent plus).
   */
  async selectRow(name: string, opts: { modifiers?: ('Control' | 'Shift')[]; button?: 'right' } = {}) {
    await (await this.row(name)).click({ position: { x: 3, y: 10 }, ...opts });
  }
  /** Groupe SVG de la ligne dans le Gantt. */
  async ganttRow(name: string): Promise<Locator> {
    return this.page.locator(`#gantt-chart-svg g[data-task-id="${await this.taskId(name)}"]`);
  }
  /** i-ème bloc (rect principal) d'une tâche dans le Gantt. */
  async bar(name: string, i = 0): Promise<Locator> {
    return (await this.ganttRow(name)).locator('rect[data-block-id]').nth(i);
  }

  /**
   * Survole le milieu du segment vertical d'un lien (clé `<idSuccesseur>-<indexLien>`), calculé
   * depuis l'attribut `d` de sa zone de survol — fait apparaître infobulle, × et poignée de re-ciblage.
   */
  async hoverLink(key: string) {
    const d = await this.page.locator(`path[data-link-key="${key}"]`).getAttribute('d');
    const m = d?.match(/^M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)/);
    const svg = await this.page.locator('#gantt-chart-svg').boundingBox();
    if (!m || !svg) throw new Error(`hoverLink: lien ${key} introuvable`);
    const x = svg.x + Number(m[1]);
    const y = svg.y + (Number(m[2]) + Number(m[4])) / 2;
    await this.page.mouse.move(x, y - 3);
    await this.page.mouse.move(x, y);
  }

  // ——— Gestes ———

  /**
   * Glisser depuis un point relatif d'un élément (fx, fy ∈ [0,1] de sa boîte) de (dx, dy) px.
   * `keys` : modificateurs maintenus pendant tout le geste ; `dropKeys` : pressés juste avant le relâcher.
   */
  async drag(
    target: Locator,
    dx: number,
    dy = 0,
    opts: {
      fx?: number;
      fy?: number;
      /** Décalage horizontal en px ajouté au point de départ (ex. -3 pour rester dans le dernier jour). */
      ox?: number;
      keys?: string[];
      dropKeys?: string[];
      button?: 'left' | 'middle';
    } = {},
  ) {
    const box = await target.boundingBox();
    if (!box) throw new Error('drag: élément sans boîte (hors écran ?)');
    const x = box.x + box.width * (opts.fx ?? 0.5) + (opts.ox ?? 0);
    const y = box.y + box.height * (opts.fy ?? 0.5);
    const m = this.page.mouse;
    for (const k of opts.keys ?? []) await this.page.keyboard.down(k);
    await m.move(x, y);
    await m.down({ button: opts.button ?? 'left' });
    await m.move(x + dx / 2, y + dy / 2, { steps: 5 });
    await m.move(x + dx, y + dy, { steps: 5 });
    for (const k of opts.dropKeys ?? []) await this.page.keyboard.down(k);
    await m.up({ button: opts.button ?? 'left' });
    for (const k of [...(opts.dropKeys ?? []), ...(opts.keys ?? [])]) await this.page.keyboard.up(k);
  }

  /** Glisser d'un élément vers un point relatif d'un autre (ex. poignée de lien → ligne cible). */
  async dragTo(
    source: Locator,
    dest: Locator,
    opts: { fx?: number; fy?: number; tx?: number; ty?: number; keys?: string[]; dropKeys?: string[] } = {},
  ) {
    const s = await source.boundingBox();
    const d = await dest.boundingBox();
    if (!s || !d) throw new Error('dragTo: élément sans boîte');
    const sx = s.x + s.width * (opts.fx ?? 0.5);
    const sy = s.y + s.height * (opts.fy ?? 0.5);
    const dx = d.x + d.width * (opts.tx ?? 0.5) - sx;
    const dy = d.y + d.height * (opts.ty ?? 0.5) - sy;
    await this.drag(source, dx, dy, { fx: opts.fx, fy: opts.fy, keys: opts.keys, dropKeys: opts.dropKeys });
  }

  /** Clic droit sur un point relatif d'un élément, puis choix d'une entrée du menu contextuel. */
  async contextMenu(target: Locator, entry: string | RegExp, at?: { fx?: number; fy?: number }) {
    const box = await target.boundingBox();
    if (!box) throw new Error('contextMenu: élément sans boîte');
    await this.page.mouse.click(box.x + box.width * (at?.fx ?? 0.5), box.y + box.height * (at?.fy ?? 0.5), {
      button: 'right',
    });
    await this.page.getByRole('button', { name: entry }).first().click();
  }

  // ——— Captures ———

  /** Capture numérotée dans tests/e2e/.shots/<scénario>/. Peu par scénario. */
  async shot(label: string, target?: Locator) {
    const dir = path.join('tests', 'e2e', '.shots', slug(this.info.title));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${String(++this.shotIndex).padStart(2, '0')}-${slug(label)}.png`);
    // animations désactivées : sinon les transitions CSS (onglet actif, boutons) sont capturées à mi-course
    if (target) await target.screenshot({ path: file, animations: 'disabled' });
    else await this.page.screenshot({ path: file, animations: 'disabled' });
    return file;
  }
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use, testInfo) => {
    // Un scénario enchaîne beaucoup de gestes (et des expect.soft qui attendent 5 s en cas d'écart)
    testInfo.setTimeout(120_000);
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    const app = new App(page, testInfo);
    await page.goto('/');
    await page.waitForFunction(() => !!window.__crew);
    await expect(page.locator('#gantt-chart-svg')).toBeVisible();
    await use(app);
    // Bilan : dialogues et erreurs JS joints au rapport, erreurs = écart consigné.
    await testInfo.attach('dialogs.json', { body: JSON.stringify(app.dialogs, null, 2), contentType: 'application/json' });
    expect.soft(app.errors, 'erreurs JS pendant le scénario').toEqual([]);
  },
});

export { expect };
