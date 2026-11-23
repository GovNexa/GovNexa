// PNCP (E14a) no D1 da prefeitura: tabelas pncp_orgao, contratacao_pncp, pncp_compra, pncp_item, pncp_resultado e evento_pncp (0011).
// Toda consulta filtra prefeitura_id; remoção só lógica; toda escrita grava o evento do Histórico no MESMO lote (db.batch),
// decidindo pelo número de linhas realmente alteradas (changes()). Valores só por bind (nada concatenado).
import type { BancoD1 } from '../repositorio/d1.ts';
import { MAX_ORGAOS, formatarCnpj } from './regras.ts';
import type { Coleta } from './cliente.ts';

export interface Orgao {
  id: string; cnpj: string; nome: string; sigla: string | null; ativo: boolean; revisao: number;
  criado_por: string; criado_em: string; atualizado_em: string; vinculos_ativos: number; ultima_coleta_em: string | null;
}
export interface VinculoPncp {
  id: string; contratacao_id: string; orgao_id: string; orgao_nome: string; cnpj: string; ano: number; sequencial: number; numero_controle: string;
  modo: string; vinculado_por: string; vinculado_em: string; ultima_tentativa_em: string | null; ultima_coleta_em: string | null;
  ultimo_status: 'ok' | 'erro' | 'nao_encontrado' | 'formato' | null; ultimo_erro: string | null;
}
export interface RetratoCompra {
  situacao_id: number; situacao_nome: string | null; existe_resultado: boolean; srp: boolean; modalidade_id: number | null; modalidade_nome: string | null;
  amparo_codigo: number | null; amparo_nome: string | null; obra: 'sim' | 'provavel' | 'nao_identificado'; numero_compra: string | null;
  processo: string | null; objeto: string | null; valor_estimado: number | null; valor_homologado: number | null; data_publicacao: string | null;
  data_abertura: string | null; data_encerramento: string | null; data_atualizacao_global: string | null; itens_total: number; incompleto: boolean; coletado_em: string;
}
export interface RetratoItem {
  numero_item: number; descricao: string | null; material_servico: string | null; categoria_id: number | null; categoria_nome: string | null;
  criterio_nome: string | null; situacao_id: number; situacao_nome: string | null; tem_resultado: boolean; valor_total: number | null;
}
export interface RetratoResultado {
  numero_item: number; sequencial_resultado: number; tipo_pessoa: string | null; fornecedor_ni: string | null; fornecedor_nome: string | null;
  ordem_classificacao: number | null; situacao_id: number | null; situacao_nome: string | null; valor_homologado: number | null;
  data_resultado: string | null; motivo_cancelamento: string | null;
}
export interface Retrato { compra: RetratoCompra | null; itens: RetratoItem[]; resultados: RetratoResultado[] }
export interface EventoPncp { id: string; tipo: string; contratacao_id: string | null; orgao_id: string | null; vinculo_id: string | null; autor: string; em: string; descricao: string | null; detalhe: unknown }
export interface NovoVinculo { id: string; contratacaoId: string; orgaoId: string; cnpj: string; ano: number; sequencial: number; numeroControle: string; obra: string }
export type ColetaOk = Extract<Coleta, { r: 'ok' }>;

