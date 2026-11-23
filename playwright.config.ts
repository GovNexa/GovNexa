import {defineConfig,devices} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_PORT||4321),loginPort=port+1,leituraPort=port+2;
const localEnv={SENHA_PEPPER:'pepper-ficticio-playwright',DEV_EMAIL:'dev@exemplo.invalid',GOVNEXA_EXEMPLO:'1',WRANGLER_LOG_PATH:'.tmp/wrangler-playwright.log',TMPDIR:process.cwd()+'/.tmp'};
// Espera a primeira preparação (build + banco local) antes de subir os servidores que reaproveitam o mesmo D1 local.
const esperar=`node --input-type=module -e 'const fim=Date.now()+170000;while(true){try{const r=await fetch("http://127.0.0.1:${port}/entrar/");if(r.ok)break;}catch{}if(Date.now()>fim)throw new Error("Servidor local indisponível.");await new Promise(r=>setTimeout(r,500));}'`;
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:true,use:{baseURL:`http://127.0.0.1:${port}`},
 webServer:[
  {command:`npm run build && npm run db:local && npx wrangler dev --var AMBIENTE:local --infer-origin-from-routes=false --ip 127.0.0.1 --port ${port} --var ACESSO_LOCAL_LIVRE:1 --var DEV_EMAIL:dev@exemplo.invalid --var LOGIN_MODO:access`,env:localEnv,url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:180000},
  // Nenhum teste Access modifica o login.
  {command:`${esperar}  && npx wrangler dev --var AMBIENTE:local --infer-origin-from-routes=false --ip 127.0.0.1 --port ${loginPort} --var LOGIN_MODO:senha --var EMAIL_SIMULADO:1 --var SENHA_PEPPER:pepper-ficticio-playwright --var TOTP_CHAVE:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= --var TURNSTILE_SITE_KEY: --var TURNSTILE_SECRET:`,env:{...localEnv,WRANGLER_LOG_PATH:'.tmp/wrangler-login.log'},url:`http://127.0.0.1:${loginPort}/entrar/`,reuseExistingServer:false,timeout:180000},
  // E11: o mesmo site com o usuário fictício de perfil leitura (semente de scripts/db-local.mjs), só para os testes tests/leitura-*.spec.ts.
  {command:`${esperar}  && npx wrangler dev --var AMBIENTE:local --infer-origin-from-routes=false --ip 127.0.0.1 --port ${leituraPort} --var ACESSO_LOCAL_LIVRE:1 --var DEV_EMAIL:leitura@exemplo.invalid --var LOGIN_MODO:access`,env:{...localEnv,DEV_EMAIL:'leitura@exemplo.invalid',WRANGLER_LOG_PATH:'.tmp/wrangler-leitura.log'},url:`http://127.0.0.1:${leituraPort}/entrar/`,reuseExistingServer:false,timeout:180000}
 ],
 projects:[
  {name:'chromium',testIgnore:['**/login*.spec.ts','**/leitura-*.spec.ts'],use:{...devices['Desktop Chrome']}},
  {name:'webkit',testIgnore:['**/login*.spec.ts','**/leitura-*.spec.ts'],use:{...devices['Desktop Safari']}},
  {name:'login',testMatch:'**/login*.spec.ts',use:{...devices['Desktop Chrome'],baseURL:`http://127.0.0.1:${loginPort}`}},
  {name:'leitura',testMatch:'**/leitura-*.spec.ts',use:{...devices['Desktop Chrome'],baseURL:`http://127.0.0.1:${leituraPort}`}}
 ]
});
