/**
 * create-combo.js  —  Netlify Function
 * Endpoint: POST /.netlify/functions/create-combo
 *
 * Suporta 3, 4 ou 5 jogos:
 *   - 3 jogos: R$ 99,90
 *   - 4 jogos: R$ 127,89 (99,90 + 27,99)
 *   - 5 jogos: R$ 151,88 (127,89 + 23,99)
 *
 * Utiliza GraphQL draftOrderCreate com generatePriceOverride: true
 * para exibir os valores tradicionais de cada jogo (com foto e título oficial)
 * e aplica o desconto promocional no total.
 */
'use strict';

const { getAccessToken } = require('./_token');

const PRICES_BY_COUNT = {
  3: { price: '99.90',  title: 'COMBO PROMOCIONAL 3 JOGOS (SECUNDÁRIA)' },
  4: { price: '127.89', title: 'COMBO PROMOCIONAL 4 JOGOS (SECUNDÁRIA)' },
  5: { price: '151.88', title: 'COMBO PROMOCIONAL 5 JOGOS (SECUNDÁRIA)' },
};

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '*';
  const cors = {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, *',
    'Access-Control-Max-Age':       '86400',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método não permitido.' }, cors);
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'JSON inválido.' }, cors);
  }

  const { variantIds, licenseType } = body;

  if (!Array.isArray(variantIds) || ![3, 4, 5].includes(variantIds.length)) {
    return json(400, { error: 'O combo requer a seleção de 3, 4 ou 5 jogos.' }, cors);
  }

  const count = variantIds.length;
  const comboConfig = PRICES_BY_COUNT[count];

  // Verificar variantes distintas
  const uniqueIds = new Set(variantIds.map(String));
  if (uniqueIds.size !== count) {
    return json(400, { error: 'Selecione jogos diferentes para o combo.' }, cors);
  }

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) {
    return json(500, { error: 'Configuração do servidor ausente.' }, cors);
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error('[combo] Erro ao obter token:', err.message);
    return json(500, { error: 'Erro de autenticação na loja.' }, cors);
  }

  // Converter para Global IDs
  const gids = variantIds.map(id => {
    const s = String(id).trim();
    return s.startsWith('gid://') ? s : 'gid://shopify/ProductVariant/' + s;
  });

  // Consultar variantes via GraphQL da Shopify
  const gqlQuery = `
    query getVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          price
          compareAtPrice
          availableForSale
          selectedOptions {
            name
            value
          }
          product {
            id
            title
            tags
            totalInventory
          }
        }
      }
    }
  `;

  let nodes;
  try {
    const gqlRes = await fetch('https://' + domain + '/admin/api/2024-01/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: gqlQuery, variables: { ids: gids } }),
    });

    if (!gqlRes.ok) {
      console.error('[combo] GQL error status:', gqlRes.status);
      return json(500, { error: 'Erro ao consultar produtos na Shopify.' }, cors);
    }

    const gqlData = await gqlRes.json();
    nodes = gqlData?.data?.nodes;
  } catch (err) {
    console.error('[combo] Erro GraphQL:', err.message);
    return json(500, { error: 'Erro de conexão com a Shopify.' }, cors);
  }

  if (!nodes || nodes.length !== count || nodes.some(n => !n)) {
    return json(400, { error: 'Um ou mais jogos selecionados não foram encontrados na loja.' }, cors);
  }

  // Prepara notas descritivas dos jogos
  const gameNotes = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const productTitle = node.product?.title || 'Jogo';
    const variantTitle = node.title || '';
    gameNotes.push(productTitle + ' [' + variantTitle + ']');
  }

  // Determinar o preço tradicional de cada jogo
  // Regra:
  // Se o jogo tem compareAtPrice (valor tradicional riscado), exibe esse valor tradicional.
  // Se não tiver valor riscado, exibe o preço normal do catálogo.
  const itemPrices = nodes.map(node => {
    const compare = node.compareAtPrice ? parseFloat(node.compareAtPrice) : 0;
    const current = node.price ? parseFloat(node.price) : 0;
    return (compare > 0 ? compare : current);
  });

  const subtotalEffective = itemPrices.reduce((sum, p) => sum + p, 0);
  const targetComboPrice = parseFloat(comboConfig.price);

  let lineItemsInput = [];
  let appliedDiscountInput = null;

  if (subtotalEffective >= targetComboPrice) {
    // Caso padrão: subtotal tradicional cobre o combo
    const discountVal = parseFloat((subtotalEffective - targetComboPrice).toFixed(2));

    lineItemsInput = nodes.map((node, i) => ({
      variantId: node.id,
      quantity: 1,
      requiresShipping: false,
      generatePriceOverride: true,
      priceOverride: {
        amount: itemPrices[i].toFixed(2),
        currencyCode: 'BRL',
      },
    }));

    if (discountVal > 0) {
      appliedDiscountInput = {
        title: 'Desconto Combo (' + count + ' Jogos)',
        value: discountVal,
        valueType: 'FIXED_AMOUNT',
      };
    }
  } else {
    // Caso em que os preços somados são menores que o combo:
    // distribui o valor do combo para que o total feche exatamente em targetComboPrice
    const totalCents = Math.round(targetComboPrice * 100);
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - (baseCents * count);

    lineItemsInput = nodes.map((node, i) => {
      const itemCents = i === 0 ? (baseCents + remainder) : baseCents;
      return {
        variantId: node.id,
        quantity: 1,
        requiresShipping: false,
        generatePriceOverride: true,
        priceOverride: {
          amount: (itemCents / 100).toFixed(2),
          currencyCode: 'BRL',
        },
      };
    });
  }

  // Criação do Draft Order via GraphQL Mutation (suporta generatePriceOverride nativamente)
  const draftMutation = `
    mutation createComboDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
          totalPrice
          subtotalPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const draftInput = {
    lineItems: lineItemsInput,
    note: comboConfig.title + ':\n- ' + gameNotes.join('\n- '),
    tags: ['combo-' + count + '-jogos', 'promocional', 'secundaria'],
  };

  if (appliedDiscountInput) {
    draftInput.appliedDiscount = appliedDiscountInput;
  }

  let draftOrderResult;
  try {
    const draftRes = await fetch('https://' + domain + '/admin/api/2024-01/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: draftMutation,
        variables: { input: draftInput },
      }),
    });

    const draftData = await draftRes.json();
    const createData = draftData?.data?.draftOrderCreate;

    if (createData?.userErrors && createData.userErrors.length > 0) {
      console.error('[combo] userErrors ao criar draft order:', JSON.stringify(createData.userErrors));
      return json(500, { error: createData.userErrors[0].message || 'Erro ao gerar o pedido promocional.' }, cors);
    }

    draftOrderResult = createData?.draftOrder;
    if (!draftOrderResult || !draftOrderResult.invoiceUrl) {
      console.error('[combo] Draft order sem invoiceUrl:', JSON.stringify(draftData));
      return json(500, { error: 'Erro ao gerar link de pagamento.' }, cors);
    }
  } catch (err) {
    console.error('[combo] Erro na mutação draftOrderCreate:', err.message);
    return json(500, { error: 'Erro de conexão com a Shopify.' }, cors);
  }

  console.log('[combo] Draft Order criado com sucesso: ' + draftOrderResult.id + ' — Total: R$ ' + draftOrderResult.totalPrice);
  return json(200, { checkoutUrl: draftOrderResult.invoiceUrl }, cors);
};

function json(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}