export interface RepositorioPncp {
  listarOrgaos(): Promise<Orgao[]>;
  obterOrgao(id: string): Promise<Orgao | null>;
  obterOrgaoAtivoPorCnpj(cnpj: string): Promise<Orgao | null>;
  criarOrgao(o: { id: string; cnpj: string; nome: string; sigla: string | null }, autor: string, emIso: string): Promise<'ok' | 'duplicado' | 'limite'>;
  editarOrgao(id: string, revisao: number, campos: { nome: string; sigla: string | null }, diff: Record<string, { de: unknown; para: unknown }>, autor: string, emIso: string): Promise<'ok' | 'conflito' | 'inexistente'>;
  mudarAtivoOrgao(id: string, revisao: number, ativo: boolean, autor: string, emIso: string): Promise<'ok' | 'conflito' | 'inexistente' | 'com_vinculos'>;
  obterVinculoAtivo(contratacaoId: string): Promise<VinculoPncp | null>;
  obterVinculoAtivoDaCompra(cnpj: string, ano: number, sequencial: number): Promise<{ vinculo_id: string; contratacao_id: string; nome: string } | null>;
  listarVinculosAtivosDoOrgao(orgaoId: string, limite: number): Promise<VinculoPncp[]>;
  obterRetrato(vinculoId: string): Promise<Retrato>;
  historico(contratacaoId: string, limite: number): Promise<EventoPncp[]>;
  vincular(v: NovoVinculo, autor: string, emIso: string): Promise<'ok' | 'contratacao_ligada' | 'compra_ligada' | 'invalido'>;
  desvincular(contratacaoId: string, vinculoId: string, motivo: string, autor: string, emIso: string): Promise<'ok' | 'inexistente'>;
  reservarTentativa(vinculoId: string, emIso: string, limiteOkIso: string, limiteErroIso: string): Promise<boolean>;
  coletasNaUltimaHora(desdeIso: string): Promise<number>;
  gravarRetrato(v: VinculoPncp, coleta: ColetaOk, autor: string, emIso: string): Promise<'ok' | 'desligado' | 'recusado'>;
  gravarFalha(v: VinculoPncp, status: 'erro' | 'nao_encontrado' | 'formato', motivo: string, autor: string, emIso: string): Promise<'ok' | 'desligado'>;
  historicoOrgao(orgaoId: string, limite: number): Promise<EventoPncp[]>;
}

const mudou = (r: { meta?: { changes?: number } } | undefined): boolean => (r?.meta?.changes ?? 0) === 1;
const b = (v: boolean): number => (v ? 1 : 0);
const COLUNAS_ORGAO = `o.id, o.cnpj, o.nome, o.sigla, o.ativo, o.revisao, o.criado_por, o.criado_em, o.atualizado_em,
  (SELECT count(*) FROM contratacao_pncp v WHERE v.prefeitura_id = o.prefeitura_id AND v.orgao_id = o.id AND v.desvinculado_em IS NULL) AS vinculos_ativos,
  (SELECT max(v.ultima_coleta_em) FROM contratacao_pncp v WHERE v.prefeitura_id = o.prefeitura_id AND v.orgao_id = o.id) AS ultima_coleta_em`;
const COLUNAS_VINCULO = `v.id, v.contratacao_id, v.orgao_id, o.nome AS orgao_nome, v.cnpj, v.ano, v.sequencial, v.numero_controle, v.modo, v.vinculado_por, v.vinculado_em,
  v.ultima_tentativa_em, v.ultima_coleta_em, v.ultimo_status, v.ultimo_erro`;
const DE_VINCULO = 'FROM contratacao_pncp v JOIN pncp_orgao o ON o.prefeitura_id = v.prefeitura_id AND o.id = v.orgao_id JOIN contratacao ct ON ct.prefeitura_id = v.prefeitura_id AND ct.id = v.contratacao_id AND ct.removida_em IS NULL';
const SQL_ITENS = `INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, descricao, material_servico, categoria_id, categoria_nome, criterio_nome, situacao_id, situacao_nome, tem_resultado, valor_total)
  SELECT ?, ?, json_extract(value, '$.numero_item'), json_extract(value, '$.descricao'), json_extract(value, '$.material_servico'), json_extract(value, '$.categoria_id'), json_extract(value, '$.categoria_nome'), json_extract(value, '$.criterio_nome'), json_extract(value, '$.situacao_id'), json_extract(value, '$.situacao_nome'), json_extract(value, '$.tem_resultado'), json_extract(value, '$.valor_total') FROM json_each(?)`;
