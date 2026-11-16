CREATE TABLE prefeitura (
  id   integer PRIMARY KEY, -- código IBGE (é o próprio prefeitura_id)
  nome text    NOT NULL,
  uf   char(2) NOT NULL
);

CREATE TABLE projeto (
  prefeitura_id            integer NOT NULL REFERENCES prefeitura (id),
  id                       text    NOT NULL,
  codigo_legado            integer,
  nome                     text    NOT NULL,
  orgao                    text,
  responsavel              text,
  tipo                     text,
  detalhamento             text,
  sei TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sei) AND json_type(sei)='array'),
  observacao               text,
  macroetapa               char(2) CHECK (macroetapa IN ('00','01','02','03','04','05','06')),
  status_projeto           text,
  regiao                   text,
  bairro                   text,
  corredor                 text,
  origem_valor             text,
  tem_projeto              boolean,
  prioridade               text,
  tipo_contratacao         text,
  orgao_contratacao        text,
  solicitacoes_financeiras text,
  valores TEXT CHECK(valores IS NULL OR json_valid(valores)),
  recurso TEXT CHECK(recurso IS NULL OR json_valid(recurso)),
  datas TEXT CHECK(datas IS NULL OR json_valid(datas)),
  por_ano TEXT CHECK(por_ano IS NULL OR json_valid(por_ano)),
  atualizacao TEXT CHECK(atualizacao IS NULL OR json_valid(atualizacao)),
  operacional TEXT CHECK(operacional IS NULL OR json_valid(operacional)),
  pendencias TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pendencias) AND json_type(pendencias)='array'),
  origem TEXT CHECK(origem IS NULL OR json_valid(origem)),
  criado_em                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (prefeitura_id, id)
);
ALTER TABLE projeto ADD COLUMN revisao INTEGER NOT NULL DEFAULT 0;
CREATE INDEX projeto_macroetapa_idx ON projeto (prefeitura_id, macroetapa);

CREATE TABLE evento_projeto (
  id            text PRIMARY KEY,
  prefeitura_id integer     NOT NULL,
  projeto_id    text        NOT NULL,
  tipo          text        NOT NULL,
  origem        text        NOT NULL,
  autor         text        NOT NULL,
  em            TEXT NOT NULL CHECK(substr(em,-1)='Z' AND substr(em,11,1)='T' AND length(em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', em) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%S', em) = substr(em,1,19)),
  de            char(2),
  para          char(2),
  campos TEXT CHECK(campos IS NULL OR json_valid(campos)),
  motivo        text,
  forcado       boolean,
  descricao     text,
  FOREIGN KEY (prefeitura_id, projeto_id) REFERENCES projeto (prefeitura_id, id)
);
CREATE INDEX evento_projeto_projeto_idx ON evento_projeto (prefeitura_id, projeto_id);

CREATE TABLE cronograma (
  prefeitura_id integer NOT NULL REFERENCES prefeitura (id),
  id            text    NOT NULL,
  aba           text,
  titulo        text,
  endereco      text,
  sei TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sei) AND json_type(sei)='array'),
  projeto_id    text,
  casamento     text,
  pendencias TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pendencias) AND json_type(pendencias)='array'),
  PRIMARY KEY (prefeitura_id, id)
);

CREATE TABLE etapa_cronograma (
  prefeitura_id     integer NOT NULL,
  cronograma_id     text    NOT NULL,
  ordem             integer NOT NULL,
  fase              text,
  nome              text    NOT NULL,
  unidade           text,
  responsavel       text,
  situacao_planilha text,
  duracao_prevista  integer,
  inicio_previsto   date,
  fim_previsto      date,
  inicio_real       date,
  fim_real          date,
  status            text,
  ciclo             integer,
  pendencias TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pendencias) AND json_type(pendencias)='array'),
  origem TEXT CHECK(origem IS NULL OR json_valid(origem)),
  PRIMARY KEY (prefeitura_id, cronograma_id, ordem),
  FOREIGN KEY (prefeitura_id, cronograma_id) REFERENCES cronograma (prefeitura_id, id)
);


