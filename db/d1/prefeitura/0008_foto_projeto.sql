-- E9: fotos da obra. Reaproveita a tabela projeto_foto, criada vazia na 0001 (tipos JPEG/PNG/WEBP, até 10 MB, legenda até 200,
-- data da foto, remoção só lógica e gatilho que proíbe DELETE). Só acrescenta: nenhuma linha existente é alterada.
-- removida_por: quem removeu (como em documento, 0002). sha256: conteúdo, para recusar a mesma foto ativa duas vezes no projeto.
ALTER TABLE projeto_foto ADD COLUMN removida_por TEXT;
ALTER TABLE projeto_foto ADD COLUMN sha256 TEXT CHECK(sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'));
CREATE UNIQUE INDEX IF NOT EXISTS projeto_foto_ativa_sha_uq ON projeto_foto (prefeitura_id, projeto_id, sha256) WHERE removida_em IS NULL AND sha256 IS NOT NULL;
-- Limite de envios por pessoa por hora: contagem por índice, sem ler as fotos de todos.
CREATE INDEX IF NOT EXISTS projeto_foto_autor_idx ON projeto_foto (prefeitura_id, enviada_por, enviada_em);
-- Lista da aba Fotos: mais recentes primeiro, só as ativas.
CREATE INDEX IF NOT EXISTS projeto_foto_lista_idx ON projeto_foto (prefeitura_id, projeto_id, enviada_em) WHERE removida_em IS NULL;
