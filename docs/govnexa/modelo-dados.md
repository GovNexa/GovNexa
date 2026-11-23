# GovNexa — Modelo de dados (Fase 0)

Desenho lógico para os módulos Projetos, Contratação e Gestão. O banco de produção será PostgreSQL (Fase 3); até lá o MVP lê e grava arquivos JSON com a **mesma forma** destas entidades, para que a migração seja só uma carga. As tabelas da Captação já existem em `docs/esquema-postgres.sql` e se ligam a estas por `projeto_id`.

## 1. Regras gerais

- **Isolamento por prefeitura.** Toda tabela de negócio tem `prefeitura_id`. No PostgreSQL, o isolamento é imposto pelo banco (segurança por linha, *row level security*) com a prefeitura da sessão; a tela nunca é a única barreira.
- **Identificadores** `uuid`; códigos legíveis (ex.: número do item na planilha) ficam em colunas próprias.
- **Ausente é `null`**, nunca zero. Valores em `numeric(16,2)`; datas em `date`; momentos em `timestamptz`.
- **Origem preservada.** Registro importado guarda `origem` (planilha, PDF do SEI, página pública do SEI, manual) e o valor bruto em `importacao_linha`.
- **Histórico.** Mudança de campo vai para `historico` (autor, antes, depois, motivo); valor, prioridade e macroetapa exigem motivo.
- **Sem dados pessoais desnecessários.** Pessoa tem nome, unidade e contato de trabalho; nada de CPF. Texto lido de documento público tem dados pessoais mascarados.

## 2. Entidades

### Catálogos
| Entidade | Campos principais |
| --- | --- |
| `prefeitura` | id, codigo_ibge, nome, uf, nome_exibicao, subdominio, logo, ativa |
| `modulo_contratado` | prefeitura_id, modulo (projetos, captacao, licitacoes, gestao), ativo |
| `orgao` | id, prefeitura_id, sigla, nome, tipo (interno, externo) |
| `pessoa` | id, prefeitura_id, nome, orgao_id, email_trabalho, ativa |
| `regiao` | id, prefeitura_id, nome |
| `tipo_projeto` | id, prefeitura_id, nome, modelo_cronograma_id |
| `fonte_recurso` | id, prefeitura_id, nome, categoria (tesouro, financiamento, repasse, convenio, contrapartida, outro) |
| `feriado` | data, descricao, abrangencia (nacional, estadual, municipal), prefeitura_id (só municipal) |
| `parametro` | prefeitura_id, chave, valor, referencia_legal (prazos de alerta, pesos do score, metas internas) |

### Projetos
| Entidade | Campos principais |
| --- | --- |
| `projeto` | id, prefeitura_id, codigo_legado, titulo, local, tipo_projeto_id, orgao_demandante_id, orgao_executor_id, orgao_onde_esta_id, responsavel_id, gerente_id, compromisso (decidido, condicionado, ideia), macroetapa (1 a 9), estado_lateral, prioridade_executiva (P0 a P3), obra_do_prefeito, maturidade (1 a 5), complexidade (1 a 4), valor_estimado, origem_valor, data_base_valor, entrega_prevista_base, entrega_projetada, criado_em, atualizado_em |
| `projeto_fonte` | projeto_id, fonte_recurso_id, valor, garantido (sim, em estudo, não), convenio_id |
| `projeto_regiao` | projeto_id, regiao_id, percentual (soma 100) |
| `projeto_previsao_anual` | projeto_id, ano, tipo (fisico, financeiro), valor, percentual |
| `projeto_link` | projeto_id, relacionado_id, tipo (depende_de, parte_de, sobreposto, substitui) |
| `processo_sei` | id, prefeitura_id, numero, tipo, link_publico, ultima_leitura, unidade_atual, desde |
| `projeto_processo` | projeto_id, processo_sei_id (N para N) |
| `demanda` | id, prefeitura_id, titulo, origem, situacao, projeto_id |

