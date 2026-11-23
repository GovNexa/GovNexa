// Contratações (E12) no D1 da prefeitura: tabelas contratacao, contratacao_marco e evento_contratacao (0010).
// Toda consulta filtra prefeitura_id; remoção só lógica; toda escrita grava o evento do Histórico no MESMO lote (db.batch),
// decidindo pelo número de linhas realmente alteradas (changes()). Nomes de coluna vêm só de COLUNAS_EDITAVEIS.
import { dataBr } from '../datas.ts';
import type { BancoD1 } from '../repositorio/d1.ts';
import { COLUNAS_EDITAVEIS, LIMITE_TOTAL_CONTRATACOES, MAX_CONTRATACOES, MAX_MARCOS, type CampoEditavel, type Etapa } from './regras.ts';

export interface Contratacao {
  id: string;
  projeto_id: string | null;
  nome: string;
  objeto: string | null;
  orgao: string | null;
  etapa: Etapa;
  etapa_desde: string;
  modalidade: string | null;
  processo_sei: string | null;
  grupo: string | null;
  valor_estimado: number | null;
  valor_proposta: number | null;
  valor_contratado: number | null;
  valor_pago: number | null;
  empresa: string | null;
  colocacao: number | null;
  marco: string | null;
  data_marco: string | null;
  data_abertura: string | null;
  data_publicacao_prevista: string | null;
  publicacao_prevista_texto: string | null;
  onde_esta: string | null;
  situacao: string | null;
  aguardando: string;
  aguardando_quem: string | null;
  observacao: string | null;
  origem: string;
  revisao: number;
  criada_por: string;
  criada_em: string;
  atualizada_por: string | null;
  atualizada_em: string;
}
export type NovaContratacao = Omit<Contratacao, 'revisao' | 'origem' | 'criada_por' | 'criada_em' | 'atualizada_por' | 'atualizada_em'>;
export interface Marco {
  id: string; contratacao_id: string; data: string; descricao: string;
  concluido: boolean; concluido_em: string | null; concluido_por: string | null;
}
export interface MarcoPendente extends Marco { nome: string; }
export interface EventoContratacao {
  id: string; tipo: string; autor: string; em: string; de: string | null; para: string | null;
  campos: Record<string, { de: unknown; para: unknown }> | null; motivo: string | null; descricao: string | null;
}
export type ResultadoRepo = 'ok' | 'conflito' | 'inexistente' | 'limite';
export type ResultadoCriar = 'ok' | 'limite' | 'limite_total';
export type ResultadoEscrita = { r: ResultadoRepo; revisao?: number };

export interface RepositorioContratacoes {
  listar(): Promise<Contratacao[]>;
  obter(id: string): Promise<Contratacao | null>;
  listarDoProjeto(projetoId: string): Promise<Contratacao[]>;
  listarMarcos(contratacaoId: string): Promise<Marco[]>;
  listarMarcosPendentes(limite: number): Promise<MarcoPendente[]>;
  /** Datas dos marcos pendentes de cada contratação ativa, sem limite (filtro de período). */
  datasMarcosPendentes(): Promise<Map<string, string[]>>;
  historico(id: string, limite: number): Promise<EventoContratacao[]>;
  projetoExiste(projetoId: string): Promise<boolean>;
  criar(c: NovaContratacao, autor: string, emIso: string, descricao: string): Promise<ResultadoCriar>;
  editar(id: string, revisao: number, campos: Partial<Record<CampoEditavel, unknown>>, diff: Record<string, { de: unknown; para: unknown }>, autor: string, emIso: string): Promise<ResultadoEscrita>;
  mudarEtapa(id: string, revisao: number, de: Etapa, para: Etapa, desde: string, motivo: string | null, descricao: string, autor: string, emIso: string): Promise<ResultadoEscrita>;
  remover(id: string, revisao: number, motivo: string, autor: string, emIso: string): Promise<ResultadoEscrita>;
  criarMarco(contratacaoId: string, m: { id: string; data: string; descricao: string }, autor: string, emIso: string): Promise<ResultadoRepo>;
  marcarMarco(contratacaoId: string, marcoId: string, concluido: boolean, autor: string, emIso: string): Promise<'ok' | 'igual' | 'inexistente'>;
  removerMarco(contratacaoId: string, marcoId: string, autor: string, emIso: string): Promise<'ok' | 'inexistente'>;
}

