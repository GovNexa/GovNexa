import {defineConfig,devices} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_PORT||4321),loginPort=port+1;
const localEnv={SENHA_PEPPER:'pepper-ficticio-playwright',DEV_EMAIL:'dev@exemplo.invalid',GOVNEXA_EXEMPLO:'1',WRANGLER_LOG_PATH:'.tmp/wrangler-playwright.log',TMPDIR:process.cwd()+'/.tmp'};
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:true,use:{baseURL:`http://127.0.0.1:${port}`},
 webServer:[
  {command:`npm run build && npm run db:local && npx wrangler dev --var AMBIENTE:local --infer-origin-from-routes=false --ip 127.0.0.1 --port ${port} --var ACESSO_LOCAL_LIVRE:1 --var DEV_EMAIL:dev@exemplo.invalid`,env:localEnv,url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:180000},
  // Espera a primeira preparação; ambos usam o mesmo D1 local, mas nenhum teste Access modifica o login.
  {command:`node --input-type=module -e 'const fim=Date.now()+170000;while(true){try{const r=await fetch("http://127.0.0.1:${port}/entrar/");if(r.ok)break;}catch{}if(Date.now()>fim)throw new Error("Servidor local indisponível.");await new Promise(r=>setTimeout(r,500));}'  && npx wrangler dev --var AMBIENTE:local --infer-origin-from-routes=false --ip 127.0.0.1 --port ${loginPort} --var LOGIN_MODO:senha --var EMAIL_SIMULADO:1 --var SENHA_PEPPER:pepper-ficticio-playwright --var TOTP_CHAVE:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= --var TURNSTILE_SITE_KEY: --var TURNSTILE_SECRET:`,env:{...localEnv,WRANGLER_LOG_PATH:'.tmp/wrangler-login.log'},url:`http://127.0.0.1:${loginPort}/entrar/`,reuseExistingServer:false,timeout:180000}
 ],
 projects:[
  {name:'chromium',testIgnore:'**/login*.spec.ts',use:{...devices['Desktop Chrome']}},
  {name:'webkit',testIgnore:'**/login*.spec.ts',use:{...devices['Desktop Safari']}},
  {name:'login',testMatch:'**/login*.spec.ts',use:{...devices['Desktop Chrome'],baseURL:`http://127.0.0.1:${loginPort}`}}
 ]
});
