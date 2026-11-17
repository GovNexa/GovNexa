import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { usuarioPode, type Perfil } from '../../../lib/usuarios/index.ts';
import { ErroAdmin, servicoLogin, type EnvLogin } from '../../../lib/login/servico.ts';
import { conferirPost, campo } from '../../../lib/login/http.ts';
export const prerender=false;
export const POST:APIRoute=async({request,locals,redirect})=>{
 if(!usuarioPode(locals.usuario,'gerenciar_usuarios'))return new Response('Sem permissão.',{status:403,headers:{'Cache-Control':'private, no-store'}});
 const servico=servicoLogin(env as unknown as EnvLogin,request),a=locals.usuario;
 try{
  conferirPost(request);const f=await request.formData(),id=campo(f,'id'),acao=campo(f,'acao');
  if(acao==='convidar')await servico.convidar(a,{nome:campo(f,'nome'),email:campo(f,'email'),cargo:campo(f,'cargo'),perfil:campo(f,'perfil') as Perfil});
  else {
   if(campo(f,'confirmar')!=='sim')throw new ErroAdmin('dados','Confirme a alteração antes de continuar.');
   if(acao==='reenviar')await servico.reenviarConvite(a,id);
   else if(acao==='perfil')await servico.alterarPerfil(a,id,campo(f,'perfil') as Perfil);
   else if(acao==='desativar')await servico.desativarUsuario(a,id);
   else if(acao==='reativar')await servico.reativarUsuario(a,id);
   else if(acao==='desbloquear')await servico.desbloquearAcesso(a,id);
   else if(acao==='2fa')await servico.redefinirSegundoFator(a,id);
   else throw new ErroAdmin('dados','Ação inválida.');
  }
  return redirect('/plataforma/usuarios/?ok=concluida',303);
 }catch(e){const codigo=e instanceof ErroAdmin?e.codigo:'falha';return redirect('/plataforma/usuarios/?erro='+codigo,303);}
};
