# Plano: requisitos dos áudios de 20/11/2026 (visão do prefeito, gestão e governança)

Versão pública (sem nomes de pessoas, nomes de obras, valores ou números internos da prefeitura). A transcrição e os modelos de referência ficam fora do Git, na pasta local `Doc Referencia/`.

Origem: 31 áudios gravados pela gestão da secretaria do piloto, com quatro modelos visuais (um painel de entregas de governo, um croqui da tela principal, um gráfico de portfólio e a tabela de colunas da aba PIPELINE). Também vieram dois relatórios em PDF: obras prioritárias por órgão e situação das licitações. Os áudios são numerados de 01 a 37, e os números que faltam são as imagens e os PDFs.

Escrito por 🟣 Opus em 22/11/2026 e aprovado pelo dono. **Atualizado em 23/11/2026** com a situação real das entregas (E1 a E11 no ar em produção; E12, E13 e E15 em andamento), a conferência de cada áudio contra a tabela da seção 2 (seis pedidos acrescentados) e os dois princípios novos do dono (itens 11 e 12 abaixo).

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
11. **O sistema substitui a planilha** (regra do dono, 23/11/2026). A planilha serve só de orientação e de carga inicial; a continuidade do trabalho é exclusivamente no sistema. Todo processo tem início, meio e fim na tela (criar, editar, avançar, concluir, com Histórico). Depois da carga, a tela vence a planilha. Quando um modelo de planilha chegar (por exemplo o das licitações), ele só alimenta a carga inicial e nunca é requisito para continuar. Varredura pendente: conferir módulo a módulo o que ainda depende de planilha para seguir (os cronogramas eram só leitura e viraram a E13).
12. **Sempre poder voltar** (regra do dono, 23/11/2026). Toda tela aberta a partir de outra oferece voltar à origem, com os filtros que estavam ativos. É conferido em toda entrega, com teste (E15).

## 2. Rastreabilidade: cada áudio, o que existe hoje e onde é atendido

Situação hoje (23/11/2026): **No ar** = publicado em produção, aguardando o teste do dono; **Parcial**; **Em andamento** = em construção em branch separada, ainda fora da `main`. A coluna "Entrega" aponta para a seção 3. As linhas marcadas com (novo 23/11) foram acrescentadas na conferência de cada áudio contra a transcrição.

