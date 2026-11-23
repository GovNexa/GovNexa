// Serviço do PNCP (E14a): perfil, validação, limites e gravação. A prefeitura e o autor vêm da sessão; nada do PNCP é confiável.
// Fora do ar, lento ou fora do formato = o último retrato continua na tela (a falha só vira status e evento no Histórico).
import { dataHoraBr } from '../datas.ts';
import { texto } from '../carteira/cadastro.ts';
import { ID_CONTRATACAO, hojeBrasilia } from '../contratacoes/regras.ts';
import { podeGravarContratacao } from '../contratacoes/servico.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { buscarCompra, coletar, type DepsPncp } from './cliente.ts';
import type { VinculoPncp } from './repositorio.ts';
import {
  COLETAS_POR_HORA_PREFEITURA, ID_ORGAO, ID_VINCULO, MAX_VINCULOS_LOTE, ROTULO_OBRA, TEMPO_LOTE_MS, TEMPO_PEDIDO_MS, TRAVA_ERRO_MS, TRAVA_OK_MS,
  lerEntradaPncp, linkPublico, normalizarCnpj, numeroControle, validarTrio,
} from './regras.ts';
import type { CompraPncp } from './validacao.ts';

export interface ContextoPncp { usuario: Usuario | null | undefined; repositorio: RepositorioProjetos }
export type RespostaPncp = { ok: true; corpo: Record<string, unknown> } | { ok: false; status: number; erro: string };

const ERRO_PEDIDO = 'Pedido inválido.';
const ERRO_INDISPONIVEL = 'Gravação indisponível no momento.';
const ERRO_NAO_LIGADA = 'Esta contratação não está ligada ao PNCP.';
const ERRO_LIMITE_PREFEITURA = 'Muitas consultas ao PNCP nesta prefeitura agora. Tente de novo mais tarde.';
const ERRO_SEM_ORGAO = 'Esta compra é de um órgão que não está entre as secretarias compradoras cadastradas. Peça a um administrador para cadastrá-lo em Secretarias compradoras (PNCP).';
const ERRO_SECRETARIA = 'Secretaria não encontrada.';
const ERRO_PERFIL_SECRETARIA = 'Seu perfil não permite cadastrar secretarias compradoras.';
const ERRO_REVISAO_ORGAO = 'Versão da secretaria ausente: recarregue a página e tente de novo.';

const falha = (status: number, erro: string): RespostaPncp => ({ ok: false, status, erro });
const ok = (corpo: Record<string, unknown> = {}): RespostaPncp => ({ ok: true, corpo: { ok: true, ...corpo } });
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function podeUsarPncp(c: ContextoPncp): { ok: true } | { ok: false; status: number; erro: string } {
  const g = podeGravarContratacao(c);
  if (!g.ok) return g;
  if (!c.repositorio.pncp) return { ok: false, status: 503, erro: ERRO_INDISPONIVEL };
  return { ok: true };
}
/** Permissão própria (decisão do dono, 23/11/2026): hoje só o administrador; no futuro basta conceder a ação a outro perfil. */
export function podeAdministrarPncp(usuario: Usuario | null | undefined): boolean {
  return usuarioPode(usuario, 'gerenciar_secretarias_compradoras');
}
export function podeCadastrarSecretaria(c: ContextoPncp): { ok: true } | { ok: false; status: number; erro: string } {
  if (!podeAdministrarPncp(c.usuario)) return { ok: false, status: 403, erro: ERRO_PERFIL_SECRETARIA };
  if (!c.repositorio.podeGravar || !c.repositorio.pncp) return { ok: false, status: 503, erro: ERRO_INDISPONIVEL };
  return { ok: true };
}

