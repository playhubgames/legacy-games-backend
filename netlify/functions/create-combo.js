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

const COMBOS = {
  '2-jogos': {
    2: { price: '99.90',  title: 'COMBO 2 JOGOS POR R$ 99,90' },
    3: { price: '143.60', title: 'COMBO 2 JOGOS (+1 EXTRA POR R$ 43,70)' },
    4: { price: '187.30', title: 'COMBO 2 JOGOS (+2 EXTRAS)' },
  },
  '3-jogos': {
    3: { price: '99.90',  title: 'COMBO PROMOCIONAL 3 JOGOS (SECUNDÁRIA)' },
    4: { price: '127.89', title: 'COMBO PROMOCIONAL 4 JOGOS (SECUNDÁRIA)' },
    5: { price: '151.88', title: 'COMBO PROMOCIONAL 5 JOGOS (SECUNDÁRIA)' },
  },
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

  const { variantIds, licenseType, comboPrice, comboTitle, comboType, collection, url, phone, email, name } = body;

  if (!Array.isArray(variantIds) || variantIds.length < 2 || variantIds.length > 5) {
    return json(400, { error: 'O combo requer a seleção de 2 a 5 jogos.' }, cors);
  }

  const count = variantIds.length;

  // Identifica se a requisição é do combo de 2 jogos
  const is2GamesCombo =
    comboType === '2-jogos' ||
    comboType === '2' ||
    body.baseCombo === 2 ||
    (typeof collection === 'string' && collection.includes('2-por')) ||
    (typeof url === 'string' && url.includes('2-por')) ||
    (count === 2);

  const table = is2GamesCombo ? COMBOS['2-jogos'] : COMBOS['3-jogos'];
  const defaultConfig = table[count] || {
    price: is2GamesCombo ? (99.90 + (count - 2) * 43.70).toFixed(2) : '99.90',
    title: `COMBO PROMOCIONAL ${count} JOGOS`,
  };

  const comboConfig = {
    price: comboPrice ? String(comboPrice).replace(',', '.') : defaultConfig.price,
    title: comboTitle ? String(comboTitle) : defaultConfig.title,
  };

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

  const targetComboPrice = parseFloat(comboConfig.price);

  // 1. Tenta usar os preços de venda atuais
  let itemPrices = nodes.map(node => (node.price ? parseFloat(node.price) : 0));
  let subtotalEffective = itemPrices.reduce((sum, p) => sum + p, 0);

  // 2. Se a soma dos preços de venda for menor que o valor do combo (ex: 2 jogos somando R$ 92 < R$ 99,90),
  // usa os preços originais de tabela (compareAtPrice) para exibir o valor original e aplicar o desconto
  if (subtotalEffective < targetComboPrice) {
    itemPrices = nodes.map(node => {
      const compare = node.compareAtPrice ? parseFloat(node.compareAtPrice) : 0;
      const current = node.price ? parseFloat(node.price) : 0;
      return compare > current ? compare : current;
    });
    subtotalEffective = itemPrices.reduce((sum, p) => sum + p, 0);
  }

  // 3. Se ainda assim a soma for menor que o combo, aplica fator proporcional para
  // NUNCA exibir valores fixos divididos (ex: R$ 49,95 ou R$ 33,30) e sempre exibir linha de desconto
  if (subtotalEffective < targetComboPrice) {
    const markupFactor = (targetComboPrice * 1.35) / (subtotalEffective || 1);
    itemPrices = itemPrices.map(p => parseFloat((p * markupFactor).toFixed(2)));
    subtotalEffective = itemPrices.reduce((sum, p) => sum + p, 0);
  }

  const discountVal = parseFloat((subtotalEffective - targetComboPrice).toFixed(2));

  const lineItemsInput = nodes.map((node, i) => ({
    variantId: node.id,
    quantity: 1,
    requiresShipping: false,
    generatePriceOverride: true,
    priceOverride: {
      amount: itemPrices[i].toFixed(2),
      currencyCode: 'BRL',
    },
  }));

  const appliedDiscountInput = discountVal > 0 ? {
    title: 'Desconto Combo (' + count + ' Jogos)',
    value: discountVal,
    valueType: 'FIXED_AMOUNT',
  } : null;

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

  const customAttributes = [];
  let noteText = comboConfig.title + ':\n- ' + gameNotes.join('\n- ');
  const tagsList = ['combo-' + count + '-jogos', 'promocional', 'secundaria'];

  let formattedPhone = null;
  if (phone && typeof phone === 'string') {
    const rawDigits = phone.replace(/\D/g, '');
    if (rawDigits.length >= 10) {
      formattedPhone = rawDigits.startsWith('55') ? '+' + rawDigits : '+55' + rawDigits;
      noteText += '\n\n📱 WhatsApp / Telefone: ' + phone.trim();
      customAttributes.push(
        { key: 'WhatsApp', value: phone.trim() },
        { key: 'Telefone', value: phone.trim() }
      );
      tagsList.push('com-whatsapp', 'wa-' + rawDigits);
    }
  }

  if (name && typeof name === 'string' && name.trim()) {
    noteText += '\n👤 Nome: ' + name.trim();
    customAttributes.push({ key: 'Nome', value: name.trim() });
  }

  if (email && typeof email === 'string' && email.includes('@')) {
    noteText += '\n✉️ Email: ' + email.trim();
  }

  const draftInput = {
    lineItems: lineItemsInput,
    note: noteText,
    tags: tagsList,
    ...(customAttributes.length > 0 ? { customAttributes } : {}),
  };

  if (formattedPhone) {
    draftInput.phone = formattedPhone;
    const customerName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Cliente';
    const address = {
      firstName: customerName,
      phone: formattedPhone,
      countryCode: 'BR',
    };
    draftInput.shippingAddress = address;
    draftInput.billingAddress = address;
  }

  if (email && typeof email === 'string' && email.includes('@')) {
    draftInput.email = email.trim();
  }

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
