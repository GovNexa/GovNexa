// Busca de endereço da localização (E8, decisão D4 do dono): regras puras, usadas pelo servidor e pela tela.
// Sem rede e sem estado. O servidor é quem fala com o OpenStreetMap (ver busca-endereco.ts); a tela só confere o texto antes de pedir.
import { GOIANIA, dentroDaAreaAceita } from './geo.ts';

/** Endereço fixo do serviço. Só os parâmetros mudam, sempre codificados por URLSearchParams (sem SSRF). */
export const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** Identificação genérica do produto, exigida pela política de uso do Nominatim. Sem dado de pessoa nem da prefeitura. */
export const AGENTE_BUSCA = 'GovNexa-localizacao/1.0 (+https://govnexa.com.br)';
export const MIN_LETRAS_BUSCA = 3;
export const MAX_CARACTERES_BUSCA = 120;
export const MAX_RESULTADOS_BUSCA = 5;
export const MAX_ROTULO_BUSCA = 160;

export type TipoResultado = 'endereco' | 'rua' | 'bairro' | 'local';
export interface ResultadoBusca { rotulo: string; lat: number; lng: number; tipo: TipoResultado }
export const ROTULO_TIPO_RESULTADO: Record<TipoResultado, string> = { endereco: 'Endereço', rua: 'Rua', bairro: 'Bairro', local: 'Local' };

const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/gu;
const COORDENADA = /^-?\d{1,3}(\.\d{1,12})?$/;

/** Texto da busca: sem caracteres de controle, espaços simples, de 3 letras ou números a 120 caracteres. `chave` é a do cache. */
export function normalizarConsulta(v: unknown): { ok: true; texto: string; chave: string } | { ok: false; erro: string } {
  if (typeof v !== 'string') return { ok: false, erro: 'Digite uma rua, um endereço ou um bairro.' };
  const texto = v.normalize('NFC').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();
  if (!texto) return { ok: false, erro: 'Digite uma rua, um endereço ou um bairro.' };
  if (texto.length > MAX_CARACTERES_BUSCA) return { ok: false, erro: `A busca pode ter no máximo ${MAX_CARACTERES_BUSCA} caracteres.` };
  if ((texto.match(LETRA_OU_NUMERO) ?? []).length < MIN_LETRAS_BUSCA) return { ok: false, erro: `Digite ao menos ${MIN_LETRAS_BUSCA} letras ou números.` };
  return { ok: true, texto, chave: texto.toLocaleLowerCase('pt-BR') };
}

/** Consulta ao Nominatim: Brasil, caixa da cidade mais o entorno (bounded), português, poucos resultados. */
export function montarUrlBusca(texto: string): URL {
  const e = GOIANIA.entorno;
  const url = new URL(URL_NOMINATIM);
  url.search = new URLSearchParams({
    q: texto,
    format: 'jsonv2',
    countrycodes: 'br',
    viewbox: [e.lngMin, e.latMax, e.lngMax, e.latMin].map((n) => n.toFixed(4)).join(','),
    bounded: '1',
    limit: String(MAX_RESULTADOS_BUSCA),
    'accept-language': 'pt-BR',
    addressdetails: '0',
  }).toString();
  return url;
}

function coordenada(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !COORDENADA.test(v)) return null;
  return Number(v);
}

/** Rótulo para a tela: texto puro (a tela usa textContent), sem controle, sem ", Brasil" no fim, até 160 caracteres. */
export function limparRotulo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let t = v.normalize('NFC').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim().replace(/,\s*Brasil$/i, '').trim();
  if (t.length > MAX_ROTULO_BUSCA) t = `${t.slice(0, MAX_ROTULO_BUSCA - 1).trimEnd()}…`;
  return t ? t : null;
}

const textoDe = (o: Record<string, unknown>, k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
const BAIRROS = ['suburb', 'neighbourhood', 'quarter', 'city_district', 'residential'];
export function tipoDoResultado(o: Record<string, unknown>): TipoResultado {
  const categoria = textoDe(o, 'category') || textoDe(o, 'class');
  const tipo = textoDe(o, 'type');
  const endereco = textoDe(o, 'addresstype');
  if (['house', 'building'].includes(endereco) || tipo === 'house') return 'endereco';
  if (categoria === 'highway' || endereco === 'road') return 'rua';
  if (BAIRROS.includes(endereco) || BAIRROS.includes(tipo)) return 'bairro';
  return 'local';
}

/** Resposta do Nominatim → no máximo 5 resultados dentro da cidade e do entorno, sem repetir o mesmo ponto. null = formato inesperado. */
export function lerResultados(bruto: unknown): ResultadoBusca[] | null {
  if (!Array.isArray(bruto)) return null;
  const saida: ResultadoBusca[] = [];
  const vistos = new Set<string>();
  for (const item of bruto.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const lat = coordenada(o.lat);
    const lng = coordenada(o.lon);
    if (lat === null || lng === null || !dentroDaAreaAceita({ lat, lng })) continue;
    const rotulo = limparRotulo(o.display_name);
    if (!rotulo) continue;
    const ponto = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    const k = `${ponto.lat.toFixed(5)},${ponto.lng.toFixed(5)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ rotulo, lat: ponto.lat, lng: ponto.lng, tipo: tipoDoResultado(o) });
    if (saida.length >= MAX_RESULTADOS_BUSCA) break;
  }
  return saida;
}
