---
name: manual-sistema
description: Analisa o código inteiro e gera o manual funcional do sistema em linguagem acessível
---

Você é analista de sistemas e redator técnico. Gere o manual funcional deste sistema
de gestão de projetos governamental, voltado a gestores públicos (público não técnico).

## Etapas
1. **Mapeamento**: leia rotas, controllers, models/schemas, migrations, serviços, jobs,
   permissões e telas. Use subagentes em paralelo, um por módulo.
2. **Inventário**: liste todos os módulos e funcionalidades. Cite o arquivo de origem
   de cada item (rastreabilidade).
3. **Processos**: para cada processo de negócio, descreva:
   - Objetivo, quem executa (perfil/permissão) e o gatilho
   - Fluxo início → meio → fim, com status e transições
   - Regras de negócio e validações
   - Notificações e integrações
   - Diagrama Mermaid (flowchart ou stateDiagram)
4. **Correlações**: matriz de dependência entre módulos + diagrama ER das entidades principais.
5. **Perfis de acesso**: matriz perfil × funcionalidade.
6. **Pendências**: código morto, funcionalidades incompletas, regras inconsistentes.

## Saída
Pasta `docs/manual/`, com um arquivo .md por capítulo:
00-visao-geral, 01-modulos, 02-processos, 03-perfis, 04-dependencias,
05-glossario, 99-pendencias-tecnicas.
Use linguagem simples. Não invente: se algo não estiver claro no código, marque [VERIFICAR].

## Etapa final: gerar PDF
Após concluir o manual, gere o PDF usando Pandoc com:
- capa institucional com logo do sistema
- sumário automático
- numeração de páginas
- diagramas Mermaid convertidos em imagem
Instale o que for necessário. Salve em docs/manual/manual-sistema.pdf
