import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { bancoTeste } from '../helpers/d1.ts';
import { hashSenha, verificarSenha, validarSenhaNova } from '../../src/lib/login/senha.ts';
import { criarToken, consultarToken } from '../../src/lib/login/tokens.ts';
import { base32, codigoTotp, verificarTotp, cifrarSegredo, decifrarSegredo } from '../../src/lib/login/totp.ts';
import { criarSessao, obterSessao, cookieSessao } from '../../src/lib/login/sessao.ts';
import { hash } from '../../src/lib/login/base.ts';
import { servicoLogin, ERRO_LOGIN, RESPOSTA_ESQUECI } from '../../src/lib/login/servico.ts';
import { emailsLocais } from '../../src/lib/login/email.ts';
const pepper='pepper-ficticio-playwright', chave='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const request=new Request('http://localhost/entrar/',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
async function preparar() {
 const b=bancoTeste('central');
 b.sqlite.exec("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('admin','dev@exemplo.invalid','Administrador local','admin',5208707)");
 const env={DB_CENTRAL:b.db,SENHA_PEPPER:pepper,TOTP_CHAVE:chave,EMAIL_SIMULADO:'1',AMBIENTE:'local'};
 const servico=servicoLogin(env,request),u=(await b.db.prepare('SELECT * FROM usuario WHERE id = ?').bind('admin').first<any>())!;
 return {...b,env,servico,u};
}
test('senha: PBKDF2, pepper, sal e validação simples sem regras de símbolos',async()=>{
 const h=await hashSenha('Horizonte!local-7264',pepper);assert.match(h,/^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/);
 assert.equal(await verificarSenha('Horizonte!local-7264',h,pepper),true);assert.equal(await verificarSenha('outra',h,pepper),false);assert.equal(await verificarSenha('Horizonte!local-7264',h,'outro'),false);
 assert.notEqual(h,await hashSenha('Horizonte!local-7264',pepper));
 const p={email:'equipe@exemplo.invalid',nome:'Operador local'};
 for(const s of ['curta','password123','administrador','ádministrador','equipe987654321','operador987654321','x'.repeat(129)])assert.ok(validarSenhaNova(s,p));
 assert.equal(validarSenhaNova('montanhas azuis distantes',p),null);
});
test('TOTP: todos os vetores SHA1 RFC 6238, janela e reuso; cifra autenticada',async()=>{
 const segredo=base32(new TextEncoder().encode('12345678901234567890'));
 for(const [t,c] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)assert.equal(await codigoTotp(segredo,t*1000,8),c);
 const tempo=1234567890000,c=await codigoTotp(segredo,tempo),p=Math.floor(tempo/30000);
 assert.equal(await verificarTotp(segredo,c,null,tempo),p);assert.equal(await verificarTotp(segredo,c,p,tempo),null);assert.equal(await verificarTotp(segredo,c,null,tempo+30000),p);assert.equal(await verificarTotp(segredo,c,null,tempo+60000),null);
 const cifrado=await cifrarSegredo(segredo,chave,'admin');assert.equal(await decifrarSegredo(cifrado,chave,'admin'),segredo);assert.ok(!cifrado.includes(segredo));await assert.rejects(decifrarSegredo(cifrado.slice(0,-4)+'AAAA',chave,'admin'));
});
test('tokens: GET não consome; expirado, usado, tipo errado, substituição e POST concorrente',async()=>{
 const b=await preparar();try{
 const a=await criarToken(b.db,'admin','convite');assert.ok(await consultarToken(b.db,a.token,'convite'));assert.equal(await consultarToken(b.db,a.token,'redefinicao'),null);
 const c=await criarToken(b.db,'admin','convite');assert.equal(await consultarToken(b.db,a.token,'convite'),null);
 b.sqlite.prepare("UPDATE token_email SET expira_em = '2000-01-01T00:00:00.000Z' WHERE id_hash = ?").run(await hash(c.token));assert.equal(await consultarToken(b.db,c.token,'convite'),null);
 const t=await criarToken(b.db,'admin','convite');const resultados=await Promise.allSettled([1,2].map(()=>b.servico.definirSenhaComToken(t.token,'convite','Horizonte!local-7264')));assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(await consultarToken(b.db,t.token,'convite'),null);
 assert.equal(b.sqlite.prepare("SELECT count(*) n FROM sessao WHERE revogada_em IS NULL").get()!.n,1);
 }finally{b.sqlite.close();}
});
test('sessões: etapa, expiração absoluta, ociosidade, revogação e cookies locais',async()=>{
 const b=await preparar();try{
 const valor=await criarSessao(b.db,'admin','completa');assert.ok(await obterSessao(b.db,valor));
 b.sqlite.exec("UPDATE sessao SET ultimo_uso_em = '2000-01-01T00:00:00.000Z'");assert.equal(await obterSessao(b.db,valor),null);
 const curto=await criarSessao(b.db,'admin','segundo_fator');b.sqlite.exec("UPDATE sessao SET expira_em = '2000-01-01T00:00:00.000Z'");assert.equal(await obterSessao(b.db,curto),null);
 const novo=await criarSessao(b.db,'admin','completa');await b.servico.sair(novo);assert.equal(await obterSessao(b.db,novo),null);
 assert.match(cookieSessao(request,valor,false,b.env),/^govnexa_local=/);assert.doesNotMatch(cookieSessao(request,valor,false,b.env),/Secure/);assert.match(cookieSessao(new Request('https://exemplo.invalid'),valor),/^__Host-govnexa=.*; Secure/);assert.match(cookieSessao(new Request('http://localhost',{headers:{'cf-ray':'teste'}}),valor),/Secure/);
 }finally{b.sqlite.close();}
});
test('fluxo completo: convite, 2FA, recuperação única, redefinição sem sessão, reset 2FA e auditoria sem segredos',async()=>{
 const b=await preparar();try{
 const id=await b.servico.convidar(b.u,{nome:'Equipe de teste',email:'EQUIPE@exemplo.invalid',cargo:'Teste',perfil:'editor'});
 const lista=emailsLocais(request,b.env)!;const texto=lista.at(-1)!.texto,link=texto.match(/http:\/\/\S+/)![0],url=new URL(link),token=url.searchParams.get('token')!;
 const valor=(await b.servico.definirSenhaComToken(token,'convite','Montanhas!azuis-7264'))!;assert.equal((await obterSessao(b.db,valor))?.etapa,'configurar_2fa');
 const config=await b.servico.configurarTotp(valor);assert.ok(config.svg.includes('<svg'));const codigo=await codigoTotp(config.segredo);
 const final=await b.servico.confirmarTotp(valor,codigo);assert.equal(final.codigos.length,10);assert.equal((await b.servico.usuarioDaSessao(final.valor))?.id,id);assert.equal(await obterSessao(b.db,valor),null);
 let l=await b.servico.iniciarLogin('equipe@exemplo.invalid','Montanhas!azuis-7264');assert.equal(l.etapa,'segundo_fator');await assert.rejects(b.servico.concluirSegundoFator(l.valor,codigo));
 const recuperada=await b.servico.usarCodigoRecuperacao(l.valor,final.codigos[0]);assert.ok(await b.servico.usuarioDaSessao(recuperada));
 l=await b.servico.iniciarLogin('equipe@exemplo.invalid','Montanhas!azuis-7264');await assert.rejects(b.servico.usarCodigoRecuperacao(l.valor,final.codigos[0]));
 await b.servico.pedirRedefinicao('equipe@exemplo.invalid');const t=emailsLocais(request,b.env)!.at(-1)!.texto.match(/http:\/\/\S+/)![0];
 assert.equal(await b.servico.definirSenhaComToken(new URL(t).searchParams.get('token')!,'redefinicao','Caminhos!verdes-9382'),null);assert.equal(await b.servico.usuarioDaSessao(recuperada),null);
 assert.equal(b.sqlite.prepare('SELECT count(*) n FROM sessao WHERE revogada_em IS NULL').get()!.n,0);
 const novamente=await b.servico.iniciarLogin('equipe@exemplo.invalid','Caminhos!verdes-9382');assert.equal(novamente.etapa,'segundo_fator');
 await b.servico.redefinirSegundoFator(b.u,id);assert.equal(await obterSessao(b.db,novamente.valor),null);assert.equal(b.sqlite.prepare('SELECT count(*) n FROM codigo_recuperacao').get()!.n,0);
 assert.equal((await b.servico.iniciarLogin('equipe@exemplo.invalid','Caminhos!verdes-9382')).etapa,'configurar_2fa');
 const eventos=JSON.stringify(b.sqlite.prepare('SELECT detalhe FROM evento_acesso').all());for(const s of [token,codigo,config.segredo,final.codigos[0],'Montanhas!azuis-7264'])assert.ok(!eventos.includes(s));
 await b.servico.desativarUsuario(b.u,id);await assert.rejects(b.servico.iniciarLogin('equipe@exemplo.invalid','Caminhos!verdes-9382'),{message:ERRO_LOGIN});
 }finally{b.sqlite.close();}
});
test('bloqueio: cinco falhas por conta e vinte tentativas por IP; cinco códigos por sessão',async()=>{
 const b=await preparar();try{
 b.sqlite.prepare('UPDATE usuario SET senha_hash = ?').run(await hashSenha('Horizonte!local-7264',pepper));
 for(let i=0;i<5;i++)await assert.rejects(b.servico.iniciarLogin(b.u.email,'errada'),{message:ERRO_LOGIN});
 assert.ok(b.sqlite.prepare('SELECT bloqueado_ate FROM usuario').get()!.bloqueado_ate);await assert.rejects(b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264'),{message:ERRO_LOGIN});
 b.sqlite.exec('UPDATE usuario SET bloqueado_ate = NULL');
 for(let i=0;i<14;i++)await assert.rejects(b.servico.iniciarLogin('ausente@exemplo.invalid','errada'));
 await assert.rejects(b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264'),{message:ERRO_LOGIN});
 b.sqlite.exec('DELETE FROM limite_tentativa');
 const l=await b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264');await b.servico.configurarTotp(l.valor);
 for(let i=0;i<5;i++)await assert.rejects(b.servico.confirmarTotp(l.valor,'abcdef'));
 assert.equal(await obterSessao(b.db,l.valor),null);
 }finally{b.sqlite.close();}
});
test('esqueci: resposta igual para ausente, limites por e-mail/IP, rota de apoio só local',async()=>{
 const b=await preparar();try{
 assert.equal(await b.servico.pedirRedefinicao('ausente@exemplo.invalid'),RESPOSTA_ESQUECI);assert.equal(b.sqlite.prepare('SELECT count(*) n FROM token_email').get()!.n,0);
 for(let i=0;i<4;i++)assert.equal(await b.servico.pedirRedefinicao(b.u.email),RESPOSTA_ESQUECI);
 assert.equal(b.sqlite.prepare('SELECT count(*) n FROM token_email').get()!.n,3);
 for(let i=0;i<7;i++)await b.servico.pedirRedefinicao('outro@exemplo.invalid');
 const svc=servicoLogin(b.env,new Request('http://localhost',{headers:{'CF-Connecting-IP':'192.0.2.1'}}));await svc.pedirRedefinicao(b.u.email);assert.equal(b.sqlite.prepare('SELECT count(*) n FROM token_email').get()!.n,3);
 assert.equal(emailsLocais(new Request('https://exemplo.invalid'),b.env),null);assert.equal(emailsLocais(new Request('http://localhost',{headers:{'cf-ray':'x'}}),b.env),null);assert.equal(emailsLocais(request,{EMAIL_SIMULADO:'0'}),null);
 }finally{b.sqlite.close();}
});
test('admin: próprio acesso, último administrador, isolamento por prefeitura e revogação',async()=>{
 const b=await preparar();try{
 await assert.rejects(b.servico.desativarUsuario(b.u,'admin'));await assert.rejects(b.servico.alterarPerfil(b.u,'admin','leitura'));
 b.sqlite.exec("INSERT INTO prefeitura VALUES(1100015,1100015,'Outra','RO','DB_PREFEITURA_1100015',1); INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('fora','fora@exemplo.invalid','Outra equipe','admin',1100015)");
 assert.equal((await b.servico.listar(b.u)).length,1);
 for(const f of [()=>b.servico.desativarUsuario(b.u,'fora'),()=>b.servico.reativarUsuario(b.u,'fora'),()=>b.servico.alterarPerfil(b.u,'fora','editor'),()=>b.servico.redefinirSegundoFator(b.u,'fora'),()=>b.servico.reenviarConvite(b.u,'fora')])await assert.rejects(f,/Pessoa não encontrada/);
 const id=await b.servico.convidar(b.u,{nome:'Outra equipe',email:'outra@exemplo.invalid',cargo:'Teste',perfil:'admin'});
 await b.servico.alterarPerfil(b.u,'admin','leitura');await assert.rejects(b.servico.listar(b.u),/Sem permissão/);
 const outra=await b.db.prepare('SELECT * FROM usuario WHERE id = ?').bind(id).first<any>();await assert.rejects(b.servico.alterarPerfil(outra,id,'leitura'),/Mantenha/);
 }finally{b.sqlite.close();}
});
test('migração: só ADD/CREATE, sem padrões D1 acima de 50 bytes',()=>{
 const sql=readFileSync('db/d1/central/0002_login.sql','utf8');assert.doesNotMatch(sql,/\b(DROP|DELETE|UPDATE)\b/i);for(const m of sql.matchAll(/\b(?:GLOB|LIKE)\s+'([^']*)'/gi))assert.ok(Buffer.byteLength(m[1])<=50);
});

test('Worker senha: protege plataforma, completa exige 2FA, revoga inativo e mantém cabeçalhos',async()=>{
 const {atender}=await import('../../worker/index.ts');
 const b=await preparar(),municipal=bancoTeste();try{
 const env={...b.env,LOGIN_MODO:'senha',DB_PREFEITURA_5208707:municipal.db,ACCESS_TEAM_DOMAIN:'',ACCESS_AUD:'',ASSETS:{async fetch(){return new Response('ok');}}};
 const chamar=(path:string,cookie='',metodo='GET',origem='')=>{const r=new Request('http://localhost'+path,{method:metodo,headers:{cookie,...(origem?{origin:origem}:{})}});return atender(r,env,async()=>new Response('ok'));};
 assert.match((await chamar('/plataforma/')).headers.get('Location')!,/^\/entrar\/\?volta=/);
 const parcial=await criarSessao(b.db,'admin','segundo_fator');assert.equal((await chamar('/plataforma/',`govnexa_local=${parcial}`)).status,302);
 const completa=await criarSessao(b.db,'admin','completa'),c=`govnexa_local=${completa}`;
 const r=await chamar('/plataforma/',c);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 // Origin null e ausência de Origin continuam recusados nos POST de login.
 for(const origem of ['null','']){const negado=await chamar('/entrar/','','POST',origem);assert.equal(negado.status,403);assert.equal(negado.headers.get('Referrer-Policy'),'same-origin');}
 const login=await chamar('/entrar/');assert.equal(login.status,200);assert.equal(login.headers.get('Referrer-Policy'),'same-origin');assert.match(login.headers.get('Content-Security-Policy')!,/frame-src 'self' https:\/\/challenges.cloudflare.com/);
 assert.equal((await chamar('/sair',c,'POST','https://externo.invalid')).status,403);assert.ok(await obterSessao(b.db,completa));
 const confirmacao=await chamar('/sair',c);assert.equal(confirmacao.status,200);assert.match(await confirmacao.text(),/form method="post"/);assert.ok(await obterSessao(b.db,completa));
 const saiu=await chamar('/sair',c,'POST','http://localhost');assert.equal(saiu.headers.get('Location'),'/entrar/?saiu=1');assert.match(saiu.headers.get('Set-Cookie')!,/Max-Age=0/);assert.equal(await obterSessao(b.db,completa),null);
 const outra=await criarSessao(b.db,'admin','completa');b.sqlite.exec('UPDATE usuario SET ativo = 0');assert.equal((await chamar('/plataforma/',`govnexa_local=${outra}`)).status,302);assert.ok(b.sqlite.prepare('SELECT revogada_em FROM sessao WHERE id_hash = ?').get(await hash(outra))!.revogada_em);
 }finally{b.sqlite.close();municipal.sqlite.close();}
});
test('Turnstile e origem: só pula local sem site key; falha fechada em produção e erros sem detalhes',async()=>{
 const {conferirPost,conferirTurnstile,mensagemPublica}=await import('../../src/lib/login/http.ts');
 const b=await preparar(),f=new FormData(),original=globalThis.fetch;
 try{
 assert.throws(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST'})));
 assert.throws(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers:{origin:'https://externo.invalid'}})));
 assert.doesNotThrow(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers:{origin:'http://localhost','content-length':'0'}})));
 await conferirTurnstile(b.env,request,f);await assert.rejects(conferirTurnstile(b.env,new Request('https://exemplo.invalid'),f));
 globalThis.fetch=async()=>Response.json({success:true,hostname:'exemplo.invalid'});
 const config={...b.env,TURNSTILE_SITE_KEY:'teste',TURNSTILE_SECRET:'teste'};
 await conferirTurnstile(config,new Request('https://exemplo.invalid'),f);await assert.rejects(conferirTurnstile(config,new Request('https://outro.invalid'),f));
 globalThis.fetch=async()=>Response.json({success:false});await assert.rejects(conferirTurnstile(config,request,f));
 assert.doesNotMatch(mensagemPublica(new Error('D1 coluna senha_hash interna')),/D1|senha_hash/);
 const envSemEmail={DB_CENTRAL:b.db,SENHA_PEPPER:pepper,TOTP_CHAVE:chave};
 const s=servicoLogin(envSemEmail,new Request('https://exemplo.invalid'));
 assert.equal(await s.pedirRedefinicao('dev@exemplo.invalid'),RESPOSTA_ESQUECI);assert.equal(await s.pedirRedefinicao('ausente@exemplo.invalid'),RESPOSTA_ESQUECI);
 }finally{b.sqlite.close();globalThis.fetch=original;}
});

