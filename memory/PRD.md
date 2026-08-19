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
- Typographie : Fraunces (display italic massive), Instrument Sans (texte), JetBrains Mono (chiffres).
- Rideau d'ouverture cinématographique (curtain lift + marque révélée).
- Curseur signature (point doré + anneau magnétique, désactivé sur touch).
- Aurore d'arrière-plan (3 blobs animés) + vignette + grain de papier.
- Manchette éditoriale : ornement diamant, kicker « Édition n° X », date splittée mot par mot avec reveal cinéma (année en italique doré), lede en guillemets serif.
- Chapitres numérotés : I. Les marchés / II. La chronique (chiffres serif italiques dorés).
- Cartes marchés : bento asymétrique, prix serif géants avec count-up animé, sparklines qui se dessinent (stroke-dashoffset), devise en exposant, filet or en haut/bas.
- Ticker « Cotations · en continu » avec label épinglé et masque gradient.
- Onglets à filet or, recherche avec loupe intégrée.
- Barre de progression de lecture (dégradé or, glow).
- Reveal au scroll (blur + translate + fade).
- Halo doré au curseur (.spot).
- Toutes les fonctionnalités préservées : archives, mode suppression, thème clair/sombre, sparklines interactifs, toast, undo, modal suppression.

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
