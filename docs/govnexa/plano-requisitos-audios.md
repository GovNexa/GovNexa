# Plano: requisitos dos áudios de 20/11/2026 (visão do prefeito, gestão e governança)

Versão pública (sem nomes de pessoas, nomes de obras, valores ou números internos da prefeitura). A transcrição e os modelos de referência ficam fora do Git, na pasta local `Doc Referencia/`.

Origem: 31 áudios gravados pela gestão da secretaria do piloto, com quatro modelos visuais (um painel de entregas de governo, um croqui da tela principal, um gráfico de portfólio e a tabela de colunas da aba PIPELINE). Também vieram dois relatórios em PDF: obras prioritárias por órgão e situação das licitações. Os áudios são numerados de 01 a 37, e os números que faltam são as imagens e os PDFs.

Escrito por 🟣 Opus em 22/11/2026. Aguarda aprovação do dono antes do primeiro código (regra do ciclo: tarefa grande começa por um plano aprovado).

## 1. O que muda no produto (princípios novos)

1. **Três visões** (A31):
   - **Gerencial**: o que o prefeito vê para decidir.
   - **Governança da execução**: o trabalho da equipe, com cronogramas, tarefas, responsável e tempo na mão de cada responsável.
   - **Convênios**: captação e repasses.
2. **A tela do prefeito mostra grandes números, mapa, linha do tempo de entregas e principais obras** (A01, A09, A13). Saem dela, e vão para a governança: farol (vermelho, amarelo e verde), prazo, "onde está parado", decisões pendentes e convênios. Motivo dado no áudio: "ainda não temos maturidade" para o farol, e ele pode gerar um alarme falso para o prefeito.
3. **Do macro para o micro** (A01, A03, A09). As partes somam o todo: quantidade e valor por macroetapa somam o grande número.
4. **Tudo que mostra número é filtro** (A03, A12). Clicar em "Execução" refaz a área, a linha do tempo e a lista.
5. **Ordem padrão: da entrega mais próxima para a mais distante** (A03, A16).
6. **Fundo claro e cor só na informação** (A03, A16), nos dois temas.
7. **Pouca rolagem** (A18). Detalhes ficam em subtelas e abas; a lista de projetos é a única exceção aceita.
8. **Uma única ficha do projeto** (A21). O detalhe em tela grande e a página do projeto são a mesma tela. Em cima fica o que interessa ao prefeito; embaixo, a governança.
9. **Padrão único de filtros** (A16, A24, A29, A30) em Carteira, Kanban, Gantt e Mapa: nome, órgão, área, macroetapa e período de entrega (mês e ano de início e de fim).
10. **Funciona com base carregada ou do zero.** Todo campo novo entra pela importação de planilha **e** pelo cadastro ou edição na tela, com Histórico.

## 2. Rastreabilidade: cada áudio, o que existe hoje e onde será atendido

Situação hoje: **Atende**, **Parcial** ou **Não**. A coluna "Entrega" aponta para a seção 3.

