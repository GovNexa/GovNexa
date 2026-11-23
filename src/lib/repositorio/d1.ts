// D1: consultas parametrizadas e gravações atômicas por batch.
import { aplicarEvento, criarProjeto, FAIXA_CADASTRO, SEM_ALTERACAO } from '../carteira/movimentacao.ts';
import type { Evento, RegistroHistorico } from '../carteira/movimentacao.ts';
import type { Projeto } from '../carteira/tipos.ts';
import { CAMPOS_TAREFA, planejar, type EstadoCronograma, type TarefaAtual } from '../cronograma/planejar.ts';
import type { Cronograma, EtapaCronograma, FaseCronograma, TrocaResponsavel } from '../cronograma/tipos.ts';
import { planejarItem } from '../cronograma/recursos-regras.ts';
import type { DadosEnvolvido, DadosRecurso, Envolvido, ItensCronograma, Recurso } from '../cronograma/recursos.ts';
import { statusNaData } from '../cronograma/visoes.ts';
import type { RegistroLog } from '../log/tipos.ts';
import { criarRepositorioDocumentos } from '../documentos/repositorio.ts';
import { criarRepositorioContratacoes } from '../contratacoes/repositorio.ts';
import { criarRepositorioFotos } from '../fotos/repositorio.ts';
import { criarRepositorioPncp } from '../pncp/repositorio.ts';
import type { RepositorioProjetos, ResultadoAplicacao, ResultadoCriacaoCronograma, ResultadoCriacaoProjeto, ResultadoEdicao, ResultadoGravacaoCronograma, ResultadoGravacaoItem, ResultadoMovimento } from './tipos.ts';

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
  'corredor', 'origem_valor', 'tem_projeto', 'prioridade', 'compromisso', 'tipo_contratacao', 'orgao_contratacao', 'solicitacoes_financeiras', 'area',
] as const;
const COLUNAS_MARCA = ['prioritario'] as const;
const COLUNAS_JSON = ['valores', 'recurso', 'datas', 'por_ano', 'atualizacao', 'operacional', 'origem', 'localizacao'] as const;
const COLUNAS_ARRAY = ['sei', 'pendencias'] as const;
const TODAS = ['id', 'codigo_legado', ...COLUNAS_TEXTO, ...COLUNAS_MARCA, ...COLUNAS_JSON, ...COLUNAS_ARRAY] as const;
const LISTA_COLUNAS = TODAS.join(', ');

