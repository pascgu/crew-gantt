---
name: app-icon-designer
description: Design, create, or redo an app icon, favicon, or logo pictogram for a web app (PWA/favicon) or a native executable (Windows/Tauri/Electron, macOS, Linux). Use whenever the user asks to design an app icon, create/redo a favicon, make a logo for the app, or improve how the app looks in the taskbar/browser tab/dock. Also use when asked to regenerate or resize existing app icons, or to fix a blurry/illegible small icon (16x16/32x32).
---

# App icon designer

Conçoit une icône d'application ancrée dans les vrais points forts et les vraies couleurs du
projet, valide sa lisibilité à toutes les tailles utiles (avec une attention particulière au petit
format, souvent le maillon faible), et produit les fichiers sources + une page de comparaison pour
validation par l'utilisateur. Ne touche **aucun fichier de production** — s'arrête une fois le
design et les tailles validés (l'intégration dans l'appli est un travail agentique classique après
coup, trop spécifique par projet pour être générique).

Ce skill vient avec son propre outillage (`sharp`, `png-to-ico`) dans `scripts/` — il fonctionne
même sur un projet non-Node, puisqu'il ne dépend de rien du projet cible pour tourner.

**Avant tout usage** : si `node_modules/` n'existe pas dans le dossier de ce skill, lancer
`npm install` une fois dans ce dossier (persiste ensuite pour tous les projets).

## Workflow

### 1. Repérer le contexte
Icône existante dans le projet cible ? Palette/design tokens réels (variables CSS, constantes de
couleur, palette de projets/avatars/statuts...) ? Stack (Node disponible ? Vite PWA ? Tauri ?
Electron ? site statique ?). Chercher activement les vraies couleurs déjà utilisées dans l'UI —
elles sont la meilleure source pour l'icône, largement préférables à des couleurs inventées.

### 2. Critiquer l'existant, puis interviewer l'utilisateur
S'il y a une icône actuelle, la critiquer honnêtement (générique ? juste un monogramme texte ?
ne dit rien du produit ? tient mal en petit format ?). Puis poser les questions, ne pas deviner :
quels sont les 1-3 points forts différenciants de l'appli à représenter (ce qui la distingue des
outils concurrents) ? un thème/ambiance en tête ? des contraintes de marque à respecter ?

### 3. Proposer des variantes en texte d'abord
Jamais un visuel en premier jet. Décrire 3-5 concepts nommés, ancrés dans les vrais
différenciateurs et les vraies couleurs identifiées à l'étape 1, avec leurs compromis (y compris
la lisibilité en petit format — l'anticiper dès cette étape, pas après coup). Laisser l'utilisateur
choisir une direction avant de dessiner quoi que ce soit.

### 4. Demander les plateformes cibles
Web/PWA ? Windows natif ? macOS ? Linux ? Mobile (Android/iOS via Tauri/Capacitor) ? En déduire les
tailles/formats utiles via `references/size-presets.md` — ne pas générer par défaut des formats non
demandés.

### 5. Construire le SVG maître et itérer en grand format
SVG à une taille de référence (512 en général), ancré sur les tokens réels choisis. Rendre à
quelques tailles avec `node scripts/render.mjs <svg> --sizes 512,192,64,32 --out <scratchpad>` et
montrer les rendus à l'utilisateur pour itérer (couleurs, proportions, formes).

**Jamais publier via un outil d'artifact/hébergement pour cette boucle locale.** Toujours écrire les
fichiers en local (scratchpad du projet cible) et donner le chemin à l'utilisateur pour qu'il ouvre
lui-même — sauf s'il demande explicitement de partager/publier. C'est une préférence forte
rencontrée en pratique : certains utilisateurs ne veulent rien envoyer vers un hébergement tiers
pour une simple relecture d'image.

