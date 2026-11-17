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
 const env={DB_CENTRAL:b.db,SENHA_PEPPER:pepper,TOTP_CHAVE:chave,EMAIL_SIMULADO:'1'};
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
 const cifrado=await cifrarSegredo(segredo,chave);assert.equal(await decifrarSegredo(cifrado,chave),segredo);assert.ok(!cifrado.includes(segredo));await assert.rejects(decifrarSegredo(cifrado.slice(0,-4)+'AAAA',chave));
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
 assert.match(cookieSessao(request,valor),/^govnexa_local=/);assert.doesNotMatch(cookieSessao(request,valor),/Secure/);assert.match(cookieSessao(new Request('https://exemplo.invalid'),valor),/^__Host-govnexa=.*; Secure/);assert.match(cookieSessao(new Request('http://localhost',{headers:{'cf-ray':'teste'}}),valor),/Secure/);
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
 const saiu=await chamar('/sair',c);assert.equal(saiu.headers.get('Location'),'/entrar/?saiu=1');assert.match(saiu.headers.get('Set-Cookie')!,/Max-Age=0/);assert.equal(await obterSessao(b.db,completa),null);
 const outra=await criarSessao(b.db,'admin','completa');b.sqlite.exec('UPDATE usuario SET ativo = 0');assert.equal((await chamar('/plataforma/',`govnexa_local=${outra}`)).status,302);assert.ok(b.sqlite.prepare('SELECT revogada_em FROM sessao WHERE id_hash = ?').get(await hash(outra))!.revogada_em);
 }finally{b.sqlite.close();municipal.sqlite.close();}
});
test('Turnstile e origem: só pula local sem site key; falha fechada em produção e erros sem detalhes',async()=>{
 const {conferirPost,conferirTurnstile,mensagemPublica}=await import('../../src/lib/login/http.ts');
 const b=await preparar(),f=new FormData(),original=globalThis.fetch;
 try{
 assert.throws(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST'})));
 assert.throws(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers:{origin:'https://externo.invalid'}})));
 assert.doesNotThrow(()=>conferirPost(new Request('http://localhost/entrar/',{method:'POST',headers:{origin:'http://localhost'}})));
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
