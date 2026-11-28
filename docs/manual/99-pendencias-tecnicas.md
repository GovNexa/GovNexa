# 7. Pendências técnicas

**Para que serve este capítulo.** Junta, sem repetir, os pontos técnicos em aberto encontrados no levantamento dos módulos. Estão separados por gravidade (Alta, Média, Baixa) e por categoria. No fim, a lista curta do que o dono precisa decidir.

Como ler cada item:

- **O quê**: o problema, em uma frase.
- **Onde**: o arquivo de origem.
- **Por que importa**: o efeito para quem usa o sistema.
- **Sugestão**: o caminho, em uma linha.
- **Status**: **confirmado no código** (conferido na versão em produção em 24/11/2026) ou **[VERIFICAR]** (vem dos rascunhos e não foi conferido a fundo).

## 7.1 Gravidade Alta

### Segurança e permissões

**A1. A aprovação de etapa pode ser contornada pelo Kanban.**
- O quê: o servidor só exige a ação `aprovar_etapa` quando o próprio pedido diz que veio das Pendências. Pelo Kanban, o Editor muda a etapa sem essa ação.
- Onde: `src/lib/carteira/mover.ts` (`podeMover`, campo `origem` lido do pedido).
- Por que importa: a regra "só o gestor aprova a mudança de etapa" não vale na prática. O portão, o motivo e o registro no Histórico continuam valendo.
- Sugestão: o dono decide se o Editor pode mover no Kanban; se não puder, exigir `aprovar_etapa` em toda mudança de etapa.
- Status: confirmado no código.

### Dados

**A2. A tela Qualidade dos dados não vê as falhas das coletas diárias.**
- O quê: o resultado das coletas diárias é gravado em `data/core/status-coletas.json`, mas esse arquivo não está na lista de arquivos que o servidor carrega. Só o das coletas mensais entra.
- Onde: `src/lib/dados/arquivos.ts` (importa só `status-coletas-mensais.json`), `src/lib/dados/index.ts` (`statusColetas`), `coletores/rodar.ts`.
- Por que importa: falhas do CAUC, Transferegov, FNS, SICONFI e IBGE não aparecem com o motivo certo. A tela mostra um aviso genérico.
- Sugestão: acrescentar o arquivo à lista e criar um teste que confira que todo arquivo lido existe na lista.
- Status: confirmado no código.

**A3. O valor executado é exigido para a etapa 06, mas não há campo na tela para preenchê-lo.**
- O quê: o portão da etapa 06 (Execução) exige "Valor executado". A edição do projeto não aceita esse campo. Também ficam sem tela: captado, contrapartida, total, corredor e solicitações financeiras.
- Onde: `src/lib/carteira/movimentacao.ts` (`portaoPara`, caso `'06'`; `criarProjeto`), `src/lib/carteira/edicao.ts` (`CHAVES_EDICAO`).
- Por que importa: o projeto só entra em Execução se o valor veio da planilha ou se alguém **força** a passagem com motivo. Isso contraria a regra "o sistema substitui a planilha".
- Sugestão: incluir os valores na edição da ficha, ou retirar a exigência do portão.
- Status: confirmado no código.

### Regras duplicadas ou divergentes

**A4. "Hoje" é calculado de jeitos diferentes: horário de Brasília em umas telas, horário universal (UTC) em outras.**
- O quê: Licitações, fotos, tela inicial, Convênios e Inconsistências usam o dia de Brasília. Kanban, Gantt, Carteira, Mapa e painel, Reunião, Sala de guerra, Cronogramas e o farol usam o dia em UTC, que vira 3 horas antes (às 21h de Brasília já é o dia seguinte). Há três cópias da função de Brasília. Nos dados de Convênios, o "hoje" fica parado no momento em que o servidor ligou.
- Onde: UTC em `src/components/carteira/Kanban.astro`, `src/components/carteira/Gantt.astro`, `src/components/carteira/CarteiraProjetos.astro`, `src/components/gestao/PainelPrefeito.astro`, `src/components/reuniao/ReuniaoSemanal.astro`, `src/components/sala/SalaGuerra.astro`, `src/pages/plataforma/sala-de-guerra/[id].astro`, `src/lib/carteira/visoes.ts` (`farol`), `src/lib/cronograma/visoes.ts`, `src/lib/cronograma/modulos.ts` (`hojeIso`), `src/lib/sala/visoes.ts`. Brasília em `src/lib/contratacoes/regras.ts`, `src/lib/fotos/regras.ts` e `src/lib/whatsapp/farol.ts` (três cópias). Valor fixo em `src/lib/dados/formato.ts` (`export const hoje = new Date()`, usado por `diasAte`).
- Por que importa: entre 21h e meia-noite, duas telas podem mostrar prazos com um dia de diferença. Um prazo pode aparecer "vencido" numa tela e "vence hoje" em outra.
- Sugestão: uma única função "hoje em Brasília" em `src/lib/datas.ts`, usada em todo o sistema, e `diasAte` calculando o dia a cada chamada.
- Status: confirmado no código.