test('correção 3: dez falhas 2FA entre três sessões bloqueiam conta e revogam etapas pendentes',async()=>{
 const b=await preparar();try{
 const segredo=base32(new Uint8Array(20).fill(3));
 b.sqlite.prepare('UPDATE usuario SET senha_hash=?,totp_ativo=1,totp_segredo_cifrado=? WHERE id=?').run(await hashSenha('Horizonte!local-7264',pepper),await cifrarSegredo(segredo,chave,'admin'),'admin');
 const sessoes=[];for(let i=0;i<3;i++)sessoes.push((await b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264')).valor);
 await criarSessao(b.db,'admin','configurar_2fa');
 for(let i=0;i<3;i++)for(let j=0;j<5;j++)await assert.rejects(j%2?b.servico.usarCodigoRecuperacao(sessoes[i],'invalido'):b.servico.concluirSegundoFator(sessoes[i],'abcdef'));
 const u=b.sqlite.prepare('SELECT bloqueado_ate FROM usuario').get()!;
 assert.ok(Date.parse(String(u.bloqueado_ate))>Date.now()+3500000);
 assert.equal(b.sqlite.prepare("SELECT count(*) n FROM sessao WHERE revogada_em IS NULL AND etapa <> 'completa'").get()!.n,0);
 assert.equal(b.sqlite.prepare("SELECT contagem FROM limite_tentativa WHERE chave='2fa:conta:admin'").get()!.contagem,10);
 await assert.rejects(b.servico.concluirSegundoFator(sessoes[2],await codigoTotp(segredo)));
 await assert.rejects(b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264'));
 // Até uma sessão criada depois do bloqueio recusa o código antes de verificá-lo.
 const nova=await criarSessao(b.db,'admin','segundo_fator');await assert.rejects(b.servico.concluirSegundoFator(nova,await codigoTotp(segredo)));
 assert.equal(b.sqlite.prepare("SELECT count(*) n FROM evento_acesso WHERE tipo='2fa_conta_bloqueada'").get()!.n,1);
 }finally{b.sqlite.close();}
});
test('correção 3: contador 2FA só zera no sucesso; senha correta mantém falhas acumuladas',async()=>{
 const b=await preparar();try{
 const segredo=base32(new Uint8Array(20).fill(4));
 b.sqlite.prepare('UPDATE usuario SET senha_hash=?,totp_ativo=1,totp_segredo_cifrado=?,falhas_login=3 WHERE id=?').run(await hashSenha('Horizonte!local-7264',pepper),await cifrarSegredo(segredo,chave,'admin'),'admin');
 const l=await b.servico.iniciarLogin(b.u.email,'Horizonte!local-7264');
 await assert.rejects(b.servico.concluirSegundoFator(l.valor,'abcdef'));
 assert.equal(b.sqlite.prepare('SELECT falhas_login FROM usuario').get()!.falhas_login,3);
 await b.servico.concluirSegundoFator(l.valor,await codigoTotp(segredo));
 assert.equal(b.sqlite.prepare('SELECT falhas_login FROM usuario').get()!.falhas_login,0);
 assert.equal(b.sqlite.prepare("SELECT count(*) n FROM limite_tentativa WHERE chave='2fa:conta:admin'").get()!.n,0);
 }finally{b.sqlite.close();}
});
test('correção 3: piso de 800 ms com relógio e espera injetáveis',async()=>{
 const {tempoMinimo}=await import('../../src/lib/login/http.ts');
 for(const [decorrido,esperado] of [[0,800],[300,500],[800,0],[1200,0]]){
 let espera=0;await tempoMinimo(100,()=>100+decorrido,async ms=>{espera+=ms;});assert.equal(espera,esperado);
 }
});
test('correção 3: POST exige tamanho decimal presente, finito e até 16 KiB',async()=>{
 const {conferirPost}=await import('../../src/lib/login/http.ts');
 for(const valor of [null,'','-1','abc','NaN','1.5','Infinity','16385','999999999999999999999']){
 const headers:Record<string,string>={origin:'http://localhost'};if(valor!==null)headers['content-length']=valor;
 assert.throws(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers})));
 }
 for(const valor of ['0','16384'])assert.doesNotThrow(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers:{origin:'http://localhost','content-length':valor}})));
});
test('correção 3: modo local requer marcador explícito além do host e ausência de cf-ray',async()=>{
 const {modoLocal}=await import('../../src/lib/login/base.ts');
 assert.equal(modoLocal(request),false);assert.equal(modoLocal(request,{AMBIENTE:'producao'}),false);assert.equal(modoLocal(request,{AMBIENTE:'local'}),true);
 assert.equal(modoLocal(new Request('https://externo.invalid'),{AMBIENTE:'local'}),false);
 assert.equal(modoLocal(new Request('http://localhost',{headers:{'cf-ray':'x'}}),{AMBIENTE:'local'}),false);
 assert.equal(emailsLocais(request,{EMAIL_SIMULADO:'1'}),null);
 assert.match(cookieSessao(request,'x'),/^__Host-govnexa=.*Secure/);
});
test('correção 3: cifra TOTP não pode ser transferida entre contas',async()=>{
 const c=await cifrarSegredo('segredo',chave,'conta-a');
 assert.equal(await decifrarSegredo(c,chave,'conta-a'),'segredo');await assert.rejects(decifrarSegredo(c,chave,'conta-b'));
});
test('correção 3: links usam origem pública e e-mail sai com waitUntil, com fallback síncrono',async()=>{
 const b=await preparar();try{
 let liberar!:()=>void,terminou=false;
 const enviados:any[]=[],tarefas:Promise<unknown>[]=[];
 const env={...b.env,AMBIENTE:'producao',EMAIL_SIMULADO:'0',ORIGEM_PUBLICA:'https://publico.exemplo.invalid',EMAIL:{async send(m:any){enviados.push(m);await new Promise<void>(r=>{liberar=r;});terminou=true;}}};
 const svc=servicoLogin(env,new Request('https://host-nao-confiavel.invalid/entrar/'),p=>tarefas.push(p));
 assert.equal(await svc.pedirRedefinicao(b.u.email),RESPOSTA_ESQUECI);assert.equal(terminou,false);assert.equal(tarefas.length,1);
 assert.match(enviados[0].text,/https:\/\/publico.exemplo.invalid\/entrar\/definir-senha/);assert.doesNotMatch(enviados[0].text,/host-nao-confiavel/);
 liberar();await tarefas[0];assert.equal(terminou,true);
 for(const origem of ['', 'http://publico.exemplo.invalid','invalida','https://usuario:senha@publico.exemplo.invalid']){
 await servicoLogin({...env,ORIGEM_PUBLICA:origem},request).pedirRedefinicao(b.u.email);
 b.sqlite.exec("DELETE FROM limite_tentativa");
 }
 assert.equal(enviados.length,1);
 assert.ok(Number(b.sqlite.prepare("SELECT count(*) n FROM evento_acesso WHERE tipo='origem_publica_invalida'").get()!.n)>=1);
 // Sem waitUntil, a promessa da resposta aguarda o envio.
 const outra=servicoLogin(env,request);let respondeu=false;const pendente=outra.pedirRedefinicao(b.u.email).then(()=>{respondeu=true;});
 for(let i=0;i<30&&enviados.length<2;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(enviados.length,2);assert.equal(respondeu,false);liberar();await pendente;assert.equal(respondeu,true);
 }finally{b.sqlite.close();}
});
test('correção 3: falhas de login escrevem limites por hash também para ausente e bloqueiam progressivamente',async()=>{
 const b=await preparar();try{
 b.sqlite.prepare('UPDATE usuario SET senha_hash=?').run(await hashSenha('Horizonte!local-7264',pepper));
 for(const email of [b.u.email,'ausente@exemplo.invalid']){
 await assert.rejects(b.servico.iniciarLogin(email,'errada'));
 assert.equal(b.sqlite.prepare('SELECT contagem FROM limite_tentativa WHERE chave=?').get('login:email:'+await hash(email))!.contagem,1);
 }
 for(const [acumuladas,minutos] of [[4,15],[9,30],[19,60],[99,1440]]){
 b.sqlite.prepare('UPDATE usuario SET falhas_login=?,bloqueado_ate=NULL').run(acumuladas);
 b.sqlite.prepare("UPDATE limite_tentativa SET contagem=4 WHERE chave=?").run('login:email:'+await hash(b.u.email));
 await assert.rejects(b.servico.iniciarLogin(b.u.email,'errada'));
 const fim=Date.parse(String(b.sqlite.prepare('SELECT bloqueado_ate FROM usuario').get()!.bloqueado_ate));
 assert.ok(Math.abs(fim-Date.now()-minutos*60000)<2000);
 }
 b.sqlite.exec("UPDATE limite_tentativa SET janela_inicio='2000-01-01T00:00:00.000Z' WHERE chave LIKE 'login:dia:%'");
 await assert.rejects(b.servico.iniciarLogin(b.u.email,'errada'));assert.equal(b.sqlite.prepare('SELECT falhas_login FROM usuario').get()!.falhas_login,1);
 }finally{b.sqlite.close();}
});
test('correção 3: desativar invalida convites e redefinições mesmo após reativação',async()=>{
 const b=await preparar();try{
 b.sqlite.exec("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('outra','outra@exemplo.invalid','Equipe de teste','editor',5208707)");
 const convite=await criarToken(b.db,'outra','convite'),reset=await criarToken(b.db,'outra','redefinicao');
 await b.servico.desativarUsuario(b.u,'outra');await b.servico.reativarUsuario(b.u,'outra');
 for(const [token,tipo] of [[convite.token,'convite'],[reset.token,'redefinicao']] as const)assert.equal(await consultarToken(b.db,token,tipo),null);
 }finally{b.sqlite.close();}
});
test('correção 3: limpeza oportunista remove só janelas com mais de 24 horas',async()=>{
 const {contarTentativa}=await import('../../src/lib/login/limites.ts');const b=await preparar();try{
 b.sqlite.exec("INSERT INTO limite_tentativa VALUES('vencido','2000-01-01T00:00:00.000Z',3)");
 for(let i=0;i<100;i++)await contarTentativa(b.db,'atual',200,3600000);
 assert.equal(b.sqlite.prepare("SELECT count(*) n FROM limite_tentativa WHERE chave='vencido'").get()!.n,0);
 assert.equal(b.sqlite.prepare("SELECT contagem FROM limite_tentativa WHERE chave='atual'").get()!.contagem,100);
 }finally{b.sqlite.close();}
});
test('correção 3: mensagens de Usuários aceitam só códigos conhecidos',()=>{
 const pagina=readFileSync('src/pages/plataforma/usuarios/index.astro','utf8'),acao=readFileSync('src/pages/plataforma/usuarios/acao.ts','utf8');
 assert.match(pagina,/get\('erro'\)==='falha'/);assert.match(pagina,/get\('ok'\)==='concluida'/);
 assert.doesNotMatch(pagina,/\{Astro.url.searchParams.get\('erro'\)\}/);assert.match(acao,/\?erro=falha/);assert.match(acao,/conferirPost\(request\)/);
});

test('correção 3: escritas de recusa de login e esqueci são equivalentes com ou sem conta',async()=>{
 const b=await preparar();try{
 const original=b.db.batch.bind(b.db);const escritas:string[]=[];
 b.db.batch=async statements=>{for(const st of statements)escritas.push((st as unknown as {sql:string}).sql.trim().split(/\s+/).slice(0,3).join(' '));return original(statements);};
 async function medir(acao:()=>Promise<unknown>){escritas.length=0;try{await acao();}catch{}return [...escritas];}
 assert.deepEqual(await medir(()=>b.servico.iniciarLogin(b.u.email,'errada')),await medir(()=>b.servico.iniciarLogin('ausente@exemplo.invalid','errada')));
 assert.deepEqual(await medir(()=>b.servico.pedirRedefinicao(b.u.email)),await medir(()=>b.servico.pedirRedefinicao('ausente@exemplo.invalid')));
 }finally{b.sqlite.close();}
});