const CHAVES_POR_ACAO: Record<string, readonly string[]> = {
  previa: ['acao', 'id', 'entrada'],
  vincular: ['acao', 'id', 'cnpj', 'ano', 'sequencial', 'confirmo_nao_obra'],
  desvincular: ['acao', 'id', 'vinculo_id', 'motivo'],
  atualizar: ['acao', 'id'],
  atualizar_orgao: ['acao', 'orgao_id'],
};
const CHAVES_ORGAO: Record<string, readonly string[]> = {
  orgao_criar: ['acao', 'cnpj', 'nome', 'sigla'],
  orgao_editar: ['acao', 'orgao_id', 'revisao', 'nome', 'sigla'],
  orgao_desativar: ['acao', 'orgao_id', 'revisao'],
  orgao_reativar: ['acao', 'orgao_id', 'revisao'],
};

const anoAtualDe = (agora: Date): number => Number(hojeBrasilia(agora).slice(0, 4));

/** Limites da prefeitura antes de qualquer chamada ao PNCP: memória por instância e teto de coletas por hora (D1, vale para todas as instâncias). */
async function limitesPrefeitura(c: ContextoPncp, deps: DepsPncp, agora: Date, comTetoHora: boolean): Promise<RespostaPncp | null> {
  let dentro = false;
  try { dentro = (await deps.estado.porPrefeitura.permitir(String(c.repositorio.prefeituraId))) === true; } catch { dentro = false; }
  if (!dentro) return falha(429, ERRO_LIMITE_PREFEITURA);
  if (comTetoHora) {
    const n = await c.repositorio.pncp!.coletasNaUltimaHora(new Date(agora.getTime() - 3_600_000).toISOString());
    if (n >= COLETAS_POR_HORA_PREFEITURA) return falha(429, ERRO_LIMITE_PREFEITURA);
  }
  return null;
}

type Trio = { cnpj: string; ano: number; sequencial: number };
/** Conferências comuns da prévia e do ligar (o navegador nunca é a palavra final). */
async function conferirLigacao(c: ContextoPncp, idBruto: unknown, trio: (anoAtual: number) => { ok: true } & Trio | { ok: false; erro: string }, agora: Date):
  Promise<{ ok: true; contratacaoId: string; trio: Trio; orgao: { id: string; nome: string } } | { ok: false; resposta: RespostaPncp }> {
  const repo = c.repositorio.pncp!;
  const contratacaoId = typeof idBruto === 'string' && ID_CONTRATACAO.test(idBruto) ? idBruto : null;
  const contratacao = contratacaoId ? await c.repositorio.contratacoes!.obter(contratacaoId) : null;
  if (!contratacaoId || !contratacao) return { ok: false, resposta: falha(404, 'Contratação não encontrada.') };
  if (await repo.obterVinculoAtivo(contratacaoId)) return { ok: false, resposta: falha(409, 'Esta contratação já está ligada ao PNCP.') };
  const t = trio(anoAtualDe(agora));
  if (!t.ok) return { ok: false, resposta: falha(400, t.erro) };
  const orgao = await repo.obterOrgaoAtivoPorCnpj(t.cnpj);
  if (!orgao) return { ok: false, resposta: falha(400, ERRO_SEM_ORGAO) };
  const ligada = await repo.obterVinculoAtivoDaCompra(t.cnpj, t.ano, t.sequencial);
  if (ligada) return { ok: false, resposta: falha(409, `Esta compra do PNCP já está ligada a outra contratação: ${ligada.nome}.`) };
  return { ok: true, contratacaoId, trio: { cnpj: t.cnpj, ano: t.ano, sequencial: t.sequencial }, orgao: { id: orgao.id, nome: orgao.nome } };
}

async function buscarCompraOuErro(trio: Trio, deps: DepsPncp): Promise<{ ok: true; compra: CompraPncp } | { ok: false; resposta: RespostaPncp }> {
  const r = await buscarCompra(trio, deps, deps.agora() + TEMPO_PEDIDO_MS);
  if (r.r === 'ok') return { ok: true, compra: r.compra };
  if (r.r === 'nao_encontrado') return { ok: false, resposta: falha(404, 'Compra não encontrada no PNCP. Confira o número.') };
  if (r.r === 'formato') return { ok: false, resposta: falha(502, 'O PNCP respondeu em formato inesperado. Tente mais tarde.') };
  return { ok: false, resposta: falha(502, 'O PNCP não respondeu agora. Tente de novo em alguns minutos.') };
}