| Áudio | Pedido | Hoje | Entrega |
| --- | --- | --- | --- |
| A01 | Tela inicial "Projetos prioritários"; total de projetos e de valor; quebra por macroetapa em quantidade e valor | No ar | E3 |
| A01 | Convênios saem da tela do prefeito e ganham uma tela própria (em execução, em risco, CAUC) | No ar | E11 |
| A01 | Principais obras na tela inicial | No ar | E3 |
| A03 | Fundo claro, cor só na informação, hierarquia macro → micro | No ar | E2 |
| A03 | Lista das próximas entregas que muda com o filtro clicado | No ar | E3 |
| A04 | Mapa por **área** (saúde, educação, assistência social, drenagem, parques e lazer, cultura…) em vez de tipo | No ar | E1 + E4 |
| A05 | Mapa: total de obras e valor por região; sem no prazo, atenção e atrasada | No ar | E4 |
| A06 | Mapa sem filtro de situação; filtros por macroetapa e área | No ar | E4 |
| A07 | Localização: procurar por rua, endereço completo ou só bairro e confirmar o ponto | No ar | E8 |
| A09 | Tela principal no layout do croqui: obras por área (esquerda), quantidade e valor por macroetapa (centro e direita), linha do tempo de entregas (embaixo) | No ar | E3 |
| A11 | Linha do tempo de entregas empilhada por área, por mês e ano, até 2028; "outros" se houver muitas áreas | No ar | E3 |
| A12 | Sai a "carteira por macroetapa" abaixo do mapa; grandes números viram filtro global | No ar | E3 |
| A13 | Separar a tela do prefeito (gerencial) da tela de gestão (operacional) | No ar | E3 + E10 |
| A13 | (novo 23/11) Saem da tela do prefeito "onde está parado" e "decisões pendentes"; ficam num painel para a gestão | No ar | E3 + E10 |
| A14 | Região só como filtro opcional, sem quadro aberto | No ar | E3 + E4 |
| A16 | Carteira: ID só número e discreto; colunas ID, órgão, projeto, valor, macroetapa e datas das etapas (peças técnicas, fim da contratação, dias de obra, entrega); sem farol; filtros; ordem por entrega | No ar | E5 |
| A17 | Detalhe abre em tela grande com X para fechar, não em gaveta lateral | No ar | E6 |
| A18 | Evitar barra de rolagem em todo o sistema | No ar (regra conferida em cada entrega) | E2 (regra) e cada entrega |
| A19 | Ficha: o que é, valor, macroetapa e **observação** em destaque; sem farol | No ar | E6 |
| A19 | Relatório de inconsistências por órgão ou geral, para a equipe | No ar | E10 |
| A19 | (novo 23/11) "Macroetapa vencida" e os alertas de atenção ficam por último e só para a equipe, nunca em destaque para o prefeito | No ar | E10 |
| A20 | Abas: cadastro, recurso, entrega; governança no fim (origem e responsável pelo dado, pontos de atenção); sem valores por ano | No ar | E6 |
| A21 | Ficha hierarquizada; recursos resumidos (total, fonte de captação, contrapartida); saem tipo e órgão de contratação, situação e tipo de recurso | No ar | E6 |
| A21 | (novo 23/11) Localização perto do cadastro; documentos, origem e dependência do dado para baixo | No ar | E6 |
| A22 | Sem menu próprio de "Localização e fotos"; as duas ficam dentro do projeto, separadas | No ar | E6 + E9 |
| A23 | Kanban: card só com nome, órgão e entrega prevista; sem valor e sem farol; mais cards por coluna | No ar | E7 |
| A24 | Kanban: filtros por órgão ou área e período de entrega; foco até Execução | No ar | E7 |
| A26 / A27 | Estruturação começa na chegada do projeto e do orçamento; cada coluna mostra a **previsão de saída do marco** da planilha | No ar | E7 |
| A28 | Kanban sem a coluna Conclusão (fica no Histórico) | No ar | E7 |
| A29 | Gantt: busca por nome e filtros de órgão, macroetapa e período de entrega | No ar | E7 |
| A30 | Carteira com grandes números no topo (total de projetos e de valor) que mudam com os filtros; a "Visão por órgão" deixa de existir | No ar | E5 |
| A31 | Menu nas três visões; governança da execução com responsável e tempo na mão do responsável | Parcial: menu no ar (E11); responsável, tempo na mão e cronograma no sistema em andamento (E13) | E11 + E13 |
| A31 | (novo 23/11) Criar o cronograma dos demais projetos no sistema (hoje só os cronogramas do GEPP existem, e eram só leitura) | Em andamento | E13 |
| A31 | (novo 23/11) Governança do projeto: quem são os envolvidos e como controlar os recursos | Parcial: responsável por tarefa em andamento (E13); controle dos recursos a planejar | E13 + a planejar |
| A32 | Processos do SEI listados dentro do projeto | Parcial: aba Processos SEI na ficha no ar; ligação real com o SEI depende do B7 (banco) | E6 (+ B7 do banco) |
| A34 | Gestão das licitações dentro da visão gerencial: grandes números primeiro | Em andamento | E12 |
| A35 | Por etapa da contratação: concluídas (ordem de serviço, pago, %), em julgamento, publicadas, editais em ajustes, em preparação, projetos em finalização; campos de cada uma | Em andamento | E12 |
| A35 | (novo 23/11) Os campos da licitação passam a fazer parte dos dados do projeto e a pessoa atualiza só a fase da licitação, sem planilha paralela | Em andamento | E12 |
| A36 | Edição rápida em linha dos dados da licitação (o prefeito só vê) | Em andamento | E12 |
| A37 | Por enquanto manual ou por planilha modelo; depois, integração com PNCP e Compras.gov | Manual: em andamento (E12); integração: futuro | E12 (manual) + E14 (integração) |

