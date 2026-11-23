// Navegação (E15): o parâmetro `volta` leva a tela de origem (caminho + filtros) para a tela de destino, que mostra "← Voltar para …".
// Funções puras, usadas no servidor e no navegador. Contra redirecionamento aberto: só caminhos de TELA sob /plataforma/, na mesma origem.
export const PARAMETRO_VOLTA = 'volta';
export const PREFIXO_VOLTA = '/plataforma/';
export const MAX_VOLTA = 2000;
/** Quantas telas de origem um endereço carrega (destino → ficha → origem). O 3º nível é descartado. */
export const NIVEIS_VOLTA = 2;
/** Avisos de ação já concluída: não voltam junto (evita repetir "Documento enviado."). */
export const PARAMETROS_PASSAGEIROS = ['salvo', 'rf', 'r'] as const;
const CONTROLE = /[\u0000-\u001f\u007f]/;
const ID_PROJETO_TELA = /^P-[A-Za-z0-9_-]{1,40}$/;
/** Rotas que não são telas (gravação, arquivo, CSV, agenda): nunca são destino de volta. */
const NAO_E_TELA = /^\/plataforma\/(?:documentos-projeto\/(?:arquivo|classificar|enviar|remover)\/|fotos-projeto\/|projeto\/(?:criar|editar|localizacao|mover)\/|localizacao\/buscar\/|usuarios\/acao\/|gestao-inconsistencias\/csv\/|gestao-licitacoes\/(?:gravar|csv)\/|agenda\.ics)/;

/** Caminho interno seguro (pathname + search + hash) ou null. `niveis` limita a volta dentro da volta. */
export function voltaSegura(candidato: string | null | undefined, origem: string, niveis: number = NIVEIS_VOLTA): string | null {
  if (typeof candidato !== 'string' || candidato.length === 0 || candidato.length > MAX_VOLTA) return null;
  if (!candidato.startsWith(PREFIXO_VOLTA) || candidato.includes('\\') || CONTROLE.test(candidato)) return null;
  let base: URL;
  let destino: URL;
  try {
    base = new URL(origem);
    destino = new URL(candidato, base);
  } catch {
    return null;
  }
  const caminho = destino.pathname;
  if (destino.origin !== base.origin || !caminho.startsWith(PREFIXO_VOLTA) || caminho.includes('//') || !caminho.endsWith('/') || NAO_E_TELA.test(caminho)) return null;
  // Revisão E15: também confere o caminho DECODIFICADO e sem diferença de maiúsculas (ex.: %65ditar, Projeto/, ..%2f).
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    return null;
  }
  if (decodificado.includes('//') || decodificado.includes('\\') || CONTROLE.test(decodificado) || /(^|\/)\.\.?(\/|$)/.test(decodificado)) return null;
  if (NAO_E_TELA.test(decodificado.toLowerCase()) || NAO_E_TELA.test(caminho.toLowerCase())) return null;
  const busca = destino.searchParams;
  // Só reescreve a busca quando precisa (mantém a grafia original dos filtros nos demais casos).
  if (busca.has(PARAMETRO_VOLTA) || PARAMETROS_PASSAGEIROS.some((p) => busca.has(p))) {
    for (const p of PARAMETROS_PASSAGEIROS) busca.delete(p);
    const interna = busca.get(PARAMETRO_VOLTA);
    if (interna !== null) {
      const ok = niveis > 1 ? voltaSegura(interna, origem, niveis - 1) : null;
      if (ok) busca.set(PARAMETRO_VOLTA, ok);
      else busca.delete(PARAMETRO_VOLTA);
    }
  }
  const resultado = `${destino.pathname}${destino.search}${destino.hash}`;
  return resultado.length <= MAX_VOLTA ? resultado : null;
}

/** Endereço da tela atual para mandar como `volta`. Longo demais: cai para o caminho sem filtros. */
export function aquiDe(url: URL): string | null {
  return voltaSegura(`${url.pathname}${url.search}`, url.origin) ?? voltaSegura(url.pathname, url.origin);
}

