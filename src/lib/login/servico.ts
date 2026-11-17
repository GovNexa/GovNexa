import type { BancoD1 } from '../repositorio/d1.ts';
import { usuarioPode, type Usuario, type Perfil } from '../usuarios/index.ts';
import { gravar, hash, iso, depois } from './base.ts';
import { hashSenha, verificarSenha, senhaFalsa, validarSenhaNova } from './senha.ts';
import { criarToken, consultarToken, tokenAleatorio, type TipoToken } from './tokens.ts';
import { criarSessao, obterSessao, revogarSessoes, type Sessao } from './sessao.ts';
import { gerarSegredo, cifrarSegredo, decifrarSegredo, verificarTotp, gerarCodigosRecuperacao, uriTotp, qrSvg } from './totp.ts';
import { contarTentativa } from './limites.ts';
import { enviarEmail, type EnvEmail } from './email.ts';
import { modeloLink, modeloAviso } from './modelos-email.ts';
export interface EnvLogin extends EnvEmail { DB_CENTRAL:BancoD1; SENHA_PEPPER?:string; TOTP_CHAVE?:string; LOGIN_MODO?:string; TURNSTILE_SITE_KEY?:string; TURNSTILE_SECRET?:string; }
export interface UsuarioLogin extends Usuario {senha_hash:string|null;totp_ativo:number;totp_segredo_cifrado:string|null;totp_ultimo_passo:number|null;bloqueado_ate:string|null;falhas_login:number;}
export const ERRO_LOGIN='E-mail ou senha incorretos.';
export const RESPOSTA_ESQUECI='Se o e-mail estiver cadastrado, enviaremos um link em instantes.';
const ERRO_CODIGO='Código inválido ou expirado. Aguarde e tente novamente.';
export function servicoLogin(env:EnvLogin, request:Request) {
 const db=env.DB_CENTRAL, ip=request.headers.get('CF-Connecting-IP') ?? 'sem-ip';
 const stmt=(sql:string,...v:unknown[])=>db.prepare(sql).bind(...v);
 const evento=async(tipo:string,usuario:string|null=null)=>{await gravar(db,'INSERT INTO evento_acesso(usuario_id,tipo,ip) VALUES(?,?,?)',usuario,tipo,ip);};
 const usuario=(id:string)=>stmt('SELECT * FROM usuario WHERE id = ?',id).first<UsuarioLogin>();
 const normalEmail=(s:string)=>s.trim().toLowerCase();
 async function administrador(a:Usuario) {
  const atual=await usuario(a.id);
  if(!atual || !usuarioPode({...atual,ativo:!!atual.ativo},'gerenciar_usuarios') || atual.prefeitura_id!==a.prefeitura_id)throw new Error('Sem permissão.');
  return atual;
 }
 async function alvo(a:Usuario,id:string) {await administrador(a);const u=await usuario(id);if(!u||u.prefeitura_id!==a.prefeitura_id)throw new Error('Pessoa não encontrada.');return u;}
 async function link(u:UsuarioLogin,tipo:TipoToken,autor:string|null=null) {
  const t=await criarToken(db,u.id,tipo,autor);
  const url=new URL('/entrar/definir-senha/',request.url);url.searchParams.set('token',t.token);url.searchParams.set('tipo',tipo);
  await enviarEmail(env,{para:u.email,...modeloLink(tipo,url.href,t.expira)},request);
  await evento(tipo,u.id);
 }
 async function sessao(valor:string,etapa?:string) {const s=await obterSessao(db,valor);if(!s || (etapa && s.etapa!==etapa))return null;const u=await usuario(s.usuario_id);if(!u?.ativo){if(u)await revogarSessoes(db,u.id);return null;}return {s,u};}
 async function tentativa(valor:string,etapa:string) {
  const par=await sessao(valor,etapa);if(!par)throw new Error(ERRO_CODIGO);
  const r=await gravar(db,'UPDATE sessao SET tentativas_codigo = tentativas_codigo + 1 WHERE id_hash = ? AND revogada_em IS NULL AND tentativas_codigo < 5',par.s.id_hash);
  if(r.meta?.changes!==1)throw new Error(ERRO_CODIGO);
  return par;
 }
 async function concluir(s:Sessao,u:UsuarioLogin,passo:number|null,recuperacao?:string) {
  const agora=iso(), novo=tokenAleatorio();
  const cond=recuperacao ? 'EXISTS (SELECT 1 FROM codigo_recuperacao WHERE id_hash = ? AND usuario_id = usuario.id AND usado_em IS NULL)' : '(totp_ultimo_passo IS NULL OR totp_ultimo_passo < ?)';
  const prova=recuperacao ?? passo;
  const r=await db.batch([
   stmt(`UPDATE usuario SET totp_ultimo_passo = CASE WHEN ? IS NULL THEN totp_ultimo_passo ELSE ? END WHERE id = ? AND ativo = 1 AND totp_ativo = 1 AND ${cond} AND EXISTS (SELECT 1 FROM sessao WHERE id_hash = ? AND revogada_em IS NULL AND expira_em > ?)`,passo,passo,u.id,prova,s.id_hash,agora),
   stmt('UPDATE sessao SET revogada_em = ? WHERE id_hash = ? AND changes() = 1',agora,s.id_hash),
   stmt('INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,\'completa\',?,?,? WHERE changes() = 1',await hash(novo),u.id,agora,depois(43200000),agora),
   ...(recuperacao?[stmt('UPDATE codigo_recuperacao SET usado_em = ? WHERE id_hash = ? AND changes() = 1',agora,recuperacao)]:[])
  ]);
  if(r[0].meta?.changes!==1)throw new Error(ERRO_CODIGO);
  await evento(recuperacao?'recuperacao_usada':'segundo_fator',u.id);return novo;
 }
 return {
  async convidar(a:Usuario,d:{nome:string;email:string;cargo:string;perfil:Perfil}) {
   await administrador(a);const email=normalEmail(d.email),nome=d.nome.trim();
   if(!/^[\x21-\x7e]+$/.test(email)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254||!nome||nome.length>120||d.cargo.length>120||!['admin','gestor','editor','leitura'].includes(d.perfil))throw new Error('Confira nome, e-mail, cargo e perfil.');
   if(await stmt('SELECT id FROM usuario WHERE email = ?',email).first())throw new Error('Não foi possível cadastrar este e-mail.');
   const id=crypto.randomUUID();await gravar(db,'INSERT INTO usuario(id,email,nome,cargo,perfil,prefeitura_id) VALUES(?,?,?,?,?,?)',id,email,nome,d.cargo.trim(),d.perfil,a.prefeitura_id);
   await link((await usuario(id))!,'convite',a.id);return id;
  },
  async reenviarConvite(a:Usuario,id:string) {const u=await alvo(a,id);if(!u.ativo||u.senha_hash)throw new Error('Esta pessoa já definiu a senha ou está desativada.');await link(u,'convite',a.id);},
  async definirSenhaComToken(token:string,tipo:TipoToken,senha:string) {
   const t=await consultarToken(db,token,tipo);const u=t?await usuario(t.usuario_id):null;
   if(!u?.ativo || !t || (tipo==='convite' && u.senha_hash))throw new Error('Link inválido ou expirado. Peça um novo link.');
   const erro=validarSenhaNova(senha,u);if(erro)throw new Error(erro);
   const senhaHash=await hashSenha(senha,env.SENHA_PEPPER??''), agora=iso(), novo=tokenAleatorio();
   const r=await db.batch([
    stmt('UPDATE token_email SET usado_em = ? WHERE id_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > ? AND EXISTS (SELECT 1 FROM usuario WHERE id = token_email.usuario_id AND ativo = 1)',agora,t.id_hash,tipo,agora),
    stmt('UPDATE usuario SET senha_hash = ?, senha_definida_em = ?, falhas_login = 0, bloqueado_ate = NULL WHERE id = ? AND changes() = 1',senhaHash,agora,u.id),
    stmt('UPDATE sessao SET revogada_em = ? WHERE usuario_id = ? AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)',agora,u.id,u.id,senhaHash),
    stmt('UPDATE token_email SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)',agora,u.id,u.id,senhaHash),
    ...(tipo==='convite'?[stmt("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,'configurar_2fa',?,?,? WHERE EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)",await hash(novo),u.id,agora,depois(600000),agora,u.id,senhaHash)]:[])
   ]);
   if(r[0].meta?.changes!==1)throw new Error('Link inválido ou expirado. Peça um novo link.');
   await evento('senha_definida',u.id);
   if(tipo==='redefinicao')try{await enviarEmail(env,{para:u.email,...modeloAviso('senha')},request);}catch{await evento('aviso_email_falhou',u.id);}
   return tipo==='convite'?novo:null;
  },
  async iniciarLogin(email:string,senha:string) {
   email=normalEmail(email);const u=await stmt('SELECT * FROM usuario WHERE email = ?',email).first<UsuarioLogin>();
   const ipOk=await contarTentativa(db,'login:ip:'+await hash(ip),20,900000);
   let confere=false;
   if(u?.ativo&&u.senha_hash)confere=await verificarSenha(senha,u.senha_hash,env.SENHA_PEPPER??'');else await senhaFalsa(senha,env.SENHA_PEPPER??'');
   if(!ipOk || !u?.ativo || !confere || (u.bloqueado_ate && u.bloqueado_ate>iso())) {
    if(u?.ativo && !confere){const ok=await contarTentativa(db,'login:conta:'+u.id,4,900000);await gravar(db,'UPDATE usuario SET falhas_login = falhas_login + 1, bloqueado_ate = CASE WHEN ? = 1 THEN bloqueado_ate ELSE ? END WHERE id = ?',Number(ok),depois(900000),u.id);}
    await evento('login_recusado',u?.id??null);throw new Error(ERRO_LOGIN);
   }
   await db.batch([stmt('UPDATE usuario SET falhas_login = 0, bloqueado_ate = NULL WHERE id = ?',u.id),stmt('DELETE FROM limite_tentativa WHERE chave = ?','login:conta:'+u.id)]);
   const etapa=u.totp_ativo?'segundo_fator':'configurar_2fa';const valor=await criarSessao(db,u.id,etapa,request.headers.get('user-agent')??'');await evento('senha_verificada',u.id);return {valor,etapa};
  },
  async concluirSegundoFator(valor:string,codigo:string) {const {s,u}=await tentativa(valor,'segundo_fator');if(!u.totp_segredo_cifrado)throw new Error(ERRO_CODIGO);const passo=await verificarTotp(await decifrarSegredo(u.totp_segredo_cifrado,env.TOTP_CHAVE??''),codigo,u.totp_ultimo_passo);if(passo===null){await evento('codigo_recusado',u.id);throw new Error(ERRO_CODIGO);}return concluir(s,u,passo);},
  async usarCodigoRecuperacao(valor:string,codigo:string) {const {s,u}=await tentativa(valor,'segundo_fator');const h=await hash(codigo.trim().toLowerCase());return concluir(s,u,null,h);},
  async configurarTotp(valor:string) {
   const par=await sessao(valor,'configurar_2fa');if(!par||par.u.totp_ativo)throw new Error('Entre novamente para configurar.');
   if(!par.u.totp_segredo_cifrado){const cifrado=await cifrarSegredo(gerarSegredo(),env.TOTP_CHAVE??'');await gravar(db,'UPDATE usuario SET totp_segredo_cifrado = ? WHERE id = ? AND totp_ativo = 0 AND totp_segredo_cifrado IS NULL',cifrado,par.u.id);}
   const u=(await usuario(par.u.id))!, segredo=await decifrarSegredo(u.totp_segredo_cifrado!,env.TOTP_CHAVE??'');await evento('configuracao_2fa',u.id);return {segredo,svg:qrSvg(uriTotp(u.email,segredo))};
  },
  async confirmarTotp(valor:string,codigo:string) {
   const {s,u}=await tentativa(valor,'configurar_2fa');if(u.totp_ativo||!u.totp_segredo_cifrado)throw new Error(ERRO_CODIGO);
   const passo=await verificarTotp(await decifrarSegredo(u.totp_segredo_cifrado,env.TOTP_CHAVE??''),codigo,u.totp_ultimo_passo);if(passo===null)throw new Error(ERRO_CODIGO);
   const codigos=gerarCodigosRecuperacao(), agora=iso(),novo=tokenAleatorio();
   const r=await db.batch([
    stmt('UPDATE usuario SET totp_ativo = 1, totp_ultimo_passo = ? WHERE id = ? AND ativo = 1 AND totp_ativo = 0 AND totp_segredo_cifrado = ? AND EXISTS (SELECT 1 FROM sessao WHERE id_hash = ? AND revogada_em IS NULL AND expira_em > ?)',passo,u.id,u.totp_segredo_cifrado,s.id_hash,agora),
    stmt('UPDATE sessao SET revogada_em = ? WHERE id_hash = ? AND changes() = 1',agora,s.id_hash),
    stmt("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,'completa',?,?,? WHERE changes() = 1",await hash(novo),u.id,agora,depois(43200000),agora),
    ...await Promise.all(codigos.map(async c=>stmt('INSERT INTO codigo_recuperacao(id_hash,usuario_id,criado_em) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM sessao WHERE id_hash = ?)',await hash(c),u.id,agora,await hash(novo))))
   ]);
   if(r[0].meta?.changes!==1)throw new Error(ERRO_CODIGO);await evento('2fa_ativado',u.id);return {valor:novo,codigos};
  },
  async pedirRedefinicao(email:string) {
   email=normalEmail(email);
   const emailOk=await contarTentativa(db,'esqueci:email:'+await hash(email),3,3600000), ipOk=await contarTentativa(db,'esqueci:ip:'+await hash(ip),10,3600000);
   const u=await stmt('SELECT * FROM usuario WHERE email = ? AND ativo = 1',email).first<UsuarioLogin>();
   if(emailOk&&ipOk&&u)try{await link(u,'redefinicao');}catch{await evento('envio_email_falhou',u.id);}await evento('redefinicao_pedida',u?.id??null);return RESPOSTA_ESQUECI;
  },
  async sair(valor:string){const s=await obterSessao(db,valor);await gravar(db,'UPDATE sessao SET revogada_em = ? WHERE id_hash = ?',iso(),await hash(valor));await evento('saida',s?.usuario_id??null);},
  async usuarioDaSessao(valor:string){const par=await sessao(valor,'completa');if(!par)return null;const u=par.u;return {id:u.id,email:u.email,nome:u.nome,cargo:u.cargo,perfil:u.perfil,prefeitura_id:u.prefeitura_id,ativo:!!u.ativo,criado_em:u.criado_em,atualizado_em:u.atualizado_em} as Usuario;},
  async desativarUsuario(a:Usuario,id:string) {
   const u=await alvo(a,id);if(a.id===id)throw new Error('Você não pode desativar seu próprio acesso.');
   const r=await gravar(db,"UPDATE usuario SET ativo = 0 WHERE id = ? AND prefeitura_id = ? AND (perfil <> 'admin' OR ativo = 0 OR (SELECT count(*) FROM usuario WHERE prefeitura_id = ? AND perfil = 'admin' AND ativo = 1) > 1)",u.id,a.prefeitura_id,a.prefeitura_id);
   if(r.meta?.changes!==1)throw new Error('Mantenha ao menos um administrador ativo.');await revogarSessoes(db,id);await evento('usuario_desativado',id);
  },
  async reativarUsuario(a:Usuario,id:string) {await alvo(a,id);await gravar(db,'UPDATE usuario SET ativo = 1 WHERE id = ? AND prefeitura_id = ?',id,a.prefeitura_id);await evento('usuario_reativado',id);},
  async alterarPerfil(a:Usuario,id:string,perfil:Perfil) {
   await alvo(a,id);if(!['admin','gestor','editor','leitura'].includes(perfil))throw new Error('Perfil inválido.');
   const r=await gravar(db,"UPDATE usuario SET perfil = ? WHERE id = ? AND prefeitura_id = ? AND (? = 'admin' OR perfil <> 'admin' OR ativo = 0 OR (SELECT count(*) FROM usuario WHERE prefeitura_id = ? AND perfil = 'admin' AND ativo = 1) > 1)",perfil,id,a.prefeitura_id,perfil,a.prefeitura_id);
   if(r.meta?.changes!==1)throw new Error('Mantenha ao menos um administrador ativo.');await evento('perfil_alterado',id);
  },
  async redefinirSegundoFator(a:Usuario,id:string) {
   const u=await alvo(a,id);await db.batch([stmt('UPDATE usuario SET totp_ativo = 0, totp_segredo_cifrado = NULL, totp_ultimo_passo = NULL WHERE id = ? AND prefeitura_id = ?',id,a.prefeitura_id),stmt('DELETE FROM codigo_recuperacao WHERE usuario_id = ?',id),stmt('UPDATE sessao SET revogada_em = ? WHERE usuario_id = ?',iso(),id)]);
   try{await enviarEmail(env,{para:u.email,...modeloAviso('2fa')},request);}catch{await evento('aviso_email_falhou',u.id);}await evento('2fa_redefinido',id);
  },
  async listar(a:Usuario){await administrador(a);return (await stmt(`SELECT id,nome,email,cargo,perfil,ativo,criado_em,totp_ativo,senha_definida_em,
  (SELECT max(criado_em) FROM token_email WHERE usuario_id = usuario.id AND tipo = 'convite') AS convite_em FROM usuario WHERE prefeitura_id = ? ORDER BY ativo DESC,lower(nome),email`,a.prefeitura_id).all()).results as (Usuario & {totp_ativo:number;senha_definida_em:string|null;convite_em:string|null})[];}
 };
}
