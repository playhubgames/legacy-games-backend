/**
 * POST /api/create-draft-order
 * Cria um Draft Order na Shopify com os 3 jogos escolhidos pelo cliente
 * a um preço fixo definido em COMBO_PRICE_CENTS
 *
 * Body esperado (JSON):
 * {
 *   "variants": [variantId1, variantId2, variantId3],
 *   "email": "cliente@email.com"  (opcional)
 * }
 */
exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Método não permitido" }),
    };
  }

  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const comboPriceCents = parseInt(process.env.COMBO_PRICE_CENTS || "9990", 10);

    if (!domain || !token) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    // Parse do body
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Body inválido — envie JSON" }),
      };
    }

    const { variants, email } = body;

    if (!Array.isArray(variants) || variants.length !== 3) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Envie exatamente 3 variants no array 'variants'" }),
      };
    }

    // Preço total do combo em reais (ex: 9990 → "99.90")
    const comboPrice = (comboPriceCents / 100).toFixed(2);

    // Distribuímos o preço: itens custam 0 e o combo aplica um line_item com preço real
    // Estratégia: 1 item principal com o preço do combo, os outros R$0,00
    const lineItems = variants.map((variantId, index) => ({
      variant_id: Number(variantId),
      quantity: 1,
      price: index === 0 ? comboPrice : "0.00", // primeiro item leva o valor total
      title: index === 0 ? `Combo 3 Jogos` : undefined,
    }));

    const draftOrderPayload = {
      draft_order: {
        line_items: lineItems,
        ...(email ? { email } : {}),
        note: "Combo 3 jogos — preço fixo",
        use_customer_default_address: false,
      },
    };

    const response = await fetch(
      `https://${domain}/admin/api/2024-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftOrderPayload),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const draftOrder = data.draft_order;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draftOrder.id,
        invoice_url: draftOrder.invoice_url,   // URL de checkout para o cliente
        total_price: draftOrder.total_price,
        status: draftOrder.status,
      }),
    };
  } catch (error) {
    console.error("Erro em create-draft-order:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

