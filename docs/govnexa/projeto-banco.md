# GovNexa · Projeto do banco de dados

Aprovado pelo dono em 17/11/2026 (PR #28). Define como o banco deve crescer para que as telas hoje em simulação passem a gravar de verdade, uma etapa do Fluxo por vez.

Este documento vale como regra de trabalho: toda entrega que crie ou use dados confere antes as seções 3 (princípios) e 6 (roteiro por entrega).

## 1. O que existe hoje

**Dois níveis de banco (Cloudflare D1).**

| Banco | Guarda | Tabelas |
| --- | --- | --- |
| Central (`govnexa-central`) | Quem pode entrar e em qual prefeitura | `prefeitura`, `usuario`, `importacao`, `sessao`, `token_email`, `codigo_recuperacao`, `limite_tentativa`, `evento_acesso` |
| Um por prefeitura (`govnexa-<código IBGE>`) | Os dados de trabalho daquela prefeitura | `prefeitura`, `projeto`, `evento_projeto`, `evento_sistema`, `cronograma`, `etapa_cronograma`, `projeto_foto`, `documento`, `tipo_documento`, visão `log_alteracoes` |

**O que já grava de verdade:** documentos do projeto (envio, tipo, remoção lógica), importação das planilhas, usuários e login.

**O que só lê:** carteira, cronogramas, histórico, painéis e mapa.

**O que ainda é simulação (fica só no navegador):** Novo projeto, Kanban, Pendências de etapa, Localização, Reunião semanal, Sala de guerra, links do SEI, Licitação em detalhe e WhatsApp.

## 2. Diagnóstico

1. **A gravação do projeto já existe no código, mas nenhuma tela a usa.** `criarProjeto` e `aplicar` (em `src/lib/repositorio/d1.ts`) gravam o projeto e o histórico juntos e recusam alteração concorrente. Novo projeto e Kanban rodam as regras no navegador e não chamam o servidor. Falta a rota, não a tabela.
2. **Não existe a página do projeto.** A Carteira mostra uma ficha resumida dentro da lista. Não há um endereço que abra um projeto com todas as informações (identificação, valores, recurso, datas, localização, documentos, cronograma, processos, salas, ações e histórico).
3. **Vínculos por texto livre.** Órgão, responsável, região, tipo e bairro são texto digitado. Nada impede duas grafias do mesmo órgão, e as telas de filtro e de soma dependem dessa grafia.
4. **Listas dentro do projeto.** Os processos do SEI ficam numa lista em texto dentro do projeto e, de novo, dentro do cronograma. Não dá para perguntar ao banco, por índice, "de qual projeto é este processo".
5. **Cronograma sem amarração.** `cronograma.projeto_id` não tem vínculo conferido pelo banco com `projeto`.
6. **Sem tabelas para a governança.** Reunião, ação, sala de guerra, risco, marco, número de WhatsApp e link do SEI não têm onde ficar.
7. **Histórico por projeto sem índice próprio.** Os eventos de sistema guardam o projeto dentro de um texto; a consulta "histórico deste projeto" lê todos os eventos da prefeitura. Não pesa hoje, vai pesar com o uso.
8. **Documento desatualizado.** `docs/govnexa/modelo-dados.md` ainda descreve PostgreSQL e segurança por linha, que não existem no D1.

## 3. Princípios (valem para toda entrega)

**Isolamento**
- Um banco por prefeitura, mais o `prefeitura_id` em toda tabela e em toda chave. São duas barreiras: o banco errado não tem os dados, e a consulta errada não os acha.
- A prefeitura vem sempre da sessão, nunca do endereço nem do formulário.
- Não há vínculo conferido entre bancos. O que aponta para um usuário guarda o e-mail de trabalho de quem fez, como o histórico já faz.

**Um só caminho de gravação**
- Tela → rota → serviço (regras) → repositório → banco. O navegador nunca decide; ele só pede.
- Toda rota confere, nesta ordem: origem do pedido, sessão e perfil, tamanho, limite de requisições e só então lê o corpo. É a ordem já usada em Documentos.
- Toda gravação vai num único `batch` com o seu evento de histórico: ou gravam os dois, ou nenhum.

**Integridade garantida pelo banco**
- Chave estrangeira composta (`prefeitura_id` + identificador) em todo vínculo dentro do mesmo banco.
- `CHECK` para valores permitidos, índice único para o que não pode repetir e gatilho para a regra que cruza tabelas. A regra no código é a primeira conferência; a do banco é a que não falha.
- Histórico imutável e remoção só lógica, como já é em eventos, documentos e fotos.
- Toda entidade editável tem `revisao`: quem grava com base em leitura antiga é recusado e recarrega.

**Forma dos dados**
- Vira coluna tudo o que é filtrado, somado, ordenado ou ligado a outra tabela. Texto estruturado (JSON) fica só para o que vem bruto da planilha e é apenas exibido.
- Vira tabela tudo o que é lista com vida própria (processos, ações, riscos, participantes).
- Catálogo por prefeitura para o que hoje é texto livre e repetido: órgão, região e tipo de projeto.
- Dinheiro em tabela nova: inteiro em centavos. Os valores que já vêm da planilha continuam como estão até a entrega que os reorganizar.
- Datas: dia em `AAAA-MM-DD`; momento em ISO-8601 UTC. A tela converte para o padrão brasileiro com `src/lib/datas.ts`.
- Sem CPF nem dado pessoal além de nome, unidade e contato de trabalho.

**Agilidade**
- Índice criado para a consulta que a tela faz, conferido com `EXPLAIN QUERY PLAN` antes de aprovar a migração. Nada de índice "por via das dúvidas": cada um encarece a gravação.
- Páginas de um registro leem só aquele registro e os seus filhos, por índice. A lista inteira da carteira fica para as telas de lista, com o cache de 30 s, que é limpo a cada gravação da mesma prefeitura.
- Poucas idas ao banco por página. O plano gratuito aceita 50 consultas por acesso, e um `batch` conta como uma.
- Busca por texto: o D1 limita o padrão do `LIKE` a 50 bytes. Busca na plataforma usa índice de texto (FTS5), nunca `LIKE` sobre a tabela inteira.

**Mudança de estrutura (migração)**
- Numerada, só para a frente, pequena e aditiva: primeiro cria, depois o código passa a usar, e só numa entrega posterior retira o antigo.
- Testada num banco local com dados antes do PR, com as travas provadas por teste.
- Em produção: anotar o ponto de restauração, aplicar a migração e só então publicar o código. Sempre com ordem do dono.
- O D1 não deixa acrescentar chave estrangeira a coluna que já existe. Nesses casos a regra entra por gatilho, como em `tipo_documento`.

**Segurança**
- Consultas só com parâmetros; nomes de coluna vêm de listas fixas no código.
- Perfil conferido no servidor em toda gravação.
- Os 9 vetores conferidos em toda entrega, e revisão independente em toda migração.

## 4. Modelo proposto

Tabelas novas e mudanças, agrupadas pela etapa do Fluxo que destravam. Tudo no banco da prefeitura; toda tabela começa por `prefeitura_id`.

### 4.1 Projeto (Fluxo: Cadastro, Movimentar, Portão)
Sem tabela nova.
- `projeto`: índice único em (`prefeitura_id`, `codigo_legado`), para dois cadastros simultâneos nunca receberem o mesmo código.
- `evento_projeto`: índice em (`prefeitura_id`, `projeto_id`, `em`), para o histórico da página do projeto (feito na migração 0004).
- `evento_sistema`: coluna calculada `projeto_id` (tirada de `detalhes`) com índice, pelo mesmo motivo (feito na migração 0004).
- Gravação de uma só coluna do projeto (como a localização) sobe a `revisao`, para a edição geral baseada em leitura antiga ser recusada.

### 4.2 Catálogos (Fluxo: Cadastro)
| Tabela | Chave | Campos |
| --- | --- | --- |
| `orgao` | `prefeitura_id`, `sigla` | nome, tipo (interno, externo), ativo |
| `regiao` | `prefeitura_id`, `nome` | ativo |
| `tipo_projeto` | `prefeitura_id`, `nome` | ativo |

Carregadas com os valores que já existem na carteira. `projeto.orgao`, `regiao` e `tipo` continuam nas mesmas colunas, e um gatilho passa a recusar valor fora do catálogo. A importação da planilha acrescenta ao catálogo o valor novo antes de gravar o projeto e avisa no relatório.

### 4.3 Governança (Fluxo: Reunião semanal, Sala de guerra)
| Tabela | Para quê | Vínculos |
| --- | --- | --- |
| `reuniao` | Uma reunião semanal: data, situação, quem registrou | — |
| `reuniao_item` | Projeto discutido: discussão e decisão | `reuniao`, `projeto` |
| `acao` | Tarefa com responsável, prazo e situação, venha da reunião, da sala ou avulsa | `projeto`; opcional `reuniao_item` ou `sala` |
| `sala` | Missão ou crise: objetivo, dono, prazo, cadência, escalonamento, situação, resultado | — |
| `sala_projeto` | Projetos da sala, com data e motivo de entrada e de saída | `sala`, `projeto` |
| `sala_item` | Risco, problema e decisão do quadro da sala | `sala` |
| `sala_reuniao` | Reunião da sala: pauta, decisões e encaminhamentos | `sala` |
| `sala_marco` | Marco com data e situação | `sala` |

Uma só tabela `acao` responde "o que está em aberto, com quem e para quando" em qualquer tela (página do projeto, alertas, painel), sem juntar três fontes. Índices: por projeto, e por situação e prazo só das ações em aberto.

### 4.4 SEI e cronograma (Fluxo: SEI, Planejamento)
| Tabela | Para quê | Vínculos |
| --- | --- | --- |
| `processo_sei` | Um processo: número (único na prefeitura), link público, última leitura, unidade atual, desde quando | — |
| `projeto_processo` | Liga projeto e processo (um projeto tem vários; um processo pode servir a mais de um) | `projeto`, `processo_sei` |
| `andamento_sei` | Cada leitura que mudou algo, para "onde está e há quantos dias" | `processo_sei` |

`projeto.sei` continua existindo e espelhado até todas as telas lerem as tabelas novas. `cronograma.projeto_id` passa a ser conferido por gatilho.

### 4.5 Contratação e execução (Fluxo: 02 a 06)
`contratacao`, `lote`, `contrato`, `aditivo` e `medicao`, como já descrito no modelo de dados, com valores em centavos. Detalhadas na entrega que as criar, depois de validar os campos com a área.

### 4.6 Comunicação e fotos semanais
Números e permissões do WhatsApp, e a foto semanal da carteira ("o que mudou"). Dependem da conta oficial do WhatsApp e ficam por último.

## 5. Página do projeto

Endereço `/plataforma/projeto/<id>/`, aberto a partir da Carteira, do Kanban, do mapa, dos alertas e da busca. Uma leitura do projeto mais as leituras dos seus filhos, todas por índice.

Blocos, na mesma ordem do formulário de Novo projeto: identificação, valores e recurso, datas e etapa atual, localização, documentos e tipos, cronograma, processos do SEI, salas e ações em aberto, histórico. Quem tem perfil para editar altera ali mesmo; cada alteração passa pela rota e grava o histórico.

A página nasce na primeira entrega só com o que já tem tabela, e ganha um bloco a cada entrega seguinte.

## 6. Roteiro, na ordem do Fluxo

Cada linha é um PR pequeno, com migração (se houver), rota, tela, testes, atualização do Fluxo e revisão independente.

| Entrega | O que passa a funcionar | Banco |
| --- | --- | --- |
| B1 (feita no código em 17/11/2026) | Página do projeto (leitura) e Localização gravando | Migração 0004: índices do histórico por projeto |
| B2 | Novo projeto gravando; edição dos campos na página do projeto | Índice único do código |
| B3 | Kanban e Pendências de etapa gravando (movimentar, portão, motivo) | — |
| B4 | Catálogos de órgão, região e tipo | 4.2 |
| B5 | Reunião semanal e ações | `reuniao`, `reuniao_item`, `acao` |
| B6 | Sala de guerra | Tabelas `sala…` |
| B7 | Processos do SEI ligados ao projeto | 4.4 |
| B8 em diante | Contratação, execução, WhatsApp | 4.5 e 4.6 |

A cada entrega: a etapa correspondente do Fluxo deixa de ser "simulação", o aviso de simulação sai da tela, e `README.md`, `plano.md`, `historico.md` e `modelo-dados.md` são atualizados.

## 7. Limites do D1 considerados

Conferidos na documentação da Cloudflare em 17/11/2026.

| Limite | Gratuito | Pago |
| --- | --- | --- |
| Tamanho do banco | 500 MB | 10 GB |
| Consultas por acesso | 50 | 1000 |
| Volta no tempo (restauração) | 7 dias | 30 dias |
| Parâmetros por consulta | 100 | 100 |
| Colunas por tabela | 100 | 100 |
| Tamanho de uma linha | 2 MB | 2 MB |

Consequências no projeto: gravações em lote dividem os parâmetros em blocos; nenhuma tabela larga demais; textos longos têm limite de tamanho conferido na rota e no banco.

## 8. Decisões do dono

1. Princípios e ordem do roteiro (seção 6): aprovados em 17/11/2026.
2. Plano da Cloudflare: a conta está no plano pago (conferido pelo dono em 17/11/2026). Valem 30 dias de restauração e 1000 consultas por acesso.
