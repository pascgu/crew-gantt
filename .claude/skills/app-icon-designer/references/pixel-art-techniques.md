# Techniques de retouche à l'échelle pixel (16×16, parfois 32×32)

Un simple redimensionnement du SVG maître devient flou/indistinct en dessous d'un certain seuil
(souvent quelque part entre 32 et 16px selon la complexité du motif) — l'antialiasing vectoriel
brouille les transitions de couleur au lieu de les clarifier. En dessous de ce seuil, retoucher à la
main sur une grille de pixels bruts (voir `scripts/pixel-icon.mjs`), jamais un resize.

## Coins adoucis
Un rectangle à coins carrés lit "dur" à cette échelle ; un vrai rayon vectoriel ne fait presque
rien de visible à 16px (1 pixel de rayon = rien) ou devient flou si trop appuyé. La technique qui
fonctionne : mélanger la couleur de la forme avec le fond à ~55 % sur les 4 pixels de coin
seulement (`softenCorners()`). Un adoucissement "un peu" marqué — pas un vrai flou de
rééchantillonnage.

## Poignées / petits marqueurs
Ne jamais coller un marqueur pile sur le bord réel de la forme qu'il accompagne — ça lit comme un
artefact. Le décaler d'une unité, avec une colonne de transition mélangée à ~50 % vers la couleur
adjacente (`insetMarker()`). Un marqueur peut être aussi petit que 1px de large si le contraste de
couleur est suffisant ; s'il y a la place (forme assez haute), un marqueur 2×2 avec un halo mélangé
autour lit mieux comme "rond" qu'un simple carré plein.

## Éléments secondaires pâles (connecteurs, ponts, indices faibles)
Un détail conçu pour être discret peut devenir *invisible* plutôt que discret à trop faible
opacité/contraste, surtout entouré de blocs plus saturés. Toujours vérifier ce genre d'élément à la
taille réelle non zoomée avant de le valider (voir plus bas) — ce qui se lit bien sur un aperçu
agrandi ×16 peut disparaître complètement en vrai. Si c'est le cas, ne pas hésiter à remonter
nettement le contraste (ex. opacité ×1.5-2) plutôt que d'ajuster à la marge.

## Marges
Au moins 1px d'écart entre une forme et le bord du canevas à partir de 32×32 (quelques px de plus à
512 ne posent aucun problème — ce n'est significatif qu'au moment où l'image est réduite aux
tailles réellement utilisées). À 16×16, toucher le bord peut être accepté par nécessité (il n'y a
souvent pas la place pour une vraie marge sans perdre en lisibilité ailleurs) — mais uniquement à
cette taille-là, pas au-delà.

## Prévisualisation
Toujours agrandir avec un noyau **`nearest`** (`previewNearest()`), jamais lanczos/bicubic/mitchell
— un noyau de rééchantillonnage lisse réintroduit exactement le flou qu'on essaie d'éliminer, et
fausse le jugement visuel sur la retouche.

## Vérifier au format natif, pas seulement zoomé
Un aperçu ×16 en `nearest` montre les pixels exacts mais peut donner une fausse impression de
lisibilité — un œil humain lisant une image affichée à 256px "complète" mentalement des détails
qui, à la vraie taille d'affichage (barre des tâches, onglet réduit), fusionnent en une tache.
Toujours regarder aussi le rendu à la taille native réelle (16×16 affiché en 16×16, pas agrandi)
avant de valider une itération.

## Ordre de travail : petit format d'abord, report vers les grands ensuite
Finaliser la composition (proportions, positions, marges) sur la contrainte la plus dure — le plus
petit format — puis reporter cette même grille à l'échelle sur les formats plus grands (multiplier
toutes les coordonnées par le même facteur), jamais l'inverse. Concevoir en grand puis réduire
redécouvre les mêmes problèmes de lisibilité une fois arrivé au petit format, en ayant perdu le
bénéfice d'avoir déjà la bonne composition.

## Boucle de feedback attendue
La retouche du plus petit format se fait en plusieurs allers-retours concrets avec l'utilisateur
("décale X d'1px", "assombris Y", "enlève la marge ici") — ce n'est presque jamais bon du premier
coup, et c'est normal. Ne pas essayer de deviner la version finale en une fois ; montrer un rendu,
demander des retours précis, itérer.
