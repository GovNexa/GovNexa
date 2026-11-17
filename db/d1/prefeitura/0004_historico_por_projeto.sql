-- Entrega B1 (página do projeto): o histórico de UM projeto passa a ser lido por índice, na ordem do tempo.
-- Antes, a consulta lia todos os eventos de sistema da prefeitura e abria o texto de cada um para achar o projeto.

-- Eventos de projeto: o índice novo cobre o antigo (mesmas colunas no começo) e já entrega na ordem de `em`.
CREATE INDEX IF NOT EXISTS evento_projeto_projeto_em_idx ON evento_projeto (prefeitura_id, projeto_id, em);
DROP INDEX IF EXISTS evento_projeto_projeto_idx;

-- Eventos de sistema: o projeto fica dentro de `detalhes`. A coluna calculada não ocupa espaço na linha
-- (só no índice) e não pode ser gravada à mão: sempre reflete `detalhes`.
ALTER TABLE evento_sistema ADD COLUMN projeto_id TEXT
  GENERATED ALWAYS AS (CASE WHEN json_type(detalhes) = 'object' THEN json_extract(detalhes, '$.projeto_id') END) VIRTUAL;
CREATE INDEX IF NOT EXISTS evento_sistema_projeto_em_idx ON evento_sistema (prefeitura_id, projeto_id, em) WHERE projeto_id IS NOT NULL;