**A5. Duas famílias de regras de alerta, com limites diferentes.**
- O quê: a Central de Alertas avisa a vigência de convênio em 90 dias e fica vermelha em 30. Os Alertas da Captação avisam em 90, 60, 30 e 15 dias, com gravidade "Alta" e "Média", e ignoram vigência já encerrada. A Visão Convênios usa 180 dias para "em risco". O limite de 180 dias sem desembolso está escrito duas vezes.
- Onde: `src/lib/alertas/central.ts` (`DIAS_VIGENCIA_AVISO`, `DIAS_VIGENCIA_VERMELHO`, `DIAS_SEM_DESEMBOLSO`), `src/lib/dados/alertas.ts` (`DIAS_VIGENCIA`, `DIAS_SEM_DESEMBOLSO`), `src/lib/convenios/visao.ts` (`DIAS_RISCO_VIGENCIA`).
- Por que importa: o mesmo convênio pode ser "vermelho" numa tela e "Média" em outra. Quem decide fica sem saber qual vale.
- Sugestão: o dono fixa os limites e os nomes da gravidade; o código passa a ter um só lugar para eles.
- Status: confirmado no código.

## 7.2 Gravidade Média

### Segurança e permissões

**M1. A ação `ver` só é conferida em quatro lugares.**
- O quê: baixar documento, abrir foto e o painel Responsáveis (tela e CSV) conferem `ver`. As demais telas só exigem estar logado.
- Onde: `src/pages/plataforma/[...module].astro`, `worker/index.ts`; lista completa no capítulo 4, seção 4.8.
- Por que importa: hoje não há efeito, porque todo perfil tem `ver`. Um perfil futuro sem `ver` abriria quase tudo.
- Sugestão: conferir `ver` uma vez, na entrada da plataforma.
- Status: confirmado no código.

**M2. O perfil Leitura vê tudo, inclusive valores, nomes de responsáveis e o Histórico com o nome de quem alterou.**
- Onde: `src/components/log/LogAlteracoes.astro`, `src/lib/log/visoes.ts`, telas da Carteira.
- Por que importa: a conta de consulta pode ser de alguém de fora da equipe.
- Sugestão: o dono decide se o perfil Leitura deve ver tudo.
- Status: confirmado no código (a regra desejada é [VERIFICAR] com o dono).

**M3. O login pelo Cloudflare Access continua no código ao lado do login por senha.**
- Onde: `worker/index.ts` (trecho após `LOGIN_MODO`), `worker/access.ts`, `wrangler.jsonc` (`LOGIN_MODO` = `senha`).
- Por que importa: é um caminho de entrada a mais para manter e proteger.
- Sugestão: o dono decide se o modo Access sai do código.
- Status: confirmado no código.

**M4. As telas de Convênios usam o município piloto, não a prefeitura de quem está logado.**
- Onde: `src/lib/municipio-ativo.ts`, `src/pages/plataforma/convenios/index.astro`, `src/components/alertas/CentralAlertas.astro`.
- Por que importa: sem efeito com uma prefeitura só. Com a segunda, todas veriam os convênios do município piloto.
- Sugestão: ler o município a partir da prefeitura da sessão antes de cadastrar a segunda prefeitura.
- Status: confirmado no código.

### Dados

**M5. Os tipos de documento não têm tela para ligar ou desligar.**
- O quê: Mapa de riscos, Projeto básico, Orçamento de referência, ART e Licença ambiental nascem desligados. Nenhuma parte do código altera a tabela `tipo_documento`.
- Onde: `db/d1/prefeitura/0003_tipo_documento.sql`.
- Por que importa: hoje só DFD, ETP e TR podem ser escolhidos. Ligar outro tipo exige mexer direto no banco.
- Sugestão: tela simples na Conta para o Administrador, ou decidir quais tipos já nascem ligados.
- Status: confirmado no código.

