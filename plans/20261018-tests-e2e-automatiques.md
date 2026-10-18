# Tests E2E automatiques pilotés par l'agent

> Créé le 2026-10-18. Constats issus des scénarios : [20261018-plan-v1-3.md](20261018-plan-v1-3.md).

## Demande

> J'aimerais que tu ajoutes un moyen de faire des tests en auto (toi-même) et que tu prépares plein de
> tests. Commence par les choses qu'on peut faire et qui sont décrites dans les différents écrans
> d'aide, teste-les et fais-moi déjà des retours. N'en fais pas trop non plus : fais des scénarios
> qui en couvrent plusieurs d'un coup pour gagner du temps, et vise peu de captures par scénario.
> Au lieu de corriger le code quand tu identifies des bugs, note-les dans `plans/` (sauf s'ils
> empêchent de dérouler les scénarios).

Demandes complémentaires en cours de route : ignorer le dossier des captures dans git ; nommer les
plans `AAAAMMJJ-nom-du-plan.md` ; ajouter `npm run e2e:scenarios` au README.

## Ce qui a été fait

### Outillage
- **Hook dev `window.__crew`** — [src/devHook.ts](../src/devHook.ts), chargé par
  [main.tsx](../src/main.tsx) sous `import.meta.env.DEV` (vérifié absent de `dist/`). Expose en
  lecture, sous forme sérialisable : `ui()`, `file()`, `task()`, `children()`, `blocks()` (blocs
  résolus), `span()`, `conflicts()` (actifs, avec nom de tâche), `cycle()`, `canUndo()`, `undo/redo`.
  Objectif : vérifier le **modèle et le planning calculé**, pas les pixels du SVG.
- **Attributs de test** (seule modif du code UI, sans effet fonctionnel) : `data-task-id` sur la
  ligne de liste ([TaskRowCells.tsx](../src/ui/table/TaskRowCells.tsx)) et sur le groupe SVG de la
  ligne, `data-block-id` sur chaque bloc, `data-link-handle` sur la poignée de lien, `data-link-key`
  (`<successeur>-<index>`) sur la zone de survol d'un lien ([GanttChart.tsx](../src/ui/gantt/GanttChart.tsx)).
- **Fixture Playwright `app`** — [tests/e2e/scenarios/fixtures.ts](../tests/e2e/scenarios/fixtures.ts) :
  - horloge figée au **mercredi 2026-10-21** (`page.clock.setFixedTime`) → la démo, ancrée sur la
    semaine courante, donne toujours les mêmes dates ;
  - dialogues natifs (confirm/prompt/alert) capturés et auto-répondus, file de réponses
    `answerNextDialogs(true | false | 'texte')` ;
  - erreurs JS (`pageerror`, `console.error`) collectées → `expect.soft` final « aucune erreur » ;
  - helpers : `row()`, `ganttRow()`, `bar()`, `drag()` (avec modificateurs maintenus `keys` ou
    pressés au relâcher `dropKeys`, point de départ relatif `fx/fy` + décalage `ox`), `dragTo()`,
    `hoverLink()`, `contextMenu()`, `shot()` ;
  - délai de 2 min par scénario.
- **Script** `npm run e2e:scenarios` ; captures dans `tests/e2e/.shots/<scénario>/` (ajouté au
  `.gitignore`), animations désactivées à la capture.
- **Documentation** : section dédiée dans CLAUDE.md / AGENTS.md, ligne dans le README, entrée dans
  [agent-conversations.md](agent-conversations.md).

### Les 7 scénarios
Chacun enchaîne une douzaine de gestes, 1 à 2 captures. Les écarts au comportement documenté sont
des `expect.soft` : le scénario continue et liste tous les écarts d'un coup.

| # | Fichier | Couvre (aide) |
|---|---|---|
| 01 | `01-structure.spec.ts` | Projet, boutons « + » par niveau (+ Shift/Ctrl), Inser, ↑/↓/Entrée/Échap, ALT/Ctrl+flèches, groupe englobant / dégrouper, Suppr, Ctrl+Z/Y |
| 02 | `02-barres.spec.ts` | Ghost de placement, étirer, déplacer, encoche d'avancement, Ctrl+glisser (tâche, jalon), couper/fusionner/ajouter/supprimer un bloc, Ctrl+P, sous-tâche à partir d'ici, statut Annulé |
| 03 | `03-liens.spec.ts` | Sélecteur d'échelle, poignée de lien, Shift au départ / au relâcher, infobulle « FD », lien violé, panneau Liens, cycle → scission (acceptée / refusée) |
| 04 | `04-affectations.spec.ts` | Assistant « Qui est libre ? », Travail = Durée × Capacité, popover Affectés, bandeau de charge, onglet Équipe (personne, absence, motif hebdo) |
| 05 | `05-reunion.spec.ts` | Date de revue (aller-retour), reste inline, Terminé/Bloqué, note datée, absence, part projet, filtre projet, Réaffecter, clôture → journal, tableau de bord |
| 06 | `06-conflits-propositions.spec.ts` | Panneau Conflits (ignorer/réactiver, badge, marqueur), plan proposé (carte, ✓ Gantt, tout appliquer, Ctrl+Z), baseline (figer, dérive, supprimer) |
| 07 | `07-navigation-fichiers-aide.spec.ts` | Ctrl+molette, pan, clic milieu, recherche, replier, exports CSV/PNG/.gan + ré-import, Échap sur menu, format de date, Ctrl+S, secours après rechargement, onglet Aide |

