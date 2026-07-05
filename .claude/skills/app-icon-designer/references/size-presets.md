# Tailles utiles par plateforme

Demander à l'utilisateur quelles plateformes sont ciblées avant de figer une liste — ne pas
générer par défaut tout ce qui suit "au cas où".

## Web / PWA
- **Favicon** : 16×16, 32×32, 48×48 (regroupés dans un seul `favicon.ico` multi-résolution — voir
  `references/browser-favicon-behavior.md` pour le pourquoi et le pattern de balises `<link>`).
- **Manifest PWA** : 192×192 et 512×512 en PNG (`purpose: any`), plus une variante 512×512
  `purpose: maskable` — contenu utile centré sur ~80 % du canvas, le reste en padding uni de la
  couleur de fond de l'icône (pas de transparence : certains launchers Android appliquent un masque
  qui découperait un fond transparent de façon imprévisible).
- **Apple touch icon** (ajout à l'écran d'accueil iOS/iPadOS) : 180×180 seul suffit aujourd'hui
  (les tailles historiques 152/167/120 ne sont plus nécessaires en pratique).

## Windows (icône d'app native — .exe, Tauri, Electron)
- `.ico` multi-résolution unique : **16, 24, 32, 48, 256** (jeu recommandé par Microsoft). Le
  format supporte techniquement des frames au-delà de 256×256 mais ce n'est pas recommandé et le
  support outillage/OS est inconstant — pas de bénéfice réel, les besoins "grande taille" (store,
  install) sont couverts par les PNG PWA séparés.
- Un seul fichier `.ico` — jamais deux (le format est justement un conteneur multi-résolution, l'OS
  choisit lui-même la frame adaptée au contexte).
- Si l'outillage de génération auto (`tauri icon`, équivalent Electron) écrase la frame 16px par un
  simple downscale flou et qu'une version 16px retouchée à la main existe, reconstruire le `.ico`
  après coup avec `scripts/build-ico.mjs` en insérant la frame retouchée.

**Piège vérifié (Tauri v2, Windows) : `cargo clean -p <paquet>` ne suffit pas toujours à faire
réembarquer un `.ico` mis à jour dans l'exe compilé.** Des dossiers de cache de build orphelins
s'accumulent dans `src-tauri/target/release/build/<paquet>-<hash>/` au fil des sessions (changements
de config, de features...) et un `cargo clean -p` scopé peut ne pas tous les invalider — l'exe
recompile bien (nouveau hash binaire), mais la ressource icône reste l'ancienne. Symptôme
caractéristique : la barre de titre et Alt+Tab affichent la bonne icône (lue en direct par la
fenêtre au runtime) alors que la barre des tâches et l'Explorateur affichent encore l'ancienne
(embarquée dans l'exe à la compilation) — **ce n'est pas un cache d'icônes Windows**, ne pas
perdre de temps sur `ie4uinit`/`IconCache.db` dans ce cas précis. Si un `cargo clean -p` +
rebuild ne suffit pas, faire un `cargo clean` **complet** (sans `-p`, dans le dossier `src-tauri`)
puis reconstruire — plus lent (toutes les dépendances recompilent) mais fiable.

Pour vérifier l'icône *réellement* embarquée dans un exe (sans se fier à l'œil ni au cache Explorateur) :
```powershell
Add-Type -AssemblyName System.Drawing
[System.Drawing.Icon]::ExtractAssociatedIcon("<chemin-exe>").ToBitmap().Save("<sortie>.png")
```
Faire ça sur une **copie** de l'exe sous un nom jamais vu par l'Explorateur (pas le chemin
original) pour écarter tout doute sur un cache d'icônes côté shell Windows plutôt qu'un vrai
problème d'embarquement.

## macOS (.icns)
- Paires @1x/@2x : 16, 32 (=16@2x), 32, 64 (=32@2x), 128, 256 (=128@2x), 256, 512 (=256@2x), 512,
  1024 (=512@2x) — 10 entrées raster au total dans le cas le plus complet.
- Les outils de packaging (ex. `electron-icon-builder`, scripts Xcode) génèrent généralement ça
  automatiquement depuis un PNG 1024×1024 source — pas besoin de le faire à la main sauf besoin
  spécifique de retouche à une taille donnée.

## Linux
- Généralement un thème d'icônes `hicolor` avec plusieurs tailles (16 à 512), ou simplement le PNG
  512 réutilisé tel quel selon l'empaqueteur. Pour Tauri, `tauri icon` génère déjà ce qu'il faut.

## Android / iOS (si l'app a une cible mobile via Tauri/Capacitor/etc.)
- Android : `mipmap-*dpi` (mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192), plus
  souvent une version "foreground" séparée pour les icônes adaptatives.
- iOS : jeu `AppIcon-*` (20 à 1024, plusieurs multiplicateurs @1x/@2x/@3x).
- Dans la plupart des cas, ces jeux sont générés automatiquement par l'outillage de la plateforme
  (`tauri icon`, Xcode, Android Studio) depuis un PNG source unique — ne pas les construire à la
  main sauf demande explicite.
