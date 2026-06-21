# Catalogue des conflits CrewGantt

Ce fichier décrit tous les types de conflits et avertissements que CrewGantt peut détecter, leur représentation visuelle et les actions de résolution recommandées.

**Règle de maintenance :** mettre ce fichier à jour lors de toute modification impactant la détection, l'affichage ou la résolution d'un conflit (voir `src/core/conflicts/detect.ts`).

---

## Tableau récapitulatif

| Type | Libellé | Où visible | Résolution |
|------|---------|-----------|------------|
| `link-violated` | Lien violé | Barre rouge + lien rouge + badge rouge | Décaler la tâche, ou appliquer la proposition |
| `project-overload` | Surcharge projet | Badge rouge + panneau Conflits + bande orange sur barres | Réduire les unités, décaler une tâche, ou ajouter un bloc |
| `no-capacity` | Travail sans capacité | Barre rouge + badge rouge + panneau Conflits | Corriger l'absence ou déplacer le bloc |
| `effort-overflow` | Effort non casé | Barre rouge + badge rouge + panneau Conflits | Appliquer la proposition, ou ajouter de la capacité |
| `deadline` | Deadline menacée | Drapeau rouge + badge rouge + panneau Conflits | Réduire la portée, ajouter des ressources, ou réviser la deadline |
| `milestone-untenable` | Jalon intenable | Losange rouge + badge rouge + panneau Conflits | Avancer le jalon ou décaler le prédécesseur |
| `unassigned` | Tâche non affectée | Badge rouge + panneau Conflits | Affecter une personne au bloc ouvert |
| sur-engagement | Sur-engagement *(avertissement)* | Panneau Conflits (orange) + vue Charge + bande orange sur barres | Rééquilibrer les affectations cross-projets |
| cycle | Cycle de dépendances | Bandeau rouge dans le panneau Conflits | Supprimer un lien créant la boucle |

---

## 1 · Lien violé (`link-violated`)

**Cause :** une tâche est planifiée à démarrer avant la date au plus tôt imposée par un lien entrant (après-fin, avec-début, après-avancement). Les liens sont faibles — ils contraignent le début au plus tôt sans jamais tirer la tâche en avant.

**Détection :** `span.start < earliest.date` pour la tâche successeur. Variante ancre (`targetDays`) : le N-ième jour travaillé de la tâche est atteint avant la date requise.

**Affichage :**
- Trait de lien rouge et épais entre prédécesseur et successeur.
- Bordure rouge sur toutes les barres du successeur.
- Badge rouge dans la colonne nom de la tâche (cliquable → panneau Conflits).
- Message dans le panneau Conflits avec la date au plus tôt.

**Résolution :** décaler manuellement la tâche successeur à la bonne date, ou appliquer la proposition de ré-ordonnancement (qui gère aussi la cascade sur les successeurs de successeurs).

---

## 2 · Surcharge projet (`project-overload`)

**Cause :** pour une même personne, un même projet et un même jour, la somme des unités (%) affectées aux tâches dépasse 100 %. La personne ne peut pas honorer toutes ses affectations simultanées.

**Détection :** `Σ unitsByProject[projectId] > 100` dans le `loadIndex` pour un triplet (ressource, projet, jour).

**Affichage :**
- Entrée dans le panneau Conflits (une par triplet ressource+projet, premier jour de surcharge).
- **Bande orange (2 px)** sur le bord supérieur des barres du Gantt pour les jours concernés (futur uniquement).
- Vue Charge : barres en rouge pour les colonnes de jours en surcharge.

**Résolution :** réduire les unités d'une affectation, décaler une des tâches, ou fractionner les blocs dans le temps.

---

## 3 · Travail sans capacité (`no-capacity`)

**Cause :** une personne affectée à un bloc futur a une capacité nulle — soit une absence datée (exception à 0 %) tombe dans le bloc, soit la capacité effective sur tout le bloc est zéro (part projet à 0, pattern hebdo bloquant tout le bloc, etc.).

Les motifs hebdomadaires récurrents et les jours fériés globaux ne déclenchent pas ce conflit ; seuls les événements datés (exceptions) alertent.

**Détection :** pour chaque affectation d'un bloc futur : présence d'une exception à 0 % sur au moins un jour ouvré global du bloc, OU capacité nulle sur l'intégralité du bloc.

**Affichage :**
- Bordure rouge sur la barre de la tâche concernée.
- Badge rouge dans la colonne nom.
- Panneau Conflits : personne, tâche et date approximative de l'absence.

**Résolution :** corriger l'exception (ajuster les dates, modifier le pourcentage), ou déplacer le bloc hors de la période d'absence.

---

## 4 · Effort non casé (`effort-overflow`)

