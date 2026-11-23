# Changelog


## E12 · ajustes da revisão (23/11/2026)
- Gestão das licitações: botões de envio ficam desabilitados até a resposta (marcos, mudança de etapa e remoção), evitando clique duplo; ao editar um campo no painel só os detalhes do próprio campo são refeitos, e `aguardando`/`valor_*` recarregam a página para atualizar selos e % pago; "Avançar" não envia mais data do navegador (o servidor usa a data de hoje em Brasília).

## Junção E12 + E13 + E15 (23/11/2026)
- As três entregas foram juntadas na branch da E13: E12 Gestão das licitações (migração 0010), E13 Cronograma como processo e painel Responsáveis (migração 0009) e E15 Navegação. Cada uma tem código, testes, revisão independente e prévia aprovada pelo dono (~90%); aguardam merge (PR #54 E15, PR #55 E12 que contém a E15, e o PR da E13 que conterá as três) e publicação.
- Na junção, os links da E13 passaram a usar o mecanismo da E15 (`volta` na ficha, no cronograma e em Novo cronograma; Responsáveis aparece nos nomes de tela do "Voltar"). Menu: Responsáveis na Governança da execução e Gestão das licitações na Visão gerencial.
- Ordem de publicação: migração 0009, depois 0010 (ordem numérica), antes do código. Nada foi aplicado em produção.

## E13 · Cronograma como processo e painel Responsáveis (23/11/2026)

**O que mudou**
- Cronograma criado e mantido na tela: criar o cronograma de um projeto (botão na ficha e na lista), incluir, editar, reordenar (tarefas e fases), iniciar, concluir e remover tarefas, e trocar o responsável com histórico; tudo entra no Histórico. Nova aba "Tarefas e responsáveis" no cronograma.
- Painel Responsáveis (menu da Governança da execução): com quem está cada tarefa aberta e há quantos dias, por pessoa e por área, com atenção e urgente; filtros, impressão e CSV; visível ao perfil leitura.
- Quadro de tarefas e ficha do projeto mostram o tempo na mão e as tarefas com alerta; a ficha mostra o cronograma editado na tela e leva "voltar" para a tela de origem.
- Migração 0009 (D1): chave estável das tarefas, trocas de responsável, versão do cronograma e marca "editado na tela"; dado antigo inválido é saneado com registro na pendência da tarefa; a carga da planilha não altera o que foi editado na tela.
- Fluxo atualizado (Planejamento e Onde está parado).

**O que NÃO mudou:** login, publicação na Cloudflare, `wrangler.jsonc`, Postgres legado (só comentário), dependências do projeto. Nada foi aplicado em produção.

## E12 · Gestão das licitações (23/11/2026)
- **Parte B (telas):** guia Gestão das licitações na Visão gerencial (depois de Mapa e painel): grandes números por etapa, listas com os campos do relatório, próximos marcos, aguardando PGM e outras áreas, filtros, impressão em A4 e CSV; edição em linha, cadastro, mudança de etapa, marcos e remoção para editor ou acima (o prefeito só vê); página da contratação com Histórico; aba Contratações na ficha do projeto; Fluxo atualizado.
- **Não mudou:** login, protótipo do SEI (módulo Licitações), Histórico dos projetos, painel do prefeito.
- **Parte A:** banco, regras, gravação e carga. Teto de valor de R$ 10 bilhões por campo; carga valida `concluido_em` e o limite de marcos.
- Migração D1 `0010_contratacao.sql` (contratação, marcos e Histórico próprio), módulo `src/lib/contratacoes/`, rota `POST /plataforma/gestao-licitacoes/gravar/` e carga de exemplo. Telas na Parte B.
- **Riscos aceitos:** o Histórico (`evento_contratacao`) cresce sem limite próprio; o freio é o limite de 30 gravações por minuto por pessoa e o teto de 20.000 contratações (ativas e removidas) por prefeitura.

## E15 · Navegação: sempre poder voltar à tela de origem (23/11/2026)
- Pedido do dono: "entro numa tela, dela vou pra outra, porém não consigo retornar para a tela que iniciei". Todo link de conteúdo que leva a outra tela carrega a origem (caminho e filtros) no parâmetro `volta`; a tela de destino mostra "← Voltar para [tela]" (componente `Voltar.astro`, automático no layout da plataforma).
- Só telas sob `/plataforma/` valem como volta (módulo `src/lib/navegacao/volta.ts`); no máximo 2 níveis; avisos de ação concluída (`salvo`, `rf`, `r`) não voltam junto. Link externo, rota de gravação, arquivo ou CSV são ignorados.
- A ficha guarda a origem nas idas a Documentos, Fotos, Edição, Cronograma, SEI e Histórico completo; o X fecha para a origem e, depois de gravar a edição, a aba continua a mesma. Os links fixos "← Todos os cronogramas" e "← Todas as salas de guerra" aparecem só quando a tela não recebe `volta`.
- 13 caminhos corrigidos: ficha, cronograma, sala de guerra, documentos, SEI, histórico completo, diálogo de detalhes, prioritários, alertas, reunião, licitação em detalhe, localização, mapa, Novo projeto e Gantt (nome do projeto virou link para a ficha).
- Não mudou: login, rotas de gravação (só o redirecionamento final dos documentos leva a volta, validada de novo no servidor), banco e migrações. Sem dependência nova.
## Documentação: rastreabilidade dos áudios e princípios de 23/11 (23/11/2026)
- Cada um dos 31 áudios foi conferido contra a tabela de requisitos: seis pedidos acrescentados (40 no total) e a situação real de cada um (E1 a E11 no ar; E12, E13 e E15 em andamento; E14 futura).
- Dois princípios novos do dono entram no plano, no README e no histórico: o sistema substitui a planilha, e sempre poder voltar à tela de origem.
- Decisões de E12 e E13 (tempo na mão por pessoa e por área, relógio no início real, atenção e urgente, 6 etapas, quem edita) registradas; README com pendências e próximos passos atualizados. Sem mudança de código.

## E11 · Menu nas três visões e Visão Convênios (22/11/2026)
- Menu lateral em três visões (áudio 31): **Visão gerencial** (Projetos prioritários, Carteira, Mapa e painel, Kanban e Gantt), **Governança da execução** (Painel da equipe, Projetos · Início, Cronogramas, Onde está parado, Inconsistências, Pendências, Reunião, Sala de guerra, Histórico, Alertas e Processos no SEI) e **Convênios** (Visão Convênios e as guias da Captação). Depois vêm Licitações (demonstrativo, com os grupos de antes) e Conta (Usuários, Fluxo do sistema, WhatsApp, relatórios, perfil e configurações).
- Nenhum endereço mudou: todas as telas abrem no mesmo lugar. A guia "Gestão · Painel" passou a se chamar "Mapa e painel" (mesmo endereço).
- Nova tela **Visão Convênios** (`/plataforma/convenios/`, áudio 01): convênios em execução, convênios em risco (a mesma regra do Painel da equipe) e regularidade no CAUC, com os dados públicos que a Captação já coleta. Sem dado novo e sem gravação.
- O menu esconde as guias que o perfil não pode abrir (Painel da equipe, Inconsistências e Usuários para o perfil leitura); as páginas continuam respondendo 403.
- Pendências das revisões: o mapa da Gestão usa os nomes de área do catálogo da prefeitura; os atalhos de localização vão para a aba Localização da ficha (rótulo "Localização"); saiu o componente antigo `LocalizacaoProjeto.astro`; o CSV protege também o sinal de fórmula depois de espaços; teste do 403 do CSV pela própria rota; `tests/dashboard-mapa.spec.ts` saiu (o mapa compacto está na tela do prefeito e já é testado em `tests/mapa-area.spec.ts`).
- Testes de interface ganharam um servidor local com um usuário fictício de perfil leitura (projeto `leitura` do Playwright).

## E9 · Fotos da obra na ficha do projeto (22/11/2026)
- Aba Fotos da ficha: enviar uma foto por vez (JPG, PNG ou WEBP, até 10 MB) com legenda e data da foto, ver em grade com ampliação e remover (remoção lógica: o arquivo fica guardado).
- Envio e remoção entram no Histórico do projeto no mesmo lote da gravação.
- Mesmo padrão de segurança dos documentos: chave do R2 gerada pelo sistema com prefixo próprio por prefeitura e projeto, tipo conferido pelo conteúdo (SVG recusado), origem, perfil, tamanho e limite de requisições antes de ler o pedido; até 60 fotos por hora por pessoa e 200 por projeto.
- Envio e remoção: administrador, gestor e editor; o perfil leitura só vê.
- Migração 0008: acrescenta `removida_por`, `sha256` e índices à tabela `projeto_foto` (criada vazia na 0001); não altera linha existente.

## E8 · Busca de endereço na localização (22/11/2026)
- Na aba Localização da ficha e no Novo projeto, quem pode gravar procura por rua, endereço completo ou só bairro; os resultados aparecem no mapa e numa lista.
- Escolher um resultado só mostra o local; "Usar este local" coloca o ponto (com o endereço preenchido) e só o botão Salvar grava, pela mesma rota da B1, com o Histórico. "Descartar" não muda nada.
- Busca pelo servidor no OpenStreetMap (Nominatim, decisão D4): endereço fixo, Brasil e caixa de Goiânia mais o entorno, até 5 resultados, tempo-limite de 5 s, 1 pedido por segundo, cache e limite por pessoa; resultado fora da área aceita é descartado; o texto da busca não vai a log.
- Rota nova `POST /plataforma/localizacao/buscar/` (só administrador, gestor e editor) com origem, perfil, formato, limite e tamanho conferidos antes de ler o pedido. Não grava nada.
- Na máquina local, respostas fictícias: os testes nunca chamam o serviço real. Sem migração e sem mudança no `wrangler.jsonc` e no `_headers`.

## E10 · Painel da equipe e relatório de inconsistências (22/11/2026)
- Novo Painel da equipe (Gestão): recebe o que saiu da tela do prefeito na E3 (indicadores com farol e situação, prazos da Lei, entregas, onde está parado, decisões pendentes, convênios e valores por região) e os 5 primeiros alertas da central. Sem mapa: o mapa por área é da E4.
- Novo relatório Inconsistências de dados, por órgão ou geral: 10 regras (sem órgão, sem área, sem valor, sem macroetapa, datas previstas faltando, datas fora de ordem, macroetapa vencida, SEI inválido, sem localização e outras pendências da carga), contagem por regra e por órgão, link para a aba Governança da ficha, impressão em A4 e CSV protegido contra fórmula.
- As duas telas são só leitura e só para administrador, gestor e editor; o perfil leitura vê "Sem permissão".
- Os testes de tela do painel antigo (pausados na E3) voltaram, apontando para o Painel da equipe; os do mapa compacto continuam pausados para a E4.

## E7 · Kanban e Pendências gravando; filtros e saída do marco (22/11/2026)
- Kanban com cards enxutos: nome, órgão e a previsão de saída da etapa (aba PIPELINE); sem valor e sem farol; mais cards por coluna.
- Sem a coluna Conclusão: o quadro vai até Execução e informa quantos projetos estão concluídos (ficam na Carteira e no Histórico).
- Filtros do padrão no Kanban: nome, órgão, área, macroetapa e período de entrega.
- Mover no Kanban e aprovar ou reprovar nas Pendências de etapa gravam no banco (B3), com portão, motivo, forçar com motivo e controle de alteração simultânea; cada mudança entra no Histórico no mesmo lote.
- Rota nova `POST /plataforma/projeto/mover/<id>/` com origem, perfil, formato, limite de requisições e tamanho conferidos antes de ler o pedido.
- Sem migração nova.

## E4 · Mapa das obras por área (22/11/2026)
- Legenda, cor e filtro por área (saúde, educação, assistência social, drenagem, parques e lazer, cultura…), com as mesmas cores da tela do prefeito; a área sugerida pelo órgão vale até a área ser gravada.
- Filtros só por macroetapa (a mesma divisão da tela do prefeito) e área, mais a região como filtro opcional; estado no endereço da Gestão (`etapas`, `areas`, `regiao`).
- Saem do mapa a situação do prazo (no prazo, atenção, atrasada), o farol e o tipo de obra; o painel da região mostra o total de obras e o valor.
- O mapa compacto voltou à tela do prefeito, abaixo da linha do tempo, com as obras dos filtros da tela; "Abrir na Gestão" leva área, macroetapa e região.
- Bolhas e marcadores nunca se cobrem nem ficam embaixo dos controles (posição calculada sem sobreposição); a linha do trecho de rua deixa de ser clicável e ganha um marcador. Corrige a instabilidade do teste de acessibilidade (alvos de toque) do mapa.
- Sem rota nova, sem gravação e sem migração.

## E6 · Ficha única do projeto (22/11/2026)
- A Carteira abre a ficha do projeto em página inteira; o X volta à lista com os mesmos filtros.
- Topo com órgão, área, valor total, macroetapa, entrega prevista, localização e observação em destaque; abas Cadastro, Recurso, Entrega, Localização, Fotos (em breve), Documentos, Processos SEI, Cronograma, Histórico e Governança.
- Saem da ficha: farol, valores por ano, tipo e órgão de contratação, situação e tipo do recurso.
- A guia Localização e fotos saiu do menu: o endereço com projeto abre a aba Localização; sem projeto, lista as obras sem localização.
- Sem rota de gravação nova; edição (E1) e localização continuam pelas mesmas rotas.
- Corrigido: `test:dados` tinha a chave duplicada e deixava de rodar os testes de edição e de área.

## E5 · Carteira de projetos (22/11/2026)
- Grandes números no topo (total de projetos e de valor), que seguem os filtros. A soma é feita em centavos; projeto sem valor conta na quantidade e aparece avisado.
- Colunas: ID (só o número, discreto), Órgão, Projeto (em destaque), Valor, Macroetapa, Peças técnicas, Fim da contratação, Dias de obra e Entrega. Sem farol na lista.
- Filtros padrão da E2 mais "Só prioritários" (D1). A busca também aceita o código (P-901, 901), para os links antigos.
- Agrupada por macroetapa e, em cada uma, da entrega mais próxima para a mais distante (sem data por último). No celular, cada projeto vira um cartão.
- Impressão no formato do relatório por órgão: cabeçalho com totais e filtros, grupos por macroetapa, preto no branco.
- A guia "Visão por órgão" saiu do menu; o endereço antigo leva à Carteira com o filtro de órgão. A ficha (Ver detalhes) não mudou.

## E3 · Tela do prefeito "Projetos prioritários" (22/11/2026)
- A tela inicial (`/plataforma/`) passa a ser "Projetos prioritários": obras por área (barras por quantidade), quantidade e valor por etapa (Execução, Contratação, Preparatório, Planejamento, Estruturação; Concluídas e Sem macroetapa quando houver), linha do tempo de entregas empilhada por área até dez/2028, próximas entregas e principais obras.
- Todo número é clicável e vira filtro (etapa, área, mês da entrega); o filtro fica no endereço e o "voltar" do navegador restaura. Filtros "Só prioritários", órgão e região (opcional).
- Saem da tela do prefeito: farol, prazos, "onde está parado", decisões pendentes, convênios, valores por região e o mapa. O painel antigo continua no código para o painel da equipe (E10); os testes de tela dele ficam pulados até lá.
- Novo `src/lib/gestao/prioritarios.ts` (funções puras, valores em centavos para as partes somarem o total) com 16 testes; gráficos em SVG próprio, sem dependência nova.

## E1 · Base para operar do zero (22/11/2026)
- Publicação: aplicar a migração 0007 ANTES de publicar o código (o código novo lê area e prioritario; o código antigo funciona sobre o esquema novo).
- Revisão independente: aprovada com ressalvas. Corrigido: nome da área cai na lista padrão quando o catálogo não é passado; mensagem da faixa reservada diz "Nada foi gravado no banco". Pendentes de baixa gravidade: carregar o catálogo no contexto da Carteira e do WhatsApp; Histórico traduzir área pelo catálogo; edição que reenvia área já gravada e desativada recebe 400 (a tela não reenvia).

- Edição dos campos na página do projeto por quem tem permissão. O D1 confere a revisão e grava as mudanças com antes e depois no Histórico no mesmo lote.
- Migração 0007 prepara o catálogo de áreas por prefeitura e a marca de prioritário. A sugestão por órgão depende de um clique. Edição, Novo projeto e importação usam os dois campos.
- O cadastro pela tela começa em P-9000. A importação recusa códigos dessa faixa e preserva os valores de área e prioritário ausentes na planilha.
- A E1 grava pelo D1. Kanban, localização, login e adaptadores Postgres e JSON seguem seus fluxos existentes.
## E2: padrão visual e filtros (22/11/2026)
- Telas de Projetos com fundo claro e neutro nos temas claro e escuro; cor só na informação. Menu lateral e login sem mudança.
- Novo componente de filtros (`FiltrosProjetos.astro`): nome, órgão, área (aparece quando a carteira tiver área), macroetapa e período de entrega (mês e ano de início e de fim). O filtro fica no endereço: dá para compartilhar o link e voltar pelo navegador.
- Nova função pura `src/lib/carteira/filtros.ts`: filtragem e ordem da entrega mais próxima para a mais distante (sem data por último), com testes.
- Gantt geral usa o componente e a nova ordem; mostra a data de entrega de cada projeto. Carteira, Kanban e Visão por órgão não mudaram (ficam para E5 e E7).

## Plano dos requisitos dos áudios (22/11/2026)
- Novo `docs/govnexa/plano-requisitos-audios.md`: 34 pedidos rastreados por áudio, situação de hoje, entregas E1 a E14 com dependências, banco, executor e %, decisões D1 a D6 e critérios de aceite (funcionar com base carregada e do zero). Só documentação; nenhum código mudou.

## Mapa das obras no dashboard (20/11/2026)
- Versão compacta do mapa da Gestão no Início, abaixo dos indicadores, com os filtros do dashboard (região, órgão, prioridade, compromisso). Miniatura estática; "Ampliar mapa" abre a mesma apresentação em tela cheia (filtros, painel, ficha) e, ao sair, volta à cidade inteira.
- O mapa fica fora das áreas renovadas pela atualização automática: não é recriado nem sai da tela cheia; recebe os dados novos por evento só quando mudam. Estado do mapa fora do endereço do dashboard. Sem suporte a tela cheia, abre o mapa na Gestão.
- `MapaObras` ganha a opção `compacto`; a Gestão não muda.

## Verificação completa e correções (19/11/2026)
- Safari: Esc fecha a lista flutuante do menu recolhido (o foco devolvido ao botão reabria a lista) e, no mapa em tela cheia, a lista de filtro fecha junto quando o navegador sai da tela cheia.
- Painel de detalhes: contorno de foco no título só quando aberto pelo teclado.
- Editor de localização: link de atribuição do mapa sublinhado (acessibilidade, igual ao mapa da Gestão).
- Qualidade dos dados: referência do CNES como "registros atualizados até DD/MM/AAAA" (coletor e arquivo atual).
- Limpeza de 4 variáveis sem uso; testes do Safari (tema, mapa TV) sem dependência de tempo.
- Não mudou: dados, banco, login, cabeçalhos de segurança. Falso alarme descartado: contraste de "Recuperar acesso" (a varredura mediu durante a animação de entrada).

## Editor de localização — camadas (18/11/2026)
- Mapa, Satélite e Híbrido no editor, com preferência compartilhada com a Gestão e controles isolados; troca preserva campos e desenhos sem alterar o endereço. Definições reunidas em `src/lib/mapa/camadas.ts`.

## GovNexa — Mapa da cidade para TV touch (Gestão · Painel, 18/11/2026)
- Mapa abre com todas as obras; contagem "no mapa · ocultas pelos filtros · sem localização".
- Filtros enxutos: situação do prazo (Todas, No prazo, Atenção, Atrasadas), etapas e tipos numa linha com rolagem.
- Cor do marcador = situação do prazo; bolhas por região (cidade) e por bairro (zoom médio), com número de obras e anel de cores; obras individuais de perto.
- Painel lateral: resumo da cidade e por região; lista de obras da região/bairro; ficha resumida da obra com "Abrir ficha completa"; obra escolhida destacada no mapa.
- Modo "Apresentar mapa" em tela cheia para a TV (letra grande, alvos de 56 px); fundo do mapa mais claro; no celular, painel abaixo do mapa e filtros sem ficar presos no topo.
- Funções puras de agrupamento em `src/lib/mapa/agrupar.ts` com testes.
- Gestão compacta: cartões em faixa baixa; "Exportar em PDF" abaixo do mapa; filtros em caixas de seleção (Situação, Etapas, Tipos) numa linha com as ações.
- Voltar ao mapa sem perder nada: estado (filtros, zoom, seleção) no endereço; "Abrir ficha completa" abre a ficha por cima do mapa (também em tela cheia) com "← Voltar ao mapa"; página do projeto mostra "← Voltar ao mapa" quando aberta a partir do mapa.
- Camadas do mapa: botões Mapa, Satélite e Híbrido (imagens Esri World Imagery; híbrido com ruas e nomes da Esri). A escolha fica no endereço (`camada=`) e no navegador. A CSP libera `server.arcgisonline.com` só para imagens.
- Apresentação (TV) em três colunas: contagem e filtros à esquerda, com Limpar filtros, Cidade inteira e Sair no pé da coluna; mapa no centro com a altura toda e a legenda embaixo; resumo à direita. As listas de filtro abrem por cima do mapa.

## Centros dos bairros no D1 (17/11/2026)
- Migração 0005, leitura isolada por prefeitura com cache curto e fallback ao exemplo; região aparada nos dados das obras, sem mudança visual.
- Geocodificador manual aceita lista de bairros, valida município Goiânia, respeita limites e gera SQL idempotente escapado. Semente local exclusivamente fictícia.
- Consultas reais e carga em produção não executadas.

## GovNexa — Painel de detalhes (17/11/2026)
- "Ver detalhes" das tabelas passa a abrir um painel lateral: código e nome no topo, situação colorida com o motivo, botões para a ficha completa, cronograma, documentos, localização e histórico, até 4 números-chave, seções em grade de 2 colunas, datas como linha do tempo com "Hoje", histórico em lista, campos vazios agrupados em "Sem informação", navegação ‹ › entre registros, Esc e arrastar para fechar. Tabelas sem detalhe usam o texto exibido nas células (valores em R$). Só apresentação; dados inalterados.

## GovNexa — Auditoria de layout de todas as páginas (17/11/2026)
- Auditoria de 79 páginas em 4 situações (computador claro e escuro, tablet 1024×768, celular 390 px): rolagem, sobreposição, cortes, alvos de toque, texto pequeno, contraste e fotos.
- Corrigido: um único aviso no topo da plataforma; rodapé da plataforma no fim da janela em páginas curtas; círculos decorativos dos cartões atrás do texto; abas numa linha com rolagem no celular; tabelas em cartões até 1100 px e coluna "Detalhes" sem corte no computador; e-mails longos quebram na própria coluna (Usuários); cabeçalho público numa linha no celular; Perfil/Configurações com rótulo "Foto" e campos vazios com dicas; alvos de toque de 44 px em telas de toque; texto informativo com no mínimo 11 px; nomes acessíveis começando pelo texto visível.
- Mantido por decisão do outro desenvolvedor: link de voltar antes do aviso em Documentos do projeto (teste `documentos.spec.ts`).
- Pendente (já existia na main): `acceptance.spec.ts` "mapa das obras" depende da ordem dos testes, porque a carga local preserva localizações gravadas por outros testes.

## Entrega B2: Novo projeto grava no banco
- 2026-11-18: o formulário Novo projeto deixa de ser simulação. Rota `POST /plataforma/projeto/criar/` (só perfil de editor, gestor ou administrador), com todos os campos conferidos de novo no servidor; o projeto nasce na macroetapa 00 com código único (P-N) e o cadastro entra no Histórico no mesmo lote.
- Migração `db/d1/prefeitura/0006_codigo_projeto_unico.sql`: índice único do código dentro da prefeitura. Dois cadastros ao mesmo tempo não repetem o número: o segundo recalcula e grava de novo. Não muda nenhum dado.
- A carga de planilhas nunca sobrescreve um projeto cadastrado pela tela (origem CADASTRO). Se a planilha trouxer o mesmo código, o projeto da planilha é ignorado em silêncio: faixa de códigos separada ou aviso no relatório ficam para decisão do dono.
- Revisão independente: repetição só para código ou id repetido, com espera; texto sem caracteres invisíveis e de direção; localização inicial no Histórico; listas de opções da tela vindas do servidor.

## Entrega B1: página do projeto e localização gravando no banco
- 2026-11-17: página nova `/plataforma/projeto/<código>/`, com tudo o que o sistema sabe de um projeto (resumo, valores e recursos, datas, localização, documentos, cronograma e histórico), aberta pela Carteira, pelo mapa e pela tela de documentos.
- A tela Localização e fotos deixa de ser simulação: o ponto ou os trechos são gravados no banco (rota `POST /plataforma/projeto/localizacao/<código>/`), só por quem tem perfil de editor, gestor ou administrador, e cada alteração entra no Histórico.
- Migração `db/d1/prefeitura/0004_historico_por_projeto.sql`: o histórico de um projeto passa a ser lido por índice. Não muda nenhum dado.
- 2026-11-18 (regra do dono): a localização de um projeto aceita pontos em Goiânia e no entorno, até cerca de 10 km além do retângulo da cidade, porque a prefeitura pode ter obra na divisa ou em acordo com cidade vizinha. Antes só o retângulo da cidade era aceito. A localização dos bairros continua usando o retângulo da cidade.
- Projeto do banco de dados em `docs/govnexa/projeto-banco.md`, aprovado pelo dono em 17/11/2026: princípios para toda entrega com dados e roteiro B1 a B8.

## Correção: layout duplicado depois de um conflito de merge
- 2026-11-17: a resolução do conflito do PR #24 feita no site do GitHub deixou as duas versões da linha principal de `src/layouts/Base.astro`, e toda página saía duas vezes. Fica uma única linha, com o símbolo G e o rodapé que informa a origem dos dados. Teste novo (`tests/layout-unico.spec.ts`) garante um único documento por página. Não chegou a ser publicado.

## GovNexa — Símbolo G como ícone do sistema
- 2026-11-17: símbolo G do logo (componente `src/components/SimboloGovNexa.astro`) no ícone da aba do navegador (`public/favicon.svg`), no ícone de atalho de celular/tablet (`public/apple-touch-icon.png`), no canto da plataforma, no painel do login e no rodapé. Cor do navegador no celular: azul-marinho da marca.
## Correção: rodapé da plataforma informa a origem real dos dados
- 2026-11-17: o rodapé da plataforma dizia sempre "Dados de exemplo". Agora acompanha o aviso do topo: "Dados do banco da prefeitura" com o banco ligado e "Dados de exemplo" só com a carteira fictícia.

## Correção: rodapé da plataforma não fica mais atrás do menu
- 2026-11-17: o rodapé da plataforma passa a respeitar o limite do menu lateral, recolhido ou expandido (o menu é fixo a partir de 1050 px e cobria o começo do texto). Teste novo (`tests/menu-sobreposicao.spec.ts`) percorre todas as telas do menu, nos dois estados e em três larguras, e falha se qualquer texto ou controle ficar atrás do menu.

## Correção: topo da tela Documentos do projeto
- 2026-11-17: o topo da plataforma volta a mostrar o nome da tela ("Documentos do projeto") em vez do nome do projeto, que vazava do cabeçalho quando era longo. O projeto aparece numa linha antes do aviso de dados. O título do cabeçalho passa a ter no máximo duas linhas em todas as telas.

## Regra de trabalho: conferir o repositório durante o trabalho
- 2026-11-17: `CLAUDE.md` ganhou a seção 1.1 (regra do dono): buscar as novidades do repositório antes de tarefa nova, branch, commit, PR e publicação, e atualizar a pasta sempre que possível. Vale para todos os desenvolvedores. Nenhuma mudança de código.

## GovNexa — Troca para o login próprio
- 2026-11-17: login próprio publicado (PR #17, migração central 0002, segredos gravados) e ligado em produção (`LOGIN_MODO=senha`); convites enviados aos administradores; Cloudflare Access retirado da plataforma. Página inicial: textos de acesso atualizados (senha e verificação em 2 etapas).

## Correção 3 — Segurança do login (17/11/2026, sem publicação)

- Limite de segundo fator por conta, bloqueio de uma hora e revogação de sessões pendentes; bloqueio progressivo de senha com falhas preservadas até o login completo.
- Escritas equivalentes para contas ausentes, piso de 800 ms nos POST de login/código/esqueci e e-mail em segundo plano quando waitUntil está disponível.
- Origem pública HTTPS fixa para links, AES-GCM vinculado ao usuário, saída POST com confirmação GET, tamanho obrigatório de formulários e mensagens de Usuários por códigos fixos.
- Desativação invalida tokens; limites antigos têm limpeza oportunista. Modo local exige marcador explícito, passado nos scripts locais. Testes unitários e fluxo Playwright atualizados.

## GovNexa — Login próprio e administração de usuários (17/11/2026, sem publicação)

- Migração central 0002: credenciais, sessões, tokens de e-mail, recuperação, limites e auditoria. PBKDF2-SHA256 com pepper, TOTP cifrado por AES-GCM e proteção contra reuso.
- Convite de 24 h, redefinição de 1 h, 2FA obrigatório e sessões revogáveis. Convite configura aplicativo; redefinição de senha exige novo login. Access permanece padrão por `LOGIN_MODO`.
- Guia Usuários com cadastro, reenvio, perfis, ativação e redefinição de 2FA; isolamento por prefeitura e proteção do último administrador. Turnstile e cabeçalhos de segurança nas páginas de acesso.
- E-mail local simulado, semente fictícia sem leitura de segredos, testes Node e projeto Playwright `login` em porta separada. Fluxo do sistema atualizado. Publicação e teste de navegador ficam pendentes para o responsável.

## GovNexa — Tipo do documento (entrega 1.1)
- 2026-11-17: migração D1 `0003_tipo_documento.sql`: tabela `tipo_documento` por prefeitura (DFD, ETP e TR de sistema; mapa de riscos, projeto básico, orçamento de referência, ART e licença ambiental criados desativados), coluna `documento.tipo_codigo` e travas no banco (só tipo ativo da mesma prefeitura; sem DELETE; documento removido não muda de tipo). Ainda não aplicada em produção.
- 2026-11-17: tipo opcional no envio e troca do tipo na lista (rota `classificar/<id>/`, com origem, perfil, tamanho e limite antes do corpo). Cada troca grava "Tipo de documento alterado" no Histórico. A página mostra quantas peças de cada tipo o projeto tem.
- 2026-11-17: registro das publicações do dia: guia Usuários (3.3), página inicial nova, logo provisória, topo enxuto e mapa, limite de requisições (1.0, PR #15), correções do topo e do rodapé da plataforma e símbolo G.

## GovNexa — Limite de requisições (entrega 1.0)
- 2026-11-17: limite de 30 ações por minuto por pessoa e prefeitura nas rotas que gravam documentos (enviar, remover), pela ligação `LIMITE_API` do Rate Limiting da Cloudflare (`wrangler.jsonc`). Chave `<prefeitura>:<e-mail>`; sem e-mail, recusado sem contar; falha da ligação recusa o pedido. Código em `src/lib/seguranca/limite.ts`.
- 2026-11-17: conserto: `tests/seguranca/rate-limit.test.ts`, citado no `test:dados` e inexistente, agora existe (9 testes).

## GovNexa — Cabeçalho, logo e mapa na página inicial
- 2026-11-17: logo do GovNexa no cabeçalho público (`src/components/LogoGovNexa.astro`, cores por `--logo` e `--logo-a` em `visual.css`), no lugar do nome em texto; versão provisória aprovada pelo dono. A logo da Prefeitura de Goiânia permanece.
- 2026-11-17: menu do topo enxuto: ficam "Acessar plataforma", "Solicitar demonstração" e o botão de tema. Início, Soluções, Insights e Sobre saem do topo e continuam no rodapé.
- 2026-11-17: página inicial: a marca-d'água quadriculada deu lugar a um mapa de cidade (ruas em faixas, parques e água, sem texto). É um desenho próprio inspirado no centro de Goiânia, não o mapa real.
- 2026-11-17: testes do cabeçalho ajustados em `tests/acceptance.spec.ts`.

## GovNexa — Página inicial do site público
- 2026-11-17: nova página inicial (`src/pages/index.astro`, estilos em `src/styles/home.css`, classes `gx-`): mensagem "Do desejo do gestor à obra entregue", quadro de exemplo, as quatro perguntas, ciclo do projeto por rolagem (macroetapas 00 a 06), módulos, avisos automáticos, segurança e entrada da plataforma. Mantém cabeçalho, rodapé, paleta e fonte do site. Números das telas são exemplos fictícios.
- 2026-11-17: decisão do dono: a página não lista as fontes de dados nem a forma de leitura dos processos; o título dos módulos não traz número, porque novos módulos serão acrescentados.
- 2026-11-17: dependência nova `gsap` 3.13.0 (animações), empacotada pelo build; nenhum script externo e nenhuma mudança em `_headers`.
- 2026-11-17: teste `tests/home.spec.ts` (mensagem, entrada, ciclo, sem rolagem horizontal em 1280 e 390 px, acessibilidade nos temas claro e escuro).

## GovNexa — Datas no padrão brasileiro (regra do dono)
- 2026-11-17: função única `src/lib/datas.ts` (`dataBr`, `dataHoraBr`, `dataOuDataHoraBr`): `DD/MM/AAAA` e, com hora, `DD/MM/AAAA HH:MM` no horário de Brasília (sem segundos, por decisão do dono). Aplicada no dashboard ("Atualizado em" e datas das fontes), no Histórico de alterações (tela e CSV) e em Documentos ("enviado em").
- 2026-11-17: correção: "enviado em" dos documentos cortava o dia do texto em UTC e mostrava o dia seguinte para envios depois das 21h de Brasília. 5 testes novos em `tests/datas/datas.test.ts`.

## GovNexa — Usuários (etapa 3.3, opção B, Fase 3)
- 2026-11-17: guia Usuários (`/plataforma/usuarios/`, módulo Conta): lista somente leitura de quem tem acesso à prefeitura (nome, e-mail, cargo, perfil, situação, desde). Só administrador vê a guia e a lista; outros perfis recebem 403. Consulta em `src/lib/usuarios/lista.ts`, sempre filtrada pela prefeitura do solicitante.
- 2026-11-17: decisão do dono: cadastro de usuários pela tela e sincronização com o Access ficam para depois da validação dos fluxos com o cliente. Como incluir e desativar usuários pelo banco: README, seção 6.

## GovNexa — Documentos de projeto (etapa 3.4, Fase 3)
- 2026-11-16: envio, download e remoção de documentos por projeto, no R2 `DOCUMENTOS` e na tabela `documento`: rotas em `/plataforma/documentos-projeto/` (`enviar/`, `arquivo/<id>/`, `remover/<id>/`, página `projeto/<código>/`), serviço em `src/lib/documentos/` (regras, repositório, serviço). PDF, PNG/JPG/WEBP e Office, até 25 MB; tipo conferido pelo conteúdo; chave do R2 gerada pelo sistema; download sempre como anexo; remoção só lógica.
- 2026-11-16: migração D1 `0002_documento_removido_por.sql`: coluna `removido_por` e índice único do mesmo conteúdo ativo por projeto. Aplicada em produção em 2026-11-17, junto com a publicação da 3.4.
- 2026-11-16: revisão independente (Opus) reprovou a primeira versão; corrigidos: arquivo lido em fluxo (sem segunda cópia na memória), perfil, origem e tamanho conferidos antes do corpo, limite de 30 envios por hora, corrida entre envios iguais, remoção decidida pelas linhas alteradas, teste de origem rígido. 23 testes novos de lógica e 3 de interface.
- 2026-11-16: Fluxo: etapa "Cadastro do projeto" ganhou a tela Documentos e a regra de documentos.
- 2026-11-16: primeira gravação das planilhas em produção pela rotina do repositório de dados: 334 projetos atualizados, 0 novos, 0 pulados.

## GovNexa — Importação das planilhas (etapa 3.5, Fase 3)
- 2026-11-16: rotina `scripts/importar-planilhas.ts` (`npm run importar:planilhas`): lê a pasta de planilhas (carteira e cronogramas), confere, gera o SQL e, só com `--destino local|remoto`, grava no D1 e registra a carga (linha em `importacao` no banco central e um evento único de carga no histórico). Padrão: só conferir. Reproduz a carga de produção com as planilhas reais: 334 projetos, 13 cronogramas, 725 etapas.
- 2026-11-16: códigos repetidos na planilha da carteira (hoje o 450, SECAP e SEINFRA) são detectados e a rotina para com a lista (código, linhas e órgãos); a correção combinada fica em `codigos-corrigidos.json` (`importar-carteira.ts`: `resolverCodigosRepetidos`, `lerCorrecoes`, `--corrigir-codigos`). Relatório ganha a seção "Códigos repetidos".
- 2026-11-16: regras que protegem o banco: nunca apaga projeto que saiu da planilha; não sobrescreve `localizacao` e `compromisso`; pula projeto já alterado no sistema; para tudo se um código mudar de órgão; recusa planilha incompleta ou com muitos projetos novos; etapas que saíram do cronograma são removidas (`gerar-sql-carga.ts`: `preservar`, `DELETE` de etapas, `--sem-historico`).
- 2026-11-16: workflow `Importar planilhas` no repositório privado `GovNexa/govnexa-dados`: conferir ao subir planilha; gravar só à mão, em job separado com ambiente `producao`, instalação sem scripts de pacotes e sem guardar credenciais. Relatório só com contagens, códigos, linhas e órgãos.
- 2026-11-16: revisão independente (Opus) achou riscos de integridade, identidade de código e cadeia de fornecimento; corrigidos. 15 testes novos em `tests/importacao/planilhas.test.ts`, incluindo gravação em banco de teste.

## GovNexa — Otimização publicada (Fase 3)
- 2026-11-16, 19h35: a otimização da leitura do banco (PR #6) foi publicada no Cloudflare por ordem do dono (versão 2e1114fa; a anterior, b7e101fa, fica para rollback). Conferido sem login: `/` e `www` 200, `/plataforma/` 302 para o Access, `/api/` 404, cabeçalhos de segurança presentes. O repositório privado de dados (`GovNexa/govnexa-dados`) foi conferido: privado, com permissão de escrita; só tem a documentação, faltam as planilhas em `planilhas/` (etapa 3.5).

## GovNexa — Leitura do banco otimizada (desempenho, Fase 3)
- 2026-11-16: a plataforma montava TODAS as guias (ficha dos 334 projetos, cronogramas, Captação…) a cada acesso e lia o banco inteiro de novo: ~400 ms de processamento por página (534 ms de CPU P90 em produção) e o erro 1102 "Worker exceeded resource limits" no plano gratuito. Agora (1) só a guia aberta é montada (`modulosComDadosReais`, `comCarteira` e `comCronogramas` ganham o parâmetro `somente`) e (2) a leitura do banco (carteira, cronogramas e histórico) fica em cache de 30 s por prefeitura (`src/lib/repositorio/cache.ts`), limpo na hora em qualquer gravação; só o resultado pronto é guardado (esperar a leitura de outro acesso pode travar no Workers) e leitura que termina depois de uma gravação não é guardada. As telas que ainda consultavam o banco direto (lista vazia de projetos, histórico) passam a usar a leitura em cache. Medido no Worker local com 348 projetos: Início 408 → 22 ms, Gestão 418 → 27 ms, Captação 378 → 25 ms, Fluxo 380 → 17 ms, Cronogramas 199 → 18 ms, Carteira 434 → 190 ms (a ficha de todos os projetos é montada nessa guia).
- 2026-11-16: `scripts/db-local.mjs` passa a rodar no Windows (`shell: true`); sem isso o banco local e os testes de interface não subiam. `src/middleware.ts` e `src/lib/repositorio/cache.ts` entram no mapa de impacto como transversais.

## GovNexa — Plano e histórico no repositório novo
- 2026-11-16: docs/govnexa/plano.md e docs/govnexa/historico.md trazidos do repositório antigo (congelado) e atualizados para a migração: nota de mudanças no plano (Workers, Access, D1, R2, dados reais fora do repositório), Fase 3 em 60%, linha do tempo e % com a migração, regras novas do dono, o que vem a seguir pós-migração (texto anterior preservado na seção 5.5) e os PRs do repositório novo. Referências que mandavam ao repositório antigo retiradas; documentos com Vercel ganham nota da migração.

## GovNexa — Repositório novo (GovNexa/GovNexa)
- 2026-11-16: `data/carga-real/` (carteira, cronogramas e histórico reais da prefeitura) retirada de todo o histórico do Git antes de tornar o repositório público; os dados reais entram pelo banco (D1). Sem a pasta, o sistema usa `data/exemplo`. Pasta no `.gitignore`.
## GovNexa — Licitação em detalhe (simulação, Fase 4)
- 2026-11-16: guia Licitações › Licitação em detalhe: a pessoa salva a página pública do processo no SEI (Ctrl+S) e carrega o arquivo (.html em ISO-8859-1 ou UTF-8, ou .mhtml); o arquivo é lido só no navegador. Mostra as fases interna e externa da Lei 14.133 com as datas reais dos documentos (fase sem documento não é inventada), dias entre etapas, fase atual, onde o processo está e há quantos dias, duração da fase interna, externa e total, o prazo mínimo de publicidade (art. 55, por tipo de objeto) e o projeto da carteira com o mesmo número SEI. Até 10 licitações por aba (sessionStorage, validadas ao ler). Fluxo: etapas Parecer jurídico, Publicação, Julgamento e Homologação ligadas à tela nova.

## GovNexa — Fluxo do sistema: zoom e leitura
- 2026-11-16: zoom no Fluxo (diminuir, aumentar, Ajustar à tela, Tamanho padrão; Ctrl + roda do mouse sobre o diagrama), lembrado no navegador; padrão 100% (o diagrama geral com 1000 px, menor que antes em telas largas) e, no celular, ajustado à tela; com zoom maior a rolagem é dentro do quadro, sem rolagem lateral da página. Legenda e lista de fluxos detalhados começam recolhidas (abrem com um clique; no PDF saem abertas).

## GovNexa — Processos no SEI (simulação, Fase 2)
- 2026-11-16: leitor da página pública do processo no SEI (src/lib/sei/): cabeçalho, documentos (público ou restrito) e andamentos; "Interessados" nunca entra; e-mail e CPF mascarados nos andamentos; página sem as tabelas (captcha ou link vencido) é recusada. Testado nos dois processos reais (258/443 e 324/50 registros).
- 2026-11-16: análise: documentos-chave da Lei 14.133 (DFD, ETP, TR, parecer jurídico, edital, homologação, contrato, ordem de serviço, medição, recebimento; "Contrato Social" não conta), etapa sugerida (só propõe avançar, com aprovação), onde o processo está e há quantos dias, alerta de paralisação sem reinício.
- 2026-11-16: guia Projetos › Processos no SEI: exemplo fictício e links públicos por projeto (validados: só https, só o SEI da prefeitura, só a página do processo; guardados em sessionStorage). Comando npm run sei:ler para a equipe técnica ler um link uma vez, sem gravar nada. Fluxo: etapa SEI passa a simulação.

## GovNexa — Dependências entre etapas do cronograma (Fase 2)
- 2026-11-16: página de cada cronograma: aba Dependências (de qual etapa cada uma depende, selo "Aguardando"/"Travada" quando a anterior não terminou, fim projetado) e resumo "Atraso em cascata" com a etapa que mais segura o projeto; Onde está parado mostra quantas etapas seguintes cada unidade segura. Regra (a planilha não tem predecessora): ordem do cronograma, etapas paralelas da mesma fase não dependem entre si; nunca antecipa. Funções em src/lib/cronograma/dependencias.ts.

## GovNexa — Central de alertas (Gestão, Fase 4)
- 2026-11-16: guia Gestão › Alertas: lista única de alertas (vermelho primeiro, depois pelo prazo) com resumo por tipo, filtros por tipo, gravidade e órgão sem recarregar, ação recomendada e link para a tela de origem. Tipos com dado: cláusula suspensiva (indício: convênio sem desembolso há mais de 180 dias), vigência de convênio, fim da contratação previsto, início e fim de obra, saldo sem fonte, etapa parada e dado defasado; prazos em dias corridos e úteis (feriados nacionais e municipais). Regra meta × teto da Lei 14.133 pronta (passar do teto = vermelho). Edital na praça, homologação real e prazos por licitação aparecem em "Ainda sem fonte de dados". Nenhum nome de pessoa.

## GovNexa — WhatsApp da Gestão (simulação, Fase 5)
- 2026-11-16: WhatsApp (simulação): modelos de mensagem para aprovação da Meta (3 modelos com validação das regras e botão Copiar texto); Projetos › Localização e fotos: lista das obras que ainda não aparecem no mapa (bairro não encontrado ou sem bairro), com link para cadastrar a localização.
- 2026-11-15: guia Gestão › WhatsApp: números autorizados (cargo ou equipe, nunca nome de pessoa; número mascarado na lista), permissão por número (órgãos, só prioritários, valores, captação, projetos liberados à parte), relatório automático (semanal ou diário, modelo "Projetos prioritários" ou "Resumo curto") e prévia da conversa com perguntas por nome, código, SEI, atrasados, entregas, execução e convênios.
- 2026-11-15: regra de segurança: a resposta é montada só com os projetos que a permissão libera (src/lib/whatsapp/permissoes.ts); projeto de fora recebe a mesma resposta de "não encontrado"; o responsável e as observações nunca entram na base do WhatsApp. Tudo em simulação (sessionStorage); envio real depende do banco e da conta oficial do WhatsApp Business.
- 2026-11-15: build com nomes de arquivo só hexadecimais (a Vercel não servia `simulacao.mqF-P3E_.js` e o mapa ficava em branco).

## GovNexa — Carga real, responsividade e tema
- 2026-11-15: carga real da planilha de obras prioritárias e dos cronogramas do GEPP publicada TEMPORARIAMENTE em data/carga-real/ (decisão do dono; será retirada quando houver banco); aviso fixo na plataforma.
- 2026-11-15: testes de interface montam o site com os dados fictícios (scripts/build-exemplo.mjs, GOVNEXA_EXEMPLO=1).
- 2026-11-15: celular: tabelas viram cartões empilhados com o rótulo de cada campo (sem rolagem horizontal).
- 2026-11-15: corrigido: ao trocar de guia, o tema claro/escuro voltava ao do sistema; o tema escolhido agora se mantém (teste automático).

## GovNexa — Fluxo do sistema
- 2026-11-15: guia Projetos › Fluxo do sistema: diagrama no estilo BPMN (6 raias, 28 etapas, início ao fim), clique em cada etapa mostra o que é feito, o que é validado, quem, a situação no sistema e os botões para abrir as telas; lista das etapas por raia para leitura e impressão. Conteúdo em src/lib/govnexa/fluxo.ts.

## GovNexa — Log do ciclo de vida do projeto
- 2026-11-15: tela "Histórico de alterações" (Projetos): o que foi feito, por quem, data e hora, origem, antes/depois e motivo; filtros por período, projeto, pessoa, ação, origem e texto; exportação CSV protegida contra fórmulas; seção "Histórico" na ficha do projeto.
- 2026-11-15: o importador da carteira registra cada carga e as diferenças em relação à anterior (incluídos, retirados, campos e etapas alterados) em historico.json (`--autor`).
- 2026-11-15: banco preparado: `db/migracoes/002_govnexa_log.sql` (evento_sistema e visão log_alteracoes, RLS, sem UPDATE/DELETE); validado em postgres:16.

## GovNexa — Fase 2 (cronograma e equipe) e etapa 1.5 (movimentação)
- 2026-11-15: importador dos cronogramas do GEPP (`npm run importar:cronogramas`): fases, etapas, status calculado, ciclos de retrabalho, pendências de dado, casamento com a carteira, anonimização.
- 2026-11-15: telas Cronogramas, página de cada cronograma (linha do tempo, quadro de tarefas, pendências), Onde está parado (por unidade e responsável).
- 2026-11-15: motor de movimentação do projeto (avançar com portões, voltar com motivo, forçar com motivo, aprovar/reprovar pendência, novo passo, edição de campos com histórico); Kanban com arrastar e botão Mover e página Pendências de etapa em MODO SIMULAÇÃO (nada é gravado sem banco).
- 2026-11-15: preparo do banco (sem ligar): repositório único JSON/PostgreSQL, `db/migracoes/001_govnexa_carteira.sql` com RLS por prefeitura, `scripts/gerar-sql-carga.ts`; validado em postgres:16.

## GovNexa — Fase 1: Carteira de Projetos
- 2026-11-15: carteira importada da planilha (aba PIPELINE + BASE_OPERACIONAL), telas Carteira, Kanban por macroetapa, Gantt geral e Visão por órgão (PR #20).
- 2026-11-15: regra de interface: tabelas da plataforma cabem na largura, sem rolagem horizontal (quebra de linha, colunas secundárias na ficha); teste automático em 1280px.
- 2026-11-15: "Projetos · Início" passa a mostrar o resumo real da carteira por macroetapa (quantidade, valor, verde/amarelo/vermelho); o roteiro de desenvolvimento sai da aplicação. Botão "Novo registro" (protótipo) oculto em Projetos e Gestão até o cadastro real (etapa 1.5).

## GovNexa — Fase 0: base e identidade (em andamento)
- 2026-11-15: a plataforma passa a se chamar **GovNexa — Inteligência para a gestão pública** (marca centralizada em `src/lib/marca.ts`; site público e login seguem com a marca anterior até decisão, chave `USAR_NO_SITE_PUBLICO`).
- 2026-11-15: menu lateral agrupado por módulo (Projetos, Captação, Licitações, Gestão, Conta) via `src/lib/govnexa/catalogo.ts`, sem alterar `src/data/modules.json`; removido o texto "Área do comprador".
- 2026-11-15: páginas iniciais dos módulos **Projetos** (roteiro das fases) e **Gestão** (módulos ativos).
- 2026-11-15: município ativo lido de `data/config/municipio.json` (`src/lib/municipio-ativo.ts`): nome de exibição e logo deixam de ser fixos no código.
- 2026-11-15: documentos `docs/govnexa/visao-geral.md` e `docs/govnexa/modelo-dados.md` (modelo para PostgreSQL com isolamento por prefeitura e formato JSON do MVP).
- 2026-11-15: testes `tests/govnexa/catalogo.test.ts` e teste de interface "govnexa: marca e módulos na plataforma".
- Observado (anterior a esta fase): o rodapé da plataforma fica atrás da barra lateral em páginas curtas; tabelas com texto longo cortam a última coluna.

# Changelog — bloco Captação

## Fase 0 — Fundação e descoberta (em andamento)
- 2026-11-09: criado o bloco **Captação** (guia **Principal**) no menu da plataforma, com dados de exemplo.
- 2026-11-09: `docs/plano-execucao.md` aprovado pelo dono (coletores em Node/TypeScript, GitHub Actions como agendador, PostgreSQL como banco futuro).
- 2026-11-09: T1 estrutura de pastas e configuração do município piloto (Goiânia, IBGE 5208707).
- 2026-11-09: T4 coletor `coletores/ibge-municipios.ts` e tabela `data/core/ibge-municipios.json` (5.571 municípios, 27 capitais, população 2026).
- 2026-11-09: T2 concluída: 15 fichas em `docs/fontes/` (OK: Transferegov arquivos, CAUC, SICONFI, IBGE, Receita CNPJ; PARCIAL: Transferegov API, DATASUS, FNS, FNDE/INEP, SINISA, DOU, Novo PAC/editais, Congresso; EXIGE CHAVE: Portal da Transparência; INACESSÍVEL: MDS/FNAS). INLABS em manutenção; alternativa: base de dados abertos do DOU (in.gov.br).
- 2026-11-09: T3 (parcial): segredo `PORTAL_TRANSPARENCIA_CHAVE` cadastrado no GitHub (Actions) pelo dono. INLABS segue em manutenção; cadastro adiado.
- 2026-11-09: FNS validado (rotas `consulta-consolidada/repasse-bloco` e `entidades`); coletor da Receita (`coletores/receita-cnpj-fundos.ts`) testado e carga completa iniciada (T5).
- 2026-11-09: T6 `data/config/temas.json` (14 temas, 16 funções orçamentárias, códigos conferidos na Portaria 42/1999 consolidada) e `secretarias.json` (15 secretarias genéricas), ambos rascunho pendente de validação.
- 2026-11-09: T7 guias do bloco Captação: Principal, Oportunidades, Acompanhamento, Alertas e Projetos (dados de exemplo); revisadas visualmente pelo dono.
- 2026-11-09: camada de dados `src/lib/dados/index.ts` (JSON hoje, PostgreSQL depois) e `docs/esquema-postgres.sql` (21 tabelas; aplicado com sucesso em PostgreSQL 16 descartável).
- 2026-11-09: workflow `testar-portal-transparencia.yml` para validar a chave do Portal sem expô-la.
- 2026-11-09: PR #1 mesclado na main; site publicado confirmado pelo dono. Chave do Portal da Transparência testada (HTTP 200) e estrutura real de convênios registrada na ficha.
- 2026-11-09: Fase 1: coletores CAUC, SICONFI e Transferegov (arquivos) implementados e testados para Goiânia; ver docs/fontes. O arquivo data/core/transferegov-5208707.json (5,6 MB) NÃO foi commitado: decidir com o dono onde guardar dados volumosos (Git x banco).
- 2026-11-09: PRs #1 e #2 mesclados na main. Fase 1: coletores CAUC, SICONFI, Transferegov, FNS, Portal da Transparência (Actions) e programas abertos (59 elegíveis a Goiânia). T5: 89 CNPJs candidatos; planilha em docs/validacao-cnpjs-prefeitura.md. Conferência manual do aceite: 5 de 10 convênios batem com o site oficial.
- 2026-11-10: Telas do bloco Captação ligadas aos dados reais pela camada de dados (`src/lib/dados/captacao.ts`): Principal (indicadores com fonte e data), Oportunidades (59 programas abertos), Acompanhamento (19 convênios municipais em execução, saldo a liberar) e Alertas (49, gerados pelas regras de docs/regras-alertas.md). Resumo enxuto `data/core/acompanhamento-5208707.json` (105 KB) gerado por `coletores/derivar-acompanhamento.ts`; o arquivo completo do Transferegov segue fora do Git. A guia Projetos continua com dados de exemplo. Limites das regras (vigência, dias sem desembolso, prazo de programa) são provisórios.
- 2026-11-10: Oportunidades: 'Ver detalhes' passou a explicar cada programa (do que se trata, em linguagem simples, prazos, tipo de transferência, quem pode propor, temas e secretarias, quem já propôs, CAUC, roteiro e documentos). Coletor de programas agora liga programa × proposta (23.596 propostas) e a camada de dados ganhou formato.ts e detalhes.ts.
- 2026-11-10: Oportunidades: detalhe com principal objetivo, critérios, observações, trechos de valor mínimo/contrapartida do texto oficial, valores observados e links (edital/documentos citados e portal Transferegov Discricionárias). Temas dos programas sem classificação: 15 -> 1. Educação (INEP): data/core/educacao-5208707.json (830 escolas, 278.377 matrículas, IDEB 2023).
- 2026-11-10: Testes de contrato dos dados (npm run test:dados, 7 testes: proveniência, sem dados bancários/CPF, IBGE, CAUC, acompanhamento, programas, SICONFI/FNS). DOU: CPFs de terceiros mascarados (LGPD).
- 2026-11-10: Detalhes completos na guia Principal (lista dos 19 convênios, de onde vêm os saldos por concedente e convênio, CAUC item a item, SICONFI, FNS, programas, DOU, alertas) e detalhe de cada alerta (por que, regra, números, o que fazer). Tabelas com dados reais deixam de exibir o rótulo 'dados de exemplo'. Decisão do dono: perfis por secretaria na etapa do banco (um único usuário por enquanto).
- 2026-11-10: Guia Principal ganha o indicador de Educação (INEP): escolas, matrículas por rede e etapa, comparação 2023/2024 e série do IDEB.
- 2026-11-10: Documentação: manual do usuário do bloco Captação (docs/manual-usuario.md) e especificação da guia Projetos com IA e revisão humana (docs/projetos-ia.md: fluxo, dados, RAG, 21 regras de parecer determinísticas, segurança e entrega em 8 etapas).
- 2026-11-10: Nova guia Comparativo (repasses de saúde do FNS às 27 capitais por habitante; grupos que outras capitais recebem e Goiânia não; detalhe por capital) e agenda iCalendar dos prazos (/plataforma/agenda.ics, 114 eventos com lembretes de 30 e 7 dias, protegida pelo login).
- 2026-11-10: Motor de parecer determinístico da guia Projetos (src/lib/projetos): 21 regras R01-R21 (CAUC, prazo, elegibilidade, metas e indicadores, cronograma, valores, contrapartida, despesa de pessoal, frescor das fontes, citações, hash de aprovação), 27 testes (node --test tests/projetos/parecer.test.ts). Sem IA e sem gravar projetos.
- 2026-11-10: Guia Projetos mostra o parecer automático em 2 exemplos fictícios (100% pronto; 19% com 10 bloqueantes), com cada regra no detalhe. Sem IA e sem gravar projetos reais.
- 2026-11-10: Qualidade dos dados: nova guia (frescor, falhas e motivo por fonte), alertas de fonte defasada com motivo e ação, executor de coletores com registro de falhas (coletores/rodar.ts + status-coletas.json) usado pela atualização diária. SINISA (saneamento) coletado: água, esgoto, resíduos e drenagem de Goiânia (2024).
- 2026-11-10: CNES (5.207 estabelecimentos, 7.638 leitos; lista nominal sem consultórios isolados nem pessoa física) e SINISA ligados à guia Principal com detalhe completo e ressalvas; testes de contrato (LGPD no CNES; ressalvas do SINISA).
- 2026-11-10: Busca por necessidade nas Oportunidades: a busca da tabela passa a aceitar várias palavras (todas devem aparecer) e olha também os temas, sinônimos e o texto oficial do programa (ex.: drenagem, creche, quadra, ônibus). 28 testes de interface continuam passando.
- 2026-11-10: Testes de interface (Playwright, Chromium) executados pela primeira vez: 28 de 28 passaram, incluindo todas as guias do bloco Captação em 1280 e 375 px. playwright.config.ts passa a carregar só *.spec.ts (os testes de dados usam node:test).
- 2026-11-10: Atualização mensal automática (INEP, SINISA e CNES) no GitHub Actions (dia 5 de cada mês, branch dados-mensais-atualizados); status das coletas mensais em data/core/status-coletas-mensais.json, lido pela guia Qualidade dos dados.
- 2026-11-10: Manual do usuário atualizado (Comparativo, Qualidade dos dados, Principal com educação, saúde e saneamento, agenda iCalendar, Projetos com parecer, rotinas diária e mensal).
- 2026-11-10: Revisão de segurança (9 vetores, docs/seguranca.md): limitador de tentativas de login (lib/rate-limit.ts), escape do JSON-LD (XSS), cabeçalhos de segurança e CSP no vercel.json, testes (npm run test:dados: 13 testes).

## Correção de login 5
- Bloqueio limitado a uma hora, sem acúmulo durante bloqueio; desbloqueio administrativo isolado por prefeitura e auditado.
- Mensagens fixas de falhas administrativas e envio de e-mail aguardado, preservando alterações quando o envio falha.
- Configuração publicada rejeita AMBIENTE, EMAIL_SIMULADO e ACESSO_LOCAL_LIVRE.