État au premier passage : **6 scénarios en échec « attendu »** (uniquement sur les constats), 1 vert ;
suite complète (9 tests historiques + 7 scénarios) ≈ 30 s en parallèle, reproductible.

### Retours
~20 constats triés par sévérité dans [20261018-plan-v1-3.md](20261018-plan-v1-3.md) — le plus
sérieux : un aller-retour de date en Réunion modifie définitivement les restes (R1).
**Aucune correction du code applicatif** (consigne respectée : rien n'a bloqué les scénarios).

## Implémentation

### Découvertes sur l'existant
- **3 des 9 tests e2e historiques** ([app.spec.ts](../tests/e2e/app.spec.ts)) étaient périmés et
  échouaient : une nouvelle tâche s'ouvre désormais directement en renommage (le texte « Nouvelle
  tâche » est la *valeur* d'un input, plus un texte), et l'export CSV a quitté le menu « … » du Gantt
  pour le menu Import / Export. → **Corrigés** (tests seulement).
- Le **clic milieu** n'est pas géré par l'app : c'est le défilement automatique natif de Chromium
  (fonctionne en headless ; à vérifier sous Firefox/macOS).
- **Ctrl+S** : Chromium dispose de File System Access → sélecteur natif, non pilotable en headless.
  Le scénario note l'issue en annotation sans échouer ; le repli « téléchargement » n'est pas couvert.
- Le **« +X j »** d'une proposition n'est dessiné qu'au survol et seulement si le début bouge ; le
  bouton ✓ est au bout de la dernière bande (hors écran pour une tâche longue).
- Choisir une **date de réunion** appelle `resyncAllRemaining()` : ce n'est pas une simple
  consultation (→ constat R1).
- Le réglage **format des dates** n'est lu qu'à un seul endroit (→ constat A3).
- La cause du saut de vue au changement d'échelle a été localisée (sélecteur ⚙ sans `zoomAnchor`,
  contrairement à Ctrl+molette) (→ constat E1).

### Pièges de test rencontrés (et corrigés dans les tests)
- **Glisser depuis le bord exact d'une barre** : le bord droit d'un jour = début du jour suivant →
  un jour de trop. Correction : décalage `ox: -3` pour partir *dans* le dernier jour.
- **`hover()` sur le groupe SVG d'une ligne** : sa boîte couvre toute l'échelle de temps → Playwright
  fait défiler le Gantt pour la « centrer », et le dépôt suivant tombe hors écran. Correction :
  survoler la barre elle-même, en `force: true` (les fantômes de baseline, peints au-dessus,
  interceptent sinon le contrôle d'actionnabilité).
- **Survol d'un lien** : le centre de la boîte d'un chemin en L n'est pas sur le trait, et le haut du
  segment est sous la barre source. Correction : `hoverLink()` calcule le milieu du segment vertical
  depuis l'attribut `d`. (Fausse piste écartée : j'ai d'abord cru à un masquage par la ligne voisine.)
- **Supprimer « le 2ᵉ bloc »** : l'ordre DOM des blocs suit les dates, le bloc ajouté *avant* devient
  l'index 0. Correction : retrouver l'index par la date.
- **Changer la date de réunion recale les restes** : impossible de cibler la cellule par sa valeur
  (« 12 ») → ciblage par la colonne.
- **Locator d'un élément absent + `click()`** : attend jusqu'au délai du test (le scénario 07
  semblait « figé » dans un `page.evaluate`). Correction : cliquer le voile seulement s'il existe.
- **Captures prises pendant une transition CSS** (onglet actif, bouton de jour « Mer ») : faux
  constat visuel. Correction : `animations: 'disabled'` à la capture.
- Délai Playwright de 30 s insuffisant pour un scénario long (autosave 2 s, `expect.soft` qui
  attendent 5 s en cas d'écart) → 2 min dans la fixture.

### Complément — qualification des tickets de Pascal (même jour)
- 12 tickets testés ; résultats dans la **Partie B** de [20261018-plan-v1-3.md](20261018-plan-v1-3.md),
  bien séparée des constats de l'agent (Partie A). Cible de livraison du plan : **v1.3.0**.
- Nouveau scénario `08-tickets.spec.ts` : un test court par ticket testable (`T1`, `T3 (piste)`, `T4`,
  `T5`, `T7`, `T8`, `T9`, `T11`). Contrairement aux scénarios 01-07, ce sont des tests isolés : un ticket
  = un test, pour suivre chaque correction indépendamment.
- Hook dev enrichi : `__crew.load(fichier)` injecte un fichier précis (validé et migré) — utilisé pour T7
  (deux tâches à 0 j liées), cas impossible à monter rapidement à la souris.
- Découvertes : T4 ne se reproduit pas dans le navigateur → cause probable propre à Tauri
  (`dragDropEnabled`) ; en creusant T3, l'archivage d'un projet s'est révélé sans effet visible (tâches
  toujours affichées, et plus filtrables) ; T6 se heurte à l'emplacement **unique** de la sauvegarde de
  secours IndexedDB (clé `latest`), partagé entre instances.

### Pistes pour la suite
- Une fois les constats corrigés, les `expect.soft` correspondants passent au vert : le fichier de
  constats sert de liste de contrôle (cocher au fil des corrections).
- Ajouter un scénario « repli téléchargement » (Ctrl+S / Ouvrir) en supprimant
  `showSaveFilePicker` via `page.addInitScript`, pour couvrir le chemin Firefox.
- Étendre aux écrans non couverts : Paramètres (fériés, colonnes du Gantt, archivage), colonnes de
  la liste (filtres, largeur, ordre), frise des jalons.
