import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { BancoD1, StatementD1 } from '../../src/lib/repositorio/d1.ts';

export function bancoTeste(tipo: 'central' | 'prefeitura' = 'prefeitura') {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys = ON');
 for (const f of readdirSync('db/d1/' + tipo).filter(f => f.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync('db/d1/' + tipo + '/' + f, 'utf8'));
 }
 let emBatch = false;
 class Statement implements StatementD1 {
  sql: string; valores: any[] = [];
  constructor(sql: string) { this.sql = sql; }
  bind(...valores: unknown[]) { const s = new Statement(this.sql); s.valores = valores; return s; }
  async first<T>() { return (sqlite.prepare(this.sql).get(...this.valores) ?? null) as T | null; }
  async all() { if (!/^\s*SELECT\b/i.test(this.sql)) throw new Error('Escrita fora do batch'); return { success: true, results: sqlite.prepare(this.sql).all(...this.valores) }; }
  async run() { if (!emBatch) throw new Error('Escrita fora do batch'); sqlite.prepare(this.sql).run(...this.valores); return { success: true, results: [] }; }
 }
 const db: BancoD1 = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
   sqlite.exec('BEGIN');
   emBatch = true;
   try {
    const results = [];
    for (const s of statements) results.push(await s.run());
    sqlite.exec('COMMIT');
    return results;
   } catch (e) { sqlite.exec('ROLLBACK'); throw e; } finally { emBatch = false; }
  },
 };
 return { db, sqlite };
}
