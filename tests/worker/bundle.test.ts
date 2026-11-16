import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('Configuração publicada não habilita acesso local nem bindings não usados', () => {
 for (const arquivo of ['wrangler.jsonc', 'dist/server/wrangler.json']) {
  if (!existsSync(arquivo)) {
   assert.equal(arquivo, 'dist/server/wrangler.json');
   continue;
  }
  const texto = readFileSync(arquivo, 'utf8');
  assert.doesNotMatch(texto, /ACESSO_LOCAL_LIVRE|DEV_EMAIL/);
  if (arquivo.endsWith('.json')) {
   const config = JSON.parse(texto);
   assert.equal(config.kv_namespaces?.length ?? 0, 0);
   assert.equal(config.images, undefined);
  }
 }
});

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
  verificar(existsSync('dist/client/_astro') ? 'dist/client/_astro' : 'dist/_astro');
});

test('Nenhum HTML da plataforma pode ser pré-renderizado em dist', t => {
 if (!existsSync('dist')) return t.skip('Execute npm run build.');
 function verificar(pasta: string): void {
  for (const item of readdirSync(pasta, {withFileTypes:true})) {
   const arquivo = join(pasta,item.name);
   if (item.isDirectory()) verificar(arquivo);
   else if (/\.html$/i.test(item.name)) assert.ok(!arquivo.split('/').includes('plataforma'), arquivo);
  }
 }
 verificar('dist');
});
