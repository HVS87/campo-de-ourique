// Vai buscar ao OpenStreetMap (Overpass) todas as ruas com nome da freguesia de Campo de Ourique,
// recorta-as ao limite da freguesia, junta os troços com o mesmo nome em cadeias contínuas
// e escreve dados/ruas.js (window.RUAS_OSM). Correr com: node tools/ruas-osm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELACAO = 6427490; // relação OSM da freguesia
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'dados/campo-de-ourique.geojson'), 'utf8'));
const feat = geo.type === 'FeatureCollection' ? geo.features[0] : geo;
const anel = (feat.geometry.type === 'Polygon' ? feat.geometry.coordinates[0] : feat.geometry.coordinates[0][0]).map(([lon, lat]) => [lat, lon]);

const TIPOS = ['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link'];
const query = `[out:json][timeout:60];
area(${3600000000 + RELACAO})->.a;
way(area.a)[highway~"^(${TIPOS.join('|')})$"][name];
out geom;`;

const r = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'campo-de-ourique-apresentacao/1.0 (uso pessoal)', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(query),
});
if (!r.ok) throw new Error('Overpass: ' + r.status + ' ' + (await r.text()).slice(0, 300));
const json = await r.json();
console.log('vias recebidas:', json.elements.length);

// ---- geometria ----
function dentro(p, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
function intersecoes(a, b, pol) { // parâmetros t em [0,1] onde o segmento a→b cruza o polígono
  const ts = [];
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const c = pol[i], d = pol[j];
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-15) continue;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function recortar(pts, pol) { // devolve lista de troços (listas de pontos) dentro do polígono
  const saida = []; let atual = [];
  const fechar = () => { if (atual.length >= 2) saida.push(atual); atual = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const cortes = [0, ...intersecoes(a, b, pol), 1];
    for (let k = 0; k < cortes.length - 1; k++) {
      const p = lerp(a, b, cortes[k]), q = lerp(a, b, cortes[k + 1]);
      if (dentro(lerp(p, q, .5), pol)) { if (!atual.length) atual.push(p); atual.push(q); }
      else fechar();
    }
  }
  fechar();
  return saida;
}
const arred = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
const chave = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);

// ---- recorte e agrupamento por nome ----
const porNome = new Map();
for (const w of json.elements) {
  if (w.type !== 'way' || !w.geometry) continue;
  const pts = w.geometry.map(g => [g.lat, g.lon]);
  for (const t of recortar(pts, anel)) {
    const nome = w.tags.name.trim();
    if (!porNome.has(nome)) porNome.set(nome, { nome, tipo: w.tags.highway, trocos: [] });
    porNome.get(nome).trocos.push(t.map(arred));
  }
}

// junta troços cujas pontas coincidem, em cadeias contínuas (para o nome correr ao longo da rua)
function encadear(trocos) {
  let lista = trocos.map(t => t.slice());
  let mudou = true;
  while (mudou) {
    mudou = false;
    outer: for (let i = 0; i < lista.length; i++) for (let j = 0; j < lista.length; j++) {
      if (i === j) continue;
      const A = lista[i], B = lista[j];
      let novo = null;
      if (chave(A[A.length - 1]) === chave(B[0])) novo = A.concat(B.slice(1));
      else if (chave(B[B.length - 1]) === chave(A[0])) novo = B.concat(A.slice(1));
      else if (chave(A[A.length - 1]) === chave(B[B.length - 1])) novo = A.concat(B.slice(0, -1).reverse());
      else if (chave(A[0]) === chave(B[0])) novo = A.slice().reverse().concat(B.slice(1));
      if (novo) { lista = lista.filter((_, k) => k !== i && k !== j); lista.push(novo); mudou = true; break outer; }
    }
  }
  return lista;
}
function comprimento(t) { let s = 0; for (let i = 1; i < t.length; i++) s += Math.hypot((t[i][0] - t[i - 1][0]) * 111320, (t[i][1] - t[i - 1][1]) * 111320 * Math.cos(t[i][0] * Math.PI / 180)); return s; }

const ruas = [];
for (const r of porNome.values()) {
  const cadeias = encadear(r.trocos).sort((a, b) => comprimento(b) - comprimento(a));
  const metros = Math.round(cadeias.reduce((s, c) => s + comprimento(c), 0));
  if (metros < 15) continue; // restos ínfimos de ruas que só tocam o limite
  ruas.push({ nome: r.nome, tipo: r.tipo, metros, trocos: cadeias });
}
ruas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
console.log('ruas:', ruas.length, '· troços:', ruas.reduce((s, r) => s + r.trocos.length, 0));

const saida = '// Ruas da freguesia de Campo de Ourique: dados © OpenStreetMap (ODbL), via Overpass, recortados ao limite.\n' +
  '// Gerado por tools/ruas-osm.mjs em ' + new Date().toISOString().slice(0, 10) + '. Coordenadas [lat, lon].\n' +
  'window.RUAS_OSM = ' + JSON.stringify(ruas) + ';\n';
fs.writeFileSync(path.join(ROOT, 'dados/ruas.js'), saida);
console.log('escrito dados/ruas.js (' + (saida.length / 1024).toFixed(0) + ' kB)');
