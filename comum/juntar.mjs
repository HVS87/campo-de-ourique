// Juntar o que dois dispositivos guardaram ao mesmo tempo, sem perder o trabalho de nenhum. Usado pelo servidor central,
// pelo servidor local (aplicação de computador) e pela página, que calcula a «base»: o que o dispositivo recebeu antes de
// mexer, em impressões curtas de cada campo de cada elemento.
//   baseDe(dados)                         → a base a enviar com o preset
//   juntarTresVias(noServidor, recebido, base) → { dados, conflitos, juntou }
//   juntarEventos(antes, d, { admin })    → junta os pontos dos conjuntos pelo id de cada registo (depois da junção a três vias)
//   juntarVarrimento(a, b)                → as ruas já percorridas de um evento: por rua, fica a marcação mais recente
//   aplicarPublico(dados, evento, pedido) → um registo (ou uma rua percorrida) de um membro do público, validado
//   limparAbrangencia(a) · abrangeFreguesia(evento, f) · naAbrangencia(evento, f, pos) → onde decorre um evento (freguesias e, nelas, zonas)
// Regras, campo a campo: o que só um lado mudou, fica; o que os dois mudaram para o mesmo, fica; o que os dois mudaram de
// maneira diferente fica como o recebido, e conta como conflito (a outra versão continua nas revisões do servidor). As
// fotos juntam-se foto a foto. Um elemento que um lado apagou e o outro mudou fica. Sem base (um dispositivo antigo, ou o
// primeiro envio), nada se apaga: junta-se tudo o que há dos dois lados.

const ESPECIAIS = new Set(['id', 'filhos', 'pontos', 'detalhes', 'fotos']); // tratados à parte
const TOPO_FORA = new Set(['elementos', 'categorias', 'removidosEvento', 'conjuntosApagados', 'duplicadosMantidos', 'varrimento', 'preset', 'freguesia']);

