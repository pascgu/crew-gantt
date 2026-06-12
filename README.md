# CrewGantt

> Outil web de pilotage d'équipe multi-projets.
> Qui fait quoi, cette semaine et sur la durée. Un fichier = une équipe.

CrewGantt n'est pas un outil de gestion de projet de plus : c'est un outil de **management d'équipe**. Le manager y pilote **une équipe** travaillant sur **plusieurs projets** — plan long terme (Gantt à blocs de travail), dispatch des personnes, et suivi en réunion hebdomadaire. Voir le [document de conception](GDD.md).

**Principe fondateur : l'outil propose, l'humain dispose.** CrewGantt ne déplace jamais une tâche tout seul — il signale les conflits, propose un réordonnancement en surimpression, et vous appliquez tout, tâche par tâche, ou rien.

## Spécificités

- **Tâches en blocs de travail datés** (pas des barres continues) : on commence 2 jours, on s'arrête 3 semaines, on reprend — l'historique « qui a fait quoi quand » vit dans le fichier.
- **Un calendrier + deux étages de pourcentage** : présence (motif hebdo + exceptions datées), part projet par périodes, % d'affectation par bloc. Partout, l'équivalent concret en j/semaine est affiché.
- **Liens faibles** « au plus tôt » (après la fin, avec le début, après N jours de travail — ancré), jamais un aimant.
- **Zéro perte de données** : fichier JSON local (File System Access + fallback), auto-save, sauvegarde de secours IndexedDB, validation Zod en lecture *et* écriture, undo/redo illimité.
- Pas de serveur, pas de compte : un fichier `monequipe.crewgantt.json` qu'on ouvre, modifie, partage.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173 (démo embarquée au premier lancement)
npm test           # Vitest — moteur de calcul couvert à ~99 %
npm run coverage   # couverture du core
npm run e2e        # Playwright (chromium) — parcours clés
npm run lint       # ESLint (core/ sans import React/DOM, vérifié)
npm run build      # tsc + vite → dist/
```

Stack : TypeScript strict · React 18 + Vite · Zustand/Immer/zundo · Zod · date-fns · Tailwind CSS v4 · SVG custom (aucune lib Gantt).

Architecture : `src/core/` (modèle, calendrier, ordonnanceur, conflits, propositions, diff) est du TypeScript pur **sans aucune dépendance UI** — l'interface le consomme, jamais l'inverse.

## Déploiement

Site 100 % statique servi par nginx :

```bash
docker compose up -d   # → http://localhost:8080
```

> Note : la File System Access API (enregistrement direct dans le fichier) exige un contexte sécurisé — HTTPS ou `localhost`. Servie en HTTP simple sur le réseau, l'application bascule automatiquement sur l'import/export de fichier.