**M6. A situação das tarefas é gravada no banco, mas as telas a recalculam pela data.**
- Onde: `src/lib/repositorio/d1.ts` (coluna `status` gravada com `statusNaData` na edição), `src/lib/cronograma/visoes.ts`.
- Por que importa: o valor gravado fica velho com o passar dos dias. Um relatório que leia o banco direto mostraria outra situação.
- Sugestão: parar de gravar a coluna, ou documentar que ela é só o retrato do dia da edição.
- Status: gravação confirmada no código; o não uso nas telas é [VERIFICAR].

**M7. Enviar e remover documento não entram no Histórico.**
- O quê: só a troca de tipo grava no Histórico. Fotos gravam envio e remoção.
- Onde: `src/lib/documentos/repositorio.ts` (`registrar`, `remover`, `classificar`).
- Por que importa: não dá para saber pelo Histórico quem removeu um documento. A tabela `documento` guarda quem removeu, mas a tela não mostra.
- Sugestão: gravar um evento no envio e na remoção, como nas fotos.
- Status: confirmado no código.

**M8. O alerta "planilha defasada" nunca dispara em produção.**
- O quê: o servidor monta a carteira do banco com a data de importação vazia, e a regra pula cargas sem data.
- Onde: `src/middleware.ts` (`importado_em:''`), `src/lib/alertas/central.ts` (`if (!c.importadoEm) continue`).
- Por que importa: o alerta existe na tela, mas nunca aparece.
- Sugestão: usar a data da última importação (tabela `importacao`) ou retirar o alerta.
- Status: confirmado no código.

**M9. O histórico das licitações e do PNCP não aparece na tela de Histórico.**
- Onde: `db/d1/prefeitura/0001_carteira.sql` (visão `log_alteracoes` junta só `evento_projeto` e `evento_sistema`), `db/d1/prefeitura/0010_contratacao.sql`, `db/d1/prefeitura/0011_pncp.sql`.
- Por que importa: o registro existe no banco, mas a equipe não o vê junto com o resto.
- Sugestão: decidir se o Histórico deve mostrar licitações.
- Status: confirmado no código.

**M10. O Histórico é lido inteiro a cada consulta.**
- Onde: `src/middleware.ts` (`listarHistorico`), `src/components/log/LogAlteracoes.astro` (página feita no navegador).
- Por que importa: a tela fica mais lenta à medida que o histórico cresce.
- Sugestão: paginar no servidor.
- Status: [VERIFICAR] (volume em produção).

### Regras duplicadas ou divergentes

**M11. Data de entrega com duas regras.** A tela inicial usa a data de encerramento ou mobilização mais prazo; Mapa e painel e Reunião usam só o encerramento. Onde: `src/lib/gestao/painel.ts`, `src/lib/reuniao/visoes.ts`. Por que importa: contagens diferentes para a mesma pergunta. Sugestão: uma função só. Status: [VERIFICAR].

**M12. Farol ainda ativo.** As cores vermelho, amarelo e verde seguem em Mapa e painel, Painel da equipe, Reunião, Sala de guerra e WhatsApp, e a regra do WhatsApp copia a da carteira. Onde: `src/lib/carteira/visoes.ts` (`farol`), `src/lib/whatsapp/farol.ts` (`farolWhats`). Por que importa: será retirado pela E19 (decisão do dono), que ainda não está no ar. Sugestão: tratar junto com a E19. Status: confirmado no código.

**M13. Regras diferentes entre fotos e documentos.** Foto confere que a chave do arquivo começa pela prefeitura e pelo projeto; documento usa a chave do banco sem essa segunda conferência (a busca no banco já filtra pela prefeitura). As mensagens de erro de documentos adivinham o código lendo o texto. Onde: `src/lib/documentos/servico.ts` (`baixarDocumento`), `src/lib/fotos/servico.ts` (`verFoto`), `src/lib/documentos/mensagens.ts` (`codigoDe`). Sugestão: igualar as duas regras. Status: [VERIFICAR].

### Dependências externas e várias prefeituras

