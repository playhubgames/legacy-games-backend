/**
 * GET /api/get-products
 * Retorna os produtos da coleção combo configurada em SHOPIFY_COLLECTION_ID
 */
exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || "";
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Método não permitido" }),
    };
  }

  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const collectionId = process.env.SHOPIFY_COLLECTION_ID;

    if (!domain || !token || !collectionId) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    // Busca produtos da coleção
    const url = `https://${domain}/admin/api/2024-01/collections/${collectionId}/products.json?fields=id,title,variants,images&limit=50`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${err}`);
    }

    const data = await response.json();

    // Simplifica o retorno: só o que o frontend precisa
    const products = data.products.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.images?.[0]?.src || null,
      variants: p.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
      })),
    }));

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ products }),
    };
  } catch (error) {
    console.error("Erro em get-products:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

