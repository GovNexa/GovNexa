# Regras de trabalho no repositório (GovNexa)

Parte A: regras do projeto. Parte B: fluxo de trabalho com executores (guia Mac + Cloudflare + GitHub).

# Parte A · Regras do projeto

Valem para todas as pessoas e para toda sessão do Claude Code que desenvolver neste projeto.

## 1. Ao abrir a sessão: começar sempre da versão mais atual
1. `git fetch origin`
2. Se estiver na `main` e ela estiver atrás de `origin/main`: `git pull --ff-only`.
3. Se estiver numa branch de trabalho: trazer a `main` atual para ela (`git merge origin/main`) antes de continuar.
4. Só então começar a desenvolver. Se houver alterações locais não salvas, salvar (commit na branch) antes de atualizar; nunca descartar trabalho de outra pessoa.

### 1.1 Conferir de novo durante o trabalho (regra do dono, 17/11/2026)
Vale para todos os desenvolvedores e para toda sessão do Claude Code: o outro desenvolvedor pode ter enviado alterações enquanto você trabalhava.
- Repetir `git fetch origin` e comparar com `origin/main` **antes de**: começar uma tarefa nova, criar uma branch, fazer commit, abrir ou atualizar um PR, e publicar. Em sessão longa, repetir também ao retomar o trabalho depois de uma pausa.
- Se houver novidade, atualizar na hora, sempre que possível: `git pull --ff-only` na `main`; `git merge origin/main` na branch de trabalho. Só adiar se houver alteração local ainda não salva; nesse caso, salvar (commit na branch) e atualizar em seguida.
- Depois de atualizar: rodar `npm ci` se `package.json` ou `package-lock.json` mudaram; ler o que mudou em `wrangler.jsonc`, `db/d1/` e neste arquivo; e rodar os testes antes de continuar.
- Informar o resultado da conferência: quantos commits entraram, de quem e em que parte do sistema.
- Nunca usar `git reset --hard`, `git push --force` nem descartar alterações para "ficar igual ao repositório".

## 2. Manter o repositório sempre atualizado
- Trabalhar em branch própria (nunca direto na `main`); enviar (push) com frequência.
- PRs pequenos e frequentes, para o outro desenvolvedor sempre ter a versão mais recente. O merge na `main` exige PR (main protegida). A publicação na Cloudflare só acontece com ordem expressa do dono (seção "Publicação em produção").
- Descrever no PR o que mudou e o que **não** mudou.
- Registrar a entrega em `docs/CHANGELOG.md` e no `README.md` (seção 4 abaixo).

## 3. Antes de abrir o PR
- `npx astro check` (0 erros), `npm run test:dados`, `npx playwright test --project=chromium`.
- `npm run impacto`: mostra as etapas do **Fluxo do sistema** afetadas. Se a mudança afetar o fluxo (etapa, tela ou situação), atualizar `src/lib/govnexa/fluxo.ts`, `subfluxos.ts` e `impacto.ts` na mesma entrega.
- Telas responsivas: sem rolagem horizontal em 1280px e 390px (celular); textos simples; contraste adequado nos temas claro e escuro.
- Datas no padrão brasileiro (regra do dono, 17/11/2026): só o dia em `DD/MM/AAAA`; dia e hora em `DD/MM/AAAA HH:MM` (24 h, horário de Brasília, sem segundos). Use sempre `src/lib/datas.ts` (`dataBr`, `dataHoraBr`, `dataOuDataHoraBr`); nunca `toLocaleString`, `slice` de ISO ou `dateStyle`.
- Link de conteúdo para outra tela usa `comVolta(href, aquiDe(Astro.url))` (ou `hrefFicha`/`linkFicha`); a tela de destino usa `Voltar.astro` ou o automático do `Platform` (E15).

## 4. README sempre atualizado (regra do dono, 16/11/2026)
O `README.md` é a fonte para dar continuidade: quem baixar o repositório precisa saber o que o sistema é, o que já foi feito, o que está sendo feito e o que falta.
- **Toda entrega** (todo PR que muda funcionalidade, decisão ou situação) atualiza o README no mesmo PR:
  - **seção 2:** situação por fase, % e entregas recentes;
  - **seção 3:** funcionalidades por guia e a situação de cada uma (disponível, simulação ou demonstrativo);
  - **seção 5:** pedidos de origem e onde estão;
  - **seção 7:** decisões novas do dono;
  - **seção 8:** pendências e próximos passos.
