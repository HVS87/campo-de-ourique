// Gera os dados de cada freguesia de Lisboa a partir dos serviços abertos da Câmara Municipal de Lisboa (ArcGIS Online)
// e da DGT, no mesmo formato que os de Campo de Ourique, e escreve dados/freguesias/index.js (lista para o seletor).
//
//   node tools/freguesias.mjs                 → todas as freguesias (exceto os dados base de Campo de Ourique)
//   node tools/freguesias.mjs ajuda belem     → só estas
//   node tools/freguesias.mjs --sem-imagem    → não descarrega as imagens de satélite de reserva
//   node tools/freguesias.mjs --so-limites    → só a lista das freguesias e os limites do mapa geral (dados/freguesias/limites.js)
//
// Por freguesia, em dados/freguesias/<id>/: geo.js (limite e imagem de reserva), ruas.js (vias da CML recortadas
// ao limite), edificado.js (lotes e números de polícia), verdes.js (espaços verdes e hortas urbanas), satelite.jpg,
// e, só se ainda não existirem, presets/<id>.js, presets/index.js e conteudos.js (preset vazio, pronto a encher).
// Campo de Ourique mantém os dados próprios em dados/ (limite e ruas do OpenStreetMap); recebe só dados/verdes.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CML = 'https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services';
const DGT = 'https://ortos.dgterritorio.gov.pt/wms/ortosat2023';
const UA = { 'User-Agent': 'campo-de-ourique-apresentacao/1.0 (uso pessoal)' };
const args = process.argv.slice(2), semImagem = args.includes('--sem-imagem'), so = args.filter(a => !a.startsWith('--'));
const CO = 'campo-de-ourique';
const IMG_MAX = 3072;

// ---------- utilitários ----------
const espera = ms => new Promise(r => setTimeout(r, ms));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const arred = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
const m = p => [p[1] * 86900, p[0] * 111320]; // metros aproximados em Lisboa
const dist = (a, b) => Math.hypot(m(a)[0] - m(b)[0], m(a)[1] - m(b)[1]);
function dentroAnel(p, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
const dentro = (p, aneis) => aneis.reduce((d, a) => dentroAnel(p, a) ? !d : d, false); // vários anéis: par-ímpar
const centroide = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
function pontoRotulo(pts, aneis) { const c = centroide(pts); if (dentroAnel(c, pts)) return c; let best = pts[0], bd = Infinity; for (const p of pts) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } } return best; }
function simplificar(pts, tol) { // Douglas-Peucker, tolerância em metros
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop(); const A = m(pts[a]), B = m(pts[b]); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const P = m(pts[i]); const dx = B[0] - A[0], dy = B[1] - A[1]; const L2 = dx * dx + dy * dy || 1e-9; let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; pilha.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + m(p)[0] * m(q)[1] - m(q)[0] * m(p)[1]; }, 0) / 2);