function canonico(v) { // JSON com as chaves por ordem: o mesmo conteúdo dá sempre o mesmo texto
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
}
export function impressao(v) { // FNV-1a de 32 bits sobre o texto canónico, mais o comprimento
  const s = canonico(v); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + s.length.toString(36);
}
export const iguais = (a, b) => canonico(a) === canonico(b); // o mesmo conteúdo, seja qual for a ordem das chaves
const VAZIO = impressao(undefined);
const srcDe = f => typeof f === 'string' ? f : f && f.src;
const fotoH = f => impressao(srcDe(f));
function achatar(elementos) { // as zonas têm pontos lá dentro: cada um conta como um elemento, com a zona como «pai»
  const m = new Map(), ordem = [];
  (function rec(l, pai) { for (const e of l || []) { if (!e || !e.id) continue; m.set(e.id, { e, pai: pai || '' }); ordem.push(e.id); rec(e.filhos, e.id); } })(elementos, '');
  return { m, ordem };
}
const registosH = e => Array.isArray(e.detalhes) ? impressao(e.detalhes.map((x, i) => [x && x.i, x && x.editado, x && x.movido, e.pontos && e.pontos[i]])) : undefined;
function assinatura(x) {
  const campos = {}; for (const k of Object.keys(x.e)) if (!ESPECIAIS.has(k) && x.e[k] !== undefined) campos[k] = impressao(x.e[k]);
  return { campos, pai: x.pai, fotos: (x.e.fotos || []).map(fotoH), registos: registosH(x.e) };
}
export function baseDe(dados) {
  const elementos = {}; for (const [id, x] of achatar(dados && dados.elementos).m) elementos[id] = assinatura(x);
  const topo = {}; for (const k of Object.keys(dados || {})) if (!TOPO_FORA.has(k) && dados[k] !== undefined) topo[k] = impressao(dados[k]);
  return { v: 1, topo, elementos, categorias: ((dados && dados.categorias) || []).map(c => ({ ...c, membros: [...(c.membros || [])] })) };
}
function mudou(x, b) { // este lado mexeu no elemento desde a base?
  const a = assinatura(x);
  if (a.pai !== b.pai || a.registos !== b.registos || a.fotos.join() !== (b.fotos || []).join()) return true;
  for (const k of new Set([...Object.keys(a.campos), ...Object.keys(b.campos || {})])) if ((a.campos[k] || VAZIO) !== ((b.campos || {})[k] || VAZIO)) return true;
  return false;
}
const escolher = (mv, tv, hb, conflito) => { // um campo: mv do recebido, tv do servidor, hb a impressão na base
  const hm = impressao(mv), ht = impressao(tv);
  if (hm === ht) return mv;
  if (hb != null && hm === hb) return tv; // só o servidor mudou
  if (hb != null && ht === hb) return mv; // só o recebido mudou
  conflito(); return mv;
};
function juntarElemento(m, t, b, conflitos) {
  const nome = m.e.nome || m.e.id, e = {}, bc = b ? b.campos || {} : null;
  for (const k of new Set([...Object.keys(m.e), ...Object.keys(t.e)])) {
    if (ESPECIAIS.has(k)) continue;
    if (k === 'linhas' && [m.e, t.e].some(x => x.rua || x.quarteiroes || x.tracado)) { if (m.e.linhas !== undefined) e.linhas = m.e.linhas; continue; } // derivado (de ruas.js ou dos quarteirões): vale o de quem guarda; à mão, junta-se como o resto
    const v = escolher(m.e[k], t.e[k], bc ? bc[k] || VAZIO : null, () => conflitos.push({ nome, campo: k }));
    if (v !== undefined) e[k] = v;
  }
  e.id = m.e.id;
  const pai = escolher(m.pai, t.pai, b ? b.pai : null, () => conflitos.push({ nome, campo: 'zona' }));
  if (m.e.fotos || t.e.fotos) { // foto a foto: as do recebido (sem as que o servidor tirou) e as novas do servidor
    const mf = m.e.fotos || [], tf = t.e.fotos || [], bf = new Set(b ? b.fotos || [] : []), tH = new Set(tf.map(fotoH)), mH = new Set(mf.map(fotoH));
    e.fotos = [...mf.filter(f => !(bf.has(fotoH(f)) && !tH.has(fotoH(f)))), ...tf.filter(f => !bf.has(fotoH(f)) && !mH.has(fotoH(f)))];
  }
  const fonte = Array.isArray(m.e.detalhes) || m.e.pontos ? m.e : t.e; // os pontos dos conjuntos junta-os juntarEventos
  if (fonte.pontos) e.pontos = fonte.pontos; if (fonte.detalhes) e.detalhes = fonte.detalhes;
  return { e, pai };
}
function juntarCategorias(mc, tc, bc, conflitos) {
  const M = new Map((mc || []).map(c => [c.id, c])), T = new Map((tc || []).map(c => [c.id, c])), B = bc ? new Map(bc.map(c => [c.id, c])) : null, out = [];
  for (const id of [...M.keys(), ...[...T.keys()].filter(k => !M.has(k))]) {
    const m = M.get(id), t = T.get(id), b = B && B.get(id), nome = (m || t).nome;
    if (m && t) {
      const c = { id };
      for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) { if (k === 'id' || k === 'membros') continue; const v = escolher(m[k], t[k], B ? impressao(b ? b[k] : undefined) : null, () => conflitos.push({ nome, campo: k })); if (v !== undefined) c[k] = v; }
      const bm = new Set(b ? b.membros || [] : []), tm = new Set(t.membros || []), mm = new Set(m.membros || []);
      c.membros = [...(m.membros || []).filter(x => !(bm.has(x) && !tm.has(x))), ...(t.membros || []).filter(x => !bm.has(x) && !mm.has(x))];
      out.push(c);
    } else if (m) { if (!B || !b || canonico(m) !== canonico(b)) out.push(m); } // o servidor apagou-a: só fica se este lado a mudou
    else if (!B || !b || canonico(t) !== canonico(b)) out.push(t); // este lado apagou-a: só fica se o servidor a mudou
  }
  return out;
}
export function juntarTresVias(noServidor, recebido, base) {
  const conflitos = [];
  if (!noServidor || !Array.isArray(noServidor.elementos)) return { dados: recebido, conflitos, juntou: false };
  const temBase = !!(base && base.v === 1), B = temBase ? base.elementos || {} : {};
  const M = achatar(recebido.elementos), T = achatar(noServidor.elementos), res = new Map();
  for (const id of new Set([...M.ordem, ...T.ordem])) {
    const m = M.m.get(id), t = T.m.get(id), b = B[id];
    if (m && t) res.set(id, juntarElemento(m, t, b, conflitos));
    else if (m) { if (!temBase || !b) res.set(id, m); else if (mudou(m, b)) { res.set(id, m); conflitos.push({ nome: m.e.nome || id, campo: 'apagado noutro dispositivo' }); } }
    else if (!temBase || !b) res.set(id, t); // novo noutro dispositivo (ou sem base: nada se apaga)
    else if (mudou(t, b)) { res.set(id, t); conflitos.push({ nome: t.e.nome || id, campo: 'apagado aqui, mudado noutro dispositivo' }); }
  }
  // a ordem é a do recebido; o que só o servidor tinha vai a seguir ao elemento que lá o antecedia
  const ordem = M.ordem.filter(id => res.has(id));
  T.ordem.forEach((id, i) => { if (!res.has(id) || ordem.includes(id)) return; const antes = T.ordem.slice(0, i).reverse().find(x => ordem.includes(x)); ordem.splice(antes ? ordem.indexOf(antes) + 1 : ordem.length, 0, id); });
  const nos = new Map(), topo = [];
  for (const id of ordem) { const { e } = res.get(id), n = { ...e }; delete n.filhos; if (n.tipo === 'zona') n.filhos = []; nos.set(id, n); }
  for (const id of ordem) { const pai = res.get(id).pai, n = nos.get(id), z = pai && nos.get(pai); if (z && Array.isArray(z.filhos)) z.filhos.push(n); else topo.push(n); } // sem a zona, o ponto fica solto: não se perde
  const dados = { ...recebido, elementos: topo };
  for (const k of new Set([...Object.keys(recebido), ...Object.keys(noServidor)])) {
    if (TOPO_FORA.has(k)) continue;
    const v = escolher(recebido[k], noServidor[k], temBase ? (base.topo || {})[k] || VAZIO : null, () => conflitos.push({ nome: k, campo: k }));
    if (v === undefined) delete dados[k]; else dados[k] = v;
  }
  const cats = juntarCategorias(recebido.categorias, noServidor.categorias, temBase ? base.categorias || [] : null, conflitos);
  if (cats.length) dados.categorias = cats; else delete dados.categorias;
  const dup = [...new Set([...(recebido.duplicadosMantidos || []), ...(noServidor.duplicadosMantidos || [])])]; if (dup.length) dados.duplicadosMantidos = dup;
  const varr = juntarVarrimento(recebido.varrimento, noServidor.varrimento); if (varr) dados.varrimento = varr; else delete dados.varrimento;
  if (canonico(dados) === canonico(recebido)) return { dados: recebido, conflitos, juntou: false }; // nada a juntar: fica tal como veio
  return { dados, conflitos, juntou: true };
}

