# 📈 Pulse Éco — Suivi quotidien des investissements

Site web mis à jour **automatiquement chaque jour** qui suit l'actualité économique et les
investissements dans **les actions, l'immobilier, l'or et les cryptomonnaies**, ainsi que les
dernières **déclarations des grandes figures de la politique et de la finance** (Trump, Jerome
Powell, Christine Lagarde, Larry Fink, Warren Buffett, Jamie Dimon…).

## Fonctionnement

- **Mise à jour quotidienne** : chaque jour à 5 h 30 UTC, une GitHub Action exécute
  `scripts/update_data.py` qui récupère :
  - les cours du jour via Yahoo Finance : S&P 500, CAC 40, immobilier (ETF VNQ), or, Bitcoin, Ethereum ;
  - les actualités en français via Google News, classées en 5 catégories :
    Déclarations, Actions, Immobilier, Or, Crypto.
- **3 derniers jours visibles** : la page d'accueil affiche les informations des 3 derniers jours.
- **Archivage automatique** : les jours plus anciens sont déplacés dans `data/archive/AAAA-MM.json`
  et restent consultables via l'onglet **Archives** du site.
- **Suppression d'informations** : deux niveaux :
  1. **Masquer** (bouton « 🗑️ Gérer » sur le site) : l'info disparaît sur votre navigateur
     (stockage local), restaurable à tout moment.
  2. **Suppression définitive** : le site vous donne la liste des identifiants à coller dans
     l'action GitHub « Supprimer des informations » (*Actions → Supprimer des informations →
     Run workflow*). Les infos sont alors retirées du site **et** des archives, et ne
     réapparaîtront jamais (liste noire `data/deleted.json`).

## Mise en route (à faire une seule fois)

1. **Activer GitHub Pages** : dans le dépôt, *Settings → Pages → Source : « Deploy from a
   branch »*, choisir la branche par défaut et le dossier `/ (root)`, puis *Save*.
   Le site sera disponible à `https://<votre-compte>.github.io/site-economique/`.
2. **Autoriser les Actions à écrire** : *Settings → Actions → General → Workflow permissions →
   « Read and write permissions »*, puis *Save*. (Nécessaire pour que la mise à jour quotidienne
   puisse publier les données.)
3. **Lancer la première collecte** : *Actions → « Mise à jour quotidienne » → Run workflow*.
   Ensuite, tout est automatique.

> ⚠️ Les workflows planifiés tournent sur la **branche par défaut** du dépôt. Si le site est sur
> une autre branche, fusionnez-la ou changez la branche par défaut.

## Structure du dépôt

```
index.html              Page du site
assets/                 Style et logique (aucune dépendance externe)
scripts/update_data.py  Collecte quotidienne + archivage (Python, stdlib uniquement)
scripts/delete_items.py Suppression définitive d'IDs
data/latest.json        Les 3 derniers jours
data/archive/           Archives mensuelles + index
data/deleted.json       Liste noire des infos supprimées
.github/workflows/      Mise à jour quotidienne + suppression
```

## Avertissement

Les informations affichées proviennent de sources publiques (Yahoo Finance, Google News) et sont
fournies à titre indicatif uniquement. **Ce site ne constitue pas un conseil en investissement.**
