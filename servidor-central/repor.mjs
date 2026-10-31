// Repõe um servidor central (por exemplo um Worker novo no Cloudflare) a partir de uma cópia local.
//   node servidor-central/repor.mjs --pasta "<cópia>" --url https://…/api/v1 --admin <chave de administração>
//   (--com-chaves repõe também as chaves de acesso e as contas; --ver só mostra o que faria)
// A cópia local é a pasta «copia-central» da aplicação de computador («Ficheiro → Abrir a cópia do servidor central»)
// ou da versão browser (na pasta do projeto). Também serve a pasta de dados do servidor Node.
import fs from 'node:fs';
import path from 'node:path';

const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const pasta = arg('pasta'), url = (arg('url') || '').replace(/\/+$/, ''), admin = arg('admin') || process.env.CHAVE_ADMIN;
const comChaves = process.argv.includes('--com-chaves'), ver = process.argv.includes('--ver');
if (!pasta || !url || !admin) { console.error('uso: node servidor-central/repor.mjs --pasta <cópia> --url <endereço da API> --admin <chave>  [--com-chaves] [--ver]'); process.exit(1); }
const ID = '[a-z0-9][a-z0-9-]{0,60}';
const VALIDA = new RegExp(`^(presets/${ID}/${ID}/(\\d+|atual|revisoes)\\.json|(indice|elementos)/${ID}\\.json|historico/\\d{4}-\\d{2}\\.json|chaves\\.json|contas/contas\\.json|evento/(atual|catalogo)\\.json|definicoes/geral\\.json|categorias/fundidas\\.json|apagados/${ID}\\.json)$`);
const ACESSOS = ['chaves.json', 'contas/contas.json']; // as chaves e as contas (com as palavras-passe de então) só com --com-chaves
const objetos = [];
(function andar(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) andar(f); else { const k = path.relative(pasta, f).split(path.sep).join('/'); if (VALIDA.test(k) && (comChaves || !ACESSOS.includes(k))) objetos.push(k); } } })(path.resolve(pasta));
console.log(`${objetos.length} objetos para repor em ${url}${ver ? ' (só a ver)' : ''}`);
const estado = await fetch(url + '/estado', { headers: { Authorization: 'Bearer ' + admin } }).then(r => r.json()).catch(err => ({ erro: err.message }));
if (!estado.chave || estado.chave.papel !== 'admin') { console.error('A chave não é de administração neste servidor (' + (estado.erro || JSON.stringify(estado.chave)) + ').'); process.exit(1); }
let ok = 0;
for (const k of objetos) {
  if (ver) { console.log('  ' + k); continue; }
  const r = await fetch(url + '/objeto?chave=' + encodeURIComponent(k), { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' }, body: fs.readFileSync(path.join(pasta, ...k.split('/'))) });
  if (r.ok) ok++; else console.error(`  falhou ${k}: ${r.status} ${(await r.json().catch(() => ({}))).erro || ''}`);
}
if (!ver) console.log(`${ok} de ${objetos.length} objetos repostos.`);
process.exit(ok === objetos.length || ver ? 0 : 1);
