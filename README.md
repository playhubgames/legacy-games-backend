# 🎮 Guia Completo de Implantação — Backend de Combos Shopify (Netlify Functions)

Este projeto é um backend serverless em **Netlify Functions** responsável por gerenciar a seleção de jogos e a criação de **Draft Orders promocionais** na Shopify. 

Ele permite que o cliente monte combos promocionais (como **3 por R$ 99,90** ou **2 por R$ 99,90 + jogo extra**) exibindo os jogos com seus preços individuais e aplicando um desconto automático no checkout, redirecionando o cliente direto para o pagamento.

---

## 📑 Sumário
1. [Como o Sistema Funciona (Arquitetura)](#1-como-o-sistema-funciona-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Passo 1: Criar o App na Shopify](#passo-1-criar-o-app-na-shopify)
4. [Passo 2: Subir o Repositório no GitHub](#passo-2-subir-o-repositório-no-github)
5. [Passo 3: Criar e Configurar o Site no Netlify](#passo-3-criar-e-configurar-o-site-no-netlify)
6. [Passo 4: Gerar o Access Token (`shpat_`)](#passo-4-gerar-o-access-token-shpat_)
7. [Passo 5: Vincular a Coleção de Jogos](#passo-5-vincular-a-coleção-de-jogos)
8. [Passo 6: Endpoints da API e Regras de Preço](#passo-6-endpoints-da-api-e-regras-de-preço)
9. [Passo 7: Como Integrar no Tema da Shopify (Frontend)](#passo-7-como-integrar-no-tema-da-shopify-frontend)
10. [Resolução de Problemas Frequentes](#resolução-de-problemas-frequentes)

---

## 1. Como o Sistema Funciona (Arquitetura)

```
[Loja Shopify (Tema/Frontend)]
       │
       │  1. Cliente seleciona os jogos e clica em "Finalizar Combo"
       ▼
[Netlify Function: create-combo]
       │
       │  2. Valida as variantes, consulta os preços na Shopify via GraphQL
       │  3. Calcula o desconto e cria o Draft Order oficial
       ▼
[Shopify Admin GraphQL API]
       │
       │  4. Retorna a Invoice URL (Link de Checkout com desconto aplicado)
       ▼
[Navegador do Cliente] ── Redireciona para o Checkout com o combo fechado
```

### ✅ Vantagens dessa estrutura:
- **Zero interferência entre lojas:** Cada loja tem seu próprio site Netlify, variáveis de ambiente e app Shopify independentes.
- **Preços dinâmicos e desconto visual:** Os jogos aparecem com seus valores reais e uma linha de desconto clara (ex: `- R$ 39,10`), evitando valores divididos estranhos no checkout.
- **Sem servidores para gerenciar:** Roda 100% gratuito na infraestrutura serverless do Netlify.

---

## 2. Pré-requisitos

- Acesso com permissão de administrador na loja Shopify.
- Conta no [GitHub](https://github.com) (gratuita).
- Conta no [Netlify](https://www.netlify.com) (gratuita).

---

## Passo 1: Criar o App na Shopify

Para que o backend consiga consultar produtos e criar pedidos na Shopify, precisamos de um App Privado.

1. Acesse o Admin da loja Shopify: **Configurações → Apps e canais de vendas → Desenvolver apps**.
   - *(Ou vá em [partners.shopify.com](https://partners.shopify.com) / Dev Dashboard caso use conta de parceiro).*
2. Clique em **Criar um app** (ou *Desenvolver apps no Dev Dashboard*).
3. Dê um nome para o app: `Combo Promocional Backend`.
4. Na aba de configurações/URLs:
   - **URL do app:** `https://SEU-SITE-NO-NETLIFY.netlify.app` *(se ainda não criou o Netlify, pode colocar provisoriamente `https://example.com` e atualizar no Passo 3)*.
   - **URL(s) de redirecionamento permitida(s):**
     ```text
     https://SEU-SITE-NO-NETLIFY.netlify.app/.netlify/functions/auth-callback
     ```
5. Na seção **Acesso à API (Escopos da Admin API)**, selecione:
   - `write_draft_orders`
   - `read_draft_orders`
   - `read_products`
   - `write_products`
6. Salve o app e anote:
   - **Client ID** (ID do cliente)
   - **Client Secret** (Chave secreta do cliente)

---

## Passo 2: Subir o Repositório no GitHub

1. Clone ou faça uma cópia deste projeto para a sua conta GitHub.
2. Certifique-se de que o arquivo `.gitignore` ignore `.env` e `node_modules`.
3. Suba o código para o repositório da sua organização ou usuário.

```bash
git init
git add .
git commit -m "Setup inicial backend combo"
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin master
```

---

## Passo 3: Criar e Configurar o Site no Netlify

1. Acesse o painel do [Netlify](https://app.netlify.com) e clique em **Add new site → Import an existing project**.
2. Conecte ao GitHub e selecione o repositório criado no Passo 2.
3. Nas opções de build:
   - **Build command:** *(deixe vazio)*
   - **Publish directory:** `public`
4. Clique em **Deploy site**.
5. Quando o deploy finalizar, anote a URL gerada (ex: `https://minha-loja-combo.netlify.app`).
   - *(Lembre-se de voltar no Passo 1 na Shopify e atualizar a URL do App e a URL de redirecionamento com esse domínio!)*

### Configurar Variáveis de Ambiente no Netlify:
No Netlify, vá em **Site configuration → Environment variables** e adicione as seguintes variáveis:

| Nome da Variável | Exemplo de Valor | Descrição |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | `sua-loja.myshopify.com` | Domínio padrão da loja (sem `https://`) |
| `SHOPIFY_CLIENT_ID` | `e4bfe4d27a9...` | Client ID gerado no app da Shopify |
| `SHOPIFY_CLIENT_SECRET` | `shpss_238397...` | Client Secret gerado no app da Shopify |
| `AUTH_CALLBACK_URL` | `https://SEU-SITE.netlify.app/.netlify/functions/auth-callback` | URL de callback OAuth do seu Netlify |
| `ALLOWED_ORIGIN` | `https://sua-loja.myshopify.com` | Domínio da loja para liberação de CORS |
| `COMBO_PRICE_CENTS` | `9990` | Preço padrão do combo em centavos (R$ 99,90) |
| `SHOPIFY_COLLECTION_ID` | `480176308313` | ID da coleção da loja que contém os jogos |

---

## Passo 4: Gerar o Access Token (`shpat_`)

Como os apps modernos da Shopify usam OAuth, criamos uma função automática para gerar o token com 1 clique:

1. Com o site publicado no Netlify e as URLs salvas no App da Shopify, abra no navegador logado na Shopify:
   ```text
   https://SEU-SITE.netlify.app/.netlify/functions/auth?shop=sua-loja.myshopify.com
   ```
2. A Shopify vai exibir a tela pedindo para instalar/autorizar o app.
3. Clique em **Instalar aplicativo** / **Autorizar**.
4. Você será redirecionado para uma tela verde de sucesso exibindo o seu Token de Acesso (`shpat_...`).
5. Copie esse token.
6. Vá no Netlify: **Site configuration → Environment variables**, crie a variável:
   - `SHOPIFY_ADMIN_TOKEN` = `shpat_xxxxxxxxxxxxxxxxxxxxxxxx`
7. Faça um redeploy no Netlify (**Deploys → Trigger deploy → Clear cache and deploy site**) para que as funções carreguem o novo token.

---

## Passo 5: Vincular a Coleção de Jogos

Para que a função de listagem de produtos (`get-products`) saiba quais jogos exibir:

1. No Admin da Shopify, vá em **Produtos → Coleções**.
2. Abra a coleção que contém os jogos do catálogo ou promoção (ex: *Catálogo Geral* ou *3 por 99*).
3. Olhe a URL no navegador:
   `https://admin.shopify.com/store/sua-loja/collections/`**`480176308313`**
4. Copie o número no final da URL.
5. No Netlify, defina a variável `SHOPIFY_COLLECTION_ID` com esse número e redeploye o site.

---

## Passo 6: Endpoints da API e Regras de Preço

### 1. Listar Produtos do Combo
- **Rota:** `GET /.netlify/functions/get-products`
- **Retorno:** Lista de produtos com títulos, fotos, variantes, licenças (primária/secundária) e estoque.

### 2. Criar Checkout do Combo
- **Rota:** `POST /.netlify/functions/create-combo`
- **Corpo da requisição (JSON):**
  ```json
  {
    "variantIds": ["47523098001497", "47523094397017", "47523109765209"],
    "comboType": "3-jogos",
    "phone": "(11) 98765-4321",
    "name": "Nome do Cliente"
  }
  ```
  *(Os campos `phone` e `name` são opcionais, mas recomendados para capturar o WhatsApp do cliente nos rascunhos de pedidos abandonados).*

### 🏷️ Tabela de Preços Pré-configurada:

#### Promoção "3 Jogos":
- **3 jogos:** R$ 99,90
- **4 jogos (+1 extra):** R$ 127,89
- **5 jogos (+2 extras):** R$ 151,88

#### Promoção "2 Jogos":
- **2 jogos:** R$ 99,90
- **3 jogos (+1 extra por R$ 43,70):** R$ 143,60
- **4 jogos (+2 extras):** R$ 187,30

### 💡 Como o cálculo do desconto funciona:
- O backend consulta o preço de venda atual de cada variante selecionada.
- Se a soma dos preços for inferior ao combo, ele consulta o preço de tabela original (`compareAtPrice`).
- Cada item é adicionado ao pedido pelo seu valor individual e o sistema aplica um **Desconto no Pedido** automático com a diferença exata.
- **Resultado:** O cliente vê os jogos com preços reais e uma linha de desconto atrativa, sem valores fracionados arbitrários (como R$ 33,30 ou R$ 49,95).

---

## Passo 7: Como Integrar no Tema da Shopify (Frontend)

No tema da Shopify (geralmente nos arquivos `Assets/combo.js`, `Sections/combo.liquid` ou similar), onde o botão de "Finalizar Pedido" é processado:

### 1. Atualizar a URL da API
Substitua a URL antiga pela URL do seu novo site Netlify:
```javascript
const COMBO_API_URL = 'https://SEU-SITE.netlify.app/.netlify/functions/create-combo';
```

### 2. Enviar a requisição ao clicar no botão
```javascript
async function finalizarCombo(selectedVariantIds) {
  // Identifica se a página atual é a promoção de 2 jogos ou 3 jogos
  const isCombo2 = window.location.pathname.includes('2-por');
  
  try {
    const response = await fetch('https://SEU-SITE.netlify.app/.netlify/functions/create-combo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variantIds: selectedVariantIds, // Array com os IDs das variantes selecionadas
        comboType: isCombo2 ? '2-jogos' : '3-jogos'
      })
    });

    const data = await response.json();

    if (data.checkoutUrl) {
      // Redireciona o cliente para o checkout oficial da Shopify com o combo
      window.location.href = data.checkoutUrl;
    } else {
      alert(data.error || 'Erro ao gerar o combo. Tente novamente.');
    }
  } catch (error) {
    console.error('Erro na requisição do combo:', error);
    alert('Erro de conexão com o servidor de checkout.');
  }
}
```

---

## Resolução de Problemas Frequentes

### 1. Erro OAuth `invalid_request`
> *"O redirect_uri e o URL do aplicativo devem ter hosts correspondentes"*
- **Causa:** O domínio preenchido na URL do App na Shopify é diferente da URL do redirect.
- **Solução:** Na tela do app na Shopify, certifique-se de que tanto a **URL do app** quanto as **URLs de redirecionamento permitidas** utilizem exatamente o mesmo domínio do Netlify (`https://SEU-SITE.netlify.app`).

### 2. "Um ou mais jogos selecionados não foram encontrados na loja"
- **Causa:** O tema ainda está apontando para o backend da loja antiga (ex: PlayHub), onde os IDs dos novos jogos não existem.
- **Solução:** No código do tema da nova loja, busque por `playhub` ou `netlify.app` e substitua pelo domínio do seu novo backend Netlify.

### 3. Valores fixos no checkout (R$ 33,30 ou R$ 49,95)
- **Causa:** Versão antiga do backend que dividia o valor igualmente quando a soma dos itens era inferior ao total.
- **Solução:** O código atual já trata isso automaticamente, resgatando os valores originais (`compareAtPrice`) e criando a linha de desconto.

---

Pronto! Seguindo estes passos, qualquer loja Shopify pode ter o backend de combos rodando de forma isolada, estável e escalável em menos de 10 minutos.

