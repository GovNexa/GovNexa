import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
// A rota importa 'cloudflare:workers', que o Node não conhece: o caso roda em processo filho com um stub local do módulo.
test('acao.ts de Usuários: limitador que recusa devolve erro=limite (processo filho)', () => {
 const r = spawnSync(process.execPath, ['--import', './tests/login/registrar-stub.mjs', '--test', 'tests/login/acao-limite.inner.ts'], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
 assert.equal(r.status, 0, r.stdout + r.stderr);
});
