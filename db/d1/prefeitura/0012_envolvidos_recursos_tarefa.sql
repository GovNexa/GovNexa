-- E20 (áudio 31; dono em 23/11/2026: "os envolvidos na tarefa, os recursos utilizados"): por tarefa do cronograma,
-- quem mais está envolvido (além do responsável) e os recursos usados. Só ACRESCENTA tabelas: nada existente muda.
-- Remoção é lógica (removido_em); nada se apaga; o Histórico fica em evento_projeto/evento_sistema (como a E13).
-- A concorrência é a revisão do cronograma (E13). Prefeitura em toda chave; FKs compostas.
-- ATENÇÃO (administração), como na 0009:
-- 1) Reconstruir etapa_cronograma (CREATE nova + INSERT + DROP + RENAME) exige, na mesma migração, apagar e recriar os gatilhos
--    troca_responsavel_*, tarefa_envolvido_* e tarefa_recurso_* (todos consultam etapa_cronograma) e usar
--    PRAGMA defer_foreign_keys = ON (as FKs destas tabelas apontam para etapa_cronograma).
-- 2) Os gatilhos *_sem_delete destas tabelas impedem também a limpeza administrativa (ex.: apagar uma prefeitura de teste);
--    isso exige uma migração própria que os recrie.
CREATE TABLE tarefa_envolvido (
  prefeitura_id  INTEGER NOT NULL,
  id             TEXT NOT NULL CHECK(id GLOB 'E-*' AND length(id) BETWEEN 8 AND 64),
  cronograma_id  TEXT NOT NULL,
  tarefa_id      TEXT NOT NULL,
  nome           TEXT CHECK(nome IS NULL OR length(trim(nome)) BETWEEN 1 AND 120),
  area           TEXT CHECK(area IS NULL OR length(trim(area)) BETWEEN 1 AND 80),
  papel          TEXT CHECK(papel IS NULL OR length(trim(papel)) BETWEEN 1 AND 80),
  observacao     TEXT CHECK(observacao IS NULL OR length(observacao) <= 500),
  criado_por     TEXT NOT NULL CHECK(length(trim(criado_por)) > 0),
  criado_em      TEXT NOT NULL CHECK(substr(criado_em,-1)='Z' AND substr(criado_em,11,1)='T' AND length(criado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', criado_em) IS substr(criado_em,1,19)),
  atualizado_por TEXT CHECK(atualizado_por IS NULL OR length(trim(atualizado_por)) > 0),
  atualizado_em  TEXT CHECK(atualizado_em IS NULL OR (substr(atualizado_em,-1)='Z' AND substr(atualizado_em,11,1)='T' AND length(atualizado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', atualizado_em) IS substr(atualizado_em,1,19))),
  removido_em    TEXT CHECK(removido_em IS NULL OR (substr(removido_em,-1)='Z' AND substr(removido_em,11,1)='T' AND length(removido_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', removido_em) IS substr(removido_em,1,19))),
  removido_por   TEXT CHECK(removido_por IS NULL OR length(trim(removido_por)) > 0),
  motivo_remocao TEXT CHECK(motivo_remocao IS NULL OR length(motivo_remocao) <= 500),
  CHECK(nome IS NOT NULL OR area IS NOT NULL),
  CHECK((removido_em IS NULL) = (removido_por IS NULL)),
  CHECK((atualizado_em IS NULL) = (atualizado_por IS NULL)),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, tarefa_id) REFERENCES etapa_cronograma (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, cronograma_id) REFERENCES cronograma (prefeitura_id, id)
);
CREATE INDEX tarefa_envolvido_tarefa_idx ON tarefa_envolvido (prefeitura_id, tarefa_id, removido_em);
CREATE INDEX tarefa_envolvido_cronograma_idx ON tarefa_envolvido (prefeitura_id, cronograma_id) WHERE removido_em IS NULL;

CREATE TABLE tarefa_recurso (
  prefeitura_id  INTEGER NOT NULL,
  id             TEXT NOT NULL CHECK(id GLOB 'R-*' AND length(id) BETWEEN 8 AND 64),
  cronograma_id  TEXT NOT NULL,
  tarefa_id      TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK(tipo IN ('humano','material','financeiro')),
  descricao      TEXT NOT NULL CHECK(length(trim(descricao)) BETWEEN 1 AND 200),
  quantidade_centesimos INTEGER CHECK(quantidade_centesimos IS NULL OR (typeof(quantidade_centesimos) = 'integer' AND quantidade_centesimos BETWEEN 1 AND 100000000000)),
  unidade        TEXT CHECK(unidade IS NULL OR length(trim(unidade)) BETWEEN 1 AND 30),
  valor_estimado_centavos  INTEGER CHECK(valor_estimado_centavos IS NULL OR (typeof(valor_estimado_centavos) = 'integer' AND valor_estimado_centavos BETWEEN 0 AND 1000000000000)),
  valor_utilizado_centavos INTEGER CHECK(valor_utilizado_centavos IS NULL OR (typeof(valor_utilizado_centavos) = 'integer' AND valor_utilizado_centavos BETWEEN 0 AND 1000000000000)),
  data_uso       TEXT CHECK(data_uso IS NULL OR (length(data_uso) = 10 AND date(data_uso) IS data_uso AND data_uso BETWEEN '2000-01-01' AND '2100-12-31')),
  observacao     TEXT CHECK(observacao IS NULL OR length(observacao) <= 500),
  criado_por     TEXT NOT NULL CHECK(length(trim(criado_por)) > 0),
  criado_em      TEXT NOT NULL CHECK(substr(criado_em,-1)='Z' AND substr(criado_em,11,1)='T' AND length(criado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', criado_em) IS substr(criado_em,1,19)),
  atualizado_por TEXT CHECK(atualizado_por IS NULL OR length(trim(atualizado_por)) > 0),
  atualizado_em  TEXT CHECK(atualizado_em IS NULL OR (substr(atualizado_em,-1)='Z' AND substr(atualizado_em,11,1)='T' AND length(atualizado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', atualizado_em) IS substr(atualizado_em,1,19))),
  removido_em    TEXT CHECK(removido_em IS NULL OR (substr(removido_em,-1)='Z' AND substr(removido_em,11,1)='T' AND length(removido_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', removido_em) IS substr(removido_em,1,19))),
  removido_por   TEXT CHECK(removido_por IS NULL OR length(trim(removido_por)) > 0),
  motivo_remocao TEXT CHECK(motivo_remocao IS NULL OR length(motivo_remocao) <= 500),
  CHECK(unidade IS NULL OR quantidade_centesimos IS NOT NULL),
  CHECK(tipo <> 'financeiro' OR valor_estimado_centavos IS NOT NULL OR valor_utilizado_centavos IS NOT NULL),
  CHECK((removido_em IS NULL) = (removido_por IS NULL)),
  CHECK((atualizado_em IS NULL) = (atualizado_por IS NULL)),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, tarefa_id) REFERENCES etapa_cronograma (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, cronograma_id) REFERENCES cronograma (prefeitura_id, id)
);
CREATE INDEX tarefa_recurso_tarefa_idx ON tarefa_recurso (prefeitura_id, tarefa_id, removido_em);
CREATE INDEX tarefa_recurso_cronograma_idx ON tarefa_recurso (prefeitura_id, cronograma_id) WHERE removido_em IS NULL;

-- Inclusão: só em tarefa ATIVA do mesmo cronograma; limites por tarefa (ativos) e teto de registros (ativos + removidos).
CREATE TRIGGER tarefa_envolvido_da_tarefa BEFORE INSERT ON tarefa_envolvido
 WHEN NOT EXISTS (SELECT 1 FROM etapa_cronograma t WHERE t.prefeitura_id = NEW.prefeitura_id AND t.id = NEW.tarefa_id AND t.cronograma_id = NEW.cronograma_id AND t.removida_em IS NULL)
 BEGIN SELECT RAISE(ABORT, 'Tarefa não pertence ao cronograma'); END;
CREATE TRIGGER tarefa_envolvido_limite BEFORE INSERT ON tarefa_envolvido
 WHEN NEW.removido_em IS NOT NULL
   OR (SELECT count(*) FROM tarefa_envolvido WHERE prefeitura_id = NEW.prefeitura_id AND tarefa_id = NEW.tarefa_id AND removido_em IS NULL) >= 50
   OR (SELECT count(*) FROM tarefa_envolvido WHERE prefeitura_id = NEW.prefeitura_id AND tarefa_id = NEW.tarefa_id) >= 200
 BEGIN SELECT RAISE(ABORT, 'Limite de envolvidos da tarefa'); END;
CREATE TRIGGER tarefa_recurso_da_tarefa BEFORE INSERT ON tarefa_recurso
 WHEN NOT EXISTS (SELECT 1 FROM etapa_cronograma t WHERE t.prefeitura_id = NEW.prefeitura_id AND t.id = NEW.tarefa_id AND t.cronograma_id = NEW.cronograma_id AND t.removida_em IS NULL)
 BEGIN SELECT RAISE(ABORT, 'Tarefa não pertence ao cronograma'); END;
CREATE TRIGGER tarefa_recurso_limite BEFORE INSERT ON tarefa_recurso
 WHEN NEW.removido_em IS NOT NULL
   OR (SELECT count(*) FROM tarefa_recurso WHERE prefeitura_id = NEW.prefeitura_id AND tarefa_id = NEW.tarefa_id AND removido_em IS NULL) >= 200
   OR (SELECT count(*) FROM tarefa_recurso WHERE prefeitura_id = NEW.prefeitura_id AND tarefa_id = NEW.tarefa_id) >= 800
 BEGIN SELECT RAISE(ABORT, 'Limite de recursos da tarefa'); END;

-- Alteração: chave, tarefa e autoria da inclusão não mudam; item removido não muda mais (inclua um novo);
-- item de tarefa removida não muda.
CREATE TRIGGER tarefa_envolvido_chave_fixa BEFORE UPDATE ON tarefa_envolvido
 WHEN NEW.prefeitura_id IS NOT OLD.prefeitura_id OR NEW.id IS NOT OLD.id OR NEW.cronograma_id IS NOT OLD.cronograma_id
   OR NEW.tarefa_id IS NOT OLD.tarefa_id OR NEW.criado_por IS NOT OLD.criado_por OR NEW.criado_em IS NOT OLD.criado_em
 BEGIN SELECT RAISE(ABORT, 'Prefeitura, código, tarefa e inclusão do envolvido não mudam'); END;
CREATE TRIGGER tarefa_envolvido_removido_fixo BEFORE UPDATE ON tarefa_envolvido WHEN OLD.removido_em IS NOT NULL
 BEGIN SELECT RAISE(ABORT, 'Item removido não muda; inclua um novo'); END;
CREATE TRIGGER tarefa_envolvido_tarefa_ativa BEFORE UPDATE ON tarefa_envolvido
 WHEN NOT EXISTS (SELECT 1 FROM etapa_cronograma t WHERE t.prefeitura_id = OLD.prefeitura_id AND t.id = OLD.tarefa_id AND t.removida_em IS NULL)
 BEGIN SELECT RAISE(ABORT, 'Tarefa não pertence ao cronograma'); END;
CREATE TRIGGER tarefa_envolvido_sem_delete BEFORE DELETE ON tarefa_envolvido
 BEGIN SELECT RAISE(ABORT, 'Envolvido não se apaga; remova pela tela'); END;
CREATE TRIGGER tarefa_recurso_chave_fixa BEFORE UPDATE ON tarefa_recurso
 WHEN NEW.prefeitura_id IS NOT OLD.prefeitura_id OR NEW.id IS NOT OLD.id OR NEW.cronograma_id IS NOT OLD.cronograma_id
   OR NEW.tarefa_id IS NOT OLD.tarefa_id OR NEW.criado_por IS NOT OLD.criado_por OR NEW.criado_em IS NOT OLD.criado_em
 BEGIN SELECT RAISE(ABORT, 'Prefeitura, código, tarefa e inclusão do recurso não mudam'); END;
CREATE TRIGGER tarefa_recurso_removido_fixo BEFORE UPDATE ON tarefa_recurso WHEN OLD.removido_em IS NOT NULL
 BEGIN SELECT RAISE(ABORT, 'Item removido não muda; inclua um novo'); END;
CREATE TRIGGER tarefa_recurso_tarefa_ativa BEFORE UPDATE ON tarefa_recurso
 WHEN NOT EXISTS (SELECT 1 FROM etapa_cronograma t WHERE t.prefeitura_id = OLD.prefeitura_id AND t.id = OLD.tarefa_id AND t.removida_em IS NULL)
 BEGIN SELECT RAISE(ABORT, 'Tarefa não pertence ao cronograma'); END;
CREATE TRIGGER tarefa_recurso_sem_delete BEFORE DELETE ON tarefa_recurso
 BEGIN SELECT RAISE(ABORT, 'Recurso não se apaga; remova pela tela'); END;