/** Põe (ou troca) o `volta` num link interno. Link externo, `volta` vazia ou nula: devolve o link sem mudança. */
export function comVolta(href: string, volta: string | null | undefined): string {
  if (!volta || !href.startsWith(PREFIXO_VOLTA)) return href;
  const u = new URL(href, 'http://govnexa.invalid');
  u.searchParams.set(PARAMETRO_VOLTA, volta);
  return `${u.pathname}${u.search}${u.hash}`;
}

/** Nome da tela (títulos do catálogo). Telas com código ganham artigo ("a ficha do projeto P-900"). */
const NOMES_TELA: Record<string, string> = {
  '/plataforma/': 'Projetos prioritários',
  '/plataforma/projetos/': 'Projetos · Início',
  '/plataforma/projetos-carteira/': 'Carteira de projetos',
  '/plataforma/gestao/': 'Mapa e painel',
  '/plataforma/projetos-kanban/': 'Kanban por macroetapa',
  '/plataforma/projetos-gantt/': 'Gantt geral',
  '/plataforma/gestao-equipe/': 'Painel da equipe',
  '/plataforma/projetos-cronogramas/': 'Cronogramas',
  '/plataforma/projetos-parado/': 'Onde está parado',
  '/plataforma/gestao-inconsistencias/': 'Inconsistências de dados',
  '/plataforma/gestao-responsaveis/': 'Responsáveis',
  '/plataforma/projetos-pendencias/': 'Pendências de etapa',
  '/plataforma/projetos-reuniao/': 'Reunião semanal',
  '/plataforma/projetos-sala/': 'Sala de guerra',
  '/plataforma/projetos-log/': 'Histórico de alterações',
  '/plataforma/gestao-alertas/': 'Alertas',
  '/plataforma/projetos-sei/': 'Processos no SEI',
  '/plataforma/projetos-novo/': 'Novo projeto',
  '/plataforma/projetos-localizacao/': 'Obras sem localização',
  '/plataforma/projetos-fluxo/': 'Fluxo do sistema',
  '/plataforma/licitacoes-detalhe/': 'Licitação em detalhe',
  '/plataforma/licitacoes-prazos/': 'Prazos da Lei 14.133',
  '/plataforma/convenios/': 'Visão Convênios',
  '/plataforma/gestao-licitacoes/': 'Gestão das licitações',
  '/plataforma/documentos-projeto/': 'Documentos dos projetos',
  '/plataforma/usuarios/': 'Usuários',
};
export function nomeTela(volta: string | null | undefined): string {
  if (!volta) return 'a tela anterior';
  const caminho = volta.split(/[?#]/)[0];
  if (Object.hasOwn(NOMES_TELA, caminho)) return NOMES_TELA[caminho];
  const ficha = /^\/plataforma\/projeto\/([^/]+)\/$/.exec(caminho);
  if (ficha) {
    let id = '';
    try { id = decodeURIComponent(ficha[1]); } catch { id = ''; }
    return ID_PROJETO_TELA.test(id) ? `a ficha do projeto ${id}` : 'a ficha do projeto';
  }
  if (/^\/plataforma\/cronograma\/[^/]+\/$/.test(caminho)) return 'o cronograma do projeto';
  if (/^\/plataforma\/sala-de-guerra\/[^/]+\/$/.test(caminho)) return 'a sala de guerra';
  if (/^\/plataforma\/documentos-projeto\/projeto\/[^/]+\/$/.test(caminho)) return 'os documentos do projeto';
  if (/^\/plataforma\/fluxo\/[^/]+\/$/.test(caminho)) return 'o fluxo detalhado';
  if (/^\/plataforma\/gestao-licitacoes\/[^/]+\/$/.test(caminho)) return 'a contratação';
  return 'a tela anterior';
}