ALTER TABLE projeto ADD COLUMN compromisso TEXT CHECK(compromisso IN ('decidido','condicionado','ideia'));
ALTER TABLE projeto ADD COLUMN localizacao TEXT CHECK(localizacao IS NULL OR (json_valid(localizacao) AND json_extract(localizacao,'$.tipo') IN ('ponto','trechos')));
CREATE TABLE evento_sistema (
 id TEXT PRIMARY KEY, prefeitura_id INTEGER NOT NULL, tipo TEXT NOT NULL, origem TEXT NOT NULL,
 autor TEXT NOT NULL, em TEXT NOT NULL CHECK(substr(em,-1)='Z' AND substr(em,11,1)='T' AND length(em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', em) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%S', em) = substr(em,1,19)), descricao TEXT, detalhes TEXT CHECK(detalhes IS NULL OR json_valid(detalhes))
);
CREATE INDEX evento_sistema_prefeitura_em_idx ON evento_sistema(prefeitura_id, em);
CREATE INDEX evento_projeto_prefeitura_em_idx ON evento_projeto(prefeitura_id, em);
CREATE VIEW log_alteracoes AS
 SELECT e.id,e.prefeitura_id,e.projeto_id,p.nome AS projeto_nome,e.tipo,e.origem,e.autor,e.em,e.de,e.para,e.campos,e.motivo,e.forcado,e.descricao
 FROM evento_projeto e LEFT JOIN projeto p ON p.prefeitura_id=e.prefeitura_id AND p.id=e.projeto_id
 UNION ALL
 SELECT id,prefeitura_id,coalesce(CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.projeto_id') END,'*'),NULL,tipo,origem,autor,em,
 CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.de') END,CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.para') END,CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.campos') END,
 CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.motivo') END,CASE WHEN json_type(detalhes) IN ('array','object') THEN json_extract(detalhes,'$.forcado') END,descricao FROM evento_sistema;
CREATE TRIGGER evento_projeto_sem_update BEFORE UPDATE ON evento_projeto BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER evento_projeto_sem_delete BEFORE DELETE ON evento_projeto BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER evento_sistema_sem_update BEFORE UPDATE ON evento_sistema BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER evento_sistema_sem_delete BEFORE DELETE ON evento_sistema BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TABLE IF NOT EXISTS projeto_foto (
  prefeitura_id integer     NOT NULL,
  projeto_id    text        NOT NULL,
  id            TEXT        NOT NULL,
  arquivo_chave text        NOT NULL,           -- chave no armazenamento de arquivos (nunca URL pública fixa)
  tipo_mime     text        NOT NULL CHECK (tipo_mime IN ('image/jpeg','image/png','image/webp')),
  tamanho_bytes integer     NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760),
  legenda       text        CHECK (length(legenda) <= 200),
  tirada_em     date,
  capa          boolean     NOT NULL DEFAULT false CHECK(capa IN (0,1)),
  enviada_por   text        NOT NULL,
  enviada_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  removida_em   TEXT,
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, projeto_id) REFERENCES projeto (prefeitura_id, id)
);
CREATE INDEX IF NOT EXISTS projeto_foto_projeto_idx ON projeto_foto (prefeitura_id, projeto_id) WHERE removida_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projeto_foto_uma_capa ON projeto_foto (prefeitura_id, projeto_id) WHERE capa AND removida_em IS NULL;

CREATE TABLE documento (
 id TEXT NOT NULL, prefeitura_id INTEGER NOT NULL, projeto_id TEXT NOT NULL, nome_original TEXT NOT NULL,
 chave_r2 TEXT NOT NULL UNIQUE, tipo_mime TEXT NOT NULL CHECK(length(trim(tipo_mime)) > 0), tamanho_bytes INTEGER NOT NULL CHECK(tamanho_bytes > 0),
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'), enviado_por TEXT NOT NULL, enviado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 removido_em TEXT, PRIMARY KEY(prefeitura_id,id),
 FOREIGN KEY(prefeitura_id,projeto_id) REFERENCES projeto(prefeitura_id,id)
);

CREATE INDEX documento_projeto_idx ON documento(prefeitura_id, projeto_id);
CREATE TRIGGER projeto_foto_sem_delete BEFORE DELETE ON projeto_foto BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
CREATE TRIGGER documento_sem_delete BEFORE DELETE ON documento BEGIN SELECT RAISE(ABORT, 'Remoção só lógica'); END;