async function consulta(camada, params, rotulo) { // ArcGIS FeatureServer/query em GeoJSON, com páginas e repetição
  const todos = [];
  for (let offset = 0; ; offset += 2000) {
    const corpo = new URLSearchParams({ where: '1=1', outSR: '4326', f: 'geojson', resultOffset: String(offset), resultRecordCount: '2000', ...params });
    let j = null, erro;
    for (let t = 0; t < 5 && !j; t++) {
      try { const r = await fetch(`${CML}/${camada}/query`, { method: 'POST', body: corpo, headers: UA, signal: AbortSignal.timeout(120000) }); const x = await r.json(); if (x.error) throw new Error(JSON.stringify(x.error).slice(0, 200)); j = x; }
      catch (e) { erro = e; await espera(3000 * (t + 1)); }
    }
    if (!j) throw new Error((rotulo || camada) + ': ' + erro.message);
    todos.push(...j.features);
    if (!(j.properties && j.properties.exceededTransferLimit) && !(j.exceededTransferLimit)) break;
  }
  return todos;
}
const envelope = bb => ({ geometry: `${bb[0][1]},${bb[0][0]},${bb[1][1]},${bb[1][0]}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
const aneisDe = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const ll = c => c.map(([lon, lat]) => [lat, lon]);
const fechar = pts => (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) ? pts.slice(0, -1) : pts;

// ---------- ruas: recorte ao limite e encadeamento (como tools/ruas-osm.mjs) ----------
function intersecoes(a, b, pol) {
  const ts = [];
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const c = pol[i], d = pol[j];
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-15) continue;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function recortar(pts, aneis) {
  const saida = []; let atual = [];
  const fecharT = () => { if (atual.length >= 2) saida.push(atual); atual = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const cortes = [0, ...aneis.flatMap(an => intersecoes(a, b, an)), 1].sort((x, y) => x - y);
    for (let k = 0; k < cortes.length - 1; k++) {
      const p = lerp(a, b, cortes[k]), q = lerp(a, b, cortes[k + 1]);
      if (dentro(lerp(p, q, .5), aneis)) { if (!atual.length) atual.push(p); atual.push(q); } else fecharT();
    }
  }
  fecharT();
  return saida;
}
const chave = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);
function encadear(trocos) {
  let lista = trocos.map(t => t.slice()), mudou = true;
  while (mudou) {
    mudou = false;
    fora: for (let i = 0; i < lista.length; i++) for (let j = 0; j < lista.length; j++) {
      if (i === j) continue; const A = lista[i], B = lista[j]; let novo = null;
      if (chave(A[A.length - 1]) === chave(B[0])) novo = A.concat(B.slice(1));
      else if (chave(B[B.length - 1]) === chave(A[0])) novo = B.concat(A.slice(1));
      else if (chave(A[A.length - 1]) === chave(B[B.length - 1])) novo = A.concat(B.slice(0, -1).reverse());
      else if (chave(A[0]) === chave(B[0])) novo = A.slice().reverse().concat(B.slice(1));
      if (novo) { lista = lista.filter((_, k) => k !== i && k !== j); lista.push(novo); mudou = true; break fora; }
    }
  }
  return lista;
}
const comprimento = t => t.slice(1).reduce((s, p, i) => s + dist(t[i], p), 0);

// ---------- 1. limites e nomes das freguesias ----------
console.log('a ler os limites das freguesias e as juntas de freguesia…');
const polFreg = await consulta('Base_Freguesias/FeatureServer/0', { outFields: 'COD_SIG' }, 'freguesias');
const juntas = await consulta('Administracao_Publica/FeatureServer/1', { outFields: 'NOME,TIPO_UNIDADE' }, 'juntas');
const FREGS = [];
for (const f of polFreg) {
  const aneis = aneisDe(f.geometry).map(poly => fechar(ll(poly[0]))); // só anéis exteriores; as freguesias não têm buracos
  const votos = {};
  for (const j of juntas) { const p = [j.geometry.coordinates[1], j.geometry.coordinates[0]]; if (dentro(p, aneis)) { const n = j.properties.NOME.replace(/^Junta de Freguesia (d[aeo]s? |de )/i, '').trim(); votos[n] = (votos[n] || 0) + (j.properties.TIPO_UNIDADE === 'Sede' ? 3 : 1); } }
  const nome = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
  if (!nome) { console.warn('freguesia sem junta identificável, COD_SIG', f.properties.COD_SIG); continue; }
  const simpl = aneis.map(a => simplificar(a, 1.5).map(arred)).sort((a, b) => area(b) - area(a));
  const todos = simpl.flat(); const lats = todos.map(p => p[0]), lons = todos.map(p => p[1]);
  FREGS.push({ id: slug(nome[0]), nome: nome[0], cod: f.properties.COD_SIG, aneis: simpl, bbox: [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], ha: Math.round(simpl.reduce((s, a) => s + area(a), 0) / 1e4) });
}
FREGS.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
console.log(FREGS.length, 'freguesias:', FREGS.map(f => f.nome + (f.aneis.length > 1 ? ` (${f.aneis.length} partes)` : '')).join(', '));
if (FREGS.length !== 24 || new Set(FREGS.map(f => f.id)).size !== 24) throw new Error('esperava 24 freguesias com nomes distintos');
fs.mkdirSync(path.join(ROOT, 'dados', 'freguesias'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dados', 'freguesias', 'index.js'),
  '// Freguesias de Lisboa: limites © Câmara Municipal de Lisboa (serviço «Base_Freguesias»). Gerado por tools/freguesias.mjs.\n' +
  '// Os dados de cada uma estão em dados/freguesias/<id>/ (Campo de Ourique: em dados/) e só são carregados quando se escolhe a freguesia.\n' +
  'window.FREGUESIAS = ' + JSON.stringify(FREGS.map(f => ({ id: f.id, nome: f.nome, cod: f.cod, ha: f.ha, bbox: f.bbox }))) + ';\n');

// limites simplificados das 24 freguesias para o mapa geral da cidade (carregado só quando se abre esse mapa)
function poloRotulo(anel) { // ponto interior mais afastado do contorno, por procura em grelha (para o nome ficar bem dentro)
  const lats = anel.map(p => p[0]), lons = anel.map(p => p[1]);
  const [a0, a1, o0, o1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const distBorda = q => { let d = Infinity; for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) { const A = m(anel[j]), B = m(anel[i]), P = m(q); const dx = B[0] - A[0], dy = B[1] - A[1]; const L2 = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)); d = Math.min(d, Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy)); } return d; };
  let melhor = centroide(anel), md = dentroAnel(melhor, anel) ? distBorda(melhor) : -1;
  for (let i = 1; i < 30; i++) for (let k = 1; k < 30; k++) { const q = [a0 + (a1 - a0) * i / 30, o0 + (o1 - o0) * k / 30]; if (!dentroAnel(q, anel)) continue; const d = distBorda(q); if (d > md) { md = d; melhor = q; } }
  return arred(melhor);
}
fs.writeFileSync(path.join(ROOT, 'dados', 'freguesias', 'limites.js'),
  '// Limites simplificados (8 m) das freguesias de Lisboa, para o mapa geral da cidade: © Câmara Municipal de Lisboa (serviço «Base_Freguesias»).\n' +
  '// Gerado por tools/freguesias.mjs. aneis: [[[lat, lon], ...], ...] (a maior parte primeiro); rotulo: onde fica o nome.\n' +
  'window.LIMITES_FREGUESIAS = ' + JSON.stringify(FREGS.map(f => ({ id: f.id, nome: f.nome, ha: f.ha, aneis: f.aneis.map(a => simplificar(a, 8)), rotulo: poloRotulo(f.aneis[0]) }))) + ';\n');
if (args.includes('--so-limites')) { console.log('escritos dados/freguesias/index.js e limites.js'); process.exit(0); }

// ---------- 2. dados de cada freguesia ----------
const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137, X = lon => lon * Math.PI / 180 * 6378137;
const invMerc = y => (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, invX = x => x / 6378137 * 180 / Math.PI;
const escreverSeNovo = (f, txt) => { if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); return true; } return false; };

async function verdesDe(aneis, bbox) {
  const lista = [];
  for (const [camada, tipo, campos] of [['Ambiente_DMEVAE/FeatureServer/4', 'verde', 'NOME,MORADA,AREA_M2,GESTAO_121'], ['Ambiente_DMEVAE/FeatureServer/3', 'horta', 'NOME,AREA,SITUACAO']]) {
    for (const f of await consulta(camada, { outFields: campos, ...envelope(bbox) }, tipo)) {
      const pr = f.properties || {};
      for (const poly of aneisDe(f.geometry)) {
        const ext = fechar(ll(poly[0])); if (ext.length < 3) continue;
        if (!dentro(pontoRotulo(ext), aneis)) continue;
        const aneisV = poly.map(r => simplificar(fechar(ll(r)), .5).map(arred)).filter(r => r.length >= 3);
        lista.push({ t: tipo, n: (pr.NOME || '').trim(), m: (pr.MORADA || '').trim(), a: Math.round(pr.AREA_M2 || pr.AREA || area(ext)), g: (pr.GESTAO_121 || '').trim(), p: aneisV });
      }
    }
  }
  return lista;
}
const cabecalhoVerdes = '// Espaços verdes e hortas urbanas: © Câmara Municipal de Lisboa (serviço «Ambiente DMEVAE», Estrutura Ecológica Municipal). Gerado por tools/freguesias.mjs.\n// t: "verde" | "horta"; n: nome; m: morada; a: área (m²); g: gestão; p: anéis [[lat, lon], ...] (o primeiro é o contorno).\n';

for (const F of FREGS) {
  if (so.length && !so.includes(F.id)) continue;
  const t0 = Date.now();
  if (F.id === CO) { // Campo de Ourique: só os espaços verdes, recortados ao limite que já usa (OSM)
    const src = fs.readFileSync(path.join(ROOT, 'dados', 'geo.js'), 'utf8'); const limite = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)).limite;
    const verdes = await verdesDe([limite], F.bbox);
    fs.writeFileSync(path.join(ROOT, 'dados', 'verdes.js'), cabecalhoVerdes + 'window.VERDES = ' + JSON.stringify(verdes) + ';\n');
    console.log(`${F.nome}: ${verdes.length} espaços verdes (dados/verdes.js)`); continue;
  }
  const dir = path.join(ROOT, 'dados', 'freguesias', F.id); fs.mkdirSync(dir, { recursive: true });
  const aneis = F.aneis, bb = F.bbox;
  // imagem de reserva: caixa da freguesia com 6 % de margem, em EPSG:3857, até 3072 px no lado maior
  const x0 = X(bb[0][1]), x1 = X(bb[1][1]), y0 = merc(bb[0][0]), y1 = merc(bb[1][0]), mx = (x1 - x0) * .06, my = (y1 - y0) * .06;
  const caixa = [x0 - mx, y0 - my, x1 + mx, y1 + my], w0 = caixa[2] - caixa[0], h0 = caixa[3] - caixa[1];
  const largura = w0 >= h0 ? IMG_MAX : Math.round(IMG_MAX * w0 / h0), altura = w0 >= h0 ? Math.round(IMG_MAX * h0 / w0) : IMG_MAX;
  const bounds = [[+invMerc(caixa[1]).toFixed(6), +invX(caixa[0]).toFixed(6)], [+invMerc(caixa[3]).toFixed(6), +invX(caixa[2]).toFixed(6)]];
  const fImg = path.join(dir, 'satelite.jpg');
  if (!semImagem && !fs.existsSync(fImg)) {
    const u = `${DGT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX=${caixa.map(v => v.toFixed(2)).join(',')}&WIDTH=${largura}&HEIGHT=${altura}&FORMAT=image/jpeg`;
    let ok = false;
    for (let t = 0; t < 4 && !ok; t++) { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(180000) }); if (r.ok && (r.headers.get('content-type') || '').includes('jpeg')) { fs.writeFileSync(fImg, Buffer.from(await r.arrayBuffer())); ok = true; } } catch (e) { /* repete */ } if (!ok) await espera(4000 * (t + 1)); }
    if (!ok) console.warn(`${F.nome}: imagem da DGT falhou (fica só o satélite em direto)`);
  }
  const base = `dados/freguesias/${F.id}/`;
  fs.writeFileSync(path.join(dir, 'geo.js'), `// ${F.nome}: limite © Câmara Municipal de Lisboa; imagem de reserva DGT OrtoSat 2023 (CC BY 4.0). Gerado por tools/freguesias.mjs. Coordenadas [lat, lon].\n` +
    'window.MAPA_DADOS = ' + JSON.stringify({ freguesia: F.id, nome: F.nome, limite: aneis[0], limitesExtra: aneis.slice(1), fonteLimite: 'Câmara Municipal de Lisboa', fonteRuas: 'CML',
      imagem: { ficheiro: base + 'satelite.jpg', bounds, largura, altura, fonte: 'DGT OrtoSat 2023 (CC BY 4.0)' }, ruas: {}, areas: {} }) + ';\n');
  // ruas: vias da CML recortadas ao limite, agrupadas por nome e encadeadas
  const vias = await consulta('Edificado_e_Vias/FeatureServer/1', { outFields: 'DESIGNACAO', ...envelope(bb) }, 'vias');
  const porNome = new Map();
  for (const v of vias) {
    const nome = (v.properties.DESIGNACAO || '').trim(); if (!nome) continue;
    const partes = v.geometry.type === 'LineString' ? [v.geometry.coordinates] : v.geometry.type === 'MultiLineString' ? v.geometry.coordinates : [];
    for (const parte of partes) for (const t of recortar(ll(parte), aneis)) { if (!porNome.has(nome)) porNome.set(nome, []); porNome.get(nome).push(t.map(arred)); }
  }
  const ruas = [];
  for (const [nome, trocos] of porNome) { const cad = encadear(trocos).map(c => simplificar(c, .5)).sort((a, b) => comprimento(b) - comprimento(a)); const metros = Math.round(cad.reduce((s, c) => s + comprimento(c), 0)); if (metros >= 15) ruas.push({ nome, tipo: 'cml', metros, trocos: cad }); }
  ruas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  fs.writeFileSync(path.join(dir, 'ruas.js'), `// Ruas de ${F.nome}: © Câmara Municipal de Lisboa (serviço «Edificado e Vias», camada «Vias e Ruas»), recortadas ao limite. Gerado por tools/freguesias.mjs.\nwindow.RUAS_OSM = ` + JSON.stringify(ruas) + ';\n');
  // edificado: lotes e números de polícia (como tools/edificado-cml.mjs)
  const ed = await consulta('Edificado_e_Vias/FeatureServer/0', { outFields: 'COD_SIG,MORADA', ...envelope(bb) }, 'edificado');
  const lotes = [], numeros = [];
  for (const f of ed) {
    const morada = ((f.properties || {}).MORADA || '').trim();
    for (const poly of aneisDe(f.geometry)) {
      const pts = fechar(ll(poly[0])); if (pts.length < 3) continue;
      const c = pontoRotulo(pts); if (!dentro(c, aneis)) continue;
      lotes.push({ p: pts.map(arred), m: morada, c: f.properties.COD_SIG || '' });
      const semPar = morada.replace(/\s*\(.*\)\s*$/, ''), k = semPar.indexOf(','), num = k >= 0 ? semPar.slice(k + 1).replace(/\s*\(.*$/, '').trim() : '';
      if (num && /\d/.test(num)) numeros.push([...arred(c), num, semPar.slice(0, k).trim()]);
    }
  }
  fs.writeFileSync(path.join(dir, 'edificado.js'), `// Edificado de ${F.nome}: © Câmara Municipal de Lisboa (serviço «Edificado e Vias», cartografia 1/1000). Gerado por tools/freguesias.mjs.\n// lotes: { p: contorno [[lat, lon], ...], m: morada, c: código SIG }; numeros: [lat, lon, "número", "rua"].\nwindow.EDIFICADO = ` + JSON.stringify({ fonte: 'Câmara Municipal de Lisboa', lotes, numeros }) + ';\n');
  // espaços verdes
  const verdes = await verdesDe(aneis, bb);
  fs.writeFileSync(path.join(dir, 'verdes.js'), cabecalhoVerdes + 'window.VERDES = ' + JSON.stringify(verdes) + ';\n');
  // preset vazio (só se ainda não houver)
  const preset = { preset: F.id, titulo: F.nome, subtitulo: '', elementos: [], categorias: [] };
  const novoP = escreverSeNovo(path.join(dir, 'presets', F.id + '.js'), `// Preset «${F.nome}», gravado pelo modo de edição. Modelo dos campos: ver README.md.\nwindow.CONTEUDOS_PRESET = ` + JSON.stringify(preset, null, 1) + ';\n');
  escreverSeNovo(path.join(dir, 'presets', 'index.js'), '// Lista dos presets desta freguesia (regenerada pelo servidor local a cada gravação).\nwindow.PRESETS = ' + JSON.stringify([{ id: F.id, nome: F.nome, subtitulo: '', elementos: 0 }], null, 1) + ';\n');
  escreverSeNovo(path.join(dir, 'conteudos.js'), `// Preset ativo (cópia de ${base}presets/${F.id}.js). Modelo dos campos: ver README.md.\nwindow.CONTEUDOS = ` + JSON.stringify(preset, null, 1) + ';\n');
  const kb = f => fs.existsSync(path.join(dir, f)) ? Math.round(fs.statSync(path.join(dir, f)).size / 1024) + ' kB' : '—';
  console.log(`${F.nome}: ${ruas.length} ruas, ${lotes.length} lotes, ${numeros.length} números, ${verdes.length} verdes · imagem ${kb('satelite.jpg')}, edificado ${kb('edificado.js')}${novoP ? ' · preset vazio criado' : ''} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
