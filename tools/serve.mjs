// Servidor local simples para a apresentação (sem dependências).
//   node tools/serve.mjs        → http://localhost:8081
// Além de servir os ficheiros, aceita do modo de edição (só a partir desta máquina):
//   POST /guardar               → escreve dados/conteudos.js (guarda o anterior em dados/conteudos.anterior.js)
//   POST /guardar-foto/<nome>   → escreve a imagem em assets/fotos/<nome> e devolve o caminho
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8081;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};
const IMAGENS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];
const LIMITE_CORPO = 40 * 1024 * 1024; // 40 MB

const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
// só a própria página pode gravar: a origem do pedido tem de ser este servidor (outra página aberta no browser não pode)
function origemPropria(req) {
  const origem = req.headers.origin, host = req.headers.host;
  if (!origem) return false;
  try { const u = new URL(origem); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && (u.host === host || u.port === String(PORT)); } catch (err) { return false; }
}
const json = (res, codigo, obj) => { res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
class CorpoGrande extends Error { constructor() { super('Pedido demasiado grande (máximo 40 MB)'); this.codigo = 413; } }
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > LIMITE_CORPO) { partes.length = 0; req.pause(); reject(new CorpoGrande()); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
function ficheiroConteudos(dados) {
  return '// Conteúdos da apresentação, gravados pelo modo de edição em ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '.\n' +
    '// Modelo dos elementos: ver README.md. Para editar, abre a apresentação e carrega no lápis (modo de edição).\n' +
    'window.CONTEUDOS = ' + JSON.stringify(dados, null, 1) + ';\n';
}
function nomeSeguro(nome) {
  const base = path.basename(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return base || 'foto';
}

async function guardar(req, res) {
  const corpo = await lerCorpo(req);
  let dados;
  try { dados = JSON.parse(corpo.toString('utf8')); } catch (err) { return json(res, 400, { erro: 'JSON inválido' }); }
  if (dados && dados.sonda) return json(res, 200, { ok: true, sonda: true }); // o modo de edição pergunta se este servidor grava
  if (!dados || typeof dados !== 'object' || !Array.isArray(dados.elementos)) return json(res, 400, { erro: 'Esperava um objeto com a lista «elementos»' });
  const destino = path.join(ROOT, 'dados', 'conteudos.js');
  if (fs.existsSync(destino)) fs.copyFileSync(destino, path.join(ROOT, 'dados', 'conteudos.anterior.js'));
  const texto = ficheiroConteudos(dados);
  fs.writeFileSync(destino, texto);
  console.log(`guardado dados/conteudos.js (${(texto.length / 1024).toFixed(0)} kB, ${dados.elementos.length} elementos)`);
  json(res, 200, { ok: true, bytes: texto.length, elementos: dados.elementos.length });
}
async function guardarFoto(req, res, nome) {
  const corpo = await lerCorpo(req);
  let seguro = nomeSeguro(nome);
  const ext = path.extname(seguro).toLowerCase();
  if (!IMAGENS.includes(ext)) return json(res, 400, { erro: 'Só imagens: ' + IMAGENS.join(', ') });
  if (!corpo.length) return json(res, 400, { erro: 'Ficheiro vazio' });
  const pasta = path.join(ROOT, 'assets', 'fotos');
  fs.mkdirSync(pasta, { recursive: true });
  const base = seguro.slice(0, -ext.length); // «fachada-1920.jpg» mantém o seu número; só o sufixo acrescentado aqui muda
  let destino = path.join(pasta, seguro), k = 2;
  while (fs.existsSync(destino)) { seguro = base + '-' + (k++) + ext; destino = path.join(pasta, seguro); }
  fs.writeFileSync(destino, corpo);
  console.log(`foto guardada em assets/fotos/${seguro} (${(corpo.length / 1024).toFixed(0)} kB)`);
  json(res, 200, { ok: true, caminho: 'assets/fotos/' + seguro });
}

http.createServer(async (req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (err) { rel = '/'; }
  try {
    if (req.method === 'POST') {
      if (!local(req)) return json(res, 403, { erro: 'Só a partir desta máquina' });
      if (!origemPropria(req)) return json(res, 403, { erro: 'Só a partir da própria apresentação (origem ' + (req.headers.origin || 'desconhecida') + ')' });
      if (rel === '/guardar') return await guardar(req, res);
      if (rel.startsWith('/guardar-foto/')) return await guardarFoto(req, res, rel.slice('/guardar-foto/'.length));
      return json(res, 404, { erro: 'Não encontrado' });
    }
  } catch (err) { console.error(err.message); return json(res, err.codigo || 500, { erro: err.message }); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end('Proibido'); return; }
  fs.stat(file, (errStat, st) => {
    if (errStat || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
    const cabecalhos = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Last-Modified': st.mtime.toUTCString(), 'Content-Length': st.size };
    if (req.method === 'HEAD') { res.writeHead(200, cabecalhos); res.end(); return; } // a página compara a data do ficheiro com a gravação automática
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
      res.writeHead(200, cabecalhos); res.end(data);
    });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`Apresentação disponível em http://localhost:${PORT} (modo de edição grava em dados/conteudos.js)`));
