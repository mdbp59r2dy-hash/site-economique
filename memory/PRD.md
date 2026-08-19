# Pulse Éco — PRD

## Problème
Site statique existant "Pulse Éco" (journal quotidien des marchés). Demande utilisateur : "améliore le visuel de ce site" puis "élève-le à un tout autre niveau, la crème de la crème, une véritable expérience".

## Stack
- HTML/CSS/JS statique (pas de framework). Sert via GitHub Pages.
- Données JSON (data/latest.json, data/archive/*.json) alimentées par GitHub Actions.
- Aucune dépendance backend.

## Réalisé (janvier 2026)
- Refonte visuelle complète en style « Maison Éditoriale » luxe éditorial sombre.
- Palette obsidienne + or ancien + touches burgundy. Mode clair crème/or foncé conservé.
- **Typographie display** : Playfair Display (serif éditorial classique) + Inter Tight (labels/kickers sans hairline moderne) + JetBrains Mono (chiffres). Body reste Instrument Sans.
- Rideau d'ouverture cinématographique (curtain lift + marque révélée).
- Curseur signature (point doré + anneau magnétique, désactivé sur touch).
- Aurore d'arrière-plan (3 blobs animés) + vignette + grain de papier.
- Manchette éditoriale : ornement diamant, kicker « Édition n° X », date splittée mot par mot avec reveal cinéma (année en italique doré), lede en guillemets serif.
- **Résumé matinal avec IA Claude Haiku 4.5** :
  - Généré chaque nuit par la GitHub Action `Mise à jour quotidienne` via le SDK `anthropic` (secret `ANTHROPIC_API_KEY`), en éditorial français deux lignes.
  - Kicker devient « L'éditorial du matin » et signature « écrit par la rédaction, épaulée par Claude Haiku » quand la génération réussit.
  - Fallback local intelligent : si la clé manque ou l'appel échoue, composition déterministe (humeur des marchés + chronique dominante). Kicker « Le résumé du matin ».
- **Or converti en kilo** : script Python multiplie le prix oz troy par 32,1507466 (label devient « Or (kilo) »). Client convertit rétroactivement les données déjà présentes en once via `normalizeGold` au chargement.
- **Sélecteur de vue (Liste / Magazine / Mosaïque)** avec persistance localStorage.
- **Effet cinéma au scroll (combo)** :
  - Poussière d'or : canvas fixe qui émet 1-6 particules dorées par tick de scroll (vitesse-dépendant), fade + gravité + glow, limite 220 particules.
  - Parallaxe aurore : les 3 blobs se décalent doucement avec le scroll (via propriété `translate` pour composer avec leur animation `transform`).
  - Filet d'encre doré latéral gauche : ligne verticale dorée avec goutte lumineuse qui suit le pourcentage de lecture, apparaît pendant le scroll.
- Chapitres numérotés : I. Les marchés / II. La chronique (chiffres serif italiques dorés).
- Cartes marchés : bento asymétrique, prix serif géants avec count-up animé, sparklines qui se dessinent (stroke-dashoffset), devise en exposant, filet or en haut/bas.
- Ticker « Cotations · en continu » avec label épinglé et masque gradient.
- Onglets à filet or, recherche avec loupe intégrée.
- Barre de progression de lecture (dégradé or, glow).
- Reveal au scroll (blur + translate + fade).
- Halo doré au curseur (.spot).
- Toutes les fonctionnalités préservées : archives, mode suppression, thème clair/sombre, sparklines interactifs, toast, undo, modal suppression.

## Configuration nécessaire (utilisateur)
1. Créer une clé Anthropic sur https://platform.claude.com/settings/keys
2. Dans le dépôt GitHub : Settings → Secrets and variables → Actions → New repository secret
3. Nom exactement : `ANTHROPIC_API_KEY` — valeur : la clé `sk-ant-…`
4. Le workflow quotidien l'utilisera automatiquement. En son absence, le fallback local produit toujours un résumé.

## Fonctionnalités préservées (aucun régression)
- Nav pilulaire : Édition du jour / Archives / Gérer / thème.
- Ticker cliquable pour filtrer par catégorie.
- Onglets catégories + recherche.
- Vue archives par mois.
- Mode gestion (masquer/restaurer/supprimer définitivement).
- Fresh dot pour infos < 12h.
- Bouton retour haut.
- Persistance thème + infos masquées via localStorage.

## Backlog possible
- Son subtil au clic (feuilletage magazine).
- Vue « lecture confortable » plein-écran par article.
- Partage social des chroniques.
- Notification push quotidienne PWA.
