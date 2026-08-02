# DOMAIN

**Project:** CareerOS CMS
**Version:** 1.0
**Status:** Active
**Last Updated:** 2026-08-01

---

# Objetivo

Este documento descreve a estrutura do domínio do CareerOS.

Ele define as entidades, Components, relacionamentos e convenções utilizadas pelo sistema.

Toda implementação do Strapi deve seguir este documento.

---

# Visão Geral

```
Profile (Single Type)

└── Experience
    │
    ├── Company (opcional)
    │
    └── Project
            ├── Technology[]
            ├── Achievement[]
            └── Link[]
```

---

# Single Types

## Profile

Representa minha identidade profissional.

### Campos

| Campo        | Tipo                         |
| ------------ | ---------------------------- |
| name         | String                       |
| headline     | String                       |
| summary      | Rich Text                    |
| location     | String                       |
| languages    | JSON / Component (a definir) |
| github       | String                       |
| linkedin     | String                       |
| website      | String                       |
| availability | Enumeration                  |

---

# Collections

## Company

Representa uma organização.

### Campos

| Campo       | Tipo      |
| ----------- | --------- |
| name        | String    |
| website     | String    |
| industry    | String    |
| description | Rich Text |

### Components

* ReferenceContact (Repeatable)

---

## Experience

Representa uma etapa da carreira.

### Campos

| Campo            | Tipo                          |
| ---------------- | ----------------------------- |
| title            | String                        |
| type             | Enumeration                   |
| company          | Relation (Company) - Opcional |
| startDate        | Date                          |
| endDate          | Date                          |
| summary          | Rich Text                     |
| responsibilities | Rich Text                     |

### Type

* Employment
* Personal Project
* Open Source
* Research
* Volunteer

### Relações

* Company (Many to One)
* Projects (One to Many)

---

## Project

Representa um trabalho executado durante uma Experience.

### Campos

| Campo       | Tipo      |
| ----------- | --------- |
| name        | String    |
| description | Rich Text |

### Narrative

A Narrative é composta pelos seguintes campos:

| Campo    |
| -------- |
| Context  |
| Problem  |
| Solution |
| Result   |

### Components

#### Technology (Repeatable)

#### Achievement (Repeatable)

#### Link (Repeatable)

### Relações

* Experience (Many to One)

---

# Components

## ReferenceContact

| Campo    | Tipo   |
| -------- | ------ |
| name     | String |
| role     | String |
| email    | Email  |
| phone    | String |
| linkedin | String |

---

## Technology

| Campo    | Tipo   |
| -------- | ------ |
| name     | String |
| category | String |

---

## Achievement

| Campo       | Tipo      |
| ----------- | --------- |
| title       | String    |
| description | Rich Text |
| impact      | String    |
| metrics     | String    |

---

## Link

| Campo | Tipo   |
| ----- | ------ |
| label | String |
| url   | String |

---

# Relacionamentos

```
Company (1)
      │
      ▼
Experience (N)
      │
      ▼
Project (N)
```

Profile é independente e representa a identidade profissional do sistema.

---

# Convenções

## Components

Sempre que uma informação não possuir ciclo de vida próprio, ela deve ser implementada como Component.

---

## Collections

Collections representam conceitos independentes do domínio.

---

## Narrative

Todo Project deve possuir uma Narrative.

Ela será utilizada pela IA para responder perguntas sobre experiências, entrevistas e geração de documentos.

---

## Fonte da Verdade

As informações cadastradas neste domínio representam a única fonte oficial de dados do CareerOS.

Nenhuma aplicação consumidora deve manter cópias dessas informações.