Quadro final (23/11/2026): 40 pedidos (alguns áudios trazem mais de um; seis foram acrescentados na conferência de 23/11). 31 estão no ar em produção, aguardando o teste do dono; 3 são parciais (A31 menu e responsável, A31 envolvidos e recursos, A32 SEI); 6 estão em andamento (A31 cronogramas, A34, A35 duas linhas, A36 e A37 manual); a integração do A37 (E14) é futura.

Pontos de atenção da conferência:
- **A19 (farol):** o dono disse não lembrar de vermelho, amarelo, cinza e verde na planilha e que precisa entender melhor de onde veio a regra. Até lá o farol fica fora da tela do prefeito e da ficha (já cumprido) e só aparece para a equipe. Esclarecer a origem com o dono.
- **A31 (controle de recursos):** foi citado de passagem ("como controlo os recursos"); não há entrega que o cubra. Entra como pendência a planejar (README, seção 8).
- **A35 e A37 (modelo da planilha):** a transcrição diz que o acompanhamento das licitações hoje vive em outro arquivo e que a ideia é ter esses campos nos dados do projeto. Isso confirma o princípio 11: o modelo de planilha, quando chegar, só serve para a carga inicial.

Pedido posterior do dono (23/11/2026): "entro numa tela, dela vou pra outra, porém não consigo retornar para a tela que iniciei" (princípio 3: toda tela permite voltar à de origem com os filtros preservados). Atendido na **E15** (navegação), com os 13 caminhos corrigidos: ficha → cronograma, diálogo de detalhes → cronograma, sala de guerra → cronograma e ficha, ficha → documentos (envio e volta), ficha → SEI, ficha → histórico completo, prioritários → ficha, alertas e reunião → ficha, obras sem localização → ficha, mapa → localização, Novo projeto → ficha, licitação em detalhe → ficha e Gantt → ficha.

## 3. Entregas, ordem e quem faz

Regras que valem para todas as entregas:
- Uma branch e um PR por entrega.
- Antes do PR: `astro check`, `test:dados`, Playwright, `impacto`, Fluxo, README e CHANGELOG atualizados.
- A 🟣 Opus escreve a ordem de serviço. O 🟠 Codex executa (sol, terra ou luna, conforme o risco). O 🔵 Sonnet confere o portão.
- Revisão independente da 🟣 Opus em migração, permissão e gravação.
- O 🟢 Haiku tira as fotos de tela para conferência.
- Publicação só com ordem do dono.

A % de cada entrega é atualizada no README (seção 2) a cada PR. Situação de 23/11/2026: as entregas E1 a E11 foram publicadas em produção (a migração 0008 entrou junto com E8, E9 e E11) e aguardam o teste do dono em produção.

