import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.argv.slice(2).length) throw new Error('db:local não aceita argumentos; somente bancos locais.');
mkdirSync('.tmp', { recursive: true });
const env = { ...process.env, TMPDIR: resolve('.tmp'), WRANGLER_LOG_PATH: resolve('.tmp/wrangler.log') };
function executar(comando, args) {
 // shell: true — no Windows `npx` é npx.cmd e sem shell o script saía sem mensagem (como já faz scripts/build-exemplo.mjs).
 const r = spawnSync(comando, args, { stdio: 'inherit', env, shell: true });
 if (r.status !== 0) process.exit(r.status ?? 1);
}
for (const db of ['DB_CENTRAL', 'DB_PREFEITURA_5208707']) executar('npx', ['wrangler', 'd1', 'migrations', 'apply', db, '--local']);
executar('node', ['scripts/gerar-sql-carga.ts', '--dados', 'data/exemplo', '--saida', '.tmp/carga-local.sql', '--dialeto', 'sqlite']);
executar('npx', ['wrangler', 'd1', 'execute', 'DB_PREFEITURA_5208707', '--local', '--file', '.tmp/carga-local.sql']);
// Semente exclusivamente fictícia; nunca lê arquivos de segredos.
const email = (process.env.DEV_EMAIL || 'dev@exemplo.invalid').trim().toLowerCase();
if (!/^[a-z0-9._+-]+@exemplo\.invalid$/.test(email)) throw new Error('Use um e-mail @exemplo.invalid.');
const { hashSenha } = await import('../src/lib/login/senha.ts');
const senha = await hashSenha('Horizonte!local-7264', process.env.SENHA_PEPPER || 'exemplo-local-troque-antes-de-usar');
const sqlEmail = `'${email.replaceAll("'", "''")}'`;
writeFileSync('.tmp/usuario-local.sql', `INSERT INTO usuario(id,email,nome,perfil,prefeitura_id,ativo,senha_hash,senha_definida_em)
 VALUES('dev-local',${sqlEmail},'Administrador local','admin',5208707,1,'${senha}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,perfil='admin',prefeitura_id=5208707,ativo=1,senha_hash=excluded.senha_hash,totp_ativo=0,totp_segredo_cifrado=NULL,totp_ultimo_passo=NULL;
DELETE FROM sessao;
DELETE FROM codigo_recuperacao;
DELETE FROM limite_tentativa;\n`, 'utf8');
executar('npx', ['wrangler', 'd1', 'execute', 'DB_CENTRAL', '--local', '--file', '.tmp/usuario-local.sql']);
