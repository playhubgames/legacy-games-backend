/**
 * GET /.netlify/functions/auth-callback
 * Recebe o código OAuth da Shopify e troca pelo Access Token.
 * Exibe o token na tela para você copiar e salvar como variável de ambiente.
 */
exports.handler = async (event) => {
  const { code, shop } = event.queryStringParameters || {};

  if (!code || !shop) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: "<h2>Erro: parâmetros 'code' e 'shop' não encontrados.</h2>",
    };
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Shopify OAuth error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    // Exibe o token na tela para copiar
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Token obtido!</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 60px auto; padding: 0 20px; background: #0f0f0f; color: #e0e0e0; }
    h1 { color: #4ade80; }
    .token-box { background: #1e1e1e; border: 1px solid #4ade80; border-radius: 8px; padding: 20px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 14px; }
    .step { background: #1e1e1e; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .step h3 { margin: 0 0 8px 0; color: #facc15; }
    button { background: #4ade80; color: #000; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
    button:hover { background: #22c55e; }
    .warning { background: #7f1d1d; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #fca5a5; }
  </style>
</head>
<body>
  <h1>✅ Token obtido com sucesso!</h1>
  <div class="warning">⚠️ Guarde esse token em local seguro. Feche esta página depois de copiar.</div>

  <div class="token-box" id="token">${accessToken}</div>
  <button onclick="navigator.clipboard.writeText('${accessToken}').then(() => this.textContent = 'Copiado!')">Copiar token</button>

  <div class="step">
    <h3>Próximo passo:</h3>
    <p>Adicione como variável de ambiente no Netlify:</p>
    <code>SHOPIFY_ADMIN_TOKEN = ${accessToken}</code>
  </div>

  <div class="step">
    <h3>Loja autenticada:</h3>
    <code>${shop}</code>
  </div>
</body>
</html>
      `,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Erro: ${error.message}</h2>`,
    };
  }
};

