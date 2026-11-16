# Arquitetura — bloco Captação

> **Nota de 16/11/2026:** documento anterior à migração. Onde diz Vercel, hoje é Cloudflare Workers; o login é o Cloudflare Access; o banco é o Cloudflare D1. Situação atual no README e em docs/govnexa/historico.md.

Resumo vivo (detalhes e decisões em `plano-execucao.md`).

- **Frontend:** Astro + TypeScript, páginas estáticas (rodam em qualquer hospedagem: Vercel hoje; Hostinger ou servidor próprio depois).
- **Coletores:** scripts Node/TypeScript em `coletores/`, agendados pelo GitHub Actions (repositório público: somente dados públicos; chaves em segredos, nunca no código).
- **Dados:** `data/raw` (bruto, fora do Git) → `data/core/*.json` (tratado, com proveniência) → telas, sempre por `src/lib/dados/` (hoje JSON; depois PostgreSQL, sem mudar as telas).
- **Proveniência em todo valor:** fonte, url_origem, data_referencia, data_coleta, id_carga, hash_arquivo.
- **Multimunicípio:** tudo indexado por código IBGE e CNPJ; município piloto em `data/config/municipio.json`.
- **Banco futuro:** PostgreSQL (decisão do dono, 2026-11-09). Esquema das entidades: Plano Mestre, Parte 4.
- **Login:** continua o atual (um usuário, funções da Vercel) até a etapa de perfis.

## Plataforma no Worker e D1
O site público continua pré-renderizado. Todas as rotas de /plataforma/ são montadas por requisição pelo adaptador Cloudflare, inclusive a agenda.
O middleware valida o JWT Access e procura o e-mail ativo no DB_CENTRAL. A prefeitura e o binding D1 vêm exclusivamente desse cadastro.
O repositório em locals abastece um contexto isolado por requisição para projetos, cronogramas e histórico; as respostas usam private, no-store e cabeçalhos de segurança.
Salas, reuniões, WhatsApp, geocodificação por bairro e demais módulos demonstrativos conservam exemplos versionados, identificados na tela. A Captação conserva os JSON públicos empacotados no servidor.
Para preparar os dois bancos locais: npm run db:local. DEV_EMAIL seleciona o administrador local (padrão dev@exemplo.invalid). O script só aceita operações locais.
A liberação local exige ACESSO_LOCAL_LIVRE=1 e hostname localhost ou 127.0.0.1, e ainda exige cadastro ativo no banco central.
