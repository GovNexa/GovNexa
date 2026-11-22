// Gera SQL de carga local para PostgreSQL (padrão) ou D1/SQLite (--dialeto sqlite);
// o arquivo gerado contém dados da prefeitura e NÃO vai para o repositório.
//   node scripts/gerar-sql-carga.ts --dados <pasta> --saida <arquivo.sql> [--nome "Goiânia"] [--uf GO] [--dialeto postgres|sqlite] [--sem-historico]
// A pasta pode ter carteira.json (e cronogramas.json, historico.json) direto nela ou em carteira/, cronogramas/ e historico/.
// Histórico: registros de projeto presentes na carteira vão para evento_projeto; os demais (carga da planilha, projetos
// retirados) vão para evento_sistema. Os dois são imutáveis: ON CONFLICT (id) DO NOTHING (rodar de novo não duplica).
// Escape: texto entre aspas simples DUPLICANDO as aspas simples (padrão SQL; com standard_conforming_strings=on,
// que é o padrão do PostgreSQL, a barra invertida é literal). Caractere NUL é recusado. jsonb = literal escapado + ::jsonb;
// arrays = ARRAY[...]::text[]. Tudo em uma transação, idempotente (ON CONFLICT ... DO UPDATE).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Carteira } from '../src/lib/carteira/tipos.ts';
import type { Cronogramas } from '../src/lib/cronograma/tipos.ts';
import type { RegistroLog } from '../src/lib/log/tipos.ts';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dialeto = arg('dialeto') ?? 'postgres';
if (!['postgres', 'sqlite'].includes(dialeto)) throw new Error('Dialeto inválido.');
const sqlite = dialeto === 'sqlite';
const dados = arg('dados');
const saida = arg('saida');
if (!dados || !saida) {
  console.error('Uso: node scripts/gerar-sql-carga.ts --dados <pasta> --saida <arquivo.sql> [--nome N] [--uf UF]');
  process.exit(1);
}

const achar = (arquivo: string): string | null => {
  const sub = arquivo.replace('.json', '');
  return [join(dados, arquivo), join(dados, sub, arquivo)].find((c) => existsSync(c)) ?? null;
};
const caminhoCarteira = achar('carteira.json');
if (!caminhoCarteira) {
  console.error('carteira.json não encontrada.');
  process.exit(1);
}
const caminhoCrono = achar('cronogramas.json');
const semHistorico = process.argv.includes('--sem-historico'); // rotina de importação: não regrava o histórico da planilha
const caminhoHist = semHistorico ? null : achar('historico.json');

const carteira = JSON.parse(readFileSync(caminhoCarteira, 'utf8')) as Carteira;
const cronogramas = caminhoCrono ? (JSON.parse(readFileSync(caminhoCrono, 'utf8')) as Cronogramas) : null;
const historico = caminhoHist ? (JSON.parse(readFileSync(caminhoHist, 'utf8')) as { registros: RegistroLog[] }).registros : [];
const ibge = carteira.prefeitura_id;
if (!Number.isInteger(ibge)) throw new Error('prefeitura_id inválido.');

