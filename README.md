# GovNexa — Inteligência para a gestão pública

Portal público e plataforma de gestão pública **GovNexa**. O piloto é a Prefeitura de Goiânia.

- **Produção:** https://govnexa.com.br e https://www.govnexa.com.br (Cloudflare Worker).
- **Repositório:** [GovNexa/GovNexa](https://github.com/GovNexa/GovNexa), público. Só entram código, dados públicos e dados fictícios; dados reais nunca entram.
- **Para continuar o projeto, leia nesta ordem:**
  1. este README: o que é, onde estamos, o que falta;
  2. [docs/govnexa/plano.md](docs/govnexa/plano.md): como o sistema deve ser, em detalhe (com a nota da migração para o Cloudflare);
  3. [docs/govnexa/historico.md](docs/govnexa/historico.md): tudo o que aconteceu, as regras do dono com data, os testes do SEI, o que vem a seguir, as lições técnicas e todos os PRs (do repositório novo e do antigo);
  4. [CLAUDE.md](CLAUDE.md): as regras de trabalho.

Situação descrita em **17/11/2026**.

## 1. O que é o GovNexa

O GovNexa nasceu para substituir a planilha de obras prioritárias da prefeitura. O objetivo é acompanhar cada projeto do começo ao fim:

1. a ideia ou demanda;
2. a captação de recursos (convênios e emendas);
3. a contratação pela Lei 14.133;
4. a execução da obra;
5. a entrega à população.

São módulos independentes que conversam entre si:

| Módulo | Para quê |
| --- | --- |
| **Projetos** (núcleo) | Carteira de projetos, macroetapas, cronogramas, onde está parado, movimentação com histórico, reunião semanal, sala de guerra e SEI |
| **Captação** | Convênios, programas abertos, CAUC, repasses, alertas e parecer de elegibilidade com dados públicos |
| **Licitações** | Prazos da Lei 14.133 e licitação em detalhe |
| **Gestão** | Painel do prefeito, Central de alertas e WhatsApp |
| **Conta** | Perfil e configurações |

**Premissas do produto:**
- Goiânia é o piloto. Cada prefeitura terá dados isolados; o município e o banco são escolhidos pelo cadastro ativo, não pela URL.
- O site público é pré-renderizado. A plataforma é montada em cada acesso pelo Worker e lê o banco D1.
- Os dados operacionais ficam em Cloudflare D1, um banco por prefeitura, com um banco central para cadastros e importações.
- O MVP não usa IA. A IA fica para a Fase 5, sempre com revisão humana.
- **Documentação de continuidade:** leia [plano adaptado](docs/govnexa/plano.md) e [histórico adaptado](docs/govnexa/historico.md), além deste README. As versões integrais ficam no repositório privado de dados.
- **Ordem de leitura:** README, plano, histórico, [CLAUDE.md](CLAUDE.md).
- **Este README é a fonte para dar continuidade.** Ele é atualizado em toda entrega: situação, funcionalidades, decisões e pendências. A regra está no [CLAUDE.md](CLAUDE.md).

### 1.1 Problema, visão e princípios

**Problema.** A carteira, com cerca de 400 projetos, vive em planilhas editadas à mão. Os cronogramas de cada obra ficam em abas separadas, e os painéis são montados manualmente toda semana. Ninguém responde de imediato:
- onde o projeto está parado;
- com quem;
- há quantos dias;
- quanto do orçamento não tem fonte.

**Visão.** O GovNexa é a base única da carteira de projetos da prefeitura, do desejo do gestor à obra entregue. Ele substitui a planilha de obras prioritárias e conecta captação de recursos, contratação (Lei 14.133/2021) e painel do prefeito.
- Um projeto é cadastrado **uma vez**, e todas as telas são visões dele: carteira, Kanban, Gantt, cronograma, captação, licitação, painel e WhatsApp.
- O sistema **calcula** status, prazos e alertas. A equipe só registra fatos: iniciou, concluiu, enviou, voltou.

**Princípios** (valem para todo código novo):

| Princípio | Na prática |
| --- | --- |
| Uma fonte da verdade | O projeto é único; os módulos se ligam a ele por referência |
| Calcular, não digitar | Status, %, farol, entrega projetada, saldo sem fonte, atraso em cascata e economia saem de regras |
| Dado ausente não é zero | Fica "—" e entra em pendências de dado; nunca se inventa data ou valor |
| Toda espera tem dono | Etapa parada mostra quem deve o quê e desde quando |
| Simples para quem usa | Fichas em texto, poucos cliques, sem rolagem lateral, funciona no celular |
| Origem preservada | Todo dado guarda fonte, data e valor original importado; toda alteração vai para o histórico |
| Qualquer caminho, mesma regra | O projeto anda ou volta pelo Kanban, pela ficha, pelas Pendências ou pelo SEI, sempre pelo mesmo motor e com o mesmo registro |
| Gestão leve | PMBOK para marcos, linha de base e caminho crítico; execução ágil em Kanban; sala de guerra no padrão PMI |
| Nada fixo em Goiânia | Município, logo, feriados e metas vêm de configuração; cada prefeitura tem acesso e dados isolados |
| Lei é teto, meta é menor | A prefeitura define metas internas menores que a Lei 14.133; passar do teto legal é alerta grave; o prazo-piso não se encurta |

### 1.2 Como o produto chegou até aqui (histórico das decisões)

1. **09 e 10/11/2026 — início do bloco Captação.** O projeto começou como portal público **Atlas Goiânia Conecta**, com coletores de dados públicos (Transferegov, CAUC, SICONFI, FNS, DOU, INEP, CNES, SINISA), alertas, comparativo entre capitais e parecer de elegibilidade sem IA. O portal antigo era hospedado na Vercel. A decisão de 16/11 é desligar essa hospedagem e manter o produto na Cloudflare + GitHub.
2. **15/11/2026 — foco no GovNexa.** As necessidades do produto mudaram o foco para **gerir a carteira de projetos**, não só captar recursos:
   - marca **GovNexa — Inteligência para a gestão pública**;
   - começar pelo módulo Projetos, com a Carteira substituindo a planilha;
   - módulos independentes e integrados: Projetos (núcleo), Captação, Licitações/Contratação e Gestão;
   - sem IA no MVP;
   - nenhum nome de pessoa no repositório.
3. **15/11 — Fases 0, 1, 1.5 e 2:**
   - marca e menu por módulo;
   - carteira importada da planilha (334 projetos);
   - Kanban, Gantt e Visão por órgão;
   - motor de movimentação e histórico;
   - cronogramas do GEPP e Onde está parado;
   - Reunião semanal e Sala de guerra;
   - Fluxo do sistema como mapa oficial, atualizado a cada mudança.
4. **15 e 16/11 — Fases 4 e 5:** Prazos da Lei 14.133 com metas internas, Painel do prefeito, Mapa das obras, Central de alertas e WhatsApp em simulação.
5. **16/11 — SEI e licitações:** o link público do SEI abre sem captcha; documentos públicos podem ser lidos e documentos restritos entram por PDF, sem contornar captcha. Foram entregues Processos no SEI e Licitação em detalhe em simulação. Dependências entre etapas usam a opção A, deduzidas pela ordem e pelas datas, a revisar com o cliente.
6. **16/11/2026 — migração para Cloudflare + GitHub (GovNexa):**
   - Repositório público `GovNexa/GovNexa`; dados reais nunca entram. `data/carga-real/` foi retirada de todo o histórico.
   - Site e plataforma em https://govnexa.com.br e https://www.govnexa.com.br, servidos por Cloudflare Worker. A hospedagem antiga será desligada.
   - Astro 7 + `@astrojs/cloudflare`: site público pré-renderizado; `/plataforma/` montada a cada acesso no Worker, lendo D1. `worker/entrypoint.ts` encaminha as páginas `/entrar/*` ao Astro e trata `/sair` e `/api`; `src/middleware.ts` valida o login e escolhe o banco.
   - Cloudflare D1 (SQLite): um banco por prefeitura (`govnexa-5208707` para Goiânia) e banco central `govnexa-central` para prefeituras, usuários e importações. Migrações atuais em `db/d1/central` e `db/d1/prefeitura`; `db/migracoes/` é a referência PostgreSQL antiga. O histórico é imutável; fotos e documentos só têm remoção lógica. Arquivos ficam no R2 `govnexa-documentos`. Supabase/PostgreSQL é apenas plano B.
   - Login próprio do GovNexa desde 17/11/2026: e-mail e senha + verificação em 2 etapas (aplicativo autenticador), com cadastro ativo no banco central. Até 17/11 o acesso era pelo Cloudflare Access. Perfis: admin, gestor, editor e leitura; durante a construção, todos os usuários são admin. Quem passa no Access, mas não está cadastrado, vê "Sem permissão".
   - Carga inicial no D1 de produção em 16/11: 334 projetos, 13 cronogramas e 725 etapas. O código 450 estava repetido (SECAP e SEINFRA); o da SECAP virou 506. Planilhas novas são importadas do repositório privado `GovNexa/govnexa-dados` por uma rotina do GitHub (etapa 3.5, ver a seção 6).
   - Marca GovNexa no site público, login e plataforma. Contato: contato@govnexa.com.br.

### 1.3 Roteiro por fases

| Fase | Objetivo | Portão de aceite |
| --- | --- | --- |
| 0 · Base e identidade | Marca, menu por módulos, município configurável | Plataforma com a marca e o menu novos |
| 1 · Carteira de Projetos | Substituir a planilha: carteira, ficha, Kanban, Gantt, por órgão | Carga conciliada com a planilha |
| 1.5 · Cadastro e movimentação | Projeto nasce no cadastro e anda ou volta por qualquer caminho, com histórico | Gravar de verdade no banco |
| 2 · Cronograma e equipe | Cronogramas, quem está com cada tarefa, onde está parado, reunião semanal e SEI | Leitura diária do SEI gravada no banco |
| 3 · Produção com banco (Cloudflare D1) | Gravação, perfis por secretaria e isolamento por prefeitura | Simulações viram gravação real no D1 |
| 4 · Contratação, convênios e Gestão | Lei 14.133 ponta a ponta, cláusula suspensiva, painel do prefeito e medições | PNCP e datas reais por licitação |
| 5 · Integrações e inteligência | PNCP, SIMEC, SISMOB, SINAPI e GOINFRA, WhatsApp real, IA com revisão humana | Conta do WhatsApp Business; IA aprovada |

## 2. Situação atual (19/11/2026)

| Fase | O que entrega | Situação | % |
| --- | --- | --- | --- |
| Planejamento | Plano, decisões, rastreabilidade, Fluxo do sistema, fluxos detalhados, mapa de impacto | Publicado; Fluxo com zoom e legenda recolhida | 97% |
| 0 · Base e identidade | Marca GovNexa, menu por módulos, tema estável, paginação | Publicada; blocos do menu começam fechados | 100% |
| 1 · Carteira de Projetos | Carteira, ficha, Kanban, Gantt, Visão por órgão, celular | Entregue; carga inicial no D1 | 100% |
| 1.5 · Cadastro, movimentação, log, sala de guerra | Novo projeto, Kanban e Pendências, Histórico, Sala de guerra | E1 em 70%, com edição pela ficha, área e marca de prioritário disponíveis no código. Aguardando revisão, migração 0007 e publicação | 95% |
| 2 · Cronograma e equipe | Cronogramas, quadro de tarefas, Onde está parado, Reunião semanal, dependências, SEI | Telas entregues; leitura automática do SEI a fazer | 90% |
| 3 · Produção com banco (Cloudflare D1) | Tabelas, carga real, perfis e isolamento por prefeitura | Tabelas em produção, carga feita; plataforma lendo o D1 no ar desde 16/11; leitura otimizada no ar desde 16/11. Importação das planilhas no ar e gravada em 16/11 (3.5). Documentos (3.4) publicados em 17/11. Usuários: lista, cadastro, convites e login próprio com 2FA no ar desde 17/11 | 95% |
| 4 · Contratação, convênios e Gestão | Lei 14.133, alertas, dashboard do prefeito, licitação em detalhe | Prazos da lei, dashboard em três níveis, filtros e modo apresentação; mapa, Central de alertas e Licitação em detalhe; parte ainda em simulação | 75% |
| 5 · Integrações e inteligência | PNCP, SIMEC, SISMOB, preços, WhatsApp, IA | WhatsApp em simulação | 10% |

### Entregas recentes

- 22/11/2026: E10, Painel da equipe (o que saiu da tela do prefeito, mais os alertas) e relatório de inconsistências por órgão ou geral, com impressão e CSV (branch agente/codex/e10-equipe; aguardando portão, prévia do dono e revisão).
- 22/11/2026: E6, ficha única do projeto (página inteira aberta pela Carteira, abas, Governança no fim; guia Localização e fotos fora do menu) (branch agente/codex/e6-ficha; aguardando portão, prévia do dono e revisão).
- 22/11/2026: E5, Carteira de projetos com grandes números, colunas do relatório, filtros com "Só prioritários", grupos por macroetapa e impressão; a Visão por órgão foi incorporada (branch agente/codex/e5-carteira; aguardando revisão).
- 22/11/2026: E2, padrão visual das telas de Projetos (fundo claro e neutro nos dois temas) e filtros padrão, aplicados no Gantt geral (branch agente/codex/e2-filtros; aguardando revisão).
- 22/11/2026: E3, tela inicial do prefeito "Projetos prioritários": obras por área, quantidade e valor por etapa, linha do tempo de entregas até dez/2028, próximas entregas e principais obras; todo número vira filtro no endereço; sem farol, prazos, decisões e convênios (branch agente/codex/e3-prefeito; aguardando prévia do dono e revisão).

17/11: login próprio com senha e 2FA publicado e ligado em produção (`LOGIN_MODO=senha`); convites enviados aos administradores; Cloudflare Access retirado da plataforma.

| Data | O que | Referência |
| --- | --- | --- |
| 20/11 | Mapa das obras no dashboard: versão compacta com os filtros do dashboard; tocar amplia para a apresentação em tela cheia da Gestão. Verificação de layout em 10 tamanhos de tela e dos modos de apresentação | novo PR |
| 19/11 | Verificação completa e correções: Esc fecha o menu e a lista de filtro do mapa também no Safari; contorno de foco do painel de detalhes só pelo teclado; link do mapa sublinhado no editor de localização; frase da Qualidade dos dados com data DD/MM/AAAA; testes do Safari estabilizados | novo PR |
| 18/11 | Entrega B2: Novo projeto grava no banco (macroetapa 00, código único P-N, cadastro no Histórico); migração 0006 (índice único do código) aplicada e publicada em 18/11 | PR #34 |
| 17/11 | Entrega B1: página do projeto (todas as informações num só endereço) e localização gravando no banco; migração 0004 | PR #29 (no ar desde 18/11/2026) |
| 17/11 | Projeto do banco de dados aprovado: princípios e roteiro B1 a B8, na ordem do Fluxo (`docs/govnexa/projeto-banco.md`) | PR #28 |
| 17/11 | Entrega 1.1: tipo do documento (DFD, ETP, TR) no envio e na lista, com registro no Histórico; migração 0003 aplicada | PR #27, publicada em 17/11 |
| 17/11 | Entrega 1.0: limite de 30 ações por minuto por pessoa nos documentos (Rate Limiting da Cloudflare) | PR #15, publicada em 17/11 |
| 17/11 | Site público: logo do GovNexa no cabeçalho (versão provisória), menu do topo só com "Acessar plataforma" e "Solicitar demonstração", e marca-d'água em forma de mapa de cidade na página inicial | novo PR |
| 17/11 | Página inicial nova do site público: apresenta o GovNexa como gestão de projetos públicos, com o ciclo do projeto por rolagem, módulos e entrada da plataforma (animações com GSAP, empacotado no próprio site) | novo PR |
| 17/11 | Etapa 3.3 (opção B): guia Usuários, lista somente leitura de quem tem acesso (só administrador) | novo PR |
| 17/11 | Etapa 3.4 publicada: migração 0002 aplicada e documentos no ar | PR #10 e #13 |
| 16/11 | Etapa 3.4: documentos de projeto no R2 (envio, download como anexo e remoção lógica) | PR #10 |
| 16/11 | Primeira gravação das planilhas em produção: 334 atualizados, 0 novos, 0 pulados | rotina do repositório de dados |
| 16/11 | Etapa 3.5: importação das planilhas (rotina, regras de segurança dos dados, avisos e testes) | PR #9 |
| 16/11 | Menu lateral com ícones por item, tipografia única, início recolhido, lista flutuante de itens, sanfona e usuário no rodapé | Plataforma |
| 17/11 | Publicados: dashboard do prefeito (3 níveis, efeitos, pontos de atenção, atualização a cada 5 min, modo apresentação), menu retraído, tema claro com barra branca, datas DD/MM/AAAA HH:MM e guia Usuários | PR #12 e PR #14 |
| 16/11 | Início da plataforma como dashboard do prefeito: filtros por URL, 10 indicadores, detalhamento acessível em painel e modo apresentação | `/plataforma/` |
| 16/11 | Otimização publicada (versão 2e1114fa); repositório privado de dados conferido | PR #7 |
| 16/11 | Leitura do banco otimizada: só a guia aberta é montada e cache de 30 s (páginas de ~400 ms para ~20 ms) | PR #6 |
| 16/11 | Plano e histórico completos trazidos para o repositório novo; repositório antigo congelado | PR #5 |
| 16/11 | Regras e preparo do repositório novo | PR #1 |
| 16/11 | Worker, Access e marca GovNexa | PR #2 |
| 16/11 | D1, plataforma lendo o banco e adaptação da Licitação em detalhe | branch `etapa-3`; PR #45 já incorporado |

O detalhe das entregas está em [docs/CHANGELOG.md](docs/CHANGELOG.md).

## 3. Funcionalidades por guia

O mapa usa os centros dos bairros da tabela D1 `bairro_geo`, isolados por prefeitura e no cache de 30 s. Sem banco, com tabela vazia ou erro de leitura, mantém o JSON de exemplo. Obras posicionadas pelo bairro têm precisão `bairro`; a região é preservada. O visual permanece igual.

No início (/plataforma/), todos os módulos do menu ficam retraídos: o dashboard não pertence a um módulo. Nas outras telas, a sanfona abre somente o módulo e o sub-bloco da página atual. Nome, iniciais, Meu perfil e Sair ficam apenas no cabeçalho; os links da conta têm alvos de toque de pelo menos 44 px.

Legenda: **Disponível** = leitura ou operação disponível. **Simulação** = as regras rodam, mas a gravação real ainda será ligada nas próximas partes da etapa 3. **Demonstrativo** = protótipo com dados fictícios.

### Conta e acesso

Guia Usuários: cadastro, convite por e-mail, reenvio, perfil, ativação e redefinição do aplicativo, só para administradores da mesma prefeitura. Login próprio: senha, aplicativo autenticador obrigatório e recuperação de senha. Disponíveis no código, aguardando publicação e validação da interface; envio local simulado.

### Dashboard: efeitos, alertas e atualização automática

Desde a E10 (22/11/2026) este painel é o **Painel da equipe** (Gestão › Painel da equipe, `/plataforma/gestao-equipe/`), só para administrador, gestor e editor. O mapa compacto descrito no fim desta seção saiu do painel; o mapa por área é da E4.

Os dez cartões entram em sequência e contam até o valor calculado em cerca de 800 ms quando visíveis. Sem JavaScript, com movimento reduzido ou na impressão, os valores finais permanecem disponíveis. Campos ausentes continuam “—”. Críticos têm indicador com ícone e texto e faixa de até três links; atenção usa indicador estático. Hover e foco explicam o cálculo, também disponível no painel, cujo esqueleto dura 240 ms.

“Atualizar agora” e a consulta automática a cada cinco minutos renovam faixa, cartões e listas sem recarregar; números alterados recebem seta e realce por quatro segundos. O painel aberto é preservado. Aba oculta pausa consultas; falhas mantêm os dados e informam nova tentativa. A apresentação limita a altura dos cartões, amplia a tipografia e mostra funil e decisões abaixo. O botão do cabeçalho alterna para Sair da apresentação; Esc também sai. Dicas ficam dentro dos cartões e o cálculo aparece compacto abaixo do resumo no painel.

Mapa das obras no dashboard (20/11/2026): versão compacta logo abaixo dos indicadores, com os mesmos filtros do dashboard (região, órgão, prioridade e compromisso). Tocar no mapa ("Ampliar mapa") abre a mesma apresentação em tela cheia do mapa da Gestão (filtros, painel e ficha); ao sair, volta à cidade inteira. O mapa fica fora da área renovada a cada cinco minutos: não é recriado nem sai da tela cheia, e só recebe dados novos quando eles mudam. O estado do mapa não vai para o endereço do dashboard. Sem tela cheia no aparelho (iPhone), o toque abre o mapa na Gestão. Na apresentação do próprio dashboard o mapa fica escondido.

### Tema claro/escuro

O tema claro usa menu lateral branco, texto e ícones azul-escuros, destaques azul-claros e KPIs claros. O tema escuro conserva a barra em gradiente azul-escuro. A preferência persiste entre páginas. Menu aberto, recolhido e lista flutuante possuem contraste AA e alvos de pelo menos 44 px.

### Navegação da plataforma

| Funcionalidade | O que oferece | Situação | Código |
| --- | --- | --- | --- |
| Menu lateral | Ícones por item e tipografia única; começa recolhido com ícones dos módulos e abre uma lista flutuante com todos os itens; blocos em sanfona e identificação do usuário logado, com iniciais e nome, no rodapé | Disponível | `src/layouts/Platform.astro`, `src/components/Icon.astro`, `src/styles/` |

### Projetos

| Guia | O que faz | Situação | Código |
| --- | --- | --- | --- |
| Projetos · Início | Resumo da carteira por macroetapa: quantidade, valor e farol de prazo | Disponível | `src/lib/carteira/` |
| Fluxo do sistema | Diagrama em raias com etapas, validações, responsáveis e links para as telas; inclui fluxos detalhados e zoom | Disponível | `src/lib/govnexa/fluxo.ts`, `subfluxos.ts`, `src/components/fluxo/` |
| Novo projeto | Cadastro com área e marca de prioritário. Grava na macroetapa 00, usa códigos a partir de P-9000 e registra no Histórico | Disponível no código (B2 e E1) | `src/components/carteira/NovoProjeto.astro` |
| Carteira de projetos | Grandes números que seguem os filtros, colunas do relatório por órgão, filtros padrão com "Só prioritários", grupos por macroetapa da entrega mais próxima à mais distante, impressão e ficha completa | Disponível (E5) | `src/components/carteira/CarteiraProjetos.astro`, `src/lib/carteira/lista.ts` |
| Ficha do projeto | Uma só ficha, aberta pela Carteira ou pelo endereço: topo do prefeito (órgão, área, valor total, macroetapa, entrega prevista, localização, observação) e abas Cadastro, Recurso, Entrega, Localização, Fotos, Documentos, Processos SEI, Cronograma, Histórico e Governança. Edição (E1) por quem tem permissão | Disponível no código (E6); fotos em breve (E9) | `src/pages/plataforma/projeto/[id].astro`, `src/lib/carteira/ficha*.ts` |
| Obras sem localização | Lista das obras que não aparecem no mapa (fora do menu); a localização é gravada na aba Localização da ficha | Disponível (E6) | `src/pages/plataforma/projetos-localizacao/`, `src/components/carteira/ficha/` |
| Kanban por macroetapa | Colunas com quantidade e valor; mover com portões e motivo | Simulação | `src/components/carteira/Kanban.astro`, `src/lib/carteira/movimentacao.ts` |
| Gantt geral | Linha do tempo prevista por macroetapa, da entrega mais próxima à mais distante; filtros por nome, órgão, macroetapa e período de entrega (mês e ano), guardados no endereço | Disponível | `src/components/carteira/Gantt.astro`, `src/components/carteira/FiltrosProjetos.astro`, `src/lib/carteira/filtros.ts` |
| Visão por órgão | Incorporada à Carteira (E5): o endereço antigo abre a Carteira filtrada pelo órgão | Substituída | `src/lib/carteira/lista.ts` |
| Cronogramas | Fase atual, realizado × previsto, linha do tempo, tarefas, dependências e pendências de dado | Disponível | `src/lib/cronograma/`, `src/pages/plataforma/cronograma/[id].astro` |
| Onde está parado | Etapas vencidas por unidade e responsável | Disponível | `src/components/cronograma/Parado.astro` |
| Pendências de etapa | Aprovar avança; reprovar volta pela mesma regra do Kanban | Simulação | `src/components/carteira/PendenciasEtapa.astro` |
| Reunião semanal | Pauta, decisões, ações e ata | Simulação | `src/lib/reuniao/` |
| Sala de guerra | Missões com objetivo, prazo, responsável, riscos, ações, problemas e decisões | Simulação | `src/lib/sala/` |
| Histórico de alterações | Log com o quê, quem, quando, origem, antes e depois; filtros e CSV | Disponível para carga; gravação de movimentos em integração | `src/lib/log/` |
| Processos no SEI | Leitor da página pública, documentos-chave, etapa sugerida e link por projeto | Simulação; rotina automática a fazer | `src/lib/sei/`, `src/components/sei/` |

### Captação (dados públicos)

| Guia | O que faz |
| --- | --- |
| Principal | Indicadores com fonte e data: convênios, CAUC, SICONFI, FNS, educação, saúde, saneamento e DOU |
| Oportunidades | Programas abertos compatíveis com o município, com prazos e busca por necessidade |
| Acompanhamento | Convênios e repasses: pactuado, liberado e saldo a liberar |
| Alertas | Alertas com motivo, regra e ação sugerida |
| Comparativo | Repasses de saúde por habitante entre as 27 capitais |
| Qualidade dos dados | Frescor, falhas e motivo por fonte |
| Projetos (parecer) | Parecer determinístico de elegibilidade (regras R01 a R21), sem IA |

Código: `src/lib/dados/`, `src/lib/projetos/`, `coletores/`. Detalhes em [docs/manual-usuario.md](docs/manual-usuario.md) e [docs/projetos-ia.md](docs/projetos-ia.md).

### Licitações

| Guia | O que faz | Situação |
| --- | --- | --- |
| Licitação em detalhe | Fases da Lei 14.133 com datas de documentos públicos do SEI, fase atual, prazos e projeto relacionado | Simulação |
| Prazos da Lei 14.133 | Prazos legais, metas internas e calendário com feriados | Disponível |
| Processos, Cotações, Documentos e outras | Protótipo anterior de operação, planejamento, preços, automação, mercado e cadastros | Demonstrativo (`src/data/modules.json`) |

### Gestão

| Guia | O que faz | Situação |
| --- | --- | --- |
| Início · Projetos prioritários | Tela do prefeito: obras por área, quantidade e valor por etapa (as partes somam o total), linha do tempo de entregas por área até dez/2028, próximas entregas e principais obras; todo número vira filtro guardado no endereço; "Só prioritários"; região só como filtro opcional. Sem farol, prazos, "onde está parado", decisões pendentes e convênios | Disponível no código (E3) |
| Painel da equipe | Visão operacional que saiu da tela do prefeito: 10 indicadores com farol e situação, prazos da Lei, onde está parado, decisões pendentes, alertas da central, convênios e valores por região; o projeto abre a ficha e o X volta ao painel. Só administrador, gestor e editor | Disponível no código (E10) |
| Inconsistências de dados | Relatório por órgão ou geral com 10 regras (campo essencial faltando, datas fora de ordem, macroetapa vencida, SEI inválido, obra fora do mapa e outras pendências da carga), contagem por regra e por órgão, link para a aba Governança da ficha, impressão em A4 e CSV. Só administrador, gestor e editor | Disponível no código (E10) |
| Gestão · Painel | Foto atual da carteira e dos recursos e mapa das obras | Disponível |
| Alertas | Central de alertas de convênios, contratação, obras, saldo sem fonte, etapas paradas e dados desatualizados | Disponível |
| WhatsApp | Permissões por cargo, relatórios, perguntas e modelos para aprovação da Meta | Simulação; envio real depende do banco e da conta do WhatsApp Business |

## 4. Ciclo de vida do projeto (macroetapas)

Os códigos oficiais vêm da aba PIPELINE da planilha:

| Código | Macroetapa |
| --- | --- |
| 00 | Em estruturação |
| 01 | Planejamento |
| 02 | Preparatório para Contratação |
| 03 | Contratação |
| 04 | Mobilização |
| 05 | Execução |
| 06 | Conclusão |

**Regras de movimentação** (`src/lib/carteira/movimentacao.ts`):
- O projeto nasce no cadastro e anda ou volta por qualquer caminho: Kanban, ficha, Pendências de etapa ou SEI.
- Todos os caminhos passam pela mesma regra e geram o mesmo registro no histórico.
- **Avançar** exige os portões da etapa. **Voltar** e **forçar** exigem motivo.
- O SEI só propõe avançar. A mudança vale depois de aprovada.

**Compromisso do projeto:**
- **decidido:** executa com ou sem recurso externo;
- **condicionado:** só executa se vier recurso externo;
- **ideia:** demanda ainda não avaliada.

## 5. Pedidos de origem e onde estão

Os pedidos vêm dos áudios do dono, da reunião com a equipe e das planilhas.

| Pedido | Onde entrou | Situação |
| --- | --- | --- |
| Ver de relance o que está em planejamento, contratação ou execução | Início de Projetos, Kanban | Feito |
| Gantt por macroetapa | Gantt geral | Feito |
| Macroetapas com nomes e datas finais da planilha | Carteira e cronogramas no D1 | Feito |
| Kanban com valores no topo das colunas | Kanban | Feito em simulação |
| Cadastrar todos os projetos a partir da planilha | Importação da carteira | Carga inicial feita |
| Telas simples, sem barra de rolagem, que funcionem no celular | Interface responsiva e testes | Feito |
| Projeto nasce no cadastro e anda ou volta por qualquer caminho, com histórico | Motor de movimentação, Histórico | Regras prontas; gravações em integração |
| Log de toda alteração (o quê, quem, quando) | Histórico de alterações | Feito para eventos existentes |
| Com quem está cada tarefa; em que ponto da contratação está | Cronogramas, Onde está parado | Feito |
| Predecessoras e etapas em paralelo | Dependências | Feito (opção A; revisar com o cliente) |
| Reunião semanal, providências e ações | Reunião semanal | Simulação |
| SEI: atualizar a partir do processo público | Processos no SEI, Licitação em detalhe | Leitura apresentada; rotina automática a fazer |
| Captar recursos: convênios, alertas e prazos | Módulo Captação | Feito com dados públicos |
| Saldo sem fonte | Ficha e Central de alertas | Feito |
| Cláusula suspensiva com prazo e alertas | Central de alertas | Parcial |
| Fluxo da Lei 14.133 | Prazos da lei, Licitação em detalhe | Parcial; PNCP a fazer |
| Painel do prefeito: etapa, empresa, valor, foto atual e histórico | Gestão · Painel, Mapa | Parcial |
| Tela de gestão da equipe separada da tela do prefeito e relatório de inconsistências por órgão (áudios 13 e 19) | Gestão · Painel da equipe; Gestão · Inconsistências de dados | Disponível no código (E10) |
| WhatsApp para o prefeito em linguagem simples | Gestão · WhatsApp | Simulação |
| Projetos "desejo" separados dos que serão executados | Campo compromisso | A fazer na importação |
| Projeto × oportunidade com sugestão | Captação e Projetos | A fazer |
| Medições, avanço físico e financeiro | Fase 4 | A fazer |
| Medir tempo e volume por colaborador | Fase 2 e Fase 5 | A fazer |
| IA para proposta, ETP e minutas | Fase 5 | A fazer, sem IA no MVP |
| Orçamento por SINAPI e GOINFRA | Fase 5 | A fazer |
| Tela inicial "Projetos prioritários" no layout do croqui, números que viram filtro, próximas entregas e principais obras (áudios A01, A03, A09, A11, A12, A13, A14) | Início (/plataforma/) | Feito no código (E3), aguardando aprovação do dono |

## 6. O que funciona de verdade e o que é simulação

Centros de bairros: migração local `0005_bairro_geo.sql`; `npm run db:local` aplica as migrações e semeia somente bairros fictícios de `data/exemplo/`, com centros explicitamente simulados.
O geocodificador é manual, fora do build: `node scripts/geocodificar-bairros.ts --bairros .tmp/bairros.json --saida .tmp/geo-bairros.json --sql .tmp/bairros.sql --prefeitura 5208707`. Mantém `--carteira`, `--refazer` e `--refazer-faltantes`. A próxima carga real deve usar `--refazer`; a saída grava `versao_regras: 2` e só reaproveita entradas da versão atual.
A entrada nova é `[{"bairro":"Bairro Exemplo","regiao":"Centro","obras":1}]`. Nominatim: consulta estruturada, município Goiânia e caixa obrigatórios; preferência por bairro, consultas sequenciais a cada ≥1,1 s e até três novas tentativas de 429/5xx após o maior entre 5 s e `Retry-After`, com timeout de 30 s por requisição. O SQL escapa valores e atualiza por prefeitura/bairro. Entradas e saídas reais ficam fora do repositório; os centros reais ficam no D1 da prefeitura.

O site público é pré-renderizado; `/plataforma/` é montada a cada acesso pelo Worker. Na prática:
- **Leitura real no D1:** carteira, cronogramas e histórico da carga inicial.
- **Captação:** leitura de dados públicos.
- **Gravam de verdade:** documentos do projeto, a localização da obra (entrega B1) e o cadastro de projeto novo (entrega B2, publicação depende de ordem do dono).
- **Ainda é simulação:** Kanban, pendências, reunião, sala de guerra, SEI na interface e WhatsApp. Essas partes passam a gravar de verdade pelo roteiro B3 a B8 de `docs/govnexa/projeto-banco.md`.
- A plataforma lê o D1 em produção desde 16/11/2026. A leitura foi otimizada (só a guia aberta é montada e a leitura do banco fica em cache de 30 s); a otimização foi publicada em 16/11/2026 às 19h35 (versão 2e1114fa do Worker).
- Acesso à plataforma exige sessão do login próprio (senha + verificação em 2 etapas) e cadastro ativo no banco central. A prefeitura não é escolhida pela URL.

### SEI automático

- O Worker fará a leitura agendada por um Cron Trigger, buscando os links públicos e gravando o resultado no D1.
- A rotina roda no servidor; a trava CORS do navegador não se aplica.
- A pesquisa inicial que exigir captcha continua manual; o GovNexa nunca contorna captcha.
- Documento público é lido automaticamente; documento restrito entra por PDF.

### Próximas partes da Fase 3

1. **Usuários (3.3):** cadastro, convite e login próprio com 2FA no ar desde 17/11/2026. Pendente: os administradores que ainda não concluíram o convite (reenviar pela guia Usuários se vencer).
2. **Documentos (3.4):** publicada em produção em 17/11/2026 (PR #10; migração 0002 aplicada): envio, download e remoção lógica.
3. **Importação de planilhas (3.5):** feita e gravada em produção em 16/11 (334 projetos atualizados, 0 novos).
4. **SEI automático:** Cron Trigger do Worker para leitura e gravação no D1.

### Usuários e login próprio (etapa 3.3)

- `/plataforma/usuarios/`: só `gerenciar_usuarios`, sempre na prefeitura do administrador; impede desativar o próprio acesso ou remover o último administrador ativo.
- `LOGIN_MODO=access` (também padrão quando ausente) mantém o Access; `senha` exige senha e aplicativo autenticador. Os convites permitem preparar contas antes da troca, sem sincronizar políticas do Access.
- Convite vale 24 horas; redefinição vale uma hora. Links são de uso único e um novo link invalida os anteriores do mesmo tipo. GET não consome o token.
- Primeira senha abre sessão de configuração por dez minutos. Confirmação do aplicativo mostra dez códigos de recuperação uma vez e cria sessão completa. Login sempre exige código ou configuração.
- Redefinir senha revoga todas as sessões e exige novo login, preservando o aplicativo. Redefinir 2FA revoga sessões, apaga chave e códigos e exige configuração no próximo login.
- Sessão completa: 12 horas absolutas e duas horas sem uso. Cinco tentativas de código; conta bloqueada por 15 minutos após cinco falhas; limite de 20 tentativas por IP em 15 minutos, incluindo acertos (opção conservadora). Esqueci: três pedidos por e-mail/hora e dez por IP/hora, resposta sempre genérica.
- Configure ORIGEM_PUBLICA (HTTPS público), `SENHA_PEPPER`, `TOTP_CHAVE` (32 bytes em base64), `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` e binding `EMAIL` antes de habilitar. Sem Turnstile em produção, login e recuperação retornam 503. A chave TOTP deve ser preservada: perdê-la exige redefinir os aplicativos.
- Local: `EMAIL_SIMULADO=1` disponibiliza os últimos 20 e-mails em `/entrar/_emails-locais`, só localhost/127.0.0.1 sem `cf-ray`; logs nunca contêm o link. Em produção a simulação é ignorada. Cookie local `govnexa_local`; fora desse modo, `__Host-govnexa` com Secure.
- `db:local` aplica a migração central `0002_login.sql` e semeia somente `@exemplo.invalid`, sem ler arquivos de segredos. Playwright usa valores fictícios próprios; não reutilize a semente ou os exemplos de configuração fora dos testes locais.
- Validação local desta entrega: `astro check` sem erros, 316 testes Node passando, build concluído e mapa de impacto sem arquivos descobertos. Playwright escrito e listado, sem execução de navegador no sandbox.
- Esta entrega não foi publicada. A migração central precisa ser aplicada pelo responsável antes de publicar as novas telas, mesmo mantendo Access. E-mails reais e políticas Access dependem da configuração do responsável.

### Documentos de projeto (etapa 3.4)

- **Onde:** `/plataforma/documentos-projeto/` (escolher o projeto) e `/plataforma/documentos-projeto/projeto/<código>/`. A guia "Documentos" do menu continua sendo a demonstração antiga.
- **Decisões do dono (16/11):** qualquer pessoa com perfil que tem a ação `enviar_documento` envia e remove; PDF, PNG/JPG/WEBP e Office (xlsx, docx, pptx, xls, doc), até 25 MB.
- **Regras de segurança** (cada uma tem teste):
  1. A chave do arquivo no R2 é gerada pelo sistema (`<prefeitura>/<projeto>/<uuid>`); nunca vem do navegador.
  2. Toda consulta filtra a prefeitura; outra prefeitura não lista, baixa nem remove.
  3. O tipo é conferido pelo conteúdo (assinatura do arquivo), não só pela extensão. SVG e HTML não são aceitos.
  4. O download é sempre anexo, com `nosniff` e sem cache.
  5. Pedido de outra origem é recusado (trava do Astro e conferência própria do cabeçalho `Origin`).
  6. Perfil e origem são conferidos antes de ler o corpo do pedido; o tamanho também.
  7. O mesmo conteúdo não entra duas vezes no mesmo projeto (índice único no banco, vale mesmo com envios simultâneos).
  8. Remoção só lógica: a linha fica, o arquivo fica no R2, e guarda quem removeu e quando.
  9. No máximo 30 envios por hora por pessoa.
  10. No máximo 30 ações (enviar, remover) por minuto por pessoa na prefeitura, pela ligação `LIMITE_API` do Rate Limiting da Cloudflare. Se a ligação falhar, o pedido é recusado. A contagem da Cloudflare é por local de atendimento e aproximada: protege contra abuso, não é uma cota exata.
  11. Tipo do documento (entrega 1.1): só tipo ativo da própria prefeitura, conferido no serviço e no banco; documento removido não muda de tipo; cada troca fica no Histórico.
- **Tipos de documento (entrega 1.1):** DFD, ETP e TR sempre ativos. Mapa de riscos, projeto básico, orçamento de referência, ART e licença ambiental existem desativados; para ativar um deles, por enquanto, pelo banco: `UPDATE tipo_documento SET ativo = 1 WHERE prefeitura_id = <IBGE> AND codigo = '<código>'`. Tela de configuração e exigência por etapa vêm depois.
- **Limites conhecidos:**
  - Arquivo órfão no R2 (o Worker ser encerrado entre gravar o arquivo e registrar no banco) só seria achado por uma varredura futura.
  - O Office é aceito pela assinatura do formato; o sistema não analisa macros. Por isso o download é sempre anexo.
  - O arquivo inteiro passa pela memória do Worker (até 26 MB por envio). Para volumes maiores, o caminho é o envio direto ao R2.
- **Publicação (17/11/2026):** migração `0002` aplicada no D1 de produção e Worker publicado (versão f5327c05).

### Importação das planilhas (etapa 3.5)

- **Onde ficam:** pasta `planilhas/` do repositório privado `GovNexa/govnexa-dados`:
  - `Projeto_obras_prioritarias.xlsx` (carteira) e `GEPP - Cronograma por Projeto - ....xlsx` (cronogramas);
  - `codigos-corrigidos.json`, com as correções de códigos repetidos (hoje: o 450 da SECAP vira 506, como na carga inicial).
  - Para atualizar, troque o arquivo mantendo o nome.
- **Como roda:** GitHub Actions do repositório de dados, `Importar planilhas`.
  - Ao subir uma planilha, ele só **confere** e mostra o relatório. Nada vai ao banco.
  - Para **gravar** em produção: Actions › Importar planilhas › Run workflow › "Gravar no banco de produção?" = sim.
  - O código é `scripts/importar-planilhas.ts` (também roda no computador: `npm run importar:planilhas -- --planilhas <pasta> --destino nenhum|local|remoto`).
- **Regras de segurança dos dados** (cada uma tem teste):
  1. Nunca apaga projeto que saiu da planilha: só avisa.
  2. Nunca sobrescreve localização e compromisso, que o sistema preenche.
  3. Projeto já alterado no sistema (tem evento que não veio de importação) é **pulado** e listado.
  4. Um código só pode continuar do mesmo órgão. Se `P-450` era da SEINFRA no banco e a planilha o traz como da SECAP, a rotina **para tudo** e não grava nada.
  5. Código repetido na planilha sem correção combinada para a rotina e avisa (código, linhas e órgãos).
  6. Planilha com menos da metade dos projetos do banco, ou com muitos projetos novos de uma vez, é recusada.
  7. Etapa que saiu do cronograma deixa de existir no banco; as dos outros cronogramas não são tocadas.
  8. Não regrava o histórico: registra um evento único de carga e uma linha em `importacao` (banco central).
  9. Relatório, console e erros trazem só contagens, códigos, linhas e órgãos, nunca nomes nem valores.
- **Limite conhecido:** cada importação soma 1 à `revisao` dos projetos atualizados. Quem estiver editando um deles na hora pode receber "alterado por outra pessoa".

## 7. Decisões já tomadas (não reabrir sem o dono)

- **Marca:** GovNexa no site público, login e plataforma.
- **Domínios:** `govnexa.com.br` e `www.govnexa.com.br`.
- **Hospedagem e código:** Cloudflare + GitHub; o repositório público não recebe dados reais.
- **Banco:** D1, um por prefeitura, e um D1 central para prefeituras, usuários e importações. Supabase/PostgreSQL fica apenas como plano B.
- **Login (17/11/2026):** modo próprio com senha e 2FA obrigatório autorizado; Access permanece padrão até decisão expressa de troca. Perfis admin, gestor, editor e leitura.
- **Cadastro (17/11/2026):** administrador cadastra e envia convite pelo GovNexa. Preparar senha e 2FA antes de mudar `LOGIN_MODO`; sem sincronização automática com Access.
- **Datas (17/11/2026):** padrão brasileiro em todo o sistema: `DD/MM/AAAA` e, com hora, `DD/MM/AAAA HH:MM` no horário de Brasília.
- **Importações (17/11/2026):** por enquanto os dados entram por importação de planilhas; a data de importação passa a ser registrada a partir da próxima planilha enviada. O cadastro direto no sistema vem numa fase seguinte.
- **Dados reais:** somente no banco e no repositório privado de dados; nunca no repositório público.
- **Importação:** planilhas pelo repositório privado `GovNexa/govnexa-dados`; o importador deverá avisar códigos repetidos. O código 450 duplicado foi resolvido como 506 para SECAP.
- **Prazos:** a lei é o limite e a prefeitura define metas internas menores. Passar do teto legal é alerta grave. Prazos-piso não podem ser encurtados.
- **Dependências entre etapas:** opção A, deduzidas pela ordem e pelas datas do cronograma, porque a planilha não tem coluna de predecessora. Será revista quando o fluxo for validado com o cliente.
- **SEI:** usar o link público e PDF; não pedir serviço web nem contornar captcha.
- **PDFs de referência:** são exemplo de conteúdo, não meta visual. A base são as planilhas.
- **Privacidade:** nomes de pessoas da reunião não entram no projeto; números de WhatsApp são cadastrados por cargo ou equipe; "Interessados" do SEI não são lidos; nomes em andamentos são mascarados.
- **Histórico:** imutável. Fotos e documentos têm remoção lógica.
- **Limite de requisições (17/11/2026):** pela ligação de Rate Limiting da Cloudflare (`LIMITE_API`), por prefeitura e pessoa; falha da ligação recusa o pedido.
- **Exigências por etapa (17/11/2026, D2):** começam por DFD, ETP e TR, com lista de tipos configurável por prefeitura.
- **Cabeçalho do site e logo (17/11/2026):** a logo do GovNexa (G em seta com alvo, azul-marinho e laranja) é provisória; a versão final será feita depois. A logo da Prefeitura de Goiânia continua no topo, porque a demonstração é para ela. O topo não lista mais Início, Soluções, Insights e Sobre; essas páginas continuam no rodapé.
- **Página inicial (17/11/2026):** apresenta o GovNexa como gestão de projetos públicos; não lista as fontes de dados nem a forma de leitura dos processos; o título dos módulos não traz número.
- **Banco de dados (17/11/2026):** toda entrega que crie ou use dados segue `docs/govnexa/projeto-banco.md`: estudar e projetar antes de criar; um só caminho de gravação (tela, rota, serviço, repositório, banco); integridade garantida pelo banco; histórico junto com a gravação; e a ordem das entregas segue o Fluxo (B1 a B8).
- **Limite da localização (18/11/2026):** a localização de um projeto aceita pontos em Goiânia e no entorno, até cerca de 10 km além do retângulo da cidade, porque a prefeitura pode ter obra na divisa ou em acordo com cidade vizinha. O limite ainda é fixo no código (`src/lib/mapa/geo.ts`); para uma segunda prefeitura, passa a vir do cadastro da prefeitura.
- **Animações do site (17/11/2026):** biblioteca `gsap` 3.13.0, empacotada no próprio site. A licença é a padrão da GSAP, gratuita para uso comercial, mas não é de código aberto.
- **Ficha única do projeto (22/11/2026, E6):** a Carteira abre a ficha em página inteira (a política de segurança proíbe janela embutida) e o X volta à lista com os filtros; a localização e as fotos ficam dentro do projeto; o endereço antigo de localização virou a lista de obras sem localização.
- **Tela do prefeito (22/11/2026, E3):** saem farol, prazos, "onde está parado", decisões pendentes, convênios, valores por região e o mapa compacto (volta por área na E4); Mobilização conta em Execução; Concluídas e Sem macroetapa aparecem como linha própria só quando existem; a área mostrada usa a sugestão pelo órgão quando o projeto não tem área gravada; Principais obras = prioritárias primeiro, depois as de maior valor; linha do tempo do mês atual até dez/2028, com 6 áreas em cor, "Outros" e "Sem área" em cinza.

- **Painel da equipe e inconsistências (22/11/2026, E10):** o painel antigo virou o Painel da equipe (sem mapa) e o relatório de inconsistências usa 10 regras fixas calculadas dos dados atuais, sem gravar nada; as duas telas são de administrador, gestor e editor.

## 8. Pendências e próximos passos

Centros dos bairros: migração 0005 e carga publicadas em 18/11/2026. Parte dos bairros não foi encontrada no OpenStreetMap e as obras deles aparecem como "sem localização"; a correção é o cadastro manual (centro do bairro ou localização da obra), nunca uma coordenada inventada.

### Dependem do dono

| Pendência | Para quê |
| --- | --- |
| Validar o Fluxo com as áreas e com o cliente | Confirmar etapas, dependências e subprocessos |
| Fornecer o decreto de feriados de Goiânia | Contagem exata dos dias úteis |
| Configurar conta oficial do WhatsApp Business e aprovar modelos | Envio real de relatórios |

### Próximos passos

0. **Requisitos dos áudios de 20/11/2026 (visão do prefeito, gestão e governança):** plano completo em [docs/govnexa/plano-requisitos-audios.md](docs/govnexa/plano-requisitos-audios.md), com 34 pedidos rastreados, entregas E1 a E14, ordem e % por fase. Decisões D1 a D6 respondidas em 22/11/2026 (carteira inteira com marca de prioritário; áreas sugeridas pelo órgão até a lista oficial; códigos da tela a partir de 9000; busca de endereço gratuita; modelo das licitações a enviar).

1. **3.3 — usuários e login:** publicada e ligada em produção em 17/11/2026 (`LOGIN_MODO=senha`).
2. **3.4 — documentos:** publicada em 17/11/2026.
   Entregas 1.0 (limite de requisições) e 1.1 (tipo do documento, migração 0003) publicadas em 17/11/2026.
   Entregas B1 (página do projeto e localização, no ar desde 18/11/2026) e B2a (Novo projeto gravando, migração 0006 publicada em 18/11/2026). E1 (B2b) concluída no código, aguardando revisão e publicação. Migração 0007 a aplicar. A decisão D3 reserva à tela os códigos a partir de 9000. A planilha usa a faixa abaixo de 9000. Em seguida vem B3 (Kanban e Pendências de etapa).
3. **3.5 — importação:** feita e gravada em 16/11.
4. Automatizar a leitura do SEI com Cron Trigger.
5. Desligar a hospedagem antiga.
6. Logo definitiva do GovNexa: trocar a versão provisória de `src/components/LogoGovNexa.astro`.
7. Teste "mapa das obras" no Safari (WebKit): falha também na main (marcadores não aparecem após "Cidade inteira" + zoom); investigar à parte. No Chrome passa.
8. Melhorias de segurança sem falha conhecida: retirar `'unsafe-inline'` da política de scripts (CSP) e redirecionar `www.govnexa.com.br` para o endereço sem www.
9. E6: retirar o componente antigo `LocalizacaoProjeto.astro` e o link "Localização e fotos" de `detalheProjeto` depois da junção com a E5; fotos na aba Fotos (E9).
10. **Depois da E10:** os testes do painel antigo voltaram no Painel da equipe; `tests/dashboard-mapa.spec.ts` continua pausado até a E4 decidir onde fica o mapa compacto por área. A E11 usa o Painel da equipe no menu das três visões.

## 9. Como rodar no computador

Requer Node.js compatível com Astro 7 e npm.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npm run cf:dev
```

`npm run db:local` prepara os bancos D1 locais com dados de exemplo. `npm run cf:dev` gera o site e inicia o Worker em http://localhost:8787, com a plataforma lendo o D1 local. `.dev.vars` é apenas local; não o envie ao Git.

| Comando | Para quê |
| --- | --- |
| `npm run test:dados` | Testes de dados, D1, permissões, importação e regras |
| `npx playwright test --project=chromium` | Testes de interface com dados fictícios |
| `npx astro check` | Verificação de tipos do Astro |
| `npm run build` | Gera o site e os artefatos do Worker |
| `npm run impacto` | Mostra as etapas do Fluxo afetadas pelos arquivos alterados |
| `npm run importar:carteira` | Importador da carteira |
| `npm run importar:cronogramas` | Importador de cronogramas |

## 10. Regras de trabalho

As lições técnicas (armadilhas já enfrentadas, como o mapa em branco por nome de arquivo, o CORS do SEI e o fuso de Brasília) estão em [docs/govnexa/historico.md](docs/govnexa/historico.md), seção 6.

As regras completas estão em [CLAUDE.md](CLAUDE.md). Resumo:

1. Comece da versão atual e trabalhe em uma branch própria.
2. Uma entrega por branch; descreva no PR o que mudou e o que **não** mudou. O dono faz o merge.
3. Antes do PR, rode `npx astro check`, `npm run test:dados`, `npx playwright test --project=chromium` e `npm run impacto`.
4. Se a mudança afeta etapa, tela ou situação do Fluxo, atualize junto `src/lib/govnexa/fluxo.ts`, `subfluxos.ts` e `impacto.ts`.
5. Interface sem rolagem horizontal em 1280 e 390 px, textos simples, contraste adequado nos temas claro e escuro e situação escrita, não só indicada por cor.
6. Claude Code planeja e revisa; o Codex executa por ordem de serviço (Copilot fora do fluxo desde 18/11/2026). Publicação só com ordem do dono.
7. O repositório antigo está congelado desde 16/11/2026; todo o trabalho segue só neste.
8. Não coloque dados reais, credenciais ou nomes de pessoas no repositório. Use dados fictícios nos testes; nunca contorne captcha.
9. Datas no padrão brasileiro: `DD/MM/AAAA` e, com hora, `DD/MM/AAAA HH:MM` (horário de Brasília), sempre pelas funções de `src/lib/datas.ts`.

## 11. Estrutura

```
worker/                         Worker e entrada para Access, sessões, saída e API
  entrypoint.ts                 Roteamento Astro, /sair e /api
db/d1/central/                  Migrações do D1 central
db/d1/prefeitura/               Migrações dos bancos das prefeituras
db/migracoes/                   Referência antiga de migrações PostgreSQL
wrangler.jsonc                  Worker, domínios, bindings D1 e R2
astro.config.mjs                Astro + adaptador Cloudflare
coletores/                      Coletores de dados públicos
data/config/                    Município, feriados, metas e configurações
data/core/                       Dados públicos tratados, com proveniência
data/exemplo/                    Dados fictícios para desenvolvimento e testes
scripts/db-local.mjs             Preparação dos bancos D1 locais e exemplos
scripts/                         Importadores, testes auxiliares e rotinas locais
src/middleware.ts                Access ou sessão, cadastro ativo e seleção do banco
src/pages/                       Site público e rotas da plataforma
src/layouts/                     Layouts do site e da plataforma
src/lib/                         Regras, dados e repositórios D1
src/components/                  Telas de cada módulo
docs/                            Documentação do produto e arquitetura
tests/                           Testes Node e Playwright
```

## 12. Dados e rotinas automáticas

Os coletores diário e mensal de Captação continuam no GitHub Actions. A publicação do site não é uma rotina de coleta.

| Rotina | Quando | O que faz |
| --- | --- | --- |
| Atualizar dados do bloco Captação | Todo dia, 09h30 (Brasília) | Roda coletores e abre PR do ramo `dados-atualizados` |
| Atualizar dados mensais | Dia 5 de cada mês | Atualiza INEP, SINISA e CNES e abre PR do ramo `dados-mensais-atualizados` |
| Portal da Transparência | Manual | Coleta de convênios pela API, com chave em segredo do GitHub |
| Documentos do projeto | Disponível; no ar desde 17/11/2026 (etapa 3.4) | Em `/plataforma/documentos-projeto/`: envio (PDF, imagens e Office, até 25 MB), download sempre como anexo e remoção lógica. Só quem tem perfil de editor, gestor ou administrador envia e remove; todos os perfis baixam. Limite de 30 envios por hora por pessoa |
| Importação de planilhas | No ar; gravada em produção em 16/11 (etapa 3.5) | Lê o repositório privado de dados, avisa códigos repetidos e não sobrescreve o que foi feito no sistema |
| Leitura automática do SEI | A fazer | Cron Trigger no Worker lê links públicos e grava no D1 |

Os PRs de dados automáticos precisam de revisão e merge, como qualquer outro. Os dados reais ficam no banco, não neste repositório público.

## 13. Configuração (variáveis e segredos)

Nenhum valor secreto fica no código. Só os nomes e a finalidade:

| Nome | Onde | Uso |
| --- | --- | --- |
| `account_id`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `wrangler.jsonc` | Conta, equipe e audiência do Access |
| Bindings D1 `DB_CENTRAL` e `DB_PREFEITURA_5208707` | `wrangler.jsonc` | Banco central e banco de Goiânia |
| Binding R2 `DOCUMENTOS` | `wrangler.jsonc` | Bucket `govnexa-documentos` |
| Domínios `govnexa.com.br` e `www.govnexa.com.br` | `wrangler.jsonc` | Domínios do Worker |
| `ACESSO_LOCAL_LIVRE`, `DEV_EMAIL` | `.dev.vars` local | Desenvolvimento local; nunca configurar a liberação em produção |
| `LOGIN_MODO` | Variável do Worker | `senha` em produção desde 17/11/2026 (login próprio); `access` (padrão quando ausente) volta ao Cloudflare Access |
| `SENHA_PEPPER` | Segredo do Worker | HMAC anterior ao PBKDF2-SHA256 (100000 iterações); preservar e proteger |
| `TOTP_CHAVE` | Segredo do Worker | AES-GCM, 32 bytes base64; cifra as chaves do aplicativo |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Variável e segredo do Worker | Widget e validação no servidor; obrigatórios em produção |
| `EMAIL` | Binding SendEmail | Remetente permitido `nao-responda@govnexa.com.br` |
| `EMAIL_SIMULADO` | Somente ambiente local | `1` captura os últimos 20 e-mails em memória, nunca em produção |
| `PORTAL_TRANSPARENCIA_CHAVE` | Segredo do GitHub | Coletor de convênios; precisa ser cadastrado de novo no repositório novo |
| `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` | Segredos do repositório privado `GovNexa/govnexa-dados` (ambiente `producao`) | Só a rotina de gravação da importação usa; a conferência não precisa. A criar pelo dono |

Não reutilize variáveis de autenticação ou publicação da arquitetura antiga. Colaboradores não recebem valores de segredos.

## 14. Segurança

- Senha com PBKDF2 e pepper; TOTP cifrado por AES-GCM vinculado ao ID da conta, com proteção contra reuso e códigos de recuperação de uso único.
- Cinco erros de senha por janela bloqueiam inicialmente por 15 minutos; a cada dez falhas acumuladas em 24 h o período dobra até uma hora (15 → 30 → 60 min). Tentativas durante o bloqueio não acumulam falhas nem estendem o prazo. Administradores podem desbloquear contas da própria prefeitura na guia Usuários; a ação limpa os limites da conta e fica na auditoria. A senha correta só zera falhas depois do segundo fator.
- Dez erros de TOTP/recuperação por conta em uma hora bloqueiam por uma hora e revogam sessões pendentes, além do limite de cinco códigos por sessão. Sucesso no segundo fator limpa os contadores da conta.
- Login e recuperação fazem escritas equivalentes para e-mail existente/ausente. POST de login, código e esqueci completam pelo menos 800 ms; e-mail usa waitUntil quando disponível e envio síncrono como fallback.
- Links de convite e redefinição usam ORIGEM_PUBLICA=https://govnexa.com.br; origem ausente ou sem HTTPS recusa envio e registra evento. URL da requisição só serve no modo local.
- Modo local exige AMBIENTE=local, host local e ausência de cf-ray; scripts de desenvolvimento passam a variável por --var, nunca pela configuração de produção.
- Saída no modo senha exige POST de mesma origem; GET apenas confirma. POST de login e ações de Usuários exigem tamanho decimal declarado até 16 KiB.
- Mensagens da guia Usuários vêm de códigos fixos. Desativação invalida sessões, convites e redefinições; janelas de limites com mais de 24 h são limpas a cada cem chamadas.

- O acesso exige cadastro ativo e JWT válido do Access no modo padrão; no modo senha, sessão completa após senha e segundo fator.
- Quem autentica no Access, mas não tem cadastro ativo, recebe "Sem permissão".
- O middleware escolhe a prefeitura e o binding D1 a partir do cadastro; prefeitura nunca vem da URL.
- Respostas da plataforma usam `private, no-store`; o Worker envia cabeçalhos de segurança e CSP.
- Eventos de histórico são imutáveis. Fotos e documentos têm remoção lógica.
- Nenhum dado real da prefeitura entra no repositório público.
- Segredos ficam em configuração protegida ou no ambiente local apropriado, nunca no código.

Detalhes em [docs/seguranca.md](docs/seguranca.md).

## 15. Documentação

Ordem de leitura: README, [plano](docs/govnexa/plano.md), [histórico](docs/govnexa/historico.md), [CLAUDE.md](CLAUDE.md). As versões integrais do plano e do histórico ficam no repositório privado de dados.

| Arquivo | Conteúdo |
| --- | --- |
| [docs/govnexa/plano.md](docs/govnexa/plano.md) | Plano público adaptado do sistema |
| [docs/govnexa/historico.md](docs/govnexa/historico.md) | Regras do dono e lições técnicas; histórico público adaptado |
| [CLAUDE.md](CLAUDE.md) | Regras de trabalho no repositório |
| [docs/govnexa/plano.md](docs/govnexa/plano.md) | **Plano completo do GovNexa** (detalhe de tudo que o README resume) |
| [docs/govnexa/historico.md](docs/govnexa/historico.md) | **Histórico completo**: linha do tempo, evolução dos %, regras do dono, testes do SEI, o que vem a seguir, lições técnicas e todos os PRs |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Histórico de mudanças |
| [docs/govnexa/visao-geral.md](docs/govnexa/visao-geral.md) | Módulos, macroetapas, roteiro e regras de código |
| [docs/govnexa/projeto-banco.md](docs/govnexa/projeto-banco.md) | **Projeto do banco de dados**: diagnóstico, princípios, modelo e roteiro B1 a B8 |
| [docs/govnexa/modelo-dados.md](docs/govnexa/modelo-dados.md) | Modelo de dados; seção D1 descreve os bancos atuais |
| [docs/arquitetura.md](docs/arquitetura.md) | Arquitetura do site, Worker, plataforma e D1 |
| [docs/plano-execucao.md](docs/plano-execucao.md) | Plano e decisões do bloco Captação |
| [docs/manual-usuario.md](docs/manual-usuario.md) | Manual do usuário |
| [docs/projetos-ia.md](docs/projetos-ia.md) | Parecer de elegibilidade e IA com revisão humana |
| [docs/regras-alertas.md](docs/regras-alertas.md) | Regras dos alertas |
| [docs/fontes/](docs/fontes/) | Fontes de dados |
| [docs/seguranca.md](docs/seguranca.md) | Revisão de segurança |

## Aviso

- Os módulos demonstrativos usam registros fictícios.
- Os dados de Captação vêm de fontes públicas oficiais, com a origem indicada.
- Os dados reais da carteira e dos cronogramas ficam no D1 e nunca no repositório público.
- O projeto não é um canal oficial da Prefeitura de Goiânia.

Na guia Usuários, erros administrativos usam códigos e mensagens fixos. O envio de e-mail é aguardado; se falhar, a alteração gravada permanece e a tela orienta reenviar o convite. Rotas anônimas mantêm envio em segundo plano e piso de tempo.
