# Base de connaissances — échanges agent ↔ Pascal (CrewGantt)

> **But.** Ce fichier capitalise nos conversations de conception : les concepts, les questions
> qu'on s'est posées, les explications des sujets complexes, les décisions prises (et les pistes
> écartées, avec leur raison), ainsi que **les exemples concrets** manipulés ensemble. Deux usages :
> (1) améliorer l'aide et la compréhension de l'outil ; (2) servir de référence avant un gros
> changement — savoir ce qu'on a déjà fait, essayé, rejeté, et pourquoi.
>
> **Comment l'alimenter** — voir la consigne dans `CLAUDE.md`. En résumé : après tout échange où
> l'on clarifie un concept, tranche un arbitrage de design, ou voit un exemple parlant, on y
> consigne le sujet, le raisonnement, la décision et l'exemple. À consulter avant tout changement
> structurant.
>
> **Sources** — synthèse des transcripts de sessions agent (répertoire projet de Claude Code).
> Périmètre : produit uniquement (les échanges sur l'usage de Claude Code ne sont pas inclus).
>
> **Dernière synthèse** : 2026-06-23 (couvre la genèse → Phase 8 → conflits/liens/propositions →
> renommage `.cgan` → fusion de blocs de proposition → ghosts de placement / conflit « non planifiée »).
>
> Documents liés : [GDD.md](GDD.md) (rationale de design profond), [conflicts.md](conflicts.md)
> (catalogue des conflits), [TODO.md](TODO.md).

---

## 1. Concepts & décisions de design

Pour chaque sujet : la **question**, l'**explication/raisonnement**, la **décision**, et un ou
plusieurs **exemples** concrets.

### 1.1 Le modèle « effort » vs « dates fixées »

**Question.** Faut-il un type de tâche, ou un réglage par bloc (début fixe/calculé × fin
fixe/durée/effort) ?

**Raisonnement.** Pascal a proposé de supprimer le « type de tâche » au profit d'un choix par
bloc (4 combinaisons par bord). Verdict : trop pour l'UI de cet outil — la plupart des
combinaisons sont subtiles, et « début calculé » exige une source ambiguë (prédécesseur ? bloc
précédent ?). La bonne nouvelle : l'intuition « blocs passés figés + vrai reste pour la suite »
est **déjà à moitié dans le moteur** (`resolveBlocks` : blocs fermés pris tels quels + un bloc
ouvert qui absorbe le reste).

**Décision.** On garde **deux types lisibles** (`scheduling: 'effort' | 'fixed'`), mais une tâche
effort peut porter des blocs figés passés + un bloc élastique. On a pioché le meilleur de l'idée
par-bloc (snap au prédécesseur en clic droit, blocs passés figés) **sans** les 4 combinaisons.

- **`effort`** : `remaining` (j-h) pilote la date de fin calculée du dernier bloc ouvert (`to: null`).
- **`fixed`** : les dates sont posées à la main ; « les dates, c'est moi qui les pose ».
- **Défaut d'un nouveau projet = `fixed` (« dates fixées à la main »)** — décidé après usage
  (les projets existants avec `defaultScheduling: 'effort'` restent inchangés).

Voir [GDD.md](GDD.md) pour le détail du moteur.

### 1.2 effort / réalisé / reste-à-faire / avancement — la redondance et sa résolution

**C'est le débat de conception le plus important du projet.** Il mérite d'être compris en entier.

**Question de départ (Pascal).** « Soit l'avancement ne sert pas et c'est indépendant, et alors à
quoi sert de distinguer effort prévu et reste à faire ? Soit l'avancement est utile, mais alors
c'était étrange que plus on augmente l'avancement, plus la date de fin diminuait. »

**Le vrai diagnostic.** Il y avait **trois** nombres autour de la même idée :
- `effort` = travail total prévu (j-h),
- `remaining` = travail restant (j-h), qui **pilote** la fin du bloc ouvert,
- `progress` = avancement 0..100 %, indépendant, purement visuel.

La redondance n'est **pas** entre effort et reste (légitimes : `effort` = le plan, `remaining` =
le live, leur écart = le **réalisé** `effort − remaining`). La vraie redondance, c'est
**`progress` vs (`effort − remaining`)** : deux façons de dire « à quel point c'est fait », toutes
deux maintenues à la main.

