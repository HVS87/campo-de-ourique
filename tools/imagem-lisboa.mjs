// Gera assets/lisboa-dgt-2023.jpg e lisboa-dgt-2023-alto.jpg: a imagem de satélite de Lisboa inteira, do mesmo serviço da DGT que o satélite em direto
// (por isso a passagem de uma para o outro não se nota). É o que a apresentação mostra logo ao abrir, antes de ter
// carregado o resto, e o fundo do mapa de Lisboa sem internet. Precisa de internet.   node tools/imagem-lisboa.mjs
// A caixa é maior do que a cidade, para cobrir o ecrã em qualquer formato (16:9, 21:9, telemóvel ao alto).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DGT = 'https://ortos.dgterritorio.gov.pt/wms/ortosat2023';
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'dados/freguesias/index.js'), 'utf8'), ctx);
const bb = ctx.window.FREGUESIAS.map(f => f.bbox);
const sul = Math.min(...bb.map(b => b[0][0])), oeste = Math.min(...bb.map(b => b[0][1])), norte = Math.max(...bb.map(b => b[1][0])), este = Math.max(...bb.map(b => b[1][1]));
const R = 6378137, mx = lon => R * lon * Math.PI / 180, my = lat => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const ilon = x => x / R * 180 / Math.PI, ilat = y => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
const cx = (mx(oeste) + mx(este)) / 2, cy = (my(sul) + my(norte)) / 2, W = mx(este) - mx(oeste), H = my(norte) - my(sul);
// deitada para computadores e tablets deitados; ao alto para telemóveis (a apresentação escolhe conforme o ecrã)
for (const [nome, largura, larg, alt] of [['lisboa-dgt-2023.jpg', 2400, Math.max(H * 1.35 * 2.2, W * 1.1), H * 1.35], ['lisboa-dgt-2023-alto.jpg', 900, W * 1.1, W * 1.1 * 2.5]]) {
  const caixa = [cx - larg / 2, cy - alt / 2, cx + larg / 2, cy + alt / 2], altura = Math.round(largura * alt / larg);
  const u = `${DGT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX=${caixa.map(v => v.toFixed(2)).join(',')}&WIDTH=${largura}&HEIGHT=${altura}&FORMAT=image/jpeg`;
  const r = await fetch(u, { headers: { 'User-Agent': 'campo-de-ourique (apresentacao)' }, signal: AbortSignal.timeout(180000) });
  if (!r.ok || !(r.headers.get('content-type') || '').includes('jpeg')) throw new Error('A DGT respondeu ' + r.status + ' ' + r.headers.get('content-type'));
  const destino = path.join(RAIZ, 'assets', nome);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  const bounds = [[+ilat(caixa[1]).toFixed(6), +ilon(caixa[0]).toFixed(6)], [+ilat(caixa[3]).toFixed(6), +ilon(caixa[2]).toFixed(6)]];
  console.log(`${nome}: ${largura}×${altura}, ${(fs.statSync(destino).size / 1024).toFixed(0)} kB; limites para o index.html: ${JSON.stringify(bounds)}`);
}
