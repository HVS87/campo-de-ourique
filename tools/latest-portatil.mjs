// Escreve dist/latest-portatil.yml, como o latest.yml do instalador, mas para a versão portátil de Windows (o electron-builder
// não o faz): a aplicação portátil lê-o para saber se há versão nova e conferir o ficheiro transferido (desktop/atualizacoes.mjs).
//   node tools/latest-portatil.mjs [pasta]   (depois de «electron-builder --win»; pasta: dist; a compilação automática corre-o)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(RAIZ, process.argv[2] || 'dist');
// a versão é a da compilação (o latest.yml do instalador, escrito ao mesmo tempo); sem ele, a do package.json
const latest = path.join(DIST, 'latest.yml');
const versao = (fs.existsSync(latest) && (/^version:\s*(\S+)/m.exec(fs.readFileSync(latest, 'utf8')) || [])[1]) || JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;
const nome = `PS-Lisboa-${versao}-portatil.exe`, ficheiro = path.join(DIST, nome);
if (!fs.existsSync(ficheiro)) { console.error('Não encontrei ' + ficheiro); process.exit(1); }
const sha512 = crypto.createHash('sha512').update(fs.readFileSync(ficheiro)).digest('base64'), size = fs.statSync(ficheiro).size;
fs.writeFileSync(path.join(DIST, 'latest-portatil.yml'), `version: ${versao}\nfiles:\n  - url: ${nome}\n    sha512: ${sha512}\n    size: ${size}\npath: ${nome}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`);
console.log(path.relative(RAIZ, path.join(DIST, 'latest-portatil.yml')) + ': ' + nome + ' (' + (size / 1048576).toFixed(1) + ' MB)');
