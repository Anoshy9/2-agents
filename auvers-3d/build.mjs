// Assemble index.html : le code de src/main.js et Three.js sont regroupés dans un seul script en ligne,
// pour que la page ne dépende d'aucun téléchargement externe.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/template.html', 'utf8').replace('/*__BUNDLE__*/', () => js);
writeFileSync('index.html', html);
console.log(`index.html : ${(html.length / 1024).toFixed(0)} Ko`);
