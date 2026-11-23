-- E12: gestão das contratações (licitações). Só acrescenta tabelas; nada existente muda. Valores em CENTAVOS (inteiros).
-- Datas do dia em 'AAAA-MM-DD' (dia que existe, 2000 a 2100); instantes em ISO UTC com 'Z'. Remoção só lógica; Histórico imutável.
CREATE TABLE contratacao (
  prefeitura_id INTEGER NOT NULL REFERENCES prefeitura (id),
  id TEXT NOT NULL CHECK (length(id) BETWEEN 3 AND 42 AND substr(id, 1, 2) = 'C-' AND substr(id, 3) NOT GLOB '*[^A-Za-z0-9_-]*'),
  projeto_id TEXT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 200),
  objeto TEXT CHECK (objeto IS NULL OR length(objeto) <= 2000),
  orgao TEXT CHECK (orgao IS NULL OR length(orgao) <= 120),
  etapa TEXT NOT NULL CHECK (etapa IN ('finalizacao', 'preparacao', 'ajustes', 'publicada', 'julgamento', 'concluida')),
  etapa_desde TEXT NOT NULL CHECK (length(etapa_desde) = 10 AND date(etapa_desde) = etapa_desde AND etapa_desde BETWEEN '2000-01-01' AND '2100-12-31'),
  modalidade TEXT CHECK (modalidade IS NULL OR modalidade IN ('licitacao', 'adesao_ata', 'dispensa', 'inexigibilidade', 'credenciamento')),
  processo_sei TEXT CHECK (processo_sei IS NULL OR length(processo_sei) <= 40),
  grupo TEXT CHECK (grupo IS NULL OR length(grupo) <= 120),
  valor_estimado INTEGER CHECK (valor_estimado IS NULL OR (typeof(valor_estimado) = 'integer' AND valor_estimado BETWEEN 0 AND 1000000000000)),
  valor_proposta INTEGER CHECK (valor_proposta IS NULL OR (typeof(valor_proposta) = 'integer' AND valor_proposta BETWEEN 0 AND 1000000000000)),
  valor_contratado INTEGER CHECK (valor_contratado IS NULL OR (typeof(valor_contratado) = 'integer' AND valor_contratado BETWEEN 0 AND 1000000000000)),
  valor_pago INTEGER CHECK (valor_pago IS NULL OR (typeof(valor_pago) = 'integer' AND valor_pago BETWEEN 0 AND 1000000000000)),
  empresa TEXT CHECK (empresa IS NULL OR length(empresa) <= 200),
  colocacao INTEGER CHECK (colocacao IS NULL OR (typeof(colocacao) = 'integer' AND colocacao BETWEEN 1 AND 99)),
  marco TEXT CHECK (marco IS NULL OR marco IN ('homologada', 'contrato_assinado', 'os_emitida', 'em_execucao')),
  data_marco TEXT CHECK (data_marco IS NULL OR (length(data_marco) = 10 AND date(data_marco) = data_marco AND data_marco BETWEEN '2000-01-01' AND '2100-12-31')),
  data_abertura TEXT CHECK (data_abertura IS NULL OR (length(data_abertura) = 10 AND date(data_abertura) = data_abertura AND data_abertura BETWEEN '2000-01-01' AND '2100-12-31')),
  data_publicacao_prevista TEXT CHECK (data_publicacao_prevista IS NULL OR (length(data_publicacao_prevista) = 10 AND date(data_publicacao_prevista) = data_publicacao_prevista AND data_publicacao_prevista BETWEEN '2000-01-01' AND '2100-12-31')),
  publicacao_prevista_texto TEXT CHECK (publicacao_prevista_texto IS NULL OR length(publicacao_prevista_texto) <= 200),
  onde_esta TEXT CHECK (onde_esta IS NULL OR length(onde_esta) <= 120),
  situacao TEXT CHECK (situacao IS NULL OR length(situacao) <= 500),
  aguardando TEXT NOT NULL DEFAULT 'nao' CHECK (aguardando IN ('nao', 'pgm', 'outras_areas')),
  aguardando_quem TEXT CHECK (aguardando_quem IS NULL OR length(aguardando_quem) <= 120),
  observacao TEXT CHECK (observacao IS NULL OR length(observacao) <= 2000),
  origem TEXT NOT NULL DEFAULT 'tela' CHECK (origem IN ('tela', 'carga')),
  revisao INTEGER NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  criada_por TEXT NOT NULL CHECK (length(criada_por) BETWEEN 1 AND 254),
  criada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizada_por TEXT CHECK (atualizada_por IS NULL OR length(atualizada_por) BETWEEN 1 AND 254),
  atualizada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  removida_em TEXT,
  removida_por TEXT CHECK (removida_por IS NULL OR length(removida_por) BETWEEN 1 AND 254),
  CHECK ((removida_em IS NULL) = (removida_por IS NULL)),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, projeto_id) REFERENCES projeto (prefeitura_id, id)
);
CREATE INDEX contratacao_etapa_idx ON contratacao (prefeitura_id, etapa) WHERE removida_em IS NULL;
CREATE INDEX contratacao_projeto_idx ON contratacao (prefeitura_id, projeto_id) WHERE projeto_id IS NOT NULL AND removida_em IS NULL;
CREATE TRIGGER contratacao_sem_delete BEFORE DELETE ON contratacao BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
CREATE TRIGGER contratacao_removida_imutavel BEFORE UPDATE ON contratacao WHEN OLD.removida_em IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Contratação removida não muda'); END;
CREATE TRIGGER contratacao_chave_imutavel BEFORE UPDATE OF prefeitura_id, id, criada_por, criada_em, origem ON contratacao BEGIN SELECT RAISE(ABORT, 'Chave da contratação não muda'); END;

