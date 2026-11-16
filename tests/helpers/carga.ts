import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { bancoTeste } from './d1.ts';

export function carregarExemplo(sqlite: ReturnType<typeof bancoTeste>['sqlite']) {
 mkdirSync('.tmp', { recursive: true });
 const pasta = mkdtempSync('.tmp/carga-');
 try {
  execFileSync(process.execPath, ['scripts/gerar-sql-carga.ts', '--dados', 'data/exemplo', '--saida', pasta + '/carga.sql', '--dialeto', 'sqlite']);
  const sql = readFileSync(pasta + '/carga.sql', 'utf8');
  assert.doesNotMatch(sql, /BEGIN;|COMMIT;|::jsonb|ARRAY\[/);
  sqlite.exec(sql);
  return sql;
 } finally { rmSync(pasta, { recursive: true }); }
}
