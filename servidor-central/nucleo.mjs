// Núcleo do servidor central: a API inteira, igual no Node (servidor-central/servidor.mjs, dados em ficheiros) e no
// Cloudflare Workers (servidor-central/cloudflare/worker.mjs, dados no R2). Recebe um Request e devolve um Response
// (padrões da web, sem dependências). O «armazém» é a única diferença entre os dois:
//   ler(chave) → texto | null · escrever(chave, texto) · listar(prefixo) → [{ chave, tamanho, data }] · apagar(chave)
//   atualizar(chave, f) (opcional) → lê, aplica f ao texto e grava sem pisar uma escrita simultânea (no R2, com etag)
// As chaves do armazém são caminhos; no Node viram ficheiros com o mesmo caminho, por isso uma cópia local tem a mesma
// forma que a pasta de dados do servidor Node:
//   presets/<freguesia>/<preset>/<revisão>.json, atual.json, revisoes.json · indice/<freguesia>.json (resumo de cada preset)
//   elementos/<freguesia>.json (elementos já preparados para a consulta) · registo/<AAAA-MM>.json · chaves.json
// Cada consulta lê no máximo um objeto por freguesia (o plano grátis do Workers limita as leituras e o processador por pedido).
export const VERSAO_API = 1;
const LIMITE = 40 * 1024 * 1024;
const idValido = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(id);
// objetos que se podem copiar e repor (cópia local, reposição)
const ID = '[a-z0-9][a-z0-9-]{0,60}';
const CHAVE_OBJETO = new RegExp(`^(presets/${ID}/${ID}/(\\d+|atual|revisoes)\\.json|(indice|elementos)/${ID}\\.json|registo/\\d{4}-\\d{2}\\.json|chaves\\.json)$`);
export const PAPEIS = { leitor: ['ler'], contribuidor: ['ler', 'enviar'], admin: ['ler', 'enviar', 'admin'] };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function resumoDe(chave) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave))); } // só se guarda o resumo das chaves
const iguais = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }; // tempo constante
export function novaChave() { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const idAleatorio = () => { const b = new Uint8Array(4); crypto.getRandomValues(b); return hex(b); };

// ---------- elementos «achatados» para consulta e exportação ----------
const textoSimples = t => (Array.isArray(t) ? t.join('\n\n') : String(t || '')).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim();
const semAcentos = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function geometria(e) {
  const ll = p => [p[1], p[0]]; // [lat, lon] → [lon, lat] do GeoJSON
  if (e.tipo === 'ponto' && e.pos) return { type: 'Point', coordinates: ll(e.pos) };
  if (e.tipo === 'grupo' && e.pontos) return { type: 'MultiPoint', coordinates: e.pontos.map(ll) };
  if (e.tipo === 'rua' && e.linhas) return { type: 'MultiLineString', coordinates: e.linhas.map(l => l.map(ll)) };
  if (e.tipo === 'zona' && e.poligono) return { type: 'Polygon', coordinates: [e.poligono.concat([e.poligono[0]]).map(ll)] };
  return null; // desmaterializado (ou rua sem traçado)
}
function centro(g) {
  if (!g) return [null, null];
  const pts = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flat();
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]); return [+(s[1] / pts.length).toFixed(6), +(s[0] / pts.length).toFixed(6)];
}
function achatar(reg) { // calculado uma vez, ao receber (a consulta só junta listas já prontas)
  const out = [], cats = reg.dados.categorias || [];
  (function rec(lista, pai) { for (const e of lista || []) {
    const g = geometria(e), [lat, lon] = centro(g);
    out.push({ freguesia: reg.freguesia, preset: reg.preset, presetTitulo: reg.dados.titulo || reg.preset, id: e.id, tipo: e.tipo, nome: e.nome, prioridade: e.prioridade || '', competencia: e.competencia || '',
      categorias: cats.filter(c => (c.membros || []).includes(e.id)).map(c => c.nome), dentroDe: pai ? pai.nome : '', texto: textoSimples(e.texto),
      fotos: (e.fotos || []).map(f => f.src || f).filter(s => !String(s).startsWith('data:')), lat, lon, autor: reg.autor || '', recebido: reg.recebido, revisao: reg.revisao, geometria: g });
    rec(e.filhos, e); } })(reg.dados.elementos, null);
  return out;
}
const resumo = r => ({ freguesia: r.freguesia, preset: r.preset, titulo: r.dados.titulo || r.preset, subtitulo: r.dados.subtitulo || '', revisao: r.revisao, autor: r.autor, contribuidor: r.contribuidor, origem: r.origem, recebido: r.recebido, elementos: (r.dados.elementos || []).length });
function filtrar(lista, f) {
  const q = semAcentos(f.q || '');
  return lista.filter(e => (!f.freguesia || e.freguesia === f.freguesia) && (!f.prioridade || e.prioridade === (f.prioridade === 'sem' ? '' : f.prioridade)) && (!f.competencia || e.competencia === (f.competencia === 'sem' ? '' : f.competencia))
    && (!f.tipo || e.tipo === f.tipo) && (!f.categoria || e.categorias.includes(f.categoria)) && (!q || semAcentos(e.nome + ' ' + e.texto + ' ' + e.categorias.join(' ')).includes(q)));
}
function csv(lista) {
  const cols = ['freguesia', 'preset', 'id', 'tipo', 'nome', 'prioridade', 'competencia', 'categorias', 'dentroDe', 'lat', 'lon', 'autor', 'recebido', 'texto'];
  const c = v => { const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + cols.join(';') + '\r\n' + lista.map(e => cols.map(k => c(e[k])).join(';')).join('\r\n') + '\r\n'; // ; e BOM: abre bem no Excel em português
}

export function criarAPI({ armazem, nome = 'Servidor central das freguesias', origens = ['*'], leituraPublica = false, chaveAdmin = '', pagina = '' }) {
  const lerJSON = async k => { const t = await armazem.ler(k); if (t == null) return null; try { return JSON.parse(t); } catch (err) { return null; } };
  const gravarJSON = (k, v) => armazem.escrever(k, JSON.stringify(v));
  // ler, mudar e gravar um objeto JSON partilhado (índices, registo); f recebe o valor atual (ou null) e devolve o novo
  const atualizarJSON = (k, f) => armazem.atualizar
    ? armazem.atualizar(k, t => { let v = null; try { v = t == null ? null : JSON.parse(t); } catch (err) { v = null; } return JSON.stringify(f(v)); })
    : lerJSON(k).then(v => gravarJSON(k, f(v)));
  const pasta = (f, p) => `presets/${f}/${p}/`;
  async function quem(req) { // a chave do pedido (Authorization: Bearer …) ou null; a CHAVE_ADMIN de arranque vale como administração
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); if (!m) return null;
    const r = await resumoDe(m[1].trim());
    if (chaveAdmin && iguais(r, await resumoDe(chaveAdmin))) return { id: 'admin', nome: 'Administração', papel: 'admin' };
    for (const c of (await lerJSON('chaves.json')) || []) if (c.resumo && iguais(c.resumo, r)) return c;
    return null;
  }
  const pode = (c, acao) => (acao === 'ler' && leituraPublica) || !!(c && PAPEIS[c.papel] && PAPEIS[c.papel].includes(acao));
  async function porFreguesia(tipo, freguesia) { // indice/<f>.json ou elementos/<f>.json: um objeto { <preset>: … } por freguesia
    const chaves = freguesia ? [`${tipo}/${freguesia}.json`] : (await armazem.listar(tipo + '/')).map(o => o.chave);
    return (await Promise.all(chaves.map(k => lerJSON(k)))).filter(Boolean).flatMap(o => Object.values(o));
  }
  const resumos = freguesia => porFreguesia('indice', freguesia);

  function cabecalhosCors(req) {
    const o = req.headers.get('origin'); if (!o || !(origens.includes('*') || origens.includes(o))) return {};
    return { 'Access-Control-Allow-Origin': o, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
  }
  const resposta = (corpo, codigo, tipo, extra = {}) => new Response(corpo, { status: codigo, headers: { 'Content-Type': tipo, 'Cache-Control': 'no-store', ...extra } });
  const json = (codigo, obj) => resposta(JSON.stringify(obj), codigo, 'application/json; charset=utf-8');
  const recusa = c => json(c ? 403 : 401, { erro: c ? 'Esta chave não tem acesso a isto' : 'Falta a chave de acesso (ou não é válida)' });
  async function corpoTexto(req) {
    const n = Number(req.headers.get('content-length') || 0); if (n > LIMITE) throw Object.assign(new Error('Pedido demasiado grande (máximo 40 MB)'), { codigo: 413 });
    const t = await req.text(); if (t.length > LIMITE) throw Object.assign(new Error('Pedido demasiado grande (máximo 40 MB)'), { codigo: 413 });
    return t;
  }

  async function receber(req, c, f, p) {
    if (!pode(c, 'enviar')) return recusa(c);
    let corpo; try { corpo = JSON.parse(await corpoTexto(req)); } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
    const d = corpo && corpo.dados;
    if (!d || typeof d !== 'object' || !Array.isArray(d.elementos)) return json(400, { erro: 'Esperava { dados: { …, elementos: [] } }' });
    if (d.freguesia && d.freguesia !== f) return json(409, { erro: `O preset é da freguesia «${d.freguesia}», não de «${f}»` });
    d.freguesia = f; d.preset = p;
    const atual = await lerJSON(pasta(f, p) + 'atual.json');
    if (atual && JSON.stringify(atual.dados) === JSON.stringify(d)) return json(200, { ok: true, revisao: atual.revisao, igual: true }); // nada mudou
    const rev = (atual ? atual.revisao : 0) + 1, recebido = new Date().toISOString();
    const reg = { freguesia: f, preset: p, revisao: rev, autor: String(corpo.autor || '').slice(0, 120), contribuidor: c ? c.nome : '', origem: String(corpo.origem || '').slice(0, 30), versao: String(corpo.versao || '').slice(0, 30), quando: Number(corpo.quando) || null, recebido, dados: d };
    const txt = JSON.stringify(reg), r = resumo(reg);
    await armazem.escrever(pasta(f, p) + rev + '.json', txt);
    await armazem.escrever(pasta(f, p) + 'atual.json', txt);
    await atualizarJSON(pasta(f, p) + 'revisoes.json', v => (v || []).concat(r));
    await atualizarJSON(`indice/${f}.json`, v => ({ ...(v || {}), [p]: r }));
    await atualizarJSON(`elementos/${f}.json`, v => ({ ...(v || {}), [p]: achatar(reg) }));
    await atualizarJSON(`registo/${recebido.slice(0, 7)}.json`, v => (v || []).concat({ recebido, freguesia: f, preset: p, revisao: rev, contribuidor: reg.contribuidor, autor: reg.autor, origem: reg.origem, elementos: d.elementos.length }));
    return json(201, { ok: true, revisao: rev });
  }
  async function elementos(q) {
    if (q.freguesia && !idValido(q.freguesia)) return [];
    return filtrar((await porFreguesia('elementos', q.freguesia)).flat(), q);
  }
  async function chaves(req, c, id, acao) { // administração das chaves
    if (!pode(c, 'admin')) return recusa(c);
    const l = (await lerJSON('chaves.json')) || [];
    if (req.method === 'GET' && !id) return json(200, { chaves: l.map(({ resumo, ...x }) => x) });
    if (req.method === 'POST' && !id) {
      let b; try { b = JSON.parse(await corpoTexto(req)); } catch (err) { return json(400, { erro: 'JSON inválido' }); }
      const nomeC = String(b.nome || '').trim().slice(0, 80), papel = b.papel || 'contribuidor';
      if (!nomeC || !PAPEIS[papel]) return json(400, { erro: 'Esperava { nome, papel: contribuidor | leitor | admin }' });
      const chave = novaChave(), nova = { id: idAleatorio(), nome: nomeC, papel, resumo: await resumoDe(chave), criada: new Date().toISOString() };
      await gravarJSON('chaves.json', l.concat(nova));
      return json(201, { ok: true, id: nova.id, nome: nomeC, papel, chave }); // a chave só se mostra agora
    }
    if (req.method === 'POST' && id && acao === 'retirar') { const n = l.filter(x => x.id !== id); if (n.length === l.length) return json(404, { erro: 'Chave não encontrada' }); await gravarJSON('chaves.json', n); return json(200, { ok: true }); }
    return json(405, { erro: 'Método não suportado' });
  }
  async function copia(req, c, q) { // cópia local e reposição: a lista dos objetos, cada objeto tal como está, e (admin) repor um objeto
    if (req.method === 'GET' && !q.chave) {
      if (!pode(c, 'ler')) return recusa(c);
      const admin = pode(c, 'admin');
      const l = (await armazem.listar('')).filter(o => CHAVE_OBJETO.test(o.chave) && (admin || o.chave !== 'chaves.json'));
      return json(200, { objetos: l.map(o => ({ chave: o.chave, versao: `${o.tamanho}-${o.data}` })) });
    }
    if (!CHAVE_OBJETO.test(q.chave || '')) return json(400, { erro: 'Objeto inválido' });
    if (req.method === 'GET') {
      if (!pode(c, 'ler') || (q.chave === 'chaves.json' && !pode(c, 'admin'))) return recusa(c);
      const t = await armazem.ler(q.chave); return t == null ? json(404, { erro: 'Não encontrado' }) : resposta(t, 200, 'application/json; charset=utf-8');
    }
    if (req.method === 'POST') {
      if (!pode(c, 'admin')) return recusa(c);
      const t = await corpoTexto(req); try { JSON.parse(t); } catch (err) { return json(400, { erro: 'O objeto não é JSON' }); }
      await armazem.escrever(q.chave, t); return json(200, { ok: true });
    }
    return json(405, { erro: 'Método não suportado' });
  }

  async function tratar(req) { // os cabeçalhos CORS juntam-se à resposta de cada pedido (no Worker há pedidos em simultâneo)
    const cors = cabecalhosCors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const r = await interno(req);
    for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
    return r;
  }
  async function interno(req) {
    let u; try { u = new URL(req.url); } catch (err) { return json(400, { erro: 'Pedido inválido' }); }
    let partes; try { partes = u.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch (err) { return json(400, { erro: 'Pedido inválido' }); }
    const q = Object.fromEntries(u.searchParams);
    try {
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/consulta' || u.pathname === '/consulta.html')) return resposta(pagina, 200, 'text/html; charset=utf-8');
      if (partes[0] !== 'api' || partes[1] !== 'v' + VERSAO_API) return json(404, { erro: 'Não encontrado' });
      const [, , rec, f, p, extra] = partes, c = await quem(req);
      if (rec === 'estado' && req.method === 'GET') return json(200, { ok: true, nome, api: VERSAO_API, leituraPublica, chave: c ? { nome: c.nome, papel: c.papel } : null });
      if (rec === 'chaves') return await chaves(req, c, f, p);
      if (rec === 'copia' || rec === 'objeto') return await copia(req, c, rec === 'copia' ? {} : q);
      if (rec === 'presets' && req.method === 'POST' && idValido(f) && idValido(p) && !extra) return await receber(req, c, f, p);
      if (req.method !== 'GET') return json(405, { erro: 'Método não suportado' });
      if (!pode(c, 'ler')) return recusa(c);
      if (rec === 'freguesias') { const m = {}; for (const r of await resumos()) { const x = m[r.freguesia] = m[r.freguesia] || { freguesia: r.freguesia, presets: 0, elementos: 0, ultimo: '' }; x.presets++; x.elementos += r.elementos; if (r.recebido > x.ultimo) x.ultimo = r.recebido; } return json(200, { freguesias: Object.values(m).sort((a, b) => a.freguesia.localeCompare(b.freguesia)) }); }
      if (rec === 'presets' && !f) { if (q.freguesia && !idValido(q.freguesia)) return json(400, { erro: 'Freguesia inválida' }); return json(200, { presets: (await resumos(q.freguesia)).sort((a, b) => b.recebido.localeCompare(a.recebido)) }); }
      if (rec === 'presets' && idValido(f) && idValido(p)) {
        if (extra === 'revisoes') return json(200, { revisoes: (await lerJSON(pasta(f, p) + 'revisoes.json')) || [] });
        if (extra) return json(404, { erro: 'Não encontrado' });
        const n = q.revisao ? parseInt(q.revisao, 10) : null, t = await armazem.ler(pasta(f, p) + (n > 0 ? n : 'atual') + '.json');
        return t == null ? json(404, { erro: 'Preset não encontrado' }) : resposta(t, 200, 'application/json; charset=utf-8');
      }
      if (rec === 'registo') { // os envios mais recentes (dos últimos meses)
        const meses = (await armazem.listar('registo/')).map(o => o.chave).sort().reverse().slice(0, 3), lim = Math.min(Number(q.limite) || 200, 1000);
        const l = (await Promise.all(meses.map(k => lerJSON(k)))).filter(Boolean).flat().sort((a, b) => b.recebido.localeCompare(a.recebido));
        return json(200, { registo: l.slice(0, lim) });
      }
      if (rec === 'elementos') { const l = await elementos(q); return json(200, { total: l.length, elementos: l.map(({ geometria: _g, ...e }) => e) }); }
      if (rec === 'exportar.csv') return resposta(csv(await elementos(q)), 200, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="elementos.csv"' });
      if (rec === 'exportar.geojson') { const fc = { type: 'FeatureCollection', features: (await elementos(q)).map(({ geometria: g, ...e }) => ({ type: 'Feature', geometry: g, properties: e })) }; return resposta(JSON.stringify(fc), 200, 'application/geo+json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="elementos.geojson"' }); }
      return json(404, { erro: 'Não encontrado' });
    } catch (err) { return json(err.codigo || 500, { erro: err.codigo ? err.message : 'Erro interno' }); }
  }
  return { tratar };
}
