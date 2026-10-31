// Gera dados/freguesias/ruas-cidade.js: os nomes das ruas de toda a cidade e em que freguesias ficam, para a pesquisa do
// mapa de Lisboa. Os traçados são pesados e só se carregam ao abrir cada freguesia; este índice tem só os nomes.
// Correr depois de atualizar as ruas de alguma freguesia:   node tools/indice-ruas.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJS = f => { const ctx = { window: {} }; try { vm.runInNewContext(fs.readFileSync(f, 'utf8'), ctx); } catch (err) { /* sem ficheiro nesta freguesia */ } return ctx.window; };
const freguesias = lerJS(path.join(RAIZ, 'dados/freguesias/index.js')).FREGUESIAS;
const ruas = new Map();
for (const f of freguesias) {
  const base = path.join(RAIZ, f.id === 'campo-de-ourique' ? 'dados' : 'dados/freguesias/' + f.id);
  const nomes = new Set((lerJS(path.join(base, 'ruas.js')).RUAS_OSM || []).map(r => r.nome));
  for (const n of Object.keys((lerJS(path.join(base, 'geo.js')).MAPA_DADOS || {}).ruas || {})) nomes.add(n);
  for (const n of nomes) if (n) { if (!ruas.has(n)) ruas.set(n, []); ruas.get(n).push(f.id); }
}
const lista = [...ruas].sort((a, b) => a[0].localeCompare(b[0], 'pt'));
const saida = '// Ruas de toda a cidade e as freguesias onde ficam: [nome, [ids]]. Gerado por tools/indice-ruas.mjs.\nwindow.RUAS_CIDADE = ' + JSON.stringify(lista) + ';\n';
fs.writeFileSync(path.join(RAIZ, 'dados/freguesias/ruas-cidade.js'), saida);
console.log(`${lista.length} ruas em ${freguesias.length} freguesias (${(saida.length / 1024).toFixed(0)} kB)`);