### Cronograma
| Entidade | Campos principais |
| --- | --- |
| `modelo_cronograma` / `modelo_etapa` / `modelo_dependencia` | fases, etapas padrão (duração, dias úteis ou corridos, marco, opcional, permite ciclos, órgão padrão) e predecessoras (FS, SS, FF, SF, folga) |
| `etapa` | id, projeto_id, fase, codigo, nome, responsavel_id, orgao_id, eh_marco, inicio_previsto, fim_previsto, inicio_real, fim_real, percentual_manual, status_manual, justificativa |
| `dependencia` | etapa_id, predecessora_id, tipo, folga_dias |
| `ciclo` | etapa_id, numero, tipo (entrega, validacao, diligencia, protocolo, exigencia), orgao_id, enviado_em, retornou_em, resultado |
| `bloqueio` | etapa_id, motivo, depende_de_orgao_id, depende_de_pessoa_id, aberto_em, resolvido_em |
| `linha_base` / `linha_base_etapa` | versão, motivo, datas previstas congeladas |

### Contratação (Lei 14.133)
| Entidade | Campos principais |
| --- | --- |
| `contratacao` | id, prefeitura_id, forma (licitacao, adesao_ata, dispensa, inexigibilidade, credenciamento, contrapartida, chamamento), modalidade, criterio, objeto, processo_sei_id, valor_estimado, publicacao_prevista, publicacao_real, abertura, homologacao |
| `lote` | id, contratacao_id, numero, projeto_id, valor_estimado |
| `licitante` | id, lote_id, cnpj, razao_social, valor_proposta, colocacao, situacao (classificado, inabilitado, desclassificado, vencedor) |
| `recurso_licitacao` | lote_id, licitante_id, intencao_em, razoes_ate, contrarrazoes_ate, decisao_em, resultado |
| `contrato` | id, lote_id, numero, empresa_cnpj, valor_inicial, assinatura, publicacao_pncp, ordem_servico, prazo_dias, garantia |
| `aditivo` | contrato_id, tipo (prazo, valor, ambos), valor, dias, data |
| `medicao` | contrato_id, numero, data, percentual_fisico, valor_medido, valor_pago, pago_em |

### Captação (ligação)
`convenio` (já existente na Captação) ganha `projeto_id` e a entidade `clausula_suspensiva` (convenio_id, exigencia, prazo, cumprida_em, etapa_id ligada).

### Governança e auditoria
`reuniao`, `reuniao_item`, `acao` (responsável, prazo, situação), `pendencia_externa`, `historico`, `evento` (alimenta relatórios e notificações), `importacao`, `importacao_linha`, `snapshot_carteira` (foto semanal para o "o que mudou").

## 3. MVP em JSON (Fases 1 e 2)

- Uma pasta por prefeitura, **fora do repositório**, indicada pela variável de ambiente `GOVNEXA_DADOS` (ex.: `GOVNEXA_DADOS/5208707/`), com um arquivo por entidade (`projetos.json`, `etapas.json`, `processos-sei.json`…). Cada arquivo traz `prefeitura_id`, `gerado_em` e a lista de registros com os campos acima.
- O repositório só contém `data/exemplo/`, com uma prefeitura fictícia, usada nos testes e nas demonstrações.
- Sem `GOVNEXA_DADOS`, o sistema usa os dados de exemplo e mostra o aviso "dados de exemplo".
- A camada de acesso (mesmo padrão de `src/lib/dados/`) é a única que lê os arquivos; na Fase 3 ela passa a ler o PostgreSQL sem mudar as telas.

## D1

O banco central mantém prefeituras, usuários e importações; cada prefeitura tem um banco D1 próprio
(com carteira, cronogramas, eventos, documentos e fotos). Todo acesso do repositório também filtra
por `prefeitura_id`; não há RLS ou GRANT no SQLite. Projeto e histórico são gravados no mesmo batch.
Uma revisão por projeto recusa atualização concorrente baseada em leitura antiga.
Objetos e listas são TEXT JSON com CHECK(json_valid); valores monetários permanecem números nos
objetos JSON, com semântica REAL em reais, sem conversão para centavos. Datas são TEXT ISO; momentos
são ISO-8601 UTC. Identificadores UUID de documentos e fotos são TEXT gerados no código com
crypto.randomUUID(); os códigos legados dos projetos continuam preservados.
Triggers BEFORE UPDATE/DELETE impedem reescrever ou apagar eventos; a visão log_alteracoes reúne
eventos de projeto e de sistema. Fotos e documentos guardam chaves R2, nunca URLs públicas.
A carga local aceita `--dialeto sqlite`, sem BEGIN/COMMIT, com upserts idempotentes.

