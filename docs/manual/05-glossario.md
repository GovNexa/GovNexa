# 6. Glossário

**Para que serve este capítulo.** Explica, em uma ou duas frases, os termos de negócio e do sistema usados no GovNexa e neste manual. Cada termo diz onde ele aparece na plataforma e o arquivo do código de onde vem a definição. A lista está em ordem alfabética.

## A

**Administrador.** Perfil com todas as permissões: cadastra pessoas, cadastra secretarias compradoras do PNCP e dispensa a 2ª etapa de outra pessoa. *Onde aparece:* Conta › Usuários. `src/lib/usuarios/index.ts`

**Agenda de prazos.** Arquivo de calendário (formato .ics) com vigências de convênios, prestações de contas e prazos de programas, para importar no Google Agenda ou no Outlook. *Onde aparece:* endereço `/plataforma/agenda.ics`, citado na guia Alertas da Captação. `src/lib/dados/agenda.ts`

**Alerta.** Aviso calculado pelo sistema sobre um prazo vencido ou perto de vencer, ou um risco. Tem gravidade vermelha (grave) ou amarela (atenção) e some sozinho quando o dado muda. *Onde aparece:* Governança da execução › Alertas; Convênios › Alertas. `src/lib/alertas/central.ts`, `src/lib/dados/alertas.ts`

**Aplicativo autenticador.** Aplicativo de celular que mostra um código de 6 dígitos que muda a cada 30 segundos; é usado na 2ª etapa do login. *Onde aparece:* telas de entrada, no primeiro acesso (QR Code). `src/lib/login/totp.ts`

**Área.** Tema do projeto para a população (Saúde, Educação, Drenagem, Mobilidade urbana etc.). Vem de uma lista da prefeitura; sem área escolhida, o sistema sugere uma pela sigla do órgão. *Onde aparece:* ficha do projeto, filtros, cores do mapa e da tela inicial. `src/lib/carteira/area.ts`, `db/d1/prefeitura/0007_area_prioritario_catalogo.sql`

**Armazém de arquivos (R2).** Lugar na Cloudflare onde ficam guardados os documentos e as fotos dos projetos. O banco guarda só a referência de cada arquivo. *Onde aparece:* abas Fotos e Documentos da ficha. `wrangler.jsonc` (`govnexa-documentos`)

**Atraso em cascata.** Quanto o atraso de uma etapa do cronograma empurra as etapas seguintes. O sistema deduz quem depende de quem pela ordem e pelas datas. *Onde aparece:* página do cronograma, aba Dependências. `src/lib/cronograma/dependencias.ts`

## B

**Banco central.** Banco que guarda quem pode entrar, o perfil de cada pessoa, as sessões e a prefeitura de cada uma. *Onde aparece:* não tem tela própria; é usado no login e na tela Usuários. `db/d1/central/`

**Banco da prefeitura (D1).** Banco de dados de uma prefeitura, com projetos, cronogramas, contratações e históricos. Cada prefeitura tem o seu, e ninguém acessa o de outra. "D1" é o nome do serviço de banco da Cloudflare. *Onde aparece:* em todas as telas que gravam. `wrangler.jsonc`, `db/d1/prefeitura/`

## C

**Captação.** Busca de recursos externos (convênios, emendas, programas federais) para os projetos. *Onde aparece:* área Convênios do menu. `src/lib/dados/captacao.ts`

**Carga inicial.** Comando da equipe técnica que trouxe a carteira e os cronogramas das planilhas antigas para o banco. Não é uma tela. *Onde aparece:* Histórico, origem "Importação da planilha". `scripts/importar-planilhas.ts`

**Carteira de projetos.** Conjunto de todos os projetos da prefeitura, em qualquer etapa. *Onde aparece:* Visão gerencial › Carteira de projetos. `src/components/carteira/CarteiraProjetos.astro`

