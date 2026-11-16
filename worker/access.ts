type Chave = JsonWebKey & { kid?: string };
type Entrada = { ate: number; ultimaBusca: number; chaves: Chave[]; buscando?: Promise<void> };
const cache = new Map<string, Entrada>();
async function atualizar(dominio: string, entrada: Entrada): Promise<void> {
  if (entrada.buscando) return entrada.buscando;
  if (Date.now() - entrada.ultimaBusca < 60_000) return;
  entrada.ultimaBusca = Date.now();
  entrada.buscando = (async () => {
    const resposta = await fetch(`https://${dominio}/cdn-cgi/access/certs`, { redirect: 'error' });
    if (!resposta.ok) throw new Error('JWKS indisponível');
    const jwks = await resposta.json() as { keys?: Chave[] };
    if (!Array.isArray(jwks.keys)) throw new Error('JWKS inválido');
    entrada.chaves = jwks.keys;
    entrada.ate = Date.now() + 5 * 60_000;
  })();
  try { await entrada.buscando; } finally { entrada.buscando = undefined; }
}
function bytes(texto: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) throw new Error('base64 inválida');
  return Uint8Array.from(atob(texto.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function objeto(texto: string): Record<string, unknown> {
  const valor: unknown = JSON.parse(new TextDecoder().decode(bytes(texto)));
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('objeto inválido');
  return valor as Record<string, unknown>;
}
export async function verificarAccess(token: string | null, dominio: string, aud: string): Promise<boolean> {
  try {
    if (!token || !aud || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(dominio)) return false;
    const partes = token.split('.');
    if (partes.length !== 3) return false;
    const [cab, corpo, assinatura] = partes;
    const header = objeto(cab), claims = objeto(corpo);
    const agora = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
    if (claims.iss !== `https://${dominio}` || !(Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud)) return false;
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= agora) return false;
    if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > agora)) return false;
    let entrada = cache.get(dominio);
    if (!entrada) {
      entrada = { ate: 0, ultimaBusca: -Infinity, chaves: [] };
      cache.set(dominio, entrada);
    }
    if (entrada.ate <= Date.now() || !entrada.chaves.some(k => k.kid === header.kid)) await atualizar(dominio, entrada);
    if (entrada.ate <= Date.now()) return false;
    const jwk = entrada.chaves.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!jwk) return false;
    const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, bytes(assinatura), new TextEncoder().encode(`${cab}.${corpo}`));
  } catch {
    return false;
  }
}
