// Documentos de projeto no D1 da prefeitura. Toda consulta filtra prefeitura_id; nada é apagado (remoção só lógica).
import type { BancoD1 } from '../repositorio/d1.ts';

export interface Documento {
  id: string; projeto_id: string; nome_original: string; tipo_mime: string; tamanho_bytes: number;
  sha256: string; enviado_por: string; enviado_em: string; tipo_codigo: string | null;
}
export interface DocumentoComChave extends Documento { chave_r2: string; }
export interface NovoDocumento extends Omit<Documento, 'enviado_em'> { chave_r2: string; }
export interface TipoDocumento { codigo: string; nome: string; descricao: string | null; }
/** 'ok' = trocou e gravou o evento; 'mudou' = o tipo ou a remoção mudou no meio; 'tipo' = o banco recusou o tipo. */
export type ResultadoClassificacao = 'ok' | 'mudou' | 'tipo';

export interface RepositorioDocumentos {
  listar(projetoId: string): Promise<Documento[]>;
  obter(id: string): Promise<DocumentoComChave | null>;
  /** Documento ativo do mesmo projeto com o mesmo conteúdo (evita enviar o mesmo arquivo duas vezes). */
  duplicado(projetoId: string, sha256: string): Promise<Documento | null>;
  registrar(d: NovoDocumento): Promise<void>;
  /** Quantos envios essa pessoa fez desde o instante informado (limite por hora). */
  enviosDesde(autor: string, desdeIso: string): Promise<number>;
  /** Marca como removido; false se já estava removido ou não existe. */
  remover(id: string, autor: string): Promise<boolean>;
  /** Tipos ATIVOS da prefeitura, na ordem de exibição. */
  listarTipos(): Promise<TipoDocumento[]>;
  /** Nome de TODOS os tipos da prefeitura (ativos ou não), por código: para mostrar documento cujo tipo foi desativado depois. */
  nomesTipos(): Promise<Record<string, string>>;
  /** Documentos ativos do projeto por tipo ('' = sem tipo). Removidos não contam. */
  contarPorTipo(projetoId: string): Promise<Record<string, number>>;
  /** Troca o tipo se ele ainda for `de` e grava o evento (com a descrição recebida) na mesma transação. */
  classificar(id: string, de: string | null, para: string | null, autor: string, projetoId: string, descricao: string): Promise<ResultadoClassificacao>;
}

const COLUNAS = 'id, projeto_id, nome_original, tipo_mime, tamanho_bytes, sha256, enviado_por, enviado_em, tipo_codigo';

export function criarRepositorioDocumentos(db: BancoD1, prefeituraId: number): RepositorioDocumentos {
  if (!Number.isInteger(prefeituraId) || prefeituraId <= 0) throw new Error('prefeituraId deve ser inteiro positivo.');
  return {
    async listar(projetoId) {
      const r = await db.prepare(`SELECT ${COLUNAS} FROM documento WHERE prefeitura_id = ? AND projeto_id = ? AND removido_em IS NULL ORDER BY enviado_em DESC, id`)
        .bind(prefeituraId, projetoId).all();
      return r.results as Documento[];
    },
    obter: (id) =>
      db.prepare(`SELECT ${COLUNAS}, chave_r2 FROM documento WHERE prefeitura_id = ? AND id = ? AND removido_em IS NULL`)
        .bind(prefeituraId, id).first<DocumentoComChave>(),
    duplicado: (projetoId, sha256) =>
      db.prepare(`SELECT ${COLUNAS} FROM documento WHERE prefeitura_id = ? AND projeto_id = ? AND sha256 = ? AND removido_em IS NULL`)
        .bind(prefeituraId, projetoId, sha256).first<Documento>(),
    async registrar(d) {
      await db.batch([db.prepare(
        'INSERT INTO documento (id, prefeitura_id, projeto_id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por, tipo_codigo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(d.id, prefeituraId, d.projeto_id, d.nome_original, d.chave_r2, d.tipo_mime, d.tamanho_bytes, d.sha256, d.enviado_por, d.tipo_codigo ?? null)]);
    },
    async enviosDesde(autor, desdeIso) {
      const r = await db.prepare('SELECT count(*) AS n FROM documento WHERE prefeitura_id = ? AND enviado_por = ? AND enviado_em >= ?')
        .bind(prefeituraId, autor, desdeIso).first<{ n: number }>();
      return Number(r?.n ?? 0);
    },
    async remover(id, autor) {
      // Decide pelo número de linhas realmente alteradas: duas remoções ao mesmo tempo não respondem "removido" as duas.
      const [r] = await db.batch([db.prepare(
        "UPDATE documento SET removido_em = strftime('%Y-%m-%dT%H:%M:%fZ','now'), removido_por = ? WHERE prefeitura_id = ? AND id = ? AND removido_em IS NULL",
      ).bind(autor, prefeituraId, id)]);
      return (r?.meta?.changes ?? 0) > 0;
    },
    async listarTipos() {
      const r = await db.prepare('SELECT codigo, nome, descricao FROM tipo_documento WHERE prefeitura_id = ? AND ativo = 1 ORDER BY ordem, codigo')
        .bind(prefeituraId).all();
      return r.results as TipoDocumento[];
    },
    async nomesTipos() {
      const r = await db.prepare('SELECT codigo, nome FROM tipo_documento WHERE prefeitura_id = ?').bind(prefeituraId).all();
      const saida: Record<string, string> = {};
      for (const l of r.results as { codigo: string; nome: string }[]) saida[l.codigo] = l.nome;
      return saida;
    },
    async contarPorTipo(projetoId) {
      const r = await db.prepare("SELECT coalesce(tipo_codigo, '') AS tipo, count(*) AS n FROM documento WHERE prefeitura_id = ? AND projeto_id = ? AND removido_em IS NULL GROUP BY coalesce(tipo_codigo, '')")
        .bind(prefeituraId, projetoId).all();
      const saida: Record<string, number> = {};
      for (const l of r.results as { tipo: string; n: number }[]) saida[l.tipo] = Number(l.n);
      return saida;
    },
    async classificar(id, de, para, autor, projetoId, descricao) {
      try {
        const [r] = await db.batch([
          db.prepare('UPDATE documento SET tipo_codigo = ? WHERE prefeitura_id = ? AND id = ? AND removido_em IS NULL AND tipo_codigo IS ?')
            .bind(para, prefeituraId, id, de),
          db.prepare(
            "INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) SELECT ?, ?, 'documento_classificado', 'cadastro', ?, ?, ?, json_object('projeto_id', ?, 'documento_id', ?, 'tipo_de', ?, 'tipo_para', ?) WHERE changes() = 1",
          ).bind(crypto.randomUUID(), prefeituraId, autor, new Date().toISOString(), descricao, projetoId, id, de, para),
        ]);
        return (r?.meta?.changes ?? 0) === 1 ? 'ok' : 'mudou';
      } catch (erro) {
        if (/Tipo de documento inválido/.test(String(erro))) return 'tipo';
        throw erro;
      }
    },
  };
}
