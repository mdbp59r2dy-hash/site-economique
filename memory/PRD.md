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
- **Résumé matinal avec IA Claude Haiku 4.5** : généré chaque nuit par la GitHub Action via `anthropic` SDK. Fallback local si clé manque.
- **Or converti en kilo** : script Python × 32,15 + normalisation client rétroactive (`normalizeGold`).
- **Sélecteur de vue (Liste / Magazine / Mosaïque)** avec persistance localStorage.
- **Effet cinéma au scroll** : poussière d'or (canvas + particules), parallaxe aurore, filet doré latéral avec goutte lumineuse.
- **Dossiers éditoriaux** : chaque rubrique est une carte à part entière avec cadre or subtil, chiffre romain agrandi en italique serif doré, badge pilule « X chroniques » doré, chevron de repli, ombrage au survol.
- **Sous-catégories intelligentes** dans chaque dossier : groupement par requête d'origine (Trump, Powell, Lagarde, Buffett, Fink, Dimon pour Déclarations ; Wall Street/Paris pour Actions ; etc.) avec en-tête sous-catégorie (point doré, nom, filet, compteur mono). Table `QUERY_LABELS` pour libellés élégants.
- **Assistant IA conversationnel « L'oracle de la rédaction »** :
  - Bouton flottant or en bas-gauche avec pictogramme étoile + label « Demander à l'IA ».
  - Drawer 440px qui glisse de la droite, backdrop flouté, cadre or dégradé.
  - Chat body : intro kicker + lede italique + 4 suggestions cliquables.
  - Bulles utilisateur/assistant/erreur/thinking, animation d'entrée msg-in.
  - Configuration d'endpoint (Cloudflare Worker URL) via panneau intégré au drawer.
  - Envoie question + contexte du jour au worker.
  - **Mémoire conversationnelle** : les 5 dernières paires Q/R sont sauvées en localStorage (`pulse-eco-chat-history`), restaurées au ré-ouverture du drawer, envoyées comme tableau `messages` au worker pour un contexte conversationnel naturel. Bouton corbeille dans l'en-tête pour purger la mémoire.
  - Fermeture au clic backdrop, croix, ou Escape.
- **Cloudflare Worker** (`worker/chat.js`) : proxy sécurisé qui appelle Claude Haiku 4.5, accepte deux formats (nouveau `{messages, context}` avec mémoire, ancien `{question, context}` en rétro-compat), CORS configurable. README complet dans `worker/README.md`.
- **Sélecteur de période sur les marchés** : chips « Aujourd'hui · 7 jours · 30 jours · 1 an » sous le chapitre Marchés. Recalcule à la volée la variation % de chaque baromètre depuis l'historique local. État persistant en localStorage. Boutons désactivés tant que l'archive locale n'a pas assez de profondeur (accumulation via GitHub Action quotidienne).
- Chapitres numérotés : I. Les marchés / II. La chronique.
- Cartes marchés bento asymétriques avec count-up + sparklines animés.
- Ticker « Cotations · en continu », onglets à filet or, recherche.
- Barre de progression de lecture, reveal au scroll, halo doré.
- Toutes les fonctionnalités préservées : archives, mode suppression, thème clair/sombre, sparklines interactifs, toast, undo, modal suppression.

## Configuration nécessaire (utilisateur)
### Briefing quotidien
1. Créer une clé Anthropic sur https://platform.claude.com/settings/keys
2. GitHub → Settings → Secrets and variables → Actions → New repository secret
3. Nom exact : `ANTHROPIC_API_KEY` — valeur : `sk-ant-…`

### Assistant IA du site
1. Suivre `worker/README.md` (Cloudflare Workers, 3 minutes, gratuit)
2. Dans le drawer IA du site, coller l'URL du worker et enregistrer

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
