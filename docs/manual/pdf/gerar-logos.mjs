// Gera os PNG do logo do GovNexa para o PDF do manual, a partir do SVG oficial do sistema (src/components/LogoGovNexa.astro).
// Cores do tema claro: #002E47 e #F36E22; versão para fundo escuro (capa): branco e #FF9A5C (src/styles/visual.css).
// Uso (na raiz do repositório): node docs/manual/pdf/gerar-logos.mjs
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SAIDA = 'docs/manual/pdf/assets';
await mkdir(SAIDA, { recursive: true });

const astro = await readFile('src/components/LogoGovNexa.astro', 'utf8');
const svgBruto = astro.match(/<svg[\s\S]*?<\/svg>/)?.[0];
if (!svgBruto) throw new Error('SVG do logo não encontrado em LogoGovNexa.astro');

const comCores = (principal, destaque) => svgBruto
  .replaceAll('var(--logo-a)', destaque)
  .replaceAll('var(--logo)', principal);

const versoes = [
  ['logo-govnexa.png', comCores('#002E47', '#F36E22')],
  ['logo-govnexa-claro.png', comCores('#FFFFFF', '#FF9A5C')],
];
for (const [nome, svg] of versoes) {
  // 1960x512 no viewBox; 3x para ficar nítido na impressão.
  await sharp(Buffer.from(svg), { density: 288 }).resize({ width: 3000 }).png().toFile(`${SAIDA}/${nome}`);
  console.log('gerado', `${SAIDA}/${nome}`);
}
await copyFile('public/brand/prefeitura-goiania.png', `${SAIDA}/prefeitura-goiania.png`);
console.log('copiado', `${SAIDA}/prefeitura-goiania.png`);
