import type { BancoD1 } from '../repositorio/d1.ts';
import { usuarioPode, type Usuario, type Perfil } from '../usuarios/index.ts';
import { gravar, hash, iso, depois, modoLocal } from './base.ts';
import { hashSenha, verificarSenha, senhaFalsa, validarSenhaNova } from './senha.ts';
import { criarToken, consultarToken, tokenAleatorio, type TipoToken } from './tokens.ts';
import { criarSessao, obterSessao, revogarSessoes, type Sessao } from './sessao.ts';
import { gerarSegredo, cifrarSegredo, decifrarSegredo, verificarTotp, gerarCodigosRecuperacao, uriTotp, qrSvg } from './totp.ts';
import { contarTentativa } from './limites.ts';
import { enviarEmail, type EnvEmail, type Email } from './email.ts';
import { modeloLink, modeloAviso } from './modelos-email.ts';
export interface EnvLogin extends EnvEmail { DB_CENTRAL:BancoD1; SENHA_PEPPER?:string; TOTP_CHAVE?:string; LOGIN_MODO?:string; ORIGEM_PUBLICA?:string; TURNSTILE_SITE_KEY?:string; TURNSTILE_SECRET?:string; LOGIN_SEM_2FA_EMAILS?:string; LOGIN_SEM_2FA_ATE?:string; }
// TEMPORÁRIO (ordem do dono, 22/11/2026): contas listadas entram só com e-mail e senha, até a data limite. Falha fechada: sem data válida,
// vencida ou a mais de 7 dias, ninguém é dispensado; administrador nunca é dispensado. Os valores ficam só nos segredos do Worker.
export function semSegundoFator(env:Pick<EnvLogin,'LOGIN_SEM_2FA_EMAILS'|'LOGIN_SEM_2FA_ATE'>,u:{email:string;perfil:string},agora=Date.now()) {
  // Formato exigido: AAAA-MM-DDTHH:MM:SS (frações aceitas) com fuso (Z ou -03:00); qualquer outro vale como desligado.
  const texto=(env.LOGIN_SEM_2FA_ATE??'').trim();
  const ate=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(texto)?Date.parse(texto):NaN;
  if(!Number.isFinite(ate)||ate<=agora||ate>agora+7*86400000||u.perfil==='admin')return false;
  return (env.LOGIN_SEM_2FA_EMAILS??'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean).includes(u.email.toLowerCase());
}
export interface UsuarioLogin extends Usuario {senha_hash:string|null;totp_ativo:number;totp_segredo_cifrado:string|null;totp_ultimo_passo:number|null;bloqueado_ate:string|null;falhas_login:number;}
export class ErroAdmin extends Error {
 readonly codigo:string;
 constructor(codigo:string,mensagem:string){super(mensagem);this.codigo=codigo;}
}
export const ERRO_LOGIN='E-mail ou senha incorretos.';
export const RESPOSTA_ESQUECI='Se o e-mail estiver cadastrado, enviaremos um link em instantes.';
const ERRO_CODIGO='Código inválido ou expirado. Aguarde e tente novamente.';
export function servicoLogin(env:EnvLogin, request:Request, waitUntil?: (tarefa:Promise<unknown>)=>void) {
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
 async function despacharEmail(email:Email, usuarioId:string, falha='envio_email_falhou',admin=false) {
  const envio=enviarEmail(env,email,request).catch(async()=>{await evento(falha,usuarioId);if(admin)throw new ErroAdmin('email_falhou','Falha no envio de e-mail.');});
  if(waitUntil&&!admin)waitUntil(envio);else await envio;
 }
 async function link(u:UsuarioLogin,tipo:TipoToken,autor:string|null=null) {
  let origem:URL;
  try {
   origem=new URL(modoLocal(request,env)?request.url:(env.ORIGEM_PUBLICA??''));
   if(!modoLocal(request,env)&&(origem.protocol!=='https:'||origem.username||origem.password||origem.pathname!=='/'||origem.search||origem.hash))throw new Error();
  }catch{await evento('origem_publica_invalida',u.id);throw new ErroAdmin('email_falhou','Envio de e-mail indisponível.');}
  const t=await criarToken(db,u.id,tipo,autor);
  const url=new URL('/entrar/definir-senha/',origem);url.searchParams.set('token',t.token);url.searchParams.set('tipo',tipo);
  await despacharEmail({para:u.email,...modeloLink(tipo,url.href,t.expira,u.nome)},u.id,'envio_email_falhou',autor!==null);
  await evento(tipo,u.id);
 }
 async function sessao(valor:string,etapa?:string) {const s=await obterSessao(db,valor);if(!s || (etapa && s.etapa!==etapa))return null;const u=await usuario(s.usuario_id);if(!u?.ativo){if(u)await revogarSessoes(db,u.id);return null;}return {s,u};}
 async function tentativa(valor:string,etapa:string) {
  const par=await sessao(valor,etapa);if(!par)throw new Error(ERRO_CODIGO);
  if(par.u.bloqueado_ate&&par.u.bloqueado_ate>iso())throw new Error(ERRO_CODIGO);
  const r=await gravar(db,'UPDATE sessao SET tentativas_codigo = tentativas_codigo + 1 WHERE id_hash = ? AND revogada_em IS NULL AND tentativas_codigo < 5',par.s.id_hash);
  if(r.meta?.changes!==1)throw new Error(ERRO_CODIGO);
  return par;
 }
 async function falhaCodigo(u:UsuarioLogin):Promise<never> {
  const ok=await contarTentativa(db,'2fa:conta:'+u.id,9,3600000);
  if(!ok) {
   await db.batch([
    stmt('UPDATE usuario SET bloqueado_ate = ? WHERE id = ?',depois(3600000),u.id),
    stmt("UPDATE sessao SET revogada_em = ? WHERE usuario_id = ? AND etapa IN ('segundo_fator','configurar_2fa') AND revogada_em IS NULL",iso(),u.id)
   ]);
   await evento('2fa_conta_bloqueada',u.id);
  }
  await evento('codigo_recusado',u.id);throw new Error(ERRO_CODIGO);
 }
 async function limparFalhas(u:UsuarioLogin) {
  await db.batch([stmt('UPDATE usuario SET falhas_login = 0, bloqueado_ate = NULL WHERE id = ?',u.id),
   stmt('DELETE FROM limite_tentativa WHERE chave IN (?,?,?,?)','esqueci:email:'+await hash(u.email),'2fa:conta:'+u.id,'login:email:'+await hash(u.email),'login:dia:'+await hash(u.email))]);
 }
 async function concluir(s:Sessao,u:UsuarioLogin,passo:number|null,recuperacao?:string) {
  const agora=iso(), novo=tokenAleatorio();
  const cond=recuperacao ? 'EXISTS (SELECT 1 FROM codigo_recuperacao WHERE id_hash = ? AND usuario_id = usuario.id AND usado_em IS NULL)' : '(totp_ultimo_passo IS NULL OR totp_ultimo_passo < ?)';
  const prova=recuperacao ?? passo;
  const r=await db.batch([
   stmt(`UPDATE usuario SET totp_ultimo_passo = CASE WHEN ? IS NULL THEN totp_ultimo_passo ELSE ? END WHERE id = ? AND ativo = 1 AND totp_ativo = 1 AND (bloqueado_ate IS NULL OR bloqueado_ate <= ?) AND ${cond} AND EXISTS (SELECT 1 FROM sessao WHERE id_hash = ? AND revogada_em IS NULL AND expira_em > ?)`,passo,passo,u.id,agora,prova,s.id_hash,agora),
   stmt('UPDATE sessao SET revogada_em = ? WHERE id_hash = ? AND changes() = 1',agora,s.id_hash),
   stmt('INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,\'completa\',?,?,? WHERE changes() = 1',await hash(novo),u.id,agora,depois(43200000),agora),
   ...(recuperacao?[stmt('UPDATE codigo_recuperacao SET usado_em = ? WHERE id_hash = ? AND changes() = 1',agora,recuperacao)]:[])
  ]);
  if(r[0].meta?.changes!==1)throw new Error(ERRO_CODIGO);
  await limparFalhas(u);
  await evento(recuperacao?'recuperacao_usada':'segundo_fator',u.id);return novo;
 }
 return {
  async convidar(a:Usuario,d:{nome:string;email:string;cargo:string;perfil:Perfil}) {
   await administrador(a);const email=normalEmail(d.email),nome=d.nome.trim();
   if(!/^[\x21-\x7e]+$/.test(email)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254||!nome||nome.length>120||d.cargo.length>120||!['admin','gestor','editor','leitura'].includes(d.perfil))throw new ErroAdmin('dados','Confira nome, e-mail, cargo e perfil.');
   if(await stmt('SELECT id FROM usuario WHERE email = ?',email).first())throw new ErroAdmin('email_existente','Não foi possível cadastrar este e-mail.');
   const id=crypto.randomUUID();await gravar(db,'INSERT INTO usuario(id,email,nome,cargo,perfil,prefeitura_id) VALUES(?,?,?,?,?,?)',id,email,nome,d.cargo.trim(),d.perfil,a.prefeitura_id);
   await link((await usuario(id))!,'convite',a.id);return id;
  },
  async reenviarConvite(a:Usuario,id:string) {const u=await alvo(a,id);if(!u.ativo||u.senha_hash)throw new ErroAdmin('dados','Esta pessoa já definiu a senha ou está desativada.');await link(u,'convite',a.id);},
  async definirSenhaComToken(token:string,tipo:TipoToken,senha:string) {
   const t=await consultarToken(db,token,tipo);const u=t?await usuario(t.usuario_id):null;
   if(!u?.ativo || !t || (tipo==='convite' && u.senha_hash))throw new Error('Link inválido ou expirado. Peça um novo link.');
   const erro=validarSenhaNova(senha,u);if(erro)throw new Error(erro);
   const senhaHash=await hashSenha(senha,env.SENHA_PEPPER??''), agora=iso(), novo=tokenAleatorio();
   const r=await db.batch([
    stmt('UPDATE token_email SET usado_em = ? WHERE id_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > ? AND EXISTS (SELECT 1 FROM usuario WHERE id = token_email.usuario_id AND ativo = 1)',agora,t.id_hash,tipo,agora),
    stmt('UPDATE usuario SET senha_hash = ?, senha_definida_em = ? WHERE id = ? AND changes() = 1',senhaHash,agora,u.id),
    stmt('UPDATE sessao SET revogada_em = ? WHERE usuario_id = ? AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)',agora,u.id,u.id,senhaHash),
    stmt('UPDATE token_email SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)',agora,u.id,u.id,senhaHash),
    ...(tipo==='convite'?[stmt("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,'configurar_2fa',?,?,? WHERE EXISTS (SELECT 1 FROM usuario WHERE id = ? AND senha_hash = ?)",await hash(novo),u.id,agora,depois(600000),agora,u.id,senhaHash)]:[])
   ]);
   if(r[0].meta?.changes!==1)throw new Error('Link inválido ou expirado. Peça um novo link.');
   await evento('senha_definida',u.id);
   if(tipo==='redefinicao')await despacharEmail({para:u.email,...modeloAviso('senha')},u.id,'aviso_email_falhou');
   return tipo==='convite'?novo:null;
  },
  async iniciarLogin(email:string,senha:string) {
   email=normalEmail(email);const u=await stmt('SELECT * FROM usuario WHERE email = ?',email).first<UsuarioLogin>();
   const ipOk=await contarTentativa(db,'login:ip:'+await hash(ip),20,900000);
   let confere=false;
   if(u?.ativo&&u.senha_hash)confere=await verificarSenha(senha,u.senha_hash,env.SENHA_PEPPER??'');else await senhaFalsa(senha,env.SENHA_PEPPER??'');
   if(u?.bloqueado_ate&&u.bloqueado_ate>iso()){await evento('login_recusado',u.id);throw new Error(ERRO_LOGIN);}
   if(!ipOk || !u?.ativo || !confere || (u.bloqueado_ate && u.bloqueado_ate>iso())) {
    const chaveEmail=await hash(email);
    const ok=await contarTentativa(db,'login:email:'+chaveEmail,4,900000);
    const dia=await stmt('SELECT janela_inicio FROM limite_tentativa WHERE chave = ?','login:dia:'+chaveEmail).first<{janela_inicio:string}>();
    const acumuladas=dia&&Date.parse(dia.janela_inicio)>Date.now()-86400000?(u?.falhas_login??0):0;
    await contarTentativa(db,'login:dia:'+chaveEmail,Number.MAX_SAFE_INTEGER,86400000);
    const falhas=acumuladas+Number(!confere);
    const duracao=Math.min(3600000,900000*2**Math.min(2,Math.floor(falhas/10)));
    await gravar(db,'UPDATE usuario SET falhas_login = ?, bloqueado_ate = CASE WHEN ? = 1 THEN bloqueado_ate ELSE max(coalesce(bloqueado_ate,\'\'),?) END WHERE id = ? AND (bloqueado_ate IS NULL OR bloqueado_ate <= ?)',falhas,Number(ok||confere),depois(duracao),u?.id??'',iso());
    await evento('login_recusado',u?.id??null);throw new Error(ERRO_LOGIN);
   }
   if(semSegundoFator(env,u)){const valor=await criarSessao(db,u.id,'completa',request.headers.get('user-agent')??'');await limparFalhas(u);await evento('login_sem_2fa',u.id);return {valor,etapa:'completa' as const};}
   const etapa=u.totp_ativo?'segundo_fator':'configurar_2fa';const valor=await criarSessao(db,u.id,etapa,request.headers.get('user-agent')??'');await evento('senha_verificada',u.id);return {valor,etapa};
  },
  async concluirSegundoFator(valor:string,codigo:string) {const {s,u}=await tentativa(valor,'segundo_fator');if(!u.totp_segredo_cifrado)throw new Error(ERRO_CODIGO);const passo=await verificarTotp(await decifrarSegredo(u.totp_segredo_cifrado,env.TOTP_CHAVE??'',u.id),codigo,u.totp_ultimo_passo);if(passo===null)return falhaCodigo(u);return concluir(s,u,passo);},
  async usarCodigoRecuperacao(valor:string,codigo:string) {const {s,u}=await tentativa(valor,'segundo_fator');const h=await hash(codigo.trim().toLowerCase());try{return await concluir(s,u,null,h);}catch(e){if(e instanceof Error&&e.message===ERRO_CODIGO)return falhaCodigo(u);throw e;}},
  async configurarTotp(valor:string) {
   const par=await sessao(valor,'configurar_2fa');if(!par||par.u.totp_ativo)throw new Error('Entre novamente para configurar.');
   if(!par.u.totp_segredo_cifrado){const cifrado=await cifrarSegredo(gerarSegredo(),env.TOTP_CHAVE??'',par.u.id);await gravar(db,'UPDATE usuario SET totp_segredo_cifrado = ? WHERE id = ? AND totp_ativo = 0 AND totp_segredo_cifrado IS NULL',cifrado,par.u.id);}
   const u=(await usuario(par.u.id))!, segredo=await decifrarSegredo(u.totp_segredo_cifrado!,env.TOTP_CHAVE??'',u.id);await evento('configuracao_2fa',u.id);return {segredo,svg:qrSvg(uriTotp(u.email,segredo))};
  },
  async confirmarTotp(valor:string,codigo:string) {
   const {s,u}=await tentativa(valor,'configurar_2fa');if(u.totp_ativo||!u.totp_segredo_cifrado)throw new Error(ERRO_CODIGO);
   const passo=await verificarTotp(await decifrarSegredo(u.totp_segredo_cifrado,env.TOTP_CHAVE??'',u.id),codigo,u.totp_ultimo_passo);if(passo===null)return falhaCodigo(u);
   const codigos=gerarCodigosRecuperacao(), agora=iso(),novo=tokenAleatorio();
   const r=await db.batch([
    stmt('UPDATE usuario SET totp_ativo = 1, totp_ultimo_passo = ? WHERE id = ? AND ativo = 1 AND totp_ativo = 0 AND (bloqueado_ate IS NULL OR bloqueado_ate <= ?) AND totp_segredo_cifrado = ? AND EXISTS (SELECT 1 FROM sessao WHERE id_hash = ? AND revogada_em IS NULL AND expira_em > ?)',passo,u.id,agora,u.totp_segredo_cifrado,s.id_hash,agora),
    stmt('UPDATE sessao SET revogada_em = ? WHERE id_hash = ? AND changes() = 1',agora,s.id_hash),
    stmt("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) SELECT ?,?,'completa',?,?,? WHERE changes() = 1",await hash(novo),u.id,agora,depois(43200000),agora),
    ...await Promise.all(codigos.map(async c=>stmt('INSERT INTO codigo_recuperacao(id_hash,usuario_id,criado_em) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM sessao WHERE id_hash = ?)',await hash(c),u.id,agora,await hash(novo))))
   ]);
   if(r[0].meta?.changes!==1)throw new Error(ERRO_CODIGO);await limparFalhas(u);await evento('2fa_ativado',u.id);return {valor:novo,codigos};
  },
  async pedirRedefinicao(email:string) {
   email=normalEmail(email);
   const emailOk=await contarTentativa(db,'esqueci:email:'+await hash(email),3,3600000), ipOk=await contarTentativa(db,'esqueci:ip:'+await hash(ip),10,3600000);
   const u=await stmt('SELECT * FROM usuario WHERE email = ? AND ativo = 1',email).first<UsuarioLogin>();
   if(emailOk&&ipOk) {
    if(u)try{await link(u,'redefinicao');}catch{await evento('envio_email_falhou',u.id);}
    else {
     const agora=iso(),token=await hash(tokenAleatorio());
     await db.batch([
      stmt("UPDATE token_email SET usado_em = ? WHERE usuario_id = ? AND tipo = 'redefinicao' AND usado_em IS NULL",agora,''),
      stmt("INSERT INTO token_email(id_hash,usuario_id,tipo,criado_em,expira_em,criado_por) SELECT ?,id,'redefinicao',?,?,NULL FROM usuario WHERE id = ?",token,agora,depois(3600000),'')
     ]);
     await evento('redefinicao');
    }
   }await evento('redefinicao_pedida',u?.id??null);return RESPOSTA_ESQUECI;
  },
  async sair(valor:string){const s=await obterSessao(db,valor);await gravar(db,'UPDATE sessao SET revogada_em = ? WHERE id_hash = ?',iso(),await hash(valor));await evento('saida',s?.usuario_id??null);},
  async usuarioDaSessao(valor:string){const par=await sessao(valor,'completa');if(!par)return null;const u=par.u;return {id:u.id,email:u.email,nome:u.nome,cargo:u.cargo,perfil:u.perfil,prefeitura_id:u.prefeitura_id,ativo:!!u.ativo,criado_em:u.criado_em,atualizado_em:u.atualizado_em} as Usuario;},
  async desativarUsuario(a:Usuario,id:string) {
   const u=await alvo(a,id);if(a.id===id)throw new ErroAdmin('proprio','Você não pode desativar seu próprio acesso.');
   const r=await gravar(db,"UPDATE usuario SET ativo = 0 WHERE id = ? AND prefeitura_id = ? AND (perfil <> 'admin' OR ativo = 0 OR (SELECT count(*) FROM usuario WHERE prefeitura_id = ? AND perfil = 'admin' AND ativo = 1) > 1)",u.id,a.prefeitura_id,a.prefeitura_id);
   if(r.meta?.changes!==1)throw new ErroAdmin('ultimo_admin','Mantenha ao menos um administrador ativo.');await revogarSessoes(db,id);await gravar(db,'UPDATE token_email SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL',iso(),id);await evento('usuario_desativado',id);
  },
  async reativarUsuario(a:Usuario,id:string) {await alvo(a,id);await gravar(db,'UPDATE usuario SET ativo = 1 WHERE id = ? AND prefeitura_id = ?',id,a.prefeitura_id);await evento('usuario_reativado',id);},
  async alterarPerfil(a:Usuario,id:string,perfil:Perfil) {
   await alvo(a,id);if(!['admin','gestor','editor','leitura'].includes(perfil))throw new ErroAdmin('dados','Perfil inválido.');
   const r=await gravar(db,"UPDATE usuario SET perfil = ? WHERE id = ? AND prefeitura_id = ? AND (? = 'admin' OR perfil <> 'admin' OR ativo = 0 OR (SELECT count(*) FROM usuario WHERE prefeitura_id = ? AND perfil = 'admin' AND ativo = 1) > 1)",perfil,id,a.prefeitura_id,perfil,a.prefeitura_id);
   if(r.meta?.changes!==1)throw new ErroAdmin('ultimo_admin','Mantenha ao menos um administrador ativo.');await evento('perfil_alterado',id);
  },
  async redefinirSegundoFator(a:Usuario,id:string) {
   const u=await alvo(a,id);await db.batch([stmt('UPDATE usuario SET totp_ativo = 0, totp_segredo_cifrado = NULL, totp_ultimo_passo = NULL WHERE id = ? AND prefeitura_id = ?',id,a.prefeitura_id),stmt('DELETE FROM codigo_recuperacao WHERE usuario_id = ?',id),stmt('UPDATE sessao SET revogada_em = ? WHERE usuario_id = ?',iso(),id)]);
   await despacharEmail({para:u.email,...modeloAviso('2fa')},u.id,'aviso_email_falhou',true);await evento('2fa_redefinido',id);
  },
  async desbloquearAcesso(a:Usuario,id:string) {const u=await alvo(a,id);await limparFalhas(u);await evento('acesso_desbloqueado',id);},
  async listar(a:Usuario){await administrador(a);return (await stmt(`SELECT id,nome,email,cargo,perfil,ativo,criado_em,totp_ativo,bloqueado_ate,senha_definida_em,
  (SELECT max(criado_em) FROM token_email WHERE usuario_id = usuario.id AND tipo = 'convite') AS convite_em FROM usuario WHERE prefeitura_id = ? ORDER BY ativo DESC,lower(nome),email`,a.prefeitura_id).all()).results as (Usuario & {totp_ativo:number;bloqueado_ate:string|null;senha_definida_em:string|null;convite_em:string|null})[];}
 };
}
