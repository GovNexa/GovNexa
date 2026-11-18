// Geocodificação aproximada por bairro (centro do bairro) via OpenStreetMap Nominatim. Roda À MÃO; nunca no build.
// Uso: node scripts/geocodificar-bairros.ts [--bairros <lista.json> | --carteira <carteira.json>]
//      [--saida <geo-bairros.json>] [--sql <bairros.sql> --prefeitura 5208707] [--refazer]
// Padrão: a carteira ativa (mesmo caminho de caminhoCarteira()) e geo-bairros.json NA MESMA PASTA dela.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { caminhoCarteira } from '../src/lib/carteira/carga.ts';
import type { Carteira } from '../src/lib/carteira/tipos.ts';
import { expandirBairro, semTipoDeBairro, GOIANIA, dentroDeGoiania, type GeoBairro } from '../src/lib/mapa/geo.ts';

const FONTE = 'OpenStreetMap Nominatim (© colaboradores do OpenStreetMap, ODbL)';
const ESPERA_MS = 1100;
export const VERSAO_REGRAS = 2;
export function reaproveitarEntradas(geo: { versao_regras?: number; bairros?: Record<string, GeoBairro> }): Record<string, GeoBairro> {
  return geo.versao_regras === VERSAO_REGRAS ? geo.bairros ?? {} : {};
}

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const cinco = (n: number): number => Math.round(n * 1e5) / 1e5;

export interface ResultadoNominatim {
  name?: string; lat?: string; lon?: string; type?: string; addresstype?: string;
  address?: { city?: string; municipality?: string; town?: string };
}
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
// Tipos conhecidos de ABREVIACOES em geo.ts, com os compostos primeiro.
const TIPOS = ['Conjunto Residencial', 'Sítio de Recreio', 'Setor', 'Vila', 'Jardim', 'Residencial', 'Conjunto', 'Bairro', 'Parque', 'Loteamento', 'Chácaras', 'Village', 'Condomínio', 'Esplanada', 'Fazenda'].map(normalizar);
function identificar(nome: string) {
  const completo = normalizar(expandirBairro(nome));
  const tipo = TIPOS.find(t => completo.startsWith(t + ' ')) ?? null;
  return { tipo, nome: tipo ? completo.slice(tipo.length + 1) : completo };
}
export function selecionarResultado(lista: ResultadoNominatim[], procurado: string, nomes: readonly string[], segundaTentativa = false): { lat: number; lng: number } | null {
  const alvo = identificar(procurado);
  const ambiguo = nomes.some(n => {
    const outro = identificar(n);
    return outro.nome === alvo.nome && outro.tipo !== null && outro.tipo !== alvo.tipo;
  });
  const validos = lista.filter(r => {
    if (typeof r.name !== 'string') return false;
    const encontrado = identificar(r.name);
    if (!alvo.nome || encontrado.nome !== alvo.nome) return false;
    if (alvo.tipo && encontrado.tipo && alvo.tipo !== encontrado.tipo) return false;
    if (alvo.tipo && !encontrado.tipo && !(segundaTentativa && !ambiguo)) return false;
    if (!alvo.tipo && encontrado.tipo) {
      const outros = [...nomes, ...lista.flatMap(r => typeof r.name === 'string' ? [r.name] : [])];
      if (outros.some(n => {
        const outro = identificar(n);
        return outro.nome === alvo.nome && outro.tipo !== null && outro.tipo !== encontrado.tipo;
      })) return false;
    }
    const municipio = [r.address?.city, r.address?.municipality, r.address?.town];
    return municipio.some(n => typeof n === 'string' && normalizar(n) === 'goiania')
      && dentroDeGoiania({ lat: Number(r.lat), lng: Number(r.lon) });
  });
  const tipos = ['bairro', 'suburb', 'neighbourhood', 'quarter'];
  const r = validos.find(r => tipos.includes(r.addresstype ?? '') || tipos.includes(r.type ?? '')) ?? validos[0];
  return r ? { lat: cinco(Number(r.lat)), lng: cinco(Number(r.lon)) } : null;
}