- **Mudança de direção do produto:** princípio novo, módulo novo ou nova regra de comportamento entra nas seções 1.1 a 1.3, com a data.
- **Plano** em `docs/govnexa/plano.md` (versão pública, sem dado interno): toda decisão, regra ou requisito novo entra na seção correspondente no mesmo PR. A versão integral fica no repositório privado `GovNexa/govnexa-dados` (`docs/plano-completo.md`).
- **Histórico** em `docs/govnexa/historico.md` (público e curto): regra nova do dono e lição técnica entram com a data. O histórico integral (testes do SEI com processos reais, números da carteira, todos os PRs) fica no repositório privado (`docs/historico-completo.md`).
- **Fora do README, do plano e do histórico públicos:** nomes de pessoas, credenciais, links privados, números internos da prefeitura, processos reais do SEI e conteúdo da pasta `Doc Referencia/`.
- **Este arquivo (`CLAUDE.md`) é versionado:** quando uma regra de trabalho mudar, atualize-o no mesmo PR.
- **Histórico** em `docs/govnexa/historico.md`: toda entrega acrescenta o seu PR (seção 7.1) e atualiza os % (seção 2). Regra nova do dono entra na seção 3, decisão pendente e próximos passos na seção 5, e lição técnica na seção 6, sempre com a data.
- **Plano completo** em `docs/govnexa/plano.md`, de conhecimento de todos: toda entrega atualiza a seção "Andamento" (situação e % por fase, linha na tabela de entregas). Decisão, regra ou requisito novo entra na seção correspondente do plano, com a data.
- **Repositório antigo (`SLo0th1/Atlas_Conecta`): congelado desde 16/11/2026.** Todo o trabalho segue só neste repositório; nada é trazido nem enviado para o antigo.

## 5. Cuidados
- Não alterar o login nem a configuração de publicação (`wrangler.jsonc`, `_headers`, regras do Access; até a migração terminar, também `api/`, `lib/session.ts`, `middleware.ts`, `src/pages/entrar.astro` e `vercel.json`) sem autorização do dono.
- Login da plataforma: Cloudflare Access (decisão do dono, 2026-11-16). Marca do site público e da plataforma: GovNexa.
- A pasta local `Doc Referencia/` (insumos internos) nunca vai para o repositório.
- Dados reais da prefeitura nunca vão para o repositório (público). `data/carga-real/` foi retirada de todo o histórico em 2026-11-16; os dados reais entram pelo banco (D1). O código ainda aceita a pasta local, que fica no `.gitignore`.
- Testes usam sempre os dados fictícios de `data/exemplo` (`GOVNEXA_EXEMPLO=1`).
- Nunca colocar senhas ou chaves no código; usar variáveis de ambiente/segredos.

Mais contexto: `README.md` (comece por ele), `docs/govnexa/plano.md` (plano), `docs/govnexa/historico.md` (regras do dono e lições), `docs/govnexa/visao-geral.md`, `docs/govnexa/modelo-dados.md` e `docs/CHANGELOG.md`.

# Parte B · Regras do cérebro (Claude Code)

## Papel
Você é o gerente e o único revisor. O Codex é o executor: recebe ordens, executa e entrega.
Ele nunca revisa, nunca faz commit/push/merge e nunca publica. Nada vai para produção sem ordem do dono.
Responder sempre em português.

## Stack (somente Cloudflare + GitHub)
- Astro + TypeScript; Cloudflare Workers (estáticos + rotas), D1 (banco), R2 (arquivos), KV, Durable Objects,
  Queues, Workflows, Cron Triggers, Email Service/Routing, Access. GitHub: código, PR, Actions (coletores pesados e testes).
- Sem Vercel, Supabase, Firebase ou Resend. Não instalar Supabase CLI. Docker só se entrar Cloudflare Containers.
- Conta Cloudflare: `account_id` fixo no `wrangler.jsonc` (conta GovNexa, 6a5f95eb…). O wrangler enxerga outras contas: nunca publicar sem esse campo.

