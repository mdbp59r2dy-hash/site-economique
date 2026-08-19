/**
 * Pulse Éco — Worker proxy pour l'assistant IA.
 *
 * Reçoit une question + le contexte du jour depuis le site,
 * appelle Claude Haiku 4.5 côté serveur, renvoie la réponse.
 *
 * Déploiement Cloudflare Workers :
 *   1. Créez un compte gratuit sur https://dash.cloudflare.com
 *   2. Workers & Pages → Create → Create Worker → collez ce fichier
 *   3. Settings → Variables → Secrets → ajoutez ANTHROPIC_API_KEY (valeur : sk-ant-…)
 *   4. Copiez l'URL du worker (…workers.dev) et collez-la dans le drawer IA du site
 *
 * Aucun stockage, rien n'est journalisé — la clé reste côté serveur.
 */

const SYSTEM_PROMPT = `Vous êtes « L'oracle de la rédaction », l'assistant conversationnel du journal Pulse Éco.
Vous parlez français, avec un ton éditorial cultivé, chaleureux, précis.
Vous répondez UNIQUEMENT à partir du contexte fourni (édition du jour, marchés, chroniques).
Si l'information n'est pas dans le contexte, dites-le poliment et proposez une piste.
Ne donnez jamais de conseil en investissement. Restez sous 4 phrases par défaut.
Vous n'écrivez pas en Markdown : phrases simples, jamais de listes à puces sauf demande explicite.`;

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 500;

// ⚠️ Restreignez cette liste au(x) domaine(s) qui affiche(nt) votre site.
// Ex. ["https://votre-nom.github.io"]. "*" fonctionne mais laisse tout le monde utiliser votre clé.
const ALLOWED_ORIGINS = ["*"];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes("*") ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "null");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée." }, { status: 405, headers: cors });
    }

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "Corps JSON invalide." }, { status: 400, headers: cors }); }

    const question = String(payload?.question || "").trim();
    const context  = String(payload?.context  || "").slice(0, 12000);
    if (!question) return json({ error: "Question manquante." }, { status: 400, headers: cors });
    if (question.length > 500) return json({ error: "Question trop longue (max 500 caractères)." }, { status: 400, headers: cors });

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY non configurée sur le worker." }, { status: 500, headers: cors });

    const userPrompt = `CONTEXTE DE L'ÉDITION DU JOUR :\n${context}\n\nQUESTION DU LECTEUR :\n${question}`;

    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.5,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
    } catch (err) {
      return json({ error: "Erreur réseau vers Anthropic." }, { status: 502, headers: cors });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return json({ error: `Anthropic a répondu ${response.status}.`, detail: detail.slice(0, 200) },
                  { status: 502, headers: cors });
    }

    const data = await response.json();
    const text = (data?.content || [])
      .filter((b) => b?.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return json({ answer: text || "Je n'ai pas de réponse pour cette question." }, { headers: cors });
  },
};
