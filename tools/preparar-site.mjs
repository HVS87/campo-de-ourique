// Gera a pasta site/: os ficheiros da apresentação que o Worker do Cloudflare serve (ver servidor-central/GUIA-CLOUDFLARE.md).
// Só leva o que a página precisa, nunca as contas (.contas/) nem as cópias de segurança. O config.js aponta para a API do
// próprio endereço, por isso o site funciona em qualquer endereço sem mais configuração.   node tools/preparar-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SITE = path.join(RAIZ, 'site');
const FORA = /\.(anterior\.js|apagado\.bak)$/;
fs.rmSync(SITE, { recursive: true, force: true }); fs.mkdirSync(SITE);
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'LICENCAS-TERCEIROS.md']) fs.copyFileSync(path.join(RAIZ, f), path.join(SITE, f));
for (const d of ['vendor', 'relatorios', 'assets', 'dados']) fs.cpSync(path.join(RAIZ, d), path.join(SITE, d), { recursive: true, filter: f => !FORA.test(f) });
// quem fez cada registo só a administração vê: não pode sair nos ficheiros públicos
(function limpar(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { limpar(f); continue; } if (e.name !== 'conteudos.js' && path.basename(d) !== 'presets') continue; const t = fs.readFileSync(f, 'utf8'), m = /window\.[A-Z_]+\s*=\s*\{/.exec(t), a = m ? m.index + m[0].length - 1 : -1, b = t.lastIndexOf('}'); if (a < 0 || b < a || !t.includes('"autor"')) continue; let dados; try { dados = JSON.parse(t.slice(a, b + 1)); } catch (err) { continue; } for (const el of dados.elementos || []) for (const x of el.detalhes || []) if (x) delete x.autor; fs.writeFileSync(f, t.slice(0, a) + JSON.stringify(dados, null, 1) + t.slice(b + 1)); } })(path.join(SITE, 'dados'));
const config = fs.readFileSync(path.join(RAIZ, 'config.js'), 'utf8').replace(/url: *'[^']*'/, "url: location.origin + '/api/v1'");
if (!config.includes('location.origin')) throw new Error('config.js: não encontrei o campo «url»');
fs.writeFileSync(path.join(SITE, 'config.js'), config);
let n = 0, maior = 0; (function conta(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) conta(f); else { n++; maior = Math.max(maior, fs.statSync(f).size); } } })(SITE);
if (maior > 25 * 1024 * 1024) throw new Error('Há um ficheiro acima dos 25 MiB que o Cloudflare aceita');
console.log(`site/ pronta: ${n} ficheiros (limite: 20 000), o maior com ${(maior / 1048576).toFixed(1)} MB (limite: 25 MiB)`);
