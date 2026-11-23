# PLANO E14 · Integração PNCP e Compras.gov.br (resultado, colocação, homologação) · 🟣 Opus · 23/11/2026
Origem: A37 (áudio 37). Depende de E12 (contratacao, contratacao_marco, evento_contratacao; migração 0010). Plano, não ordem de serviço.

## 1. Objetivo
Ligar cada contratação do GovNexa ao registro dela no PNCP e trazer, sem planilha paralela: situação da compra (divulgada, suspensa, revogada, anulada), situação de cada item (em andamento, homologado, deserto, fracassado), vencedor(es), valor homologado, data do resultado e, quando houver, a ordem de classificação. O manual (E12) continua valendo: a integração só SUGERE; quem confirma é a pessoa (princípio "a tela vence a carga").

## 2. O que cada API oferece (conferido em 23/11/2026: swagger baixado e chamada anônima com HTTP 200)
| Fonte | URL oficial | O que traz | Observações |
|---|---|---|---|
| PNCP API de Consulta | https://pncp.gov.br/api/consulta/swagger-ui/index.html (spec: /api/consulta/v3/api-docs) | `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` (uma compra: numeroControlePNCP, processo, numeroCompra, objetoCompra, modalidadeId, srp, valorTotalEstimado, valorTotalHomologado, situacaoCompraId/Nome, existeResultado, dataAtualizacaoGlobal, linkSistemaOrigem). Listas: `/v1/contratacoes/publicacao` e `/v1/contratacoes/atualizacao` (obrigatórios dataInicial, dataFinal yyyyMMdd, codigoModalidadeContratacao, pagina; filtros cnpj, codigoMunicipioIbge, uf; tamanhoPagina 10 a 50), `/v1/contratacoes/proposta`, `/v1/atas`, `/v1/contratos` (até 500/página) | Pública: nenhuma operação GET exige token (spec declara Bearer, mas não aplica). Sem cabeçalho de limite. |
| PNCP API (integração, leitura pública) | https://pncp.gov.br/api/pncp/swagger-ui/index.html (spec: /api/pncp/v3/api-docs) | `GET .../compras/{ano}/{sequencial}/itens` (situacaoCompraItem 1 a 5, temResultado, criterioJulgamento, valorTotal), `.../itens/{n}/resultados` (niFornecedor, tipoPessoa, nomeRazaoSocialFornecedor, ordemClassificacaoSrp, valorTotalHomologado, dataResultado, situacaoCompraItemResultadoId), `.../historico`, `.../arquivos`, `.../atas`; tabela `/v1/situacoes-compra-item-resultado` (1 Informado, 2 Cancelado, 3 Informado cadastro de reserva, 4 Informado remanescente) | GETs sem segurança declarada (só "arquivos/excluidos" exige). Rótulos da situação do item (1 em andamento, 2 homologado, 3 anulado/revogado/cancelado, 4 deserto, 5 fracassado): **a confirmar** no manual (pncp.gov.br/manual, seção 7.14, que recusou a leitura automática). |
| Compras.gov.br Dados Abertos | https://dadosabertos.compras.gov.br/swagger-ui/index.html (spec: /v3/api-docs); manual: gov.br/compras/.../manual-api-compras.pdf | `modulo-contratacoes/1_consultarContratacoes_PNCP_14133` (por orgaoEntidadeCnpj, período, codigoModalidade), `2_consultarItensContratacoes_PNCP_14133`, `3_consultarResultadoItensContratacoes_PNCP_14133` (por orgaoEntidadeCnpj, niFornecedor, dataResultadoPncpInicial/Final; mesmos campos de resultado + idContratacaoPNCP), `modulo-arp`, `modulo-contratos`, `modulo-ocds/1_releases` | Pública (GET anônimo 200). É uma réplica analítica do PNCP (Lei 14.133): serve de fonte complementar e de varredura por período. `modulo-legado` = SIASG federal (Lei 8.666), fora do escopo. Limites de uso: **a confirmar** (não documentados). |

