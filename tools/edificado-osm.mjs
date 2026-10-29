// Vai buscar ao OpenStreetMap (Overpass) os números de polícia e os contornos do edificado da freguesia
// de Campo de Ourique e escreve dados/edificado-osm.js (window.EDIFICADO_OSM), alternativa aos dados oficiais da CML. Correr com: node tools/edificado-osm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELACAO = 6427490;
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'dados/campo-de-ourique.geojson'), 'utf8'));
const feat = geo.type === 'FeatureCollection' ? geo.features[0] : geo;
const anel = (feat.geometry.type === 'Polygon' ? feat.geometry.coordinates[0] : feat.geometry.coordinates[0][0]).map(([lon, lat]) => [lat, lon]);

const query = `[out:json][timeout:90];
area(${3600000000 + RELACAO})->.a;
(
  way(area.a)["building"];
  relation(area.a)["building"];
  node(area.a)["addr:housenumber"];
  way(area.a)["addr:housenumber"];
);
out body geom;`;

// vários servidores Overpass e repetição com espera crescente, porque o principal está muitas vezes cheio
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  let espera = 5000, erro;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const url = SERVIDORES[tentativa % SERVIDORES.length];
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120000),
        headers: { 'User-Agent': 'campo-de-ourique-apresentacao/1.0 (uso pessoal)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query) });
      if (r.ok) return await r.json();
      erro = new Error(url + ': ' + r.status + ' ' + (await r.text()).slice(0, 120).replace(/s+/g, ' '));
    } catch (e) { erro = e; }
    console.warn('tentativa', tentativa + 1, 'falhou:', erro.message, '· nova tentativa em', espera / 1000, 's');
    await new Promise(res => setTimeout(res, espera)); espera *= 2;
  }
  throw erro;
}
const json = await overpass(query);
console.log('elementos recebidos:', json.elements.length);

function dentro(p, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
const arred = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
function centroide(pts) { let a = 0, b = 0; for (const p of pts) { a += p[0]; b += p[1]; } return [a / pts.length, b / pts.length]; }
// ponto representativo do polígono para o rótulo: centróide, ou o vértice mais próximo se o centróide cair fora
function pontoRotulo(pts) {
  const c = centroide(pts); if (dentro(c, pts)) return c;
  let m = pts[0], md = Infinity; for (const p of pts) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < md) { md = d; m = p; } }
  return m;
}

const lotes = [], numeros = [];
const vistos = new Set();
for (const e of json.elements) {
  if (e.type === 'way' && e.geometry && e.geometry.length >= 4) {
    const pts = e.geometry.map(g => [g.lat, g.lon]);
    const fechado = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    if (e.tags && e.tags.building && fechado) {
      const anelPts = pts.slice(0, -1);
      if (dentro(centroide(anelPts), anel) || anelPts.some(p => dentro(p, anel))) lotes.push(anelPts.map(arred));
    }
    if (e.tags && e.tags['addr:housenumber'] && fechado) {
      const p = pontoRotulo(pts.slice(0, -1));
      const k = e.tags['addr:housenumber'] + '@' + p.map(x => x.toFixed(5)).join(',');
      if (dentro(p, anel) && !vistos.has(k)) { vistos.add(k); numeros.push([...arred(p), e.tags['addr:housenumber'], e.tags['addr:street'] || '']); }
    }
  } else if (e.type === 'relation' && e.tags && e.tags.building && e.members) {
    for (const m of e.members) if (m.role === 'outer' && m.geometry && m.geometry.length >= 4) {
      const pts = m.geometry.map(g => [g.lat, g.lon]).slice(0, -1);
      if (dentro(centroide(pts), anel) || pts.some(p => dentro(p, anel))) lotes.push(pts.map(arred));
    }
  } else if (e.type === 'node' && e.tags && e.tags['addr:housenumber']) {
    const p = [e.lat, e.lon];
    const k = e.tags['addr:housenumber'] + '@' + p.map(x => x.toFixed(5)).join(',');
    if (dentro(p, anel) && !vistos.has(k)) { vistos.add(k); numeros.push([...arred(p), e.tags['addr:housenumber'], e.tags['addr:street'] || '']); }
  }
}
console.log('edifícios:', lotes.length, '· números de polícia:', numeros.length);

const saida = '// Edificado e números de polícia da freguesia de Campo de Ourique: dados © OpenStreetMap (ODbL), via Overpass.\n' +
  '// Gerado por tools/edificado-osm.mjs em ' + new Date().toISOString().slice(0, 10) + '.\n' +
  '// lotes: contornos dos edifícios [[lat, lon], ...]; numeros: [lat, lon, "número", "rua"].\n' +
  'window.EDIFICADO_OSM = ' + JSON.stringify({ fonte: 'OpenStreetMap', lotes: lotes.map(p => ({ p, m: '', c: '' })), numeros }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'dados/edificado-osm.js'), saida);
console.log('escrito dados/edificado-osm.js (' + (saida.length / 1024).toFixed(0) + ' kB)');
