declare namespace App {
 interface Locals {
  usuario: import('./lib/usuarios/tipos.ts').Usuario;
  repositorio: import('./lib/repositorio/tipos.ts').RepositorioProjetos;
 }
}

declare module "cloudflare:workers" {
 export function waitUntil(tarefa: Promise<unknown>): void;
 export const env: import("../worker/index.ts").Env;
}
