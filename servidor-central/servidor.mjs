// Servidor central em Node (sem dependências): a API de servidor-central/nucleo.mjs com os dados em ficheiros.
// É a mesma API do Worker do Cloudflare (servidor-central/cloudflare/); serve para testar, para correr num servidor
// próprio, ou para abrir uma cópia local (DADOS=<pasta da cópia>). Ver servidor-central/README.md.
//
//   node servidor-central/servidor.mjs                                  → http://127.0.0.1:8090 (API em /api/v1)
//   node servidor-central/servidor.mjs --nova-chave "Nome" contribuidor → cria uma chave (papéis: contribuidor, leitor, admin)
//   node servidor-central/servidor.mjs --chaves                         → lista as chaves (sem as mostrar)
//
// Variáveis: PORTA (8090), HOST (127.0.0.1), DADOS (./dados-central), ORIGENS (separadas por vírgulas; * = todas),
// LEITURA_PUBLICA (1 = consultar sem chave), NOME, CHAVE_ADMIN (chave de administração de arranque), SEGREDO_SESSOES
// (opcional: assina as sessões das contas; sem ele é gerado na primeira vez e fica em <DADOS>/contas/segredo.json).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarAPI, novaChave, resumoDe, PAPEIS, VERSAO_API } from './nucleo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA || process.env.PORT) || 8090;
const HOST = process.env.HOST || '127.0.0.1';
const DADOS = path.resolve(process.env.DADOS || path.join(process.cwd(), 'dados-central'));
const NOME = process.env.NOME || 'Servidor central das freguesias';

// armazém em ficheiros: a chave «presets/a/b/1.json» é o ficheiro <DADOS>/presets/a/b/1.json
const caminho = chave => { const f = path.join(DADOS, ...chave.split('/')); if (!f.startsWith(DADOS + path.sep)) throw new Error('chave inválida'); return f; };
const armazem = {
  async ler(chave) { try { return fs.readFileSync(caminho(chave), 'utf8'); } catch (err) { return null; } },
  async escrever(chave, texto) { const f = caminho(chave); fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, texto); fs.renameSync(tmp, f); }, // escrita atómica
  async apagar(chave) { try { fs.unlinkSync(caminho(chave)); } catch (err) { /* já não existe */ } },
  // ler-mudar-gravar sem esperas pelo meio: dois pedidos ao mesmo tempo não se pisam (o Node corre um de cada vez)
  async atualizar(chave, f) { let t = null; try { t = fs.readFileSync(caminho(chave), 'utf8'); } catch (err) { t = null; } const novo = f(t); if (novo != null && novo !== t) await armazem.escrever(chave, novo); },
  async listar(prefixo) {
    const out = [], base = prefixo ? caminho(prefixo.replace(/\/$/, '')) : DADOS;
    (function andar(dir) { let l = []; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { return; }
      for (const e of l) { const f = path.join(dir, e.name); if (e.isDirectory()) andar(f); else if (e.name.endsWith('.json')) { const st = fs.statSync(f); out.push({ chave: path.relative(DADOS, f).split(path.sep).join('/'), tamanho: st.size, data: st.mtime.toISOString() }); } } })(base);
    return out;
  },
};
fs.mkdirSync(DADOS, { recursive: true });

if (process.argv.includes('--nova-chave')) {
  const i = process.argv.indexOf('--nova-chave'), nome = process.argv[i + 1], papel = process.argv[i + 2] || 'contribuidor';
  if (!nome || !PAPEIS[papel]) { console.error('uso: --nova-chave "Nome" contribuidor|leitor|admin'); process.exit(1); }
  const chave = novaChave(), l = JSON.parse((await armazem.ler('chaves.json')) || '[]');
  l.push({ id: Math.random().toString(16).slice(2, 10), nome, papel, resumo: await resumoDe(chave), criada: new Date().toISOString() });
  await armazem.escrever('chaves.json', JSON.stringify(l, null, 1));
  console.log(`Chave para «${nome}» (${papel}): ${chave}\nGuarda-a já: não volta a ser mostrada. Para a retirar: página de consulta (com uma chave de administração) ou apagar a entrada em ${caminho('chaves.json')}.`);
  process.exit(0);
}
if (process.argv.includes('--chaves')) { for (const c of JSON.parse((await armazem.ler('chaves.json')) || '[]')) console.log(`${c.id}  ${c.papel.padEnd(12)} ${c.nome}  (criada ${c.criada.slice(0, 10)})`); process.exit(0); }

const api = criarAPI({ armazem, nome: NOME, origens: (process.env.ORIGENS || '*').split(',').map(s => s.trim()).filter(Boolean), leituraPublica: process.env.LEITURA_PUBLICA === '1', chaveAdmin: process.env.CHAVE_ADMIN || '', segredoSessoes: process.env.SEGREDO_SESSOES || '', pagina: fs.readFileSync(path.join(AQUI, 'consulta.html'), 'utf8') });

// adaptador: pedido do Node → Request da web → Response → resposta do Node
http.createServer(async (req, res) => {
  try {
    const partes = []; for await (const c of req) partes.push(c);
    const corpo = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(partes);
    const cab = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cab.set(k, v);
    const r = await api.tratar(new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers: cab, body: corpo }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
    if (req.method === 'POST' && r.status === 201) console.log(`${new Date().toISOString()} ${req.url}`);
  } catch (err) { console.error(err); if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"erro":"Erro interno"}'); }
}).listen(PORTA, HOST, () => console.log(`${NOME}: http://${HOST}:${PORTA}/ (API em /api/v${VERSAO_API}; dados em ${DADOS})`));