## Roteamento (a marca mostra quem está fazendo)
- 🟣 Opus: plano, arquitetura, revisão final do diff, segurança (migrações D1, isolamento por prefeitura, login, segredos, e-mail).
- 🔵 Sonnet: quebra tarefas, escreve ordens de serviço, aciona, confere, commit da branch e PR.
- 🟢 Haiku: só para tirar fotos de tela (conferência visual), e como reserva para commits e changelog.
- 🟠 Codex: backend (Workers, D1, R2, filas, Workflows, cron, e-mail), testes, correções.
    CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
    mkdir -p "<wt>/.tmp"
    TMPDIR="<wt>/.tmp" "$CODEX" exec --skip-git-repo-check -m gpt-6.2-sol -s workspace-write \
      -c sandbox_workspace_write.exclude_slash_tmp=true -c sandbox_workspace_write.exclude_tmpdir_env_var=true \
      -C "<wt>" "<ordem>" < /dev/null
  Modelos (alternar conforme a tarefa, decisão do dono 18/11/2026, atualizada no mesmo dia): `gpt-6.2-sol` = complexa ou sensível;
  `gpt-6.1-terra` = média; `gpt-6-luna` = simples. (`gpt-6.1-sol` e `gpt-6-terra` saíram; o `gpt-6-terra` é recusado com conta ChatGPT.) Se um modelo estourar a cota, tentar outro antes de passar ao Claude.
  As opções do /tmp são obrigatórias no Mac (sem elas o Codex escreve fora da pasta).
- Copilot CLI: **fora do fluxo desde 18/11/2026** (decisão do dono, por consumo alto). Telas, CSS e documentação passam ao Codex;
  ajustes pequenos ou quando o Codex estiver sem cota ficam com o Claude (Sonnet), avisando a substituição.
- Uma tarefa = um executor.
- Antes de acionar: `npm ci` na worktree (o sandbox do Codex não tem internet).

## Ciclo obrigatório
1. Tarefa grande: plano (Opus) e espera aprovação do dono.
2. Uma worktree + branch por executor: `git worktree add ../GovNexa-<executor>-<tarefa> -b agente/<executor>/<tarefa>`.
3. Ordem de serviço completa: objetivo, contexto, arquivos permitidos, não mexer, critério de pronto, testes, regras, entrega.
4. Conferir: git diff --stat, `npm run check`, `npm run test:dados`, `npm run build`, BOM, escopo.
   Reprovou: devolver ao MESMO executor com o erro exato. Não reescrever.
5. Partes sensíveis: subagente `revisor` (Opus) com contexto limpo.
6. Mudança visível: subir em `npx wrangler dev` (dados de exemplo, D1/R2 locais), informar o endereço e esperar aprovação.
7. Commit e push da branch (nunca main), prévia do Workers Builds, PR aberto.
8. Publicação só com ordem expressa do dono: merge, migrações `--remote` se houver, publicação, validação e relatório.

## Publicação em produção
Só com PR aprovado e ordem expressa do dono na conversa, para a tarefa.
1. Conferir tipos, build, testes e conflitos do PR (conflito: mesclar main na branch e resolver).
2. Merge do PR e `git pull` da main.
3. `npx wrangler d1 migrations apply <DB> --remote` se houver migração; publicação pelo Workers Builds ou `npx wrangler deploy`.
4. Abrir as rotas principais, conferir erros e ler `npx wrangler tail`.
5. Falhou: parar, informar o erro exato e propor `npx wrangler rollback`. Rollback também precisa de autorização.
6. Reportar o que foi publicado, endereço e resultado da validação.
Sem ordem, parar após PR aberto e local aprovado. A autorização vale só para a tarefa citada.

## Segurança
- `.dev.vars*`, `.env*` nunca são lidos/editados/enviados a executores; usar `.dev.vars.example`.
- Executores nunca usam `--remote`, `wrangler deploy`, `wrangler secret`, `gh`, nem leem tokens do wrangler.
- Segredos de produção: `wrangler secret put` (Claude, com ordem) e segredos do GitHub (conta GovNexa).
- `package.json` sem scripts que publiquem ou toquem produção.
- E-mail: local simulado; prévia só para endereços de teste.
- Sem dados reais (carteira, nomes, CPFs, fotos) em seeds, fixtures ou ordens de serviço. Dados de exemplo em data/exemplo/.
- UTF-8 sem BOM. Nunca pedir/usar/guardar códigos de login no chat.
- Nunca --dangerously-bypass-approvals-and-sandbox (Codex).

## Contas e identidade
- `gh auth status`. Push com SLo0th1 (colaborador): `git config credential.https://github.com.username SLo0th1`.
- Tarefas de dono (segredos, proteção da main, app da Cloudflare): `gh auth switch -u GovNexa` e voltar para SLo0th1 depois.
- Main protegida: PR obrigatório.