**Cause :** pour une tâche en mode effort, le reste à faire (`remaining`) ne peut pas être absorbé par la capacité disponible dans les blocs planifiés, même en projetant jusqu'à l'horizon (1 200 jours). Deux sous-cas :
- Un bloc ouvert (fin calculée) dépasse l'horizon.
- Seuls des blocs fermés restent, mais leur capacité future cumulée est inférieure au reste à faire.

**Détection :** flag `r.overflow === true` sur un bloc résolu, ou `Σ plannedFutureCapacity < remaining`.

**Affichage :**
- Bordure rouge sur la ou les barres du bloc débordant.
- Badge rouge dans la colonne nom.
- Panneau Conflits : tâche et quantité de j-h en dépassement.

**Résolution :** appliquer la proposition (qui ré-place le bloc au plus tôt disponible), augmenter les affectations, ajouter un nouveau bloc, ou revoir le reste à faire.

---

## 5 · Deadline menacée (`deadline`)

**Cause :** la fin planifiée de la tâche (dernière date de son span) dépasse la deadline saisie.

**Détection :** `span.end > task.deadline`.

**Affichage :**
- Petit drapeau rouge sur la barre à la date de deadline.
- Badge rouge dans la colonne nom.
- Panneau Conflits : tâche, date de deadline, nombre de jours de dépassement.
- Panneau Impacts d'une proposition : section « Deadlines encore menacées » si la proposition ne résout pas tout.

**Résolution :** réduire la portée, augmenter les ressources, décaler la deadline, ou appliquer la proposition si elle résout le problème.

---

## 6 · Jalon intenable (`milestone-untenable`)

**Cause :** un jalon (type `milestone`) a une date placée avant la date au plus tôt dérivée de ses liens entrants. Son prédécesseur finit après la date du jalon.

**Détection :** `task.date < earliest.date` pour un jalon.

**Affichage :**
- Losange rouge (bordure) à la position du jalon.
- Badge rouge dans la colonne nom.
- Panneau Conflits : jalon, date au plus tôt, décalage en jours.

**Résolution :** avancer la date du jalon (si possible), décaler le prédécesseur, ou appliquer la proposition qui déplace le jalon à sa date au plus tôt.

---

## 7 · Tâche non affectée (`unassigned`)

**Cause :** une tâche en mode effort avec du reste à faire n'a aucune affectation sur ses blocs à venir (blocs futurs sans assigné, ou aucun bloc).

**Détection :** tâche effort, `remaining > 0`, non terminée, et au moins un bloc futur sans assigné (ou aucun bloc).

**Affichage :**
- Badge rouge dans la colonne nom.
- Panneau Conflits : tâche et date du premier bloc non affecté.

**Résolution :** affecter une ou plusieurs personnes au bloc ouvert (onglet Tâche > Affectation).

---

## 8 · Sur-engagement *(avertissement doux)*

**Cause :** pour une ressource, le total de sa charge sur tous projets dépasse 100 % de sa présence sur une ou plusieurs journées. Ce n'est pas un conflit bloquant — il peut être voulu (la personne gère plusieurs projets en parallèle avec une légère surtension acceptable).

**Différence avec `project-overload` :** le sur-engagement est cross-projets (Σ charge totale > présence) ; `project-overload` est intra-projet (Σ unités sur un seul projet > 100 %).

**Affichage :**
- Avertissement orange dans le panneau Conflits (non ignorable individuellement).
- Vue Charge : les colonnes de jours en sur-engagement dépassent la ligne de référence 100 %.
- **Bande orange (2 px)** sur le bord supérieur des barres du Gantt pour les jours concernés (futur uniquement), identique à `project-overload`.

**Résolution :** rééquilibrer les affectations cross-projets, ajuster les parts projets, ou accepter la surtension si elle est temporaire et volontaire.

---

## 9 · Cycle de dépendances

**Cause :** le graphe de liens contient un cycle (A dépend de B, B dépend de A, directement ou indirectement). Le tri topologique échoue, aucune date au plus tôt ne peut être calculée.

**Prévention :** l'interface empêche la création d'un lien cyclique (message de refus, ou proposition de découper la tâche pour casser le cycle). Ce cas ne devrait pas survenir en édition normale ; il peut apparaître si le fichier `.json` est édité manuellement.

**Détection :** `topologicalOrder(tasks).cycle !== null`.

**Affichage :**
- Bandeau rouge en tête du panneau Conflits listant les tâches du cycle (`A → B → … → A`).
- Aucune date au plus tôt n'est disponible pour les tâches du cycle.

**Résolution :** supprimer le lien qui crée la boucle (éditer le fichier JSON ou utiliser la fonction « casser le cycle » dans le panneau Tâche).
