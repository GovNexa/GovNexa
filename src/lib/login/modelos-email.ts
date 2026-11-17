import { dataHoraBr } from '../datas.ts';
const escapar=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const rodape='GovNexa · Inteligência para a gestão pública\nEste é um e-mail automático; não responda.\ncontato@govnexa.com.br';
const p=(s:string)=>`<p style="margin:0 0 20px;">${escapar(s)}</p>`;
function cartao(titulo:string,previa:string,conteudo:string) {
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(titulo)}</title></head><body style="margin:0;background-color:#EEF2F4;color:#1E3438;font-family:Poppins, Arial, Helvetica, sans-serif;">
<div style="display:none!important;visibility:hidden;opacity:0;max-height:0;height:0;overflow:hidden;mso-hide:all;">${escapar(previa)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#EEF2F4;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #D5DDE0;border-radius:12px;overflow:hidden;">
<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${['#F2C200','#F36E22','#1F6B3A','#002E47'].map(c=>`<td width="25%" height="4" style="width:25%;height:4px;font-size:0;line-height:4px;background-color:${c};">&nbsp;</td>`).join('')}</tr></table></td></tr>
<tr><td style="padding:28px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="48" height="48" align="center" style="width:48px;height:48px;background-color:#002E47;border:2px solid #F36E22;color:#FFFFFF;font-size:30px;font-weight:bold;">G</td><td style="padding-left:12px;"><div style="color:#002E47;font-size:24px;font-weight:bold;">GovNexa</div><div style="color:#536664;font-size:12px;line-height:18px;">Inteligência para a gestão pública</div></td></tr></table></td></tr>
<tr><td style="padding:0 24px 28px;font-size:16px;line-height:26px;"><h1 style="margin:0 0 20px;color:#002E47;font-size:25px;line-height:34px;">${escapar(titulo)}</h1>${conteudo}</td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #D5DDE0;color:#536664;font-size:12px;line-height:20px;">${rodape.split('\n').map(escapar).join('<br>')}</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}
export function modeloLink(tipo:'convite'|'redefinicao',link:string,expira:string,nome?:string) {
 const convite=tipo==='convite',assunto=convite?'Defina sua senha':'Redefina sua senha';
 const titulo=convite?'Bem-vindo ao GovNexa':'Redefinir sua senha';
 const previa=convite?'Seu acesso ao GovNexa foi criado. Defina sua senha para começar.':'Recebemos uma solicitação para redefinir sua senha do GovNexa.';
 const saudacao=convite&&nome?.trim()?`Olá, ${nome.trim()}!`:'Olá!';
 const explicacao=convite?'Um administrador criou seu acesso ao GovNexa. Defina sua senha para começar.':'Recebemos uma solicitação para redefinir sua senha. Use o botão abaixo para criar uma nova senha.';
 const botao=convite?'Definir minha senha':'Criar nova senha';
 const validade=`Este link vale até ${dataHoraBr(expira)} (horário de Brasília) e só pode ser usado uma vez.`;
 const aviso=convite?'No primeiro acesso, será pedida a verificação em 2 etapas com um aplicativo autenticador no celular.':'Se você não pediu, ignore este e-mail; sua senha continua a mesma.';
 const alternativa='Se o botão não funcionar, copie e cole este link no navegador:';
 return {assunto,texto:`${titulo}\n\n${saudacao}\n${explicacao}\n\n${botao}:\n${link}\n\n${validade}\n${aviso}\n\n${alternativa}\n${link}\n\n${rodape}`,
 html:cartao(titulo,previa,p(saudacao)+p(explicacao)+`<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;"><tr><td align="center" bgcolor="#F36E22" style="background-color:#F36E22;border-radius:6px;mso-padding-alt:14px 24px;"><a href="${escapar(link)}" style="display:inline-block;padding:14px 24px;color:#002E47;font-size:16px;font-weight:bold;text-decoration:none;">${botao}</a></td></tr></table>`+p(validade)+p(aviso)+`<p style="margin:0;color:#536664;font-size:13px;line-height:21px;">${alternativa}<br><a href="${escapar(link)}" style="color:#002E47;word-break:break-all;overflow-wrap:anywhere;">${escapar(link)}</a></p>`)};
}
export function modeloAviso(tipo:'senha'|'2fa',momento:string=new Date().toISOString()) {
 const assunto=tipo==='senha'?'Sua senha foi alterada':'Verificação em 2 etapas redefinida';
 const ocorrido=`Data e hora do ocorrido: ${dataHoraBr(momento)} (horário de Brasília).`;
 const alerta='Se não foi você, procure um administrador imediatamente.';
 return {assunto,texto:`${assunto}\n\n${ocorrido}\n${alerta}\n\n${rodape}`,html:cartao(assunto,`${assunto}. ${alerta}`,p(ocorrido)+p(alerta))};
}
