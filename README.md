# GovNexa — Inteligência para a gestão pública

Portal público e plataforma de gestão pública **GovNexa**. O piloto é a Prefeitura de Goiânia.

- **Produção:** https://govnexa.com.br e https://www.govnexa.com.br (Cloudflare Worker).
- **Repositório:** [GovNexa/GovNexa](https://github.com/GovNexa/GovNexa), público. Só entram código, dados públicos e dados fictícios; dados reais nunca entram.
- **Leia primeiro:** as seções "Situação atual", "O que funciona de verdade e o que é simulação" e "Regras de trabalho".

Situação descrita em **16/11/2026**.

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
   - Astro 7 + `@astrojs/cloudflare`: site público pré-renderizado; `/plataforma/` montada a cada acesso no Worker, lendo D1. `worker/entrypoint.ts` trata `/entrar`, `/sair` e `/api`; `src/middleware.ts` valida o login e escolhe o banco.
   - Cloudflare D1 (SQLite): um banco por prefeitura (`govnexa-5208707` para Goiânia) e banco central `govnexa-central` para prefeituras, usuários e importações. Migrações atuais em `db/d1/central` e `db/d1/prefeitura`; `db/migracoes/` é a referência PostgreSQL antiga. O histórico é imutável; fotos e documentos só têm remoção lógica. Arquivos ficam no R2 `govnexa-documentos`. Supabase/PostgreSQL é apenas plano B.
   - Login com Cloudflare Access (equipe `equipegovnexa`, código por e-mail) e cadastro ativo no banco central. Perfis: admin, gestor, editor e leitura; durante a construção, todos os usuários são admin. Quem passa no Access, mas não está cadastrado, vê "Sem permissão".
   - Carga inicial no D1 de produção em 16/11: 334 projetos, 13 cronogramas e 725 etapas. O código 450 estava repetido (SECAP e SEINFRA); o da SECAP virou 506. Planilhas novas serão importadas do repositório privado `GovNexa/govnexa-dados` por uma rotina do GitHub, a fazer na etapa 3.5.
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

## 2. Situação atual (16/11/2026)

| Fase | O que entrega | Situação | % |
| --- | --- | --- | --- |
| Planejamento | Plano, decisões, rastreabilidade, Fluxo do sistema, fluxos detalhados, mapa de impacto | Publicado; Fluxo com zoom e legenda recolhida | 97% |
| 0 · Base e identidade | Marca GovNexa, menu por módulos, tema estável, paginação | Publicada; blocos do menu começam fechados | 100% |
| 1 · Carteira de Projetos | Carteira, ficha, Kanban, Gantt, Visão por órgão, celular | Entregue; carga inicial no D1 | 100% |
| 1.5 · Cadastro, movimentação, log, sala de guerra | Novo projeto, Kanban e Pendências, Histórico, Sala de guerra | Telas prontas; algumas gravações ainda são simulação | 95% |
| 2 · Cronograma e equipe | Cronogramas, quadro de tarefas, Onde está parado, Reunião semanal, dependências, SEI | Telas entregues; leitura automática do SEI a fazer | 90% |
| 3 · Produção com banco (Cloudflare D1) | Tabelas, carga real, perfis e isolamento por prefeitura | Tabelas em produção, carga feita; plataforma lendo D1 pronta e testada, aguarda publicação. A fazer: usuários (3.3), documentos (3.4) e importação de planilhas (3.5) | 60% |
| 4 · Contratação, convênios e Gestão | Lei 14.133, alertas, painel do prefeito, licitação em detalhe | Prazos da lei, painel, mapa, Central de alertas e Licitação em detalhe; parte ainda em simulação | 75% |
| 5 · Integrações e inteligência | PNCP, SIMEC, SISMOB, preços, WhatsApp, IA | WhatsApp em simulação | 10% |

### Entregas recentes

| Data | O que | Referência |
| --- | --- | --- |
| 16/11 | Regras e preparo do repositório novo | PR #1 |
| 16/11 | Worker, Access e marca GovNexa | PR #2 |
| 16/11 | D1, plataforma lendo o banco e adaptação da Licitação em detalhe | branch `etapa-3`; PR #45 já incorporado |

O detalhe das entregas está em [docs/CHANGELOG.md](docs/CHANGELOG.md).

## 3. Funcionalidades por guia

Legenda: **Disponível** = leitura ou operação disponível. **Simulação** = as regras rodam, mas a gravação real ainda será ligada nas próximas partes da etapa 3. **Demonstrativo** = protótipo com dados fictícios.

### Projetos

| Guia | O que faz | Situação | Código |
| --- | --- | --- | --- |
| Projetos · Início | Resumo da carteira por macroetapa: quantidade, valor e farol de prazo | Disponível | `src/lib/carteira/` |
| Fluxo do sistema | Diagrama em raias com etapas, validações, responsáveis e links para as telas; inclui fluxos detalhados e zoom | Disponível | `src/lib/govnexa/fluxo.ts`, `subfluxos.ts`, `src/components/fluxo/` |
| Novo projeto | Cadastro com os campos da planilha | Simulação | `src/components/carteira/NovoProjeto.astro` |
| Carteira de projetos | Projetos, busca e ficha completa com valores, recursos, datas e histórico | Disponível | `src/lib/carteira/` |
| Localização e fotos | Ponto ou trecho da obra no mapa e lista de obras sem localização | Localização em simulação; fotos dependem de documentos | `src/lib/mapa/`, `src/components/mapa/` |
| Kanban por macroetapa | Colunas com quantidade e valor; mover com portões e motivo | Simulação | `src/components/carteira/Kanban.astro`, `src/lib/carteira/movimentacao.ts` |
| Gantt geral | Linha do tempo prevista por macroetapa | Disponível | `src/components/carteira/Gantt.astro` |
| Visão por órgão | Obras por órgão e macroetapa; pronta para imprimir | Disponível | `src/components/carteira/VisaoOrgaos.astro` |
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
| Gestão · Painel | Foto atual da carteira e dos recursos, mapa das obras e números clicáveis | Disponível |
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
| WhatsApp para o prefeito em linguagem simples | Gestão · WhatsApp | Simulação |
| Projetos "desejo" separados dos que serão executados | Campo compromisso | A fazer na importação |
| Projeto × oportunidade com sugestão | Captação e Projetos | A fazer |
| Medições, avanço físico e financeiro | Fase 4 | A fazer |
| Medir tempo e volume por colaborador | Fase 2 e Fase 5 | A fazer |
| IA para proposta, ETP e minutas | Fase 5 | A fazer, sem IA no MVP |
| Orçamento por SINAPI e GOINFRA | Fase 5 | A fazer |

## 6. O que funciona de verdade e o que é simulação

O site público é pré-renderizado; `/plataforma/` é montada a cada acesso pelo Worker. Na prática:
- **Leitura real no D1:** carteira, cronogramas e histórico da carga inicial.
- **Captação:** leitura de dados públicos.
- **Ainda é simulação:** cadastro, Kanban, pendências, reunião, sala de guerra, SEI na interface e WhatsApp. Essas partes passam a gravar de verdade nas próximas entregas da etapa 3.
- A tela da plataforma está pronta e testada para ler D1, mas aguarda publicação.
- Acesso à plataforma exige Cloudflare Access e cadastro ativo no banco central. A prefeitura não é escolhida pela URL.

### SEI automático

- O Worker fará a leitura agendada por um Cron Trigger, buscando os links públicos e gravando o resultado no D1.
- A rotina roda no servidor; a trava CORS do navegador não se aplica.
- A pesquisa inicial que exigir captcha continua manual; o GovNexa nunca contorna captcha.
- Documento público é lido automaticamente; documento restrito entra por PDF.

### Próximas partes da Fase 3

1. **Usuários (3.3):** tela de usuários e sincronização com um grupo do Access.
2. **Documentos (3.4):** arquivos no R2, com remoção lógica.
3. **Importação de planilhas (3.5):** rotina do GitHub a partir do repositório privado de dados e aviso de códigos repetidos.
4. **SEI automático:** Cron Trigger do Worker para leitura e gravação no D1.

## 7. Decisões já tomadas (não reabrir sem o dono)

- **Marca:** GovNexa no site público, login e plataforma.
- **Domínios:** `govnexa.com.br` e `www.govnexa.com.br`.
- **Hospedagem e código:** Cloudflare + GitHub; o repositório público não recebe dados reais.
- **Banco:** D1, um por prefeitura, e um D1 central para prefeituras, usuários e importações. Supabase/PostgreSQL fica apenas como plano B.
- **Login:** Cloudflare Access mais cadastro ativo no banco central. Perfis admin, gestor, editor e leitura; todos são admin durante a construção.
- **Cadastro e Access:** tela de usuários sincronizada com um grupo do Access (opção A).
- **Dados reais:** somente no banco e no repositório privado de dados; nunca no repositório público.
- **Importação:** planilhas pelo repositório privado `GovNexa/govnexa-dados`; o importador deverá avisar códigos repetidos. O código 450 duplicado foi resolvido como 506 para SECAP.
- **Prazos:** a lei é o limite e a prefeitura define metas internas menores. Passar do teto legal é alerta grave. Prazos-piso não podem ser encurtados.
- **Dependências entre etapas:** opção A, deduzidas pela ordem e pelas datas do cronograma, porque a planilha não tem coluna de predecessora. Será revista quando o fluxo for validado com o cliente.
- **SEI:** usar o link público e PDF; não pedir serviço web nem contornar captcha.
- **PDFs de referência:** são exemplo de conteúdo, não meta visual. A base são as planilhas.
- **Privacidade:** nomes de pessoas da reunião não entram no projeto; números de WhatsApp são cadastrados por cargo ou equipe; "Interessados" do SEI não são lidos; nomes em andamentos são mascarados.
- **Histórico:** imutável. Fotos e documentos têm remoção lógica.

## 8. Pendências e próximos passos

### Dependem do dono

| Pendência | Para quê |
| --- | --- |
| Assinar Workers Paid (US$ 5/mês) | Uso dos recursos de produção |
| Dar ordem para publicar a versão com banco | Colocar a plataforma D1 no ar |
| Dar acesso do outro desenvolvedor ao repositório privado de dados | Preparar a rotina de importação |
| Validar o Fluxo com as áreas e com o cliente | Confirmar etapas, dependências e subprocessos |
| Fornecer o decreto de feriados de Goiânia | Contagem exata dos dias úteis |
| Configurar conta oficial do WhatsApp Business e aprovar modelos | Envio real de relatórios |

### Próximos passos

1. **3.3 — usuários:** criar a tela e sincronizar o cadastro com grupo do Access.
2. **3.4 — documentos:** concluir o armazenamento no R2 e as regras de remoção lógica.
3. **3.5 — importação:** ler planilhas do repositório privado e avisar códigos repetidos.
4. Automatizar a leitura do SEI com Cron Trigger.
5. Desligar a hospedagem antiga.

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

As regras completas estão em [CLAUDE.md](CLAUDE.md). Resumo:

1. Comece da versão atual e trabalhe em uma branch própria.
2. Uma entrega por branch; descreva no PR o que mudou e o que **não** mudou. O dono faz o merge.
3. Antes do PR, rode `npx astro check`, `npm run test:dados`, `npx playwright test --project=chromium` e `npm run impacto`.
4. Se a mudança afeta etapa, tela ou situação do Fluxo, atualize junto `src/lib/govnexa/fluxo.ts`, `subfluxos.ts` e `impacto.ts`.
5. Interface sem rolagem horizontal em 1280 e 390 px, textos simples, contraste adequado nos temas claro e escuro e situação escrita, não só indicada por cor.
6. Claude Code planeja e revisa; Codex e Copilot executam por ordem de serviço. Publicação só com ordem do dono.
7. O outro desenvolvedor continua no repositório antigo; as mudanças são trazidas para o GovNexa com adaptação. A Licitação em detalhe é um exemplo.
8. Não coloque dados reais, credenciais ou nomes de pessoas no repositório. Use dados fictícios nos testes; nunca contorne captcha.

## 11. Estrutura

```
worker/                         Worker e entrada para Access, login, saída e API
  entrypoint.ts                 Roteamento de /entrar, /sair e /api
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
src/middleware.ts                Access, cadastro ativo e seleção do banco
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
| Importação de planilhas | A fazer (etapa 3.5) | Lê o repositório privado de dados e avisa códigos repetidos |
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
| `PORTAL_TRANSPARENCIA_CHAVE` | Segredo do GitHub | Coletor de convênios; precisa ser cadastrado de novo no repositório novo |
| Token da Cloudflare | Segredo do repositório privado de dados | Acesso da rotina de importação, ainda a fazer |

Não reutilize variáveis de autenticação ou publicação da arquitetura antiga. Colaboradores não recebem valores de segredos.

## 14. Segurança

- O acesso à plataforma exige um JWT válido do Cloudflare Access e cadastro ativo no banco central.
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
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Histórico de mudanças |
| [docs/govnexa/visao-geral.md](docs/govnexa/visao-geral.md) | Módulos, macroetapas, roteiro e regras de código |
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
