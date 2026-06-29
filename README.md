# CrewGantt

> Outil web de pilotage d'équipe multi-projets.
> Qui fait quoi, cette semaine et sur la durée. Un fichier = une équipe.

CrewGantt n'est pas un outil de gestion de projet de plus : c'est un outil de **management d'équipe**. Le manager y pilote **une équipe** travaillant sur **plusieurs projets** — plan long terme (Gantt à blocs de travail), dispatch des personnes, et suivi en réunion hebdomadaire. Voir le [document de conception](plans/GDD.md).

**Principe fondateur : l'outil propose, l'humain dispose.** CrewGantt ne déplace jamais une tâche tout seul — il signale les conflits, propose un réordonnancement en surimpression, et vous appliquez tout, tâche par tâche, ou rien.

## Spécificités

- **Tâches en blocs de travail datés** (pas des barres continues) : on commence 2 jours, on s'arrête 3 semaines, on reprend — l'historique « qui a fait quoi quand » vit dans le fichier.
- **Un calendrier + deux étages de pourcentage** : présence (motif hebdo + exceptions datées), part projet par périodes, % d'affectation par bloc. Partout, l'équivalent concret en j/semaine est affiché.
- **Liens faibles** « au plus tôt » (après la fin, avec le début, après N jours de travail — ancré), jamais un aimant.
- **Zéro perte de données** : fichier JSON local (File System Access + fallback), auto-save, sauvegarde de secours IndexedDB, validation Zod en lecture *et* écriture, undo/redo illimité.
- Pas de serveur, pas de compte : un fichier `monequipe.cgan` qu'on ouvre, modifie, partage.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173 (démo embarquée au premier lancement)
npm test           # Vitest — moteur de calcul couvert à ~99 %
npm run coverage   # couverture du core
npm run e2e        # Playwright (chromium) — parcours clés
npm run lint       # ESLint (core/ sans import React/DOM, vérifié)
npm run build      # tsc + vite → dist/
npm run gen-icons  # régénère les icônes PNG dans public/ depuis les SVG sources
```

Stack : TypeScript strict · React 18 + Vite · Zustand/Immer/zundo · Zod · date-fns · Tailwind CSS v4 · SVG custom (aucune lib Gantt).

Architecture : `src/core/` (modèle, calendrier, ordonnanceur, conflits, propositions, diff) est du TypeScript pur **sans aucune dépendance UI** — l'interface le consomme, jamais l'inverse.

## Application de bureau / PWA (Windows)

CrewGantt peut être installé comme application de bureau via le mécanisme PWA — **sans Electron, sans installeur**.

### Prérequis

- **Edge ou Chrome** sur Windows (recommandé — expérience complète).
- Firefox : fonctionne en onglet (File System Access de base), mais sans installation PWA native ni fichiers récents. Extensions communautaires optionnelles : [File System Access](https://addons.mozilla.org/fr/firefox/addon/file-system-access/) pour les fichiers récents, [PWAsForFirefox](https://addons.mozilla.org/firefox/addon/pwas-for-firefox/) pour l'installation (setup plus complexe, non supporté officiellement).

### Installation

1. Ouvrir l'URL dans Edge ou Chrome.
2. Cliquer l'icône **Installer** dans la barre d'adresse (ou menu ⋮ → *Installer CrewGantt*).
3. Une fenêtre autonome s'ouvre, sans barre navigateur.

### Avantages

- **Ctrl+S** écrase directement le fichier `.cgan` — plus de téléchargement renommé par le navigateur.
- **Fichiers récents** : Shift+clic ou clic droit sur le bouton Ouvrir pour rouvrir un fichier récent en un clic.
- **Restauration automatique** : au relancement de la PWA, le dernier fichier ouvert est restauré sans avoir à le repicker (si la permission était déjà accordée).
- **Nombre de fichiers récents** configurable dans l'onglet Paramètres (1 – 20, défaut 5).

### Icônes

Les icônes sont précompilées dans `public/`. Pour les régénérer depuis les SVG sources (`public/icon-source.svg` et `public/favicon-source.svg`) :

```bash
npm run gen-icons
```

Nécessite Node.js ≥ 18. Les PNG résultants sont versionnés dans le dépôt.

## Déploiement

Site 100 % statique servi par nginx :

```bash
docker compose up -d   # → http://localhost:8080
```

> Note : la File System Access API (enregistrement direct dans le fichier) exige un contexte sécurisé — HTTPS ou `localhost`. Servie en HTTP simple sur le réseau, l'application bascule automatiquement sur l'import/export de fichier.