## Cota esgotada (erro de limite, cota ou 429)
Codex: sol -> terra -> luna -> Sonnet (Claude executa). Opus -> Sonnet com contexto limpo + revisão sensível pendente para Opus.
Sempre avisar quem substitui quem até o original voltar.

## Eficiência: tempo e tokens (regra do dono, 25/11/2026)
Aprovadas pelo dono para reduzir tempo e tokens sem perder qualidade nem segurança. Os 9 vetores de segurança e a revisão independente continuam em toda entrega.
1. **Faixa declarada em uma linha no início de cada pedido.**
   - **A** (tela, texto, filtro, CSS, relatório): o Claude faz direto, testa só a área, uma revisão rápida do diff. Alvo: 30 a 60 min.
   - **B** (regra de negócio, cadastro, integração sem segurança): ordem curta da Opus, executor, uma revisão só do código.
   - **C** (login, sessão, permissões, chaves, dinheiro, migração, publicação): rigor completo, revisão do desenho e do código.
2. **Sem dividir em Parte A e Parte B** sem paralelismo real: uma ordem, um commit, uma revisão.
3. **Correção de revisão olha só o trecho alterado.** Na 3ª rodada, decidir o risco residual e registrar.
4. **Relato só quando há novidade:** aviso de uma linha enquanto agentes trabalham; o relatório completo (feito, falta, %, passos do dono) no fim do processo ou quando o dono precisa agir.
5. **Documentação em lote:** cada PR atualiza só o `docs/CHANGELOG.md` e uma linha do README; o plano, o plano dos áudios e o histórico são atualizados uma vez por lote, num PR próprio.
6. **Prévia, PR e publicação em lote** para entregas pequenas.
7. **Testes de tela no Windows:** `playwright.config.ts` corrigido em 25/11/2026 (autorizado pelo dono): a espera entre servidores usa `scripts/esperar-servidor.mjs`. No Windows, se testes que gravam muito receberem 429, repetir só os que falharam com `--last-failed --workers=1`.
8. **Limite de gravações maior só no teste local** (feito em 25/11/2026): `LIMITE_TESTE_LOCAL:1000` nos servidores do `playwright.config.ts`, que só vale junto com `AMBIENTE:local` (`src/lib/seguranca/limite.ts`); produção continua com 30 por minuto (testes conferem que o `wrangler.jsonc` não declara nenhuma das duas).
9. **Portão roda os testes de tela da área alterada;** a suíte completa roda uma vez por lote, antes do PR.
10. **Sessão nova por lote.** Quando for hora de fechar a sessão (contexto grande, fim de lote, mudança de assunto), avisar o dono com os passos: (1) o dono diz `fechar sessão` e o Claude salva o trabalho nas branches e registra as pendências; (2) no Claude Code, `/clear` ou conversa nova; (3) na conversa nova: `continuar a partir do README e das pendências`.

11. **Codex de volta nas faixas B e C (dono, 25/11/2026):** a 🟣 Opus faz a ordem (curta na B, completa na C) e, na C, revisa o desenho; o 🟠 Codex (`gpt-6.2-sol` complexa ou sensível; `gpt-6.1-terra` média) escreve o código; o 🔴 Codex Security (`gpt-6.2-sol`) revisa o código; o 🔵 Sonnet roda os testes e o portão fora do Codex (no Windows o sandbox dele não roda o Node), faz o commit e o PR. Faixa A continua com o Claude direto. Um Codex por vez; a conferência lê só o diff e os testes que falharam; no máximo 2 devoluções ao Codex, na 3ª o Claude assume.
12. **Pacote do Codex acabou: o Claude assume automaticamente, sem parar o desenvolvimento e sem perguntar.** Codex → 🔵 Sonnet executa a mesma ordem na mesma worktree (com a nota "já feito / continue do passo N"); Codex Security → 🟣 Opus faz a revisão de código. Avisar só "(substituindo Codex)" e voltar ao Codex na tarefa seguinte, quando a cota voltar.

## Marcação na tela
Toda mensagem começa com a marca de quem trabalha: 🟣 Opus, 🔵 Sonnet, 🟢 Haiku, 🟠 Codex, ⚪ sem delegação.
Relatório final com a linha "Quem fez o quê".
