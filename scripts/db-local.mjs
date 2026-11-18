import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
// Bairros fictícios dos exemplos: mesma situação do arquivo data/exemplo/carteira/geo-bairros.json
// ("Bairro Exemplo" = não encontrado), para os testes de "obras sem localização" continuarem válidos.
// Para ver bolhas por bairro no computador, use LOCAL_GEO_EXEMPLO=1 (pontos fictícios espalhados em Goiânia).
// As migrações acima incluem 0005_bairro_geo.sql.
const carteiraExemplo = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8'));
const bairrosExemplo = [...new Set(carteiraExemplo.projetos.map(p => p.bairro?.trim()).filter(Boolean))];
const escapar = valor => "'" + valor.replaceAll("'", "''") + "'";
writeFileSync('.tmp/bairros-local.sql', bairrosExemplo.map((bairro, indice) =>
 `INSERT INTO bairro_geo(prefeitura_id,bairro,busca,encontrado,lat,lng,fonte,gerado_em)
 VALUES(${carteiraExemplo.prefeitura_id},${escapar(bairro)},${escapar(bairro)},${process.env.LOCAL_GEO_EXEMPLO === '1' ? `1,${-16.72 + 0.08 * (indice + 1) / (bairrosExemplo.length + 1)},${-49.32 + 0.1 * (indice + 1) / (bairrosExemplo.length + 1)}` : '0,NULL,NULL'},'exemplo fictício — centro simulado',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 ON CONFLICT(prefeitura_id,bairro) DO UPDATE SET busca=excluded.busca,encontrado=excluded.encontrado,lat=excluded.lat,lng=excluded.lng,fonte=excluded.fonte,gerado_em=excluded.gerado_em;`
).join('\n'), 'utf8');
executar('npx', ['wrangler', 'd1', 'execute', 'DB_PREFEITURA_5208707', '--local', '--file', '.tmp/bairros-local.sql']);
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
