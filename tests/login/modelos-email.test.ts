import test from 'node:test';
import assert from 'node:assert/strict';
import { modeloLink, modeloAviso } from '../../src/lib/login/modelos-email.ts';

const momento='2026-11-17T15:34:00.000Z';
const link='https://exemplo.invalid/senha?token=teste&origem="<teste>\'';
test('snapshot lógico dos quatro e-mails com a marca',()=>{
 const modelos=[modeloLink('convite',link,momento),modeloLink('redefinicao',link,momento),modeloAviso('senha',momento),modeloAviso('2fa',momento)];
 for(const modelo of modelos){
  for(const cor of ['#F2C200','#F36E22','#1F6B3A','#002E47'])assert.ok(modelo.html.includes(`background-color:${cor}`));
  assert.equal((modelo.html.match(/width="25%" height="4"/g)||[]).length,4);
  assert.match(modelo.html,/mso-hide:all/);
  assert.match(modelo.html,/<table role="presentation"/);
  assert.match(modelo.html,/max-width:600px/);
  assert.match(modelo.html,/17\/11\/2026 12:34/);
  assert.match(modelo.texto,/17\/11\/2026 12:34/);
  assert.match(modelo.texto,/contato@govnexa.com.br/);
  assert.doesNotMatch(modelo.html,/<style|<script|<img|<link/i);
 }
 for(const [indice,botao] of ['Definir minha senha','Criar nova senha'].entries()){
  const modelo=modelos[indice];
  assert.ok(modelo.html.includes(`>${botao}</a>`));
  assert.ok(modelo.html.includes('https://exemplo.invalid/senha?token=teste&amp;origem=&quot;&lt;teste&gt;&#39;'));
  assert.ok(modelo.texto.includes(link));
  assert.match(modelo.texto,/só pode ser usado uma vez/);
 }
 for(const modelo of [modeloLink('convite','https://exemplo.invalid',momento),modeloLink('redefinicao','https://exemplo.invalid',momento),...modelos.slice(2)])assert.doesNotMatch(modelo.texto,/<[^>]*>/);
 assert.match(modelos[0].texto,/aplicativo autenticador no celular/);
 assert.match(modelos[1].texto,/sua senha continua a mesma/);
 for(const modelo of modelos.slice(2))assert.match(modelo.texto,/Se não foi você, procure um administrador imediatamente/);
});
test('nome externo fica escapado no HTML e literal no texto puro',()=>{
 const modelo=modeloLink('convite','https://exemplo.invalid',momento,'<script>"&\'</script>');
 assert.ok(modelo.html.includes('Olá, &lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;!'));
 assert.doesNotMatch(modelo.html,/<script>/);
 assert.ok(modelo.texto.includes('Olá, <script>"&\'</script>!'));
 assert.match(modeloLink('convite','https://exemplo.invalid',momento).texto,/Olá!/);
});
test('avisos usam o momento atual por padrão',()=>{
 const antes=new Date();
 const modelo=modeloAviso('senha');
 const depois=new Date();
 assert.ok([antes,depois].some(d=>modelo.texto.includes(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d))));
});
