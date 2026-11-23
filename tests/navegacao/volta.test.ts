import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aquiDe, comVolta, nomeTela, voltaSegura } from '../../src/lib/navegacao/volta.ts';
import { hrefFicha, linkFicha, rotuloVolta } from '../../src/lib/carteira/ficha.ts';
import { destinoDocumentos } from '../../src/lib/documentos/mensagens.ts';

const O = 'http://127.0.0.1:4321';

test('volta: aceita telas internas e devolve igual', () => {
  for (const ok of ['/plataforma/', '/plataforma/projetos-parado/?orgao=SMS', '/plataforma/projetos-sala/', '/plataforma/cronograma/C-exemplo-001/', '/plataforma/gestao/?sel=obra%3AP-905#mapa']) {
    assert.equal(voltaSegura(ok, O), ok, ok);
  }
});

test('volta: recusa redirecionamento aberto, rotas que não são tela e texto inválido', () => {
  const ruins: (string | null)[] = [
    'https://externo.example/plataforma/', '//externo.example/plataforma/', '/\externo.example/', 'javascript:alert(1)', '/entrar/',
    '/plataforma/../entrar/', '/plataforma/%2e%2e/entrar/', '/plataforma//externo/', '/plataforma/projetos-carteira',
    '/plataforma/projeto/editar/P-1/', '/plataforma/documentos-projeto/arquivo/x/', '/plataforma/fotos-projeto/foto/x/',
    '/plataforma/gestao-inconsistencias/csv/', '/plataforma/agenda.ics', '/plataforma/x\r\nSet-Cookie:a=b/', '/plataforma/' + 'x'.repeat(2001), '', null,
  ];
  for (const ruim of ruins) assert.equal(voltaSegura(ruim, O), null, String(ruim));
});

test('volta: avisos passageiros saem', () => {
  assert.equal(voltaSegura('/plataforma/projeto/P-1/?salvo=1&aba=fotos&rf=enviada', O), '/plataforma/projeto/P-1/?aba=fotos');
});

test('volta: no máximo 2 níveis e volta interna maliciosa some', () => {
  const n1 = hrefFicha('P-1', '/plataforma/gestao/?sel=x', 'cronograma');
  assert.equal(voltaSegura(n1, O), n1);
  const n2 = '/plataforma/cronograma/C-1/?volta=' + encodeURIComponent(n1);
  const r = voltaSegura(n2, O)!;
  assert.equal(new URL(r, O).searchParams.get('volta'), '/plataforma/projeto/P-1/?aba=cronograma');
  assert.equal(voltaSegura('/plataforma/projetos-sala/?volta=https%3A%2F%2Fx', O), '/plataforma/projetos-sala/');
});

test('volta: aquiDe cai para o caminho sem filtros quando passa do limite', () => {
  assert.equal(aquiDe(new URL(O + '/plataforma/projetos-carteira/?q=' + 'a'.repeat(2100))), '/plataforma/projetos-carteira/');
});

test('volta: comVolta', () => {
  assert.equal(comVolta('/plataforma/cronograma/C-1/', '/plataforma/?a=1'), '/plataforma/cronograma/C-1/?volta=%2Fplataforma%2F%3Fa%3D1');
  assert.equal(comVolta('https://sei.example/', '/plataforma/'), 'https://sei.example/');
  assert.equal(comVolta('/plataforma/x/', null), '/plataforma/x/');
});

test('volta: nomeTela', () => {
  assert.equal(nomeTela('/plataforma/'), 'Projetos prioritários');
  assert.equal(nomeTela('/plataforma/gestao/?x=1'), 'Mapa e painel');
  assert.equal(nomeTela('/plataforma/projeto/P-900/?aba=fotos'), 'a ficha do projeto P-900');
  assert.equal(nomeTela('/plataforma/projeto/%3Cb%3E/'), 'a ficha do projeto');
  assert.equal(nomeTela('/plataforma/zzz/'), 'a tela anterior');
});

test('volta: rótulo do X e linkFicha', () => {
  assert.equal(rotuloVolta('/plataforma/projetos-parado/'), 'Fechar e voltar para Onde está parado');
  assert.equal(rotuloVolta('/plataforma/gestao/'), 'Fechar e voltar ao mapa');
  assert.equal(rotuloVolta(null), 'Fechar e voltar à Carteira');
  const volta = '/plataforma/projeto/P-1/?aba=cronograma&volta=%2Fplataforma%2F';
  assert.equal(linkFicha('P-1', volta, '/plataforma/cronograma/C-1/', 'cronograma'), volta);
  const aqui = '/plataforma/cronograma/C-1/';
  assert.equal(linkFicha('P-1', '/plataforma/gestao/', aqui, 'cronograma'), hrefFicha('P-1', aqui, 'cronograma'));
});

test('volta: destinoDocumentos revalida a volta', () => {
  assert.equal(destinoDocumentos('P-1', 'ok', 'https://x', O), '/plataforma/documentos-projeto/projeto/P-1/?r=ok');
  const v = '/plataforma/projeto/P-1/?aba=documentos';
  assert.equal(new URL(destinoDocumentos('P-1', 'ok', v, O), O).searchParams.get('volta'), v);
});
