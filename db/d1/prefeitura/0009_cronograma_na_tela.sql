-- E13 (áudio 31): o cronograma passa a ser mantido na tela; a planilha é só a carga inicial.
-- ATENÇÃO (administração): os gatilhos *_sem_delete_tela (cronograma e tarefa) impedem também a limpeza administrativa
-- (ex.: apagar uma prefeitura de teste); isso exige uma migração própria que os recrie.
-- 1) cronograma: versão (concorrência otimista), marca "editado na tela" (a carga não altera mais), origem do registro.
ALTER TABLE cronograma ADD COLUMN revisao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cronograma ADD COLUMN editado_na_tela INTEGER NOT NULL DEFAULT 0 CHECK(editado_na_tela IN (0,1));
ALTER TABLE cronograma ADD COLUMN origem_registro TEXT NOT NULL DEFAULT 'planilha' CHECK(origem_registro IN ('planilha','tela'));
ALTER TABLE cronograma ADD COLUMN criado_por TEXT;
ALTER TABLE cronograma ADD COLUMN criado_em TEXT;
ALTER TABLE cronograma ADD COLUMN atualizado_em TEXT;
CREATE INDEX IF NOT EXISTS cronograma_projeto_idx ON cronograma (prefeitura_id, projeto_id) WHERE projeto_id IS NOT NULL;
CREATE TRIGGER cronograma_marca_tela_fixa BEFORE UPDATE OF editado_na_tela ON cronograma
 WHEN OLD.editado_na_tela = 1 AND NEW.editado_na_tela IS NOT 1
 BEGIN SELECT RAISE(ABORT, 'A marca de edição na tela não volta'); END;
CREATE TRIGGER cronograma_sem_delete_tela BEFORE DELETE ON cronograma WHEN OLD.editado_na_tela = 1
 BEGIN SELECT RAISE(ABORT, 'Cronograma editado na tela não se apaga'); END;

