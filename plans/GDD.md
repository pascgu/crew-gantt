# CrewGantt — Document de conception

> Outil web de pilotage d'équipe multi-projets.
> Qui fait quoi, cette semaine et sur la durée. Un fichier = une équipe. Stable, simple, joli.

---

## 1. Vision

CrewGantt n'est pas un outil de gestion de projet de plus : c'est un outil de **management d'équipe**. Le manager y pilote **une équipe** qui travaille sur **plusieurs projets**, et l'outil l'aide à :

1. **Structurer le plan** : arborescence de tâches (profondeur libre), liens entre tâches, jalons, dates de rendu estimées — la vision long terme.
2. **Dispatcher le travail** : affecter les personnes aux tâches à un certain pourcentage de leur temps, voir qui est chargé/libre, ajuster.
3. **Suivre en réunion** : chaque semaine, mettre à jour les avancements, **réajuster qui fait quoi**, saisir les absences, et mesurer la dérive par rapport au plan de référence.

### Les deux modes

| | Mode **Planification** | Mode **Suivi** |
|---|---|---|
| Horizon | Long terme | Journalier / hebdo |
| Usage | Construction du plan, replanifications majeures | Réunions d'équipe |
| Objets | Arborescence, liens, jalons, estimations, baseline | Avancements, réaffectations, absences, notes |
| Question | « Quand livre-t-on quoi, avec qui ? » | « Qui fait quoi cette semaine, qu'est-ce qui bouge ? » |

### Principe fondateur : l'outil propose, l'humain dispose

**CrewGantt ne déplace jamais une tâche tout seul.** Quand un changement (disponibilité, affectation, avancement, lien…) crée des conflits ou des décalages logiques, l'outil :
1. **signale** les conflits (badges, panneau dédié),
2. **propose** un réordonnancement (affiché en surimpression, comme une baseline temporaire),
3. l'utilisateur **applique tout, applique tâche par tâche, ajuste à la main, ou ignore** — et on itère jusqu'à un plan stable.

### Priorités produit

**Stabilité > simplicité > esthétique > richesse fonctionnelle.**

- Zéro perte de données, jamais : auto-save + sauvegarde de secours + validation systématique.
- Moteur de calcul en code pur, testé exhaustivement, séparé de l'UI.
- Pas de serveur, pas de compte : un fichier `.json` local qu'on ouvre, modifie, partage.
- Tout est annulable (undo/redo illimité dans la session).
- Granularité : **la journée**. C'est un outil de management, pas de pointage.

---

## 2. Concepts métier

### L'Équipe (= le fichier)

Un fichier CrewGantt représente une équipe et son portefeuille de projets :
- Nom de l'équipe.
- **Calendrier global** : jours ouvrés (lun–ven par défaut, configurable), jours fériés (préremplissage fériés français proposé).
- Les ressources, les projets, les tâches, les baselines, le journal.

### Projets

- Nom, couleur (teinte les barres du Gantt et les jauges de charge), statut (actif/archivé).
- Chaque tâche racine appartient à un projet ; les sous-tâches en héritent.
- **Filtre par projet(s) dans toutes les vues** (Gantt, Réunion, Tableau de bord) pour se concentrer sur un projet ou voir l'ensemble.
- **Fiche projet dans le Tableau de bord** : chaque projet y a sa carte (voyants de santé) et sa fiche détaillée — délais non respectés, tâches bloquées (par le client ou autre), dépassement de l'estim vendue, jalons en dérive. C'est le point d'entrée « santé du projet » ; elle s'enrichira (rentabilité, coûts… en v2). La **gestion** des projets (créer, archiver, couleur) vit dans **Paramètres**.

### Ressources

- Nom, type (`person` | `material`).
- **Calendrier personnel** — il remplace tout « pourcentage de disponibilité globale » :
  - **Jours travaillés** (motif hebdomadaire) : ex. lun, mar, jeu, ven pour un 80 % structurel — des jours concrets plutôt qu'un pourcentage abstrait. Par défaut : les jours ouvrés du calendrier global.
  - **Exceptions datées** `{du, au (optionnel = un seul jour), % (défaut 0), motif}` : congés (« absent du 12 au 16/10 »), demi-journée (« 50 % le 06/11 »), ou jour normalement chômé mais travaillé (« 100 % le samedi 21/03 »). L'exception **prime sur tout** (fériés globaux, motif hebdo).
  - **Présence(J)** = l'exception si elle existe, sinon 0 % si férié global ou jour non travaillé, sinon 100 %.