// Pontos dos conjuntos: cada envio leva o preset inteiro do dispositivo que o fez, por isso os registos juntam-se aos que
// já cá estão (duas equipas com a mesma conta não apagam os registos uma da outra). Cada registo tem um id («i»); um
// registo tirado fica em dados.removidosEvento = { <evento>: [ids] } e não volta. Ordem por data, para o mesmo conteúdo dar o mesmo texto.
// O conjunto de um evento pode ficar sem pontos, e só a administração o apaga: apagado, fica em dados.conjuntosApagados e um
// dispositivo atrasado não o traz de volta, a não ser com um registo novo.
export function juntarEventos(antes, d, { admin = false } = {}) {
  if (!antes) return;
  const removidos = {};
  for (const fonte of [antes.removidosEvento, d.removidosEvento]) for (const [ev, ids] of Object.entries(fonte || {})) removidos[ev] = [...new Set([...(removidos[ev] || []), ...(Array.isArray(ids) ? ids : [])])];
  if (Object.keys(removidos).length) d.removidosEvento = removidos;
  const apagados = [...new Set([...((antes && antes.conjuntosApagados) || []), ...(admin && Array.isArray(d.conjuntosApagados) ? d.conjuntosApagados : [])])]; // só a administração acrescenta
  if (apagados.length) d.conjuntosApagados = apagados; else delete d.conjuntosApagados;
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
    if (!lista.length) {
      const doEvento = (g || a).evento;
      if (doEvento && g && !apagados.includes(ev)) { g.pontos = []; g.detalhes = []; continue; } // fica, vazio, à espera dos próximos registos
      if (g) d.elementos.splice(d.elementos.indexOf(g), 1);
      if (doEvento && !g && !admin && !apagados.includes(ev)) d.elementos.push({ ...a, pontos: [], detalhes: [] }); // quem não é da administração não o apaga
      continue;
    }
    const alvo = g || { ...a }; alvo.pontos = lista.map(l => l.p); alvo.detalhes = lista.map(l => l.x); if (!g) d.elementos.push(alvo);
  }
}