CREATE TABLE contratacao_marco (
  prefeitura_id INTEGER NOT NULL,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 3 AND 42 AND substr(id, 1, 2) = 'M-' AND substr(id, 3) NOT GLOB '*[^A-Za-z0-9_-]*'),
  contratacao_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (length(data) = 10 AND date(data) = data AND data BETWEEN '2000-01-01' AND '2100-12-31'),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 200),
  concluido INTEGER NOT NULL DEFAULT 0 CHECK (concluido IN (0, 1)),
  concluido_em TEXT,
  concluido_por TEXT CHECK (concluido_por IS NULL OR length(concluido_por) BETWEEN 1 AND 254),
  criado_por TEXT NOT NULL CHECK (length(criado_por) BETWEEN 1 AND 254),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  removido_em TEXT,
  removido_por TEXT CHECK (removido_por IS NULL OR length(removido_por) BETWEEN 1 AND 254),
  CHECK ((concluido = 1) = (concluido_em IS NOT NULL)),
  CHECK ((concluido_em IS NULL) = (concluido_por IS NULL)),
  CHECK ((removido_em IS NULL) = (removido_por IS NULL)),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, contratacao_id) REFERENCES contratacao (prefeitura_id, id)
);
CREATE INDEX contratacao_marco_lista_idx ON contratacao_marco (prefeitura_id, contratacao_id, data) WHERE removido_em IS NULL;
CREATE INDEX contratacao_marco_pendentes_idx ON contratacao_marco (prefeitura_id, data) WHERE removido_em IS NULL AND concluido = 0;
CREATE TRIGGER contratacao_marco_sem_delete BEFORE DELETE ON contratacao_marco BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
CREATE TRIGGER contratacao_marco_chave_imutavel BEFORE UPDATE OF prefeitura_id, id, contratacao_id, criado_por, criado_em ON contratacao_marco BEGIN SELECT RAISE(ABORT, 'chave do marco é imutável'); END;
CREATE TRIGGER contratacao_marco_removido_imutavel BEFORE UPDATE ON contratacao_marco WHEN OLD.removido_em IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Marco removido não muda'); END;

-- Histórico próprio: há contratações sem projeto (evento_projeto exige projeto) e a leitura por contratação é por índice.
CREATE TABLE evento_contratacao (
  id TEXT PRIMARY KEY,
  prefeitura_id INTEGER NOT NULL,
  contratacao_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('criada', 'carga', 'editada', 'etapa', 'removida', 'marco_criado', 'marco_concluido', 'marco_reaberto', 'marco_removido')),
  autor TEXT NOT NULL CHECK (length(autor) BETWEEN 1 AND 254),
  em TEXT NOT NULL CHECK (substr(em, -1) = 'Z' AND substr(em, 11, 1) = 'T' AND length(em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', em) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%S', em) = substr(em, 1, 19)),
  de TEXT,
  para TEXT,
  campos TEXT CHECK (campos IS NULL OR (json_valid(campos) AND json_type(campos) = 'object')),
  motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 500),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 500),
  CHECK (tipo <> 'etapa' OR (de IN ('finalizacao', 'preparacao', 'ajustes', 'publicada', 'julgamento', 'concluida') AND para IN ('finalizacao', 'preparacao', 'ajustes', 'publicada', 'julgamento', 'concluida') AND de <> para)),
  FOREIGN KEY (prefeitura_id, contratacao_id) REFERENCES contratacao (prefeitura_id, id)
);
CREATE INDEX evento_contratacao_em_idx ON evento_contratacao (prefeitura_id, contratacao_id, em);
CREATE TRIGGER evento_contratacao_sem_update BEFORE UPDATE ON evento_contratacao BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER evento_contratacao_sem_delete BEFORE DELETE ON evento_contratacao BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