| # | Entrega | Áudios | Depende de | Banco | Executor | % |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | **Base para "do zero"**: edição dos campos na página do projeto (B2b), campo **área** com catálogo da prefeitura (B4 parcial), marca de **prioritário** (D1), códigos da tela a partir de 9000 (D3), importação da área e da marca pela planilha, os dois no Novo projeto | A04, A21, D1, D3, base de tudo | — | Migração 0007: `projeto.area`, `projeto.prioritario` e tabela `catalogo` (área, órgão, região) | Codex sol + revisão Opus | 100% (no ar em produção; aguardando teste do dono) |
| E2 | **Padrão visual e filtros**: fundo claro nos dois temas; componente único de filtros (nome, órgão, área, macroetapa, período de entrega mês/ano) com estado no endereço; ordem por entrega; checagem de rolagem | A03, A16, A18, A24, A29 | — | — | Codex terra | 100% (no ar; aguardando teste do dono) |
| E3 | **Tela do prefeito "Projetos prioritários"**: layout do croqui; grandes números de quantidade e valor por macroetapa, clicáveis; obras por área (barras por quantidade); linha do tempo empilhada por área (mês e ano até 2028); próximas entregas filtradas; principais obras. Saem farol, prazo, parado, decisões pendentes, convênios e valores regionais | A01, A03, A09, A11, A12, A13, A14 | E1, E2, D1 | — (leitura) | Codex terra | 100% (no ar; aguardando teste do dono) |
| E4 | **Mapa por área**: legenda e filtro por área e macroetapa; região como filtro opcional; total de obras e valor por região; sem situação nem farol | A04, A05, A06, A14 | E1, E2 | — | Codex terra | 100% (no ar; aguardando teste do dono) |
| E5 | **Carteira de projetos**: grandes números que seguem os filtros; colunas ID (só número, discreto), órgão, projeto, valor, macroetapa, peças técnicas, fim da contratação, dias de obra, entrega; agrupada por macroetapa e ordenada por entrega; impressão no formato do relatório por órgão; "Visão por órgão" redireciona para a Carteira filtrada | A16, A30 | E2 | — | Codex terra | 100% (no ar; aguardando teste do dono) |
| E6 | **Ficha única do projeto** (tela grande com X e a mesma página): topo do prefeito (o que é, órgão, área, valor, macroetapa, entrega prevista, observação, localização); abas Recurso (resumido), Entrega (datas das etapas), Localização, Fotos, Documentos, Processos SEI, Cronograma, Histórico e Governança (origem e responsável pelo dado, pontos de atenção, SEI, dependências); saem farol, valor por ano, tipo e órgão de contratação, situação e tipo do recurso; sai do menu a guia "Localização e fotos" | A17, A19, A20, A21, A22, A32 | E1 | — | Codex terra | 100% (no ar; aguardando teste do dono) |
| E7 | **Kanban e Gantt**: cards com nome, órgão e entrega prevista; coluna mostra a previsão de saída do marco; sem Conclusão; filtros do padrão; mover grava no banco com portão e motivo (B3); Gantt com os mesmos filtros | A23, A24, A26, A27, A28, A29 | E2; B3 grava | Sem migração nova (usa `evento_projeto`) | Codex sol (gravação) + revisão Opus | 100% (no ar; aguardando teste do dono) |
| E8 | **Localização por endereço**: procurar rua, endereço ou bairro; mostrar o ponto; o usuário confirma; segue o limite da cidade e do entorno | A07 | D4 | — | Codex sol (serviço externo) + revisão Opus | 100% (no ar desde 23/11; aguardando teste do dono) |
| E9 | **Fotos da obra**: enviar, legendar e ver fotos na aba Fotos (R2, como os documentos); Histórico | A22 | E6 | Migração 0008: colunas e índices na tabela `projeto_foto` (já existente) | Codex sol + revisão Opus | 100% (no ar desde 23/11; migração 0008 aplicada; aguardando teste do dono) |
| E10 | **Painel de gestão (equipe)**: recebe o que saiu da tela do prefeito (farol, onde está parado, decisões pendentes, alertas); **relatório de inconsistências** por órgão ou geral (campo faltando, data fora de ordem, macroetapa vencida), com impressão e CSV | A13, A19 | E3 | — | Codex terra | 100% (no ar; aguardando teste do dono) |
| E11 | **Menu nas três visões** (Gerencial, Governança da execução, Convênios); tela **Visão Convênios** com convênios em execução, em risco e CAUC, usando a Captação | A01, A31 | E3, E10 | — | Codex luna | 100% (no ar desde 23/11; aguardando teste do dono) |
| E12 | **Gestão das licitações** (cadastro e acompanhamento 100% no sistema): grandes números por situação (6 etapas) → listas por etapa com os campos do relatório (marco, valor estimado/contratado/proposta, pago, empresa e colocação, onde está, aguardando quem, abertura, publicação prevista); próximos marcos; "aguardando PGM" e "aguardando outras áreas"; **edição em linha** para editor ou acima (prefeito só lê); cadastro de nova contratação e avanço de etapa na tela; ligação opcional com o projeto (há contratações sem projeto). O modelo de planilha do dono, quando chegar, só serve para a **carga inicial**; deixou de ser bloqueio | A34, A35, A36, A37 | D5 deixou de bloquear | Migração 0010: `contratacao`, `contratacao_marco` e `evento_contratacao` | Sonnet (substituindo o Codex) + revisão Opus | 90%: código, testes e revisões concluídos; aguardando a prévia do dono, o PR e a publicação |
| E13 | **Governança da execução, ampliada**: o cronograma passa a ser um processo completo no sistema. Criar o cronograma do projeto; incluir, editar, reordenar e remover tarefas; marcar início e fim reais; troca de responsável com histórico; **tempo na mão** por pessoa e por área (relógio a partir do início real); alertas: **atenção** quando passa da duração prevista e **urgente** quando passa do dobro; painel **"Responsáveis"** com impressão e CSV. Migração 0009 reconstrói `etapa_cronograma` com identificador estável | A31 | E11 | Migração 0009: `etapa_cronograma` com id estável e histórico de responsável da tarefa | Codex sol + revisão Opus | Em andamento (~25%): ordem escrita e revisada no desenho, em construção em branch separada, ainda fora da `main` |
| E14 | **Integração PNCP e Compras.gov** (resultado, colocação, homologação) | A37 | E12 | — | Plano Opus próprio | 0% (evolução futura) |
| E15 | **Navegação: sempre poder voltar** (princípio 12). Corrige 13 caminhos que perdiam a tela de origem; o botão "← Voltar para …" aparece automaticamente quando a tela foi aberta a partir de outra; função `voltaSegura` aceita qualquer tela dentro de `/plataforma/` e mantém os filtros | pedido do dono de 23/11 (sem áudio) | E2 | — | Sonnet (substituindo o Codex, que no Windows não roda node) + revisão Opus | Em andamento (~25%): ordem escrita e revisada no desenho, em construção em branch separada, ainda fora da `main` |

