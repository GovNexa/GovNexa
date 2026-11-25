process.env.GOVNEXA_EXEMPLO = '1'; // usa os dados fictícios de data/exemplo, não a carga real
// Equivalência da situação de prazo (texto) com a regra antiga de três cores: quem entra na pauta, na sala, no painel e no WhatsApp não muda.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { prazoVencido, situacaoPrazoDe, textoDias } from '../../src/lib/carteira/prazo.ts';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import { fimDaMacroetapaAtual, situacaoPrazo } from '../../src/lib/carteira/visoes.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const DATAS = ['2026-01-01', '2026-11-23', '2027-06-30', '2028-01-01', '2029-12-31'];
const dias = (de: string, ate: string): number => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

/** Regra anterior (três cores), copiada só para provar a equivalência. */
function regraAntiga(p: Projeto, hoje: string): 'vermelho' | 'amarelo' | 'verde' {
  const fim = fimDaMacroetapaAtual(p);
  if (p.macroetapa !== '06') {
    if (fim && fim < hoje) return 'vermelho';
    if (p.datas.encerramento && p.datas.encerramento < hoje) return 'vermelho';
  }
  if (p.pendencias.length) return 'amarelo';
  if (p.macroetapa !== '06' && fim && dias(hoje, fim) <= 15) return 'amarelo';
  return 'verde';
}

test('a situação de prazo separa os mesmos projetos que a regra antiga em 5 datas', () => {
  assert.ok(carteira.projetos.length > 0);
  for (const hoje of DATAS) {
    for (const p of carteira.projetos) {
      const s = situacaoPrazo(p, hoje);
      const antiga = regraAntiga(p, hoje);
      assert.equal(prazoVencido(s.codigo), antiga === 'vermelho', `${p.id} em ${hoje}`);
      assert.equal(s.codigo === 'dados-incompletos' || s.codigo === 'etapa-vencendo', antiga === 'amarelo', `${p.id} em ${hoje}`);
      assert.equal(s.codigo === 'no-prazo', antiga === 'verde', `${p.id} em ${hoje}`);
    }
  }
});

test('textos com número de dias e singular', () => {
  assert.equal(textoDias(1), '1 dia');
  assert.equal(textoDias(12), '12 dias');
  const base = { macroetapa: '01', fimEtapa: null, encerramento: null, pendencias: 0 };
  assert.equal(situacaoPrazoDe({ ...base, fimEtapa: '2026-11-03' }, '2026-11-15').texto, 'Prazo da macroetapa vencido há 12 dias');
  assert.equal(situacaoPrazoDe({ ...base, encerramento: '2026-11-12' }, '2026-11-15').texto, 'Entrega prevista vencida há 3 dias');
  assert.equal(situacaoPrazoDe({ ...base, fimEtapa: '2026-11-20' }, '2026-11-15').texto, 'Prazo da macroetapa vence em 5 dias');
  assert.equal(situacaoPrazoDe({ ...base, pendencias: 2 }, '2026-11-15').texto, 'Dados incompletos: 2 pendências');
  assert.equal(situacaoPrazoDe({ ...base, macroetapa: '06', fimEtapa: '2020-01-01' }, '2026-11-15').codigo, 'no-prazo');
});

test('limites do prazo próximo, entrega vencida e concluído com pendência', () => {
  const hoje = '2026-11-15';
  const base = { macroetapa: '01', fimEtapa: null as string | null, encerramento: null as string | null, pendencias: 0 };
  assert.equal(situacaoPrazoDe({ ...base, fimEtapa: '2026-11-30' }, hoje).codigo, 'etapa-vencendo'); // hoje + 15
  assert.equal(situacaoPrazoDe({ ...base, fimEtapa: '2026-12-01' }, hoje).codigo, 'no-prazo'); // hoje + 16
  const entrega = situacaoPrazoDe({ ...base, fimEtapa: '2027-06-01', encerramento: '2026-11-14' }, hoje);
  assert.equal(entrega.codigo, 'entrega-vencida');
  assert.equal(prazoVencido(entrega.codigo), true);
  assert.equal(situacaoPrazoDe({ ...base, macroetapa: '06', pendencias: 1 }, hoje).codigo, 'dados-incompletos');
});
