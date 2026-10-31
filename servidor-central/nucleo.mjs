// Núcleo do servidor central: a API inteira, igual no Node (servidor-central/servidor.mjs, dados em ficheiros) e no
// Cloudflare Workers (servidor-central/cloudflare/worker.mjs, dados no R2). Recebe um Request e devolve um Response
// (padrões da web, sem dependências). O «armazém» é a única diferença entre os dois:
//   ler(chave) → texto | null · escrever(chave, texto) · listar(prefixo) → [{ chave, tamanho, data }] · apagar(chave)
//   atualizar(chave, f) (opcional) → lê, aplica f ao texto e grava sem pisar uma escrita simultânea (no R2, com etag)
// As chaves do armazém são caminhos; no Node viram ficheiros com o mesmo caminho, por isso uma cópia local tem a mesma
// forma que a pasta de dados do servidor Node:
//   presets/<freguesia>/<preset>/<revisão>.json, atual.json, revisoes.json · indice/<freguesia>.json (resumo de cada preset)
//   elementos/<freguesia>.json (elementos já preparados para a consulta) · chaves.json
//   contas/contas.json, contas/segredo.json, historico/<AAAA-MM>.json (contas de utilizador e quem fez o quê: ver contas.mjs)
// Cada consulta lê no máximo um objeto por freguesia (o plano grátis do Workers limita as leituras e o processador por pedido).
//
// Quem pede: uma conta de utilizador (POST /sessao devolve um testemunho; cada conta só envia para as suas freguesias)
// ou uma chave de acesso (para máquinas: leitor, contribuidor ou administração, criadas na página de consulta). Quem fez
// o quê (o histórico, os autores) só a administração vê; os outros recebem os dados sem os nomes.
import { criarContas, podeEditar, resumoAlteracoes, fundirCategorias, juntarCategorias, pedidoFundir } from './contas.mjs';
import CONTAS_INICIAIS from './contas-iniciais.mjs';
export const VERSAO_API = 1;
const LIMITE = 40 * 1024 * 1024;
const idValido = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(id);
// objetos que se podem copiar e repor (cópia local, reposição); o segredo das sessões fica sempre no servidor
const ID = '[a-z0-9][a-z0-9-]{0,60}';
const CHAVE_OBJETO = new RegExp(`^(presets/${ID}/${ID}/(\\d+|atual|revisoes)\\.json|(indice|elementos)/${ID}\\.json|historico/\\d{4}-\\d{2}\\.json|chaves\\.json|contas/contas\\.json|evento/(atual|catalogo)\\.json|definicoes/geral\\.json|categorias/fundidas\\.json|apagados/${ID}\\.json)$`);
export const PAPEIS = { leitor: ['ler'], contribuidor: ['ler', 'enviar'], admin: ['ler', 'enviar', 'admin'] };
const AUTORIA = ['autor', 'contribuidor', 'utilizador'];
const semAutoria = o => {
  if (!o || typeof o !== 'object') return o; const x = { ...o }; for (const k of AUTORIA) delete x[k];
  if (x.dados && Array.isArray(x.dados.elementos)) x.dados = { ...x.dados, elementos: x.dados.elementos.map(e => e && Array.isArray(e.detalhes) ? { ...e, detalhes: e.detalhes.map(semAutoria) } : e) }; // quem fez cada registo de um evento
  return x;
};
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function resumoDe(chave) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave))); } // só se guarda o resumo das chaves
const iguais = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }; // tempo constante
export function novaChave() { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const idAleatorio = () => { const b = new Uint8Array(4); crypto.getRandomValues(b); return hex(b); };

// ---------- elementos «achatados» para consulta e exportação ----------
const textoSimples = t => (Array.isArray(t) ? t.join('\n\n') : String(t || '')).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+\n/g, '\n').trim();
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
    // um conjunto leva também quantos pontos tem de cada tipo
    const registos = e.tipo === 'grupo' && Array.isArray(e.detalhes) ? e.detalhes.map(d => ({ i: d && d.i ? String(d.i) : '', c: d && d.c ? String(d.c) : 'sem' })) : null;
    const contagens = registos && registos.reduce((m, d) => { m[d.c] = (m[d.c] || 0) + 1; return m; }, {});
    out.push({ freguesia: reg.freguesia, preset: reg.preset, presetTitulo: reg.dados.titulo || reg.preset, id: e.id, tipo: e.tipo, nome: e.nome, prioridade: e.prioridade || '', competencia: e.competencia || '',
      ...(e.evento ? { evento: String(e.evento) } : {}), ...(registos ? { pontos: Array.isArray(e.pontos) ? e.pontos.length : 0, contagens, registos, tipos: e.tiposPonto || undefined } : {}),
      categorias: cats.filter(c => (c.membros || []).includes(e.id)).map(c => c.nome), dentroDe: pai ? pai.nome : '', texto: [textoSimples(e.texto), ...(e.tipo === 'grupo' && !e.evento && Array.isArray(e.detalhes) ? e.detalhes.filter(d => d && (d.nome || d.texto)).map(d => [d.nome, textoSimples(d.texto)].filter(Boolean).join(': ')) : [])].filter(Boolean).join('\n\n'),
      fotos: (e.fotos || []).map(f => f.src || f).filter(s => !String(s).startsWith('data:')), lat, lon, autor: reg.autor || '', utilizador: reg.utilizador || '', recebido: reg.recebido, revisao: reg.revisao, geometria: g });
    rec(e.filhos, e); } })(reg.dados.elementos, null);
  return out;
}
// Pontos dos conjuntos: cada envio leva o preset inteiro do dispositivo que o fez, por isso os registos juntam-se aos que
// já cá estão (duas equipas com a mesma conta não apagam os registos uma da outra). Cada registo tem um id («i»); um
// registo tirado fica em dados.removidosEvento = { <evento>: [ids] } e não volta. Ordem por data, para o mesmo conteúdo dar o mesmo texto.
function juntarEventos(antes, d) {
  if (!antes) return;
  const removidos = {};
  for (const fonte of [antes.removidosEvento, d.removidosEvento]) for (const [ev, ids] of Object.entries(fonte || {})) removidos[ev] = [...new Set([...(removidos[ev] || []), ...(Array.isArray(ids) ? ids : [])])];
  if (Object.keys(removidos).length) d.removidosEvento = removidos;
  const grupos = x => (x.elementos || []).filter(e => e && e.tipo === 'grupo' && Array.isArray(e.detalhes)), chave = e => e.evento || e.id;
  for (const ev of new Set([...grupos(antes), ...grupos(d)].map(chave))) {
    const a = grupos(antes).find(e => chave(e) === ev), g = grupos(d).find(e => chave(e) === ev);
    if (!g && (d.elementos || []).some(e => e && e.id === a.id)) continue; // o elemento deixou de ser um conjunto
    const fora = new Set(removidos[ev] || []), juntos = new Map();
    for (const e of [a, g]) if (e) e.detalhes.forEach((x, i) => {
      const id = (x && x.i) || [x && x.quando, x && x.rua, x && x.numero, e.pontos[i]].join('|'); if (fora.has(id)) return; // registos de antes dos ids: pelo conteúdo
      const ja = juntos.get(id), este = x || {}, novo = !ja || String(este.movido || '') >= String(ja.x.movido || ''), editou = !ja || String(este.editado || '') >= String(ja.x.editado || ''); // a posição é a do último arrasto, o resto da última edição; o autor não se perde num envio de quem não o vê
      const junto = editou ? { ...(ja && ja.x), ...este } : { ...este, ...ja.x }, movido = novo ? este.movido : ja.x.movido; if (movido) junto.movido = movido;
      juntos.set(id, { p: novo ? e.pontos[i] : ja.p, x: junto });
    });
    const lista = [...juntos.values()].sort((p, q) => String(p.x.quando || '').localeCompare(String(q.x.quando || '')) || (p.x.quando ? String(p.x.i || '').localeCompare(String(q.x.i || '')) : 0)); // sem data, fica a ordem em que vieram
    if (!lista.length) { if (g) d.elementos.splice(d.elementos.indexOf(g), 1); continue; }
    const alvo = g || { ...a }; alvo.pontos = lista.map(l => l.p); alvo.detalhes = lista.map(l => l.x); if (!g) d.elementos.push(alvo);
  }
}
// um registo com localização só mexe nos pontos dos conjuntos: o resto do preset fica como está no servidor, mesmo que o dispositivo não o tenha atualizado
function soEventos(antes, d) {
  const eh = e => e && e.tipo === 'grupo' && Array.isArray(e.detalhes), chave = e => e.evento || e.id, novos = (d.elementos || []).filter(eh), velhos = antes.elementos || [];
  return { ...antes, removidosEvento: d.removidosEvento, elementos: velhos.map(e => { const n = e && e.tipo === 'grupo' && novos.find(x => chave(x) === chave(e)); return n ? { ...e, pontos: n.pontos, detalhes: n.detalhes } : e; }).concat(novos.filter(n => !velhos.some(e => e && e.tipo === 'grupo' && chave(e) === chave(n)))) };
}
const resumo = r => ({ categorias: (r.dados.categorias || []).filter(c => c && c.nome).map(c => ({ nome: c.nome, icone: c.icone || '', cor: c.cor || '', n: (c.membros || []).length })), freguesia: r.freguesia, preset: r.preset, titulo: r.dados.titulo || r.preset, subtitulo: r.dados.subtitulo || '', revisao: r.revisao, autor: r.autor, contribuidor: r.contribuidor, origem: r.origem, recebido: r.recebido, elementos: (r.dados.elementos || []).length });
function filtrar(lista, f) {
  const q = semAcentos(f.q || '');
  return lista.filter(e => (!f.freguesia || e.freguesia === f.freguesia) && (!f.prioridade || e.prioridade === (f.prioridade === 'sem' ? '' : f.prioridade)) && (!f.competencia || e.competencia === (f.competencia === 'sem' ? '' : f.competencia))
    && (!f.tipo || e.tipo === f.tipo) && (!f.categoria || e.categorias.includes(f.categoria)) && (!q || semAcentos(e.nome + ' ' + e.texto + ' ' + e.categorias.join(' ')).includes(q)));
}
function csv(lista, comAutor) { // o autor só para a administração
  const cols = ['freguesia', 'preset', 'id', 'tipo', 'nome', 'prioridade', 'competencia', 'categorias', 'dentroDe', 'lat', 'lon', ...(comAutor ? ['autor'] : []), 'recebido', 'texto'];
  const c = v => { const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + cols.join(';') + '\r\n' + lista.map(e => cols.map(k => c(e[k])).join(';')).join('\r\n') + '\r\n'; // ; e BOM: abre bem no Excel em português
}

export function criarAPI({ armazem, nome = 'Servidor central das freguesias', origens = ['*'], leituraPublica = false, chaveAdmin = '', pagina = '', contasIniciais = CONTAS_INICIAIS, segredoSessoes = '', horasSessao = 24, horasLembrar = 30 * 24 }) {
  const lerJSON = async k => { const t = await armazem.ler(k); if (t == null) return null; try { return JSON.parse(t); } catch (err) { return null; } };
  const gravarJSON = (k, v) => armazem.escrever(k, JSON.stringify(v));
  // ler, mudar e gravar um objeto JSON partilhado (índices, histórico); f recebe o valor atual (ou null) e devolve o novo
  const atualizarJSON = (k, f) => armazem.atualizar
    ? armazem.atualizar(k, t => { let v = null; try { v = t == null ? null : JSON.parse(t); } catch (err) { v = null; } return JSON.stringify(f(v)); })
    : lerJSON(k).then(v => gravarJSON(k, f(v)));
  const pasta = (f, p) => `presets/${f}/${p}/`;
  // uma sessão dura um dia; com «lembrar-me», 30 dias (a fila da apresentação pode enviar dias depois de uma edição sem rede)
  const contas = criarContas({ armazem, iniciais: contasIniciais, segredo: segredoSessoes, horas: horasSessao, horasLembrar });
  // quem pede (Authorization: Bearer …): uma conta (testemunho «s1.…») ou uma chave de acesso; a CHAVE_ADMIN de arranque vale como administração
  async function quem(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); if (!m) return null;
    const t = m[1].trim();
    if (t.startsWith('s1.')) { const a = await contas.verificar(t); return a && { id: 'conta:' + a.utilizador, nome: a.nome, utilizador: a.utilizador, conta: a, papel: a.papel === 'admin' ? 'admin' : 'contribuidor', freguesias: a.freguesias }; }
    const r = await resumoDe(t);
    if (chaveAdmin && iguais(r, await resumoDe(chaveAdmin))) return { id: 'admin', nome: 'Administração', papel: 'admin', freguesias: ['*'] };
    for (const c of (await lerJSON('chaves.json')) || []) if (c.resumo && iguais(c.resumo, r)) return { ...c, freguesias: c.freguesias || ['*'] };
    return null;
  }
  // enviar para uma freguesia: o papel e também a freguesia (cada conta de freguesia só envia para a sua)
  const pode = (c, acao, freguesia) => (acao === 'ler' && leituraPublica) || !!(c && PAPEIS[c.papel] && PAPEIS[c.papel].includes(acao) && (!freguesia || podeEditar(c, freguesia)));
  const autoria = (c, x) => pode(c, 'admin') ? x : Array.isArray(x) ? x.map(semAutoria) : semAutoria(x); // os nomes de quem fez só para a administração
  const comoConta = c => c.conta || { utilizador: 'chave:' + c.nome, nome: c.nome, papel: c.papel }; // para o histórico
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
  const recusa = c => json(c ? 403 : 401, { erro: c ? (c.conta ? `A conta ${c.utilizador} não tem acesso a isto` : 'Esta chave não tem acesso a isto') : 'Falta iniciar sessão ou a chave de acesso (ou a sessão terminou)' });
  async function corpoTexto(req) {
    const n = Number(req.headers.get('content-length') || 0); if (n > LIMITE) throw Object.assign(new Error('Pedido demasiado grande (máximo 40 MB)'), { codigo: 413 });
    const t = await req.text(); if (t.length > LIMITE) throw Object.assign(new Error('Pedido demasiado grande (máximo 40 MB)'), { codigo: 413 });
    return t;
  }

  async function receber(req, c, f, p) {
    if (!pode(c, 'enviar')) return recusa(c);
    if (!pode(c, 'enviar', f)) return json(403, { erro: `${c.conta ? 'A conta ' + c.utilizador : 'Esta chave'} não pode editar ${f}` });
    let corpo; try { corpo = JSON.parse(await corpoTexto(req)); } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
    const d = corpo && corpo.dados;
    if (!d || typeof d !== 'object' || !Array.isArray(d.elementos)) return json(400, { erro: 'Esperava { dados: { …, elementos: [] } }' });
    if (d.freguesia && d.freguesia !== f) return json(409, { erro: `O preset é da freguesia «${d.freguesia}», não de «${f}»` });
    d.freguesia = f; d.preset = p;
    const fundidas = (await lerJSON('categorias/fundidas.json')) || []; // o que a administração fundiu não volta com um envio de um ficheiro antigo
    let atual = null, reg = null;
    const juntar = t => { // corre outra vez se outro envio do mesmo preset gravar primeiro: ninguém pisa os registos de ninguém
      try { atual = t == null ? null : JSON.parse(t); } catch (err) { atual = null; }
      const novo = corpo.soEvento && atual ? soEventos(atual.dados, structuredClone(d)) : structuredClone(d);
      juntarEventos(atual && atual.dados, novo); reg = null;
      for (const x of fundidas) fundirCategorias(novo, x.de, x.para, x.modelo);
      if (atual && JSON.stringify(atual.dados) === JSON.stringify(novo)) return t; // nada mudou
      const rev = (atual ? atual.revisao : 0) + 1, recebido = new Date().toISOString();
    // o autor é a conta que enviou (com uma chave de acesso, o nome que vem no pedido)
      reg = { freguesia: f, preset: p, revisao: rev, utilizador: c.utilizador || '', autor: c.conta ? c.nome : String(corpo.autor || '').slice(0, 120), contribuidor: c.nome, origem: String(corpo.origem || '').slice(0, 30), versao: String(corpo.versao || '').slice(0, 30), quando: Number(corpo.quando) || null, recebido, dados: novo };
      return JSON.stringify(reg);
    };
    await trocarAtual(f, p, juntar);
    if (!reg) return json(200, { ok: true, revisao: atual.revisao, igual: true });
    await depoisDeGravar(c, f, p, reg, atual);
    return json(201, { ok: true, revisao: reg.revisao });
  }
  const trocarAtual = async (f, p, mudar) => { const k = pasta(f, p) + 'atual.json'; if (armazem.atualizar) await armazem.atualizar(k, mudar); else { const t = await armazem.ler(k), novo = mudar(t); if (novo != null && novo !== t) await armazem.escrever(k, novo); } };
  async function apagarPreset(c, f, p) { // sai da lista e da apresentação; as revisões ficam, e um envio novo trá-lo de volta
    if (!pode(c, 'enviar', f)) return recusa(c);
    const sem = v => { const n = { ...(v || {}) }; delete n[p]; return n; };
    await atualizarJSON(`indice/${f}.json`, sem); await atualizarJSON(`elementos/${f}.json`, sem);
    await atualizarJSON(`apagados/${f}.json`, v => [...new Set([...(v || []), p])]);
    await contas.registar({ conta: comoConta(c), acao: 'apagou o preset', freguesia: f, preset: p, origem: 'servidor central' });
    return json(200, { ok: true });
  }
  async function depoisDeGravar(c, f, p, reg, atual) { // a revisão, os índices e o histórico
    const ap = await lerJSON(`apagados/${f}.json`); if (ap && ap.includes(p)) await atualizarJSON(`apagados/${f}.json`, v => (v || []).filter(x => x !== p));
    const rev = reg.revisao, r = resumo(reg);
    await armazem.escrever(pasta(f, p) + rev + '.json', JSON.stringify(reg));
    await atualizarJSON(pasta(f, p) + 'revisoes.json', v => (v || []).concat({ ...r, categorias: undefined }));
    await atualizarJSON(`indice/${f}.json`, v => ({ ...(v || {}), [p]: r }));
    await atualizarJSON(`elementos/${f}.json`, v => ({ ...(v || {}), [p]: achatar(reg) }));
    await contas.registar({ conta: comoConta(c), acao: 'guardou', freguesia: f, preset: p, revisao: rev, resumo: resumoAlteracoes(atual && atual.dados, reg.dados), origem: reg.origem });
  }
  // junta categorias em todos os presets: cada preset alterado ganha uma revisão, como num envio
  // A apresentação alojada no mesmo Worker: o que está guardado aqui sobrepõe-se aos ficheiros que vieram com a publicação.
  // É o que qualquer visitante vê, por isso nunca leva quem fez o quê. null: não há nada guardado (servem os ficheiros).
  async function dadosApresentacao(f, ficheiro, indiceEstatico) {
    const lista = Object.values((await lerJSON('indice/' + f + '.json')) || {}), apagados = (await lerJSON('apagados/' + f + '.json')) || [];
    if (!lista.length && !apagados.length) return null;
    if (ficheiro === 'presets/index.js') {
      const base = (Array.isArray(indiceEstatico) ? indiceEstatico : []).filter(p => !apagados.includes(p.id));
      const junta = [...base.filter(p => !lista.some(r => r.preset === p.id)), ...lista.map(r => ({ id: r.preset, nome: r.titulo || r.preset, subtitulo: r.subtitulo || '', elementos: r.elementos }))].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
      return { texto: 'window.PRESETS = ' + JSON.stringify(junta) + ';\n' };
    }
    if (ficheiro === 'conteudos.js' && !lista.length) return { apagados }; // nada guardado: servem os ficheiros, sem os presets apagados
    const pid = ficheiro === 'conteudos.js' ? lista.slice().sort((a, b) => String(b.recebido).localeCompare(String(a.recebido)))[0].preset : ficheiro.slice('presets/'.length, -3);
    if (!idValido(pid)) return null;
    const a = await lerJSON(pasta(f, pid) + 'atual.json'); if (!a) return null;
    return { texto: 'window.' + (ficheiro === 'conteudos.js' ? 'CONTEUDOS' : 'CONTEUDOS_PRESET') + ' = ' + JSON.stringify(semAutoria(a).dados) + ';\n', quando: a.recebido };
  }
  async function fundirEmTodos(c, pedido) {
    const alterados = [];
    await atualizarJSON('categorias/fundidas.json', v => (v || []).concat({ de: pedido.de, para: pedido.para, modelo: pedido.modelo }).filter((x, i, l) => l.findIndex(y => JSON.stringify(y) === JSON.stringify(x)) === i));
    for (const r0 of await resumos(idValido(pedido.freguesia) ? pedido.freguesia : undefined)) {
      const { freguesia: f, preset: p } = r0; let atual = null, reg = null;
      await trocarAtual(f, p, t => {
        try { atual = t == null ? null : JSON.parse(t); } catch (err) { atual = null; }
        reg = null; if (!atual) return t;
        const novo = structuredClone(atual.dados); if (!fundirCategorias(novo, pedido.de, pedido.para, pedido.modelo)) return t;
        reg = { ...atual, revisao: atual.revisao + 1, utilizador: c.utilizador || '', autor: c.nome, contribuidor: c.nome, origem: 'servidor central', quando: null, recebido: new Date().toISOString(), dados: novo };
        return JSON.stringify(reg);
      });
      if (reg) { await depoisDeGravar(c, f, p, reg, atual); alterados.push({ freguesia: f, preset: p, revisao: reg.revisao }); }
    }
    return alterados;
  }
  // sessões e contas: entrar, mudar a própria palavra-passe; a administração lista as contas e repõe palavras-passe
  async function tratarContas(req, c, rec, alvo, acao) {
    if (req.method === 'GET' && rec === 'contas' && !alvo) return pode(c, 'admin') ? json(200, { contas: await contas.listar() }) : recusa(c);
    if (req.method === 'GET' && rec === 'historico') {
      if (!pode(c, 'admin')) return recusa(c);
      const q = Object.fromEntries(new URL(req.url).searchParams);
      return json(200, { historico: await contas.historico(q) });
    }
    if (req.method !== 'POST') return json(405, { erro: 'Método não suportado' });
    let b; try { b = JSON.parse(await corpoTexto(req)) || {}; } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
    if (rec === 'sessao' && !alvo) {
      const r = await contas.entrar(b.utilizador, b.chave, { origem: String(b.origem || 'servidor central').slice(0, 30), lembrar: b.lembrar === true });
      return r.erro ? json(r.codigo, { erro: r.erro, ate: r.ate }) : json(200, { sessao: r.conta, testemunho: r.testemunho, expira: r.expira, lembrar: r.lembrar });
    }
    if (rec === 'sessao' && alvo === 'palavra-passe') {
      if (!c || !c.conta) return json(401, { erro: 'Inicia sessão com a tua conta primeiro' });
      const r = await contas.mudarPalavraPasse(c.conta, b.atual, b.nova, { origem: 'servidor central' });
      return r.erro ? json(r.codigo, { erro: r.erro }) : json(200, { sessao: r.conta, testemunho: r.testemunho, expira: r.expira, lembrar: r.lembrar });
    }
    if (rec === 'contas' && alvo && acao === 'palavra-passe') {
      if (!pode(c, 'admin')) return recusa(c);
      const r = await contas.reporPalavraPasse({ ...comoConta(c), papel: 'admin' }, alvo, b.nova, { origem: 'servidor central' });
      return r.erro ? json(r.codigo, { erro: r.erro }) : json(200, { ok: true, conta: r.conta });
    }
    return json(404, { erro: 'Não encontrado' });
  }
  // resumo de um evento: por freguesia, quantos registos de cada categoria, somando os presets (um registo copiado para outro preset conta uma vez)
  async function resumoEvento(id) {
    const porF = {}; let total = 0;
    for (const o of await armazem.listar('elementos/')) {
      const f = /^elementos\/(.+)\.json$/.exec(o.chave); if (!f || !idValido(f[1])) continue;
      const presets = (await lerJSON(o.chave)) || {};
      const vistos = new Map(); let recebido = '';
      for (const [pid, linhas] of Object.entries(presets)) for (const l of linhas) if (l.evento === id) {
        (l.registos || []).forEach((x, k) => vistos.set(x.i || pid + '#' + k, x.c));
        if (l.recebido > recebido) recebido = l.recebido;
      }
      if (!vistos.size) continue;
      const contagens = {}; for (const c of vistos.values()) contagens[c] = (contagens[c] || 0) + 1;
      porF[f[1]] = { total: vistos.size, contagens, recebido };
      total += vistos.size;
    }
    return { evento: id, total, freguesias: porF };
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
      const fregs = Array.isArray(b.freguesias) && b.freguesias.length ? b.freguesias : ['*']; // um contribuidor pode ficar só com algumas freguesias
      if (!nomeC || !PAPEIS[papel] || !fregs.every(x => x === '*' || idValido(x))) return json(400, { erro: 'Esperava { nome, papel: contribuidor | leitor | admin, freguesias?: [ids] }' });
      const chave = novaChave(), nova = { id: idAleatorio(), nome: nomeC, papel, freguesias: papel === 'admin' ? ['*'] : fregs, resumo: await resumoDe(chave), criada: new Date().toISOString() };
      await gravarJSON('chaves.json', l.concat(nova));
      return json(201, { ok: true, id: nova.id, nome: nomeC, papel, freguesias: nova.freguesias, chave }); // a chave só se mostra agora
    }
    if (req.method === 'POST' && id && acao === 'retirar') { const n = l.filter(x => x.id !== id); if (n.length === l.length) return json(404, { erro: 'Chave não encontrada' }); await gravarJSON('chaves.json', n); return json(200, { ok: true }); }
    return json(405, { erro: 'Método não suportado' });
  }
  // cópia local e reposição (só a administração: a cópia tem tudo, incluindo o histórico e as contas): a lista dos objetos,
  // cada objeto tal como está, e repor um objeto
  async function copia(req, c, q) {
    if (!pode(c, 'admin')) return recusa(c);
    if (req.method === 'GET' && !q.chave) {
      const l = (await armazem.listar('')).filter(o => CHAVE_OBJETO.test(o.chave));
      return json(200, { objetos: l.map(o => ({ chave: o.chave, versao: `${o.tamanho}-${o.data}` })) });
    }
    if (!CHAVE_OBJETO.test(q.chave || '')) return json(400, { erro: 'Objeto inválido' });
    if (req.method === 'GET') {
      const t = await armazem.ler(q.chave); return t == null ? json(404, { erro: 'Não encontrado' }) : resposta(t, 200, 'application/json; charset=utf-8');
    }
    if (req.method === 'POST') {
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
      if (rec === 'estado' && req.method === 'GET') return json(200, { ok: true, nome, api: VERSAO_API, leituraPublica, chave: c ? { nome: c.nome, papel: c.papel, utilizador: c.utilizador || null, conta: c.conta ? c.conta.papel : null, freguesias: c.freguesias } : null });
      if (rec === 'evento' && req.method === 'GET' && !f) return json(200, { evento: await contas.lerEvento() });
      if (rec === 'definicoes' && req.method === 'GET' && !f) return json(200, { definicoes: await contas.lerDefinicoes() });
      if (rec === 'definicoes' && req.method === 'POST' && !f) {
        if (!pode(c, 'admin')) return recusa(c);
        let b; try { b = JSON.parse(await corpoTexto(req)) || {}; } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
        const r = await contas.mudarDefinicoes({ ...comoConta(c), papel: 'admin' }, b, { origem: 'servidor central' });
        return r.erro ? json(r.codigo, { erro: r.erro }) : json(200, r);
      }
      if (rec === 'eventos' && req.method === 'GET' && !f) return json(200, { eventos: await contas.lerCatalogo() });
      if (rec === 'eventos' && req.method === 'POST' && !f) {
        if (!pode(c, 'admin')) return recusa(c);
        let b; try { b = JSON.parse(await corpoTexto(req)) || {}; } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
        const r = await contas.guardarEvento({ ...comoConta(c), papel: 'admin' }, b, { origem: 'servidor central' });
        return r.erro ? json(r.codigo, { erro: r.erro }) : json(200, r);
      }
      if (rec === 'evento' && req.method === 'GET' && f === 'resumo') { if (!pode(c, 'ler')) return recusa(c); const atual = await contas.lerEvento(); const id = q.id || (atual && atual.id); return json(200, id ? await resumoEvento(id) : { evento: null, total: 0, freguesias: {} }); }
      if (rec === 'evento' && req.method === 'POST' && !f) {
        if (!pode(c, 'admin')) return recusa(c);
        let b; try { b = JSON.parse(await corpoTexto(req)) || {}; } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
        const r = await contas.definirEvento({ ...comoConta(c), papel: 'admin' }, b, { origem: 'servidor central' });
        return r.erro ? json(r.codigo, { erro: r.erro }) : json(200, r);
      }
      if (rec === 'categorias' && f === 'fundir' && req.method === 'POST') {
        if (!pode(c, 'admin')) return recusa(c);
        let b; try { b = JSON.parse(await corpoTexto(req)) || {}; } catch (err) { return json(err.codigo || 400, { erro: err.codigo ? err.message : 'JSON inválido' }); }
        const pedido = pedidoFundir(b); if (!pedido) return json(400, { erro: 'Esperava { de: [nomes], para }' });
        const alterados = await fundirEmTodos(c, pedido); await contas.registar({ conta: comoConta(c), acao: 'fundiu categorias: ' + pedido.de.join(', ') + ' → ' + pedido.para, origem: 'servidor central' });
        return json(200, { ok: true, alterados });
      }
      if (rec === 'sessao' || rec === 'contas' || rec === 'historico') return await tratarContas(req, c, rec, f, p);
      if (rec === 'chaves') return await chaves(req, c, f, p);
      if (rec === 'copia' || rec === 'objeto') return await copia(req, c, rec === 'copia' ? {} : q);
      if (rec === 'presets' && req.method === 'POST' && idValido(f) && idValido(p) && !extra) return await receber(req, c, f, p);
      if (rec === 'presets' && req.method === 'POST' && idValido(f) && idValido(p) && extra === 'apagar') return await apagarPreset(c, f, p);
      if (req.method !== 'GET') return json(405, { erro: 'Método não suportado' });
      if (!pode(c, 'ler')) return recusa(c);
      if (rec === 'freguesias') { const m = {}; for (const r of await resumos()) { const x = m[r.freguesia] = m[r.freguesia] || { freguesia: r.freguesia, presets: 0, elementos: 0, ultimo: '' }; x.presets++; x.elementos += r.elementos; if (r.recebido > x.ultimo) x.ultimo = r.recebido; } return json(200, { freguesias: Object.values(m).sort((a, b) => a.freguesia.localeCompare(b.freguesia)) }); }
      if (rec === 'categorias' && !f) { const l = await Promise.all((await resumos()).map(async r => { if (r.categorias) return { freguesia: r.freguesia, preset: r.preset, dados: { categorias: r.categorias } }; const a = await lerJSON(pasta(r.freguesia, r.preset) + 'atual.json'); return { freguesia: r.freguesia, preset: r.preset, dados: a && a.dados }; })); return json(200, { categorias: juntarCategorias(l) }); }
      if (rec === 'presets' && !f) { if (q.freguesia && !idValido(q.freguesia)) return json(400, { erro: 'Freguesia inválida' }); return json(200, { presets: autoria(c, (await resumos(q.freguesia)).sort((a, b) => b.recebido.localeCompare(a.recebido))) }); }
      if (rec === 'presets' && idValido(f) && idValido(p)) {
        if (extra === 'revisoes') return json(200, { revisoes: autoria(c, (await lerJSON(pasta(f, p) + 'revisoes.json')) || []) });
        if (extra) return json(404, { erro: 'Não encontrado' });
        const n = q.revisao ? parseInt(q.revisao, 10) : null, t = await armazem.ler(pasta(f, p) + (n > 0 ? n : 'atual') + '.json');
        if (t == null) return json(404, { erro: 'Preset não encontrado' });
        return pode(c, 'admin') ? resposta(t, 200, 'application/json; charset=utf-8') : json(200, semAutoria(JSON.parse(t)));
      }
      if (rec === 'elementos') { const l = autoria(c, await elementos(q)); return json(200, { total: l.length, elementos: l.map(({ geometria: _g, ...e }) => e) }); }
      if (rec === 'exportar.csv') return resposta(csv(autoria(c, await elementos(q)), pode(c, 'admin')), 200, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="elementos.csv"' });
      if (rec === 'exportar.geojson') { const fc = { type: 'FeatureCollection', features: autoria(c, await elementos(q)).map(({ geometria: g, ...e }) => ({ type: 'Feature', geometry: g, properties: e })) }; return resposta(JSON.stringify(fc), 200, 'application/geo+json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="elementos.geojson"' }); }
      return json(404, { erro: 'Não encontrado' });
    } catch (err) { return json(err.codigo || 500, { erro: err.codigo ? err.message : 'Erro interno' }); }
  }
  return { dadosApresentacao, tratar };
}