**CAUC.** Cadastro Único de Convênios, do Tesouro Nacional. Mostra se o município está regular para receber transferências voluntárias da União; pendência no CAUC bloqueia repasses. *Onde aparece:* Convênios › Visão Convênios, bloco "CAUC"; guia Alertas. `coletores/cauc.ts`, `src/lib/convenios/visao.ts`

**Classificação de obra.** Estimativa do sistema (sim, provável ou não identificada) de que uma compra do PNCP é obra ou serviço de engenharia. Quando não identificada, a pessoa precisa confirmar a ligação. *Onde aparece:* quadro "Dados do PNCP" da contratação. `src/lib/pncp/regras.ts` (`classificarObra`)

**Cláusula suspensiva.** Condição de um convênio que precisa ser cumprida (por exemplo, apresentar projeto ou licença) antes de o dinheiro ser liberado. O sistema dá um indício quando o convênio está assinado há mais de 180 dias sem desembolso. *Onde aparece:* Alertas e Visão Convênios. `src/lib/alertas/central.ts` (`alertasConvenios`)

**CNES.** Cadastro Nacional de Estabelecimentos de Saúde, do Ministério da Saúde. Coletado uma vez por mês. *Onde aparece:* Convênios › Principal e Qualidade dos dados. `coletores/cnes.ts`

**Código de recuperação.** Um dos 10 códigos (formato XXXX-XXXX) mostrados uma única vez no primeiro acesso. Substitui o código do aplicativo se a pessoa perder o celular; cada um vale uma vez. *Onde aparece:* tela de entrada, 2ª etapa. `src/lib/login/servico.ts`

**Código do projeto.** Identificação do projeto, como P-901. Projetos criados na tela recebem código a partir de P-9000; os da planilha usam números menores. *Onde aparece:* Carteira, ficha e filtros. `src/lib/carteira/movimentacao.ts` (`FAIXA_CADASTRO`)

**Compromisso.** Quanto a prefeitura está comprometida com o projeto: **decidido** (executa com ou sem recurso externo), **condicionado** (só executa se vier recurso externo) ou **ideia** (ainda não avaliado). *Onde aparece:* Novo projeto e ficha. `src/lib/carteira/formulario.ts`

**Contratação.** Processo de compra ou contratação da prefeitura (licitação, dispensa, adesão a ata etc.) acompanhado em seis etapas: Projeto em finalização, Em preparação, Edital em ajustes, Publicada, Em julgamento e Concluída. *Onde aparece:* Visão gerencial › Gestão das licitações; aba Contratações da ficha. `src/lib/contratacoes/regras.ts`

**Convênio.** Acordo pelo qual outro órgão (geralmente federal) repassa recurso à prefeitura para um objetivo definido, com vigência e prestação de contas. *Onde aparece:* Convênios › Visão Convênios e Acompanhamento. `coletores/derivar-acompanhamento.ts`

**Cronograma.** Plano de um projeto dividido em fases e tarefas, com datas previstas e reais e responsáveis. Cada projeto tem no máximo um. *Onde aparece:* Governança da execução › Cronogramas; aba Cronograma da ficha. `src/pages/plataforma/cronograma/[id].astro`

**CSV.** Arquivo de planilha simples que abre no Excel. O GovNexa gera CSV com separador ponto e vírgula e proteção contra fórmulas. *Onde aparece:* Histórico, Responsáveis, Inconsistências e Gestão das licitações. `src/lib/log/visoes.ts`

## D

**Demonstrativo.** Tela ou recurso em simulação: usa dados de exemplo ou guarda só no navegador, e nada vai para o banco. No manual, marcado como **[DEMONSTRATIVO]**. *Onde aparece:* Reunião semanal, Sala de guerra, WhatsApp, Processos no SEI, Licitação em detalhe e telas de protótipo. `src/layouts/Platform.astro` (faixa de aviso)

**DFD, ETP e TR.** Documentos da fase preparatória da Lei 14.133: Documento de Formalização da Demanda, Estudo Técnico Preliminar e Termo de Referência. São os três tipos de documento fixos do sistema. *Onde aparece:* Documentos do projeto, campo "tipo". `db/d1/prefeitura/0003_tipo_documento.sql`