- **Répartition par projet (parts projet), évolutive** : pour chaque projet, des périodes `{du, au (optionnel), %}`. Défaut : 100 %. Le cumul entre projets est **libre** : < 100 % (du temps hors projets) ou > 100 % (heures supp assumées). C'est **le pourcentage de la planification** : « Alice met ~60 % de son temps sur le portail ce trimestre » suffit pour estimer durées et jalons sans connaître ses journées exactes.
- L'UI montre calendrier et parts projet comme des petites timelines éditables par personne.

**Un calendrier + deux étages de pourcentage** :

| Niveau | Question | Exemple |
|---|---|---|
| 1. Calendrier perso | « Alice est-elle là ce jour-là ? » | Pas le mercredi ; congés du 12 au 16/10 |
| 2. Part projet | « Quelle part de son temps va au projet A ? » | 60 % → ~2,4 j/sem sur A |
| 3. Affectation tâche | « Quelle part de son temps projet A va à cette tâche ? » | 100 % (défaut) → ~2,4 j/sem |

- Quand on affecte une personne à une tâche, **c'est sa part projet qui sert de base** : affectée « à 100 % », elle y met tout son temps projet.
- **Capacité d'une affectation un jour J** = présence(J) × part projet %(J) × affectation %.
- **Règle d'or d'affichage** : partout où un % apparaît, l'UI affiche l'équivalent concret en jours/semaine — le manager pense en jours, pas en pourcentages multipliés.

**Planification vs suivi — le même modèle, deux usages** :
- **En planification** (horizon lointain) : on ne connaît pas les journées de chacun ; on raisonne avec les parts projet (% hebdo) et la présence par défaut. Ça suffit pour estimer les durées et poser les jalons.
- **En suivi** (les 1–2 semaines devant soi) : on précise le calendrier réel — « Bob absent jeudi-vendredi » saisi en 2 clics en réunion. Le moteur affine, le panneau Impacts montre ce qui bouge.
- Le calendrier se maintient **au besoin, pas exhaustivement** : il ne sert qu'à convertir l'effort en durée et à détecter les conflits. Non renseigné = présent par défaut, et les estimations long terme restent valables à la louche.

### Tâches et blocs de travail

C'est le cœur du modèle, et une différence majeure avec les outils classiques : **une tâche n'est pas une barre continue, c'est une suite de blocs de travail datés**.