### Ordem e paralelismo
- **1ª rodada:** E1 e E2 ao mesmo tempo. Não tocam os mesmos arquivos.
- **2ª rodada:** E3, E5 e E6 em paralelo, cada uma na sua worktree. Todas usam o filtro da E2 e a área da E1.
- **3ª rodada:** E4, E7 e E10.
- **4ª rodada:** E11, E8 e E9.
- **5ª rodada (em andamento):** E12, E13 e E15, em branches separadas (as três não tocam os mesmos arquivos; a junção é por merge, com a suíte completa na cópia juntada).
- **Depois:** E14.
- **Prévia visual antes do código** em E3, E5 e E6: o dono aprova o desenho na tela local (`wrangler dev`), conforme a regra K.

### Percentual por fase (para o README)
| Fase | Entregas | % |
| --- | --- | --- |
| Base de dados para operar do zero | E1, E9 | 100% |
| Visão gerencial (prefeito) | E2, E3, E4, E5, E6, E7, E8 | 100% |
| Governança (equipe) | E10, E11, E13 | 75% (E10 e E11 no ar; E13 em ~25%) |
| Navegação | E15 | 25% |
| Licitações | E12, E14 | 45% (E12 em 90%; E14 em 0%) |

## 4. Banco de dados (projetar antes de criar)

Segue o roteiro do `projeto-banco.md`; cada migração passa por revisão independente.

