// Servidor da apresentação (sem dependências), partilhado pela versão browser (tools/serve.mjs) e pela aplicação
// de computador (desktop/main.mjs). Serve os ficheiros e aceita do modo de edição, só a partir desta máquina e da
// própria página:
//   (os pedidos de presets levam ?freguesia=<id>; sem isso é Campo de Ourique, em dados/; as outras em dados/freguesias/<id>/)
//   POST /guardar               → escreve <pasta>/presets/<preset>.js e a cópia ativa <pasta>/conteudos.js (o anterior fica em
//                                 <pasta>/conteudos.anterior.js) e regenera <pasta>/presets/index.js
//   POST /ativar-preset/<id>    → copia esse preset para <pasta>/conteudos.js
//   POST /apagar-preset/<id>    → apaga o preset (fica uma cópia .apagado.bak)
//   POST /guardar-foto/<nome>   → escreve a imagem em assets/fotos/<nome> e devolve o caminho
//   POST /copia-central?chave=&versao= → grava um objeto do servidor central na cópia local (<gravável>/copia-central/)
//   GET  /ambiente.json         → { app: true|false, versao, dados, copia, contas } (a página sabe se corre na aplicação de computador)
//
// Gravar (guardar, ativar, apagar, foto) precisa de uma sessão, e cada conta só grava nas suas freguesias. As contas e o
// histórico de quem fez o quê ficam em <gravável>/.contas/, que nunca é servido (ver servidor-central/contas.mjs):
//   GET  /sessao                → { sessao: { utilizador, nome, papel, freguesias } | null }
//   POST /sessao                → { utilizador, chave, lembrar } abre a sessão (num cookie); a chave é derivada da palavra-passe no
//                                 browser; com «lembrar», a sessão dura 30 dias neste dispositivo, sem ele acaba ao fechar
//   POST /sessao/terminar       → fecha a sessão
//   POST /sessao/palavra-passe  → { atual, nova } muda a palavra-passe da própria conta
//   GET  /historico?freguesia=&utilizador=&limite=&meses=  → quem fez o quê (só a administração)
//   GET  /contas                → as contas, sem os verificadores (só a administração)
//   POST /contas/<utilizador>/palavra-passe → { nova } repõe a palavra-passe de outra conta (só a administração)
//
// Duas pastas: «raiz» (a apresentação: index.html, dados/, assets/…) e «gravavel» (onde se escreve). Na versão browser
// são a mesma. Na aplicação de computador a raiz vem dentro do programa (só leitura) e a pasta gravável fica nos dados
// do utilizador; ao servir, um ficheiro da pasta gravável sobrepõe-se ao da raiz com o mesmo caminho.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { criarContas, podeEditar, resumoAlteracoes } from '../servidor-central/contas.mjs';
import CONTAS_INICIAIS from '../servidor-central/contas-iniciais.mjs';

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
const idValido = id => /^[a-z0-9][a-z0-9-]{0,60}$/.test(id);
// objetos do servidor central que a cópia local aceita (os mesmos de servidor-central/nucleo.mjs)
const ID = '[a-z0-9][a-z0-9-]{0,60}';
const CHAVE_COPIA = new RegExp(`^(presets/${ID}/${ID}/(\\d+|atual|revisoes)\\.json|(indice|elementos)/${ID}\\.json|historico/\\d{4}-\\d{2}\\.json|chaves\\.json|contas/contas\\.json)$`);
const agora = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const json = (res, codigo, obj, extra = {}) => { res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); };
// armazém em ficheiros para as contas (a mesma interface do servidor central); atualizar não tem esperas pelo meio, por
// isso dois pedidos ao mesmo tempo não se pisam
function armazemPasta(base) {
  const f = k => path.join(base, ...k.split('/'));
  const ler = k => { try { return fs.readFileSync(f(k), 'utf8'); } catch (err) { return null; } };
  const escrever = (k, t) => { const d = f(k); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d + '.tmp', t); fs.renameSync(d + '.tmp', d); };
  return {
    async ler(k) { return ler(k); },
    async escrever(k, t) { escrever(k, t); },
    async atualizar(k, fn) { escrever(k, fn(ler(k))); },
    async listar(prefixo) { let l = []; try { l = fs.readdirSync(f(prefixo.replace(/\/$/, ''))); } catch (err) { /* ainda não há */ } return l.filter(n => n.endsWith('.json')).map(n => ({ chave: prefixo + n })); },
  };
}
// a sessão vai num cookie só deste servidor (o nome leva a porta: o browser partilha os cookies entre portas do mesmo endereço)
const nomeCookie = req => 'co_sessao_' + req.socket.localPort;
const lerCookie = req => { for (const p of String(req.headers.cookie || '').split(/;\s*/)) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i) === nomeCookie(req)) return p.slice(i + 1); } return ''; };
// sem «lembrar-me», o cookie é de sessão: acaba quando se fecha o browser (ou a aplicação); com ele, dura o que dura o testemunho
const cookie = (req, valor, segundos) => ({ 'Set-Cookie': `${nomeCookie(req)}=${valor}; HttpOnly; SameSite=Strict; Path=/${segundos == null ? '' : '; Max-Age=' + segundos}` });
// os pedidos de leitura com dados reservados (histórico, contas) só da própria página: o browser diz de onde vem o pedido
const mesmaOrigem = req => !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
class CorpoGrande extends Error { constructor() { super('Pedido demasiado grande (máximo 40 MB)'); this.codigo = 413; } }
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > LIMITE_CORPO) { partes.length = 0; req.pause(); reject(new CorpoGrande()); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
// só a própria página pode gravar: a origem do pedido tem de ser este servidor (outra página aberta no browser não pode)
function origemPropria(req) {
  const origem = req.headers.origin, host = req.headers.host;
  if (!origem) return false;
  try { const u = new URL(origem); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && (u.host === host || u.port === String(req.socket.localPort)); } catch (err) { return false; }
}
const paraComentario = t => String(t).replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[{}]/g, '').slice(0, 120); // o título vem do utilizador: numa linha e sem chavetas
function nomeSeguro(nome) {
  const base = path.basename(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return base || 'foto';
}
function dadosDoFicheiro(t) { // o objeto depois de «window.X =» (um título com «{» no comentário não engana)
  const m = /window\.[A-Z_]+\s*=\s*\{/.exec(t), a = m ? m.index + m[0].length - 1 : t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('preset sem dados');
  return JSON.parse(t.slice(a, b + 1));
}

export function criarServidor({ raiz, gravavel = raiz, app = false, versao = '', registo = console.log, contasIniciais = CONTAS_INICIAIS } = {}) {
  raiz = path.resolve(raiz); gravavel = path.resolve(gravavel);
  const sobreposta = gravavel !== raiz;
  const HORAS_SESSAO = 12, HORAS_LEMBRAR = 30 * 24, origemConta = app ? 'aplicacao' : 'browser';
  const contas = criarContas({ armazem: armazemPasta(path.join(gravavel, '.contas')), iniciais: contasIniciais, horas: HORAS_SESSAO, horasLembrar: HORAS_LEMBRAR });
  const duracao = lembrar => lembrar ? HORAS_LEMBRAR * 3600 : null;
  const sessaoDe = async req => { const t = lerCookie(req); return t ? contas.verificar(t) : null; };
  // null se pode gravar nesta freguesia; senão a resposta de recusa
  const recusa = (s, F) => !s ? [401, { erro: 'Inicia sessão para gravar (a sessão pode ter terminado)', sessao: null }]
    : F && !podeEditar(s, F.id) ? [403, { erro: `A conta ${s.utilizador} não pode editar ${F.id}`, sessao: s }] : null;
  const dentro = (base, f) => f === base || f.startsWith(base + path.sep);
  const existe = f => { try { return fs.statSync(f).isFile(); } catch (err) { return false; } };
  // o caminho a ler: a versão gravada pelo utilizador, se existir, senão a original
  const paraLer = rel => { const g = path.join(gravavel, rel); return sobreposta && existe(g) ? g : path.join(raiz, rel); };
  const paraEscrever = rel => { const f = path.join(gravavel, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };

  function freguesiaDe(url) {
    const id = new URL(url, 'http://x').searchParams.get('freguesia') || 'campo-de-ourique';
    if (!idValido(id)) return null;
    const rel = id === 'campo-de-ourique' ? 'dados/' : 'dados/freguesias/' + id + '/';
    if (!existe(path.join(raiz, rel, 'geo.js'))) return null; // só freguesias que existem
    return { id, rel };
  }
  // presets apagados que vêm com a aplicação (não se podem apagar de lá): ficam numa lista na pasta gravável
  const apagadosRel = F => F.rel + 'presets/apagados.json';
  const lerApagados = F => { try { return JSON.parse(fs.readFileSync(path.join(gravavel, apagadosRel(F)), 'utf8')); } catch (err) { return []; } };
  const gravarApagados = (F, l) => fs.writeFileSync(paraEscrever(apagadosRel(F)), JSON.stringify(l));
  function ficheiroConteudos(F, dados) {
    return '// Preset ativo (cópia de ' + F.rel + 'presets/' + dados.preset + '.js), gravado pelo modo de edição em ' + agora() + '. Modelo dos campos: ver README.md.\n' +
      '// Para trocar de preset ou editar, abre a apresentação e carrega no lápis.\n' +
      'window.CONTEUDOS = ' + JSON.stringify(dados, null, 1) + ';\n';
  }
  function ficheiroPreset(dados) {
    return '// Preset «' + paraComentario(dados.titulo || dados.preset) + '», gravado pelo modo de edição em ' + agora() + '. Modelo dos campos: ver README.md.\n' +
      'window.CONTEUDOS_PRESET = ' + JSON.stringify(dados, null, 1) + ';\n';
  }
  const presetRel = (F, id) => F.rel + 'presets/' + id + '.js';
  const lerPreset = (F, id) => dadosDoFicheiro(fs.readFileSync(paraLer(presetRel(F, id)), 'utf8')); // os presets escritos como código (exemplo.js) não se leem aqui
  const caches = new Map(); // última lista conhecida por freguesia (para presets escritos como código)
  function cacheDe(F) {
    if (!caches.has(F.id)) { let c = []; try { c = JSON.parse(fs.readFileSync(paraLer(F.rel + 'presets/index.js'), 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '')); } catch (err) { /* sem índice */ } caches.set(F.id, c); }
    return caches.get(F.id);
  }
  function idsDePresets(F) { // os da raiz e os gravados, sem os apagados
    const ids = new Set();
    for (const base of sobreposta ? [raiz, gravavel] : [raiz]) {
      let fs_ = []; try { fs_ = fs.readdirSync(path.join(base, F.rel, 'presets')); } catch (err) { /* sem pasta */ }
      for (const f of fs_) if (f.endsWith('.js') && f !== 'index.js' && idValido(f.slice(0, -3))) ids.add(f.slice(0, -3));
    }
    const apagados = new Set(lerApagados(F));
    return [...ids].filter(id => !apagados.has(id));
  }
  function listarPresets(F) {
    const antiga = cacheDe(F), lista = [];
    for (const id of idsDePresets(F)) {
      let d = null; try { d = lerPreset(F, id); } catch (err) { /* código em vez de JSON: fica só o id */ }
      lista.push(d ? { id, nome: d.titulo || id, subtitulo: d.subtitulo || '', elementos: (d.elementos || []).length } : (antiga.find(p => p.id === id) || { id, nome: id, subtitulo: '', elementos: 0 }));
    }
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    caches.set(F.id, lista);
    return lista;
  }
  function regenerarIndice(F, extra) {
    const lista = listarPresets(F);
    if (extra) for (const e of extra) { const i = lista.findIndex(p => p.id === e.id); if (i >= 0) lista[i] = e; else lista.push(e); }
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    fs.writeFileSync(paraEscrever(F.rel + 'presets/index.js'), '// Lista dos presets em ' + F.rel + 'presets/ (regenerada pelo servidor local a cada gravação).\nwindow.PRESETS = ' + JSON.stringify(lista, null, 1) + ';\n');
    return lista;
  }
  function copiaAnterior(F) { const atual = paraLer(F.rel + 'conteudos.js'); if (existe(atual)) fs.copyFileSync(atual, paraEscrever(F.rel + 'conteudos.anterior.js')); }

  async function guardar(req, res, F, s) {
    const corpo = await lerCorpo(req);
    let dados;
    try { dados = JSON.parse(corpo.toString('utf8')); } catch (err) { return json(res, 400, { erro: 'JSON inválido' }); }
    if (dados && dados.sonda) return json(res, 200, { ok: true, sonda: true, sessao: s }); // o modo de edição pergunta se este servidor grava
    const nao = recusa(s, F); if (nao) return json(res, ...nao);
    if (!dados || typeof dados !== 'object' || !Array.isArray(dados.elementos)) return json(res, 400, { erro: 'Esperava um objeto com a lista «elementos»' });
    if (dados.freguesia && dados.freguesia !== F.id) return json(res, 409, { erro: 'Este preset é da freguesia «' + dados.freguesia + '», não de «' + F.id + '»' }); // os presets de cada freguesia não se misturam
    dados.freguesia = F.id;
    dados.preset = String(dados.preset || F.id);
    if (!idValido(dados.preset)) return json(res, 400, { erro: 'Id de preset inválido: ' + dados.preset });
    let antes = null; try { antes = lerPreset(F, dados.preset); } catch (err) { /* preset novo (ou escrito como código) */ }
    fs.writeFileSync(paraEscrever(presetRel(F, dados.preset)), ficheiroPreset(dados));
    const apagados = lerApagados(F); if (apagados.includes(dados.preset)) gravarApagados(F, apagados.filter(id => id !== dados.preset));
    copiaAnterior(F);
    const texto = ficheiroConteudos(F, dados);
    fs.writeFileSync(paraEscrever(F.rel + 'conteudos.js'), texto);
    const presets = regenerarIndice(F, [{ id: dados.preset, nome: dados.titulo || dados.preset, subtitulo: dados.subtitulo || '', elementos: dados.elementos.length }]);
    registo(`[${F.id}] ${s.utilizador} guardou o preset «${dados.preset}» (${dados.elementos.length} elementos) e ${F.rel}conteudos.js (${(texto.length / 1024).toFixed(0)} kB)`);
    await contas.registar({ conta: s, acao: 'guardou', freguesia: F.id, preset: dados.preset, resumo: resumoAlteracoes(antes, dados), origem: origemConta });
    json(res, 200, { ok: true, bytes: texto.length, elementos: dados.elementos.length, presets });
  }
  function ativarPreset(res, F, id) { // torna um preset o ativo: copia-o para <pasta>/conteudos.js
    if (!idValido(id)) return json(res, 400, { erro: 'Id inválido' });
    const origem = paraLer(presetRel(F, id));
    if (!existe(origem) || lerApagados(F).includes(id)) return json(res, 404, { erro: 'Preset não encontrado' });
    let dados; try { dados = lerPreset(F, id); } catch (err) { dados = null; }
    copiaAnterior(F);
    const destino = paraEscrever(F.rel + 'conteudos.js');
    if (dados) { dados.preset = id; fs.writeFileSync(destino, ficheiroConteudos(F, dados)); }
    else fs.writeFileSync(destino, fs.readFileSync(origem, 'utf8').replace('window.CONTEUDOS_PRESET', 'window.CONTEUDOS')); // preset escrito como código
    registo(`[${F.id}] preset ativo: «${id}»`);
    json(res, 200, { ok: true, preset: id, presets: regenerarIndice(F) });
  }
  function apagarPreset(res, F, id) {
    if (!idValido(id)) return json(res, 400, { erro: 'Id inválido' });
    const g = path.join(gravavel, presetRel(F, id));
    if (existe(g)) { fs.copyFileSync(g, g.replace(/\.js$/, '.apagado.bak')); fs.unlinkSync(g); }
    if (sobreposta && existe(path.join(raiz, presetRel(F, id)))) { const l = lerApagados(F); if (!l.includes(id)) gravarApagados(F, l.concat(id)); } // vem com a aplicação: só se esconde
    caches.set(F.id, cacheDe(F).filter(p => p.id !== id));
    registo(`[${F.id}] preset apagado: «${id}»`);
    json(res, 200, { ok: true, presets: regenerarIndice(F) });
  }
  // cópia local do servidor central: a página traz cada objeto novo ou mudado e grava-o aqui, com a mesma forma de pastas
  // que o servidor central em Node (DADOS=<esta pasta> node servidor-central/servidor.mjs abre-a)
  async function guardarCopia(req, res, url) {
    const u = new URL(url, 'http://x'), chave = u.searchParams.get('chave') || '', versao = u.searchParams.get('versao') || '';
    if (!CHAVE_COPIA.test(chave)) return json(res, 400, { erro: 'Objeto inválido' });
    const corpo = await lerCorpo(req);
    try { JSON.parse(corpo.toString('utf8')); } catch (err) { return json(res, 400, { erro: 'O objeto não é JSON' }); }
    fs.writeFileSync(paraEscrever('copia-central/' + chave), corpo);
    let v = {}; try { v = JSON.parse(fs.readFileSync(paraLer('copia-central/versoes.json'), 'utf8')); } catch (err) { v = {}; }
    v[chave] = versao; fs.writeFileSync(paraEscrever('copia-central/versoes.json'), JSON.stringify(v));
    json(res, 200, { ok: true });
  }
  async function guardarFoto(req, res, nome) {
    const corpo = await lerCorpo(req);
    let seguro = nomeSeguro(nome);
    const ext = path.extname(seguro).toLowerCase();
    if (!IMAGENS.includes(ext)) return json(res, 400, { erro: 'Só imagens: ' + IMAGENS.join(', ') });
    if (!corpo.length) return json(res, 400, { erro: 'Ficheiro vazio' });
    const base = seguro.slice(0, -ext.length); // «fachada-1920.jpg» mantém o seu número; só o sufixo acrescentado aqui muda
    let k = 2; while (existe(paraLer('assets/fotos/' + seguro))) seguro = base + '-' + (k++) + ext;
    fs.writeFileSync(paraEscrever('assets/fotos/' + seguro), corpo);
    registo(`foto guardada em assets/fotos/${seguro} (${(corpo.length / 1024).toFixed(0)} kB)`);
    json(res, 200, { ok: true, caminho: 'assets/fotos/' + seguro });
    return seguro;
  }
  async function corpoJSON(req) { try { return JSON.parse((await lerCorpo(req)).toString('utf8')) || {}; } catch (err) { if (err.codigo) throw err; return {}; } }
  // sessões e contas (ver o início do ficheiro)
  async function tratarContas(req, res, rel, s) {
    if (req.method === 'GET') {
      if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Só a partir da própria apresentação' });
      if (rel === '/sessao') return json(res, 200, { sessao: s });
      if (!s || s.papel !== 'admin') return json(res, s ? 403 : 401, { erro: 'Só a administração' });
      const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      if (rel === '/historico') return json(res, 200, { historico: await contas.historico(q) });
      return json(res, 200, { contas: await contas.listar() });
    }
    const b = await corpoJSON(req);
    if (rel === '/sessao') {
      const r = await contas.entrar(b.utilizador, b.chave, { origem: origemConta, lembrar: b.lembrar === true });
      if (r.erro) { registo(`entrada recusada: ${String(b.utilizador || '').slice(0, 40)} (${r.codigo})`); return json(res, r.codigo, { erro: r.erro, ate: r.ate }); }
      registo(`sessão iniciada: ${r.conta.utilizador}${r.lembrar ? ' (lembrada neste dispositivo)' : ''}`);
      return json(res, 200, { sessao: r.conta }, cookie(req, r.testemunho, duracao(r.lembrar)));
    }
    if (rel === '/sessao/terminar') { if (s) await contas.registar({ conta: s, acao: 'saiu', origem: origemConta }); return json(res, 200, { ok: true }, cookie(req, '', 0)); }
    if (!s) return json(res, 401, { erro: 'Inicia sessão primeiro', sessao: null });
    if (rel === '/sessao/palavra-passe') {
      const r = await contas.mudarPalavraPasse(s, b.atual, b.nova, { origem: origemConta });
      return r.erro ? json(res, r.codigo, { erro: r.erro }) : json(res, 200, { sessao: r.conta }, cookie(req, r.testemunho, duracao(r.lembrar)));
    }
    const m = /^\/contas\/([^/]+)\/palavra-passe$/.exec(rel);
    if (m) { const r = await contas.reporPalavraPasse(s, m[1], b.nova, { origem: origemConta }); return r.erro ? json(res, r.codigo, { erro: r.erro }) : json(res, 200, { ok: true, conta: r.conta }); }
    return json(res, 404, { erro: 'Não encontrado' });
  }
  const ROTAS_CONTAS = /^\/(sessao(\/terminar|\/palavra-passe)?|historico|contas(\/[^/]+\/palavra-passe)?)$/;

  return http.createServer(async (req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (err) { rel = '/'; }
    if (rel.includes('\0')) { res.writeHead(400).end('Pedido inválido'); return; } // um carácter nulo fazia o fs.stat lançar e parar o servidor
    // .git, .contas, .claude e outros ficheiros escondidos; «~» também, porque no Windows «CONTAS~1» é outro nome de «.contas»
    if (rel.split(/[\\/]/).some(p => (p.startsWith('.') && p !== '.' && p !== '..') || p.includes('~'))) { res.writeHead(403).end('Proibido'); return; }
    try {
      if (ROTAS_CONTAS.test(rel) && (req.method === 'GET' || req.method === 'POST')) {
        if (!local(req)) return json(res, 403, { erro: 'Só a partir desta máquina' });
        if (req.method === 'POST' && !origemPropria(req)) return json(res, 403, { erro: 'Só a partir da própria apresentação (origem ' + (req.headers.origin || 'desconhecida') + ')' });
        return await tratarContas(req, res, rel, await sessaoDe(req));
      }
      if (req.method === 'POST') {
        if (!local(req)) return json(res, 403, { erro: 'Só a partir desta máquina' });
        if (!origemPropria(req)) return json(res, 403, { erro: 'Só a partir da própria apresentação (origem ' + (req.headers.origin || 'desconhecida') + ')' });
        if (rel === '/copia-central') return await guardarCopia(req, res, req.url); // a cópia do servidor central corre sozinha, sem sessão
        const s = await sessaoDe(req);
        if (rel.startsWith('/guardar-foto/')) {
          const nao = recusa(s, null); if (nao) return json(res, ...nao);
          const nome = await guardarFoto(req, res, rel.slice('/guardar-foto/'.length));
          if (nome) await contas.registar({ conta: s, acao: 'guardou uma foto', preset: nome.slice(0, 60), origem: origemConta });
          return;
        }
        const F = freguesiaDe(req.url); if (!F) return json(res, 400, { erro: 'Freguesia desconhecida' });
        if (rel === '/guardar') return await guardar(req, res, F, s);
        const id = rel.startsWith('/ativar-preset/') ? rel.slice('/ativar-preset/'.length) : rel.startsWith('/apagar-preset/') ? rel.slice('/apagar-preset/'.length) : null;
        if (id === null) return json(res, 404, { erro: 'Não encontrado' });
        const nao = recusa(s, F); if (nao) return json(res, ...nao);
        if (rel.startsWith('/ativar-preset/')) ativarPreset(res, F, id); else apagarPreset(res, F, id);
        if (res.statusCode === 200) await contas.registar({ conta: s, acao: rel.startsWith('/ativar-preset/') ? 'ativou o preset' : 'apagou o preset', freguesia: F.id, preset: id, origem: origemConta });
        return;
      }
      if (rel === '/ambiente.json') return json(res, 200, { app, versao, dados: sobreposta ? gravavel : null, copia: path.join(gravavel, 'copia-central'), contas: true });
      // a cópia do servidor central tem o histórico e as contas: só para este computador (com HOST=0.0.0.0 a rede vê o resto)
      if (/^[\\/]copia-central([\\/]|$)/i.test(rel) && !local(req)) { res.writeHead(403).end('Proibido'); return; }
    } catch (err) { registo(err.message); if (!res.headersSent) return json(res, err.codigo || 500, { erro: err.message }); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const relLimpo = path.normalize(rel).replace(/^[\\/]+/, '');
    const file = paraLer(relLimpo);
    if (!dentro(raiz, file) && !dentro(gravavel, file)) { res.writeHead(403).end('Proibido'); return; }
    try { fs.stat(file, (errStat, st) => {
      if (errStat || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
      const cabecalhos = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Last-Modified': st.mtime.toUTCString(), 'Content-Length': st.size };
      if (req.method === 'HEAD') { res.writeHead(200, cabecalhos); res.end(); return; } // a página compara a data do ficheiro com a gravação automática
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
        res.writeHead(200, cabecalhos); res.end(data);
      });
    }); } catch (err) { if (!res.headersSent) res.writeHead(400).end('Pedido inválido'); }
  });
}
