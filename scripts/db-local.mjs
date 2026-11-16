import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.argv.slice(2).length) throw new Error('db:local não aceita argumentos; somente bancos locais.');
mkdirSync('.tmp', { recursive: true });
const env = { ...process.env, TMPDIR: resolve('.tmp'), WRANGLER_LOG_PATH: resolve('.tmp/wrangler.log') };
function executar(comando, args) {
 const r = spawnSync(comando, args, { stdio: 'inherit', env });
 if (r.status !== 0) process.exit(r.status ?? 1);
}
for (const db of ['DB_CENTRAL', 'DB_PREFEITURA_5208707']) executar('npx', ['wrangler', 'd1', 'migrations', 'apply', db, '--local']);
executar('node', ['scripts/gerar-sql-carga.ts', '--dados', 'data/exemplo', '--saida', '.tmp/carga-local.sql', '--dialeto', 'sqlite']);
executar('npx', ['wrangler', 'd1', 'execute', 'DB_PREFEITURA_5208707', '--local', '--file', '.tmp/carga-local.sql']);
// Apenas DEV_EMAIL é consumido; nenhum conteúdo do arquivo é exibido.
const configurado = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8').match(/^DEV_EMAIL\s*=\s*["']?([^\s"'#]+)["']?\s*$/m)?.[1] : undefined;
const email = (process.env.DEV_EMAIL || configurado || 'dev@exemplo.invalid').trim().toLowerCase();
if (!/^[\x21-\x7e]+@[^@]+$/.test(email)) throw new Error('DEV_EMAIL inválido.');
const sqlEmail = `'${email.replaceAll("'", "''")}'`;
writeFileSync('.tmp/usuario-local.sql', `INSERT INTO usuario(id,email,nome,perfil,prefeitura_id,ativo)
 VALUES('dev-local',${sqlEmail},'Administrador local','admin',5208707,1)
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,perfil='admin',prefeitura_id=5208707,ativo=1;\n`, 'utf8');
executar('npx', ['wrangler', 'd1', 'execute', 'DB_CENTRAL', '--local', '--file', '.tmp/usuario-local.sql']);
