# Comportement des navigateurs face à plusieurs favicons

Recherché en juillet 2026 (à revérifier si ce document a plus de 1-2 ans, le comportement a déjà
changé par le passé) :

**Quand un lien `<link rel="icon" type="image/svg+xml">` est présent, Chrome, Edge et Firefox le
préfèrent systématiquement à toute alternative ICO/PNG — indépendamment de l'ordre des balises ou
de l'attribut `sizes`.** Seul Safari (qui ne supporte pas les favicons SVG) retombe sur l'ICO.
C'est la *capacité* du navigateur qui décide, pas l'ordre du markup.

Conséquence directe : **si une version bitmap retouchée à la main à une petite taille (16×16) doit
vraiment s'afficher dans l'onglet du navigateur, il ne faut pas déclarer de favicon SVG du tout.**
Il n'existe pas de contournement connu (ni via l'ordre des `<link>`, ni via `sizes`) pour forcer un
navigateur SVG-capable à préférer un bitmap tant qu'un lien SVG est présent.

Pattern recommandé dans ce cas :
```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
```
Pas de lien `type="image/svg+xml"`. Le SVG maître reste utilisé ailleurs (source de génération des
autres tailles, logo dans l'UI à une taille où il reste net sans retouche — typiquement ≥ 24-32px).

**Sur `sizes="any"`** : par la spec HTML (WHATWG), cette valeur signifie précisément « format
vectoriel, se met à l'échelle sans perte ». Un `.ico`, même multi-résolution, reste un conteneur de
plusieurs images *fixes* — lister les tailles réellement présentes (`sizes="16x16 32x32 48x48"`)
est plus correct que `any`, et permet au navigateur de matcher exactement sans télécharger le
fichier pour deviner.

Si le pixel-perfect en tout petit format n'est pas un enjeu pour le projet en cours, garder le
favicon SVG scalable reste plus simple et tout à fait raisonnable — ce compromis est à trancher
avec l'utilisateur, pas à imposer.

Sources consultées : bugzilla.mozilla.org/show_bug.cgi?id=204393,
browserux.com/blog/guides/web-icons/favicons-best-practices.html
