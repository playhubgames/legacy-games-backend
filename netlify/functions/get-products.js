/**
 * GET /.netlify/functions/get-products
 * Retorna os produtos da coleção configurada via GraphQL
 */
'use strict';

const { getAccessToken } = require('./_token');

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, *',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido' }),
    };
  }

  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const rawCollectionId = process.env.SHOPIFY_COLLECTION_ID;

    if (!domain || !rawCollectionId) {
      throw new Error('SHOPIFY_STORE_DOMAIN ou SHOPIFY_COLLECTION_ID ausentes');
    }

    const token = await getAccessToken();

    const collectionGid = rawCollectionId.startsWith('gid://')
      ? rawCollectionId
      : `gid://shopify/Collection/${rawCollectionId}`;

    const query = `
      query getCollectionProducts($id: ID!) {
        collection(id: $id) {
          id
          title
          products(first: 100) {
            nodes {
              id
              title
              featuredImage {
                url
              }
              variants(first: 10) {
                nodes {
                  id
                  title
                  price
                  compareAtPrice
                  availableForSale
                }
              }
            }
          }
        }
      }
    `;

    const res = await fetch(`https://${domain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { id: collectionGid } }),
    });

    const data = await res.json();

    if (data.errors) {
      throw new Error(JSON.stringify(data.errors));
    }

    const collection = data?.data?.collection;
    if (!collection) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Coleção não encontrada' }),
      };
    }

    const products = (collection.products?.nodes || []).map((p) => ({
      id: p.id.replace('gid://shopify/Product/', ''),
      title: p.title,
      image: p.featuredImage?.url || null,
      variants: (p.variants?.nodes || []).map((v) => ({
        id: v.id.replace('gid://shopify/ProductVariant/', ''),
        gid: v.id,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        available: v.availableForSale,
      })),
    }));

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionTitle: collection.title,
        products,
      }),
    };
  } catch (error) {
    console.error('Erro em get-products:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
