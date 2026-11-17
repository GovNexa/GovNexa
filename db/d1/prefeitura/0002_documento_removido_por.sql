-- Documentos (etapa 3.4): quem removeu (a remoção continua só lógica: a linha e o arquivo no R2 permanecem)
-- e um índice que impede o mesmo conteúdo ativo duas vezes no mesmo projeto, mesmo em envios simultâneos.
ALTER TABLE documento ADD COLUMN removido_por TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS documento_ativo_sha_uq ON documento (prefeitura_id, projeto_id, sha256) WHERE removido_em IS NULL;
