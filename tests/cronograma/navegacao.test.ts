import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abaCronograma, rotuloVoltaCronograma, urlCronograma, voltaCronograma } from '../../src/lib/cronograma/navegacao.ts';

const ORIGEM = 'https://exemplo.invalid';

test('voltaCronograma aceita os caminhos internos permitidos', () => {
  for (const v of ['/plataforma/projeto/P-1/?aba=cronograma&volta=%2Fplataforma%2Fprojetos-carteira%2F', '/plataforma/gestao-responsaveis/?pessoa=X', '/plataforma/projetos-cronogramas/']) {
    assert.equal(voltaCronograma(v, ORIGEM), v, v);
  }
});

test('voltaCronograma recusa endereço externo, esquema perigoso, barra invertida, caminho fora da lista e texto enorme', () => {
  for (const v of ['//evil.example/', 'https://evil.example/', '/plataforma\\x', 'javascript:alert(1)', '/plataforma/projeto/' + 'a'.repeat(2001), '/fora/', '', null, undefined, '/plataforma/projeto/P-1/\n']) {
    assert.equal(voltaCronograma(v as string | null, ORIGEM), null, String(v).slice(0, 30));
  }
});

test('rótulos do voltar, aba e endereço do cronograma', () => {
  assert.equal(rotuloVoltaCronograma(null), '← Todos os cronogramas');
  assert.equal(rotuloVoltaCronograma('/plataforma/projeto/P-1/'), '← Voltar para a ficha do projeto');
  assert.equal(rotuloVoltaCronograma('/plataforma/gestao-responsaveis/?pessoa=X'), '← Voltar para Responsáveis');
  assert.equal(abaCronograma('tarefas'), 'tarefas');
  assert.equal(abaCronograma('qualquer'), 'tempo');
  assert.equal(urlCronograma('C-x', { aba: 'tarefas', volta: '/plataforma/gestao-responsaveis/', tarefa: 'C-x#3' }),
    '/plataforma/cronograma/C-x/?aba=tarefas&volta=%2Fplataforma%2Fgestao-responsaveis%2F#t-C-x_3');
  assert.equal(urlCronograma('C-x'), '/plataforma/cronograma/C-x/');
});
