// D1: consultas parametrizadas e gravações atômicas por batch.
import { aplicarEvento, criarProjeto } from '../carteira/movimentacao.ts';
import type { Evento, RegistroHistorico } from '../carteira/movimentacao.ts';
import type { Projeto } from '../carteira/tipos.ts';
import type { Cronograma, EtapaCronograma, FaseCronograma } from '../cronograma/tipos.ts';
import type { RegistroLog } from '../log/tipos.ts';
import { criarRepositorioDocumentos } from '../documentos/repositorio.ts';
import type { RepositorioProjetos, ResultadoAplicacao, ResultadoCriacaoProjeto } from './tipos.ts';

export interface ResultadoD1 { results: any[]; success: boolean; meta?: { changes?: number }; }
export interface StatementD1 {
 bind(...valores: unknown[]): StatementD1;
 first<T = Record<string, unknown>>(): Promise<T | null>;
 all(): Promise<ResultadoD1>;
 run(): Promise<ResultadoD1>;
}
export interface BancoD1 {
 prepare(sql: string): StatementD1;
 batch(statements: StatementD1[]): Promise<ResultadoD1[]>;
}
interface ClienteSql { query(sql: string, params: unknown[]): Promise<{ rows: any[] }>; gravar(sql: string, params: unknown[]): Promise<void>; }

const COLUNAS_TEXTO = [
  'nome', 'orgao', 'responsavel', 'tipo', 'detalhamento', 'observacao', 'macroetapa', 'status_projeto', 'regiao', 'bairro',
  'corredor', 'origem_valor', 'tem_projeto', 'prioridade', 'compromisso', 'tipo_contratacao', 'orgao_contratacao', 'solicitacoes_financeiras',
] as const;
const COLUNAS_JSON = ['valores', 'recurso', 'datas', 'por_ano', 'atualizacao', 'operacional', 'origem', 'localizacao'] as const;
const COLUNAS_ARRAY = ['sei', 'pendencias'] as const;
const TODAS = ['id', 'codigo_legado', ...COLUNAS_TEXTO, ...COLUNAS_JSON, ...COLUNAS_ARRAY] as const;
const LISTA_COLUNAS = TODAS.join(', ');

function linhaParaProjeto(r: any): Projeto {
  const p: any = {};
  for (const c of TODAS) p[c] = decodificar(c, r[c]) ?? (c === 'sei' || c === 'pendencias' ? [] : null);
  if (p.tem_projeto != null) p.tem_projeto = Boolean(p.tem_projeto);
  return p as Projeto;
}
function decodificar(c: string, v: any): any {
 try { return [...COLUNAS_JSON, ...COLUNAS_ARRAY, 'campos'].includes(c as any) && typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; }
}
function decodificarLinha(r: any): any {
 return Object.fromEntries(Object.entries(r).map(([c,v]) => [c, decodificar(c,v)]));
}
const COLUNAS_LOG = 'id, projeto_id, projeto_nome, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao';
const iso = (v: unknown): string => new Date(v as any).toISOString();
function linhaParaHistorico(r: any): RegistroHistorico {
  const h: any = { id: r.id, projeto_id: r.projeto_id, tipo: r.tipo, origem: r.origem, autor: r.autor, em: iso(r.em) };
  if (r.de != null) h.de = r.de;
  if (r.para != null) h.para = r.para;
  if (r.campos != null) h.campos = decodificar('campos', r.campos);
  if (r.motivo != null) h.motivo = r.motivo;
  if (r.forcado) h.forcado = true;
  if (r.descricao != null) h.descricao = r.descricao;
  return h as RegistroHistorico;
}
function linhaParaLog(r: any): RegistroLog {
  const h: any = linhaParaHistorico(r);
  if (r.projeto_nome != null) h.projeto_nome = r.projeto_nome;
  return h as RegistroLog;
}