-- 2) tarefa (etapa_cronograma): a chave deixa de ser a posição (ordem) e passa a ser um código estável (id).
-- Dados existentes: id = cronograma_id || '#' || ordem (mesma posição de hoje); nada é perdido nem alterado.
CREATE TABLE etapa_cronograma_nova (
  prefeitura_id     integer NOT NULL,
  id                text    NOT NULL CHECK(length(id) BETWEEN 3 AND 120),
  cronograma_id     text    NOT NULL,
  ordem             integer NOT NULL CHECK(ordem <> 0),
  fase              text,
  nome              text    NOT NULL,
  unidade           text,
  responsavel       text,
  situacao_planilha text,
  duracao_prevista  integer CHECK(duracao_prevista IS NULL OR duracao_prevista >= 0),
  inicio_previsto   date    CHECK(inicio_previsto IS NULL OR date(inicio_previsto) IS inicio_previsto),
  fim_previsto      date    CHECK(fim_previsto IS NULL OR date(fim_previsto) IS fim_previsto),
  inicio_real       date    CHECK(inicio_real IS NULL OR date(inicio_real) IS inicio_real),
  fim_real          date    CHECK(fim_real IS NULL OR date(fim_real) IS fim_real),
  status            text,
  ciclo             integer,
  pendencias TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pendencias) AND json_type(pendencias)='array'),
  origem TEXT CHECK(origem IS NULL OR json_valid(origem)),
  origem_registro   TEXT NOT NULL DEFAULT 'planilha' CHECK(origem_registro IN ('planilha','tela')),
  criada_por TEXT, criada_em TEXT, atualizada_por TEXT, atualizada_em TEXT,
  removida_em TEXT, removida_por TEXT,
  motivo_remocao TEXT CHECK(motivo_remocao IS NULL OR length(motivo_remocao) <= 500),
  CHECK(removida_em IS NULL OR removida_por IS NOT NULL),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, cronograma_id) REFERENCES cronograma (prefeitura_id, id)
);
-- Dado antigo inválido NUNCA derruba a migração (Delta 1, item 1): data impossível, duração negativa ou fim antes do início
-- viram NULL e o motivo entra, com o valor original, na coluna "pendencias" da própria linha. Nada some sem registro.
-- (Só 'ordem' fora da regra, p.ex. 0, ainda faz a migração falhar inteira: nada muda.) A lista do que será saneado está em
-- db/d1/prefeitura/checagens/0009-pre.sql (só leitura; rodar antes de publicar).
INSERT INTO etapa_cronograma_nova (prefeitura_id, id, cronograma_id, ordem, fase, nome, unidade, responsavel, situacao_planilha,
  duracao_prevista, inicio_previsto, fim_previsto, inicio_real, fim_real, status, ciclo, pendencias, origem)
 SELECT prefeitura_id, cronograma_id || '#' || ordem, cronograma_id, ordem, fase, nome, unidade, responsavel, situacao_planilha,
  dur, ip, CASE WHEN ip IS NOT NULL AND fp IS NOT NULL AND fp < ip THEN NULL ELSE fp END,
  ir, CASE WHEN ir IS NOT NULL AND fr IS NOT NULL AND fr < ir THEN NULL ELSE fr END,
  status, ciclo,
  (SELECT json_group_array(v) FROM (
     SELECT value AS v FROM json_each(c.pendencias)
     UNION ALL SELECT column1 FROM (VALUES
       (CASE WHEN o_ip IS NOT NULL AND ip IS NULL THEN 'Data não reconhecida na carga: inicio_previsto = ' || o_ip END),
       (CASE WHEN o_fp IS NOT NULL AND fp IS NULL THEN 'Data não reconhecida na carga: fim_previsto = ' || o_fp END),
       (CASE WHEN o_ir IS NOT NULL AND ir IS NULL THEN 'Data não reconhecida na carga: inicio_real = ' || o_ir END),
       (CASE WHEN o_fr IS NOT NULL AND fr IS NULL THEN 'Data não reconhecida na carga: fim_real = ' || o_fr END),
       (CASE WHEN o_dur IS NOT NULL AND dur IS NULL THEN 'Duração negativa na carga: duracao_prevista = ' || o_dur END),
       (CASE WHEN ip IS NOT NULL AND fp IS NOT NULL AND fp < ip THEN 'Fim antes do início na carga: fim_previsto = ' || fp END),
       (CASE WHEN ir IS NOT NULL AND fr IS NOT NULL AND fr < ir THEN 'Fim antes do início na carga: fim_real = ' || fr END)
     ) WHERE column1 IS NOT NULL)),
  origem
 FROM (
  SELECT e.*, e.pendencias AS pend0,
   CASE WHEN inicio_previsto IS NOT NULL AND date(inicio_previsto) IS inicio_previsto THEN inicio_previsto END AS ip,
   CASE WHEN fim_previsto IS NOT NULL AND date(fim_previsto) IS fim_previsto THEN fim_previsto END AS fp,
   CASE WHEN inicio_real IS NOT NULL AND date(inicio_real) IS inicio_real THEN inicio_real END AS ir,
   CASE WHEN fim_real IS NOT NULL AND date(fim_real) IS fim_real THEN fim_real END AS fr,
   CASE WHEN duracao_prevista >= 0 THEN duracao_prevista END AS dur,
   inicio_previsto AS o_ip, fim_previsto AS o_fp, inicio_real AS o_ir, fim_real AS o_fr, duracao_prevista AS o_dur
  FROM etapa_cronograma e
 ) c;
DROP TABLE etapa_cronograma;
ALTER TABLE etapa_cronograma_nova RENAME TO etapa_cronograma;
-- Posição única só entre as tarefas ativas (removidas guardam a posição antiga). Também serve à leitura em ordem.
CREATE UNIQUE INDEX etapa_cronograma_ordem_ativa_uq ON etapa_cronograma (prefeitura_id, cronograma_id, ordem) WHERE removida_em IS NULL;
CREATE TRIGGER etapa_cronograma_chave_fixa BEFORE UPDATE ON etapa_cronograma
 WHEN NEW.prefeitura_id IS NOT OLD.prefeitura_id OR NEW.id IS NOT OLD.id OR NEW.cronograma_id IS NOT OLD.cronograma_id
 BEGIN SELECT RAISE(ABORT, 'Prefeitura, código e cronograma da tarefa não mudam'); END;
