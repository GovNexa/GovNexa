-- E1: área e marca de prioritário do projeto, e catálogo por prefeitura (área, órgão, região).
-- Só acrescenta: nenhuma coluna ou linha existente é alterada. Projetos antigos ficam sem área (nula) e não prioritários (0).
-- A lista de áreas abaixo é genérica e provisória (decisão D2 do dono, 22/11/2026): a lista oficial substitui esta quando chegar.
CREATE TABLE catalogo (
 prefeitura_id INTEGER NOT NULL REFERENCES prefeitura(id),
 tipo TEXT NOT NULL CHECK(tipo IN ('area','orgao','regiao')),
 codigo TEXT NOT NULL CHECK(length(codigo) BETWEEN 2 AND 40 AND codigo NOT GLOB '*[^a-z0-9_]*'),
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 80),
 ordem INTEGER NOT NULL DEFAULT 100,
 ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(prefeitura_id, tipo, codigo)
);
CREATE TRIGGER catalogo_sem_delete BEFORE DELETE ON catalogo BEGIN SELECT RAISE(ABORT, 'Item de catálogo não se apaga; desative'); END;
CREATE TRIGGER catalogo_chave_fixa BEFORE UPDATE ON catalogo
 WHEN NEW.prefeitura_id IS NOT OLD.prefeitura_id OR NEW.tipo IS NOT OLD.tipo OR NEW.codigo IS NOT OLD.codigo
 BEGIN SELECT RAISE(ABORT, 'Prefeitura, tipo e código do catálogo não mudam'); END;
CREATE TRIGGER prefeitura_areas_padrao AFTER INSERT ON prefeitura BEGIN
 INSERT OR IGNORE INTO catalogo (prefeitura_id, tipo, codigo, nome, ordem) VALUES
  (NEW.id, 'area', 'saude', 'Saúde', 10),
  (NEW.id, 'area', 'educacao', 'Educação', 20),
  (NEW.id, 'area', 'assistencia_social', 'Assistência social', 30),
  (NEW.id, 'area', 'drenagem', 'Drenagem', 40),
  (NEW.id, 'area', 'parques_e_lazer', 'Parques e lazer', 50),
  (NEW.id, 'area', 'cultura', 'Cultura', 60),
  (NEW.id, 'area', 'mobilidade_urbana', 'Mobilidade urbana', 70),
  (NEW.id, 'area', 'habitacao', 'Habitação', 80),
  (NEW.id, 'area', 'esporte', 'Esporte', 90),
  (NEW.id, 'area', 'administracao', 'Administração', 100),
  (NEW.id, 'area', 'outros', 'Outros', 110);
END;
WITH a(codigo, nome, ordem) AS (VALUES
  ('saude', 'Saúde', 10), ('educacao', 'Educação', 20), ('assistencia_social', 'Assistência social', 30),
  ('drenagem', 'Drenagem', 40), ('parques_e_lazer', 'Parques e lazer', 50), ('cultura', 'Cultura', 60),
  ('mobilidade_urbana', 'Mobilidade urbana', 70), ('habitacao', 'Habitação', 80), ('esporte', 'Esporte', 90),
  ('administracao', 'Administração', 100), ('outros', 'Outros', 110))
INSERT OR IGNORE INTO catalogo (prefeitura_id, tipo, codigo, nome, ordem)
 SELECT p.id, 'area', a.codigo, a.nome, a.ordem FROM prefeitura p CROSS JOIN a;
ALTER TABLE projeto ADD COLUMN area TEXT;
ALTER TABLE projeto ADD COLUMN prioritario INTEGER NOT NULL DEFAULT 0 CHECK(prioritario IN (0,1));
-- A área gravada precisa ser uma área ATIVA do catálogo da MESMA prefeitura. Área já gravada que for desativada depois
-- continua no projeto (o gatilho só confere quando a área muda).
CREATE TRIGGER projeto_area_valida_ins BEFORE INSERT ON projeto
 WHEN NEW.area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalogo c WHERE c.prefeitura_id = NEW.prefeitura_id AND c.tipo = 'area' AND c.codigo = NEW.area AND c.ativo = 1)
 BEGIN SELECT RAISE(ABORT, 'Área inválida'); END;
CREATE TRIGGER projeto_area_valida_upd BEFORE UPDATE OF area ON projeto
 WHEN NEW.area IS NOT NULL AND NEW.area IS NOT OLD.area AND NOT EXISTS (SELECT 1 FROM catalogo c WHERE c.prefeitura_id = NEW.prefeitura_id AND c.tipo = 'area' AND c.codigo = NEW.area AND c.ativo = 1)
 BEGIN SELECT RAISE(ABORT, 'Área inválida'); END;