export function criarRepositorioD1(db: BancoD1, prefeituraId: number): RepositorioProjetos {
  if (!Number.isInteger(prefeituraId) || prefeituraId <= 0) throw new Error('prefeituraId deve ser inteiro positivo.');
  async function transacao<T>(fn: (cliente: ClienteSql) => Promise<T>): Promise<T> {
    const gravacoes: StatementD1[] = [];
    const cliente: ClienteSql = {
      async query(sql, params) {
        if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Escrita exige gravar e batch.');
        const statement = db.prepare(sql).bind(...params.map(v => typeof v === 'boolean' ? Number(v) : v));
        return { rows: (await statement.all()).results };
      },
      async gravar(sql, params) {
        gravacoes.push(db.prepare(sql).bind(...params.map(v => typeof v === 'boolean' ? Number(v) : v)));
      },
    };
    const resultado = await fn(cliente);
    if (gravacoes.length) await db.batch(gravacoes);
    return resultado;
  }

  return {
    podeGravar: true,
    async listarGeoBairros() {
      const { results } = await db.prepare('SELECT bairro, busca, encontrado, lat, lng, fonte, gerado_em FROM bairro_geo WHERE prefeitura_id = ? ORDER BY bairro').bind(prefeituraId).all();
      return {
        fonte: results[0]?.fonte,
        gerado_em: results[0]?.gerado_em,
        bairros: Object.fromEntries(results.map(r => [r.bairro, {
          busca: r.busca, encontrado: r.encontrado === 1,
          ...(r.encontrado === 1 ? { lat: r.lat, lng: r.lng } : {}),
        }])),
      };
    },
    documentos: criarRepositorioDocumentos(db, prefeituraId),
    listarProjetos: () =>
      transacao(async (cliente) => {
        const r = await cliente.query(`SELECT ${LISTA_COLUNAS} FROM projeto WHERE prefeitura_id = ? ORDER BY codigo_legado, id`, [prefeituraId]);
        return r.rows.map(linhaParaProjeto);
      }),
    obterProjeto: (id) =>
      transacao(async (cliente) => {
        const r = await cliente.query(`SELECT ${LISTA_COLUNAS} FROM projeto WHERE prefeitura_id = ? AND id = ?`, [prefeituraId, id]);
        return r.rows[0] ? linhaParaProjeto(r.rows[0]) : null;
      }),
    historico: (projetoId) =>
      transacao(async (cliente) => {
        // Direto nas duas tabelas, pelos índices (prefeitura_id, projeto_id, em) da migração 0004. Mesmo resultado da visão
        // log_alteracoes para um projeto, sem ler os eventos de sistema dos outros projetos.
        const r = await cliente.query(
          `SELECT id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao
             FROM evento_projeto WHERE prefeitura_id = ? AND projeto_id = ?
           UNION ALL
           SELECT id, projeto_id, tipo, origem, autor, em, json_extract(detalhes, '$.de'), json_extract(detalhes, '$.para'),
                  json_extract(detalhes, '$.campos'), json_extract(detalhes, '$.motivo'), json_extract(detalhes, '$.forcado'), descricao
             FROM evento_sistema WHERE prefeitura_id = ? AND projeto_id = ?
           ORDER BY em, id`,
          [prefeituraId, projetoId, prefeituraId, projetoId],
        );
        return r.rows.map(linhaParaHistorico);
      }),
    async definirLocalizacao(projetoId, decidir, autor) {
      const atual = await db.prepare('SELECT localizacao, revisao FROM projeto WHERE prefeitura_id = ? AND id = ?').bind(prefeituraId, projetoId)
        .first<{ localizacao: string | null; revisao: number }>();
      if (!atual) return 'inexistente';
      const novo = decidir(decodificar('localizacao', atual.localizacao) ?? null);
      if (!novo) return 'igual';
      // Um só batch: ou gravam a localização e o evento, ou nenhum. Só a coluna da localização muda. A gravação exige a mesma
      // revisão da leitura acima (duas gravações ao mesmo tempo: só uma vale) e sobe a revisão, para que uma edição geral do
      // projeto baseada em leitura antiga seja recusada em vez de devolver a localização anterior.
      const [r] = await db.batch([
        db.prepare("UPDATE projeto SET localizacao = ?, revisao = revisao + 1, atualizado_em = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE prefeitura_id = ? AND id = ? AND revisao = ?")
          .bind(JSON.stringify(novo.valor), prefeituraId, projetoId, atual.revisao),
        db.prepare(
          "INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, descricao) SELECT ?, ?, ?, 'localizacao_alterada', 'cadastro', ?, ?, ? WHERE changes() = 1",
        ).bind(crypto.randomUUID(), prefeituraId, projetoId, autor, new Date().toISOString(), novo.descricao),
      ]);
      return (r?.meta?.changes ?? 0) === 1 ? 'ok' : 'conflito';
    },
    listarHistorico: () =>
      transacao(async (cliente) => {
        // A visão une eventos de projeto e de sistema; o filtro mantém o isolamento.
        const r = await cliente.query(`SELECT ${COLUNAS_LOG} FROM log_alteracoes WHERE prefeitura_id = ? ORDER BY em DESC, id DESC`, [prefeituraId]);
        return r.rows.map(linhaParaLog);
      }),
    listarCronogramas: () =>
      transacao(async (cliente) => {
        const c = await cliente.query(
          'SELECT id, aba, titulo, endereco, sei, projeto_id, casamento, pendencias FROM cronograma WHERE prefeitura_id = ? ORDER BY id',
          [prefeituraId],
        );
        const e = await cliente.query(
          `SELECT cronograma_id, ordem, fase, nome, unidade, responsavel, situacao_planilha, duracao_prevista,
            inicio_previsto, fim_previsto,
            inicio_real, fim_real,
            status, ciclo, pendencias, origem
           FROM etapa_cronograma WHERE prefeitura_id = ? ORDER BY cronograma_id, ordem`,
          [prefeituraId],
        );
        return c.rows.map((raw): Cronograma => {
          const row = decodificarLinha(raw);
          const fases: FaseCronograma[] = [];
          for (const x of e.rows.map(decodificarLinha).filter((y) => y.cronograma_id === row.id)) {
            let fase = fases.find((f) => f.nome === x.fase);
            if (!fase) {
              fase = { nome: x.fase, ordem: fases.length + 1, etapas: [] };
              fases.push(fase);
            }
            const { cronograma_id: _omitido, ...etapa } = x;
            fase.etapas.push({ ...etapa, pendencias: etapa.pendencias ?? [] } as EtapaCronograma);
          }
          return {
            id: row.id, aba: row.aba, titulo: row.titulo, endereco: row.endereco ?? null, sei: row.sei ?? [],
            projeto_id: row.projeto_id ?? null, casamento: row.casamento ?? null, fases, pendencias: row.pendencias ?? [],
          };
        });
      }),
    async criarProjeto(dados, autor): Promise<ResultadoCriacaoProjeto> {
      return transacao(async (cliente): Promise<ResultadoCriacaoProjeto> => {
        const m = await cliente.query('SELECT coalesce(max(codigo_legado), 0) + 1 AS proximo FROM projeto WHERE prefeitura_id = ?', [prefeituraId]);
        const proximoCodigo = Number(m.rows[0]?.proximo ?? 1);
        const res = criarProjeto(dados, { autor, em: new Date().toISOString(), proximoCodigo, origem: 'cadastro' });
        if (!res.ok) return res;
        const p: any = res.projeto;
        // Nomes de coluna vêm de listas fixas no código; valores só por parâmetro.
        const cols: string[] = ['prefeitura_id', 'id', 'codigo_legado'];
        const marcas: string[] = ['?', '?', '?'];
        const params: unknown[] = [prefeituraId, p.id, p.codigo_legado];
        const add = (col: string, valor: unknown) => {
          params.push(valor);
          cols.push(col);
          marcas.push('?');
        };
        for (const c of COLUNAS_TEXTO) add(c, p[c] ?? null);
        for (const c of COLUNAS_JSON) add(c, p[c] == null ? null : JSON.stringify(p[c]));
        for (const c of COLUNAS_ARRAY) add(c, JSON.stringify(p[c] ?? []));
        await cliente.gravar(`INSERT INTO projeto (${cols.join(', ')}, atualizado_em) VALUES (${marcas.join(', ')}, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`, params);
        for (const h of res.historico) {
          await cliente.gravar(
            `INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [h.id, prefeituraId, h.projeto_id, h.tipo, h.origem, h.autor, h.em, h.de ?? null, h.para ?? null,
              h.campos ? JSON.stringify(h.campos) : null, h.motivo ?? null, h.forcado ?? false, h.descricao ?? null],
          );
        }
        return { ok: true, projeto: res.projeto, historico: res.historico };
      });
    },
    async aplicar(e: Evento): Promise<ResultadoAplicacao> {
      e = { ...e, em: iso(e.em) };
      try { return await transacao(async (cliente): Promise<ResultadoAplicacao> => {
        const r = await cliente.query(`SELECT ${LISTA_COLUNAS}, revisao FROM projeto WHERE prefeitura_id = ? AND id = ? `, [prefeituraId, e.projeto_id]);
        if (!r.rows[0]) return { ok: false, erro: 'Projeto não encontrado.' };
        const res = aplicarEvento(linhaParaProjeto(r.rows[0]), e);
        if (!res.ok) return res.faltando ? { ok: false, erro: res.erro, faltando: res.faltando } : { ok: false, erro: res.erro };
        const p: any = res.projeto;
        // Nomes de coluna vêm de listas fixas no código; valores só por parâmetro.
        const sets: string[] = [];
        const params: unknown[] = [];
        const add = (col: string, valor: unknown) => {
          params.push(valor);
          sets.push(`${col} = ?`);
        };
        for (const c of COLUNAS_TEXTO) add(c, p[c] ?? null);
        for (const c of COLUNAS_JSON) add(c, p[c] == null ? null : JSON.stringify(p[c]));
        for (const c of COLUNAS_ARRAY) add(c, JSON.stringify(p[c] ?? []));
        params.push(r.rows[0].revisao, prefeituraId, p.id);
        await cliente.gravar(`UPDATE projeto SET ${sets.join(', ')}, revisao = CASE WHEN revisao = ? THEN revisao + 1 ELSE NULL END, atualizado_em = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE prefeitura_id = ? AND id = ?`, params);
        for (const h of res.historico) {
          await cliente.gravar(
            `INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [h.id, prefeituraId, h.projeto_id, h.tipo, h.origem, h.autor, h.em, h.de ?? null, h.para ?? null,
              h.campos ? JSON.stringify(h.campos) : null, h.motivo ?? null, h.forcado ?? false, h.descricao ?? null],
          );
        }
        return { ok: true, historico: res.historico };
      }); } catch (erro) {
        if (/NOT NULL constraint failed: projeto.revisao/.test(String(erro))) return { ok: false, erro: 'Projeto alterado por outra pessoa; recarregue a página.' };
        throw erro;
      }
    },
  };
}