**La « bizarrerie » de la fin qui recule.** Quand on augmentait l'avancement et que la fin
reculait, ce n'était pas faux : **toute la barre se contractait, passé compris**. Le modèle
propre (ligne « aujourd'hui » / status date) : le **passé** est figé (l'histoire, ne bouge
jamais) ; le **futur** est un bloc élastique qui absorbe le `remaining`. Avancer = le reste baisse
= **seule la queue future se raccourcit**.

**La cause racine de la gêne UX (décalage souris ×1/×2).** Sur-contrainte : un même bord pilotait
deux grandeurs couplées (géométrie du bloc **et** reste). Solution = **découpler** : chaque
poignée pilote une seule grandeur orthogonale — l'**effort** pilote la géométrie (resize au bord,
1:1), le **reste** pilote uniquement le remplissage sombre (poignée interne qui repeint sans
redimensionner).

**Le tournant — les exemples de Pascal qui ont tout tranché :**
- **Ex1** : effort 5, réalisé ~2, on déclare « reste ~1 » → `réalisé + reste = 3 ≠ effort = 5`.
- **Ex2** : réalisé ~4, on monte l'effort 5→8 (exprès, pour comparer estim/réalisé en fin de
  projet), et séparément « reste 2 » + une nouvelle personne → encore `réalisé + reste ≠ effort`.

Ces exemples prouvent qu'on manipule **trois leviers indépendants** : l'effort prévu (référence
libre qu'on bump quand on veut), le reste à faire (saisi directement chaque réunion, pilote la
fin), les affectations (rejouées pour étaler le reste).

**La décision finale (proposée par Pascal, jugée meilleure que le plan de l'agent).** Séparer
deux dimensions qui n'ont rien à voir :
- Le **trio j-h** `Effort / Réalisé / Reste` : `réalisé = passé` (recalculé quand on touche au
  début si le bloc est commencé), `reste = futur`. Pour une tâche *fixed*, les trois sont des
  lectures **calculées** des dates (réalisé = date revue − début, reste = fin − date revue).
- L'**Avancement** = un **4ᵉ champ % stocké, indépendant, éditable partout** (panneau, colonne,
  encoche noire du Gantt), pour **les deux types**. Indépendant du réalisé/reste.

**Pourquoi c'est mieux :** (1) c'est plus **honnête** — « réalisé 5 j-h / 6 mais 20 % du travail
fait » sont deux dimensions différentes : la **consommation du budget** (j-h) et la **complétude
métier**. (2) Ça **simplifie le code** : plus de `taskProgress` qui se ramifie ; l'avancement est
un simple champ stocké, zéro branche.

**Lecture visuelle.** La barre porte **deux teintes = réalisé/reste** (dimension *temps*, split au
trait de revue) ; l'**encoche = avancement** (dimension *métier*). Si l'encoche est loin derrière
le split, on voit d'un coup d'œil « on crame le budget plus vite qu'on n'avance ».

**Détails actés :** passer une tâche en « terminé » met l'avancement à 100 % (et reste à 0) ;
l'avancement est documenté dans l'aide/infobulle comme indépendant, détournable pour la
« difficulté métier » ou la « complétude ».

