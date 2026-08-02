# CareerOS CMS

CareerOS CMS é uma plataforma pessoal construída com **Strapi v5**, **PostgreSQL** e **Node.js** para atuar como fonte única de verdade da minha identidade profissional.

O projeto centraliza informações sobre minha carreira e disponibiliza esses dados através de uma API, permitindo que diferentes consumidores (como GPTs Customizados, site pessoal e geradores de currículo) utilizem a mesma base de informações.

## Tecnologias

- Strapi v5
- PostgreSQL
- Node.js
- Docker

## Executando o projeto

```bash
docker compose up -d
npm install
npm run develop
```

A aplicação estará disponível em:

```
http://localhost:1337/admin
```

## Documentação

O projeto utiliza uma documentação simples para manter a implementação alinhada com o domínio do sistema.

- **DOMAIN.md** — Define a estrutura do domínio, incluindo entidades, components, relacionamentos e convenções que orientam a implementação.

- **DECISIONS.md** — Registra as decisões arquiteturais e os princípios que orientam o projeto. Este documento representa o estado atual da arquitetura, não um histórico de alterações.