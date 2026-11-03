/**
 * _token.js
 * Obtém e renova o token OAuth via client_credentials.
 * Nunca exposto ao browser — roda somente no servidor Netlify.
 */
'use strict';

let _cachedToken  = null;
let _expiresAt    = 0;          // timestamp ms
const SAFETY_MS   = 5 * 60 * 1000; // renova 5 min antes de expirar

async function getAccessToken() {
  if (_cachedToken && Date.now() < _expiresAt - SAFETY_MS) {
    return _cachedToken;          // reutiliza token em cache (instância quente)
  }
  return _fetchToken();
}

async function _fetchToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) {
    return process.env.SHOPIFY_ADMIN_TOKEN;
  }

  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = process.env;

  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    throw new Error('Env vars ausentes: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET');
  }

  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify token error (${res.status}): ${txt}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('Resposta sem access_token');

  _cachedToken = data.access_token;
  // expires_in em segundos; se ausente (token permanente), renova em 24 h
  _expiresAt   = Date.now() + (data.expires_in || 86400) * 1000;

  console.log(`[token] Novo token. Expira em ${Math.round((data.expires_in || 86400) / 60)} min.`);
  return _cachedToken;
}

module.exports = { getAccessToken };
