# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

CrewGantt is a serverless, single-file web app for managing **one team across multiple projects**. A file (`monequipe.cgan`) *is* a team. The UI and most docs are in **French** — match that language for user-facing strings, comments, and commit messages. The deep design rationale lives in [GDD.md](plans/GDD.md); read it when touching scheduling, links, or workload semantics.

## Commands

```bash
npm run dev          # Vite dev server → http://localhost:5173 (embedded demo on first launch)
npm run build        # tsc -b (typecheck) + vite build → dist/   ← run this to verify type-safety
npm test             # Vitest (run once)
npm run test:watch   # Vitest watch mode
npm run coverage     # core/ coverage
npm run lint         # ESLint — also enforces the core/ purity boundary (see below)
npm run format       # Prettier
npm run e2e          # Playwright (chromium)
npm run e2e:scenarios # scénarios de recette (fonctions décrites dans l'Aide) — voir plans/20261018-plan-v1-3.md
npm run e2e:tauri    # mêmes scénarios + tests bureau (tests/e2e/tauri) dans l'app Tauri (WebView2 via CDP)
```

Run a single test file / test: `npx vitest run src/core/scheduler/blocks.test.ts` · `npx vitest run -t "nom du test"`.

There is no separate `typecheck` script — `npm run build` does it (`tsc -b`). After non-trivial changes, run `npm run build` **and** `npm test`.

Scénarios E2E de recette : `tests/e2e/scenarios/` — outillage dans
[fixtures.ts](tests/e2e/scenarios/fixtures.ts) (horloge figée, hook dev `window.__crew` de
[src/devHook.ts](src/devHook.ts), captures dans `tests/e2e/.shots/` ignoré par git). Les écarts au
comportement documenté sont des `expect.soft` listés dans
[plans/20261018-plan-v1-3.md](plans/20261018-plan-v1-3.md) — tenir ce fichier à jour. Sélectionner une
ligne avec `app.selectRow(nom)` (pas `row().click()`, dont le centre peut tomber sur une cellule
éditable). Recette bureau : [scripts/e2e-tauri.mjs](scripts/e2e-tauri.mjs) lance `tauri dev` avec un
port de débogage WebView2 et un profil jetable ; la fixture se connecte via CDP (`CREW_TAURI_CDP`).

## Plans (`plans/`)
Tout **nouveau** fichier de plan se nomme `AAAAMMJJ-nom-du-plan.md`, avec la date du jour de sa
création (ex. `20261018-plan-v1-3.md`). Les documents de référence existants (`GDD.md`,
`conflicts.md`, `TODO.md`, `agent-conversations.md`) gardent leur nom. Quand une demande donne lieu
à un travail notable, créer un plan qui reprend **la demande**, **ce qui a été fait** et une section
**« Implémentation »** (découvertes, corrections en cours de route), en référençant les plans liés.

## Architecture

### The core/UI boundary is the central rule
`src/core/` is **pure TypeScript with zero UI dependencies** — no React, DOM, Zustand, or imports from `@/state`, `@/ui`, `@/io`. This is enforced by ESLint ([eslint.config.js](eslint.config.js)) and is the most important invariant in the codebase. The engine computes, validates, and *proposes*; it never mutates app state or applies anything itself. Data flows one way: UI/state → calls core functions → renders the result.

**"The tool proposes, the human disposes."** Nothing in `core/` ever moves a task on its own. Changes surface as conflicts and an overlaid re-scheduling *proposal* that the user applies (all / per-task) or ignores.

### The recompute pipeline
`computeSchedule(file, today)` in [src/core/scheduler/schedule.ts](src/core/scheduler/schedule.ts) is the single entry point that turns a `TeamFile` into a `Schedule` (resolved blocks, spans, group aggregates, earliest-start per link graph, load index, cycle detection, conflicts). Everything the UI draws comes from this object.

Recompute is **memoized by file reference** in [src/state/schedule.ts](src/state/schedule.ts): because all mutations go through Immer, any change produces a new `file` reference, which invalidates the one-slot cache. Consume it via the `useSchedule()` / `useConflicts()` hooks — never call `computeSchedule` directly from components.

**La date de réunion est une vue (v1.3).** Les restes stockés valent au jour d'aujourd'hui ;
`computeSchedule(file, reviewDate, today)` les voit à la date de réunion via `fileAsOf`
([asOf.ts](src/core/scheduler/asOf.ts)) sans rien écrire. Afficher les tâches du planning
(`schedule.hierarchy`), pas celles du store ; toute écriture se calcule avec le vrai aujourd'hui.
**Hors calculs ≠ hors vue** ([visibility.ts](src/core/model/visibility.ts)) : annulée / projet archivé =
hors calculs (`ctx.isCounted`) ; priorité « masquée » = hors vue seulement (compte dans la charge).

### State, mutations, and undo
Single Zustand store ([src/state/store.ts](src/state/store.ts)) using `immer` + `zundo` (`temporal`). All business edits go through `mutate((file) => { ... })`, which applies an Immer draft and sets `dirty`. Higher-level domain actions live in `src/state/*Actions.ts` (e.g. `taskActions`, `resourceActions`, `proposalActions`) and wrap `mutate`.

Undo/redo is **partialized to `s.file` only** — UI state (selection, active tab, `reviewDate`, `focusResourceId`) is intentionally excluded from history. Use `replaceFile` (open/new/restore) to swap the whole file and clear history.