O desenho que orienta as próximas tabelas (catálogos, governança, SEI e contratação) e as regras para toda entrega com
dados estão em `docs/govnexa/projeto-banco.md`. Desde a migração 0004, `evento_sistema` tem a coluna calculada `projeto_id`
(tirada de `detalhes`) e o histórico de um projeto é lido pelos índices `(prefeitura_id, projeto_id, em)` das duas tabelas
de eventos. A localização do projeto é gravada só na coluna `projeto.localizacao`, junto com o evento `localizacao_alterada`.


## Centros de bairros no D1 — migração 0005

Tabela `bairro_geo` no banco da prefeitura: `prefeitura_id INTEGER NOT NULL`, `bairro TEXT NOT NULL`, `busca TEXT NOT NULL`, `encontrado INTEGER NOT NULL CHECK(encontrado IN (0,1))`, `lat REAL`, `lng REAL`, `fonte TEXT NOT NULL`, `gerado_em TEXT NOT NULL`.
Chave primária composta `(prefeitura_id,bairro)`; toda leitura filtra a prefeitura autenticada. Se encontrado, latitude/longitude são obrigatórias e ficam entre -16.85/-16.45 e -49.5/-49.05; se não encontrado, ambas são nulas.
Centros públicos do Nominatim são aceitos só com município Goiânia e caixa válida, preferindo bairro/suburb/neighbourhood/quarter. Dados reais ficam no D1; exemplos fictícios ficam em `data/exemplo/`. A fonte e a data acompanham a busca; carga por SQL idempotente. O contexto compartilha o cache de 30 s e usa o exemplo se a leitura falhar ou vier vazia.

## Contratações (E12, migração 0010)
Três tabelas novas, todas com `prefeitura_id` e chaves compostas `(prefeitura_id, id)`; valores em centavos (inteiros); datas do dia `AAAA-MM-DD`; instantes em ISO UTC.
- `contratacao`: a contratação (licitação, adesão a ata, dispensa etc.), com etapa (`finalizacao`, `preparacao`, `ajustes`, `publicada`, `julgamento`, `concluida`), `etapa_desde`, valores (estimado, proposta, contratado, pago), empresa, colocação, marco, datas, "onde está", `aguardando` (nao, pgm, outras_areas) e `revisao` (edição otimista). Ligação OPCIONAL com projeto da carteira (`projeto_id`, chave composta: só projeto da mesma prefeitura). `origem` = `tela` ou `carga`.
- `contratacao_marco`: próximos marcos (data, descrição, concluído); no máximo 50 ativos por contratação (regra do serviço).
- `evento_contratacao`: Histórico próprio e imutável (criada, carga, editada, etapa, removida, marcos), com `de`/`para`, `campos` (JSON `{campo:{de,para}}`), motivo e descrição.
Travas no banco: sem DELETE nas 3 tabelas; sem UPDATE no Histórico; contratação e marco removidos não mudam; chave (prefeitura, id, autor e data de criação, origem) imutável; CHECKs de valores (inteiros ≥ 0), datas reais (2000 a 2100), enums e autores (1 a 254 caracteres).
A tela vence a carga: `scripts/gerar-sql-carga.ts` lê `contratacoes.json` só no dialeto D1, valida tudo antes de gerar SQL e usa `ON CONFLICT DO NOTHING` (nunca sobrescreve o que foi editado na tela).
Por que Histórico próprio: há contratações sem projeto (`evento_projeto` exige projeto), a FK composta garante evento só da mesma prefeitura e a leitura por contratação é por índice; não mistura no Histórico de alterações dos projetos.