const SQL_RESULTADOS = `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni, fornecedor_nome, ordem_classificacao, situacao_id, situacao_nome, valor_homologado, data_resultado, motivo_cancelamento)
  SELECT ?, ?, json_extract(value, '$.numero_item'), json_extract(value, '$.sequencial_resultado'), json_extract(value, '$.tipo_pessoa'), json_extract(value, '$.fornecedor_ni'), json_extract(value, '$.fornecedor_nome'), json_extract(value, '$.ordem_classificacao'), json_extract(value, '$.situacao_id'), json_extract(value, '$.situacao_nome'), json_extract(value, '$.valor_homologado'), json_extract(value, '$.data_resultado'), json_extract(value, '$.motivo_cancelamento') FROM json_each(?)`;
const paraOrgao = (r: any): Orgao => ({ ...r, ativo: Number(r.ativo) === 1, vinculos_ativos: Number(r.vinculos_ativos) });

export function criarRepositorioPncp(db: BancoD1, prefeituraId: number): RepositorioPncp {
  if (!Number.isInteger(prefeituraId) || prefeituraId <= 0) throw new Error('prefeituraId deve ser inteiro positivo.');
  const eventoSql =
    `INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, orgao_id, vinculo_id, autor, em, descricao, detalhe)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`;
  const evento = (tipo: string, ids: { contratacao?: string; orgao?: string; vinculo?: string }, autor: string, emIso: string, descricao: string | null, detalhe: unknown = null) =>
    db.prepare(eventoSql).bind(crypto.randomUUID(), prefeituraId, tipo, ids.contratacao ?? null, ids.orgao ?? null, ids.vinculo ?? null, autor, emIso,
      descricao === null ? null : Array.from(descricao).slice(0, 500).join(''), detalhe === null ? null : JSON.stringify(detalhe));
  // Eventos de vínculo: a contratação vem SEMPRE da linha do vínculo (nunca de parâmetro do pedido). Precisa vir logo depois da escrita (changes() = 1).
  const eventoVinculo = (tipo: string, vinculoId: string, autor: string, emIso: string, descricao: string | null, detalhe: unknown = null) =>
    db.prepare(`INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em, descricao, detalhe)
      SELECT ?, prefeitura_id, ? , contratacao_id, id, ?, ?, ?, ? FROM contratacao_pncp WHERE prefeitura_id = ? AND id = ? AND changes() = 1`)
      .bind(crypto.randomUUID(), tipo, autor, emIso, descricao === null ? null : Array.from(descricao).slice(0, 500).join(''), detalhe === null ? null : JSON.stringify(detalhe), prefeituraId, vinculoId);
  const obterOrgao = (id: string): Promise<Orgao | null> =>
    db.prepare(`SELECT ${COLUNAS_ORGAO} FROM pncp_orgao o WHERE o.prefeitura_id = ? AND o.id = ?`).bind(prefeituraId, id).first<any>().then((r) => (r ? paraOrgao(r) : null));
  const vinculoAtivoPorId = (id: string): Promise<VinculoPncp | null> =>
    db.prepare(`SELECT ${COLUNAS_VINCULO} ${DE_VINCULO} WHERE v.prefeitura_id = ? AND v.id = ? AND v.desvinculado_em IS NULL`).bind(prefeituraId, id).first<VinculoPncp>();
  return {
    async listarOrgaos() {
      const r = await db.prepare(`SELECT ${COLUNAS_ORGAO} FROM pncp_orgao o WHERE o.prefeitura_id = ? ORDER BY o.nome, o.id LIMIT ${MAX_ORGAOS}`).bind(prefeituraId).all();
      return r.results.map(paraOrgao);
    },
    obterOrgao,
    async obterOrgaoAtivoPorCnpj(cnpj) {
      const r = await db.prepare(`SELECT ${COLUNAS_ORGAO} FROM pncp_orgao o WHERE o.prefeitura_id = ? AND o.cnpj = ? AND o.ativo = 1`).bind(prefeituraId, cnpj).first<any>();
      return r ? paraOrgao(r) : null;
    },
    async criarOrgao(o, autor, emIso) {
      const [r] = await db.batch([
        db.prepare(
          `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, sigla, criado_por, criado_em, atualizado_por, atualizado_em)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE (SELECT count(*) FROM pncp_orgao WHERE prefeitura_id = ?) < ?
              AND NOT EXISTS (SELECT 1 FROM pncp_orgao WHERE prefeitura_id = ? AND cnpj = ?)`,
        ).bind(prefeituraId, o.id, o.cnpj, o.nome, o.sigla, autor, emIso, autor, emIso, prefeituraId, MAX_ORGAOS, prefeituraId, o.cnpj),
        evento('orgao_cadastrado', { orgao: o.id }, autor, emIso, `Secretaria cadastrada: ${o.nome} (${formatarCnpj(o.cnpj)})`, { cnpj: o.cnpj, nome: o.nome, sigla: o.sigla }),
      ]);
      if (mudou(r)) return 'ok';
      const existe = await db.prepare('SELECT 1 AS ok FROM pncp_orgao WHERE prefeitura_id = ? AND cnpj = ?').bind(prefeituraId, o.cnpj).first();
      return existe ? 'duplicado' : 'limite';
    },
    async editarOrgao(id, revisao, campos, diff, autor, emIso) {
      const [r] = await db.batch([
        db.prepare('UPDATE pncp_orgao SET nome = ?, sigla = ?, revisao = revisao + 1, atualizado_por = ?, atualizado_em = ? WHERE prefeitura_id = ? AND id = ? AND revisao = ?')
          .bind(campos.nome, campos.sigla, autor, emIso, prefeituraId, id, revisao),
        evento('orgao_editado', { orgao: id }, autor, emIso, `Secretaria editada: ${campos.nome}`, diff),
      ]);
      if (mudou(r)) return 'ok';
      return (await obterOrgao(id)) ? 'conflito' : 'inexistente';
    },
    async mudarAtivoOrgao(id, revisao, ativo, autor, emIso) {
      const antes = await obterOrgao(id);
      if (!antes) return 'inexistente';
      const quem = `${antes.nome} (${formatarCnpj(antes.cnpj)})`;
      const [r] = await db.batch([
        db.prepare(
          `UPDATE pncp_orgao SET ativo = ?, revisao = revisao + 1, atualizado_por = ?, atualizado_em = ?
            WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND ativo = ?
              AND (? = 1 OR NOT EXISTS (SELECT 1 FROM contratacao_pncp v WHERE v.prefeitura_id = ? AND v.orgao_id = ? AND v.desvinculado_em IS NULL))`,
        ).bind(b(ativo), autor, emIso, prefeituraId, id, revisao, b(!ativo), b(ativo), prefeituraId, id),
        evento(ativo ? 'orgao_reativado' : 'orgao_desativado', { orgao: id }, autor, emIso, ativo ? `Secretaria reativada: ${quem}` : `Secretaria desativada: ${quem}`, { ativo: { de: !ativo, para: ativo } }),
      ]);
      if (mudou(r)) return 'ok';
      const atual = await obterOrgao(id);
      if (!atual) return 'inexistente';
      if (!ativo && atual.revisao === revisao && atual.ativo && atual.vinculos_ativos > 0) return 'com_vinculos';
      return 'conflito';
    },
    obterVinculoAtivo(contratacaoId) {
      return db.prepare(`SELECT ${COLUNAS_VINCULO} ${DE_VINCULO} WHERE v.prefeitura_id = ? AND v.contratacao_id = ? AND v.desvinculado_em IS NULL`).bind(prefeituraId, contratacaoId).first<VinculoPncp>();
    },
    async obterVinculoAtivoDaCompra(cnpj, ano, sequencial) {
      return db.prepare(
        `SELECT v.id AS vinculo_id, v.contratacao_id, c.nome FROM contratacao_pncp v
           JOIN contratacao c ON c.prefeitura_id = v.prefeitura_id AND c.id = v.contratacao_id
          WHERE v.prefeitura_id = ? AND v.cnpj = ? AND v.ano = ? AND v.sequencial = ? AND v.desvinculado_em IS NULL`,
      ).bind(prefeituraId, cnpj, ano, sequencial).first<{ vinculo_id: string; contratacao_id: string; nome: string }>();
    },
    async listarVinculosAtivosDoOrgao(orgaoId, limite) {
      const r = await db.prepare(
        `SELECT ${COLUNAS_VINCULO} ${DE_VINCULO} WHERE v.prefeitura_id = ? AND v.orgao_id = ? AND v.desvinculado_em IS NULL
          ORDER BY (v.ultima_tentativa_em IS NOT NULL), v.ultima_tentativa_em, v.id LIMIT ?`,
      ).bind(prefeituraId, orgaoId, limite).all();
      return r.results as unknown as VinculoPncp[];
    },
    async obterRetrato(vinculoId) {
      const compra = await db.prepare('SELECT situacao_id, situacao_nome, existe_resultado, srp, modalidade_id, modalidade_nome, amparo_codigo, amparo_nome, obra, numero_compra, processo, objeto, valor_estimado, valor_homologado, data_publicacao, data_abertura, data_encerramento, data_atualizacao_global, itens_total, incompleto, coletado_em FROM pncp_compra WHERE prefeitura_id = ? AND vinculo_id = ?')
        .bind(prefeituraId, vinculoId).first<any>();
      const itens = await db.prepare('SELECT numero_item, descricao, material_servico, categoria_id, categoria_nome, criterio_nome, situacao_id, situacao_nome, tem_resultado, valor_total FROM pncp_item WHERE prefeitura_id = ? AND vinculo_id = ? ORDER BY numero_item')
        .bind(prefeituraId, vinculoId).all();
      const resultados = await db.prepare('SELECT numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni, fornecedor_nome, ordem_classificacao, situacao_id, situacao_nome, valor_homologado, data_resultado, motivo_cancelamento FROM pncp_resultado WHERE prefeitura_id = ? AND vinculo_id = ? ORDER BY numero_item, sequencial_resultado')
        .bind(prefeituraId, vinculoId).all();
      return {
        compra: compra ? { ...compra, existe_resultado: Number(compra.existe_resultado) === 1, srp: Number(compra.srp) === 1, incompleto: Number(compra.incompleto) === 1 } : null,
        itens: itens.results.map((i: any) => ({ ...i, tem_resultado: Number(i.tem_resultado) === 1 })) as RetratoItem[],
        resultados: resultados.results as unknown as RetratoResultado[],
      };
    },
    async historico(contratacaoId, limite) {
      const r = await db.prepare(
        'SELECT id, tipo, contratacao_id, orgao_id, vinculo_id, autor, em, descricao, detalhe FROM evento_pncp WHERE prefeitura_id = ? AND contratacao_id = ? ORDER BY em DESC, id DESC LIMIT ?',
      ).bind(prefeituraId, contratacaoId, limite).all();
      return r.results.map((x: any) => ({ ...x, detalhe: x.detalhe ? JSON.parse(String(x.detalhe)) : null })) as EventoPncp[];
    },
    async vincular(v, autor, emIso) {
      try {
        await db.batch([
          db.prepare(
            `INSERT INTO contratacao_pncp (prefeitura_id, id, contratacao_id, orgao_id, cnpj, ano, sequencial, numero_controle, modo, vinculado_por, vinculado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
          ).bind(prefeituraId, v.id, v.contratacaoId, v.orgaoId, v.cnpj, v.ano, v.sequencial, v.numeroControle, autor, emIso),
          eventoVinculo('vinculo', v.id, autor, emIso, `Ligada à compra ${v.numeroControle} do PNCP`, { numero_controle: v.numeroControle, obra: v.obra }),
        ]);
        return 'ok';
      } catch {
        const contratacao = await db.prepare('SELECT 1 AS ok FROM contratacao_pncp WHERE prefeitura_id = ? AND contratacao_id = ? AND desvinculado_em IS NULL').bind(prefeituraId, v.contratacaoId).first();
        if (contratacao) return 'contratacao_ligada';
        const compra = await db.prepare('SELECT 1 AS ok FROM contratacao_pncp WHERE prefeitura_id = ? AND cnpj = ? AND ano = ? AND sequencial = ? AND desvinculado_em IS NULL').bind(prefeituraId, v.cnpj, v.ano, v.sequencial).first();
        return compra ? 'compra_ligada' : 'invalido';
      }
    },
    async desvincular(contratacaoId, vinculoId, motivo, autor, emIso) {
      const [r] = await db.batch([
        db.prepare('UPDATE contratacao_pncp SET desvinculado_em = ?, desvinculado_por = ? WHERE prefeitura_id = ? AND id = ? AND contratacao_id = ? AND desvinculado_em IS NULL')
          .bind(emIso, autor, prefeituraId, vinculoId, contratacaoId),
        eventoVinculo('desvinculo', vinculoId, autor, emIso, motivo),
      ]);
      return mudou(r) ? 'ok' : 'inexistente';
    },
    async reservarTentativa(vinculoId, emIso, limiteOkIso, limiteErroIso) {
      const [r] = await db.batch([
        db.prepare(
          `UPDATE contratacao_pncp SET ultima_tentativa_em = ?, ultimo_status = coalesce(ultimo_status, 'erro')
            WHERE prefeitura_id = ? AND id = ? AND desvinculado_em IS NULL
              AND EXISTS (SELECT 1 FROM contratacao ct WHERE ct.prefeitura_id = contratacao_pncp.prefeitura_id AND ct.id = contratacao_pncp.contratacao_id AND ct.removida_em IS NULL)
              AND (ultima_tentativa_em IS NULL OR (ultimo_status = 'ok' AND ultima_tentativa_em < ?) OR (ultimo_status <> 'ok' AND ultima_tentativa_em < ?))`,
        ).bind(emIso, prefeituraId, vinculoId, limiteOkIso, limiteErroIso),
      ]);
      return mudou(r);
    },
    async coletasNaUltimaHora(desdeIso) {
      const r = await db.prepare("SELECT count(*) AS n FROM evento_pncp WHERE prefeitura_id = ? AND tipo IN ('coleta_ok', 'coleta_erro') AND em >= ?").bind(prefeituraId, desdeIso).first<{ n: number }>();
      return Number(r?.n ?? 0);
    },
    async gravarRetrato(v, coleta, autor, emIso) {
      const c = coleta.compra;
      const numeros = new Set(coleta.itens.map((i) => i.numeroItem));
      // Itens e resultados entram por json_each, UM parâmetro por instrução e até 500 linhas por pedaço (limites do D1).
      const pedacos = <T>(l: T[]): T[][] => Array.from({ length: Math.ceil(l.length / 500) }, (_, k) => l.slice(k * 500, k * 500 + 500));
      const itensJson = coleta.itens.map((i) => ({
        numero_item: i.numeroItem, descricao: i.descricao, material_servico: i.materialServico, categoria_id: i.categoriaId, categoria_nome: i.categoriaNome,
        criterio_nome: i.criterioNome, situacao_id: i.situacaoId, situacao_nome: i.situacaoNome, tem_resultado: b(i.temResultado), valor_total: i.valorTotal,
      }));
      const resultadosJson = coleta.resultados.filter((x) => numeros.has(x.numeroItem)).map((x) => ({
        numero_item: x.numeroItem, sequencial_resultado: x.sequencialResultado, tipo_pessoa: x.tipoPessoa, fornecedor_ni: x.fornecedorNi, fornecedor_nome: x.fornecedorNome,
        ordem_classificacao: x.ordemClassificacao, situacao_id: x.situacaoId, situacao_nome: x.situacaoNome, valor_homologado: x.valorHomologado,
        data_resultado: x.dataResultado, motivo_cancelamento: x.motivoCancelamento,
      }));
      const lote = [
        db.prepare('DELETE FROM pncp_resultado WHERE prefeitura_id = ? AND vinculo_id = ?').bind(prefeituraId, v.id),
        db.prepare('DELETE FROM pncp_item WHERE prefeitura_id = ? AND vinculo_id = ?').bind(prefeituraId, v.id),
        db.prepare(
          `INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, situacao_nome, existe_resultado, srp, modalidade_id, modalidade_nome, amparo_codigo, amparo_nome, obra,
             numero_compra, processo, objeto, valor_estimado, valor_homologado, data_publicacao, data_abertura, data_encerramento, data_atualizacao_global, itens_total, incompleto, coletado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (prefeitura_id, vinculo_id) DO UPDATE SET
             situacao_id = excluded.situacao_id, situacao_nome = excluded.situacao_nome, existe_resultado = excluded.existe_resultado, srp = excluded.srp,
             modalidade_id = excluded.modalidade_id, modalidade_nome = excluded.modalidade_nome, amparo_codigo = excluded.amparo_codigo, amparo_nome = excluded.amparo_nome,
             obra = excluded.obra, numero_compra = excluded.numero_compra, processo = excluded.processo, objeto = excluded.objeto,
             valor_estimado = excluded.valor_estimado, valor_homologado = excluded.valor_homologado, data_publicacao = excluded.data_publicacao,
             data_abertura = excluded.data_abertura, data_encerramento = excluded.data_encerramento, data_atualizacao_global = excluded.data_atualizacao_global,
             itens_total = excluded.itens_total, incompleto = excluded.incompleto, coletado_em = excluded.coletado_em`,
        ).bind(prefeituraId, v.id, c.situacaoId, c.situacaoNome, b(c.existeResultado), b(c.srp), c.modalidadeId, c.modalidadeNome, c.amparoCodigo, c.amparoNome, c.obra,
          c.numeroCompra, c.processo, c.objeto, c.valorEstimado, c.valorHomologado, c.dataPublicacao, c.dataAbertura, c.dataEncerramento, c.dataAtualizacaoGlobal,
          coleta.itensTotal, b(coleta.incompleto), emIso),
        ...pedacos(itensJson).map((p) => db.prepare(SQL_ITENS).bind(prefeituraId, v.id, JSON.stringify(p))),
        ...pedacos(resultadosJson).map((p) => db.prepare(SQL_RESULTADOS).bind(prefeituraId, v.id, JSON.stringify(p))),
        db.prepare("UPDATE contratacao_pncp SET ultima_coleta_em = ?, ultimo_status = 'ok', ultimo_erro = NULL WHERE prefeitura_id = ? AND id = ? AND desvinculado_em IS NULL").bind(emIso, prefeituraId, v.id),
        eventoVinculo('coleta_ok', v.id, autor, emIso,
          `Dados do PNCP atualizados: ${coleta.itensTotal} itens, ${resultadosJson.length} resultados`,
          { itens: coleta.itensTotal, resultados: resultadosJson.length, incompleto: coleta.incompleto, situacao_id: c.situacaoId }),
      ];
      try {
        await db.batch(lote);
        return 'ok';
      } catch {
        if (!(await vinculoAtivoPorId(v.id))) return 'desligado';
        console.warn('[pncp] lote recusado');
        return 'recusado';
      }
    },
    async gravarFalha(v, status, motivo, autor, emIso) {
      const [r] = await db.batch([
        db.prepare('UPDATE contratacao_pncp SET ultimo_status = ?, ultimo_erro = ? WHERE prefeitura_id = ? AND id = ? AND desvinculado_em IS NULL')
          .bind(status, Array.from(motivo).slice(0, 200).join(''), prefeituraId, v.id),
        eventoVinculo('coleta_erro', v.id, autor, emIso, motivo, { status }),
      ]);
      return mudou(r) ? 'ok' : 'desligado';
    },
    async historicoOrgao(orgaoId, limite) {
      const r = await db.prepare(
        'SELECT id, tipo, contratacao_id, orgao_id, vinculo_id, autor, em, descricao, detalhe FROM evento_pncp WHERE prefeitura_id = ? AND orgao_id = ? ORDER BY em DESC, id DESC LIMIT ?',
      ).bind(prefeituraId, orgaoId, limite).all();
      return r.results.map((x: any) => ({ ...x, detalhe: x.detalhe ? JSON.parse(String(x.detalhe)) : null })) as EventoPncp[];
    },
  };
}