function linhaParaProjeto(r: any): Projeto {
  const p: any = {};
  for (const c of TODAS) p[c] = decodificar(c, r[c]) ?? (c === 'sei' || c === 'pendencias' ? [] : null);
  if (p.tem_projeto != null) p.tem_projeto = Boolean(p.tem_projeto);
  p.prioritario = Boolean(p.prioritario);
  return p as Projeto;
}
// Nomes de coluna vêm de listas fixas no código; valores são parâmetros das gravações.
function colunasGravaveis(p: Projeto): { cols: string[]; valores: unknown[] } {
  return {
    cols: [...COLUNAS_TEXTO, ...COLUNAS_MARCA, ...COLUNAS_JSON, ...COLUNAS_ARRAY],
    valores: [
      ...COLUNAS_TEXTO.map((c) => p[c] ?? null),
      ...COLUNAS_MARCA.map((c) => p[c] === true ? 1 : 0),
      ...COLUNAS_JSON.map((c) => p[c] == null ? null : JSON.stringify(p[c])),
      ...COLUNAS_ARRAY.map((c) => JSON.stringify(p[c] ?? [])),
    ],
  };
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

  async function gravarEventos(cliente: ClienteSql, historico: RegistroHistorico[]): Promise<void> {
    for (const h of historico) {
      await cliente.gravar(
        `INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [h.id, prefeituraId, h.projeto_id, h.tipo, h.origem, h.autor, h.em, h.de ?? null, h.para ?? null,
          h.campos ? JSON.stringify(h.campos) : null, h.motivo ?? null, h.forcado ?? false, h.descricao ?? null],
      );
    }
  }

  async function criarUmProjeto(dados: Parameters<RepositorioProjetos['criarProjeto']>[0], autor: string): Promise<ResultadoCriacaoProjeto> {
    return transacao(async (cliente): Promise<ResultadoCriacaoProjeto> => {
      const m = await cliente.query(`SELECT coalesce(max(codigo_legado), ${FAIXA_CADASTRO - 1}) + 1 AS proximo FROM projeto WHERE prefeitura_id = ? AND codigo_legado >= ${FAIXA_CADASTRO}`, [prefeituraId]);
      const proximoCodigo = Number(m.rows[0]?.proximo ?? FAIXA_CADASTRO);
      const res = criarProjeto(dados, { autor, em: new Date().toISOString(), proximoCodigo, origem: 'cadastro' });
      if (!res.ok) return res;
      const { cols, valores } = colunasGravaveis(res.projeto);
      const nomes = ['prefeitura_id', 'id', 'codigo_legado', ...cols];
      await cliente.gravar(`INSERT INTO projeto (${nomes.join(', ')}, atualizado_em) VALUES (${nomes.map(() => '?').join(', ')}, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
        [prefeituraId, res.projeto.id, res.projeto.codigo_legado, ...valores]);
      await gravarEventos(cliente, res.historico);
      return { ok: true, projeto: res.projeto, historico: res.historico };
    });
  }

  // E20: itens ativos de tarefas ativas; `tarefaId` restringe a uma tarefa (leitura da gravação). Sempre filtrado pela prefeitura da sessão.
  const numeroOuNulo = (v: unknown): number | null => (v == null ? null : Number(v));
  const textoOuNulo = (v: unknown): string | null => (v == null ? null : String(v));
  async function lerEnvolvidos(cronogramaId: string, tarefaId: string | null): Promise<Envolvido[]> {
    const { results } = await db.prepare(
      `SELECT e.id, e.tarefa_id, e.nome, e.area, e.papel, e.observacao, e.criado_por, e.criado_em, e.atualizado_por, e.atualizado_em
         FROM tarefa_envolvido e JOIN etapa_cronograma t ON t.prefeitura_id = e.prefeitura_id AND t.id = e.tarefa_id AND t.removida_em IS NULL
        WHERE e.prefeitura_id = ? AND e.cronograma_id = ? AND e.removido_em IS NULL${tarefaId === null ? '' : ' AND e.tarefa_id = ?'} ORDER BY e.tarefa_id, e.criado_em, e.id`,
    ).bind(...(tarefaId === null ? [prefeituraId, cronogramaId] : [prefeituraId, cronogramaId, tarefaId])).all();
    return results.map((r): Envolvido => ({
      id: String(r.id), tarefa_id: String(r.tarefa_id), nome: textoOuNulo(r.nome), area: textoOuNulo(r.area), papel: textoOuNulo(r.papel), observacao: textoOuNulo(r.observacao),
      criado_por: String(r.criado_por), criado_em: String(r.criado_em), atualizado_por: textoOuNulo(r.atualizado_por), atualizado_em: textoOuNulo(r.atualizado_em),
    }));
  }
  async function lerRecursos(cronogramaId: string, tarefaId: string | null): Promise<Recurso[]> {
    const { results } = await db.prepare(
      `SELECT e.id, e.tarefa_id, e.tipo, e.descricao, e.quantidade_centesimos, e.unidade, e.valor_estimado_centavos, e.valor_utilizado_centavos, e.data_uso, e.observacao,
              e.criado_por, e.criado_em, e.atualizado_por, e.atualizado_em
         FROM tarefa_recurso e JOIN etapa_cronograma t ON t.prefeitura_id = e.prefeitura_id AND t.id = e.tarefa_id AND t.removida_em IS NULL
        WHERE e.prefeitura_id = ? AND e.cronograma_id = ? AND e.removido_em IS NULL${tarefaId === null ? '' : ' AND e.tarefa_id = ?'} ORDER BY e.tarefa_id, e.criado_em, e.id`,
    ).bind(...(tarefaId === null ? [prefeituraId, cronogramaId] : [prefeituraId, cronogramaId, tarefaId])).all();
    return results.map((r): Recurso => ({
      id: String(r.id), tarefa_id: String(r.tarefa_id), tipo: String(r.tipo) as Recurso['tipo'], descricao: String(r.descricao),
      quantidade_centesimos: numeroOuNulo(r.quantidade_centesimos), unidade: textoOuNulo(r.unidade),
      valor_estimado_centavos: numeroOuNulo(r.valor_estimado_centavos), valor_utilizado_centavos: numeroOuNulo(r.valor_utilizado_centavos),
      data_uso: textoOuNulo(r.data_uso), observacao: textoOuNulo(r.observacao),
      criado_por: String(r.criado_por), criado_em: String(r.criado_em), atualizado_por: textoOuNulo(r.atualizado_por), atualizado_em: textoOuNulo(r.atualizado_em),
    }));
  }

  // As três leituras abaixo (cronogramas, tarefas, trocas) não são do mesmo instante: uma gravação entre elas pode mostrar
  // um quadro misto. Só afeta a exibição (a gravação confere a revisão no batch); a próxima leitura corrige.
  /** Leitura única dos cronogramas (todos ou um): cronogramas, tarefas ativas (com o código estável) e o histórico de responsável. */
  async function lerCronogramas(somenteId: string | null): Promise<Cronograma[]> {
    const filtro = somenteId === null ? '' : ' AND id = ?';
    const filtroC = somenteId === null ? '' : ' AND cronograma_id = ?';
    const args = somenteId === null ? [prefeituraId] : [prefeituraId, somenteId];
    const c = await db.prepare(`SELECT id, aba, titulo, endereco, sei, projeto_id, casamento, pendencias, revisao, editado_na_tela, origem_registro, atualizado_em FROM cronograma WHERE prefeitura_id = ?${filtro} ORDER BY id`).bind(...args).all();
    const e = await db.prepare(
      `SELECT id, cronograma_id, ordem, fase, nome, unidade, responsavel, situacao_planilha, duracao_prevista,
        inicio_previsto, fim_previsto, inicio_real, fim_real, status, ciclo, pendencias, origem
       FROM etapa_cronograma WHERE prefeitura_id = ? AND removida_em IS NULL${filtroC} ORDER BY cronograma_id, ordem`,
    ).bind(...args).all();
    const t = await db.prepare(
      `SELECT id, tarefa_id, tipo, de_responsavel, de_unidade, para_responsavel, para_unidade, desde, motivo, registrado_por, registrado_em
       FROM troca_responsavel WHERE prefeitura_id = ?${filtroC} ORDER BY tarefa_id, desde, registrado_em, id`,
    ).bind(...args).all();
    const trocasPorTarefa = new Map<string, TrocaResponsavel[]>();
    for (const r of t.results) {
      const { tarefa_id, ...troca } = r;
      trocasPorTarefa.set(String(tarefa_id), [...(trocasPorTarefa.get(String(tarefa_id)) ?? []), troca as TrocaResponsavel]);
    }
    const etapasPorCronograma = new Map<string, any[]>();
    for (const raw of e.results) {
      const x = decodificarLinha(raw);
      etapasPorCronograma.set(x.cronograma_id, [...(etapasPorCronograma.get(x.cronograma_id) ?? []), x]);
    }
    return c.results.map((raw): Cronograma => {
      const row = decodificarLinha(raw);
      const fases: FaseCronograma[] = [];
      for (const x of etapasPorCronograma.get(row.id) ?? []) {
        let fase = fases.find((f) => f.nome === x.fase);
        if (!fase) {
          fase = { nome: x.fase, ordem: fases.length + 1, etapas: [] };
          fases.push(fase);
        }
        const { cronograma_id: _omitido, ...etapa } = x;
        fase.etapas.push({ ...etapa, pendencias: etapa.pendencias ?? [], origem: etapa.origem ?? null, trocas: trocasPorTarefa.get(String(etapa.id)) ?? [] } as EtapaCronograma);
      }
      return {
        id: row.id, aba: row.aba ?? '', titulo: row.titulo ?? '', endereco: row.endereco ?? null, sei: row.sei ?? [],
        projeto_id: row.projeto_id ?? null, casamento: row.casamento ?? null, fases, pendencias: row.pendencias ?? [],
        revisao: Number(row.revisao), editado_na_tela: row.editado_na_tela === 1, origem_registro: row.origem_registro === 'tela' ? 'tela' : 'planilha',
        atualizado_em: typeof row.atualizado_em === 'string' ? row.atualizado_em : null,
      };
    });
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
    fotos: criarRepositorioFotos(db, prefeituraId),
    contratacoes: criarRepositorioContratacoes(db, prefeituraId),
    pncp: criarRepositorioPncp(db, prefeituraId),
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
    async obterProjetoComRevisao(id) {
      const r = await db.prepare(`SELECT ${LISTA_COLUNAS}, revisao FROM projeto WHERE prefeitura_id = ? AND id = ?`).bind(prefeituraId, id).first();
      return r ? { projeto: linhaParaProjeto(r), revisao: Number(r.revisao) } : null;
    },
    async listarAreas(incluirInativas = false) {
      const ativas = incluirInativas ? '' : ' AND ativo = 1';
      const { results } = await db.prepare(`SELECT codigo, nome FROM catalogo WHERE prefeitura_id = ? AND tipo = 'area'${ativas} ORDER BY ordem, nome`).bind(prefeituraId).all();
      return results.map((r) => ({ codigo: String(r.codigo), nome: String(r.nome) }));
    },
    async editarProjeto(projetoId, revisao, campos, motivo, autor) {
      const CONFLITO = 'O projeto foi alterado por outra pessoa enquanto você editava.';
      const e: Evento = { tipo: 'atualizar_campos', projeto_id: projetoId, origem: 'ficha', autor, em: new Date().toISOString(), campos, ...(motivo ? { motivo } : {}) };
      try {
        return await transacao(async (cliente): Promise<ResultadoEdicao> => {
          const r = await cliente.query(`SELECT ${LISTA_COLUNAS}, revisao FROM projeto WHERE prefeitura_id = ? AND id = ?`, [prefeituraId, projetoId]);
          const linha = r.rows[0];
          if (!linha) return { ok: false, codigo: 'inexistente', erro: 'Projeto não encontrado.' };
          if (Number(linha.revisao) !== revisao) return { ok: false, codigo: 'conflito', erro: CONFLITO };
          const res = aplicarEvento(linhaParaProjeto(linha), e);
          if (!res.ok) return res.erro === SEM_ALTERACAO ? { ok: true, mudou: false, historico: [] } : { ok: false, codigo: 'invalido', erro: res.erro };
          const { cols, valores } = colunasGravaveis(res.projeto);
          await cliente.gravar(`UPDATE projeto SET ${cols.map((c) => `${c} = ?`).join(', ')}, revisao = CASE WHEN revisao = ? THEN revisao + 1 ELSE NULL END, atualizado_em = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE prefeitura_id = ? AND id = ?`, [...valores, revisao, prefeituraId, projetoId]);
          const historico = res.historico.map((h) => ({ ...h, id: crypto.randomUUID() }));
          await gravarEventos(cliente, historico);
          return { ok: true, mudou: true, historico };
        });
      } catch (erro) {
        if (/NOT NULL constraint failed: projeto\.revisao/.test(String(erro))) return { ok: false, codigo: 'conflito', erro: CONFLITO };
        if (/Área inválida/.test(String(erro))) return { ok: false, codigo: 'invalido', erro: 'Área: valor não permitido.' };
        throw erro;
      }
    },
    async listarRevisoes() {
      const { results } = await db.prepare('SELECT id, revisao FROM projeto WHERE prefeitura_id = ?').bind(prefeituraId).all();
      return new Map(results.map((r) => [String(r.id), Number(r.revisao)]));
    },
    async moverProjeto(projetoId, pedido, autor): Promise<ResultadoMovimento> {
      // E7/B3: lê com a revisão, confere a revisão E a etapa que a pessoa viu, aplica a regra única (portão e motivo) e grava
      // a etapa e o evento no mesmo lote. O UPDATE só vale se a revisão e a etapa ainda forem as lidas; o evento só entra se o
      // UPDATE mudou uma linha (changes() = 1). Duas pessoas ao mesmo tempo: só uma grava; a outra recebe conflito.
      const CONFLITO = 'O projeto foi alterado por outra pessoa. Recarregue a página e tente de novo.';
      const linha = await db.prepare(`SELECT ${LISTA_COLUNAS}, revisao FROM projeto WHERE prefeitura_id = ? AND id = ?`).bind(prefeituraId, projetoId).first();
      if (!linha) return { ok: false, codigo: 'inexistente', erro: 'Projeto não encontrado.' };
      const atual = linhaParaProjeto(linha);
      if (Number(linha.revisao) !== pedido.revisao || atual.macroetapa !== pedido.de) return { ok: false, codigo: 'conflito', erro: CONFLITO };
      const e: Evento = {
        tipo: 'mover_macroetapa', projeto_id: projetoId, origem: pedido.origem, autor, em: new Date().toISOString(), para: pedido.para,
        ...(pedido.motivo ? { motivo: pedido.motivo } : {}), ...(pedido.forcar ? { forcar: true } : {}),
      };
      const res = aplicarEvento(atual, e);
      if (!res.ok) return { ok: false, codigo: 'regra', erro: res.erro, ...(res.faltando ? { faltando: res.faltando } : {}) };
      const h = res.historico[0];
      const [r] = await db.batch([
        db.prepare("UPDATE projeto SET macroetapa = ?, revisao = revisao + 1, atualizado_em = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND macroetapa IS ?")
          .bind(pedido.para, prefeituraId, projetoId, pedido.revisao, pedido.de),
        db.prepare(
          "INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, de, para, motivo, forcado) SELECT ?, ?, ?, 'mover_macroetapa', ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1",
        ).bind(crypto.randomUUID(), prefeituraId, projetoId, pedido.origem, autor, h.em, h.de ?? null, pedido.para, h.motivo ?? null, h.forcado ? 1 : 0),
      ]);
      if ((r?.meta?.changes ?? 0) !== 1) return { ok: false, codigo: 'conflito', erro: CONFLITO };
      return { ok: true, revisao: pedido.revisao + 1, projeto: res.projeto, forcado: h.forcado === true };
    },
    historico: (projetoId) =>
      transacao(async (cliente) => {
        // Direto nas duas tabelas, pelos índices (prefeitura_id, projeto_id, em) da migração 0004. Mesmo resultado da visão
        // log_alteracoes para um projeto, sem ler os eventos de sistema dos outros projetos.
        // O rowid preserva a ordem de gravação das edições com o mesmo horário.
        const r = await cliente.query(
          `SELECT id, projeto_id, tipo, origem, autor, em, de, para, campos, motivo, forcado, descricao,
                  CASE WHEN tipo = 'atualizar_campos' AND origem = 'ficha' THEN rowid END AS ordem_edicao
             FROM evento_projeto WHERE prefeitura_id = ? AND projeto_id = ?
           UNION ALL
           SELECT id, projeto_id, tipo, origem, autor, em, json_extract(detalhes, '$.de'), json_extract(detalhes, '$.para'),
                  json_extract(detalhes, '$.campos'), json_extract(detalhes, '$.motivo'), json_extract(detalhes, '$.forcado'), descricao,
                  NULL
             FROM evento_sistema WHERE prefeitura_id = ? AND projeto_id = ?
           ORDER BY em, ordem_edicao, id`,
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
    listarCronogramas: () => lerCronogramas(null),
    async obterCronograma(id) {
      const [c] = await lerCronogramas(id);
      return c ? { cronograma: c, revisao: c.revisao ?? 0 } : null;
    },
    async gravarCronograma(id, revisao, op, ctx): Promise<ResultadoGravacaoCronograma> {
      // E13: lê o cronograma e as tarefas ativas, deixa a regra pura decidir (planejar) e grava TUDO num único batch.
      // O primeiro comando só vale se a revisão ainda for a lida (CASE ... ELSE NULL aborta o lote inteiro: 409).
      const CONFLITO = 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.';
      const cab = await db.prepare('SELECT id, titulo, projeto_id, revisao FROM cronograma WHERE prefeitura_id = ? AND id = ?').bind(prefeituraId, id).first<{ id: string; titulo: string | null; projeto_id: string | null; revisao: number }>();
      if (!cab) return { ok: false, codigo: 'inexistente', erro: 'Cronograma não encontrado.' };
      if (Number(cab.revisao) !== revisao) return { ok: false, codigo: 'conflito', erro: CONFLITO };
      const { results: linhas } = await db.prepare(
        `SELECT id, ordem, fase, nome, unidade, responsavel, duracao_prevista, inicio_previsto, fim_previsto, inicio_real, fim_real
           FROM etapa_cronograma WHERE prefeitura_id = ? AND cronograma_id = ? AND removida_em IS NULL ORDER BY ordem`,
      ).bind(prefeituraId, id).all();
      const { results: agregadas } = await db.prepare(
        'SELECT tarefa_id, max(desde) AS ultima, count(*) AS n FROM troca_responsavel WHERE prefeitura_id = ? AND cronograma_id = ? GROUP BY tarefa_id',
      ).bind(prefeituraId, id).all();
      const trocas = new Map(agregadas.map((r) => [String(r.tarefa_id), { ultima: String(r.ultima), n: Number(r.n) }]));
      const estado: EstadoCronograma = {
        id, titulo: cab.titulo ?? '', projeto_id: cab.projeto_id ?? null, revisao,
        tarefas: linhas.map((r): TarefaAtual => ({
          id: String(r.id), ordem: Number(r.ordem), fase: r.fase ?? '', nome: String(r.nome), unidade: r.unidade ?? null, responsavel: r.responsavel ?? null,
          duracao_prevista: r.duracao_prevista == null ? null : Number(r.duracao_prevista), inicio_previsto: r.inicio_previsto ?? null,
          fim_previsto: r.fim_previsto ?? null, inicio_real: r.inicio_real ?? null, fim_real: r.fim_real ?? null,
          ultima_troca: trocas.get(String(r.id))?.ultima ?? null, tem_trocas: (trocas.get(String(r.id))?.n ?? 0) > 0,
        })),
      };
      const decisao = planejar(estado, op, { autor: ctx.autor, agora: ctx.agora, hoje: ctx.hoje, novoId: () => crypto.randomUUID() });
      if (!decisao.ok) return decisao.codigo === 'sem_mudanca' ? { ok: true, mudou: false, revisao } : { ok: false, codigo: decisao.codigo, erro: decisao.erro };
      const { plano } = decisao;
      const ond = [prefeituraId, id] as const;
      const lote: StatementD1[] = [
        db.prepare('UPDATE cronograma SET revisao = CASE WHEN revisao = ? THEN revisao + 1 ELSE NULL END, editado_na_tela = 1, atualizado_em = ? WHERE prefeitura_id = ? AND id = ?')
          .bind(revisao, ctx.agora, prefeituraId, id),
      ];
      if (plano.remover) {
        lote.push(db.prepare('UPDATE etapa_cronograma SET removida_em = ?, removida_por = ?, motivo_remocao = ?, atualizada_por = ?, atualizada_em = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND id = ? AND removida_em IS NULL')
          .bind(ctx.agora, ctx.autor, plano.remover.motivo, ctx.autor, ctx.agora, ...ond, plano.remover.id));
      }
      // Posições em dois tempos (negativas e depois finais) para não esbarrar no índice único das posições ativas.
      if (plano.ordens.length) lote.push(db.prepare('UPDATE etapa_cronograma SET ordem = -ordem WHERE prefeitura_id = ? AND cronograma_id = ? AND removida_em IS NULL AND ordem > 0').bind(...ond));
      if (plano.inserir) {
        const n = plano.inserir;
        lote.push(db.prepare(
          `INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, fase, nome, unidade, responsavel, situacao_planilha, duracao_prevista, inicio_previsto, fim_previsto, inicio_real, fim_real, status, ciclo, pendencias, origem, origem_registro, criada_por, criada_em, atualizada_por, atualizada_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, '[]', NULL, 'tela', ?, ?, ?, ?)`,
        ).bind(prefeituraId, n.id, id, n.ordem, n.fase, n.nome, n.unidade, n.responsavel, n.duracao_prevista, n.inicio_previsto, n.fim_previsto, n.inicio_real, n.fim_real,
          statusNaData(n, ctx.hoje), ctx.autor, ctx.agora, ctx.autor, ctx.agora));
      }
      for (const o of plano.ordens) {
        if (o.id === plano.inserir?.id) continue;
        lote.push(db.prepare('UPDATE etapa_cronograma SET ordem = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND id = ? AND removida_em IS NULL').bind(o.ordem, ...ond, o.id));
      }
      if (plano.atualizar) {
        const antes = estado.tarefas.find((t) => t.id === plano.atualizar!.id)!;
        const mesclada = { ...antes, ...plano.atualizar.campos };
        const cols = CAMPOS_TAREFA.filter((c) => Object.hasOwn(plano.atualizar!.campos, c)); // nomes de coluna só desta lista fixa
        lote.push(db.prepare(`UPDATE etapa_cronograma SET ${cols.map((c) => `${c} = ?`).join(', ')}, status = ?, atualizada_por = ?, atualizada_em = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND id = ? AND removida_em IS NULL`)
          .bind(...cols.map((c) => plano.atualizar!.campos[c] ?? null), statusNaData(mesclada, ctx.hoje), ctx.autor, ctx.agora, ...ond, plano.atualizar.id));
      }
      if (plano.troca) {
        const t = plano.troca;
        if (!plano.inserir) {
          lote.push(db.prepare('UPDATE etapa_cronograma SET responsavel = ?, unidade = ?, atualizada_por = ?, atualizada_em = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND id = ? AND removida_em IS NULL')
            .bind(t.para_responsavel, t.para_unidade, ctx.autor, ctx.agora, ...ond, t.tarefa_id));
        }
        lote.push(db.prepare(
          'INSERT INTO troca_responsavel (prefeitura_id, id, cronograma_id, tarefa_id, tipo, de_responsavel, de_unidade, para_responsavel, para_unidade, desde, motivo, registrado_por, registrado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(prefeituraId, t.id, id, t.tarefa_id, t.tipo, t.de_responsavel, t.de_unidade, t.para_responsavel, t.para_unidade, t.desde, t.motivo, t.registrado_por, t.registrado_em));
      }
      lote.push(db.prepare('UPDATE cronograma SET revisao = NULL WHERE prefeitura_id = ? AND id = ? AND EXISTS (SELECT 1 FROM etapa_cronograma WHERE prefeitura_id = ? AND cronograma_id = ? AND removida_em IS NULL AND ordem < 0)')
        .bind(prefeituraId, id, prefeituraId, id));
      const ev = plano.evento;
      lote.push(db.prepare("INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, motivo, descricao) SELECT ?, ?, ?, ?, 'cronograma', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM projeto WHERE prefeitura_id = ? AND id = ?)")
        .bind(crypto.randomUUID(), prefeituraId, estado.projeto_id, ev.tipo, ctx.autor, ctx.agora, ev.motivo, ev.descricao, prefeituraId, estado.projeto_id));
      lote.push(db.prepare("INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) SELECT ?, ?, ?, 'cronograma', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM projeto WHERE prefeitura_id = ? AND id = ?)")
        .bind(crypto.randomUUID(), prefeituraId, ev.tipo, ctx.autor, ctx.agora, ev.descricao, JSON.stringify({ cronograma_id: id, ...(ev.motivo ? { motivo: ev.motivo } : {}) }), prefeituraId, estado.projeto_id));
      try {
        await db.batch(lote);
      } catch (erro) {
        if (/NOT NULL constraint failed: cronograma\.revisao/.test(String(erro)) || /UNIQUE constraint failed: etapa_cronograma/.test(String(erro)) || /Tarefa não pertence ao cronograma/.test(String(erro))) {
          return { ok: false, codigo: 'conflito', erro: CONFLITO };
        }
        throw erro;
      }
      return { ok: true, mudou: true, revisao: revisao + 1, ...(decisao.tarefa_id ? { tarefa_id: decisao.tarefa_id } : {}) };
    },
    async criarCronograma({ projeto_id, titulo }, ctx): Promise<ResultadoCriacaoCronograma> {
      const id = 'C-' + crypto.randomUUID();
      const [r] = await db.batch([
        db.prepare(
          `INSERT INTO cronograma (prefeitura_id, id, aba, titulo, endereco, sei, projeto_id, casamento, pendencias, revisao, editado_na_tela, origem_registro, criado_por, criado_em, atualizado_em)
           SELECT ?, ?, NULL, ?, NULL, '[]', ?, 'tela', '[]', 0, 1, 'tela', ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM projeto WHERE prefeitura_id = ? AND id = ?)
              AND NOT EXISTS (SELECT 1 FROM cronograma WHERE prefeitura_id = ? AND projeto_id = ?)`,
        ).bind(prefeituraId, id, titulo, projeto_id, ctx.autor, ctx.agora, ctx.agora, prefeituraId, projeto_id, prefeituraId, projeto_id),
        db.prepare("INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, descricao) SELECT ?, ?, ?, 'cronograma_criado', 'cronograma', ?, ?, ? WHERE EXISTS (SELECT 1 FROM cronograma WHERE prefeitura_id = ? AND id = ?)")
          .bind(crypto.randomUUID(), prefeituraId, projeto_id, ctx.autor, ctx.agora, `Cronograma criado na tela: «${titulo}».`, prefeituraId, id),
      ]);
      if ((r?.meta?.changes ?? 0) === 1) return { ok: true, id };
      const existe = await db.prepare('SELECT 1 AS x FROM projeto WHERE prefeitura_id = ? AND id = ?').bind(prefeituraId, projeto_id).first();
      if (!existe) return { ok: false, codigo: 'inexistente', erro: 'Projeto não encontrado.' };
      const outro = await db.prepare('SELECT id FROM cronograma WHERE prefeitura_id = ? AND projeto_id = ? ORDER BY id LIMIT 1').bind(prefeituraId, projeto_id).first<{ id: string }>();
      return { ok: false, codigo: 'conflito', erro: 'Este projeto já tem cronograma.', ...(outro ? { existente: outro.id } : {}) };
    },
    async listarItensCronograma(cronogramaId): Promise<ItensCronograma> {
      const [envolvidos, recursos] = await Promise.all([lerEnvolvidos(cronogramaId, null), lerRecursos(cronogramaId, null)]);
      return { envolvidos, recursos };
    },
    async gravarItemTarefa(cronogramaId, revisao, op, ctx): Promise<ResultadoGravacaoItem> {
      // E20: mesmo desenho de gravarCronograma. O primeiro comando só vale se a revisão ainda for a lida (CASE ... ELSE NULL aborta o lote: 409).
      const CONFLITO = 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.';
      const cab = await db.prepare('SELECT id, titulo, projeto_id, revisao FROM cronograma WHERE prefeitura_id = ? AND id = ?').bind(prefeituraId, cronogramaId).first<{ id: string; titulo: string | null; projeto_id: string | null; revisao: number }>();
      if (!cab) return { ok: false, codigo: 'inexistente', erro: 'Cronograma não encontrado.' };
      if (Number(cab.revisao) !== revisao) return { ok: false, codigo: 'conflito', erro: CONFLITO };
      const tarefa = await db.prepare('SELECT id, nome, responsavel FROM etapa_cronograma WHERE prefeitura_id = ? AND cronograma_id = ? AND id = ? AND removida_em IS NULL')
        .bind(prefeituraId, cronogramaId, op.tarefa_id).first<{ id: string; nome: string; responsavel: string | null }>();
      if (!tarefa) return { ok: false, codigo: 'inexistente', erro: 'Tarefa não encontrada.' };
      const [envolvidos, recursos] = await Promise.all([lerEnvolvidos(cronogramaId, tarefa.id), lerRecursos(cronogramaId, tarefa.id)]);
      const decisao = planejarItem(
        { titulo: cab.titulo ?? '', tarefa: { id: tarefa.id, nome: tarefa.nome, responsavel: tarefa.responsavel ?? null }, envolvidos, recursos },
        op, { novoId: () => crypto.randomUUID() },
      );
      if (!decisao.ok) return decisao.codigo === 'sem_mudanca' ? { ok: true, mudou: false, revisao } : { ok: false, codigo: decisao.codigo, erro: decisao.erro };
      const { plano, item_id } = decisao;
      const tab = plano.tabela === 'envolvido' ? 'tarefa_envolvido' : 'tarefa_recurso';
      const onde = [prefeituraId, cronogramaId, tarefa.id] as const;
      const lote: StatementD1[] = [
        db.prepare('UPDATE cronograma SET revisao = CASE WHEN revisao = ? THEN revisao + 1 ELSE NULL END, editado_na_tela = 1, atualizado_em = ? WHERE prefeitura_id = ? AND id = ?')
          .bind(revisao, ctx.agora, prefeituraId, cronogramaId),
      ];
      if (plano.inserir) {
        if (plano.tabela === 'envolvido') {
          const d = plano.inserir.dados as DadosEnvolvido;
          lote.push(db.prepare('INSERT INTO tarefa_envolvido (prefeitura_id, id, cronograma_id, tarefa_id, nome, area, papel, observacao, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .bind(prefeituraId, plano.inserir.id, cronogramaId, tarefa.id, d.nome, d.area, d.papel, d.observacao, ctx.autor, ctx.agora));
        } else {
          const d = plano.inserir.dados as DadosRecurso;
          lote.push(db.prepare(
            'INSERT INTO tarefa_recurso (prefeitura_id, id, cronograma_id, tarefa_id, tipo, descricao, quantidade_centesimos, unidade, valor_estimado_centavos, valor_utilizado_centavos, data_uso, observacao, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          ).bind(prefeituraId, plano.inserir.id, cronogramaId, tarefa.id, d.tipo, d.descricao, d.quantidade_centesimos, d.unidade, d.valor_estimado_centavos, d.valor_utilizado_centavos, d.data_uso, d.observacao, ctx.autor, ctx.agora));
        }
      }
      if (plano.atualizar) {
        if (plano.tabela === 'envolvido') {
          const d = plano.atualizar.dados as DadosEnvolvido;
          lote.push(db.prepare('UPDATE tarefa_envolvido SET nome = ?, area = ?, papel = ?, observacao = ?, atualizado_por = ?, atualizado_em = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND tarefa_id = ? AND id = ? AND removido_em IS NULL')
            .bind(d.nome, d.area, d.papel, d.observacao, ctx.autor, ctx.agora, ...onde, plano.atualizar.id));
        } else {
          const d = plano.atualizar.dados as DadosRecurso;
          lote.push(db.prepare('UPDATE tarefa_recurso SET tipo = ?, descricao = ?, quantidade_centesimos = ?, unidade = ?, valor_estimado_centavos = ?, valor_utilizado_centavos = ?, data_uso = ?, observacao = ?, atualizado_por = ?, atualizado_em = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND tarefa_id = ? AND id = ? AND removido_em IS NULL')
            .bind(d.tipo, d.descricao, d.quantidade_centesimos, d.unidade, d.valor_estimado_centavos, d.valor_utilizado_centavos, d.data_uso, d.observacao, ctx.autor, ctx.agora, ...onde, plano.atualizar.id));
        }
      }
      if (plano.remover) {
        // tab vem de dois literais fixos acima.
        lote.push(db.prepare(`UPDATE ${tab} SET removido_em = ?, removido_por = ?, motivo_remocao = ? WHERE prefeitura_id = ? AND cronograma_id = ? AND tarefa_id = ? AND id = ? AND removido_em IS NULL`)
          .bind(ctx.agora, ctx.autor, plano.remover.motivo, ...onde, plano.remover.id));
      }
      const ev = plano.evento;
      lote.push(db.prepare("INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em, campos, motivo, descricao) SELECT ?, ?, ?, ?, 'cronograma', ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM projeto WHERE prefeitura_id = ? AND id = ?)")
        .bind(crypto.randomUUID(), prefeituraId, cab.projeto_id, ev.tipo, ctx.autor, ctx.agora, JSON.stringify({ tarefa_id: tarefa.id, item_id }), ev.motivo, ev.descricao, prefeituraId, cab.projeto_id));
      lote.push(db.prepare("INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) SELECT ?, ?, ?, 'cronograma', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM projeto WHERE prefeitura_id = ? AND id = ?)")
        .bind(crypto.randomUUID(), prefeituraId, ev.tipo, ctx.autor, ctx.agora, ev.descricao, JSON.stringify({ cronograma_id: cronogramaId, tarefa_id: tarefa.id, item_id, ...(ev.motivo ? { motivo: ev.motivo } : {}) }), prefeituraId, cab.projeto_id));
      try {
        await db.batch(lote);
      } catch (erro) {
        const msg = String(erro);
        if (/NOT NULL constraint failed: cronograma\.revisao/.test(msg) || /Tarefa não pertence ao cronograma/.test(msg) || /Item removido não muda/.test(msg)) return { ok: false, codigo: 'conflito', erro: CONFLITO };
        if (/Limite de (envolvidos|recursos) da tarefa/.test(msg)) return { ok: false, codigo: 'invalido', erro: 'Esta tarefa chegou ao limite de registros de envolvidos ou recursos; crie uma nova tarefa para continuar.' };
        if (/CHECK constraint failed|FOREIGN KEY constraint failed|NOT NULL constraint failed/.test(msg)) {
          console.warn('[cronograma] item de tarefa recusado pelo banco');
          return { ok: false, codigo: 'invalido', erro: 'Dados inválidos.' };
        }
        throw erro;
      }
      return { ok: true, mudou: true, revisao: revisao + 1, item_id };
    },
    async criarProjeto(dados, autor): Promise<ResultadoCriacaoProjeto> {
      // O próximo código é lido e gravado em passos separados: duas pessoas cadastrando juntas podem calcular o mesmo número.
      // O índice único projeto_codigo_unico (migração 0006) faz o banco recusar o segundo lote inteiro (nada fica gravado pela
      // metade); aqui o número é recalculado e a gravação repetida, algumas vezes, antes de desistir.
      for (let tentativa = 1; ; tentativa++) {
        try { return await criarUmProjeto(dados, autor); } catch (erro) {
          if (/Área inválida/.test(String(erro))) return { ok: false, erro: 'Área: valor não permitido.' };
          // Só a recusa do código (ou do id) repetido é tentada de novo; qualquer outro índice único futuro é erro de verdade.
          const repetido = /UNIQUE constraint failed: projeto\.prefeitura_id, projeto\.(codigo_legado|id)\b/i.test(String(erro));
          if (!repetido) throw erro;
          if (tentativa >= 5) return { ok: false, codigo: 'concorrencia', erro: 'Muitos cadastros ao mesmo tempo. Tente de novo em instantes.' };
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * tentativa));
        }
      }
    },
    async aplicar(e: Evento): Promise<ResultadoAplicacao> {
      e = { ...e, em: iso(e.em) };
      try { return await transacao(async (cliente): Promise<ResultadoAplicacao> => {
        const r = await cliente.query(`SELECT ${LISTA_COLUNAS}, revisao FROM projeto WHERE prefeitura_id = ? AND id = ? `, [prefeituraId, e.projeto_id]);
        if (!r.rows[0]) return { ok: false, erro: 'Projeto não encontrado.' };
        const res = aplicarEvento(linhaParaProjeto(r.rows[0]), e);
        if (!res.ok) return res.faltando ? { ok: false, erro: res.erro, faltando: res.faltando } : { ok: false, erro: res.erro };
        const { cols, valores } = colunasGravaveis(res.projeto);
        await cliente.gravar(`UPDATE projeto SET ${cols.map((c) => `${c} = ?`).join(', ')}, revisao = CASE WHEN revisao = ? THEN revisao + 1 ELSE NULL END, atualizado_em = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE prefeitura_id = ? AND id = ?`, [...valores, r.rows[0].revisao, prefeituraId, res.projeto.id]);
        await gravarEventos(cliente, res.historico);
        return { ok: true, historico: res.historico };
      }); } catch (erro) {
        if (/NOT NULL constraint failed: projeto.revisao/.test(String(erro))) return { ok: false, erro: 'Projeto alterado por outra pessoa; recarregue a página.' };
        throw erro;
      }
    },
  };
}