### 6. Retouche dédiée du plus petit format
Dès que le rendu redimensionné du SVG devient flou à une taille donnée (typiquement 16×16, parfois
32×32) — **jamais accepter un simple resize à cette taille**. Construire une version pixel par
pixel avec `scripts/pixel-icon.mjs` (voir `references/pixel-art-techniques.md` pour la méthode
complète : coins adoucis, poignées en retrait, marges minimales, prévisualisation en `nearest`).

Boucle de feedback concrète et itérative avec l'utilisateur ("décale X d'1px", "assombris Y",
"enlève la marge ici") — prévoir plusieurs allers-retours, ce n'est presque jamais bon du premier
coup. Vérifier chaque itération au format natif réel (pas seulement l'aperçu zoomé) avant de la
proposer — un détail correct zoomé peut disparaître en vrai à 16px.

### 7. Reporter les proportions du petit format vers les grands formats
Une fois le petit format validé, reporter sa grille (mise à l'échelle des mêmes coordonnées) vers
le SVG maître et les autres tailles — jamais l'inverse. Le petit format est la contrainte la plus
dure ; en hériter garantit la cohérence visuelle à toutes les tailles plutôt que de redécouvrir les
mêmes problèmes de lisibilité après coup.

### 8. Construire la page de comparaison
Copier `assets/compare-template.html` dans le scratchpad du projet cible, l'adapter (titre, jeu de
tailles réellement généré, légende sémantique des couleurs/formes) puis injecter les images avec :
```
node scripts/inject-images.mjs <template> <sortie.html> SIZE_512=fichier512.png SIZE_32=fichier32.png ...
```
Fichier local unique, auto-suffisant (images en base64), sur fonds clair/sombre, avec un détail
zoomé du plus petit format. Donner le chemin à l'utilisateur, ne pas publier (cf. étape 5).

### 9. Clôturer
Une fois le design validé, s'arrêter là — ne pas modifier les fichiers de production du projet
cible dans le cadre de ce skill (manifest, index.html, config Tauri/Electron...). Avant de
terminer, rappeler explicitement à l'utilisateur d'ajouter une note dans le CLAUDE.md/AGENTS.md (ou
équivalent) du projet cible décrivant : l'emplacement de la ou les sources maîtresses (SVG + PNG
retouché à la main s'il y en a un), la commande de régénération, et la consigne de ré-invoquer ce
skill pour toute refonte future — pour que la prochaine session (celle qui fera l'intégration, ou
une future refonte) sache quoi faire sans redécouvrir la méthode.

## Outils fournis

- `scripts/render.mjs` — SVG → PNG à N tailles (sharp).
- `scripts/pixel-icon.mjs` — construction d'icônes pixel par pixel (grille, mélange de couleurs,
  adoucissement de coins, poignées en retrait, export PNG, aperçu `nearest`).
- `scripts/build-ico.mjs` — assemble un `.ico` Windows multi-résolution depuis une liste de PNG.
- `scripts/inject-images.mjs` — injecte des images en base64 dans un template HTML (tokens
  `{{TOKEN}}`).
- `assets/compare-template.html` — template de la page de comparaison.
- `references/size-presets.md` — tailles utiles par plateforme.
- `references/browser-favicon-behavior.md` — comportement des navigateurs face à plusieurs
  favicons (SVG vs ICO/PNG), à relire si le pixel-perfect en petit format doit vraiment s'afficher
  dans l'onglet du navigateur.
- `references/pixel-art-techniques.md` — méthode complète de retouche à l'échelle pixel.

## Fichiers Node.js jetables

Si un script disposable doit tourner dans le dossier du projet cible (plutôt que via les scripts de
ce skill), le poser temporairement à la racine du projet cible plutôt que dans un dossier
temporaire hors du repo : la résolution ESM de Node remonte depuis l'emplacement du script, pas
depuis le `cwd`, donc un script posé dans un scratchpad hors-projet ne trouvera pas le
`node_modules` du projet cible. Supprimer le script juste après usage.
