/**
 * GET /.netlify/functions/auth
 * Inicia o fluxo OAuth com a Shopify.
 * Acesse: https://SEU-SITE.netlify.app/.netlify/functions/auth?shop=SUA-LOJA.myshopify.com
 */
exports.handler = async (event) => {
  const shop = event.queryStringParameters?.shop;

  if (!shop) {
    return {
      statusCode: 400,
      body: "Parâmetro 'shop' obrigatório. Ex: ?shop=sua-loja.myshopify.com",
    };
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const redirectUri = process.env.AUTH_CALLBACK_URL; // Ex: https://SEU-SITE.netlify.app/.netlify/functions/auth-callback

  const scopes = "write_draft_orders,read_draft_orders,read_products,read_collections";
  const nonce = Math.random().toString(36).substring(2);

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
    body: "",
  };
};

