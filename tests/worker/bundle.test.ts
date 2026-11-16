import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('Bundle público não contém nomes dos projetos da plataforma', t => {
  if (!existsSync('dist')) {
    console.warn('Aviso: dist/ ausente; teste do bundle ignorado. Execute npm run build.');
    t.skip('dist/ ausente');
    return;
  }
  const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as { projetos: { nome: string }[] };
  function verificar(pasta: string): void {
    for (const item of readdirSync(pasta, { withFileTypes: true })) {
      const arquivo = join(pasta, item.name);
      if (item.isDirectory()) verificar(arquivo);
      else {
        const conteudo = readFileSync(arquivo, 'utf8');
        for (const { nome } of carteira.projetos) assert.ok(!conteudo.includes(nome), `Dados da plataforma em ${arquivo}: ${nome}`);
      }
    }
  }
  verificar('dist/_astro');
});