**Dias úteis.** Dias de trabalho, sem fins de semana e feriados nacionais e municipais. Usados nos prazos da Lei 14.133 e nos alertas. *Onde aparece:* Prazos da Lei 14.133 e Alertas. `src/lib/prazos/calendario.ts`, `data/config/feriados.json`

**Dispensa (da 2ª etapa).** Permissão temporária, de 1 a 60 dias e com motivo, para uma pessoa entrar só com e-mail e senha, por exemplo quando perdeu o celular. Só outro administrador concede. *Onde aparece:* Conta › Usuários, "Dispensar a 2ª etapa por um prazo". `db/d1/central/0003_excecao_2fa.sql`

**Dispensa (de licitação).** Forma de contratação sem licitação prevista na Lei 14.133. No cadastro do projeto, é uma das opções de "tipo de contratação". *Onde aparece:* Novo projeto e ficha. `src/lib/carteira/cadastro.ts`

**DOU.** Diário Oficial da União. O sistema procura citações ao município em arquivos baixados à mão. *Onde aparece:* Convênios › Alertas e Qualidade dos dados. `coletores/dou.ts`

## E

**Editado na tela.** Marca de um cronograma que já foi alterado pela plataforma. A partir dela, a planilha não altera nem apaga mais esse cronograma. *Onde aparece:* não é visível; vale na carga. `db/d1/prefeitura/0009_cronograma_na_tela.sql`

**Editor.** Perfil que vê, edita projetos, cronogramas e contratações e envia documentos, mas não aprova mudança de etapa. *Onde aparece:* Conta › Usuários. `src/lib/usuarios/index.ts`

**Etapa.** Palavra usada em três sentidos no sistema: a **macroetapa** do projeto (00 a 06), a **etapa da contratação** (seis etapas da licitação) e a **etapa do cronograma** (uma tarefa). O contexto da tela diz qual é. `src/lib/carteira/macroetapas.ts`, `src/lib/contratacoes/regras.ts`, `src/lib/cronograma/tipos.ts`

**Exceção.** Registro de quando uma regra foi contornada com motivo, como mover um projeto sem cumprir o portão. Sempre fica no Histórico, com quem aceitou e quando. *Onde aparece:* Histórico, filtro "Somente exceções". `src/lib/log/visoes.ts`

## F

**Farol.** Cor de situação do projeto: vermelho (prazo da macroetapa ou entrega vencidos), amarelo (dados incompletos ou prazo em até 15 dias) e verde (no prazo). **[VERIFICAR]**: será retirado (decisão do dono, E19). *Onde aparece:* Projetos · Início, Mapa e painel, Painel da equipe, Reunião semanal e Sala de guerra. `src/lib/carteira/visoes.ts` (`farol`)

**Ficha do projeto.** Página única de cada projeto, com as abas Cadastro, Recurso, Entrega, Localização, Fotos, Documentos, Processos SEI, Contratações, Cronograma, Histórico e Governança. *Onde aparece:* ao clicar no nome de um projeto em qualquer lista. `src/pages/plataforma/projeto/[id].astro`

**Fluxo do sistema.** Diagrama que mostra o caminho de um projeto, do pedido à entrega, e a situação de cada etapa (disponível, simulação ou planejado). Pode ser exportado em PDF. *Onde aparece:* Conta › Fluxo do sistema. `src/lib/govnexa/fluxo.ts`

**FNS.** Fundo Nacional de Saúde. O sistema coleta os repasses de saúde ao município e às capitais. *Onde aparece:* Convênios › Principal e Comparativo. `coletores/fns.ts`

**Forçar com motivo.** Opção para mover um projeto de macroetapa mesmo sem cumprir o portão, ou pulando etapas. A mudança fica marcada como "forçado" no Histórico. *Onde aparece:* Kanban, diálogo de mover. `src/lib/carteira/mover.ts`

## G