| Áudio | Pedido | Hoje | Entrega |
| --- | --- | --- | --- |
| A01 | Tela inicial "Projetos prioritários"; total de projetos e de valor; quebra por macroetapa em quantidade e valor | Parcial (o dashboard tem indicadores, mas misturados) | E3 |
| A01 | Convênios saem da tela do prefeito e ganham uma tela própria (em execução, em risco, CAUC) | No código (E11, Visão Convênios, aguardando revisão) | E11 |
| A01 | Principais obras na tela inicial | Não | E3 |
| A03 | Fundo claro, cor só na informação, hierarquia macro → micro | Parcial | E2 |
| A03 | Lista das próximas entregas que muda com o filtro clicado | Não | E3 |
| A04 | Mapa por **área** (saúde, educação, assistência social, drenagem, parques e lazer, cultura…) em vez de tipo | Não (não existe o campo área) | E1 + E4 |
| A05 | Mapa: total de obras e valor por região; sem no prazo, atenção e atrasada | Parcial | E4 |
| A06 | Mapa sem filtro de situação; filtros por macroetapa e área | Não | E4 |
| A07 | Localização: procurar por rua, endereço completo ou só bairro e confirmar o ponto | Feito no código (E8; aguardando portão, prévia do dono e revisão) | E8 |
| A09 | Tela principal no layout do croqui: obras por área (esquerda), quantidade e valor por macroetapa (centro e direita), linha do tempo de entregas (embaixo) | Não | E3 |
| A11 | Linha do tempo de entregas empilhada por área, por mês e ano, até 2028; "outros" se houver muitas áreas | Não | E3 |
| A12 | Sai a "carteira por macroetapa" abaixo do mapa; grandes números viram filtro global | Não | E3 |
| A13 | Separar a tela do prefeito (gerencial) da tela de gestão (operacional) | No código (E3 + E10, aguardando revisão) | E3 + E10 |
| A14 | Região só como filtro opcional, sem quadro aberto | Não | E3 + E4 |
| A16 | Carteira: ID só número e discreto; colunas ID, órgão, projeto, valor, macroetapa e datas das etapas (peças técnicas, fim da contratação, dias de obra, entrega); sem farol; filtros; ordem por entrega | Parcial | E5 |
| A17 | Detalhe abre em tela grande com X para fechar, não em gaveta lateral | Não | E6 |
| A18 | Evitar barra de rolagem em todo o sistema | Parcial (regra já existe para a horizontal) | E2 (regra) e cada entrega |
| A19 | Ficha: o que é, valor, macroetapa e **observação** em destaque; sem farol | Parcial | E6 |
| A19 | Relatório de inconsistências por órgão ou geral, para a equipe | No código (E10, aguardando revisão) | E10 |
| A20 | Abas: cadastro, recurso, entrega; governança no fim (origem e responsável pelo dado, pontos de atenção); sem valores por ano | Parcial | E6 |
| A21 | Ficha hierarquizada; recursos resumidos (total, fonte de captação, contrapartida); saem tipo e órgão de contratação, situação e tipo de recurso | Parcial | E6 |
| A22 | Sem menu próprio de "Localização e fotos"; as duas ficam dentro do projeto, separadas | Sim no código (localização na E6; fotos na aba Fotos, E9) | E6 + E9 |
| A23 | Kanban: card só com nome, órgão e entrega prevista; sem valor e sem farol; mais cards por coluna | Sim no código (E7) | E7 |
| A24 | Kanban: filtros por órgão ou área e período de entrega; foco até Execução | Sim no código (E7) | E7 |
| A26 / A27 | Estruturação começa na chegada do projeto e do orçamento; cada coluna mostra a **previsão de saída do marco** da planilha | Sim no código (E7) | E7 |
| A28 | Kanban sem a coluna Conclusão (fica no Histórico) | Sim no código (E7) | E7 |
| A29 | Gantt: busca por nome e filtros de órgão, macroetapa e período de entrega | Sim no código (E7) | E7 |
| A30 | Carteira com grandes números no topo (total de projetos e de valor) que mudam com os filtros; a "Visão por órgão" deixa de existir | Não | E5 |
| A31 | Menu nas três visões; governança da execução com responsável e tempo na mão do responsável | Atendido (E11 + E13) | E11 + E13 |
| A32 | Processos do SEI listados dentro do projeto | Parcial (leitor existe, ligação em simulação) | E6 (+ B7 do banco) |
| A34 | Gestão das licitações dentro da visão gerencial: grandes números primeiro | Não (só protótipo) | E12 |
| A35 | Por etapa da contratação: concluídas (ordem de serviço, pago, %), em julgamento, publicadas, editais em ajustes, em preparação, projetos em finalização; campos de cada uma | Não | E12 |
| A36 | Edição rápida em linha dos dados da licitação (o prefeito só vê) | Não | E12 |
| A37 | Por enquanto manual ou por planilha modelo; depois, integração com PNCP e Compras.gov | Não | E12 (manual) + E14 (integração) |

Quadro final: 34 pedidos (alguns áudios trazem mais de um). Hoje: 0 atendem por inteiro, 17 em parte, 17 não atendem.

## 3. Entregas, ordem e quem faz

Regras que valem para todas as entregas:
- Uma branch e um PR por entrega.
- Antes do PR: `astro check`, `test:dados`, Playwright, `impacto`, Fluxo, README e CHANGELOG atualizados.
- A 🟣 Opus escreve a ordem de serviço. O 🟠 Codex executa (sol, terra ou luna, conforme o risco). O 🔵 Sonnet confere o portão.
- Revisão independente da 🟣 Opus em migração, permissão e gravação.
- O 🟢 Haiku tira as fotos de tela para conferência.
- Publicação só com ordem do dono.

A % de cada entrega começa em 0 e é atualizada no README (seção 2) a cada PR.

