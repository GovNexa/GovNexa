import type { BancoD1 } from '../repositorio/d1.ts';
export const iso = () => new Date(Date.now()).toISOString();
export const depois = (ms: number) => new Date(Date.now() + ms).toISOString();
export const bytes = (s: string) => new TextEncoder().encode(s);
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const deb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
export const aleatorio = (n = 32) => crypto.getRandomValues(new Uint8Array(n));
export async function hash(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s))), b => b.toString(16).padStart(2,'0')).join(''); }
export function iguais(a: Uint8Array, b: Uint8Array) { let d = a.length ^ b.length; for(let i=0;i<Math.max(a.length,b.length);i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0); return d === 0; }
export async function gravar(db: BancoD1, sql: string, ...v: unknown[]) { return (await db.batch([db.prepare(sql).bind(...v)]))[0]; }
export function modoLocal(r: Request) { return !r.headers.has('cf-ray') && ['localhost','127.0.0.1'].includes(new URL(r.url).hostname); }
export function voltaSegura(s: string | null) { return s && /^\/plataforma\//.test(s) && !/[\\\r\n]/.test(s) ? s : '/plataforma/'; }