**M14. Goiânia escrita no código.** Limites da cidade no mapa (`src/lib/mapa/geo.ts` e a restrição em `db/d1/prefeitura/0005_bairro_geo.sql`), endereço do SEI (`src/lib/sei/link.ts`, `HOSTS_SEI`), rodapé das mensagens do WhatsApp (`src/lib/whatsapp/modelos.ts`), metas internas e feriados (`data/config/prazos-internos.json`, `src/lib/prazos/calendario.ts`) e textos da Captação (`src/lib/dados/captacao.ts`). Por que importa: outra prefeitura exige mudar código e banco. Sugestão: levar para a configuração da prefeitura. Status: [VERIFICAR] item a item.

**M15. Busca de endereço controlada por servidor.** O cache, a fila de 1 pedido por segundo e a pausa após erro ficam na memória de cada servidor; com vários, o limite do OpenStreetMap pode ser passado. Onde: `src/lib/mapa/busca-endereco.ts`. Sugestão: contador compartilhado. Status: [VERIFICAR] em produção.

**M16. Prazos da Lei 14.133 sem revisão jurídica.** Os prazos estão marcados "Conferir no texto oficial antes de usar em produção". Onde: `src/lib/prazos/lei14133.ts`. Sugestão: revisão jurídica antes de ligar às licitações reais. Status: [VERIFICAR].

### Textos e documentos desatualizados

**M17. Documentos antigos do repositório contradizem o sistema atual.**
- `docs/seguranca.md`: descreve o login antigo e a senha com resumo simples. A própria nota de 16/11/2026 diz que o login é o Cloudflare Access, o que também já mudou: desde 17/11/2026 o login é por senha com 2ª etapa. Status: confirmado.
- `docs/arquitetura.md`: cita Vercel e banco futuro PostgreSQL; a nota de 16/11/2026 corrige só parte. Status: confirmado.
- `docs/regras-alertas.md`: rascunho da Fase 0. Os gatilhos de 90, 60, 30 e 15 dias **existem** nos Alertas da Captação (`src/lib/dados/alertas.ts`), mas os estados "aberto, em andamento, resolvido" e o responsável não existem em lugar nenhum. Status: confirmado.
- `docs/manual-usuario.md` (10/11/2026): fala em "um único acesso, sem perfis", em sete guias da Captação (hoje oito itens no menu Convênios, com a Visão Convênios) e diz que a rotina "publica" os dados (hoje ela abre um pedido para o dono aprovar). Status: [VERIFICAR] item a item.
- Sugestão: substituir por este manual e arquivar os três primeiros com aviso no topo.

**M18. Texto do Fluxo sobre o acesso.** A etapa "Acesso e perfis" diz "O Access continua como padrão até a troca autorizada", mas o login por senha está ligado. Onde: `src/lib/govnexa/fluxo.ts` (nó do acesso), `wrangler.jsonc`. Sugestão: corrigir o texto. Status: confirmado no código.

## 7.3 Gravidade Baixa

### Código sem uso

- **Ação `importar`**: existe no perfil Administrador, mas nenhuma tela ou rota a exige. A carga é por comando (`src/lib/usuarios/index.ts`, `scripts/importar-planilhas.ts`). Sugestão: retirar ou ligar a uma tela de importação. Status: confirmado.
- **Lista antiga de usuários**: `listarUsuarios` só é usada por teste; a tela usa `servicoLogin().listar` (`src/lib/usuarios/lista.ts`, `tests/usuarios/lista.test.ts`). Sugestão: remover. Status: confirmado.
- **Repositório PostgreSQL**: só é usado em teste; o sistema usa só o banco da Cloudflare (`src/lib/repositorio/postgres.ts`, `tests/repositorio/repositorio.test.ts`). Sugestão: remover. Status: confirmado.
- **Função `ordenar` da carteira**: marcada "Sem uso desde a E5" (`src/lib/carteira/modulos.ts`). Status: confirmado.
- **`VOLTAS_PERMITIDAS`**: marcada como obsoleta, mas ainda citada em `src/lib/contratacoes/navegacao.ts` (`src/lib/carteira/ficha.ts`). Sugestão: retirar com cuidado. Status: confirmado.
- **Categoria e situação do mapa**: `categoriaObra` e `situacaoMapa` só aparecem em teste (`src/lib/mapa/geo.ts`, `tests/mapa/mapa.test.ts`). Status: confirmado.
- **`DIAS_DEFASAGEM`**: definida e nunca usada (`src/lib/dados/alertas.ts`). Status: confirmado.
- **Funções repetidas**: `dataBr` e `textoPrazo` em `src/lib/sala/visoes.ts` e `src/lib/reuniao/simulacao.ts`, apesar de `src/lib/datas.ts`; `reaisCurtos` e `reaisAbreviado` (`src/lib/gestao/prioritarios.ts`, `src/lib/gestao/painel.ts`); `somaDias` e `distintos` em arquivos de cronograma. Status: [VERIFICAR].