| # | Entrega | Áudios | Depende de | Banco | Executor | % |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | **Base para "do zero"**: edição dos campos na página do projeto (B2b), campo **área** com catálogo da prefeitura (B4 parcial), marca de **prioritário** (D1), códigos da tela a partir de 9000 (D3), importação da área e da marca pela planilha, os dois no Novo projeto | A04, A21, D1, D3, base de tudo | — | Migração 0007: `projeto.area`, `projeto.prioritario` e tabela `catalogo` (área, órgão, região) | Codex sol + revisão Opus | 70% (código e testes prontos, aguardando revisão, migração e publicação) |
| E2 | **Padrão visual e filtros**: fundo claro nos dois temas; componente único de filtros (nome, órgão, área, macroetapa, período de entrega mês/ano) com estado no endereço; ordem por entrega; checagem de rolagem | A03, A16, A18, A24, A29 | — | — | Codex terra | 0% |
| E3 | **Tela do prefeito "Projetos prioritários"**: layout do croqui; grandes números de quantidade e valor por macroetapa, clicáveis; obras por área (barras por quantidade); linha do tempo empilhada por área (mês e ano até 2028); próximas entregas filtradas; principais obras. Saem farol, prazo, parado, decisões pendentes, convênios e valores regionais | A01, A03, A09, A11, A12, A13, A14 | E1, E2, D1 | — (leitura) | Codex terra | 80% (código e testes prontos; aguardando prévia do dono, revisão e publicação) |
| E4 | **Mapa por área**: legenda e filtro por área e macroetapa; região como filtro opcional; total de obras e valor por região; sem situação nem farol | A04, A05, A06, A14 | E1, E2 | — | Codex terra | 70% (código e testes validados pela Opus em rascunho; aguardando aplicação, portão, prévia do dono e revisão) |
| E5 | **Carteira de projetos**: grandes números que seguem os filtros; colunas ID (só número, discreto), órgão, projeto, valor, macroetapa, peças técnicas, fim da contratação, dias de obra, entrega; agrupada por macroetapa e ordenada por entrega; impressão no formato do relatório por órgão; "Visão por órgão" redireciona para a Carteira filtrada | A16, A30 | E2 | — | Codex terra | 80% (código e testes prontos, aguardando portão, prévia do dono e revisão) |
| E6 | **Ficha única do projeto** (tela grande com X e a mesma página): topo do prefeito (o que é, órgão, área, valor, macroetapa, entrega prevista, observação, localização); abas Recurso (resumido), Entrega (datas das etapas), Localização, Fotos, Documentos, Processos SEI, Cronograma, Histórico e Governança (origem e responsável pelo dado, pontos de atenção, SEI, dependências); saem farol, valor por ano, tipo e órgão de contratação, situação e tipo do recurso; sai do menu a guia "Localização e fotos" | A17, A19, A20, A21, A22, A32 | E1 | — | Codex terra | 70% (código e testes escritos; aguardando portão, prévia do dono e revisão) |
| E7 | **Kanban e Gantt**: cards com nome, órgão e entrega prevista; coluna mostra a previsão de saída do marco; sem Conclusão; filtros do padrão; mover grava no banco com portão e motivo (B3); Gantt com os mesmos filtros | A23, A24, A26, A27, A28, A29 | E2; B3 grava | Sem migração nova prevista (usa `evento_projeto`) | Codex sol (gravação) + revisão Opus | 70% (código e testes escritos; aguardando portão, prévia do dono e revisão) |
| E8 | **Localização por endereço**: procurar rua, endereço ou bairro; mostrar o ponto; o usuário confirma; segue o limite da cidade e do entorno | A07 | D4 | — | Codex sol (serviço externo) + revisão Opus | 70% (código e testes escritos; aguardando portão, prévia do dono e revisão) |
| E9 | **Fotos da obra**: enviar, legendar e ver fotos na aba Fotos (R2, como os documentos); Histórico | A22 | E6 | Migração 0008: colunas e índices na tabela `projeto_foto` (já existente) | Codex sol + revisão Opus | 70% (código e testes validados pela Opus em rascunho; aguardando aplicação, portão, prévia do dono e revisão) |
| E10 | **Painel de gestão (equipe)**: recebe o que saiu da tela do prefeito (farol, onde está parado, decisões pendentes, alertas); **relatório de inconsistências** por órgão ou geral (campo faltando, data fora de ordem, macroetapa vencida), com impressão e CSV | A13, A19 | E3 | — | Codex terra | 70% (código e testes escritos; aguardando portão, prévia do dono e revisão) |
| E11 | **Menu nas três visões** (Gerencial, Governança da execução, Convênios); tela **Visão Convênios** com convênios em execução, em risco e CAUC, usando a Captação | A01, A31 | E3, E10 | — | Codex luna | 70% (código e testes validados pela Opus em rascunho; aguardando aplicação, portão, prévia do dono e revisão) |
| E12 | **Gestão das licitações**: grandes números por situação (6 etapas) → listas por etapa com os campos do relatório (marco, valor estimado/contratado/proposta, pago, empresa e colocação, onde está, aguardando quem, abertura, publicação prevista); próximos marcos; "aguardando PGM" e "aguardando outras áreas"; **edição em linha** para editor ou acima (prefeito só lê); importação por planilha modelo; ligação opcional com o projeto (há contratações sem projeto) | A34, A35, A36, A37 | D5 | Migração: `contratacao`, `contratacao_marco` (com Histórico) | Codex sol + revisão Opus | 0% |
| E13 | **Governança da execução**: responsável por tarefa do cronograma e **tempo na mão do responsável** (registro de cada troca); painel por responsável | A31 | E11 | Migração: histórico de responsável da tarefa | Plano Opus próprio, depois Codex sol | 100% |
| E14 | **Integração PNCP e Compras.gov** (resultado, colocação, homologação) | A37 | E12 | — | Plano Opus próprio | 0% (evolução futura) |