- Une tâche contient **1 à N blocs** `{du, au, affectations}`. On peut commencer une tâche 2 jours, ne plus y toucher pendant 3 semaines, puis reprendre : ce sont des blocs séparés, **avec un trou** — on ne rallonge pas artificiellement une barre à chaque réunion.
- **Chaque bloc porte ses affectations** `{ressource, % de sa part projet}`. C'est ce qui enregistre naturellement l'historique : « Bob a fait 2 jours (bloc 1), puis 2 semaines plus tard Marie a fait 5 jours (bloc 2) ». Réaffecter une tâche en cours = clore le bloc courant à aujourd'hui + créer le bloc suivant avec la nouvelle équipe. **Un bloc = une équipe stable à des pourcentages stables** ; tout changement de répartition = nouveau bloc.
- Champs d'une tâche :
  - Nom, description, type : `task` | `milestone` | `group`.
  - **Hiérarchie** : `parentId`, profondeur **illimitée** (l'UI est conçue pour rester lisible à 5+ niveaux).
  - **Planification** : `effort` (piloté par l'effort, défaut) ou `fixed` (durée posée à la main).
  - **Estim (vendu)** : jours-homme estimés au devis. Purement informatif — rappelle ce qui a été vendu. Bouton « initialiser l'effort depuis l'estim » pour le premier jet de planification. Colonne d'écart estim/effort disponible.
  - **Effort** : jours-homme prévus (mode effort). **Reste à faire** : jours-homme restants — c'est lui qui pilote le recalcul. Le % d'avancement s'en déduit (saisie bidirectionnelle : modifier l'un met à jour l'autre).
  - **Statut** : `todo` | `in_progress` | `done` | `blocked`.
  - **Prérequis** (zone de texte libre) : compétences nécessaires et/ou conditions, en clair — « UX confirmé », « serveur de recette dispo », « X+Y dispo en même temps ». Affichée bien en vue au moment d'affecter. Pas de référentiel structuré de compétences : du texte, simple et souple.
  - **Liens** vers des prédécesseurs (voir ci-dessous).
  - **Deadline** (optionnelle) : déclenche une alerte si la fin planifiée la dépasse.
  - **Notes datées** : journal de la tâche, alimenté en réunion.

### Liens entre tâches (faibles)

Trois types, tous exprimant une **contrainte « au plus tôt »** — jamais un aimant :

| Type | Sens | Exemple |
|---|---|---|
| **Après la fin de** | Peut débuter après la fin du prédécesseur (+ délai optionnel) | Recette après Dev |
| **Avec le début de** | Peut débuter en même temps que le prédécesseur | Doc démarre avec le Dev |
| **Après N jours de travail de** | Peut débuter quand le prédécesseur a accumulé N jours travaillés | Le dev peut démarrer après 2 j de maquettes |

- Le 3e type s'ancre **en tirant le lien depuis un point précis de la barre source** ; l'ancre est mémorisée en *jours travaillés* du prédécesseur, donc elle reste juste même si la source est découpée ou déplacée.
- **Liens faibles** : commencer une tâche bien après le point autorisé est normal (marge libre). Seule une tâche placée **avant** son point autorisé crée un conflit — signalé, jamais corrigé d'office.
- Un `lag` (délai en jours ouvrés, positif ou négatif) est possible sur chaque lien.
- Cycles détectés et refusés avec un message clair.

### Jalons

- Tâche ponctuelle (losange), date posée par l'utilisateur (l'outil propose une date dérivée des liens, l'utilisateur valide).
- **Un jalon peut être une sous-tâche** ; quand on replie son parent, le losange **reste visible** sur la barre résumé.
- Objet central de la vision long terme : chaque livrable important = un jalon, suivi en dérive vs baseline.

### Groupes (tâches parentes) repliés

La barre résumé d'un groupe replié = **l'union des blocs de tous ses descendants** : si le travail est espacé ou découpé, la barre résumé est **découpée pareil** — elle montre les jours réellement travaillés sur cette branche, pas une enveloppe pleine trompeuse.

**Rendu et avancement** :
- Les blocs sont reliés par une **liaison fine et estompée** (rectangle aminci, teinte du projet atténuée) qui matérialise le ruban complet, du début du premier bloc à la fin du dernier.
- Une **barre d'avancement** se superpose au ruban : son taux = **effort réalisé cumulé ÷ effort total** des sous-tâches, et elle remplit ce pourcentage de la **largeur calendaire totale** du ruban (liaisons comprises — elle peut donc se terminer « dans un trou », c'est voulu : c'est un indicateur de progression, pas un marqueur de date).
- Exemples : 4 tâches sur 3 jours avec recouvrement, 6 j-h au total dont 2 réalisés → barre à 33 %. Une tâche de 4 j coupée en deux blocs de 2 j séparés de 5 j, 2 j réalisés → ruban de 9 j, barre à 50 % qui s'arrête au milieu du jour 4,5 (dans l'espace).
- La même règle s'applique aux **tâches simples découpées** : avancement = % du ruban complet. Une seule règle de rendu, partout.

### Baseline (plan de référence)

- **Snapshot daté** du plan (blocs, efforts, jalons), figé à un instant clé (« Plan initial », « Replan de mars »).
- Plusieurs baselines possibles, une seule active pour la comparaison.
- Affichage : barres fantômes grises + indicateurs de dérive des jalons.

### Journal d'équipe

- Entrées datées, créées notamment à la **clôture d'une réunion** : résumé automatique des changements de la session (avancements, réaffectations, dispos modifiées, décalages appliqués) + note libre.
- C'est l'historique : « que s'est-il passé entre deux réunions ? »

---

## 3. Le moteur de calcul (core)

Fonctions pures TypeScript, zéro dépendance UI, testées à fond. Le moteur **calcule, vérifie et propose** — il n'applique jamais rien de lui-même.

### Calculs de base

- **Capacité quotidienne d'une affectation** = `% affecté × part projet(J) × présence(J)` — la présence venant du calendrier personnel (0 % si absent, férié ou jour non travaillé). En jours-homme/jour.
- **Mode effort** : la *position* d'un bloc est choisie (par l'utilisateur ou via une proposition), sa *longueur* découle du travail : le **dernier bloc** de la tâche absorbe le reste à faire — sa fin = la date à laquelle la somme des capacités a consommé le reste. Les blocs précédents ont des dates figées (c'est l'historique ou un découpage volontaire).
- **Mode fixed** : dates des blocs posées à la main ; affectations informatives.
- **Règle d'édition en direct** : le bloc/la tâche *en cours d'édition* se met à jour immédiatement (sa longueur s'étire/se contracte pendant la saisie) ; **tout le reste** (successeurs, autres tâches) ne bouge que via une proposition validée. « Ce que j'édite réagit ; le reste demande mon accord. »
- Groupes : agrégats calculés (union des blocs, somme des efforts, avancement pondéré).

### Conflits détectés (en continu)

| Conflit | Exemple |
|---|---|
| Lien violé | Tâche placée avant la fin de son prédécesseur |
| Surcharge projet | Pour une personne, un jour donné : Σ des % affectés aux tâches d'un projet > 100 % de sa part projet |
| Travail sans capacité | Bloc planifié un jour où l'affecté est absent (exception, férié, jour non travaillé) |
| Effort non casé | Reste à faire qui ne tient pas dans les blocs prévus |
| Deadline menacée | Fin planifiée > deadline |
| Jalon intenable | Date posée du jalon < date au plus tôt dérivée de ses liens |
| Tâche non affectée | Tâche en mode effort sans personne sur le bloc à venir |

Chaque conflit : badge sur la tâche + entrée dans le **panneau Conflits**, avec possibilité de l'**ignorer explicitement** (il passe en gris, reste consultable).

À part : le **sur-engagement** (charge totale d'une personne, tous projets cumulés, au-delà de 100 % de sa présence du jour) n'est **pas un conflit rouge** — il peut être voulu (heures supp, parts projet cumulant 110 %). Il est rendu visible dans la jauge (segment au-delà du trait 100 %) et listé en avertissement doux.

### Propositions (réordonnancement assisté)

Déclencheurs : modification du calendrier d'une ressource (absence, exception) ou d'une part projet, modification d'affectation, de reste à faire, de lien, déplacement/découpe d'un bloc, changement du calendrier global.

1. Le moteur calcule un **plan proposé** : placement au plus tôt respectant les liens et les capacités, en **découpant les blocs** autour des périodes sans capacité si nécessaire. Les tâches déjà commencées gardent leurs blocs passés intacts.
2. Affichage en surimpression (barres fantômes colorées) + **panneau Impacts** : liste des tâches décalées/découpées/étirées, jalons impactés (delta en jours), deadlines menacées.
3. L'utilisateur : **Tout appliquer** · appliquer tâche par tâche · déplacer à la main · ignorer. Chaque action recalcule — on itère jusqu'à un plan stable et sans conflit (ou avec conflits assumés).

### Chaîne contraignante d'un jalon

Sélectionner un jalon → l'outil surligne la chaîne de tâches et de liens qui détermine sa date au plus tôt (l'équivalent utile du « chemin critique », adapté aux liens faibles). C'est l'outil de réflexion long terme : « qu'est-ce qui empêche de livrer plus tôt ? »

### Aide à l'affectation

Au moment d'affecter un bloc : liste des ressources **triées par capacité libre** sur la fenêtre visée (jauge par personne), avec le texte **Prérequis** de la tâche affiché juste au-dessus. Tri et chiffres exacts, décision humaine.

---

## 4. Les deux modes — spécifications UI

### Mode Planification (onglet Gantt)

- **Gauche — tableau** : arborescence indentée (profondeur libre), colonnes : nom, projet, estim, effort, reste, affectés, début, fin, statut. Édition inline, plier/déplier, réordonner et ré-indenter par glisser-déposer.
- **Droite — timeline SVG** :
  - Barres découpées en **blocs** reliés par une liaison fine estompée, couleur du projet, **barre d'avancement superposée au ruban** (cf. §2), jalons en losanges, groupes en barres résumé *union* (découpées aussi, avec avancement cumulé).
  - Liens dessinés ; week-ends/fériés grisés ; ligne « aujourd'hui » ; zoom jour/semaine/mois/trimestre ; virtualisation (seules les lignes visibles sont rendues).
- **Interactions** : déplacer un bloc (drag), redimensionner (poignées, selon mode), **couper un bloc** (outil ciseaux / clic droit « couper ici »), fusionner deux blocs adjacents, tirer un lien depuis le bord **ou depuis un point précis** d'une barre (lien ancré), double-clic → panneau d'édition.
- **Panneau d'édition de tâche** (latéral, jamais de modale bloquante) : tous les champs, blocs listés avec leurs affectations, prérequis, liens, estim/effort/reste.
- **Filtre projets** (barre du haut) : un, plusieurs ou tous.
- **Histogramme de charge** : volet repliable sous le Gantt, une ligne par personne. Pour chaque jour, une **jauge empilée (stacked bar) avec un segment par projet, à la couleur du projet** : on lit d'un coup d'œil la répartition **et** le total. Trait de référence à 100 % = présence de la personne ce jour-là (jours d'absence grisés/hachurés) ; dépassement visible au-delà du trait ; surcharge projet en rouge.
- **Baseline** : bouton « Figer le plan », fantômes affichables.
- **Proposition** : quand elle existe, bandeau + fantômes + panneau Impacts (cf. §3).

### Mode Suivi (onglet Réunion)

Pensé pour être projeté en réunion d'équipe hebdo :
- Sélecteur de date (défaut : aujourd'hui), vue groupée **par personne** : tâches en cours (reste à faire / % éditables inline), en retard, démarrant cette semaine.
- **Réaffectation rapide** : changer qui travaille sur quoi en deux clics — l'outil clôt le bloc courant à aujourd'hui et crée le bloc suivant (l'historique reste). C'est l'action n°1 des réunions.
- **Calendrier & parts projet** : saisie rapide d'une absence (« Bob absent jeu-ven »), d'une demi-journée (50 %), ou d'un changement de part projet (« Alice passe à 80 % sur le portail en novembre ») → panneau Impacts immédiat.
- Actions rapides par tâche : ✓ terminé, ⚠ bloqué, + note datée.
- Bouton **« Clore la réunion »** → entrée de journal avec résumé automatique des changements de la session.

### Onglet Tableau de bord

Deux niveaux : une **vue d'ensemble**, et la **fiche projet** en un clic.

**Vue d'ensemble** :
- **Cartes projets avec voyants de santé** : jalons en dérive, deadlines dépassées, tâches bloquées, dépassement estim vendu vs effort prévu.
- **Jalons** (tous projets, filtrables) : date baseline vs actuelle, delta en jours, badge vert/orange/rouge.
- Courbe du reste à faire (un point par réunion close) — burndown simple.
- Alertes : conflits actifs, tâches non affectées, deadlines menacées, tâches bloquées.

**Fiche projet** (clic sur une carte) :
- Indicateurs détaillés : tâches bloquées (et par qui/quoi), écarts d'estimation par branche, jalons et leur dérive, avancement (effort réalisé / total).
- Notes libres du projet.
- Extensible en v2 (rentabilité, coûts).

La **gestion des projets** (créer, renommer, archiver, couleur) vit dans **Paramètres** — le tableau de bord consulte, il n'administre pas.

### Navigation

Onglets : **Gantt** · **Réunion** · **Tableau de bord** · **Équipe** (ressources, calendriers persos, parts projet) · **Paramètres** (calendrier global, fériés, projets).

---

## 5. Choix techniques

| Domaine | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript strict** | Fiabilité du modèle ; les erreurs se voient à la compilation. |
| UI | **React 18 + Vite** | Écosystème mature ; build statique simple. |
| État | **Zustand + Immer** | Store minimaliste, mutations immuables sûres. |
| Undo/redo | **zundo** (middleware Zustand) | Historique illimité, simple, éprouvé. |
| Rendu Gantt | **SVG custom** (aucune lib Gantt) | Indispensable ici : aucune lib du marché ne rend des tâches découpées en blocs, des groupes en union de blocs et des liens ancrés en cours de tâche. Contrôle total + virtualisation maison. |
| Dates | **date-fns** (locale fr) | Fonctions pures, léger. Dates en chaînes ISO `"YYYY-MM-DD"`. |
| Validation | **Zod** | Schéma validé à la lecture **et** l'écriture ; un fichier corrompu n'entre jamais en mémoire. |
| Styles | **Tailwind CSS v4** + design tokens custom | Productivité + identité visuelle propre. |
| i18n | Dictionnaire TS typé maison (`src/i18n/fr.ts`) | Français d'abord, anglais possible sans refactoring. |
| IDs | **nanoid** | Courts, sûrs. |
| Tests unitaires | **Vitest** | Cible : >90 % de couverture sur `core/`. |
| Tests E2E | **Playwright** (phase finale) | Parcours clés. |
| Qualité | ESLint + Prettier + TS strict (vérifications en local, pas de CI) | Filet permanent. |
| Déploiement | **Site 100 % statique** servi par un conteneur — Dockerfile + **docker-compose** (nginx) | Aucun backend ; un `docker compose up` sur le serveur et c'est en ligne. |

### Persistance & sécurité des données (la promesse n°1)

- **Format** : un fichier **JSON versionné** par équipe. Convention : `monequipe.crewgantt.json`.
- **Ouverture/sauvegarde** : **File System Access API** (Chrome/Edge) — lecture/écriture directe du fichier, comme un logiciel desktop. **Fallback** (Firefox/Safari) : import par sélection/glisser-déposer + export téléchargement. À noter : cette API exige un contexte sécurisé (HTTPS ou `localhost`) ; servie en HTTP simple sur le réseau, l'app bascule automatiquement sur le fallback.
- **Auto-save** : écriture après chaque modification (debounce ~2 s).
- **Sauvegarde de secours** : copie IndexedDB à chaque modification ; au démarrage, si plus récente que le fichier → proposition de restauration. **Un crash du navigateur ne perd jamais rien.**
- **Migrations** : champ `formatVersion`, migrations automatiques testées à chaque évolution du schéma.
- **Robustesse UI** : Error Boundary global — si l'UI plante, les données restent intactes, l'app propose de recharger.

### Format de fichier (exemple)

```json
{
  "formatVersion": 1,
  "app": "CrewGantt",
  "team": {
    "name": "Équipe Web",
    "calendar": { "workingDays": [1, 2, 3, 4, 5], "holidays": ["2026-11-11", "2026-12-25"] }
  },
  "projects": [
    { "id": "p-portail", "name": "Portail client", "color": "#4f8ef7", "archived": false },
    { "id": "p-interne", "name": "Outils internes", "color": "#7bc47f", "archived": false }
  ],
  "resources": [
    {
      "id": "r-alice",
      "name": "Alice",
      "kind": "person",
      "workingDays": [1, 2, 4, 5],
      "exceptions": [
        { "from": "2026-10-12", "to": "2026-10-16", "reason": "Congés" },
        { "from": "2026-11-06", "percent": 50, "reason": "Formation le matin" }
      ],
      "projectShares": [
        { "projectId": "p-portail", "from": "2026-09-01", "percent": 60 },
        { "projectId": "p-interne", "from": "2026-09-01", "percent": 40 },
        { "projectId": "p-portail", "from": "2026-11-01", "percent": 100 },
        { "projectId": "p-interne", "from": "2026-11-01", "percent": 0 }
      ]
    }
  ],
  "tasks": [
    {
      "id": "t-maq",
      "projectId": "p-portail",
      "parentId": "g-conception",
      "order": 1,
      "name": "Maquettes",
      "type": "task",
      "scheduling": "effort",
      "estimate": 8,
      "effort": 10,
      "remaining": 7,
      "status": "in_progress",
      "requirements": "UX confirmé · maquettes à valider client avant dev",
      "links": [
        { "on": "t-spec", "type": "after-progress", "progressDays": 2, "lag": 0 }
      ],
      "deadline": null,
      "blocks": [
        {
          "id": "b1", "from": "2026-09-08", "to": "2026-09-09",
          "assignments": [{ "resourceId": "r-bob", "units": 100 }]
        },
        {
          "id": "b2", "from": "2026-09-21", "to": null,
          "assignments": [{ "resourceId": "r-alice", "units": 80 }]
        }
      ],
      "notes": [{ "date": "2026-09-15", "text": "Reprise par Alice après le salon" }]
    },
    {
      "id": "m-v1",
      "projectId": "p-portail",
      "parentId": "g-conception",
      "order": 9,
      "name": "Livraison V1",
      "type": "milestone",
      "date": "2026-12-04",
      "links": [{ "on": "t-recette", "type": "after-end", "lag": 0 }]
    }
  ],
  "baselines": [
    {
      "id": "b-initial", "name": "Plan initial", "createdAt": "2026-09-01", "active": true,
      "tasks": { "t-maq": { "blocks": [{ "from": "2026-09-08", "to": "2026-09-19" }], "effort": 10 } },
      "milestones": { "m-v1": "2026-11-27" }
    }
  ],
  "journal": [
    {
      "date": "2026-09-15", "type": "meeting",
      "summary": ["Maquettes : reste 7 j-h (était 8)", "Maquettes : Bob → Alice (80 %) à partir du 21/09", "Alice : 0 % du 12 au 16/10"],
      "note": "Salon pro la semaine 38, équipe réduite."
    }
  ],
  "ui": { "zoom": "week", "projectFilter": null, "collapsed": ["g-conception"] }
}
```

> - `"to": null` sur le **dernier bloc** d'une tâche en mode effort = fin calculée (le bloc absorbe le reste à faire).
> - Les **affectations vivent dans les blocs** : l'historique « qui a fait quoi quand » est dans le fichier, lisible et diffable dans git.
> - `workingDays` : motif hebdomadaire de la ressource (1 = lundi ; ici « pas le mercredi »). `exceptions` : jours datés qui priment sur tout le reste — `percent` 0 = absent (défaut si omis), 50 = demi-journée, 100 = jour normalement chômé mais travaillé ; `to` omis = un seul jour.
> - `projectShares` : part du temps de la ressource dédiée à chaque projet, par périodes (la dernière entrée du tableau couvrant la date s'applique, projet par projet ; `to` omis = jusqu'à nouvel ordre). Absence d'entrée = 100 %. Le cumul peut être < ou > 100 %.
> - `units` = **% de la part projet** de la ressource pendant ce bloc (100 = tout son temps projet). L'UI affiche toujours l'équivalent concret en jours/semaine.

### Architecture du code

```
src/
  core/             # TS pur, ZÉRO import React/DOM — le cœur testé
    model/          #   types + schémas Zod + migrations
    calendar/       #   fériés, motifs hebdo, exceptions, présence(t), arithmétique de dates
    scheduler/      #   capacités, longueurs de blocs, agrégats groupes, chaîne d'un jalon
    conflicts/      #   détection des 7 familles de conflits
    propose/        #   moteur de proposition (placement, découpes)
    diff/           #   résumé des changements (journal de réunion)
  state/            # store Zustand, actions, undo/redo (zundo)
  io/               # load/save JSON, File System Access, autosave, backup IndexedDB
  i18n/             # fr.ts (dictionnaire typé), helper t()
  ui/
    app/            # shell, onglets, error boundary, filtre projets
    gantt/          # timeline SVG (blocs, liens ancrés, jalons, drag, coupe, zoom)
    table/          # tableau arborescent (édition inline)
    team/           # ressources : calendrier perso (motif + exceptions), parts projet (timelines)
    settings/       # paramètres : calendrier global, fériés, gestion des projets
    meeting/        # mode Réunion (avancements, réaffectations, clôture)
    dashboard/      # vue d'ensemble (cartes projets, jalons, burndown, alertes) + fiche projet
    proposal/       # bandeau proposition, panneau Impacts, panneau Conflits
    common/         # panneau latéral, inputs, jauges, tooltips…
  styles/           # tokens, thème
tests/              # fixtures d'équipes exemples (.crewgantt.json)
```

**Règle d'or : `core/` ne dépend de rien d'autre.** L'UI consomme le core, jamais l'inverse.

---

## 6. Plan d'action

Chaque phase se termine par : **tests verts + un fichier exemple qui s'ouvre, se manipule et se sauve sans erreur.**

### Phase 0 — Socle technique
- Init Vite + React + TS strict, ESLint/Prettier, Vitest (tout en local, pas de CI).
- Arborescence `core/ state/ io/ ui/`, design tokens, shell (onglets vides).
- Modèle de données complet + schémas Zod + fixtures.
- Store Zustand + undo/redo ; load/save JSON (File System Access + fallback) ; autosave + backup IndexedDB.
- **Sortie : on ouvre, modifie, sauve et restaure un fichier. Rien d'autre, mais c'est incassable.**

### Phase 1 — Moteur de calcul
- Calendrier global (fériés) + calendrier perso (motif hebdo, exceptions datées) + parts projet → capacité(ressource, projet, jour).
- Blocs : longueur du dernier bloc en mode effort ; agrégats des groupes (union).
- Liens 3 types (dont ancré « après N jours de travail ») + lag ; tri topologique + détection de cycles ; dates « au plus tôt ».
- Détection des 7 familles de conflits ; charge par ressource/jour.
- **Batterie de tests exhaustive — le gros du travail de cette phase.**
- **Sortie : le moteur calcule juste, vite, prouvé par les tests — avant le moindre pixel de Gantt.**

### Phase 2 — Gantt interactif
- Tableau arborescent : édition inline, plier/déplier, réordonner/indenter, profondeur libre.
- Timeline SVG : blocs + liaisons estompées, barres d'avancement sur ruban, groupes en union découpée avec avancement cumulé, jalons (y compris sur barres repliées), liens, grisés, ligne aujourd'hui, zoom 4 niveaux, virtualisation.
- Drag & drop : déplacer un bloc, redimensionner, **couper/fusionner**, créer des liens (dont ancrés).
- Panneau latéral d'édition ; filtre projets ; badges de conflits ; gestion des projets dans Paramètres (CRUD, couleurs — nécessaire au filtre).
- **Sortie : on planifie réellement, multi-projets, avec des tâches découpables.**

### Phase 3 — Équipe & affectations
- Écran Équipe : CRUD ressources, calendrier perso (motif hebdo + exceptions datées) et timelines de parts projet.
- Affectations par bloc (% de la part projet + équivalent j/sem affiché), jauges, **histogramme empilé par projet** (couleurs projet, trait 100 %, sur-engagement visible), surcharges projet.
- Aide à l'affectation (tri par capacité libre + prérequis affichés).
- **Sortie : on dispatche toute l'équipe et on voit qui est chargé, projet par projet.**

### Phase 4 — Propositions, impacts & baseline
- Moteur de proposition (placement au plus tôt, découpes autour des trous de capacité).
- Bandeau proposition + fantômes + panneau Impacts ; application totale/partielle ; panneau Conflits avec « ignorer ».
- Baselines (figer/afficher/comparer) ; dérive des jalons ; deadlines ; chaîne contraignante d'un jalon.
- **Sortie : le cycle « changement → proposition → validation » fonctionne de bout en bout.**

### Phase 5 — Mode Suivi
- Écran Réunion : vue par personne, mise à jour reste à faire/%, **réaffectation rapide** (clôture de bloc + nouveau bloc), absences et parts projet, notes.
- Clôture de réunion → journal automatique.
- Tableau de bord complet : cartes projets avec voyants de santé, jalons et dérive, burndown, alertes, écart estim/effort, fiche détaillée par projet.
- **Sortie : on anime une vraie réunion d'équipe avec l'outil, de bout en bout.**

### Phase 6 — Finitions
- Exports : PNG du Gantt, CSV des tâches.
- Raccourcis clavier, polish UI (animations sobres, états vides, fichier exemple d'accueil).
- Dockerfile + docker-compose (nginx servant le build statique) ; tests E2E Playwright ; perfs (500 tâches / 30 personnes fluides, recalcul < 50 ms).
- **Sortie : v1.0.**

### Pistes v2 (notées, pas engagées)
Export XML compatible autres outils Gantt · coûts/budgets et **rentabilité par projet** (fiche projet) · candidats structurés par tâche (« qui peut le faire » cliquable) · anglais · thème sombre · vue capacité prévisionnelle long terme par personne.

---

## 7. Hors périmètre v1

- Multi-utilisateur temps réel, serveur, comptes.
- Granularité inférieure à la journée.
- Coûts et budgets.
- Import/export MS Project.
- Mobile (l'app vise desktop/grand écran ; tableau de bord consultable sur tablette).
- Nivellement automatique : l'outil **signale et propose**, il ne décide jamais à la place du manager.
