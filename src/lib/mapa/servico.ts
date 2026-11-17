// Gravação da localização do projeto (entrega B1). Sem dependência do Astro: recebe o usuário e o repositório.
// Segurança: perfil conferido aqui, projeto da própria prefeitura (o repositório já filtra), valor reconstruído só com
// os campos conhecidos (nada do que o navegador mandar a mais chega ao banco) e histórico gravado junto com a alteração.
import { ID_PROJETO } from '../documentos/regras.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { validarLocalizacao } from './geo.ts';
import type { Localizacao, PontoGeo } from './tipos.ts';

export interface ContextoLocalizacao { usuario: Usuario; repositorio: RepositorioProjetos }
export type ResultadoLocalizacao =
  | { ok: true; mudou: boolean; localizacao: Localizacao }
  | { ok: false; status: number; erro: string; erros?: string[] };

/** Tamanho máximo do pedido: 20 trechos de 200 pontos cabem com folga. */
export const LIMITE_CORPO_LOCALIZACAO = 262_144;
const MAX_ENDERECO = 200;
const MAX_RUA = 120;
const MAX_DESCRICAO = 300;

const falha = (status: number, erro: string, erros?: string[]): ResultadoLocalizacao => (erros ? { ok: false, status, erro, erros } : { ok: false, status, erro });
const seis = (n: number): number => Math.round(n * 1e6) / 1e6;
const ponto = (p: PontoGeo): PontoGeo => ({ lat: seis(p.lat), lng: seis(p.lng) });
/** Texto curto: sem caracteres de controle, sem espaços nas pontas; vazio vira null. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max).trim();
  return t ? t : null;
}

/** Confere e devolve a localização só com os campos conhecidos, coordenadas com 6 casas (cerca de 10 cm). */
export function normalizarLocalizacao(bruto: unknown): { ok: true; valor: Localizacao } | { ok: false; erros: string[] } {
  const erros = validarLocalizacao(bruto);
  if (erros.length > 0) return { ok: false, erros };
  const l = bruto as Localizacao;
  const valor: Localizacao = l.tipo === 'ponto'
    ? { tipo: 'ponto', ponto: ponto(l.ponto), endereco: texto(l.endereco, MAX_ENDERECO) }
    : { tipo: 'trechos', trechos: l.trechos.map((t) => ({ rua: texto(t.rua, MAX_RUA) ?? '', de: texto(t.de, MAX_RUA), ate: texto(t.ate, MAX_RUA), linha: t.linha.map(ponto) })) };
  // A limpeza pode esvaziar um texto (ex.: rua só com caracteres de controle): o que vai ao banco é conferido de novo.
  const depois = validarLocalizacao(valor);
  return depois.length > 0 ? { ok: false, erros: depois } : { ok: true, valor };
}

/** Frase para o histórico e para a página do projeto. */
export function resumoLocalizacao(l: Localizacao): string {
  if (l.tipo === 'ponto') return `ponto em latitude ${l.ponto.lat}, longitude ${l.ponto.lng}${l.endereco ? ` (${l.endereco})` : ''}`;
  const ruas = l.trechos.map((t) => t.rua).join('; ');
  return `${l.trechos.length} ${l.trechos.length === 1 ? 'trecho' : 'trechos'} (${ruas})`;
}

export function podeEditarLocalizacao(c: ContextoLocalizacao): ResultadoLocalizacao | { ok: true } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return falha(403, 'Seu perfil não permite alterar a localização.');
  if (!c.repositorio.definirLocalizacao) return falha(503, 'Gravação indisponível no momento.');
  return { ok: true };
}

export async function salvarLocalizacao(c: ContextoLocalizacao, projetoId: string, bruto: unknown): Promise<ResultadoLocalizacao> {
  const pode = podeEditarLocalizacao(c);
  if (!pode.ok) return pode;
  if (!ID_PROJETO.test(projetoId)) return falha(404, 'Projeto não encontrado.');
  const n = normalizarLocalizacao(bruto);
  if (!n.ok) return falha(400, 'Localização inválida.', n.erros);
  const valor = n.valor;
  // A comparação com o valor atual e a frase do histórico usam o que o repositório leu na hora de gravar.
  const r = await c.repositorio.definirLocalizacao!(projetoId, (atual) => {
    const antes = atual && validarLocalizacao(atual).length === 0 ? (atual as Localizacao) : null;
    if (antes && JSON.stringify(antes) === JSON.stringify(valor)) return null;
    const frase = antes ? `Localização alterada: ${resumoLocalizacao(valor)}. Antes: ${resumoLocalizacao(antes)}` : `Localização cadastrada: ${resumoLocalizacao(valor)}`;
    return { valor, descricao: frase.length > MAX_DESCRICAO ? `${frase.slice(0, MAX_DESCRICAO - 1)}…` : frase };
  }, c.usuario.email);
  if (r === 'inexistente') return falha(404, 'Projeto não encontrado.');
  if (r === 'conflito') return falha(409, 'O projeto foi alterado por outra pessoa enquanto você editava. Recarregue a página e tente de novo.');
  return { ok: true, mudou: r === 'ok', localizacao: valor };
}
