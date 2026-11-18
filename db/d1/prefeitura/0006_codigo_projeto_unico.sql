-- B2: o código do projeto (P-<número>) nunca se repete dentro da prefeitura.
-- Duas pessoas cadastrando ao mesmo tempo recebiam o mesmo próximo número (maior código + 1); a chave (prefeitura_id, id) já
-- recusava o segundo, mas com mensagem de chave primária. Este índice garante a regra também sobre o número e permite achar
-- o projeto por ele. Parcial: projetos sem número (nulo) continuam permitidos. Não altera nenhum dado.
CREATE UNIQUE INDEX IF NOT EXISTS projeto_codigo_unico ON projeto (prefeitura_id, codigo_legado) WHERE codigo_legado IS NOT NULL;
