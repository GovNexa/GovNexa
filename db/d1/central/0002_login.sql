ALTER TABLE usuario ADD COLUMN senha_hash TEXT;
ALTER TABLE usuario ADD COLUMN senha_definida_em TEXT;
ALTER TABLE usuario ADD COLUMN totp_segredo_cifrado TEXT;
ALTER TABLE usuario ADD COLUMN totp_ativo INTEGER NOT NULL DEFAULT 0 CHECK(totp_ativo IN (0,1));
ALTER TABLE usuario ADD COLUMN totp_ultimo_passo INTEGER;
ALTER TABLE usuario ADD COLUMN falhas_login INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuario ADD COLUMN bloqueado_ate TEXT;
CREATE TABLE sessao (
 id_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuario(id),
 etapa TEXT NOT NULL CHECK(etapa IN ('segundo_fator','configurar_2fa','completa')),
 criada_em TEXT NOT NULL, expira_em TEXT NOT NULL, ultimo_uso_em TEXT NOT NULL, revogada_em TEXT,
 tentativas_codigo INTEGER NOT NULL DEFAULT 0, agente TEXT
);
CREATE INDEX sessao_usuario ON sessao(usuario_id);
CREATE TABLE token_email (
 id_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuario(id),
 tipo TEXT NOT NULL CHECK(tipo IN ('convite','redefinicao')), criado_em TEXT NOT NULL,
 expira_em TEXT NOT NULL, usado_em TEXT, criado_por TEXT REFERENCES usuario(id)
);
CREATE INDEX token_usuario ON token_email(usuario_id,tipo);
CREATE TABLE codigo_recuperacao (
 id_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuario(id), criado_em TEXT NOT NULL, usado_em TEXT
);
CREATE TABLE limite_tentativa (chave TEXT PRIMARY KEY, janela_inicio TEXT NOT NULL, contagem INTEGER NOT NULL);
CREATE TABLE evento_acesso (
 id INTEGER PRIMARY KEY, usuario_id TEXT, tipo TEXT NOT NULL,
 em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ip TEXT, detalhe TEXT
);
