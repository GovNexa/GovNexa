CREATE TABLE prefeitura (
 id INTEGER PRIMARY KEY, codigo_ibge INTEGER NOT NULL UNIQUE, nome TEXT NOT NULL, uf TEXT NOT NULL,
 binding_d1 TEXT NOT NULL CHECK(binding_d1 = 'DB_PREFEITURA_' || codigo_ibge) CHECK(id = codigo_ibge), ativa INTEGER NOT NULL DEFAULT 1 CHECK(ativa IN (0,1))
);
CREATE TABLE usuario (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE CHECK(email = lower(email) AND length(email) > 0 AND email NOT GLOB '*[^!-~]*' AND instr(email, char(0)) = 0), nome TEXT NOT NULL, cargo TEXT,
 perfil TEXT NOT NULL CHECK(perfil IN ('admin','gestor','editor','leitura')),
 prefeitura_id INTEGER NOT NULL REFERENCES prefeitura(id), ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE importacao (
 id TEXT PRIMARY KEY, prefeitura_id INTEGER NOT NULL REFERENCES prefeitura(id), tipo TEXT NOT NULL, arquivo TEXT NOT NULL,
 autor TEXT NOT NULL, iniciado_em TEXT NOT NULL, concluido_em TEXT, incluidos INTEGER NOT NULL DEFAULT 0,
 alterados INTEGER NOT NULL DEFAULT 0, retirados INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('ok','erro','em_andamento')), mensagem TEXT
);
INSERT INTO prefeitura(id,codigo_ibge,nome,uf,binding_d1,ativa)
 VALUES(5208707,5208707,'Goiânia','GO','DB_PREFEITURA_5208707',1);