const COLUNAS_LEITURA = `id, projeto_id, nome, objeto, orgao, etapa, etapa_desde, ${COLUNAS_EDITAVEIS.filter((c) => !['nome', 'objeto', 'orgao', 'projeto_id'].includes(c)).join(', ')}, origem, revisao, criada_por, criada_em, atualizada_por, atualizada_em`;
const COLUNAS_MARCO = 'id, contratacao_id, data, descricao, concluido, concluido_em, concluido_por';
const ATIVA = 'EXISTS (SELECT 1 FROM contratacao WHERE prefeitura_id = ? AND id = ? AND removida_em IS NULL)';
const mudou = (r: { meta?: { changes?: number } } | undefined): boolean => (r?.meta?.changes ?? 0) === 1;
const paraMarco = (r: any): Marco => ({ ...r, concluido: Number(r.concluido) === 1 });

export function criarRepositorioContratacoes(db: BancoD1, prefeituraId: number): RepositorioContratacoes {
  if (!Number.isInteger(prefeituraId) || prefeituraId <= 0) throw new Error('prefeituraId deve ser inteiro positivo.');
  const obter = (id: string): Promise<Contratacao | null> =>
    db.prepare(`SELECT ${COLUNAS_LEITURA} FROM contratacao WHERE prefeitura_id = ? AND id = ? AND removida_em IS NULL`).bind(prefeituraId, id).first<Contratacao>();
  const eventoSql = (tipo: string, colunasExtras: string, valoresExtras: string): string =>
    `INSERT INTO evento_contratacao (id, prefeitura_id, contratacao_id, tipo, autor, em${colunasExtras}) SELECT ?, ?, ?, '${tipo}', ?, ?${valoresExtras} WHERE changes() = 1`;
  const finalizar = async (r: { meta?: { changes?: number } } | undefined, id: string, revisaoNova?: number): Promise<ResultadoEscrita> => {
    if (mudou(r)) return { r: 'ok', ...(revisaoNova !== undefined ? { revisao: revisaoNova } : {}) };
    return { r: (await obter(id)) ? 'conflito' : 'inexistente' };
  };
  return {
    async listar() {
      const r = await db.prepare(`SELECT ${COLUNAS_LEITURA} FROM contratacao WHERE prefeitura_id = ? AND removida_em IS NULL ORDER BY nome, id LIMIT ${MAX_CONTRATACOES}`).bind(prefeituraId).all();
      return r.results as Contratacao[];
    },
    obter,
    async listarDoProjeto(projetoId) {
      const r = await db.prepare(`SELECT ${COLUNAS_LEITURA} FROM contratacao WHERE prefeitura_id = ? AND projeto_id = ? AND removida_em IS NULL ORDER BY nome`).bind(prefeituraId, projetoId).all();
      return r.results as Contratacao[];
    },
    async listarMarcos(contratacaoId) {
      const r = await db.prepare(`SELECT ${COLUNAS_MARCO} FROM contratacao_marco WHERE prefeitura_id = ? AND contratacao_id = ? AND removido_em IS NULL ORDER BY data, id`).bind(prefeituraId, contratacaoId).all();
      return r.results.map(paraMarco);
    },
    async listarMarcosPendentes(limite) {
      const r = await db.prepare(
        `SELECT m.id, m.contratacao_id, m.data, m.descricao, m.concluido, m.concluido_em, m.concluido_por, c.nome
           FROM contratacao_marco m
           JOIN contratacao c ON c.prefeitura_id = m.prefeitura_id AND c.id = m.contratacao_id AND c.removida_em IS NULL
          WHERE m.prefeitura_id = ? AND m.removido_em IS NULL AND m.concluido = 0
          ORDER BY m.data, m.id LIMIT ?`,
      ).bind(prefeituraId, limite).all();
      return r.results.map((x) => ({ ...paraMarco(x), nome: String(x.nome) }));
    },
    async datasMarcosPendentes() {
      const r = await db.prepare(
        'SELECT m.contratacao_id, m.data FROM contratacao_marco m JOIN contratacao c ON c.prefeitura_id = m.prefeitura_id AND c.id = m.contratacao_id AND c.removida_em IS NULL WHERE m.prefeitura_id = ? AND m.concluido = 0 AND m.removido_em IS NULL',
      ).bind(prefeituraId).all();
      const mapa = new Map<string, string[]>();
      for (const x of r.results) mapa.set(String(x.contratacao_id), [...(mapa.get(String(x.contratacao_id)) ?? []), String(x.data)]);
      return mapa;
    },
    async historico(id, limite) {
      const r = await db.prepare(
        'SELECT id, tipo, autor, em, de, para, campos, motivo, descricao FROM evento_contratacao WHERE prefeitura_id = ? AND contratacao_id = ? ORDER BY em DESC, id DESC LIMIT ?',
      ).bind(prefeituraId, id, limite).all();
      return r.results.map((x) => ({ ...x, campos: x.campos ? JSON.parse(String(x.campos)) : null })) as EventoContratacao[];
    },
    async projetoExiste(projetoId) {
      const r = await db.prepare('SELECT 1 AS ok FROM projeto WHERE prefeitura_id = ? AND id = ?').bind(prefeituraId, projetoId).first();
      return r !== null;
    },
    async criar(c, autor, emIso, descricao) {
      const valores = COLUNAS_EDITAVEIS.map((col) => (col === 'aguardando' ? (c.aguardando ?? 'nao') : (c[col] ?? null)));
      const preenchidos: Record<string, { de: null; para: unknown }> = {};
      COLUNAS_EDITAVEIS.forEach((col, i) => { if (valores[i] !== null && !(col === 'aguardando' && valores[i] === 'nao')) preenchidos[col] = { de: null, para: valores[i] }; });
      const [r] = await db.batch([
        db.prepare(
          `INSERT INTO contratacao (prefeitura_id, id, ${COLUNAS_EDITAVEIS.join(', ')}, etapa, etapa_desde, origem, criada_por, criada_em, atualizada_por, atualizada_em)
           SELECT ?, ?, ${COLUNAS_EDITAVEIS.map(() => '?').join(', ')}, ?, ?, 'tela', ?, ?, ?, ?
            WHERE (SELECT count(*) FROM contratacao WHERE prefeitura_id = ? AND removida_em IS NULL) < ?
              AND (SELECT count(*) FROM contratacao WHERE prefeitura_id = ?) < ?`,
        ).bind(prefeituraId, c.id, ...valores, c.etapa, c.etapa_desde, autor, emIso, autor, emIso, prefeituraId, MAX_CONTRATACOES, prefeituraId, LIMITE_TOTAL_CONTRATACOES),
        db.prepare(eventoSql('criada', ', para, descricao, campos', ', ?, ?, ?')).bind(crypto.randomUUID(), prefeituraId, c.id, autor, emIso, c.etapa, descricao, JSON.stringify(preenchidos)),
      ]);
      if (mudou(r)) return 'ok';
      const t = await db.prepare('SELECT count(*) AS n FROM contratacao WHERE prefeitura_id = ?').bind(prefeituraId).first<{ n: number }>();
      return Number(t?.n ?? 0) >= LIMITE_TOTAL_CONTRATACOES ? 'limite_total' : 'limite';
    },
    async editar(id, revisao, campos, diff, autor, emIso) {
      const chaves = Object.keys(campos);
      for (const k of chaves) if (!(COLUNAS_EDITAVEIS as readonly string[]).includes(k)) throw new Error(`Coluna não editável: ${k}`);
      const [r] = await db.batch([
        db.prepare(
          `UPDATE contratacao SET ${chaves.map((k) => `${k} = ?`).concat(['revisao = revisao + 1', 'atualizada_por = ?', 'atualizada_em = ?']).join(', ')}
            WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND removida_em IS NULL`,
        ).bind(...chaves.map((k) => campos[k as CampoEditavel] ?? null), autor, emIso, prefeituraId, id, revisao),
        db.prepare(eventoSql('editada', ', campos', ', ?')).bind(crypto.randomUUID(), prefeituraId, id, autor, emIso, JSON.stringify(diff)),
      ]);
      return finalizar(r, id, revisao + 1);
    },
    async mudarEtapa(id, revisao, de, para, desde, motivo, descricao, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          `UPDATE contratacao SET etapa = ?, etapa_desde = ?, revisao = revisao + 1, atualizada_por = ?, atualizada_em = ?
            WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND etapa = ? AND removida_em IS NULL`,
        ).bind(para, desde, autor, emIso, prefeituraId, id, revisao, de),
        db.prepare(eventoSql('etapa', ', de, para, motivo, descricao', ', ?, ?, ?, ?')).bind(crypto.randomUUID(), prefeituraId, id, autor, emIso, de, para, motivo, descricao),
      ]);
      return finalizar(r, id, revisao + 1);
    },
    async remover(id, revisao, motivo, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          'UPDATE contratacao SET removida_em = ?, removida_por = ? WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND removida_em IS NULL',
        ).bind(emIso, autor, prefeituraId, id, revisao),
        db.prepare(eventoSql('removida', ', motivo', ', ?')).bind(crypto.randomUUID(), prefeituraId, id, autor, emIso, motivo),
        // E14a: remover a contratação desliga o vínculo com o PNCP no mesmo lote (só se a remoção acima valeu) e registra no Histórico do PNCP.
        db.prepare(
          `UPDATE contratacao_pncp SET desvinculado_em = ?, desvinculado_por = ?
            WHERE prefeitura_id = ? AND contratacao_id = ? AND desvinculado_em IS NULL
              AND EXISTS (SELECT 1 FROM contratacao WHERE prefeitura_id = ? AND id = ? AND removida_em = ? AND removida_por = ?)`,
        ).bind(emIso, autor, prefeituraId, id, prefeituraId, id, emIso, autor),
        db.prepare(
          `INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em, descricao)
           SELECT ?, prefeitura_id, 'desvinculo', contratacao_id, id, ?, ?, 'Contratação removida'
             FROM contratacao_pncp WHERE prefeitura_id = ? AND contratacao_id = ? AND desvinculado_em = ? AND desvinculado_por = ? AND changes() = 1`,
        ).bind(crypto.randomUUID(), autor, emIso, prefeituraId, id, emIso, autor),
      ]);
      return finalizar(r, id);
    },
    async criarMarco(contratacaoId, m, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          `INSERT INTO contratacao_marco (prefeitura_id, id, contratacao_id, data, descricao, criado_por, criado_em)
           SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE ${ATIVA}
              AND (SELECT count(*) FROM contratacao_marco WHERE prefeitura_id = ? AND contratacao_id = ? AND removido_em IS NULL) < ?`,
        ).bind(prefeituraId, m.id, contratacaoId, m.data, m.descricao, autor, emIso, prefeituraId, contratacaoId, prefeituraId, contratacaoId, MAX_MARCOS),
        db.prepare(eventoSql('marco_criado', ', descricao', ', ?')).bind(crypto.randomUUID(), prefeituraId, contratacaoId, autor, emIso, `${dataBr(m.data)} · ${m.descricao}`),
      ]);
      if (mudou(r)) return 'ok';
      return (await obter(contratacaoId)) ? 'limite' : 'inexistente';
    },
    async marcarMarco(contratacaoId, marcoId, concluido, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          `UPDATE contratacao_marco SET concluido = ?, concluido_em = ?, concluido_por = ?
            WHERE prefeitura_id = ? AND contratacao_id = ? AND id = ? AND removido_em IS NULL AND concluido = ? AND ${ATIVA}`,
        ).bind(concluido ? 1 : 0, concluido ? emIso : null, concluido ? autor : null, prefeituraId, contratacaoId, marcoId, concluido ? 0 : 1, prefeituraId, contratacaoId),
        db.prepare(
          eventoSql(concluido ? 'marco_concluido' : 'marco_reaberto', ', descricao', ', (SELECT descricao FROM contratacao_marco WHERE prefeitura_id = ? AND id = ?)'),
        ).bind(crypto.randomUUID(), prefeituraId, contratacaoId, autor, emIso, prefeituraId, marcoId),
      ]);
      if (mudou(r)) return 'ok';
      const existe = await db.prepare(`SELECT 1 AS ok FROM contratacao_marco WHERE prefeitura_id = ? AND contratacao_id = ? AND id = ? AND removido_em IS NULL AND ${ATIVA}`)
        .bind(prefeituraId, contratacaoId, marcoId, prefeituraId, contratacaoId).first();
      return existe ? 'igual' : 'inexistente';
    },
    async removerMarco(contratacaoId, marcoId, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          `UPDATE contratacao_marco SET removido_em = ?, removido_por = ?
            WHERE prefeitura_id = ? AND contratacao_id = ? AND id = ? AND removido_em IS NULL AND ${ATIVA}`,
        ).bind(emIso, autor, prefeituraId, contratacaoId, marcoId, prefeituraId, contratacaoId),
        db.prepare(
          eventoSql('marco_removido', ', descricao', ', (SELECT descricao FROM contratacao_marco WHERE prefeitura_id = ? AND id = ?)'),
        ).bind(crypto.randomUUID(), prefeituraId, contratacaoId, autor, emIso, prefeituraId, marcoId),
      ]);
      return mudou(r) ? 'ok' : 'inexistente';
    },
  };
}