### Ordem e paralelismo
- **1ª rodada:** E1 e E2 ao mesmo tempo. Não tocam os mesmos arquivos.
- **2ª rodada:** E3, E5 e E6 em paralelo, cada uma na sua worktree. Todas usam o filtro da E2 e a área da E1.
- **3ª rodada:** E4, E7 e E10.
- **4ª rodada:** E11, E8 e E9.
- **5ª rodada:** E12.
- **Depois:** E13 e E14.
- E8 e E12 podem subir na fila assim que as decisões D4 e D5 chegarem.
- **Prévia visual antes do código** em E3, E5 e E6: o dono aprova o desenho na tela local (`wrangler dev`), conforme a regra K.

### Percentual por fase (para o README)
| Fase | Entregas | % |
| --- | --- | --- |
| Base de dados para operar do zero | E1, E9 | 35% |
| Visão gerencial (prefeito) | E2, E3, E4, E5, E6, E7, E8 | 0% |
| Governança (equipe) | E10, E11, E13 | 100% |
| Licitações | E12, E14 | 0% |

## 4. Banco de dados (projetar antes de criar)

Segue o roteiro do `projeto-banco.md`; cada migração passa por revisão independente.

- **0007 (E1):** colunas `area` e `prioritario` (0/1, padrão 0) em `projeto`; tabela `catalogo` (`prefeitura_id`, `tipo` em área/órgão/região, `codigo`, `nome`, `ordem`, `ativo`), única por prefeitura e tipo. A área de cada projeto é editável na tela e vem da planilha. Enquanto a lista oficial de áreas não chega, uma sugestão inicial é proposta a partir do órgão e vai ao dono para conferência (D2).
- **Fotos (E9):** reaproveita a tabela `projeto_foto` da 0001 (`prefeitura_id`, `projeto_id`, chave no R2, tipo, tamanho, legenda, data da foto, autor, remoção lógica); a migração 0008 acrescenta `removida_por`, `sha256` (mesma foto não entra duas vezes no projeto) e índices, no mesmo padrão dos documentos. O nome `foto_projeto` do plano foi trocado pela tabela existente para não haver duas tabelas de fotos.
- **Licitações (E12):**
  - `contratacao` (`prefeitura_id`, `id`, `projeto_id` opcional, nome, situação nas 6 etapas, valores estimado, de proposta e contratado, pago, empresa, colocação, onde está, aguardando, datas de abertura, publicação prevista e marco, observação, `revisao`).
  - `contratacao_marco` (data e descrição).
  - Todo evento entra no Histórico.
- **Governança (E13):** histórico de responsável por tarefa, para calcular o tempo na mão de cada um.
- **Sem dado real no repositório.** Exemplos novos (áreas, licitações, fotos) entram em `data/exemplo`.

## 5. Decisões do dono (respondidas em 22/11/2026)

- **D1:** a tela "Projetos prioritários" mostra a **carteira inteira**, com um **campo para marcar o projeto como prioritário** (filtro "só prioritários"). O campo entra na E1 (importação e tela).
- **D2:** a lista oficial de áreas será enviada mais adiante. Até lá, a área sugerida vem do órgão e pode ser editada na tela; a lista oficial substitui a sugestão quando chegar.
- **D3:** **faixa separada.** Projetos cadastrados pela tela recebem código a partir de 9000; a planilha segue a própria numeração. Não há mais colisão entre os dois. Entra na E1.
- **D4:** busca de endereço por serviço **gratuito** (OpenStreetMap/Nominatim), respeitando o limite de uso, com cache e confirmação do usuário.
- **D5:** o modelo de acompanhamento das licitações será enviado. A E12 espera esse arquivo para a importação; a tela e o banco podem ser preparados antes.
- **D6:** confirmado. O "próximo marco aguardando" fica fora da tela principal e aparece só no detalhe.

## 6. Critérios de aceite (de cada entrega e do conjunto)

- Cada linha da seção 2 só fica "Atende" quando funciona **com a base carregada e com um banco vazio preenchido pela tela**. Há teste de ponta a ponta para os dois casos.
- Sem rolagem horizontal em 1280 px e 390 px; rolagem vertical só na lista de projetos e nas tabelas longas.
- Datas em `DD/MM/AAAA`, valores em R$ e ordem padrão pela entrega mais próxima.
- O perfil "leitura" (prefeito) não vê controles de edição; o servidor confere de novo o perfil em toda gravação.
- Os 9 vetores de segurança são checados em toda entrega que grava.
