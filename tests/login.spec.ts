import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {codigoTotp} from '../src/lib/login/totp.ts';
test.describe.configure({mode:'serial'});
async function senha(page:Page,email:string,senha:string,volta=''){await page.goto('/entrar/'+volta);await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(senha);await page.getByRole('button',{name:'Entrar',exact:true}).click();}
async function configurar(page:Page){await expect(page).toHaveURL(/\/entrar\/configurar\//);const segredo=(await page.getByTestId('totp-segredo').textContent())!;await page.getByLabel('Código do aplicativo',{exact:true}).fill(await codigoTotp(segredo));await page.getByRole('button',{name:'Confirmar configuração'}).click();await expect(page.getByRole('heading',{name:'Guarde seus códigos de recuperação'})).toBeVisible();await expect(page.locator('.login-form li')).toHaveCount(10);await page.getByRole('link',{name:'Continuar para a plataforma'}).click();await expect(page).toHaveURL(/\/plataforma\//);return segredo;}
// Avança para um passo ainda não usado sem aguardar o relógio: a janela aceita o próximo passo.
const proximoCodigo=(segredo:string)=>codigoTotp(segredo,Date.now()+30000);
test('convite → senha → 2FA → login → sair → esqueci → nova senha → login',async({page,request})=>{
 test.setTimeout(120000);
 const email=`equipe-login-${Date.now()}@exemplo.invalid`;
 await senha(page,'dev@exemplo.invalid','Horizonte!local-7264','?volta=https://externo');await configurar(page);
 await page.goto('/plataforma/usuarios/?erro=texto-nao-confiavel&ok=texto-nao-confiavel');
 await expect(page.getByText('texto-nao-confiavel')).toHaveCount(0);
 await expect(page.locator('form[action="/sair"]')).toHaveAttribute('method','post');
 await page.goto('/sair');await expect(page.getByRole('heading',{name:'Sair da plataforma'})).toBeVisible();
 await page.goto('/plataforma/usuarios/');await expect(page).toHaveURL(/usuarios/);
 await page.getByText('Cadastrar pessoa',{exact:true}).click();
 const cadastro=page.locator('form').filter({has:page.locator('input[name="acao"][value="convidar"]')});
 await cadastro.getByLabel('Nome',{exact:true}).fill('Equipe fictícia');await cadastro.getByLabel('E-mail',{exact:true}).fill(email);await cadastro.getByLabel('Cargo',{exact:true}).fill('Teste');await cadastro.getByLabel('Perfil',{exact:true}).selectOption('editor');await cadastro.getByRole('button',{name:'Cadastrar e enviar convite'}).click();await expect(page.getByRole('status')).toContainText('Solicitação concluída');
 const emails=await (await request.get('/entrar/_emails-locais')).json();const convite=emails.filter((e:any)=>e.para===email).at(-1);const link=convite.texto.match(/http:\/\/\S+/)[0];
 await page.goto('/sair');await page.getByRole('button',{name:'Sair',exact:true}).click();await page.goto(link);await page.reload();await page.getByLabel('Nova senha',{exact:true}).fill('Montanhas!azuis-7264');await page.getByLabel('Confirme a senha').fill('Montanhas!azuis-7264');await page.getByRole('button',{name:'Definir senha',exact:true}).click();const segredo=await configurar(page);
 await page.goto('/sair');await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL(/saiu=1/);
 await senha(page,email,'Montanhas!azuis-7264');await expect(page).toHaveURL(/\/codigo\//);await page.getByLabel('Código do aplicativo',{exact:true}).fill(await proximoCodigo(segredo));await page.getByRole('button',{name:'Verificar código',exact:true}).click();await expect(page).toHaveURL(/\/plataforma\//);
 await page.goto('/sair');await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('link',{name:'Esqueci minha senha'}).click();await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByRole('button',{name:'Enviar link'}).click();await expect(page.getByRole('status')).toContainText('Se o e-mail estiver cadastrado');
 const redefinicoes=await (await request.get('/entrar/_emails-locais')).json();const redefinicao=redefinicoes.filter((e:any)=>e.assunto==='Redefina sua senha').at(-1);await page.goto(redefinicao.texto.match(/http:\/\/\S+/)[0]);await page.getByLabel('Nova senha',{exact:true}).fill('Caminhos!verdes-9382');await page.getByLabel('Confirme a senha').fill('Caminhos!verdes-9382');await page.getByRole('button',{name:'Definir senha',exact:true}).click();await expect(page).toHaveURL(/senha=alterada/);
 await senha(page,email,'Caminhos!verdes-9382');
 // O primeiro login já usou o passo seguinte. Aguarda somente o próximo passo do relógio necessário.
 await page.waitForTimeout(31000);
 await page.getByLabel('Código do aplicativo',{exact:true}).fill(await proximoCodigo(segredo));await page.getByRole('button',{name:'Verificar código',exact:true}).click();await expect(page).toHaveURL(/\/plataforma\//);
});
test('proteção, volta externa ignorada, temas, axe e largura de 390 px',async({page})=>{
 await page.goto('/plataforma/');await expect(page).toHaveURL(/\/entrar\/\?volta=/);
 await page.goto('/entrar/?volta=https://externo');await expect(page.locator('form')).toHaveAttribute('method','post');
 // A volta não é propagada como destino externo nem incluída no formulário.
 await expect(page.locator('form')).not.toHaveAttribute('action',/externo/);
 for(const tema of ['light','dark']){await page.evaluate(t=>{localStorage.setItem('govnexa-theme',t);document.documentElement.dataset.theme=t;},tema);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);const resultado=await new AxeBuilder({page}).analyze();expect(resultado.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);}
});
