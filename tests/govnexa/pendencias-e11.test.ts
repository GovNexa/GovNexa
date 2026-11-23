// Pendências pequenas das revisões anteriores, fechadas na E11: 403 do CSV pela própria rota, proteção do CSV com espaço
// antes do sinal de fórmula, áreas do catálogo no mapa da Gestão e links de localização indo para a aba da ficha.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Carteira } from '../../src/lib/carteira/tipos.ts';
import { detalheProjeto } from '../../src/lib/carteira/modulos.ts';
import { celula } from '../../src/lib/log/visoes.ts';
import { GET } from '../../src/pages/plataforma/gestao-inconsistencias/csv.ts';
import type { Perfil, Usuario } from '../../src/lib/usuarios/index.ts';

process.env.GOVNEXA_EXEMPLO = '1';
const usuario = (perfil: Perfil, ativo = true): Usuario => ({ id: `u-${perfil}`, email: `${perfil}@exemplo.invalid`, nome: perfil, cargo: null, perfil, prefeitura_id: 5208707, ativo, criado_em: '', atualizado_em: '' });
const csv = (u: Usuario | null) => (GET as unknown as (c: unknown) => Promise<Response>)({ locals: { usuario: u }, url: new URL('http://127.0.0.1/plataforma/gestao-inconsistencias/csv/?orgao=x') });

test('CSV de inconsistências: a própria rota responde 403 ao perfil leitura, sem sessão e a conta inativa', async () => {
  for (const u of [usuario('leitura'), null, usuario('admin', false)]) {
    const r = await csv(u);
    assert.equal(r.status, 403, u?.perfil ?? 'sem sessão');
    assert.equal(await r.text(), 'Sem permissão.');
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    assert.match(r.headers.get('Content-Type') ?? '', /^text\/plain/);
    assert.equal(r.headers.get('Content-Disposition'), null);
  }
});

test('CSV de inconsistências: editor recebe o arquivo, como anexo e sem cache', async () => {
  const r = await csv(usuario('editor'));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type') ?? '', /^text\/csv/);
  assert.match(r.headers.get('Content-Disposition') ?? '', /^attachment; filename="inconsistencias-govnexa-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
});

test('CSV: sinal de fórmula também é protegido depois de espaços, tabulação, quebra de linha e na forma larga', () => {
  for (const perigoso of [' =1+1', '   +SOMA(A1)', ' -2', '  @cmd', '\t=1', '\r=1', '\n=1', ' =1', '＝1+1', ' ＋1', '=1', '+1', '-1', '@x']) {
    assert.ok(celula(perigoso).startsWith('"\''), JSON.stringify(perigoso));
  }
  for (const seguro of ['Obra = 1', 'texto', ' texto com espaço', '1-2', 'a@b']) {
    assert.equal(celula(seguro), `"${seguro}"`, seguro);
  }
  assert.equal(celula(' ="a"'), `"' =""a"""`);
});

test('mapa da Gestão usa as áreas do catálogo da prefeitura (como a tela do prefeito)', () => {
  const fonte = readFileSync('src/components/gestao/PainelPrefeito.astro', 'utf8');
  assert.match(fonte, /areas = await areasDaPrefeitura\(Astro\.locals\.repositorio\)/);
  assert.match(fonte, /obrasDoMapa\(carteira, geo, hoje, \{ areas \}\)/);
  assert.match(fonte, /obrasSemLocal\(carteira, geo, hoje, \{ areas \}\)/);
});

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('nenhum link interno manda o projeto para o endereço antigo de localização; o atalho vai à aba Localização da ficha', () => {
  const comId = arquivos('src').filter((a) => /\.(astro|ts)$/.test(a)).filter((a) => readFileSync(a, 'utf8').includes('projetos-localizacao/?id='));
  assert.deepEqual(comId, []);
  assert.equal(existsSync('src/components/mapa/LocalizacaoProjeto.astro'), false);
  assert.ok(!readFileSync('src/pages/plataforma/[...module].astro', 'utf8').includes('LocalizacaoProjeto'));
  assert.match(readFileSync('src/components/mapa/MapaObras.astro', 'utf8'), /el\('a', 'Localização'\);\r?\n\s+editar\.href = hrefFicha\(obra\.id, voltaMapa\(\), 'localizacao'\);/);

  const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
  const p = carteira.projetos[0];
  const links = detalheProjeto(p, true, 'exemplo.json', '2026-11-22').links ?? [];
  assert.deepEqual(links.filter((l) => l.rotulo.startsWith('Localização')), [{ rotulo: 'Localização', url: `/plataforma/projeto/${encodeURIComponent(p.id)}/?aba=localizacao` }]);
});