**Gantt.** Gráfico de barras ao longo do tempo, com uma barra por macroetapa de cada projeto. *Onde aparece:* Visão gerencial › Gantt geral. `src/components/carteira/Gantt.astro`

**Gestor.** Perfil que vê, edita projetos, envia documentos e aprova mudança de etapa. *Onde aparece:* Conta › Usuários. `src/lib/usuarios/index.ts`

## H

**Histórico.** Registro permanente de tudo o que mudou: quem, quando, de onde veio, o antes e o depois e o motivo. Não pode ser alterado nem apagado. *Onde aparece:* Governança da execução › Histórico de alterações; aba Histórico da ficha e da contratação. `db/d1/prefeitura/0001_carteira.sql`, `src/components/log/LogAlteracoes.astro`

## I

**IBGE.** Instituto Brasileiro de Geografia e Estatística. O código IBGE do município identifica a prefeitura no sistema e no nome do banco dela. *Onde aparece:* não aparece na tela; é usado no cadastro da prefeitura. `db/d1/central/0001_central.sql`

**Inconsistência.** Dado faltando ou errado num projeto (sem órgão, sem valor, datas fora de ordem, SEI inválido etc.). O sistema confere dez regras. *Onde aparece:* Governança da execução › Inconsistências de dados. `src/lib/gestao/inconsistencias.ts`

**INEP.** Instituto do Ministério da Educação que publica o Censo Escolar e o IDEB. Coletado uma vez por mês. *Onde aparece:* Convênios › Principal e Qualidade dos dados. `coletores/inep-educacao.ts`

## K

**Kanban.** Quadro com uma coluna por macroetapa, em que cada projeto é um cartão que pode ser movido. *Onde aparece:* Visão gerencial › Kanban por macroetapa. `src/components/carteira/Kanban.astro`

## L

**Leitura.** Perfil que só consulta; é a "conta de consulta". *Onde aparece:* Conta › Usuários. `src/lib/usuarios/index.ts`

**Lei 14.133.** Lei de Licitações e Contratos Administrativos, de 2021. Define as fases da contratação e os prazos legais. *Onde aparece:* Licitações › Prazos da Lei 14.133 e Licitação em detalhe; alertas. `src/lib/prazos/lei14133.ts`

## M

**Macroetapa.** Fase do ciclo do projeto, de 00 a 06: Em estruturação, Planejamento, Preparatório para Contratação, Contratação, Mobilização, Execução e Conclusão. *Onde aparece:* Carteira, Kanban, Gantt, ficha e filtros. `src/lib/carteira/macroetapas.ts`

**Marco.** Fato importante de uma contratação, com data, que pode ser marcado como concluído (por exemplo: Homologada, Contrato assinado, Ordem de serviço emitida, Em execução). *Onde aparece:* página da contratação e "Próximos marcos" da Gestão das licitações. `src/lib/contratacoes/regras.ts` (`MARCOS`)

**Meta interna e teto legal.** O teto é o prazo máximo da lei; a meta é um prazo menor que a prefeitura define para ter folga. Passar do teto gera alerta vermelho; passar só da meta, amarelo. *Onde aparece:* Prazos da Lei 14.133 e Alertas. `data/config/prazos-internos.json`, `src/lib/alertas/central.ts`

## O

**Onde está parado.** Lista das etapas de cronograma com prazo vencido, agrupadas por unidade e por responsável, com os dias acumulados. *Onde aparece:* Governança da execução › Onde está parado. `src/lib/cronograma/visoes.ts` (`ondeEstaParado`)

**Oportunidade.** Programa federal aberto do Transferegov ao qual a prefeitura pode enviar proposta. *Onde aparece:* Convênios › Oportunidades. `src/lib/dados/captacao.ts`

## P

**Pendência de dado.** Informação que falta no projeto ou no cronograma, registrada para ser completada (por exemplo, "Sem valor de obra"). *Onde aparece:* ficha (aba Governança), aba Pendências de dado do cronograma. `src/lib/carteira/movimentacao.ts`