function txt(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v);
  if (s.includes('\0')) throw new Error('Texto com caractere NUL não pode ser carregado.');
  return `'${s.replaceAll("'", "''")}'`;
}
function num(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Número inválido: ${String(v)}`);
  return String(v);
}
const bool = (v: unknown): string => (v === null || v === undefined ? 'NULL' : v ? 'true' : 'false');
const json = (v: unknown): string => (v === null || v === undefined ? 'NULL' : `${txt(JSON.stringify(v))}${sqlite ? '' : '::jsonb'}`);
const arr = (v: string[] | null | undefined): string => sqlite ? txt(JSON.stringify(v ?? [])) : `ARRAY[${(v ?? []).map(txt).join(', ')}]::text[]`;

/** `preservar`: colunas gravadas só na inclusão; numa reimportação NÃO são sobrescritas (o sistema, não a planilha, é quem as preenche). */
function upsert(tabela: string, pk: string[], cols: Record<string, string>, preservar: string[] = []): string {
  const nomes = Object.keys(cols);
  const atualiza = nomes.filter((c) => !pk.includes(c) && !preservar.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  if (sqlite && tabela === 'projeto') atualiza.push('revisao = projeto.revisao + 1');
  // Projeto cadastrado pela tela (origem.aba = CADASTRO) nunca é sobrescrito pela planilha, mesmo que ela traga o mesmo código.
  const protegeCadastro = sqlite && tabela === 'projeto' ? " WHERE json_extract(projeto.origem, '$.aba') IS NOT 'CADASTRO'" : '';
  return (
    `INSERT INTO ${tabela} (${nomes.join(', ')}) VALUES (${nomes.map((c) => cols[c]).join(', ')})\n` +
    `  ON CONFLICT (${pk.join(', ')}) DO UPDATE SET ${atualiza.join(', ')}${protegeCadastro};`
  );
}

const linhas: string[] = ['-- Gerado por scripts/gerar-sql-carga.ts (uso local; não versionar).', ...(sqlite ? [] : ['BEGIN;', `SET app.prefeitura_id = '${ibge}';`])];
linhas.push(upsert('prefeitura', ['id'], { id: num(ibge), nome: txt(arg('nome') ?? `Município ${ibge}`), uf: txt(arg('uf') ?? 'GO') }));

for (const p of carteira.projetos) {
  linhas.push(
    upsert('projeto', ['prefeitura_id', 'id'], {
      prefeitura_id: num(ibge), id: txt(p.id), codigo_legado: num(p.codigo_legado), nome: txt(p.nome), orgao: txt(p.orgao),
      responsavel: txt(p.responsavel), tipo: txt(p.tipo), detalhamento: txt(p.detalhamento), sei: arr(p.sei),
      observacao: txt(p.observacao), macroetapa: txt(p.macroetapa), status_projeto: txt(p.status_projeto), regiao: txt(p.regiao),
      bairro: txt(p.bairro), corredor: txt(p.corredor), origem_valor: txt(p.origem_valor), tem_projeto: bool(p.tem_projeto),
      prioridade: txt(p.prioridade), tipo_contratacao: txt(p.tipo_contratacao), orgao_contratacao: txt(p.orgao_contratacao),
      solicitacoes_financeiras: txt(p.solicitacoes_financeiras), valores: json(p.valores), recurso: json(p.recurso),
      datas: json(p.datas), por_ano: json(p.por_ano), atualizacao: json(p.atualizacao), operacional: json(p.operacional),
      pendencias: arr(p.pendencias), origem: json(p.origem),
      ...(sqlite ? { compromisso: txt(p.compromisso), localizacao: json(p.localizacao) } : {}),
    }, sqlite ? ['compromisso', 'localizacao'] : []),
  );
  if (sqlite && (p.area != null || p.prioritario != null)) {
    // A planilha só preenche. Célula vazia ou coluna ausente mantém o que está no banco. Projeto CADASTRO nunca muda.
    const area = txt(p.area);
    const prioritario = p.prioritario == null ? 'NULL' : p.prioritario ? '1' : '0';
    linhas.push(`UPDATE projeto SET area = CASE WHEN EXISTS (
      SELECT 1 FROM catalogo WHERE prefeitura_id = ${ibge} AND tipo = 'area' AND codigo = ${area} AND ativo = 1
    ) THEN ${area} ELSE area END, prioritario = coalesce(${prioritario}, prioritario), revisao = revisao + 1
    WHERE prefeitura_id = ${ibge} AND id = ${txt(p.id)} AND json_extract(origem, '$.aba') IS NOT 'CADASTRO';`);
  }
}

for (const c of cronogramas?.cronogramas ?? []) {
  linhas.push(
    upsert('cronograma', ['prefeitura_id', 'id'], {
      prefeitura_id: num(ibge), id: txt(c.id), aba: txt(c.aba), titulo: txt(c.titulo), endereco: txt(c.endereco), sei: arr(c.sei),
      projeto_id: txt(c.projeto_id), casamento: txt(c.casamento), pendencias: arr(c.pendencias),
    }),
  );
  if (sqlite) {
    // Etapas que saíram da planilha deixam de existir no banco (etapas só vêm da planilha; nada é editado no sistema).
    const ordens = c.fases.flatMap((f) => f.etapas.map((e) => e.ordem));
    linhas.push(
      `DELETE FROM etapa_cronograma WHERE prefeitura_id = ${num(ibge)} AND cronograma_id = ${txt(c.id)}` +
        (ordens.length ? ` AND ordem NOT IN (${ordens.map(num).join(', ')});` : ';'), // cronograma sem nenhuma etapa: apaga todas as antigas
    );
  }
  for (const fase of c.fases) {
    for (const e of fase.etapas) {
      linhas.push(
        upsert('etapa_cronograma', ['prefeitura_id', 'cronograma_id', 'ordem'], {
          prefeitura_id: num(ibge), cronograma_id: txt(c.id), ordem: num(e.ordem), fase: txt(e.fase ?? fase.nome), nome: txt(e.nome),
          unidade: txt(e.unidade), responsavel: txt(e.responsavel), situacao_planilha: txt(e.situacao_planilha),
          duracao_prevista: num(e.duracao_prevista), inicio_previsto: txt(e.inicio_previsto), fim_previsto: txt(e.fim_previsto),
          inicio_real: txt(e.inicio_real), fim_real: txt(e.fim_real), status: txt(e.status), ciclo: num(e.ciclo),
          pendencias: arr(e.pendencias), origem: json(e.origem),
        }),
      );
    }
  }
}
const idsProjetos = new Set(carteira.projetos.map((p) => p.id));
let nEventoProjeto = 0;
let nEventoSistema = 0;
for (const h of historico) {
  if (idsProjetos.has(h.projeto_id)) {
    nEventoProjeto++;
    linhas.push(
      `INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao) VALUES (` +
        [txt(h.id), num(ibge), txt(h.projeto_id), txt(h.tipo), txt(h.origem), txt(h.autor), txt(new Date(h.em).toISOString()), txt(h.de), txt(h.para), json(h.campos), txt(h.motivo), bool(h.forcado ?? false), txt(h.descricao)].join(', ') +
        `)
  ON CONFLICT (id) DO NOTHING;`,
    );
  } else {
    nEventoSistema++;
    const detalhes: Record<string, unknown> = {};
    if (h.projeto_id !== '*') detalhes.projeto_id = h.projeto_id;
    for (const k of ['de', 'para', 'campos', 'motivo'] as const) if (h[k] != null) detalhes[k] = h[k];
    if (h.forcado) detalhes.forcado = true;
    linhas.push(
      `INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) VALUES (` +
        [txt(h.id), num(ibge), txt(h.tipo), txt(h.origem), txt(h.autor), txt(new Date(h.em).toISOString()), txt(h.descricao), Object.keys(detalhes).length ? json(detalhes) : 'NULL'].join(', ') +
        `)
  ON CONFLICT (id) DO NOTHING;`,
    );
  }
}
linhas.push(...(sqlite ? [] : ['COMMIT;']), '');
writeFileSync(saida, linhas.join('\n'), 'utf8');
console.log(`SQL gerado em ${saida}: ${carteira.projetos.length} projetos, ${cronogramas?.cronogramas.length ?? 0} cronogramas, ${nEventoProjeto} eventos de projeto, ${nEventoSistema} eventos de sistema.`);