export async function consultar(busca: string, requisitar: typeof fetch = fetch, esperar = dormir, procurado = busca, nomes: readonly string[] = [procurado], segundaTentativa = false): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    format: 'jsonv2', limit: '5', addressdetails: '1', countrycodes: 'br',
    // Busca livre (o campo `street` é para ruas e não acha bairros); o município é conferido em selecionarResultado.
    q: `${busca}, Goiânia, Goiás`,
    bounded: '1', viewbox: `${GOIANIA.caixa.lngMin},${GOIANIA.caixa.latMax},${GOIANIA.caixa.lngMax},${GOIANIA.caixa.latMin}`,
  }).toString();
  for (let tentativa = 0; ; tentativa++) {
    const resp = await requisitar(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'GovNexa-geocodificacao/1.0 (+https://govnexa.com.br)' } });
    if ((resp.status === 429 || resp.status >= 500) && tentativa < 3) {
      const cabecalho = resp.headers.get('Retry-After');
      const segundos = cabecalho !== null && /^\d+(\.\d+)?$/.test(cabecalho.trim()) ? Number(cabecalho) * 1000 : NaN;
      const prazo = Number.isFinite(segundos) ? segundos : cabecalho ? Date.parse(cabecalho) - Date.now() : 0;
      await esperar(Math.max(5000, Number.isFinite(prazo) ? prazo : 0));
      continue;
    }
    if (!resp.ok) throw new Error(`Nominatim respondeu ${resp.status}`);
    return selecionarResultado(await resp.json() as ResultadoNominatim[], procurado, nomes, segundaTentativa);
  }
}

export function invalidarPontosAmbiguos(bairros: Record<string, GeoBairro>): string[] {
  const pontos = new Map<string, string[]>();
  for (const [nome, g] of Object.entries(bairros)) {
    if (!g.encontrado) continue;
    const chave = `${cinco(g.lat!)},${cinco(g.lng!)}`;
    pontos.set(chave, [...(pontos.get(chave) ?? []), nome]);
  }
  const ambiguos = [...pontos.values()].filter(grupo => new Set(grupo.map(nome => {
    const identificado = identificar(nome);
    return JSON.stringify([identificado.tipo, identificado.nome]);
  })).size > 1).flat();
  for (const nome of ambiguos) bairros[nome] = { busca: bairros[nome].busca, encontrado: false };
  return ambiguos;
}

export function gerarSql(geo: import('../src/lib/mapa/geo.ts').GeoBairros, prefeituraId: number): string {
  if (!Number.isSafeInteger(prefeituraId) || prefeituraId !== 5208707) throw new Error('Use --prefeitura 5208707 (Goiânia).');
  const texto = (v: string) => "'" + v.replaceAll("'", "''") + "'";
  return Object.entries(geo.bairros).map(([bairro, g]) => {
    if (g.encontrado && !dentroDeGoiania({lat: g.lat!, lng: g.lng!})) throw new Error('Coordenadas inválidas.');
    return `INSERT INTO bairro_geo(prefeitura_id,bairro,busca,encontrado,lat,lng,fonte,gerado_em) VALUES(${prefeituraId},${texto(bairro)},${texto(g.busca)},${g.encontrado ? 1 : 0},${g.encontrado ? g.lat : 'NULL'},${g.encontrado ? g.lng : 'NULL'},${texto(geo.fonte ?? FONTE)},${texto(geo.gerado_em ?? '')}) ON CONFLICT(prefeitura_id,bairro) DO UPDATE SET busca=excluded.busca,encontrado=excluded.encontrado,lat=excluded.lat,lng=excluded.lng,fonte=excluded.fonte,gerado_em=excluded.gerado_em;`;
  }).join('\n') + '\n';
}

