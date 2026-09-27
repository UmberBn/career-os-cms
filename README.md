# CareerOS CMS

CareerOS CMS é uma plataforma pessoal construída com **Strapi v5**, **PostgreSQL** e **Node.js** para atuar como a fonte única de verdade da minha identidade profissional.

O projeto centraliza informações sobre minha carreira e disponibiliza esses dados através de uma API, permitindo que diferentes consumidores, como um **Custom GPT**, site pessoal e geradores de currículo, utilizem a mesma base de informações.

## Tecnologias

- Strapi v5
- PostgreSQL
- Node.js
- Docker

## Pré-requisitos

- Node.js
- Docker
- Docker Compose

## Executando o projeto

Instale as dependências:

```bash
npm install
```

Inicie o banco de dados:

```bash
docker compose up -d
```

Execute a aplicação:

```bash
npm run develop
```

O painel administrativo estará disponível em:

```text
http://localhost:1337/admin
```

## Consumidor externo (Custom GPT)

A Content API é a interface de leitura para consumidores externos. O Custom GPT consulta os dados publicados; não mantém uma cópia da trajetória.

### API Token

1. No Admin: **Settings → API Tokens → Create new API Token**.
2. Tipo: **Read-only**.
3. Copie o token uma vez e grave em `.env` (nunca no git):

```bash
CAREEROS_API_TOKEN=seu_token_aqui
```

Use o header `Authorization: Bearer <token>` em toda chamada.

### Validar a API

Com o Strapi rodando:

```bash
node --env-file=.env scripts/validate-consumer.mjs
```

Requires Node.js 20+ (`--env-file`). If your default `node` is older, use the project Node version (for example via nvm).

O script confere 403 sem token, 200 com token, populate esperado e ausência de `referenceContacts`.

### Túnel HTTPS (ngrok)

O ChatGPT na nuvem não alcança `localhost`. Para testes locais:

```bash
ngrok http 1337
```

Defina a origem HTTPS no `.env` e rode a validação de novo:

```bash
CAREEROS_PUBLIC_URL=https://seu-subdominio.ngrok-free.app
node --env-file=.env scripts/validate-consumer.mjs
```

Inclua o header `ngrok-skip-browser-warning: true` nas Actions (já declarado no OpenAPI).

### Montar a Action do Custom GPT

1. Abra [`docs/custom-gpt/openapi.yaml`](docs/custom-gpt/openapi.yaml) e substitua `REPLACE_WITH_NGROK_HOST` pela host do ngrok (sem `https://`).
2. Cole o schema na Action do Custom GPT.
3. Configure autenticação Bearer com o mesmo API Token Read-only.
4. Cole [`docs/custom-gpt/instructions.md`](docs/custom-gpt/instructions.md) nas instruções do GPT.

Limitações registradas em [`docs/integration-findings.md`](docs/integration-findings.md).

## Consumidor MCP (ChatGPT)

O conector MCP do ChatGPT autentica com OAuth 2.1. O facade fica no mesmo processo do Strapi e encaminha a chamada ao `/mcp` nativo. O Admin Token não sai do servidor.

1. No Admin: **Settings → Administration Panel → Admin Tokens**.
2. Conceda apenas leitura (`explorer.read`) em Profile, Company, Experience e Project. Deixe create, update, delete e publish desmarcados, e exclua `referenceContacts` da leitura.
3. Grave o token e os segredos do facade no `.env` (nunca no git):

```bash
CAREEROS_MCP_ADMIN_TOKEN=seu_admin_token
CAREEROS_OAUTH_PASSWORD=uma_senha_longa
CAREEROS_OAUTH_SIGNING_KEY=um_segredo_de_pelo_menos_32_caracteres
CAREEROS_PUBLIC_URL=https://seu-subdominio.ngrok-free.app
```

`CAREEROS_PUBLIC_URL` é o issuer. Sem barra no final. Quando a URL do ngrok muda, atualize a variável e reconecte o ChatGPT.

No conector, use a URL `${CAREEROS_PUBLIC_URL}/mcp`. Na tela de consentimento, informe `CAREEROS_OAUTH_PASSWORD`.

O Cursor local continua em `http://localhost:1337/mcp` com o Admin Token. A Content API do Custom GPT não muda.

## Documentação

O projeto utiliza uma documentação simples para manter a implementação alinhada com o domínio e as decisões arquiteturais.

### DOMAIN.md

Define a estrutura do domínio do sistema, incluindo:

- Collections
- Components
- Relacionamentos
- Convenções de modelagem

Toda implementação deve respeitar a estrutura definida neste documento.

### DECISIONS.md

Registra os princípios e decisões arquiteturais vigentes do projeto.

Este documento representa o estado atual da arquitetura e orienta a evolução do sistema. Não deve ser utilizado como histórico de alterações.