CREATE TRIGGER etapa_cronograma_remocao_definitiva BEFORE UPDATE OF removida_em ON etapa_cronograma
 WHEN OLD.removida_em IS NOT NULL AND NEW.removida_em IS NOT OLD.removida_em
 BEGIN SELECT RAISE(ABORT, 'Tarefa removida não volta; inclua uma nova'); END;
CREATE TRIGGER etapa_cronograma_sem_delete_tela BEFORE DELETE ON etapa_cronograma
 WHEN OLD.origem_registro = 'tela' OR EXISTS (SELECT 1 FROM cronograma c WHERE c.prefeitura_id = OLD.prefeitura_id AND c.id = OLD.cronograma_id AND c.editado_na_tela = 1)
 BEGIN SELECT RAISE(ABORT, 'Tarefa de cronograma editado na tela não se apaga; remova pela tela'); END;

-- 3) histórico de responsável da tarefa (cada troca; nada se apaga; correção = nova troca).
CREATE TABLE troca_responsavel (
  prefeitura_id    INTEGER NOT NULL,
  id               TEXT NOT NULL CHECK(length(id) BETWEEN 8 AND 64),
  cronograma_id    TEXT NOT NULL,
  tarefa_id        TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK(tipo IN ('inicial','troca')),
  de_responsavel   TEXT CHECK(de_responsavel IS NULL OR length(de_responsavel) <= 120),
  de_unidade       TEXT CHECK(de_unidade IS NULL OR length(de_unidade) <= 80),
  para_responsavel TEXT CHECK(para_responsavel IS NULL OR length(trim(para_responsavel)) BETWEEN 1 AND 120),
  para_unidade     TEXT CHECK(para_unidade IS NULL OR length(trim(para_unidade)) BETWEEN 1 AND 80),
  desde            TEXT NOT NULL CHECK(length(desde) = 10 AND date(desde) IS desde),
  motivo           TEXT CHECK(motivo IS NULL OR length(motivo) <= 500),
  registrado_por   TEXT NOT NULL CHECK(length(trim(registrado_por)) > 0),
  registrado_em    TEXT NOT NULL CHECK(substr(registrado_em,-1)='Z' AND substr(registrado_em,11,1)='T' AND length(registrado_em) BETWEEN 20 AND 30 AND strftime('%Y-%m-%dT%H:%M:%S', registrado_em) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%S', registrado_em) = substr(registrado_em,1,19)),
  CHECK(para_responsavel IS NOT NULL OR para_unidade IS NOT NULL),
  CHECK(tipo = 'troca' OR (de_responsavel IS NULL AND de_unidade IS NULL)),
  PRIMARY KEY (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, tarefa_id) REFERENCES etapa_cronograma (prefeitura_id, id),
  FOREIGN KEY (prefeitura_id, cronograma_id) REFERENCES cronograma (prefeitura_id, id)
);
CREATE INDEX troca_responsavel_tarefa_idx ON troca_responsavel (prefeitura_id, tarefa_id, desde, registrado_em);
CREATE INDEX troca_responsavel_cronograma_idx ON troca_responsavel (prefeitura_id, cronograma_id);
CREATE TRIGGER troca_responsavel_da_tarefa BEFORE INSERT ON troca_responsavel
 WHEN NOT EXISTS (SELECT 1 FROM etapa_cronograma t WHERE t.prefeitura_id = NEW.prefeitura_id AND t.id = NEW.tarefa_id AND t.cronograma_id = NEW.cronograma_id AND t.removida_em IS NULL)
 BEGIN SELECT RAISE(ABORT, 'Tarefa não pertence ao cronograma'); END;
CREATE TRIGGER troca_responsavel_sem_update BEFORE UPDATE ON troca_responsavel BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
CREATE TRIGGER troca_responsavel_sem_delete BEFORE DELETE ON troca_responsavel BEGIN SELECT RAISE(ABORT, 'Histórico imutável'); END;
