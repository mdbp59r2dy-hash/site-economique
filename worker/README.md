# 🔮 Assistant IA — installation en 3 minutes

L'assistant conversationnel de Pulse Éco (le bouton *« Demander à l'IA »*) a besoin
d'un tout petit proxy pour appeler Claude Haiku 4.5 sans exposer votre clé Anthropic
dans le navigateur. Cloudflare Workers fait ça gratuitement, en 3 minutes.

## Prérequis

- Un compte **Cloudflare** (gratuit) : https://dash.cloudflare.com/sign-up
- Une clé **Anthropic** (la même que celle du briefing quotidien) :
  https://platform.claude.com/settings/keys

## Étape 1 — Créer le worker

1. Ouvrez https://dash.cloudflare.com → **Workers & Pages**.
2. **Create** → **Create Worker** → donnez-lui un nom (ex. `pulse-eco-oracle`) → **Deploy**.
3. Sur la page du worker, cliquez **Edit code** (Quick Edit).
4. Effacez tout le code par défaut et **collez le contenu de `worker/chat.js`**.
5. **Save and deploy**.

## Étape 2 — Ajouter la clé Anthropic

1. Toujours sur le worker : **Settings** → **Variables and Secrets**.
2. **Add** :
   - **Type** : *Secret*
   - **Variable name** (exact) : `ANTHROPIC_API_KEY`
   - **Value** : votre clé `sk-ant-…`
3. **Deploy**.

## Étape 3 — Connecter le site

1. Sur la page du worker, copiez l'URL (`https://pulse-eco-oracle.<vous>.workers.dev`).
2. Sur votre site Pulse Éco, cliquez **Demander à l'IA** (bouton doré en bas à gauche).
3. Collez l'URL dans le champ de configuration, **Enregistrer**.
4. Posez votre première question. 🥂

## Sécurité recommandée

Par défaut, le worker accepte les requêtes depuis n'importe quel domaine (`ALLOWED_ORIGINS = ["*"]`).
Pour restreindre à votre seul site, éditez `worker/chat.js` :

```js
const ALLOWED_ORIGINS = ["https://votre-nom.github.io"];
```

Puis redéployez. Sans cette limite, un tiers qui découvre l'URL du worker peut consommer votre quota Anthropic.

## Coût

- Cloudflare Workers : **100 000 requêtes / jour gratuites**.
- Anthropic : facturation à l'usage — Claude Haiku 4.5 coûte environ 1 $ pour 1 million de tokens en entrée
  (≈ 3 000 questions), 5 $ pour 1 million en sortie.

Autrement dit : quelques euros par mois pour un usage personnel confortable.