> ⚠️ Limite assumée : l'outil n'a **pas de « réel » mesuré** (pas de suivi d'heures). La seule
> donnée qui fait foi pour la compa est `Effort` (ré-estimation) opposée à `Estim` (vendu) — donc
> la compa ne vaut que si on monte l'Effort quand ça dérape (cf. Ex2 : 5→8). L'outil ne peut pas
> inventer un dépassement qu'on ne lui déclare pas. C'est un outil de **planification**, pas de
> suivi fin du qui-a-fait-quoi.

### 1.3 Blocs de travail

**Concept.** Une tâche n'est **pas** une barre continue : c'est une séquence de **blocs datés**
`{from, to, assignments}` ; les **gaps sont réels**. Chaque bloc porte ses propres affectations →
c'est ainsi que l'historique (« qui a fait quoi, quand ») est enregistré. Réassigner en milieu de
tâche = fermer le bloc courant + ouvrir un nouveau bloc.

**Décision sur le changement d'affectation (réunion).** Pas d'historique fin (distinguer « modif
voulue » vs « correction » est ingérable, et « le passé est approximatif »). Par défaut, le
changement d'équipe **remplace** simplement l'équipe du bloc (surtout le futur). Pour figer un
segment passé, le **split est opt-in** : case **« Scinder en 2 blocs » décochée par défaut** dans
l'écran d'affectation. Le réalisé n'est jamais réécrit.

### 1.4 Passé / futur, ligne « date de réunion » (reviewDate), teintes clair/sombre

**Concept.** La frontière passé/futur n'est pas figée à « aujourd'hui » : c'est la **date de
réunion** (`reviewDate`, dans le store, **hors fichier**). Le plus souvent = aujourd'hui, mais
modifiable en réunion → devient le nouvel « aujourd'hui ».

**Décisions :**
- Un **trait vertical rouge** « date réunion » (variante du trait « aujourd'hui ») avec infobulle,
  affiché **seulement** quand une réunion est ouverte à une date ≠ aujourd'hui. **Aucune donnée
  mutée** — la barre est rendue en deux teintes, le trait ne découpe aucun bloc.
- **Bouton « Revenir à aujourd'hui »** dans l'onglet Réunion ; la **clôture de réunion remet la
  date du jour** (le trait rouge disparaît).
- **Deux teintes pour les deux types** (effort *et* fixed, par cohérence). La teinte claire
  (réalisé/passé) doit être **proche** de la sombre (l'écart ne saute aux yeux que sur les tâches
  en cours). Opacité passé calée à **0.6** (essais : 0.28 trop contrasté, 0.7 puis ramené à 0.6).
- Point d'implémentation tranché : avancer la date de réunion **mute le `remaining`** de toutes
  les tâches effort en cours (une entrée undo) — condition pour que le reste « diminue tout
  seul » visuellement. À surveiller si trop intrusif dans le journal de réunion.

### 1.5 Liens = contraintes faibles « au plus tôt » (jamais des aimants)

**Concept.** Un lien est une contrainte **faible** : démarrer **après** le point autorisé est OK ;
seul démarrer **avant** est un conflit. Jamais un aimant qui déplace tout seul. Types :
`after-end`, `with-start`, `after-progress`.

**Cas important (tâche en cours).** Le vrai début est **épinglé dans le passé** — le réalisé est
du travail fait, un calcul futur ne doit pas l'effacer. Un lien violé sur une tâche commencée
devient un **conflit signalé** (« le prédécesseur démarre après une tâche déjà commencée »), pas un
déplacement silencieux.

**Nomenclature d'infobulle (compacte).** `F`/`D`/`P` (Fin/Début/Progress) + chiffre de décalage,
**sans zéro** : `FD` = fin→début +0, `F1D3` = fin+1j→début+3j, `DD1` = début+0→début+1j.
L'infobulle montre aussi le **groupe parent** du prédécesseur. Documenté dans l'aide (section s6).

**UX de création du lien « vers N j » (règle par-extrémité, pilotée par Shift) :**
- Départ **avec Shift** → ancre prédécesseur « après N j » ; sans Shift (poignée de lien) → « après
  la fin du prédécesseur ».
- Arrivée **avec Shift** (au point de drop) → ancre successeur « vers N j » ; sans Shift → « au
  début du successeur ».
- Tenir Shift du début à la fin = les deux ancres. (Le curseur passe en crosshair quand Shift est
  tenu.) C'était la pièce manquante : le **point de drop sur la barre cible** n'était pas câblé.

**Interactivité (Gantt).** Le `LinksLayer` doit être rendu **après** les `RowBars` (sinon le rect
de hit capte les events en premier). Zone de survol = le **segment vertical** (+ trait horizontal,
tronqué à 10px de l'ancre du successeur, ignoré si <10px). Deux boutons de part et d'autre du
trait : **×** (supprimer) et **→** (re-cibler, action atomique `relinkSuccessor` = 1 seul Ctrl+Z).

### 1.6 Conflits : détection, sur-/sous-engagement, affichage

**Concept.** Le moteur détecte des familles de conflits (voir le catalogue complet dans
[conflicts.md](conflicts.md) — 9 types : 7 conflits + sur-engagement + cycle). 1 conflit = 1 fait
atomique, ignorable indépendamment.

**Surcharge & sur-engagement (la « bande orange »).** Le `project-overload` (>100 % sur un projet)
ne devait **pas** être éclaté en N conflits par tâche (ça contaminerait le panneau). Décision :
une **fine bande de 2px** (`var(--color-warn)`) sur le bord supérieur des barres, jour par jour,
pour le futur uniquement — pour la surcharge intra-projet **et** le sur-engagement cross-projets.
Distincte des **hachures diagonales** (déjà utilisées pour « tâche annulée ») et de la bordure
rouge des conflits. L'infobulle annote la ressource surchargée (« surchargée les jours du trait
orange »).

**Piste écartée — « sous-engagement » sur tâche fixe.** Pascal a exploré un conflit « quelqu'un
n'aura pas le temps » (cas C : 30 % sur le projet, tâche trop courte). Conclusion commune : les
tâches *fixed* **n'ont pas de notion d'effort**, donc rien à mesurer comme « insuffisant ». Les
seuls cas réels sont les absences (`no-capacity`) et la surcharge (bande orange). **Point
abandonné** faute d'exemple cohérent.

**Cycle.** Bandeau rouge en tête du `ConflictsPanel` si `schedule.cycle !== null` (cas rare,
protège contre les fichiers édités à la main).

### 1.7 Propositions : « l'outil propose, l'humain dispose »

**Principe fondateur (depuis le GDD).** Le moteur calcule, valide et **propose** ; il ne mute
jamais l'état lui-même. Les changements surgissent comme un **plan proposé** (overlay) que
l'utilisateur applique (tout / par tâche) ou ignore.

**Comment le moteur propose (explications clés) :**
- `proposePlan` parcourt les tâches en **ordre topologique** et patche la hiérarchie en temps réel
  (cascade A→B→jalon correcte). C'est **une seule passe cohérente**, **pas un solveur complet** —
  le plan proposé **peut contenir des conflits assumés** (deadlines impossibles à résoudre en
  poussant ; `project-overload` non nivelé entre tâches parallèles).
- **Tâches `fixed`** : exclues des propositions de **capacité** (découpe autour d'absence, effort
  qui déborde) — c'est le domaine du choix manuel. **MAIS** une **violation de lien**
  (`link-violated`) n'est pas un problème de capacité, c'est une incohérence d'ordonnancement →
  on génère **une proposition même pour les fixed**, mais **uniquement** une **translation** vers
  `earliest` (forme préservée : durées + intervalles), avec **jour de départ rendu travaillable**
  (premier jour ≥ earliest où ≥1 affecté est dispo). On ne re-découpe pas les blocs autour
  d'absences internes. (Précédent existant : les jalons sont déjà déplacés vers `earliest`.)
- **Application par tâche** : la proposition suppose tout l'amont appliqué. Appliquer A sans B peut
  rendre B `link-violated` transitoirement — voulu : chaque application recompute et **une nouvelle
  proposition** apparaît, on itère jusqu'à stabilité. C'est le cœur du « propose / dispose ».
- Chaque `TaskChange` porte une **raison** (`reason`) affichée dans le panneau Impacts
  (« raison : lien violé / cascade depuis / effort non casé »).
- **Fusion de blocs (fix récent).** Quand un bloc effort est à cheval sur « today », `placeTask`
  produisait deux blocs adjacents collés (passé tronqué à hier + run démarrant aujourd'hui). Une
  étape de fusion post-matérialisation réunit tout bloc où `prev.to + 1j == next.from` et
  affectations identiques → un seul bloc.

**UX de l'overlay (`ProposalGhost`).** Doit être rendu **après** les `RowBars`. Zone de survol
restreinte à la bande haute (pour libérer la barre réelle) ; pour un **jalon**, la zone = le
**losange**. Bouton **✓** collé à la barre (déclenché sur `onPointerDown`, pas `onClick` — voir
piège ci-dessous). Le label « +X j » est **au-dessus** de la barre (décalé +3px pour ne pas être
masqué par le trait de revue) ; pas de « +X j » quand la proposition est un découpage en blocs (le
découpage est visuellement évident). Clic sur la proposition → ouvre le plan proposé filtré sur la
tâche.

> 🐛 **Piège récurrent (pointer capture).** `onRootPointerDown` appelle `setPointerCapture` sur le
> SVG racine, ce qui **détourne le `click` suivant** vers la racine (`onAreaClick` → `closePanel`).
> Conséquence : tout handler basé sur `onClick` dans un overlay ne se déclenche jamais. **Solution :
> faire réagir ces handlers sur `onPointerDown` avec `stopPropagation`** (c'est pourquoi ✓, ×, et le
> clic-proposition fonctionnent sur pointerdown).

### 1.8 Groupes

- **Crochets de barre de groupe** : `rx=0`, un crochet par intervalle, `fill=border`. Sujet à un
  long polissage pixel (forme du triangle, décalage 1px, dégradé/couture visible sur le bord) — on
  ne doit pas distinguer un triangle, juste un crochet net.
- **Créer un groupe englobant** : depuis la liste **et** le clic droit du Gantt, sur la sélection
  **ou** la seule ligne sous le curseur (≥1 ligne). Après création → **focus sur le nom** pour
  renommer (`setEditingTaskId`).
- **Dégrouper** (`dissolveGroup`) : entrée de menu inverse — enlève le groupe et décale les tâches
  contenues.
- **Groupe à jalons seuls** : il ne faut pas masquer (nom + losanges) quand il n'y a pas de barre
  (lever le `return null`).
- **Nom de groupe en double** : `cellText('group')` renvoie le nom du **parent** (et `''` pour un
  groupe), sinon le nom apparaît deux fois si « tâche » et « groupe » sont cochés.
- **Infobulle propre / sous-arbre / total** : étendue aux **groupes** et tâches **fixed**, + ligne
  récap dans le TaskPanel pour la rendre trouvable.

### 1.9 Jalons (losanges)

- Rendu en **losange** ; la **zone de survol / hit doit être le losange** (bbox `cy-8 → cy+8`), pas
  seulement une bande en haut — y compris pour l'infobulle (qui ne s'affichait que sur les bords du
  losange) et pour l'overlay de proposition.
- Hauteur de ligne des jalons : optimisée pour qu'ils se touchent presque (attention au texte
  tronqué).

### 1.10 Tâches à 0 j, resize début/fin, sémantique du déplacement

- Une tâche peut être ramenée à **0 j**. Marqueur visuel court (`xStart + 5`), pas une journée
  entière → la **poignée de création de lien** doit se caler sur le bord droit **visuel**
  (`xStart + 5` à 0 j, `xEnd` sinon), sinon elle est rejetée d'une largeur de jour.
- Une proposition sur une tâche à 0 j ne doit pas la repasser à 1 j (bug corrigé).
- **Resize du début (tâche effort)** : historiquement un bug (ça ne faisait que translater alors
  que l'infobulle « Reste » annonçait un changement). Sémantique voulue : tirer le **début** garde
  la fin et **ajuste le reste** (vers la gauche → plus de reste/plus long ; vers la droite → moins ;
  croiser la fin → 0 j). Glisser le **corps** de la barre = translation. Dans le modèle final
  (§1.2) : resize du début **avant** que le bloc commence = modifie le reste ; **après** qu'il a
  commencé = recalcule le réalisé (passé).

### 1.11 Charge / plan de charge

- Vue **charge par personne** (d'où le terme « Charge » réservé, ce qui a fait choisir **« Effort »**
  plutôt que « Charge » pour le total — cf. §3).
- Disponibilité à **2 étages** (et non 3, cf. §1.12 du GDD) : capacité = `présence(J) × part projet
  % × affectation %`.
- Double-clic dans la zone de charge ajouté comme geste rapide.

### 1.12 Format fichier `.cgan`, interop, exports

- Le fichier **`.cgan`** *est* une équipe (`monequipe.cgan`). Anciennement `.crewgantt.json`,
  **renommé en `.cgan`** (extension libre, non utilisée par un outil connu). Le namespace interne
  (`DB_NAME='crewgantt'`, `text/crewgantt-task`, localStorage `crewgantt.ui.*`) n'a **pas** été
  touché — seule l'extension fichier visible change.
- Persistance : File System Access API (écriture directe) + fallback `<input>`/download ; autosave +
  backup IndexedDB. Chaque lecture/écriture est validée Zod et migrée. **Zéro perte de données** est
  une exigence dure.
- Interop **GanttProject `.gan`** (import/export) ; exports **CSV** (tâches) et **PNG** (Gantt),
  regroupés dans le bouton « import/export » global (imports en premier, séparateur, exports après).

### 1.13 L'aide intégrée

- Modal d'aide à plusieurs onglets : **« Prise en main »** (guide) et **« Planification tâches »**
  (le modèle effort/dates), plus une **légende** des gestes/raccourcis (`LEGEND_KEYS`).
- Schémas **Mermaid** + croquis SVG maison (`EffortSketch`, `GestureSketch`, mini-Gantt) pour
  rendre le modèle clair. Leçons de polissage : taille de police lisible (aligner sur la section qui
  rend bien) ; mettre **deux Mermaid côte à côte** plutôt qu'empilés quand ils sont petits.
- Exemple pédagogique retenu : **« 2 personnes à 50 % = 4 jours »** (faire comprendre que la durée
  dépend aussi du %age de temps). Légende de la barre : « Coins carrés = Dates fixées ».
- Sections documentées au fil de l'eau : nomenclature des liens (s6), gestes non-évidents (ancre
  Shift au départ **et** au drop, « sous-tâche à partir d'ici », « groupe englobant / dégrouper »,
  « scinder »), trait orange, indépendance de l'avancement.

### 1.14 Ghosts de placement (tâche/jalon non planifié)

**Question.** Quand on crée une tâche, faut-il poser un bloc d'emblée (où ? 0 j / 1 j ?) ou le
double-clic suffit-il ? Aujourd'hui une tâche naît avec `blocks: []` (jalon : `date: null`) →
**invisible** sur le Gantt, donc facile à oublier.

**Options pesées** (cf. discussion) : (A) ne rien poser mais rendre la ligne visible via un fantôme ;
(B) bloc auto 1 j à aujourd'hui ; (C) bloc auto après la précédente ; (D) bloc 0 j. **Décision : un
mélange A+B+E.** La tâche reste sans bloc (pas de date prématurée) mais devient un objet **visible et
manipulable** : des **ghosts de placement** s'affichent sur sa ligne, et l'état « non planifiée »
**devient un conflit** (ignorable) pour ne pas l'oublier.

**Design retenu :**
- **Deux ancres** (dédoublonnées si même jour) : **« Maintenant »** (aujourd'hui ouvré, 1 j) et
  **« Continuité »** (ex-E) — calée sur la fratrie : début de la sœur précédente (tâche/groupe), date
  d'un jalon, sinon début du groupe parent, sinon aujourd'hui. Pour un **jalon** : la **fin** au lieu du
  début (un jalon marque souvent l'achèvement de ce qui précède). Implémentée pure dans
  `src/core/scheduler/placement.ts` (`placementAnchors`). **L'ancre « C » (après la fin de la précédente)
  a été abandonnée** : redondante avec le geste « tirer un lien vers le ghost », et Pascal préfère un
  ghost proche qu'on relie ensuite. *(On avait un temps envisagé d'ignorer une continuité ≤ aujourd'hui —
  finalement non : on la garde même dans le passé.)*
- **Type conservé, jamais muté par un geste.** Le ghost est dessiné selon le `scheduling` réel de la
  tâche (hérité du projet, modifiable avant planif) : arrondi = effort, carré = fixed. Resize agit
  *selon* ce type (effort → effort/reste ; fixed → dates). Raison (tranchée par Pascal) : afficher un
  type au survol puis le changer au resize serait incohérent ; et le type existe déjà à la création.
- **Anti-bruit** : seules la **ligne active** (sélectionnée/survolée) montre ses ghosts complets ;
  sinon un **marqueur fantôme rouge** (couleur conflit, yeux blancs évidés) **épinglé au bord gauche
  visible** (hors axe temps → insensible au scroll horizontal ; pas besoin de doubler les marqueurs).
  **Clic sur le fantôme** → ouvre le panneau Conflits filtré sur la tâche (comme le badge rouge de la liste).
- **Survol** d'un ghost → aperçu plein de la vraie tâche + **l'autre ghost disparaît** (lisibilité).
- **Gestes directs sur le ghost** (tous matérialisent puis enchaînent, en réutilisant le système de
  drag des barres réelles — le bloc créé est un vrai bloc d'1 jour à l'ancre) :
  - **clic** (corps, sans déplacement) = valide à 1 j à l'ancre (`materializeTaskAt`) ;
  - **déplacer** le corps = matérialise puis pose à l'endroit lâché ;
  - **étirer** un bord = matérialise puis redimensionne (effort → ajuste le reste ; fixed → les dates) ;
  - **poignée de lien** du ghost = matérialise puis tire un lien (ghost = prédécesseur) ;
  - **lien déposé *sur* un ghost** = le matérialise calé juste après la fin du prédécesseur (sinon
    aujourd'hui), puis pose le lien → « le lien le positionne correctement ».
  - ⚠️ Piège : le ghost disparaît dès la matérialisation → la **capture de pointeur** est posée sur le
    **SVG racine** (persistant), pas sur l'élément ghost (qui est retiré du DOM).

**Exemple.** Je crée 5 tâches dans la liste (préparation), chacune affiche un fantôme rouge à gauche +
un conflit « non planifiée ». Je sélectionne la 1ʳᵉ → 2 ghosts (aujourd'hui / dans la continuité) ;
je survole « Continuité » → il devient l'aperçu de la barre, l'autre s'efface ; je clique → barre 1 j
posée, le conflit disparaît.

---

## 2. Journal chronologique des rounds

> Frise volontairement légère — le « pourquoi » détaillé est en §1. Les bornes exactes de certains
> rounds sont approximatives.

- **Genèse (GDD).** Recherche des outils du domaine (GanttProject, ProjectLibre, MS Project,
  TeamGantt…) → idées à retenir/éviter. Rédaction du [GDD.md](GDD.md). Décisions structurantes :
  suppression du **% de dispo globale** au profit d'un **calendrier personnel** (jours travaillés +
  exceptions datées, « maintenance paresseuse »), **fusion Tableau de bord / Projets** (5 onglets),
  **Docker** au lieu de PWA, et le principe **« l'outil propose, l'humain dispose »**. Stack : React
  18 + TS strict + Vite, Zustand/Immer/zundo, SVG custom, Zod, Tailwind v4.
- **Rounds 1 → 8 (refonte UX du Gantt après v1.0).** Longue série de lots de feedback testés en
  conditions réelles : gestes et curseurs de resize, **crochets de groupe** (polissage pixel
  récurrent), avatars en Réunion, alignement des colonnes, repli avant/après, **drag d'avancement**,
  z-order de la baseline, **filtres**, boutons **Insert**, taille de police, **import/export `.gan`**,
  double-clic = nouveau bloc, gestion de l'effort (plusieurs passes de bugs). R6 a basculé sur
  `claude-sonnet` un temps. (Round 4 livré ~2026-06-13.)
- **Phase 8 — refonte du modèle effort.** Découplage effort/reste, `progress` rendu dérivé, trait
  rouge de réunion, barres deux teintes, sliders d'affectation (avatar = poignée), snap au
  prédécesseur. **Puis volte-face** (cf. §1.2 et §3) : l'avancement **redevient un champ stocké
  indépendant** pour les deux types, ajout de la **colonne « Réalisé »**, split d'affectation
  opt-in, trait de réunion persistant + bouton retour + clôture qui remet aujourd'hui.
- **Conflits & propositions.** Bande orange (surcharge / sur-engagement), **raison** dans le panneau
  Impacts, bandeau cycle, catalogue [conflicts.md](conflicts.md). Propositions rendues
  **interactives** dans le Gantt (✓ par tâche, clic → plan filtré). Extension des propositions aux
  tâches **fixed** sur `link-violated` uniquement.
- **Liens interactifs & groupes.** Liens cliquables (survol, supprimer, re-cibler atomique,
  infobulle compacte FD/F1D3/DD1), CTRL+drag de groupe, **dégrouper**, focus du nom à la création,
  groupes à jalons seuls, tâches à 0 j.
- **Outillage & récents.** `docs/` → **`plans/`** (GDD.md, conflicts.md, TODO.md). Boutons
  d'insertion au survol de la liste + modificateurs CTRL/SHIFT. Renommage **`.crewgantt.json` →
  `.cgan`**. Fix proposition : **fusion des blocs adjacents** issus du découpage à cheval sur today.

---

## 3. Débats & arbitrages notables

Format : décision retenue ↔ option(s) écartée(s) ↔ raison.

- **Avancement = champ stocké indépendant** ↔ *avancement dérivé `(effort−reste)/effort`* ↔ plus
  honnête (budget j-h ≠ complétude métier : « 5 j-h / 6 consommés mais 20 % fait ») **et** plus
  simple à coder (zéro branche). C'est l'arbitrage central — voir §1.2.
- **Deux types `effort`/`fixed`** ↔ *choix par bloc (4 combinaisons par bord)* ↔ trop pour l'UI,
  « début calculé » ambigu ; l'essentiel de l'idée par-bloc est récupéré sans la complexité.
- **Défaut « dates fixées » pour un nouveau projet** ↔ *effort par défaut* ↔ plus prévisible pour la
  prise en main (les projets effort existants restent inchangés).
- **Split d'affectation opt-in (décoché)** ↔ *split systématique au trait de revue* ↔ ne pas
  découper sans le vouloir ; remplacement simple de l'équipe par défaut.
- **Pas d'historique fin du qui-a-fait-quoi** ↔ *suivi par bloc/personne du réalisé* ↔ « le passé est
  approximatif, c'est un outil de planification » ; le réalisé = un simple scalaire `effort − reste`.
- **Nom « Effort »** ↔ *« Charge »* (idiome PM français) ↔ « Charge » déjà pris par le panneau
  « Charge par personne » ; trio lisible **Estim ↔ Effort ↔ Reste**.
- **Propositions pour tâches fixed sur `link-violated` seulement** ↔ *aucune proposition fixed* /
  *propositions de capacité aussi* ↔ une violation de lien est une incohérence d'ordonnancement (pas
  de capacité) ; la capacité reste le domaine du choix manuel.
- **Bande orange 2px** ↔ *N conflits par tâche pour la surcharge* / *hachures* ↔ ne pas contaminer le
  panneau (1 conflit = 1 fait atomique) ; hachures déjà prises par « annulé ».
- **Trait de réunion = repère visuel, ne découpe rien** ↔ *créer des blocs à la date de réunion* ↔
  éviter de muter les données ; tout le passé/futur se lit par rapport au trait.
- **Opacité passé 0.6** ↔ *0.28 (trop contrasté)* / *0.7* ↔ la différence ne doit ressortir que sur
  les tâches en cours.
- **Menu « changer affectation » direct (sans sous-menu), en 1er** ↔ *sous-menu* ↔ revirement après
  essai : moins bien avec un sous-menu.
- **Ghosts de placement (tâche non planifiée = conflit + fantômes manipulables)** ↔ *bloc auto 1 j à la
  création* / *bloc 0 j* / *statu quo (invisible)* ↔ pas de date prématurée mais plus d'oubli ;
  2 ancres « Maintenant »/« Continuité » (ancre « après la précédente » abandonnée car redondante avec
  le lien). Type de la tâche **conservé** (pas muté par le geste de resize). Voir §1.14.

---

## 4. Glossaire

| Terme | Sens |
|---|---|
| **Effort** | Travail total prévu d'une tâche en j-h (référence libre, ajustable). Pour une *fixed*, calculé entre les deux dates. |
| **Réalisé** | Passé = `effort − reste` (effort) ou `date revue − début` (fixed). Pas un « réel » mesuré. |
| **Reste (remaining)** | Travail restant en j-h ; pilote la fin du bloc ouvert d'une tâche effort. |
| **Avancement (progress)** | % stocké **indépendant** (0..1), complétude métier ; éditable partout, distinct du réalisé/reste. |
| **Bloc** | Tranche datée `{from, to, assignments}` d'une tâche ; les gaps sont réels ; porte l'histo des affectations. |
| **Span** | Étendue résolue d'une tâche (issue de `computeSchedule`). |
| **scheduling** | `'effort'` (le reste pilote la fin) ou `'fixed'` (dates posées à la main). |
| **reviewDate** | Date de réunion (store, hors fichier) = frontière passé/futur ; trait rouge si ≠ aujourd'hui. |
| **Lien** | Contrainte faible « au plus tôt » (`after-end` / `with-start` / `after-progress`) ; jamais un aimant. |
| **earliest(Start)** | Premier départ légal d'une tâche selon ses liens ; base des propositions et de la détection de violation. |
| **Proposition / plan proposé** | Re-ordonnancement calculé par le moteur, appliqué par l'humain (tout / par tâche) ou ignoré. |
| **Estim** | Estimation « vendue » initiale, opposée à Effort pour mesurer la dérive. |
| **Bande orange** | Marqueur 2px de surcharge projet / sur-engagement cross-projets (jours futurs). |
| **`.cgan`** | Extension du fichier d'équipe (ex-`.crewgantt.json`). Un fichier = une équipe. |