export async function main(): Promise<void> {
  const entradaBairros = argumento('--bairros');
  const arqCarteira = resolve(entradaBairros ?? argumento('--carteira') ?? caminhoCarteira());
  const arqSql = argumento('--sql');
  const prefeitura = Number(argumento('--prefeitura'));
  if (arqSql && prefeitura !== 5208707) throw new Error('Use --prefeitura 5208707.');
  const arqSaida = resolve(argumento('--saida') ?? join(dirname(arqCarteira), 'geo-bairros.json'));
  const refazer = process.argv.includes('--refazer');
  /** Consulta de novo só os bairros marcados como não encontrados (mantém os achados). */
  const refazerFaltantes = process.argv.includes('--refazer-faltantes');

  const entrada = JSON.parse(readFileSync(arqCarteira, 'utf8'));
  const lista: { bairro: string | null }[] = entradaBairros ? entrada : (entrada as Carteira).projetos;
  if (!Array.isArray(lista) || lista.some(p => !p || (p.bairro !== null && typeof p.bairro !== 'string'))) throw new Error('Lista de bairros inválida.');
  const bairros = [...new Set(lista.map((p) => (p.bairro ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  let existentes: Record<string, GeoBairro> = {};
  if (existsSync(arqSaida) && !refazer) {
    try { existentes = reaproveitarEntradas(JSON.parse(readFileSync(arqSaida, 'utf8'))); } catch { existentes = {}; }
  }

  const resultado: Record<string, GeoBairro> = {};
  let consultas = 0;
  for (const nome of bairros) {
    if (existentes[nome] && (existentes[nome].encontrado || !refazerFaltantes)) { resultado[nome] = existentes[nome]; continue; }
    let busca = expandirBairro(nome);
    if (consultas > 0) await dormir(ESPERA_MS);
    consultas++;
    let p = await consultar(busca, fetch, dormir, nome, bairros);
    // Segunda tentativa só com o nome, sem o tipo do começo ("Bairro Santa Genoveva" → "Santa Genoveva").
    const curto = p ? null : semTipoDeBairro(busca);
    if (curto) { await dormir(ESPERA_MS); consultas++; p = await consultar(curto, fetch, dormir, nome, bairros, true); busca = curto; }
    resultado[nome] = p ? { busca, lat: p.lat, lng: p.lng, encontrado: true } : { busca, encontrado: false };
  }

  const ambiguos = invalidarPontosAmbiguos(resultado);
  const ordenado: Record<string, GeoBairro> = {};
  for (const k of Object.keys(resultado).sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    const g = resultado[k];
    ordenado[k] = g.encontrado ? { busca: g.busca, encontrado: true, lat: g.lat, lng: g.lng } : { busca: g.busca, encontrado: false };
  }
  const saida = { versao_regras: VERSAO_REGRAS, bairros: ordenado, fonte: FONTE, gerado_em: new Date().toISOString() };
  if (arqSql) writeFileSync(resolve(arqSql), gerarSql(saida, prefeitura), 'utf8');
  writeFileSync(arqSaida, JSON.stringify(saida, null, 2) + '\n', 'utf8');

  const achados = Object.values(ordenado).filter((g) => g.encontrado).length;
  console.log(`Bairros: ${achados} encontrados de ${bairros.length} (${consultas} consultas novas). Caixa de Goiânia: lat ${GOIANIA.caixa.latMin}..${GOIANIA.caixa.latMax}, lng ${GOIANIA.caixa.lngMin}..${GOIANIA.caixa.lngMax}.`);
  console.log(`Gravado em ${arqSaida}`);

  console.log(`Ambíguos: ${ambiguos.length}`);
  for (const nome of ambiguos) console.log(`- ${nome}: ponto compartilhado`);
  console.log(`Não encontrados: ${bairros.length - achados}`);
  for (const [nome, g] of Object.entries(ordenado)) if (!g.encontrado) console.log(`- ${nome}: ${g.busca}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