// O varrimento: { <evento>: { <rua>: { e: 1 percorrida | 0 por percorrer, q: quando, a: autor } } }. Marca-se rua a rua, em
// vários dispositivos ao mesmo tempo: nada se perde, e a marcação mais recente de cada rua é a que vale.
export function juntarVarrimento(a, b) {
  const out = {};
  for (const x of [a, b]) for (const [ev, ruas] of Object.entries(x || {})) {
    const o = out[ev] = out[ev] || {};
    for (const [r, v] of Object.entries(ruas || {})) if (v && typeof v === 'object' && (!o[r] || String(v.q || '') > String(o[r].q || ''))) o[r] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// Um membro do público, sem conta, só pode acrescentar um registo ao conjunto do evento (ou marcar uma rua): nunca apaga nem
// muda o que outros fizeram. O servidor valida tudo, porque o pedido não vem de ninguém conhecido. Devolve o erro, ou null.
export const AUTOR_PUBLICO = 'Membro do público';
// A abrangência de um evento: { freguesias: [ids], zonas?: { [freguesia]: [{ id, nome, poligono: [[lat, lng], …] }] } }.
// Sem ela, o evento é de toda a cidade. Numa freguesia com zonas, só contam os registos dentro de uma delas.
const ID_FREGUESIA = /^[a-z0-9][a-z0-9-]{0,60}$/;
export function limparAbrangencia(a) {
  if (!a || !Array.isArray(a.freguesias)) return null;
  const freguesias = [...new Set(a.freguesias.filter(f => typeof f === 'string' && ID_FREGUESIA.test(f)))].slice(0, 60);
  if (!freguesias.length) return null;
  const zonas = {};
  for (const f of freguesias) {
    const l = a.zonas && Array.isArray(a.zonas[f]) ? a.zonas[f] : [];
    const z = l.slice(0, 40).map(x => ({ id: texto(x && x.id, 61), nome: texto(x && x.nome, 80), poligono: (Array.isArray(x && x.poligono) ? x.poligono : []).slice(0, 2000).map(p => Array.isArray(p) ? [+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)] : [NaN, NaN]) }))
      .filter(x => x.id && x.poligono.length >= 3 && x.poligono.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
    if (z.length) zonas[f] = z;
  }
  return { freguesias, ...(Object.keys(zonas).length ? { zonas } : {}) };
}
export const abrangeFreguesia = (ev, f) => { const a = ev && ev.abrangencia; return !a || !Array.isArray(a.freguesias) || !a.freguesias.length || a.freguesias.includes(f); };
function dentroPoligono(pos, poligono) { // contagem de cruzamentos de um raio com o contorno; pos e vértices em [lat, lng]
  let d = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) { const a = poligono[i], b = poligono[j]; if ((a[1] > pos[1]) !== (b[1] > pos[1]) && pos[0] < (b[0] - a[0]) * (pos[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d; }
  return d;
}
export function naAbrangencia(ev, f, pos) {
  if (!abrangeFreguesia(ev, f)) return false;
  const z = ev && ev.abrangencia && ev.abrangencia.zonas && ev.abrangencia.zonas[f];
  return !Array.isArray(z) || !z.length || z.some(x => dentroPoligono(pos, x.poligono));
}
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
export function aplicarPublico(dados, ev, pedido, agora = new Date()) {
  if (!ev || !ev.publico) return 'Este evento não aceita registos sem conta';
  if (!dados || !Array.isArray(dados.elementos)) return 'Preset inválido';
  if (pedido.freguesia && !abrangeFreguesia(ev, pedido.freguesia)) return 'Este evento não decorre nesta freguesia';
  if (pedido.tipo === 'varrimento') {
    if (!ev.varrimento) return 'Este evento não tem varrimento das ruas';
    const rua = texto(pedido.rua, 120); if (!rua) return 'Falta a rua';
    const v = dados.varrimento = dados.varrimento || {}, r = v[ev.id] = v[ev.id] || {};
    r[rua] = { e: pedido.estado ? 1 : 0, q: agora.toISOString(), a: AUTOR_PUBLICO };
    return null;
  }
  if (pedido.tipo !== 'registo') return 'Pedido inválido';
  const x = pedido.registo || {}, pos = Array.isArray(x.pos) ? x.pos.map(Number) : [];
  if (pos.length !== 2 || !(pos[0] > 38.6 && pos[0] < 38.85 && pos[1] > -9.25 && pos[1] < -9.05)) return 'A localização fica fora de Lisboa';
  if (pedido.freguesia && !naAbrangencia(ev, pedido.freguesia, pos)) return 'A localização fica fora das zonas do evento';
  const tipos = Array.isArray(ev.categorias) ? ev.categorias.map(c => c.id) : [];
  if (tipos.length && !tipos.includes(x.c)) return 'Tipo de registo inválido';
  const fotos = (Array.isArray(x.fotos) ? x.fotos : []).slice(0, 3).map(f => texto(f && f.src, 2500000)).filter(s => /^data:image\/(jpeg|png|webp);base64,/.test(s)).map(src => ({ src, legenda: '' }));
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  const d = { i: [...b].map(n => n.toString(16).padStart(2, '0')).join(''), ...(tipos.length ? { c: x.c } : {}), rua: texto(x.rua, 120), numero: texto(x.numero, 20), texto: texto(x.texto, 2000), fotos, quando: agora.toISOString(), autor: AUTOR_PUBLICO, publico: true, moradaManual: true };
  if (!d.rua) return 'Falta a rua';
  if (Number.isFinite(+x.precisao)) d.precisao = Math.round(+x.precisao);
  let g = dados.elementos.find(e => e && e.tipo === 'grupo' && e.evento === ev.id);
  if (!g) { const c = pedido.conjunto || {}; g = { id: /^[a-z0-9][a-z0-9-]{0,60}$/.test(c.id || '') ? c.id : 'evento-' + ev.id, tipo: 'grupo', nome: texto(c.nome, 80) || ev.nome, icone: texto(c.icone, 8) || ev.icone || '📍', texto: '', fotos: [], evento: ev.id, pontos: [], detalhes: [] }; dados.elementos.push(g); }
  if (!Array.isArray(g.pontos)) g.pontos = []; if (!Array.isArray(g.detalhes)) g.detalhes = [];
  while (g.detalhes.length < g.pontos.length) g.detalhes.push({});
  g.pontos.push([+pos[0].toFixed(6), +pos[1].toFixed(6)]); g.detalhes.push(d);
  return null;
}