**Pendências de etapa.** Tela que concentra os projetos prontos para mudar de macroetapa, para administrador ou gestor aprovar, reprovar ou aprovar mesmo assim. *Onde aparece:* Governança da execução › Pendências de etapa. `src/components/carteira/PendenciasEtapa.astro`

**Perfil.** Conjunto de permissões de uma pessoa: Administrador, Gestor, Editor ou Leitura. Define o que ela vê no menu e o que pode gravar. *Onde aparece:* Conta › Usuários. `src/lib/usuarios/index.ts`

**PNCP.** Portal Nacional de Contratações Públicas, onde os órgãos publicam suas compras. O GovNexa liga uma contratação à compra no PNCP e traz itens, vencedores e valores, por botão. *Onde aparece:* página da contratação, quadro "Dados do PNCP"; Secretarias compradoras. `src/lib/pncp/servico.ts`

**Portão.** Lista mínima de dados que o projeto precisa ter para avançar à macroetapa seguinte (por exemplo, valor e origem do valor para chegar a 02). Sem isso, só avança forçando com motivo. *Onde aparece:* Kanban e Pendências de etapa. `src/lib/carteira/movimentacao.ts` (`portaoPara`)

**Prazo-piso.** Prazo mínimo da lei que não pode ser encurtado, como o tempo mínimo de publicação do edital. *Onde aparece:* Prazos da Lei 14.133. `src/lib/prazos/lei14133.ts`

**Prioritário.** Marca que a equipe põe em um projeto para destacá-lo. Alimenta o filtro "Só prioritários" e o selo na ficha. *Onde aparece:* ficha, Carteira e Projetos prioritários. `src/lib/carteira/formulario.ts`, `db/d1/prefeitura/0007_area_prioritario_catalogo.sql`

**Projeto.** Obra ou serviço que a prefeitura quer fazer ou está fazendo, cadastrado uma única vez. Todas as telas são visões dele. *Onde aparece:* em toda a plataforma. `db/d1/prefeitura/0001_carteira.sql`

## Q

**Qualidade dos dados.** Conferência de quão recentes estão os dados públicos de cada fonte: Em dia, Atenção (defasada ou falha), Vencido (muito defasada) ou Sem carga. *Onde aparece:* Convênios › Qualidade dos dados. `src/lib/dados/qualidade.ts`

## R

**Remoção lógica.** Forma de "apagar" no GovNexa: o item some das listas, mas continua guardado com quem removeu e quando, para auditoria. *Onde aparece:* fotos, documentos, tarefas e contratações. `db/d1/prefeitura/0008_foto_projeto.sql`, `db/d1/prefeitura/0010_contratacao.sql`

**Responsável.** Pessoa ou área com quem está uma tarefa do cronograma. Cada troca fica registrada e não se apaga. *Onde aparece:* aba Tarefas e responsáveis; Governança da execução › Responsáveis. `db/d1/prefeitura/0009_cronograma_na_tela.sql` (`troca_responsavel`)

**Revisão (versão).** Número que muda a cada gravação de um projeto, cronograma ou contratação. Se duas pessoas editam ao mesmo tempo, a segunda é avisada para recarregar a página. *Onde aparece:* mensagem "alterado por outra pessoa". `src/lib/carteira/edicao.ts`

**Ritmo.** Razão entre o que foi realizado e o que estava previsto até hoje no cronograma: verde a partir de 0,95, amarelo de 0,85 a 0,95 e vermelho abaixo. *Onde aparece:* Cronogramas e página do cronograma. `src/lib/cronograma/visoes.ts`

## S

**Saldo a liberar.** Diferença entre o valor pactuado de um convênio e o que já foi desembolsado. *Onde aparece:* Convênios › Visão Convênios e Acompanhamento. `coletores/derivar-acompanhamento.ts`

**Saldo sem fonte.** Parte do valor do projeto que ainda não tem recurso garantido (captado, contrapartida ou custeio). *Onde aparece:* Alertas, tipo "Saldo sem fonte". `src/lib/carteira/visoes.ts` (`saldoSemFonte`)