function avisoMunicipio(c: ContextoPncp, compra: CompraPncp): string | null {
  return compra.codigoIbge !== null && compra.codigoIbge !== String(c.repositorio.prefeituraId)
    ? `Atenção: esta compra é de outro município (código IBGE ${compra.codigoIbge}). Confira se é a compra certa.` : null;
}

type ResultadoVinculo =
  | { r: 'limite' }
  | { r: 'sumiu' }
  | { r: 'recente'; liberaEm: string }
  | { r: 'feito'; status: 'ok' | 'erro' | 'nao_encontrado' | 'formato' | 'desligado'; aviso?: string };

/** Uma atualização de um vínculo: trava (reserva atômica) → limites → coleta → grava retrato ou falha. */
async function atualizarVinculo(c: ContextoPncp, deps: DepsPncp, agora: Date, v: VinculoPncp, comLimites: boolean, prazoMax: number): Promise<ResultadoVinculo> {
  const repo = c.repositorio.pncp!;
  const autor = c.usuario!.email;
  const emIso = agora.toISOString();
  const ms = agora.getTime();
  // Limites ANTES da trava: um 429 não pode deixar a contratação travada sem ter coletado.
  if (comLimites && (await limitesPrefeitura(c, deps, agora, true))) return { r: 'limite' };
  const reservou = await repo.reservarTentativa(v.id, emIso, new Date(ms - TRAVA_OK_MS).toISOString(), new Date(ms - TRAVA_ERRO_MS).toISOString());
  if (!reservou) {
    const atual = await repo.obterVinculoAtivo(v.contratacao_id);
    if (!atual || atual.id !== v.id) return { r: 'sumiu' };
    const base = atual.ultima_tentativa_em ? new Date(atual.ultima_tentativa_em).getTime() : ms;
    return { r: 'recente', liberaEm: new Date(base + (atual.ultimo_status === 'ok' ? TRAVA_OK_MS : TRAVA_ERRO_MS)).toISOString() };
  }
  const coleta = await coletar({ cnpj: v.cnpj, ano: v.ano, sequencial: v.sequencial }, deps, Math.min(deps.agora() + TEMPO_PEDIDO_MS, prazoMax));
  const falhou = async (status: 'erro' | 'nao_encontrado' | 'formato', motivo: string): Promise<ResultadoVinculo> =>
    (await repo.gravarFalha(v, status, motivo, autor, emIso)) === 'ok' ? { r: 'feito', status } : { r: 'feito', status: 'desligado' };
  if (coleta.r === 'nao_encontrado') return falhou('nao_encontrado', 'Compra não encontrada no PNCP.');
  if (coleta.r === 'erro') return falhou('erro', coleta.motivo);
  if (coleta.r === 'formato') return falhou('formato', coleta.motivo);
  const g = await repo.gravarRetrato(v, coleta, autor, emIso);
  if (g === 'desligado') return { r: 'feito', status: 'desligado' };
  if (g === 'recusado') return falhou('formato', 'Dados do PNCP recusados pelo banco');
  return { r: 'feito', status: 'ok', ...(coleta.incompleto ? { aviso: 'Parte dos itens ficou para a próxima atualização.' } : {}) };
}

const horaDe = (iso: string): string => dataHoraBr(iso).slice(11);

