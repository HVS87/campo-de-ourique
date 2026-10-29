// Vai buscar ao serviço oficial da Câmara Municipal de Lisboa (geodados, ArcGIS Online) os polígonos do
// edificado da freguesia de Campo de Ourique, com morada e números de polícia, e escreve dados/edificado.js.
// Fonte: «Edificado e Vias», camada 0 (cartografia digital de Lisboa à escala 1/1000). Correr com: node tools/edificado-cml.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICO = 'https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/Edificado_e_Vias/FeatureServer/0/query';
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'dados/campo-de-ourique.geojson'), 'utf8'));
const feat = geo.type === 'FeatureCollection' ? geo.features[0] : geo;
const anelLonLat = feat.geometry.type === 'Polygon' ? feat.geometry.coordinates[0] : feat.geometry.coordinates[0][0];
const anel = anelLonLat.map(([lon, lat]) => [lat, lon]);

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
function pontoRotulo(pts) { // centróide, ou o vértice mais próximo se o centróide cair fora do polígono
  const c = centroide(pts); if (dentro(c, pts)) return c;
  let m = pts[0], md = Infinity; for (const p of pts) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < md) { md = d; m = p; } }
  return m;
}

// pede todas as páginas (2000 por pedido) dos edifícios que intersetam o polígono da freguesia
const geometria = JSON.stringify({ rings: [anelLonLat], spatialReference: { wkid: 4326 } });
const todos = [];
for (let offset = 0; ; offset += 2000) {
  const params = new URLSearchParams({ where: '1=1', geometry: geometria, geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'COD_SIG,IDTIPO,NPRINCIP,MORADA', outSR: '4326', f: 'geojson', resultOffset: String(offset), resultRecordCount: '2000' });
  const r = await fetch(SERVICO, { method: 'POST', body: params, headers: { 'User-Agent': 'campo-de-ourique-apresentacao/1.0 (uso pessoal)' } });
  if (!r.ok) throw new Error('ArcGIS: ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  if (j.error) throw new Error('ArcGIS: ' + JSON.stringify(j.error).slice(0, 300));
  todos.push(...j.features);
  console.log('página', offset / 2000 + 1, '·', j.features.length, 'edifícios');
  if (!j.properties || !j.properties.exceededTransferLimit) break;
}

const lotes = [], numeros = [];
for (const f of todos) {
  const aneis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]);
  const pr = f.properties || {};
  const morada = (pr.MORADA || '').trim();
  for (const anelLL of aneis) {
    let pts = anelLL.map(([lon, lat]) => [lat, lon]);
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    const c = pontoRotulo(pts);
    if (!dentro(c, anel)) continue; // só edifícios cuja maior parte está dentro da freguesia
    lotes.push({ p: pts.map(arred), m: morada, c: pr.COD_SIG || '' });
    // número de polícia: o que vem a seguir à primeira vírgula, ignorando parêntesis
    // («Rua Coelho da Rocha, 100-100A» → «100-100A»; «Rua do Sol ao Rato, 15A (Vila Operária, 7-17)» → «15A»)
    const semPar = morada.replace(/\s*\(.*\)\s*$/, '');
    const k = semPar.indexOf(',');
    const num = k >= 0 ? semPar.slice(k + 1).replace(/\s*\(.*$/, '').trim() : '';
    if (num && /\d/.test(num)) numeros.push([...arred(c), num, semPar.slice(0, k).trim()]);
  }
}
console.log('edifícios dentro da freguesia:', lotes.length, '· com número de polícia:', numeros.length);

const saida = '// Edificado da freguesia de Campo de Ourique: dados © Câmara Municipal de Lisboa (geodados, serviço «Edificado e Vias»,\n' +
  '// cartografia digital à escala 1/1000). Gerado por tools/edificado-cml.mjs em ' + new Date().toISOString().slice(0, 10) + '.\n' +
  '// lotes: { p: contorno [[lat, lon], ...], m: morada, c: código SIG }; numeros: [lat, lon, "número", "rua"].\n' +
  'window.EDIFICADO = ' + JSON.stringify({ fonte: 'Câmara Municipal de Lisboa', lotes, numeros }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'dados/edificado.js'), saida);
console.log('escrito dados/edificado.js (' + (saida.length / 1024).toFixed(0) + ' kB)');