### The domain model (see [src/core/model/types.ts](src/core/model/types.ts))
Concepts that aren't obvious from the types alone:
- **Tasks are sequences of dated work *blocks*, not continuous bars.** A task holds 1..N blocks `{from, to, assignments}`; gaps are real. Each block carries its own assignments, which is how history ("who did what, when") is recorded. Reassigning mid-task = close the current block + open a new one.
- **`scheduling: 'effort' | 'fixed'`.** In effort mode, `remaining` (j-h) drives the computed end date of the last (open, `to: null`) block; `effort = realized + remaining`. In fixed mode, dates are placed by hand.
- **`progress` (0..1) is independent of `remaining`** — it's a manually-entered % notch, not derived from effort. Don't conflate the two.
- **Links are weak "earliest-start" constraints**, never magnets (`after-end`, `with-start`, `after-progress`). Starting *after* the allowed point is fine; only starting *before* it is a conflict.
- **`reviewDate`** (store, not in file) is the past/future boundary line in the Gantt — it splits each bar into a "realized" (light) and "remaining" (dark) tint.

### Persistence (zero data loss is a hard requirement)
- Primary: File System Access API (direct write to the linked `.json`) with `<input>`/download fallback — [src/io/fileAccess.ts](src/io/fileAccess.ts). FS Access needs a secure context (HTTPS or localhost); otherwise the app silently falls back to download.
- Autosave + crash-recovery backup in IndexedDB — [src/io/autosave.ts](src/io/autosave.ts), [src/io/backup.ts](src/io/backup.ts).
- Every read **and** write is Zod-validated and migrated — [src/core/model/migrate.ts](src/core/model/migrate.ts), [schema.ts](src/core/model/schema.ts).
- GanttProject `.gan` import/export interop — [src/io/ganttproject.ts](src/io/ganttproject.ts).

### UI
React 18 + Tailwind v4. The Gantt is **hand-rolled SVG** (no Gantt library) — [src/ui/gantt/GanttChart.tsx](src/ui/gantt/GanttChart.tsx) for geometry/interactions, [GanttTab.tsx](src/ui/gantt/GanttTab.tsx) for layout/scroll-sync/virtualization. Tabs: gantt, meeting, dashboard, team, settings.

## Conventions
- **i18n is mandatory for user-facing strings.** All UI text goes through `t('dot.path')` from [src/i18n/fr.ts](src/i18n/fr.ts) — keys are typechecked, so add the key to `fr.ts` before using it. No hardcoded strings in components.
- Path alias `@/` → `src/`.
- Tests sit next to sources (`*.test.ts`); the engine in `core/` is covered heavily — keep it that way when changing scheduling logic.

## Distribution Windows (Tauri)
App native Windows via Tauri v2 (`src-tauri/`) — prérequis, commandes et procédure de release complète dans [README.md](README.md#application-windows-native-tauri). Seule règle à retenir ici : la version vient **uniquement de `package.json`** — ne jamais toucher `src-tauri/Cargo.toml` (son `version` est figé à `0.0.0` à dessein).
`npm run tauri:build` copie l'installeur de la version courante dans `installers/` (racine, ignoré par git) pour le joindre à une release GitHub.

## Icônes
Source unique : [public/icon-source.svg](public/icon-source.svg) (512×512, sert à tout sauf le 16px)
+ [public/favicon-16x16-source.png](public/favicon-16x16-source.png) (bitmap retouché à la main,
pixel par pixel — un resize du SVG à cette taille bave, voir `references/pixel-art-techniques.md`
du skill ci-dessous).

Régénération :
1. `npm run gen-icons` → régénère tout `public/*.png` + `public/favicon.ico` depuis les 2 sources
   ci-dessus ([scripts/gen-icons.mjs](scripts/gen-icons.mjs)).
2. Rasteriser `icon-source.svg` en 1024×1024 puis `npx tauri icon <path-1024.png>` → régénère
   `src-tauri/icons/*` (icns, pngs, tuiles Windows/Android/iOS).
3. `src-tauri/icons/icon.ico` doit ensuite être **reconstruit à la main** (frames 16 retouché +
   24/32/48/256 rasterisés du SVG, via `png-to-ico`) — sinon l'étape 2 écrase la frame 16px par un
   simple downscale flou. Voir le skill `app-icon-designer` pour le script.

**Si après un `npm run tauri:build` l'exe Windows affiche encore l'ancienne icône** (barre des
tâches / Explorateur — la barre de titre et Alt+Tab, eux, se mettent à jour normalement) : un
`cargo clean -p crew-gantt` **ne suffit pas toujours** — des dossiers de cache de build orphelins
s'accumulent dans `src-tauri/target/release/build/` au fil des sessions et peuvent faire relier une
ancienne ressource icône compilée. Il faut alors un `cargo clean` **complet** (sans `-p`) dans
`src-tauri/`, puis relancer `npm run tauri:build`. Vérifier l'icône réellement embarquée dans l'exe
avec PowerShell plutôt que de faire confiance à l'œil :
```powershell
Add-Type -AssemblyName System.Drawing
[System.Drawing.Icon]::ExtractAssociatedIcon("src-tauri\target\release\crew-gantt.exe").ToBitmap().Save("C:\temp\check.png")
```
(Extraire depuis une **copie** du fichier sous un nom jamais vu, pas le chemin original, pour
écarter tout doute sur un cache d'icônes Windows côté Explorateur plutôt qu'un vrai problème de
build.)

Pas de favicon SVG servi par le navigateur (`index.html`) : Chrome/Edge/Firefox préfèrent
systématiquement un lien `type="image/svg+xml"` s'il existe, ce qui empêcherait le bitmap 16px
retouché de s'afficher dans l'onglet — voir `references/browser-favicon-behavior.md` du skill.

**Pour toute refonte de l'icône (nouveau thème, nouvelles tailles), invoquer le skill
`app-icon-designer`** plutôt que de retoucher les PNG à la main — il reprend toute la méthode
(critique → variantes → itération → retouche pixel dédiée du petit format → report vers les grands
formats → page de comparaison) élaborée pour cette icône.
