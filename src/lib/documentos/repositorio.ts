// Documentos de projeto no D1 da prefeitura. Toda consulta filtra prefeitura_id; nada é apagado (remoção só lógica).
import type { BancoD1 } from '../repositorio/d1.ts';

export interface Documento {
  id: string; projeto_id: string; nome_original: string; tipo_mime: string; tamanho_bytes: number;
  sha256: string; enviado_por: string; enviado_em: string;
}
export interface DocumentoComChave extends Documento { chave_r2: string; }
export interface NovoDocumento extends Omit<Documento, 'enviado_em'> { chave_r2: string; }

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
}

const COLUNAS = 'id, projeto_id, nome_original, tipo_mime, tamanho_bytes, sha256, enviado_por, enviado_em';

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
        'INSERT INTO documento (id, prefeitura_id, projeto_id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(d.id, prefeituraId, d.projeto_id, d.nome_original, d.chave_r2, d.tipo_mime, d.tamanho_bytes, d.sha256, d.enviado_por)]);
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
  };
}
