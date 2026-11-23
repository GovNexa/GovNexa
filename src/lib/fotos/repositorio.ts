// Fotos da obra (E9) no D1 da prefeitura: tabela projeto_foto (0001 + 0008). Toda consulta filtra prefeitura_id;
// nada é apagado (remoção só lógica) e envio e remoção gravam o evento do Histórico no MESMO lote.
import type { BancoD1 } from '../repositorio/d1.ts';

export interface Foto {
  id: string; projeto_id: string; tipo_mime: string; tamanho_bytes: number;
  legenda: string | null; tirada_em: string | null; enviada_por: string; enviada_em: string;
}
export interface FotoComChave extends Foto { arquivo_chave: string; }
export interface NovaFoto extends Omit<Foto, 'enviada_em'> { arquivo_chave: string; sha256: string; }
export interface LimitesFoto { porProjeto: number; porHora: number; desdeIso: string; }

export interface RepositorioFotos {
  /** Fotos ativas do projeto, mais recentes primeiro (no máximo `limite`). */
  listar(projetoId: string, limite: number): Promise<Foto[]>;
  contarAtivas(projetoId: string): Promise<number>;
  obter(id: string): Promise<FotoComChave | null>;
  /** Foto ativa do mesmo projeto com o mesmo conteúdo. */
  duplicada(projetoId: string, sha256: string): Promise<Foto | null>;
  /** Quantas fotos essa pessoa enviou desde o instante informado (limite por hora). */
  enviosDesde(autor: string, desdeIso: string): Promise<number>;
  /** Grava a foto e o evento juntos. 'limite' = o projeto ou a pessoa já estava no limite no momento da gravação (nada gravado). */
  registrar(f: NovaFoto, limites: LimitesFoto, descricao: string, emIso: string): Promise<'ok' | 'limite'>;
  /** Marca como removida e grava o evento juntos; false se já estava removida, não existe ou é de outro projeto. */
  remover(id: string, projetoId: string, autor: string, descricao: string, emIso: string): Promise<boolean>;
}

const COLUNAS = 'id, projeto_id, tipo_mime, tamanho_bytes, legenda, tirada_em, enviada_por, enviada_em';

export function criarRepositorioFotos(db: BancoD1, prefeituraId: number): RepositorioFotos {
  if (!Number.isInteger(prefeituraId) || prefeituraId <= 0) throw new Error('prefeituraId deve ser inteiro positivo.');
  return {
    async listar(projetoId, limite) {
      const r = await db.prepare(`SELECT ${COLUNAS} FROM projeto_foto WHERE prefeitura_id = ? AND projeto_id = ? AND removida_em IS NULL ORDER BY enviada_em DESC, id LIMIT ?`)
        .bind(prefeituraId, projetoId, limite).all();
      return r.results as Foto[];
    },
    async contarAtivas(projetoId) {
      const r = await db.prepare('SELECT count(*) AS n FROM projeto_foto WHERE prefeitura_id = ? AND projeto_id = ? AND removida_em IS NULL')
        .bind(prefeituraId, projetoId).first<{ n: number }>();
      return Number(r?.n ?? 0);
    },
    obter: (id) =>
      db.prepare(`SELECT ${COLUNAS}, arquivo_chave FROM projeto_foto WHERE prefeitura_id = ? AND id = ? AND removida_em IS NULL`)
        .bind(prefeituraId, id).first<FotoComChave>(),
    duplicada: (projetoId, sha256) =>
      db.prepare(`SELECT ${COLUNAS} FROM projeto_foto WHERE prefeitura_id = ? AND projeto_id = ? AND sha256 = ? AND removida_em IS NULL`)
        .bind(prefeituraId, projetoId, sha256).first<Foto>(),
    async enviosDesde(autor, desdeIso) {
      const r = await db.prepare('SELECT count(*) AS n FROM projeto_foto WHERE prefeitura_id = ? AND enviada_por = ? AND enviada_em >= ?')
        .bind(prefeituraId, autor, desdeIso).first<{ n: number }>();
      return Number(r?.n ?? 0);
    },
    async registrar(f, limites, descricao, emIso) {
      // Os dois limites são conferidos de novo DENTRO da gravação: dois envios ao mesmo tempo não passam do teto.
      const [r] = await db.batch([
        db.prepare(
          `INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, legenda, tirada_em, enviada_por, sha256, enviada_em)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE (SELECT count(*) FROM projeto_foto WHERE prefeitura_id = ? AND projeto_id = ? AND removida_em IS NULL) < ?
              AND (SELECT count(*) FROM projeto_foto WHERE prefeitura_id = ? AND enviada_por = ? AND enviada_em >= ?) < ?`,
        ).bind(prefeituraId, f.projeto_id, f.id, f.arquivo_chave, f.tipo_mime, f.tamanho_bytes, f.legenda, f.tirada_em, f.enviada_por, f.sha256, emIso,
          prefeituraId, f.projeto_id, limites.porProjeto, prefeituraId, f.enviada_por, limites.desdeIso, limites.porHora),
        db.prepare(
          "INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) SELECT ?, ?, 'foto_enviada', 'ficha', ?, ?, ?, json_object('projeto_id', ?, 'foto_id', ?) WHERE changes() = 1",
        ).bind(crypto.randomUUID(), prefeituraId, f.enviada_por, emIso, descricao, f.projeto_id, f.id),
      ]);
      return (r?.meta?.changes ?? 0) === 1 ? 'ok' : 'limite';
    },
    async remover(id, projetoId, autor, descricao, emIso) {
      // Decide pelo número de linhas realmente alteradas: duas remoções ao mesmo tempo não respondem "removida" as duas.
      const [r] = await db.batch([
        db.prepare(
          'UPDATE projeto_foto SET removida_em = ?, removida_por = ? WHERE prefeitura_id = ? AND id = ? AND projeto_id = ? AND removida_em IS NULL',
        ).bind(emIso, autor, prefeituraId, id, projetoId),
        db.prepare(
          "INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) SELECT ?, ?, 'foto_removida', 'ficha', ?, ?, ?, json_object('projeto_id', ?, 'foto_id', ?) WHERE changes() = 1",
        ).bind(crypto.randomUUID(), prefeituraId, autor, emIso, descricao, projetoId, id),
      ]);
      return (r?.meta?.changes ?? 0) > 0;
    },
  };
}