### Telas e textos

- **Gantt com período fixo** de 01/01/2026 a 31/12/2029: datas fora disso aparecem cortadas (`src/components/carteira/Gantt.astro`, `LIM_INI`, `LIM_FIM`). Status: confirmado.
- **Botão "Novo registro"** nas guias da Captação e dos demonstrativos responde "protótipo" (`src/pages/plataforma/[...module].astro`). Sugestão: esconder nas telas de leitura. Status: confirmado.
- **Selo "3" fixo** no menu para Solicitações, Pareceres e Recursos, número de exemplo (`src/layouts/Platform.astro`). Status: confirmado.
- **Filtro de ação do Histórico** lista só 7 dos mais de 25 tipos de evento (`src/lib/log/tipos.ts`, `ACOES_FILTRO`). Status: [VERIFICAR].
- **Nome da tela no botão Voltar**: lista manual; tela nova aparece como "a tela anterior" (`src/lib/navegacao/volta.ts`, `NOMES_TELA`). Status: [VERIFICAR].
- **Textos antigos no código**: "só leitura" nos cronogramas (`src/lib/cronograma/tipos.ts`, `src/lib/cronograma/modulos.ts`), "endereço antigo" em Obras sem localização (`src/pages/plataforma/projetos-localizacao/index.astro`), cores do farol na introdução de Projetos (`src/pages/plataforma/[...module].astro`). Status: [VERIFICAR].
- **Fontes mensais marcadas como "carga manual"**: INEP, SINISA e CNES já têm coleta mensal automática; o DOU não registra coletor e nunca mostra falha (`src/lib/dados/qualidade.ts`). Status: [VERIFICAR].
- **Filtros impressos da Carteira** usam a lista padrão de áreas, não o catálogo da prefeitura (`src/lib/carteira/lista.ts`, `descreverFiltros`). Status: [VERIFICAR].

### Banco e manutenção

- **Ligações sem chave no banco**: cronograma para projeto, documento para tipo, projeto para área e histórico do sistema dependem de gatilho ou do código (capítulo 5). Status: confirmado.
- **Gatilhos impedem apagar** cronogramas e tarefas editados na tela, inclusive em limpezas administrativas (`db/d1/prefeitura/0009_cronograma_na_tela.sql`). Status: confirmado (é proteção intencional; limpeza exige migração própria).
- **Mapa de impacto** aponta para a pasta `db/migracoes/`, que não existe; as migrações estão em `db/d1/` (`src/lib/govnexa/impacto.ts`). Status: confirmado.
- **Limite de 30 gravações por minuto** escrito no código e na configuração (`src/lib/seguranca/limite.ts`, `wrangler.jsonc`). Há teste que confere. Status: confirmado.
- **Lista de arquivos de dados mantida à mão**: arquivo novo de coleta não aparece até alguém acrescentá-lo (`src/lib/dados/arquivos.ts`). Causa do item A2. Status: confirmado.
- **Chave pública da Receita no código** do coletor de CNPJ, vinda de um compartilhamento público e documentada (`coletores/receita-cnpj-fundos.ts`, `docs/fontes/receita-cnpj.md`). Status: [VERIFICAR] se pode ficar assim.
- **Carga de planilhas descrita no Fluxo** como rotina do GitHub disparada à mão; essa rotina não está neste repositório (`src/lib/govnexa/fluxo.ts`, `.github/workflows/`). Status: [VERIFICAR] no repositório privado de dados.

## 7.4 Funções demonstrativas e incompletas

Não são defeitos: estão no ar como simulação, e a tela avisa. Ficam aqui para o dono saber o que falta para virarem reais.

