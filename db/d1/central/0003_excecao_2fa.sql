-- E16 (23/11/2026): dispensa temporária da verificação em 2 etapas, por pessoa.
-- Concedida só por OUTRO administrador da mesma prefeitura (conferido no código), por no máximo 60 dias.
-- Uma linha por pessoa: conceder de novo substitui a anterior; retirar apaga a linha (o registro fica em evento_acesso).
-- Datas no formato de toISOString() (AAAA-MM-DDTHH:MM:SS.sssZ), conferido pelo próprio SQLite.
CREATE TABLE excecao_2fa (
 usuario_id TEXT PRIMARY KEY REFERENCES usuario(id),
 ate TEXT NOT NULL CHECK(coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ate), '') = ate),
 motivo TEXT NOT NULL CHECK(length(motivo) BETWEEN 3 AND 200 AND motivo = trim(motivo) AND instr(motivo, char(0)) = 0),
 concedido_por TEXT NOT NULL REFERENCES usuario(id),
 concedido_em TEXT NOT NULL CHECK(coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', concedido_em), '') = concedido_em),
 CHECK(concedido_por <> usuario_id),
 CHECK(CAST(strftime('%s', ate) AS INTEGER) - CAST(strftime('%s', concedido_em) AS INTEGER) BETWEEN 86400 AND 5184000)
);
CREATE INDEX excecao_2fa_concedido_por ON excecao_2fa(concedido_por);
-- Sessões abertas sem a 2ª etapa: valem só enquanto a dispensa existir e não tiver vencido (conferido a cada pedido).
ALTER TABLE sessao ADD COLUMN via_excecao INTEGER NOT NULL DEFAULT 0 CHECK(via_excecao IN (0,1));