export async function executarAcaoPncp(c: ContextoPncp, bruto: unknown, deps: DepsPncp, agora: Date = new Date()): Promise<RespostaPncp> {
  const pode = podeUsarPncp(c);
  if (!pode.ok) return falha(pode.status, pode.erro);
  const repo = c.repositorio.pncp!;
  if (!ehObjeto(bruto) || typeof bruto.acao !== 'string') return falha(400, ERRO_PEDIDO);
  const permitidas = Object.hasOwn(CHAVES_POR_ACAO, bruto.acao) ? CHAVES_POR_ACAO[bruto.acao] : null;
  if (!permitidas || Object.keys(bruto).some((k) => !permitidas.includes(k))) return falha(400, ERRO_PEDIDO);
  const autor = c.usuario!.email;
  const emIso = agora.toISOString();
  const idContratacao = typeof bruto.id === 'string' && ID_CONTRATACAO.test(bruto.id) ? bruto.id : null;

  switch (bruto.acao) {
    case 'previa': {
      const conf = await conferirLigacao(c, bruto.id, (ano) => {
        const e = lerEntradaPncp(bruto.entrada, ano);
        return e.ok ? { ok: true as const, cnpj: e.cnpj, ano: e.ano, sequencial: e.sequencial } : e;
      }, agora);
      if (!conf.ok) return conf.resposta;
      const lim = await limitesPrefeitura(c, deps, agora, false);
      if (lim) return lim;
      const b = await buscarCompraOuErro(conf.trio, deps);
      if (!b.ok) return b.resposta;
      const x = b.compra;
      return ok({
        previa: {
          numero_controle: numeroControle(conf.trio.cnpj, conf.trio.ano, conf.trio.sequencial),
          link: linkPublico(conf.trio.cnpj, conf.trio.ano, conf.trio.sequencial),
          orgao_nome: conf.orgao.nome, objeto: x.objeto, processo: x.processo, numero_compra: x.numeroCompra,
          modalidade: x.modalidadeNome, situacao: x.situacaoNome ?? `Situação ${x.situacaoId}`,
          valor_estimado: x.valorEstimado, valor_homologado: x.valorHomologado, obra: x.obra, obra_rotulo: ROTULO_OBRA[x.obra],
          aviso_municipio: avisoMunicipio(c, x),
        },
      });
    }
    case 'vincular': {
      const conf = await conferirLigacao(c, bruto.id, (ano) => validarTrio(bruto.cnpj, bruto.ano, bruto.sequencial, ano), agora);
      if (!conf.ok) return conf.resposta;
      const lim = await limitesPrefeitura(c, deps, agora, true);
      if (lim) return lim;
      const b = await buscarCompraOuErro(conf.trio, deps);
      if (!b.ok) return b.resposta;
      if (b.compra.obra === 'nao_identificado' && bruto.confirmo_nao_obra !== true) {
        return falha(400, 'Confirme que esta é a compra certa: ela não parece ser de obra ou serviço de engenharia.');
      }
      const id = `V-${crypto.randomUUID()}`;
      const r = await repo.vincular({
        id, contratacaoId: conf.contratacaoId, orgaoId: conf.orgao.id, cnpj: conf.trio.cnpj, ano: conf.trio.ano, sequencial: conf.trio.sequencial,
        numeroControle: numeroControle(conf.trio.cnpj, conf.trio.ano, conf.trio.sequencial), obra: b.compra.obra,
      }, autor, emIso);
      if (r === 'contratacao_ligada') return falha(409, 'Esta contratação já está ligada ao PNCP.');
      if (r === 'compra_ligada') {
        const l = await repo.obterVinculoAtivoDaCompra(conf.trio.cnpj, conf.trio.ano, conf.trio.sequencial);
        return falha(409, l ? `Esta compra do PNCP já está ligada a outra contratação: ${l.nome}.` : 'Esta compra do PNCP já está ligada a outra contratação.');
      }
      if (r !== 'ok') return falha(400, ERRO_PEDIDO);
      const v = await repo.obterVinculoAtivo(conf.contratacaoId);
      if (!v) return falha(409, ERRO_NAO_LIGADA);
      // Primeira coleta completa; os limites já foram conferidos acima, antes de gravar o vínculo.
      const u = await atualizarVinculo(c, deps, agora, v, false, Number.MAX_SAFE_INTEGER);
      return ok({ vinculo_id: id, status: u.r === 'feito' ? u.status : 'erro', ...(u.r === 'feito' && u.aviso ? { aviso: u.aviso } : {}) });
    }
    case 'desvincular': {
      if (!idContratacao) return falha(404, 'Contratação não encontrada.');
      if (typeof bruto.vinculo_id !== 'string' || !ID_VINCULO.test(bruto.vinculo_id)) return falha(404, ERRO_NAO_LIGADA);
      const motivo = typeof bruto.motivo === 'string' ? texto(bruto.motivo, 501, true) : null;
      if (!motivo || Array.from(motivo).length > 500) return falha(400, 'Informe o motivo para desligar do PNCP.');
      const r = await repo.desvincular(idContratacao, bruto.vinculo_id, motivo, autor, emIso);
      return r === 'ok' ? ok() : falha(404, ERRO_NAO_LIGADA);
    }
    case 'atualizar': {
      if (!idContratacao) return falha(404, ERRO_NAO_LIGADA);
      const v = await repo.obterVinculoAtivo(idContratacao);
      if (!v) return falha(404, ERRO_NAO_LIGADA);
      const u = await atualizarVinculo(c, deps, agora, v, true, Number.MAX_SAFE_INTEGER);
      if (u.r === 'limite') return falha(429, ERRO_LIMITE_PREFEITURA);
      if (u.r === 'sumiu') return falha(404, ERRO_NAO_LIGADA);
      if (u.r === 'recente') return ok({ status: 'recente', aviso: `Dados atualizados há pouco. Nova consulta liberada às ${horaDe(u.liberaEm)}.` });
      return ok({ status: u.status, ...(u.aviso ? { aviso: u.aviso } : {}) });
    }
    case 'atualizar_orgao': {
      const orgaoId = typeof bruto.orgao_id === 'string' && ID_ORGAO.test(bruto.orgao_id) ? bruto.orgao_id : null;
      const orgao = orgaoId ? await repo.obterOrgao(orgaoId) : null;
      if (!orgaoId || !orgao || !orgao.ativo) return falha(404, ERRO_SECRETARIA);
      const lista = await repo.listarVinculosAtivosDoOrgao(orgaoId, MAX_VINCULOS_LOTE);
      const inicio = deps.agora();
      const fimLote = inicio + TEMPO_LOTE_MS;
      let atualizadas = 0; let recentes = 0; let falhas = 0; let limitado = false;
      for (const v of lista) {
        if (deps.agora() >= fimLote) break;
        const u = await atualizarVinculo(c, deps, agora, v, true, fimLote);
        if (u.r === 'limite') { limitado = true; break; }
        if (u.r === 'recente') recentes++;
        else if (u.r === 'feito' && u.status === 'ok') atualizadas++;
        else falhas++;
      }
      const processadas = atualizadas + recentes + falhas;
      if (limitado && processadas === 0) return falha(429, ERRO_LIMITE_PREFEITURA);
      return ok({ atualizadas, recentes, falhas, restantes: Math.max(0, orgao.vinculos_ativos - processadas) });
    }
    default:
      return falha(400, ERRO_PEDIDO);
  }
}

