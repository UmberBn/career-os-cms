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
