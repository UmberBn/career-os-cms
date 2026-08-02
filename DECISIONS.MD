# DECISIONS

**Project:** CareerOS CMS
**Version:** 1.0
**Status:** Active
**Last Updated:** 2026-08-01

---

## Objetivo

Este documento descreve as decisões arquiteturais atualmente adotadas pelo CareerOS.

Seu objetivo é registrar o estado atual da arquitetura e do domínio do sistema. Este documento deve refletir sempre o estado atual do projeto.

---

## Filosofia do Projeto

O CareerOS é uma fonte única de verdade sobre minha trajetória profissional.

Todas as aplicações que consumirem essas informações (GPT Custom, site pessoal, currículo, LinkedIn ou futuras integrações) devem utilizar a mesma base de dados.

O sistema não existe para gerar currículos.

O sistema existe para armazenar conhecimento sobre minha carreira.

Currículos, cartas de apresentação e demais artefatos são representações derivadas desse conhecimento.

---

## Escopo

O CareerOS é um projeto pessoal.

Seu objetivo é centralizar minha identidade profissional e automatizar processos relacionados à minha carreira.

Embora faça parte do meu portfólio, ele não possui objetivo comercial.

---

## Fonte da Verdade

As entidades do domínio representam a única fonte oficial das informações.

Não deve existir duplicação de dados apenas para facilitar consultas ou geração de documentos.

---

## Papel da IA

A IA não armazena conhecimento.

Sua função é interpretar, organizar e apresentar informações existentes no CareerOS.

Toda resposta produzida deve ser fundamentada nos dados cadastrados.

---

## Modelagem do Domínio

A modelagem prioriza simplicidade.

Novas entidades somente devem ser criadas quando representarem um conceito independente do domínio.

Informações dependentes de outra entidade devem ser modeladas como Components do Strapi.

---

### Experience

Experience representa uma etapa relevante da carreira.

Ela pode representar:

* Employment
* Personal Project
* Open Source
* Research
* Volunteer

Uma Experience não representa exclusivamente um vínculo empregatício.

---

### Company

Company representa uma organização.

A associação entre Experience e Company é opcional.

Nem toda Experience possui uma empresa associada.

---

### Project

Project representa um trabalho executado dentro de uma Experience.

Cada Project deve possuir uma Narrative estruturada contendo:

* Contexto
* Problema
* Solução
* Resultado

A Narrative será utilizada como base para geração de conteúdos por IA.

---

### Components

O projeto utiliza os seguintes Components:

* ReferenceContact
* Technology
* Achievement
* Link

Components não possuem ciclo de vida próprio.

---

### Skills

Não existe uma Collection chamada Skill.

As competências são representadas pelas tecnologias utilizadas em cada Project.

---

### Achievements

Achievements não existem como Collection.

Toda conquista pertence exclusivamente a um Project.

---

### Evolução

O domínio deve permanecer pequeno.

Sempre que possível, o modelo existente deve ser evoluído antes da criação de novas entidades.