/** Cadastro das secretarias compradoras: só quem tem a permissão `gerenciar_secretarias_compradoras`. Cada ação grava 1 evento no Histórico. */
export async function executarAcaoOrgao(c: ContextoPncp, bruto: unknown, agora: Date = new Date()): Promise<RespostaPncp> {
  const pode = podeCadastrarSecretaria(c);
  if (!pode.ok) return falha(pode.status, pode.erro);
  const repo = c.repositorio.pncp!;
  if (!ehObjeto(bruto) || typeof bruto.acao !== 'string') return falha(400, ERRO_PEDIDO);
  const permitidas = Object.hasOwn(CHAVES_ORGAO, bruto.acao) ? CHAVES_ORGAO[bruto.acao] : null;
  if (!permitidas || Object.keys(bruto).some((k) => !permitidas.includes(k))) return falha(400, ERRO_PEDIDO);
  const autor = c.usuario!.email;
  const emIso = agora.toISOString();
  const nomeSigla = (): { ok: true; nome: string; sigla: string | null } | { ok: false; resposta: RespostaPncp } => {
    const nome = typeof bruto.nome === 'string' ? texto(bruto.nome, 121) : null;
    if (!nome || Array.from(nome).length > 120) return { ok: false, resposta: falha(400, 'Nome: de 1 a 120 caracteres.') };
    let sigla: string | null = null;
    if (bruto.sigla !== undefined && bruto.sigla !== null && bruto.sigla !== '') {
      sigla = typeof bruto.sigla === 'string' ? texto(bruto.sigla, 21) : null;
      if (!sigla || Array.from(sigla).length > 20) return { ok: false, resposta: falha(400, 'Sigla: até 20 caracteres.') };
    }
    return { ok: true, nome, sigla };
  };
  if (bruto.acao === 'orgao_criar') {
    const cnpj = normalizarCnpj(bruto.cnpj);
    if (!cnpj) return falha(400, 'CNPJ inválido: confira os dígitos.');
    const d = nomeSigla();
    if (!d.ok) return d.resposta;
    const r = await repo.criarOrgao({ id: `O-${crypto.randomUUID()}`, cnpj, nome: d.nome, sigla: d.sigla }, autor, emIso);
    if (r === 'duplicado') return falha(409, 'Este CNPJ já está cadastrado.');
    if (r === 'limite') return falha(400, 'Limite de 50 secretarias.');
    return ok({ mudou: true });
  }
  const orgaoId = typeof bruto.orgao_id === 'string' && ID_ORGAO.test(bruto.orgao_id) ? bruto.orgao_id : null;
  if (!orgaoId) return falha(404, ERRO_SECRETARIA);
  const revisao = typeof bruto.revisao === 'number' && Number.isSafeInteger(bruto.revisao) && bruto.revisao >= 0 ? bruto.revisao : null;
  if (revisao === null) return falha(400, ERRO_REVISAO_ORGAO);
  const CONFLITO = 'A secretaria foi alterada por outra pessoa. Recarregue a página.';
  if (bruto.acao === 'orgao_editar') {
    const d = nomeSigla();
    if (!d.ok) return d.resposta;
    const atual = await repo.obterOrgao(orgaoId);
    if (!atual) return falha(404, ERRO_SECRETARIA);
    const diff: Record<string, { de: unknown; para: unknown }> = {};
    if (atual.nome !== d.nome) diff.nome = { de: atual.nome, para: d.nome };
    if ((atual.sigla ?? null) !== d.sigla) diff.sigla = { de: atual.sigla ?? null, para: d.sigla };
    if (Object.keys(diff).length === 0) return ok({ mudou: false, revisao: atual.revisao });
    const r = await repo.editarOrgao(orgaoId, revisao, { nome: d.nome, sigla: d.sigla }, diff, autor, emIso);
    return r === 'ok' ? ok({ mudou: true }) : r === 'inexistente' ? falha(404, ERRO_SECRETARIA) : falha(409, CONFLITO);
  }
  const ativar = bruto.acao === 'orgao_reativar';
  const r = await repo.mudarAtivoOrgao(orgaoId, revisao, ativar, autor, emIso);
  if (r === 'ok') return ok({ mudou: true });
  if (r === 'inexistente') return falha(404, ERRO_SECRETARIA);
  if (r === 'com_vinculos') return falha(409, 'Desligue antes as contratações ligadas a esta secretaria.');
  return falha(409, CONFLITO);
}
