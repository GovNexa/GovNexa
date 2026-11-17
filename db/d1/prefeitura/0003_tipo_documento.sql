-- Entrega 1.1: tipo do documento. DFD, ETP e TR são de sistema (sempre ativos); os demais nascem desativados e cada prefeitura ativa os seus.
-- Nada se apaga; o documento só aceita tipo ATIVO da MESMA prefeitura; documento removido não muda de tipo.
CREATE TABLE tipo_documento (
 prefeitura_id INTEGER NOT NULL REFERENCES prefeitura(id),
 codigo TEXT NOT NULL CHECK(length(codigo) BETWEEN 2 AND 40 AND codigo NOT GLOB '*[^a-z0-9_]*'),
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 40),
 descricao TEXT CHECK(descricao IS NULL OR length(descricao) <= 120),
 sistema INTEGER NOT NULL DEFAULT 0 CHECK(sistema IN (0,1)),
 ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
 ordem INTEGER NOT NULL DEFAULT 100,
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(prefeitura_id, codigo),
 CHECK(sistema = 0 OR ativo = 1)
);
CREATE TRIGGER tipo_documento_sem_delete BEFORE DELETE ON tipo_documento BEGIN SELECT RAISE(ABORT, 'Tipo de documento não se apaga; desative'); END;
CREATE TRIGGER tipo_documento_chave_fixa BEFORE UPDATE ON tipo_documento
 WHEN NEW.prefeitura_id IS NOT OLD.prefeitura_id OR NEW.codigo IS NOT OLD.codigo OR NEW.sistema IS NOT OLD.sistema
 BEGIN SELECT RAISE(ABORT, 'Código, prefeitura e marca de sistema do tipo não mudam'); END;
CREATE TRIGGER prefeitura_tipos_documento AFTER INSERT ON prefeitura BEGIN
 INSERT OR IGNORE INTO tipo_documento (prefeitura_id, codigo, nome, descricao, sistema, ativo, ordem) VALUES
  (NEW.id, 'dfd', 'DFD', 'Documento de Formalização da Demanda', 1, 1, 10),
  (NEW.id, 'etp', 'ETP', 'Estudo Técnico Preliminar', 1, 1, 20),
  (NEW.id, 'tr', 'TR', 'Termo de Referência', 1, 1, 30),
  (NEW.id, 'mapa_riscos', 'Mapa de riscos', NULL, 0, 0, 40),
  (NEW.id, 'projeto_basico', 'Projeto básico', NULL, 0, 0, 50),
  (NEW.id, 'orcamento_referencia', 'Orçamento de referência', NULL, 0, 0, 60),
  (NEW.id, 'art', 'ART', 'Anotação de Responsabilidade Técnica', 0, 0, 70),
  (NEW.id, 'licenca_ambiental', 'Licença ambiental', NULL, 0, 0, 80);
END;
WITH t(codigo, nome, descricao, sistema, ativo, ordem) AS (VALUES
  ('dfd', 'DFD', 'Documento de Formalização da Demanda', 1, 1, 10),
  ('etp', 'ETP', 'Estudo Técnico Preliminar', 1, 1, 20),
  ('tr', 'TR', 'Termo de Referência', 1, 1, 30),
  ('mapa_riscos', 'Mapa de riscos', NULL, 0, 0, 40),
  ('projeto_basico', 'Projeto básico', NULL, 0, 0, 50),
  ('orcamento_referencia', 'Orçamento de referência', NULL, 0, 0, 60),
  ('art', 'ART', 'Anotação de Responsabilidade Técnica', 0, 0, 70),
  ('licenca_ambiental', 'Licença ambiental', NULL, 0, 0, 80))
INSERT OR IGNORE INTO tipo_documento (prefeitura_id, codigo, nome, descricao, sistema, ativo, ordem)
 SELECT p.id, t.codigo, t.nome, t.descricao, t.sistema, t.ativo, t.ordem FROM prefeitura p CROSS JOIN t;
ALTER TABLE documento ADD COLUMN tipo_codigo TEXT;
CREATE TRIGGER documento_tipo_valido_ins BEFORE INSERT ON documento
 WHEN NEW.tipo_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tipo_documento t WHERE t.prefeitura_id = NEW.prefeitura_id AND t.codigo = NEW.tipo_codigo AND t.ativo = 1)
 BEGIN SELECT RAISE(ABORT, 'Tipo de documento inválido'); END;
CREATE TRIGGER documento_tipo_valido_upd BEFORE UPDATE OF tipo_codigo ON documento
 WHEN NEW.tipo_codigo IS NOT NULL AND NEW.tipo_codigo IS NOT OLD.tipo_codigo AND NOT EXISTS (SELECT 1 FROM tipo_documento t WHERE t.prefeitura_id = NEW.prefeitura_id AND t.codigo = NEW.tipo_codigo AND t.ativo = 1)
 BEGIN SELECT RAISE(ABORT, 'Tipo de documento inválido'); END;
CREATE TRIGGER documento_removido_sem_tipo BEFORE UPDATE OF tipo_codigo ON documento
 WHEN OLD.removido_em IS NOT NULL AND NEW.tipo_codigo IS NOT OLD.tipo_codigo
 BEGIN SELECT RAISE(ABORT, 'Documento removido não muda de tipo'); END;
CREATE INDEX documento_tipo_idx ON documento(prefeitura_id, projeto_id, tipo_codigo) WHERE removido_em IS NULL;
