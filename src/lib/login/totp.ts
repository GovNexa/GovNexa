import qrcode from 'qrcode-generator';
import { aleatorio, b64, deb64, bytes, iguais } from './base.ts';
const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(b: Uint8Array) { let valor=0,bits=0,s=''; for(const n of b) {valor=(valor<<8)|n;bits+=8;while(bits>=5){bits-=5;s+=alfabeto[(valor>>>bits)&31];}} if(bits)s+=alfabeto[(valor<<(5-bits))&31]; return s; }
export function deBase32(s: string): Uint8Array<ArrayBuffer> { let v=0,bits=0;const r:number[]=[];for(const c of s.replace(/=+$/,'').toUpperCase()){const n=alfabeto.indexOf(c);if(n<0)throw new Error('Chave inválida.');v=(v<<5)|n;bits+=5;if(bits>=8){bits-=8;r.push((v>>>bits)&255);}}return new Uint8Array(r); }
export const gerarSegredo = () => base32(aleatorio(20));
export async function codigoTotp(segredo: string, tempo = Date.now(), digitos = 6) {
 const passo = Math.floor(tempo/30000), contador = new Uint8Array(8); new DataView(contador.buffer).setBigUint64(0,BigInt(passo));
 const k = await crypto.subtle.importKey('raw',deBase32(segredo),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const h = new Uint8Array(await crypto.subtle.sign('HMAC',k,contador)), o=h[19]&15;
 const n=((h[o]&127)*16777216)+(h[o+1]<<16)+(h[o+2]<<8)+h[o+3];
 return String(n % 10**digitos).padStart(digitos,'0');
}
export async function verificarTotp(segredo: string, codigo: string, ultimo: number | null, tempo = Date.now()) {
 if(!/^\d{6}$/.test(codigo))return null;
 const atual = Math.floor(tempo/30000);
 for(const p of [atual,atual-1,atual+1]) if((ultimo === null || p > ultimo) && iguais(bytes(await codigoTotp(segredo,p*30000)),bytes(codigo)))return p;
 return null;
}
async function chave(s: string) { const b=deb64(s);if(b.length!==32)throw new Error('Login não configurado.');return crypto.subtle.importKey('raw',b,'AES-GCM',false,['encrypt','decrypt']); }
export async function cifrarSegredo(segredo: string, segredoChave: string, usuarioId: string) { const iv=aleatorio(12);return `${b64(iv)}.${b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(usuarioId)},await chave(segredoChave),bytes(segredo))))}`; }
export async function decifrarSegredo(s: string, segredoChave: string, usuarioId: string) { const [iv,c]=s.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:deb64(iv),additionalData:bytes(usuarioId)},await chave(segredoChave),deb64(c))); }
export const uriTotp = (email: string, segredo: string) => `otpauth://totp/GovNexa:${encodeURIComponent(email)}?secret=${segredo}&issuer=GovNexa`;
export function qrSvg(uri: string) {const q=qrcode(0,'M');q.addData(uri);q.make();return q.createSvgTag({cellSize:4,margin:4,scalable:true});}
export function gerarCodigosRecuperacao() {return Array.from({length:10},()=>{const h=Array.from(aleatorio(4),b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,4)}-${h.slice(4)}`;});}