**Sala de guerra.** Reunião concentrada, no padrão PMI, para resolver um projeto crítico (crise ou missão), com objetivo, prazo, dono e quadro de riscos, ações, problemas e decisões. Hoje é simulação **[DEMONSTRATIVO]**. *Onde aparece:* Governança da execução › Sala de guerra. `src/lib/sala/visoes.ts`

**Secretaria compradora.** Órgão da prefeitura, identificado pelo CNPJ, que publica compras no PNCP. Só compras dessas secretarias podem ser ligadas. *Onde aparece:* Gestão das licitações › Secretarias compradoras. `src/lib/pncp/servico.ts`

**Segunda etapa.** Ver "Verificação em duas etapas (2ª etapa)".

**SEI.** Sistema Eletrônico de Informações, onde tramitam os processos administrativos da prefeitura. O número tem o formato 00.0.000000000-0. A leitura automática do SEI ainda é simulação. *Onde aparece:* ficha (aba Processos SEI); Governança da execução › Processos no SEI. `src/lib/sei/link.ts`

**SICONFI.** Sistema do Tesouro Nacional com as informações fiscais dos municípios. *Onde aparece:* Convênios › Principal. `coletores/siconfi.ts`

**SINISA.** Sistema Nacional de Informações em Saneamento Básico. Coletado uma vez por mês. *Onde aparece:* Convênios › Principal e Qualidade dos dados. `coletores/sinisa.ts`

## T

**Tarefa.** Item de trabalho do cronograma, com fase, responsável, datas previstas e reais. A situação é calculada pelas datas: A fazer, Início atrasado, Em andamento, Atrasada ou Concluída. *Onde aparece:* página do cronograma. `src/lib/cronograma/visoes.ts` (`statusNaData`)

**Tela vence a planilha.** Regra da carga: o que a equipe mudou na plataforma nunca é sobrescrito por uma nova carga da planilha. *Onde aparece:* não é visível; vale na carga inicial. `scripts/importar-planilhas.ts`

**Tempo na mão.** Quantos dias uma tarefa está com o responsável atual, contados do início real ou da última troca. Passar da duração prevista gera "Atenção"; passar do dobro, "Urgente". *Onde aparece:* Tarefas e responsáveis; Responsáveis. `src/lib/cronograma/responsaveis.ts`

**Transferegov.** Plataforma do governo federal para transferências de recursos (convênios e programas). O sistema coleta seus arquivos abertos todos os dias. *Onde aparece:* Convênios › Visão Convênios, Acompanhamento e Oportunidades. `coletores/transferegov-convenios.ts`

## V

**Verificação em duas etapas (2ª etapa).** Proteção do login: depois da senha, a pessoa digita o código de 6 dígitos do aplicativo autenticador. *Onde aparece:* telas de entrada. `src/pages/entrar/codigo.astro`

**Vigência.** Período em que um convênio vale. Perto do fim, o sistema gera alerta para não perder o recurso. *Onde aparece:* Convênios e Alertas. `src/lib/alertas/central.ts`

**Visão.** Cada uma das três grandes áreas do menu: Visão gerencial, Governança da execução e Convênios. *Onde aparece:* menu lateral. `src/lib/govnexa/catalogo.ts` (`MODULOS`)

**Voltar.** Link "← Voltar para [tela]" que leva de volta à tela de origem com os mesmos filtros. *Onde aparece:* no alto de toda tela aberta a partir de outra. `src/lib/navegacao/volta.ts`

## W

**Worker.** Programa que roda na Cloudflare e atende cada acesso à plataforma: confere o login, escolhe o banco da prefeitura e monta a tela. *Onde aparece:* não aparece na tela. `worker/index.ts`

## Onde aprofundar

- **Capítulo 1 — Visão geral do sistema:** o ciclo do projeto e os princípios do produto.
- **Capítulo 2 — Módulos e funcionalidades:** em qual tela cada termo aparece.
- **Capítulos de processos de negócio, dados e dependências:** as regras completas por trás de cada termo.