- **[DEMONSTRATIVO]** Reunião semanal e Sala de guerra: nada é gravado no servidor; as salas vêm de exemplos (`src/lib/sala/carga.ts`, `src/lib/reuniao/simulacao.ts`).
- **[DEMONSTRATIVO]** WhatsApp: nenhum envio, nenhum banco (`src/lib/whatsapp/simulacao.ts`).
- **[DEMONSTRATIVO]** Processos no SEI e Licitação em detalhe: dados só no navegador; a leitura diária do SEI não existe (`src/components/sei/ProcessosSei.astro`, `src/lib/licitacao/detalhe.ts`).
- **[DEMONSTRATIVO]** Projetos da Captação: 2 projetos fictícios (`src/lib/projetos/guia.ts`).
- **[DEMONSTRATIVO]** Menu Licitações e as telas Relatórios, Perfil e Configurações (`src/pages/plataforma/[...module].astro`).
- **[INCOMPLETO]** Alertas não têm estado (visto, resolvido, adiado) nem responsável; o alerta some só quando o dado muda (`src/lib/alertas/central.ts`).
- **[INCOMPLETO]** Prazos da Lei 14.133 e "Edital na praça" não geram alerta (`src/components/alertas/CentralAlertas.astro`, `eventosLei: []`).
- **[INCOMPLETO]** Atualização automática do PNCP, sugestões e possíveis vínculos (E14b a E14e), previstos e não publicados (`docs/govnexa/plano-e14-pncp.md`).
- **[INCOMPLETO]** DOU, Portal da Transparência e CNPJ dos fundos: coletores manuais; nenhuma tela lê o Portal da Transparência (`coletores/`).
- **[INCOMPLETO]** Dependência real entre tarefas: deduzida pela ordem e pelas datas, sem campo na tela (`src/lib/cronograma/dependencias.ts`).
- Previstos e não publicados: E19 (retirada do farol) e E20 (envolvidos e recursos por tarefa).

## 7.5 Testes que faltam

Há testes para permissões, login, carteira, cronogramas, licitações, PNCP, fotos, documentos, mapa e Fluxo (`tests/`). Não foram encontrados, ou não foi confirmada a cobertura de:

- Mudança de etapa pelo Kanban feita por Editor (item A1).
- Presença de todo arquivo de dados lido na lista de `src/lib/dados/arquivos.ts` (item A2).
- Regras da Central de Alertas e dos Alertas da Captação (`src/lib/alertas/central.ts`, `src/lib/dados/alertas.ts`, função `gerarAlertas`).
- Agenda `.ics`, avaliação das fontes (`avaliarFontes`) e a tela Qualidade dos dados.
- Coletores de dados públicos (só há teste do resumo de erro e dos contratos dos dados).
- Funções de "hoje" perto da meia-noite (item A4).
- Limites de login, bloqueio por 2ª etapa e dispensa de ponta a ponta. [VERIFICAR]
- Cada etapa do Fluxo apontando para uma tela que existe. [VERIFICAR]

## 7.6 O que o dono precisa decidir

1. **Kanban e aprovação** (A1): o Editor pode mudar a etapa pelo Kanban, ou toda mudança de etapa precisa do Gestor?
2. **Limites dos alertas** (A5): quais prazos valem (90, 60, 30, 15 ou 180 dias) e quais nomes de gravidade usar em todas as telas.
3. **Valores na ficha** (A3): incluir valor executado e os outros valores na edição, ou retirar a exigência do portão da etapa 06.
4. **O que o perfil Leitura vê** (M2): tudo, como hoje, ou sem valores e sem nomes.
5. **Modo Access** (M3): retirar do código o login antigo pelo Cloudflare Access.
6. **Tipos de documento** (M5): criar a tela para ligar e desligar tipos, ou definir quais já nascem ligados.
7. **Documentos antigos** (M17): arquivar `docs/seguranca.md`, `docs/arquitetura.md` e `docs/regras-alertas.md` em favor deste manual.
8. **Prazos da Lei 14.133** (M16): quem faz a revisão jurídica.
9. **Conta de consulta**: hoje ela não expira sozinha; decidir se basta desativar à mão ou se precisa de data de fim.

## Onde aprofundar

- Permissões e telas que só exigem login: capítulo 4.
- Tabelas, ligações sem chave e serviços externos: capítulo 5.
- Regras de cada módulo: capítulos dos módulos.
