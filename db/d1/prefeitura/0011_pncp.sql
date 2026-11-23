-- E14a: integração com o PNCP (vínculo manual e "Atualizar agora"). Só acrescenta tabelas; nada existente muda.
-- Valores em CENTAVOS (inteiros). Instantes do GovNexa em ISO UTC com 'Z'; datas do PNCP guardadas como vieram (AAAA-MM-DD ou AAAA-MM-DDTHH:MM:SS, horário de Brasília).
-- CPF nunca é gravado: fornecedor_ni só existe para pessoa jurídica (o código também mascara CPF dentro de textos). Remoção só lógica no cadastro e no vínculo; Histórico imutável.
CREATE TABLE pncp_orgao (
  prefeitura_id INTEGER NOT NULL REFERENCES prefeitura (id),
  id TEXT NOT NULL CHECK (length(id) BETWEEN 3 AND 42 AND substr(id, 1, 2) = 'O-' AND substr(id, 3) NOT GLOB '*[^A-Za-z0-9_-]*'),
  cnpj TEXT NOT NULL CHECK (length(cnpj) = 14 AND substr(cnpj, 1, 12) NOT GLOB '*[^0-9A-Z]*' AND substr(cnpj, 13, 2) NOT GLOB '*[^0-9]*'),
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  sigla TEXT CHECK (sigla IS NULL OR length(trim(sigla)) BETWEEN 1 AND 20),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  revisao INTEGER NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  criado_por TEXT NOT NULL CHECK (length(criado_por) BETWEEN 1 AND 254),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CHECK (substr(criado_em, -1) = 'Z' AND substr(criado_em, 11, 1) = 'T' AND length(criado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', criado_em) IS substr(criado_em, 1, 19)),
  atualizado_por TEXT CHECK (atualizado_por IS NULL OR length(atualizado_por) BETWEEN 1 AND 254),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CHECK (substr(atualizado_em, -1) = 'Z' AND substr(atualizado_em, 11, 1) = 'T' AND length(atualizado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', atualizado_em) IS substr(atualizado_em, 1, 19)),
  PRIMARY KEY (prefeitura_id, id),
  UNIQUE (prefeitura_id, cnpj)
);
CREATE TRIGGER pncp_orgao_sem_delete BEFORE DELETE ON pncp_orgao BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
CREATE TRIGGER pncp_orgao_chave_imutavel BEFORE UPDATE OF prefeitura_id, id, cnpj, criado_por, criado_em ON pncp_orgao BEGIN SELECT RAISE(ABORT, 'Chave do órgão não muda'); END;

CREATE TABLE contratacao_pncp (
  prefeitura_id INTEGER NOT NULL,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 3 AND 42 AND substr(id, 1, 2) = 'V-' AND substr(id, 3) NOT GLOB '*[^A-Za-z0-9_-]*'),
  contratacao_id TEXT NOT NULL,
  orgao_id TEXT NOT NULL,
  cnpj TEXT NOT NULL CHECK (length(cnpj) = 14 AND substr(cnpj, 1, 12) NOT GLOB '*[^0-9A-Z]*' AND substr(cnpj, 13, 2) NOT GLOB '*[^0-9]*'),
  ano INTEGER NOT NULL CHECK (typeof(ano) = 'integer' AND ano BETWEEN 2021 AND 2100),
  sequencial INTEGER NOT NULL CHECK (typeof(sequencial) = 'integer' AND sequencial BETWEEN 1 AND 999999),
  numero_controle TEXT NOT NULL,
  modo TEXT NOT NULL CHECK (modo IN ('manual', 'sugestao_confirmada')),
  vinculado_por TEXT NOT NULL CHECK (length(vinculado_por) BETWEEN 1 AND 254),
  vinculado_em TEXT NOT NULL CHECK (substr(vinculado_em, -1) = 'Z' AND substr(vinculado_em, 11, 1) = 'T' AND length(vinculado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', vinculado_em) IS substr(vinculado_em, 1, 19)),
  desvinculado_por TEXT CHECK (desvinculado_por IS NULL OR length(desvinculado_por) BETWEEN 1 AND 254),
  desvinculado_em TEXT CHECK (desvinculado_em IS NULL OR (substr(desvinculado_em, -1) = 'Z' AND substr(desvinculado_em, 11, 1) = 'T' AND length(desvinculado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', desvinculado_em) IS substr(desvinculado_em, 1, 19))),
  ultima_tentativa_em TEXT CHECK (ultima_tentativa_em IS NULL OR (substr(ultima_tentativa_em, -1) = 'Z' AND substr(ultima_tentativa_em, 11, 1) = 'T' AND length(ultima_tentativa_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', ultima_tentativa_em) IS substr(ultima_tentativa_em, 1, 19))),
  ultima_coleta_em TEXT CHECK (ultima_coleta_em IS NULL OR (substr(ultima_coleta_em, -1) = 'Z' AND substr(ultima_coleta_em, 11, 1) = 'T' AND length(ultima_coleta_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', ultima_coleta_em) IS substr(ultima_coleta_em, 1, 19))),
  ultimo_status TEXT CHECK (ultimo_status IS NULL OR ultimo_status IN ('ok', 'erro', 'nao_encontrado', 'formato')),
  ultimo_erro TEXT CHECK (ultimo_erro IS NULL OR length(ultimo_erro) <= 200),
  CHECK (numero_controle = cnpj || '-1-' || printf('%06d', sequencial) || '/' || ano),
  CHECK ((desvinculado_em IS NULL) = (desvinculado_por IS NULL)),
  CHECK (ultimo_status IS NULL OR ultima_tentativa_em IS NOT NULL),
  CHECK (ultima_coleta_em IS NULL OR ultima_tentativa_em IS NOT NULL),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, contratacao_id) REFERENCES contratacao (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, orgao_id) REFERENCES pncp_orgao (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, cnpj) REFERENCES pncp_orgao (prefeitura_id, cnpj)
);
CREATE UNIQUE INDEX contratacao_pncp_ativo_contratacao ON contratacao_pncp (prefeitura_id, contratacao_id) WHERE desvinculado_em IS NULL;
CREATE UNIQUE INDEX contratacao_pncp_ativo_compra ON contratacao_pncp (prefeitura_id, cnpj, ano, sequencial) WHERE desvinculado_em IS NULL;
CREATE INDEX contratacao_pncp_orgao_idx ON contratacao_pncp (prefeitura_id, orgao_id, ultima_tentativa_em) WHERE desvinculado_em IS NULL;
CREATE INDEX contratacao_pncp_historico_idx ON contratacao_pncp (prefeitura_id, contratacao_id, vinculado_em);
CREATE TRIGGER contratacao_pncp_sem_delete BEFORE DELETE ON contratacao_pncp BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
CREATE TRIGGER contratacao_pncp_chave_imutavel BEFORE UPDATE OF prefeitura_id, id, contratacao_id, orgao_id, cnpj, ano, sequencial, numero_controle, modo, vinculado_por, vinculado_em ON contratacao_pncp BEGIN SELECT RAISE(ABORT, 'Chave do vínculo não muda'); END;
CREATE TRIGGER contratacao_pncp_desvinculado_imutavel BEFORE UPDATE ON contratacao_pncp WHEN OLD.desvinculado_em IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Vínculo desfeito não muda'); END;
CREATE TRIGGER contratacao_pncp_orgao_coerente BEFORE INSERT ON contratacao_pncp
  WHEN NOT EXISTS (SELECT 1 FROM pncp_orgao o WHERE o.prefeitura_id = NEW.prefeitura_id AND o.id = NEW.orgao_id AND o.cnpj = NEW.cnpj AND o.ativo = 1)
  BEGIN SELECT RAISE(ABORT, 'Órgão inexistente, inativo ou de outro CNPJ'); END;
CREATE TRIGGER contratacao_pncp_contratacao_ativa BEFORE INSERT ON contratacao_pncp
  WHEN NOT EXISTS (SELECT 1 FROM contratacao c WHERE c.prefeitura_id = NEW.prefeitura_id AND c.id = NEW.contratacao_id AND c.removida_em IS NULL)
  BEGIN SELECT RAISE(ABORT, 'Contratação inexistente ou removida'); END;

-- Retrato (o último que o PNCP devolveu). É regravado a cada coleta; só aceita escrita para vínculo ativo.
CREATE TABLE pncp_compra (
  prefeitura_id INTEGER NOT NULL,
  vinculo_id TEXT NOT NULL,
  situacao_id INTEGER NOT NULL CHECK (typeof(situacao_id) = 'integer' AND situacao_id BETWEEN 1 AND 99),
  situacao_nome TEXT CHECK (situacao_nome IS NULL OR length(situacao_nome) <= 80),
  existe_resultado INTEGER NOT NULL CHECK (existe_resultado IN (0, 1)),
  srp INTEGER NOT NULL CHECK (srp IN (0, 1)),
  modalidade_id INTEGER CHECK (modalidade_id IS NULL OR (typeof(modalidade_id) = 'integer' AND modalidade_id BETWEEN 1 AND 99)),
  modalidade_nome TEXT CHECK (modalidade_nome IS NULL OR length(modalidade_nome) <= 80),
  amparo_codigo INTEGER CHECK (amparo_codigo IS NULL OR (typeof(amparo_codigo) = 'integer' AND amparo_codigo BETWEEN 1 AND 99999)),
  amparo_nome TEXT CHECK (amparo_nome IS NULL OR length(amparo_nome) <= 200),
  obra TEXT NOT NULL CHECK (obra IN ('sim', 'provavel', 'nao_identificado')),
  numero_compra TEXT CHECK (numero_compra IS NULL OR length(numero_compra) <= 60),
  processo TEXT CHECK (processo IS NULL OR length(processo) <= 120),
  objeto TEXT CHECK (objeto IS NULL OR length(objeto) <= 2000),
  valor_estimado INTEGER CHECK (valor_estimado IS NULL OR (typeof(valor_estimado) = 'integer' AND valor_estimado BETWEEN 0 AND 1000000000000)),
  valor_homologado INTEGER CHECK (valor_homologado IS NULL OR (typeof(valor_homologado) = 'integer' AND valor_homologado BETWEEN 0 AND 1000000000000)),
  data_publicacao TEXT CHECK (data_publicacao IS NULL OR (length(data_publicacao) = 10 AND date(data_publicacao) IS data_publicacao) OR (length(data_publicacao) = 19 AND substr(data_publicacao, 11, 1) = 'T' AND strftime('%Y-%m-%dT%H:%M:%S', data_publicacao) IS data_publicacao)),
  data_abertura TEXT CHECK (data_abertura IS NULL OR (length(data_abertura) = 10 AND date(data_abertura) IS data_abertura) OR (length(data_abertura) = 19 AND substr(data_abertura, 11, 1) = 'T' AND strftime('%Y-%m-%dT%H:%M:%S', data_abertura) IS data_abertura)),
  data_encerramento TEXT CHECK (data_encerramento IS NULL OR (length(data_encerramento) = 10 AND date(data_encerramento) IS data_encerramento) OR (length(data_encerramento) = 19 AND substr(data_encerramento, 11, 1) = 'T' AND strftime('%Y-%m-%dT%H:%M:%S', data_encerramento) IS data_encerramento)),
  data_atualizacao_global TEXT CHECK (data_atualizacao_global IS NULL OR (length(data_atualizacao_global) = 10 AND date(data_atualizacao_global) IS data_atualizacao_global) OR (length(data_atualizacao_global) = 19 AND substr(data_atualizacao_global, 11, 1) = 'T' AND strftime('%Y-%m-%dT%H:%M:%S', data_atualizacao_global) IS data_atualizacao_global)),
  itens_total INTEGER NOT NULL DEFAULT 0 CHECK (typeof(itens_total) = 'integer' AND itens_total BETWEEN 0 AND 100000),
  incompleto INTEGER NOT NULL DEFAULT 0 CHECK (incompleto IN (0, 1)),
  coletado_em TEXT NOT NULL CHECK (substr(coletado_em, -1) = 'Z' AND substr(coletado_em, 11, 1) = 'T' AND length(coletado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', coletado_em) IS substr(coletado_em, 1, 19)),
  PRIMARY KEY (prefeitura_id, vinculo_id),
  FOREIGN KEY (prefeitura_id, vinculo_id) REFERENCES contratacao_pncp (prefeitura_id, id)
);
CREATE TABLE pncp_item (
  prefeitura_id INTEGER NOT NULL,
  vinculo_id TEXT NOT NULL,
  numero_item INTEGER NOT NULL CHECK (typeof(numero_item) = 'integer' AND numero_item BETWEEN 1 AND 99999),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 300),
  material_servico TEXT CHECK (material_servico IS NULL OR material_servico IN ('M', 'S')),
  categoria_id INTEGER CHECK (categoria_id IS NULL OR (typeof(categoria_id) = 'integer' AND categoria_id BETWEEN 1 AND 999)),
  categoria_nome TEXT CHECK (categoria_nome IS NULL OR length(categoria_nome) <= 80),
  criterio_nome TEXT CHECK (criterio_nome IS NULL OR length(criterio_nome) <= 80),
  situacao_id INTEGER NOT NULL CHECK (typeof(situacao_id) = 'integer' AND situacao_id BETWEEN 1 AND 99),
  situacao_nome TEXT CHECK (situacao_nome IS NULL OR length(situacao_nome) <= 80),
  tem_resultado INTEGER NOT NULL CHECK (tem_resultado IN (0, 1)),
  valor_total INTEGER CHECK (valor_total IS NULL OR (typeof(valor_total) = 'integer' AND valor_total BETWEEN 0 AND 1000000000000)),
  PRIMARY KEY (prefeitura_id, vinculo_id, numero_item),
  FOREIGN KEY (prefeitura_id, vinculo_id) REFERENCES pncp_compra (prefeitura_id, vinculo_id)
);
CREATE TABLE pncp_resultado (
  prefeitura_id INTEGER NOT NULL,
  vinculo_id TEXT NOT NULL,
  numero_item INTEGER NOT NULL,
  sequencial_resultado INTEGER NOT NULL CHECK (typeof(sequencial_resultado) = 'integer' AND sequencial_resultado BETWEEN 1 AND 999),
  tipo_pessoa TEXT CHECK (tipo_pessoa IS NULL OR tipo_pessoa IN ('PJ', 'PF', 'PE')),
  fornecedor_ni TEXT CHECK (fornecedor_ni IS NULL OR (coalesce(tipo_pessoa, '') = 'PJ' AND length(fornecedor_ni) = 14 AND substr(fornecedor_ni, 1, 12) NOT GLOB '*[^0-9A-Z]*' AND substr(fornecedor_ni, 13, 2) NOT GLOB '*[^0-9]*')),
  fornecedor_nome TEXT CHECK (fornecedor_nome IS NULL OR length(fornecedor_nome) <= 200),
  ordem_classificacao INTEGER CHECK (ordem_classificacao IS NULL OR (typeof(ordem_classificacao) = 'integer' AND ordem_classificacao BETWEEN 1 AND 999)),
  situacao_id INTEGER CHECK (situacao_id IS NULL OR (typeof(situacao_id) = 'integer' AND situacao_id BETWEEN 1 AND 99)),
  situacao_nome TEXT CHECK (situacao_nome IS NULL OR length(situacao_nome) <= 80),
  valor_homologado INTEGER CHECK (valor_homologado IS NULL OR (typeof(valor_homologado) = 'integer' AND valor_homologado BETWEEN 0 AND 1000000000000)),
  data_resultado TEXT CHECK (data_resultado IS NULL OR (length(data_resultado) = 10 AND date(data_resultado) = data_resultado AND data_resultado BETWEEN '2000-01-01' AND '2100-12-31')),
  motivo_cancelamento TEXT CHECK (motivo_cancelamento IS NULL OR length(motivo_cancelamento) <= 300),
  PRIMARY KEY (prefeitura_id, vinculo_id, numero_item, sequencial_resultado),
  FOREIGN KEY (prefeitura_id, vinculo_id, numero_item) REFERENCES pncp_item (prefeitura_id, vinculo_id, numero_item)
);
CREATE TRIGGER pncp_compra_vinculo_ativo_ins BEFORE INSERT ON pncp_compra
  WHEN NOT EXISTS (SELECT 1 FROM contratacao_pncp v WHERE v.prefeitura_id = NEW.prefeitura_id AND v.id = NEW.vinculo_id AND v.desvinculado_em IS NULL)
  BEGIN SELECT RAISE(ABORT, 'Vínculo inativo'); END;
CREATE TRIGGER pncp_compra_vinculo_ativo_upd BEFORE UPDATE ON pncp_compra
  WHEN NOT EXISTS (SELECT 1 FROM contratacao_pncp v WHERE v.prefeitura_id = NEW.prefeitura_id AND v.id = NEW.vinculo_id AND v.desvinculado_em IS NULL)
  BEGIN SELECT RAISE(ABORT, 'Vínculo inativo'); END;
CREATE TRIGGER pncp_compra_chave_imutavel BEFORE UPDATE OF prefeitura_id, vinculo_id ON pncp_compra BEGIN SELECT RAISE(ABORT, 'Chave do retrato não muda'); END;
CREATE TRIGGER pncp_compra_sem_delete BEFORE DELETE ON pncp_compra BEGIN SELECT RAISE(ABORT, 'Retrato da compra não é apagado'); END;
CREATE TRIGGER pncp_item_vinculo_ativo BEFORE INSERT ON pncp_item
  WHEN NOT EXISTS (SELECT 1 FROM contratacao_pncp v WHERE v.prefeitura_id = NEW.prefeitura_id AND v.id = NEW.vinculo_id AND v.desvinculado_em IS NULL)
  BEGIN SELECT RAISE(ABORT, 'Vínculo inativo'); END;
CREATE TRIGGER pncp_item_sem_update BEFORE UPDATE ON pncp_item BEGIN SELECT RAISE(ABORT, 'Item do retrato é regravado, não alterado'); END;
CREATE TRIGGER pncp_resultado_vinculo_ativo BEFORE INSERT ON pncp_resultado
  WHEN NOT EXISTS (SELECT 1 FROM contratacao_pncp v WHERE v.prefeitura_id = NEW.prefeitura_id AND v.id = NEW.vinculo_id AND v.desvinculado_em IS NULL)
  BEGIN SELECT RAISE(ABORT, 'Vínculo inativo'); END;
CREATE TRIGGER pncp_resultado_sem_update BEFORE UPDATE ON pncp_resultado BEGIN SELECT RAISE(ABORT, 'Resultado do retrato é regravado, não alterado'); END;

-- Histórico próprio do PNCP (cadastro de órgãos, vínculos e coletas). Tipos de E14b já previstos para não reconstruir a tabela.
CREATE TABLE evento_pncp (
  id TEXT PRIMARY KEY,
  prefeitura_id INTEGER NOT NULL REFERENCES prefeitura (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('orgao_cadastrado', 'orgao_editado', 'orgao_desativado', 'orgao_reativado', 'vinculo', 'desvinculo', 'coleta_ok', 'coleta_erro', 'sugestao_aceita', 'sugestao_recusada')),
  contratacao_id TEXT,
  orgao_id TEXT,
  vinculo_id TEXT,
  autor TEXT NOT NULL CHECK (length(autor) BETWEEN 1 AND 254),
  em TEXT NOT NULL CHECK (substr(em, -1) = 'Z' AND substr(em, 11, 1) = 'T' AND length(em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', em) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%S', em) = substr(em, 1, 19)),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 500),
  detalhe TEXT CHECK (detalhe IS NULL OR (length(detalhe) <= 4000 AND json_valid(detalhe) AND json_type(detalhe) = 'object')),
  CHECK (substr(tipo, 1, 6) <> 'orgao_' OR (orgao_id IS NOT NULL AND contratacao_id IS NULL AND vinculo_id IS NULL)),
  CHECK (substr(tipo, 1, 6) = 'orgao_' OR (contratacao_id IS NOT NULL AND vinculo_id IS NOT NULL)),
  FOREIGN KEY (prefeitura_id, contratacao_id) REFERENCES contratacao (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, orgao_id) REFERENCES pncp_orgao (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, vinculo_id) REFERENCES contratacao_pncp (prefeitura_id, id)
);
CREATE INDEX evento_pncp_contratacao_idx ON evento_pncp (prefeitura_id, contratacao_id, em) WHERE contratacao_id IS NOT NULL;
CREATE INDEX evento_pncp_coleta_idx ON evento_pncp (prefeitura_id, tipo, em);
CREATE INDEX evento_pncp_orgao_idx ON evento_pncp (prefeitura_id, orgao_id, em) WHERE orgao_id IS NOT NULL;
CREATE TRIGGER evento_pncp_sem_update BEFORE UPDATE ON evento_pncp BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER evento_pncp_sem_delete BEFORE DELETE ON evento_pncp BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