- **0007 (E1):** colunas `area` e `prioritario` (0/1, padrão 0) em `projeto`; tabela `catalogo` (`prefeitura_id`, `tipo` em área/órgão/região, `codigo`, `nome`, `ordem`, `ativo`), única por prefeitura e tipo. A área de cada projeto é editável na tela e vem da planilha. Enquanto a lista oficial de áreas não chega, uma sugestão inicial é proposta a partir do órgão e vai ao dono para conferência (D2).
- **Fotos (E9):** reaproveita a tabela `projeto_foto` da 0001 (`prefeitura_id`, `projeto_id`, chave no R2, tipo, tamanho, legenda, data da foto, autor, remoção lógica); a migração 0008 acrescenta `removida_por`, `sha256` (mesma foto não entra duas vezes no projeto) e índices, no mesmo padrão dos documentos. O nome `foto_projeto` do plano foi trocado pela tabela existente para não haver duas tabelas de fotos.
- **Governança da execução (E13, migração 0009):** reconstrói `etapa_cronograma` com identificador estável (para editar, reordenar e remover tarefas sem perder o histórico) e guarda o histórico de responsável de cada tarefa, para calcular o tempo na mão de cada pessoa e de cada área.
- **Licitações (E12, migração 0010):**
  - `contratacao` (`prefeitura_id`, `id`, `projeto_id` opcional, nome, situação nas 6 etapas, valores estimado, de proposta e contratado, pago, empresa, colocação, onde está, aguardando, datas de abertura, publicação prevista e marco, observação, `revisao`).
  - `contratacao_marco` (data e descrição).
  - Todo evento entra no Histórico.
  - **Real (migração 0010, E12):** `contratacao`, `contratacao_marco` e `evento_contratacao` (Histórico próprio, imutável), com valores em centavos (teto de R$ 10 bilhões), datas conferidas e chaves compostas por prefeitura.
- **Sem dado real no repositório.** Exemplos novos (áreas, licitações, fotos, cronogramas) entram em `data/exemplo`.

## 5. Decisões do dono

Respondidas em 22/11/2026:

- **D1:** a tela "Projetos prioritários" mostra a **carteira inteira**, com um **campo para marcar o projeto como prioritário** (filtro "só prioritários"). O campo entra na E1 (importação e tela).
- **D2:** a lista oficial de áreas será enviada mais adiante. Até lá, a área sugerida vem do órgão e pode ser editada na tela; a lista oficial substitui a sugestão quando chegar.
- **D3:** **faixa separada.** Projetos cadastrados pela tela recebem código a partir de 9000; a planilha segue a própria numeração. Não há mais colisão entre os dois. Entra na E1.
- **D4:** busca de endereço por serviço **gratuito** (OpenStreetMap/Nominatim), respeitando o limite de uso, com cache e confirmação do usuário.
- **D5:** o modelo de acompanhamento das licitações será enviado. **Atualizado em 23/11/2026:** a E12 não espera mais o arquivo; cadastro e acompanhamento ficam 100% no sistema, e o modelo, quando chegar, só serve para a carga inicial.
- **D6:** confirmado. O "próximo marco aguardando" fica fora da tela principal e aparece só no detalhe.

Respondidas em 23/11/2026 (plano de E12 e E13 aprovado com o padrão sugerido):

- **E13-P1 (A):** o tempo na mão é contado por **pessoa e por área**.
- **E13-P2 (A):** o relógio começa no **início real** da tarefa (a pessoa marca o início), não na data prevista.
- **E13-P4 (A):** alerta de **atenção** quando passa da duração prevista; **urgente** quando passa do dobro.
- **E12-P1 (A):** as licitações seguem as **6 etapas** do relatório de referência.
- **E12-P2 (A):** **editor ou acima edita**; o perfil leitura (prefeito) só vê.
- **Princípios novos:** "o sistema substitui a planilha" e "sempre poder voltar" (seção 1, itens 11 e 12).
- **Navegação (E15):** nova entrega aprovada para que toda tela aberta a partir de outra volte à origem, com os filtros.

## 6. Critérios de aceite (de cada entrega e do conjunto)

- Cada linha da seção 2 só fica "Atende" quando funciona **com a base carregada e com um banco vazio preenchido pela tela**. Há teste de ponta a ponta para os dois casos.
- Todo processo novo tem início, meio e fim na tela, sem depender de planilha para continuar (princípio 11).
- Toda tela aberta a partir de outra oferece voltar à origem com os filtros, com teste (princípio 12).
- Sem rolagem horizontal em 1280 px e 390 px; rolagem vertical só na lista de projetos e nas tabelas longas.
- Datas em `DD/MM/AAAA`, valores em R$ e ordem padrão pela entrega mais próxima.
- O perfil "leitura" (prefeito) não vê controles de edição; o servidor confere de novo o perfil em toda gravação.
- Os 9 vetores de segurança são checados em toda entrega que grava.