Achado importante (para o dono): o PNCP traz o(s) VENCEDOR(ES) de cada item e a data do resultado; a ordem de classificação (2º, 3º) só vem em registro de preços ou cadastro de reserva (`ordemClassificacaoSrp`, situação 3). A lista completa de colocação fica na ata da sessão (PDF), não em dado estruturado. Logo: "colocação" automática só quando vier; no restante continua manual.

Identificadores: numeroControlePNCP no formato `{CNPJ}-1-{sequencial 6 dígitos}/{ano}` (formato **a confirmar** em amostra fictícia na E14a); a chave de consulta é o trio (CNPJ do órgão, anoCompra, sequencialCompra). Página pública: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}` (**a confirmar**).

## 3. Arquitetura proposta
- **Onde roda:** Cron Trigger no próprio Worker (recomendado). Motivo: o dado é por prefeitura e vai para o D1 da prefeitura (binding `DB_PREFEITURA_<ibge>`); o padrão das GitHub Actions (coletores/rodar.ts gravando JSON em `data/core` por PR) serve a dado público agregado, e gravar no D1 a partir do Actions exigiria token da Cloudflare no GitHub. Reaproveitar do padrão de coletores: 3 tentativas, registro do resultado e do MOTIVO da falha, entrada no painel "Qualidade dos dados".
- **Volume:** só as contratações VINCULADAS são consultadas (dezenas a poucas centenas): 1 chamada da compra + 1 de itens + 1 por item com resultado. Sem fila na E14a/b. **Queue** só se o número de subrequisições por execução passar o limite do plano Workers (a confirmar o plano; ver P7): uma mensagem por contratação.
- **Cache:** sem KV. O próprio D1 guarda o último retrato (snapshot) com `data_atualizacao_global`; se o PNCP não mudou, não reprocessa itens/resultados. Consulta pela tela tem trava de 10 min por contratação.
- **Cliente:** módulo novo `src/lib/pncp/` (puro, `fetch` injetável, relógio injetável): só monta URL a partir do trio validado por regex para hosts fixos (pncp.gov.br, dadosabertos.compras.gov.br); tempo-limite (AbortSignal ~10 s), teto de tamanho da resposta, validação de cada campo antes de gravar, valores convertidos para CENTAVOS inteiros. Sem dependência nova. Testes com respostas FICTÍCIAS em `data/exemplo` (nenhum CNPJ real).
- **Astro + scheduled:** o adaptador precisa expor o `scheduled()` no ponto de entrada do Worker: **a confirmar** (risco R4); alteração em `wrangler.jsonc` (`triggers.crons`) exige autorização do dono.
- **Migração 0011 (alto nível; só acrescenta, nada existente muda):**
  - `pncp_orgao` (prefeitura_id, cnpj 14 dígitos, nome, ativo, criado_por/em): CNPJs compradores da prefeitura, cadastrados pela tela (nunca no repositório).
  - `contratacao_pncp` (prefeitura_id, contratacao_id, cnpj, ano, sequencial, numero_controle; modo 'manual'|'sugestao_confirmada'; vinculado_por/em; desvinculado_por/em; ultima_coleta_em; ultimo_status 'ok'|'erro'|'nao_encontrado'; ultimo_erro curto). Único ativo por contratação e por número de controle na prefeitura; remoção só lógica.
  - `pncp_compra` (retrato da compra: situacao_compra_id/nome, existe_resultado, srp, modalidade_id, valor_estimado e valor_homologado em centavos, data_atualizacao_global, objeto ≤2000, processo ≤60, coletado_em).
  - `pncp_item` (numero_item, descricao ≤300, situacao_item_id, tem_resultado, valor_total) e `pncp_resultado` (numero_item, sequencial_resultado, fornecedor_nome, fornecedor_cnpj só se tipoPessoa = PJ (CPF nunca guardado), ordem_classificacao, situacao_resultado_id, valor_homologado, data_resultado).
  - `contratacao_sugestao` (id S-…, contratacao_id, campo da lista COLUNAS_EDITAVEIS ou etapa/marco, valor_atual, valor_sugerido, fonte 'pncp', criada_em, decisao 'pendente'|'aceita'|'recusada'|'superada', decidida_por/em). Uma pendente por campo; recusada não volta com o mesmo valor.
  - `evento_pncp` (histórico imutável: vinculo, desvinculo, coleta_erro, sugestao_aceita, sugestao_recusada). Tabela própria para NÃO reconstruir `evento_contratacao` (CHECK de `tipo` não se altera em SQLite e a tabela tem gatilhos de imutabilidade). Aceitar sugestão grava também o evento 'editada' normal em `evento_contratacao`.
  - Gatilhos de remoção só lógica e chave imutável, no padrão da 0010; `pncp_candidato` (E14d) para sugestões de vínculo.

## 4. Vínculo contratação ↔ PNCP
- **Manual (E14a):** no detalhe da contratação, "Ligar ao PNCP": colar o número de controle ou o link do PNCP (o sistema extrai cnpj/ano/sequencial) ou escolher numa busca pelos CNPJs cadastrados + ano + sequencial/objeto. Mostra a prévia (objeto, processo, valor estimado, situação) e só grava ao confirmar. CNPJ fora de `pncp_orgao` → recusa.
- **Automático por sugestão (E14d):** varredura diária de `/v1/contratacoes/atualizacao` por CNPJ cadastrado (por modalidade usada); candidato quando bate o processo (normalizado, comparado com `processo_sei`) ou numeroCompra, reforçado por objeto parecido e valor estimado ±10 %. Vira item "Possível vínculo" na Gestão das licitações; nada se liga sem confirmação.

## 5. Regra "a tela vence a carga"
- **Atualiza sozinho:** só as tabelas de retrato (`pncp_*`) e o quadro "Dados do PNCP" (só leitura, com data da última coleta).
- **Vira sugestão a confirmar** (nunca grava direto em `contratacao`): empresa ← vencedor; colocacao = 1 do vencedor (ou ordem_classificacao, se houver); valor_contratado ← valor homologado (soma dos itens); marco 'homologada' + data_marco ← data do resultado quando todos os itens estão homologados; etapa → 'julgamento' quando houver proposta encerrada sem resultado, e → 'concluida' só por decisão da pessoa (regraMudanca da E12 continua valendo).
- **Vira alerta (sem sugestão):** compra suspensa, revogada ou anulada; item deserto ou fracassado; divergência entre valor manual e homologado.
- Aceitar usa a mesma via de gravação da E12 (`executarAcao`, controle de `revisao`, conflito 409, limitador); se o valor atual mudou desde a sugestão, ela vira 'superada'.

## 6. Telas afetadas
- **Gestão das licitações** (`/plataforma/gestao-licitacoes/`): selo por linha (Ligado ao PNCP / situação PNCP / "N sugestões"), filtro "com sugestões pendentes", bloco "Possíveis vínculos" (E14d), aviso de última atualização; CSV ganha colunas numero_controle e situação PNCP.
- **Detalhe da contratação:** quadro "Dados do PNCP" (itens, vencedores, homologação, link para o PNCP), botões Ligar/Desligar/Atualizar agora, lista de sugestões com Aceitar/Recusar (e "Aceitar todas"), histórico do PNCP.
- **Configuração da prefeitura:** cadastro dos CNPJs compradores (só administrador).
- Atualizar `fluxo.ts`, `subfluxos.ts`, `impacto.ts`; responsivo 1280/390 px; datas por `src/lib/datas.ts`.

## 7. Modelo de ameaças e 9 vetores
Ameaças: resposta do PNCP adulterada ou malformada (texto hostil, números absurdos, JSON enorme); SSRF pela busca; vínculo indevido entre prefeituras; abuso do "Atualizar agora" para martelar o PNCP; vazamento de CPF de fornecedor pessoa física.
1. XSS: todo texto do PNCP é dado não confiável: só interpolação escapada do Astro, nunca `set:html`; link externo montado pelo sistema a partir do trio (não usar `linkSistemaOrigem` cru; se exibido, só https e como texto).
2. Rotas de API expostas: rotas novas sob `/plataforma` (Access) + checagem de perfil `podeGravarContratacao`; o cron não tem rota HTTP; "Atualizar agora" é POST com checagem de origem.
3. Chaves expostas: nenhuma chave necessária (APIs públicas); nada de segredo novo.
4. Banco aberto: só binding D1; `prefeitura_id` em toda consulta; cron percorre cada binding de prefeitura separadamente; CNPJ só aceito se estiver em `pncp_orgao` da própria prefeitura.
5. SQL injection: somente consultas preparadas com `bind`; nenhum campo do PNCP concatenado em SQL.
6. Limite de tentativas de login: login segue no Access (não muda); registrar como "não se aplica, inalterado".
7. Prompt injection: não há LLM no fluxo; se um dia houver, textos do PNCP entram como dado, nunca como instrução.
8. Slopsquatting: nenhuma dependência nova (`fetch` nativo); conferir `package.json` sem mudança.
9. Rate limiting: entrada pelo limitador existente (`seguranca/limite.ts`) nas rotas novas + trava de 10 min por contratação; saída com 1 a 2 chamadas simultâneas, pausa entre páginas, recuo exponencial em 429/5xx e teto de chamadas por execução.
Mais: SSRF (hosts fixos, trio por regex), teto de tamanho e tempo-limite, CPF nunca gravado (LGPD), sem dado real em fixtures.

## 8. Riscos
R1 Indisponibilidade/lentidão do PNCP (comum em fim de mês): coleta tolerante, mantém o último retrato e mostra a data. R2 Limites de uso não documentados: chamadas mínimas e recuo; fonte alternativa Compras.gov.br. R3 Mudança de contrato da API (v1→v2, campos): validação estrita que registra "formato inesperado" em vez de gravar lixo; testes com fixtures. R4 `scheduled()` com o adaptador Astro: provar num rascunho antes da E14c; alternativa: Worker de cron separado com o mesmo D1. R5 Compras não publicadas no PNCP (dispensas antigas, órgãos que não publicam): continuam manuais. R6 Colocação 2º/3º raramente disponível (ver achado). R7 Sequencial da compra só existe após publicação: fases "finalizacao/preparacao/ajustes" não têm vínculo possível.

## 9. Fatias de entrega
| Fatia | Conteúdo | Depende de | Risco/rigor |
|---|---|---|---|
| E14a | Migração 0011 (todas as tabelas), `src/lib/pncp/` com fixtures fictícias, cadastro de CNPJs, vínculo manual, "Atualizar agora", quadro "Dados do PNCP" | E12 no ar | Alto (migração): revisão do desenho + Security |
| E14b | Sugestões a confirmar + alertas + selos/filtro na Gestão das licitações + histórico | E14a | Médio (grava em contratacao pela via da E12) |
| E14c | Cron Trigger diário das vinculadas, registro em "Qualidade dos dados"; Queue só se necessário | E14a (+R4 provado) | Alto (wrangler.jsonc: autorização do dono) |
| E14d | Varredura por CNPJ e "Possíveis vínculos" para confirmar | E14a, E14c | Médio |
| E14e (opcional) | Compras.gov.br Dados Abertos como fonte complementar (resultados por período) | E14a | Baixo |
Paralelo possível: E14b e E14c depois da E14a (arquivos diferentes; só junção no `wrangler.jsonc`/fluxo).

## 10. Perguntas que só o dono responde (opção padrão recomendada entre colchetes)
P1 Quais CNPJs compram pela prefeitura no PNCP: só a prefeitura ou também fundos e autarquias (saúde, educação, previdência)? [Prefeitura + fundos que licitam; o administrador cadastra pela tela; nada no repositório.]
P2 Frequência da atualização automática? [1 vez por dia útil, 06h de Brasília, + botão "Atualizar agora".]
P3 Quem confirma vínculos e sugestões? [Os mesmos perfis que já editam contratações na E12; o prefeito só vê.]
P4 Campo VAZIO pode ser preenchido sozinho pelo PNCP ou sempre vira sugestão? [Sempre sugestão, com "Aceitar todas".]
P5 Aceita que 2º/3º colocados continuem manuais quando o PNCP não trouxer? [Sim.]
P6 Coleta no Worker (Cron Trigger) ou GitHub Actions? [Worker; exige autorizar a mudança em `wrangler.jsonc`.]
P7 O plano da conta Workers é o gratuito ou o pago? (muda o limite de subrequisições e a necessidade de fila) [Seguir sem fila; criar fila só se a medição mostrar necessidade.]

## 11. Respostas do dono (23/11/2026)
P1 Cada secretaria ou órgão comprador é um cadastro próprio (CNPJ), pela tela, começando com uma; foco em obras e serviços de engenharia. P2/P6 nesta fatia só por botão; automático diário (6h, dias úteis) fica para a E14c. P3 editor, gestor e administrador ligam, desligam e atualizam; leitura só vê. P4 campo vazio nunca é preenchido sozinho (E14b). P5 toda a classificação que o PNCP trouxer, com aviso claro quando não houver; a colocação manual continua. P7 plano pago do Workers; sem fila nesta fatia.
- **Ajustes ao desenho (E14a):** a E14a é só por botão (sem `scheduled()` nem mudança em `wrangler.jsonc`); as tabelas de sugestões e de candidatos ficam para a migração 0012 ou posterior.
- **Achado sobre obras:** o PNCP não tem campo estruturado confiável; o item de obra veio com categoria 3 "Não se aplica". Sinais usados: amparo legal 18 e 84 (sim); concorrência com palavra de obra no objeto (sim); só a palavra de obra (provável); nada disso (não identificada, exige confirmação para ligar). Categoria do item como sinal: a confirmar com o PNCP.
- **Secretarias compradoras (23/11/2026):** num primeiro momento cadastradas pelo administrador, por uma permissão própria (gerenciar secretarias compradoras), com registro de quem criou, editou e desativou (Histórico da secretaria).
- **Base legal da exibição do nome do fornecedor:** publicidade e transparência das contratações (Lei 14.133/2021, arts. 13 e 174; dados que o próprio PNCP publica). Sem CPF: o banco recusa CPF e o código mascara CPF dentro de textos.
- **Código IBGE:** o código da unidade compradora é conferido só como aviso na prévia (não bloqueia); a 0011 não guarda esse código; se a E14d precisar, ele entra numa migração dela.
- **Riscos residuais aceitos:** (a) `mascararCpf` não cobre CPF colado a letra ou hífen (`CPF00000000191`, `MEI-000.000.001-91`) nem separado por espaços; o banco recusa CPF só no campo de identificação do fornecedor; (b) a prévia e a conferência do `vincular` não entram no teto de 120 coletas por hora (valem só os 60 por minuto da instância e o limite por pessoa); (c) a pausa depois de 429/503 do PNCP e os limites por minuto são por instância do Worker (pausa global na E14c); o teto de 120 coletas por hora no D1 vale para todas as instâncias. Subrequisições: o plano da conta Workers é o pago (confirmado pelo dono), que permite 1000 subrequisições por invocação; `MAX_CHAMADAS_PEDIDO` fica em 60 por vínculo.
