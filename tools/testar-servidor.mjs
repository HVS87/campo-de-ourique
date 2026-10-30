// Teste do servidor (tools/servidor.mjs) nos dois modos: pasta única (versão browser) e pasta gravável separada
// (aplicação de computador). Trabalha numa cópia temporária de dados/ de Campo de Ourique e de Alcântara; não mexe
// nos ficheiros do projeto.   node tools/testar-servidor.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { criarServidor } from './servidor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'co-teste-'));
function copiarRaiz(dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dest, 'index.html'));
  for (const f of ['geo.js', 'conteudos.js']) { fs.mkdirSync(path.join(dest, 'dados'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'dados', f), path.join(dest, 'dados', f)); }
  fs.cpSync(path.join(ROOT, 'dados', 'presets'), path.join(dest, 'dados', 'presets'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dados', 'freguesias', 'alcantara'), path.join(dest, 'dados', 'freguesias', 'alcantara'), { recursive: true, filter: s => !s.endsWith('.jpg') && !s.endsWith('edificado.js') });
}
let falhas = 0;
async function cenario(nome, raiz, gravavel) {
  const srv = criarServidor({ raiz, gravavel, app: gravavel !== raiz, versao: 'teste', registo: () => {} });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const porta = srv.address().port, base = 'http://127.0.0.1:' + porta;
  const post = (u, corpo, origem = base) => fetch(base + u, { method: 'POST', headers: { Origin: origem, 'Content-Type': 'application/json' }, body: corpo });
  const ler = async u => (await fetch(base + u)).text();
  const testes = {
    'serve index.html': async () => assert.equal((await fetch(base + '/')).status, 200),
    'ambiente.json': async () => { const j = await (await fetch(base + '/ambiente.json')).json(); assert.equal(j.app, gravavel !== raiz); },
    'recusa origem alheia': async () => assert.equal((await post('/guardar', '{"sonda":true}', 'http://exemplo.pt')).status, 403),
    'sonda': async () => assert.equal((await (await post('/guardar', '{"sonda":true}')).json()).sonda, true),
    'recusa nulo e escondidos': async () => { assert.equal((await fetch(base + '/%00')).status, 400); assert.equal((await fetch(base + '/.git/config')).status, 403); assert.notEqual((await fetch(base + '/%2e%2e/%2e%2e/windows/win.ini')).status, 200); },
    'guardar preset novo': async () => {
      const r = await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'novo', titulo: 'Novo {x}\nlinha', elementos: [] }));
      assert.equal(r.status, 200); const j = await r.json(); assert.ok(j.presets.some(p => p.id === 'novo'));
      assert.ok((await ler('/dados/freguesias/alcantara/presets/novo.js')).includes('window.CONTEUDOS_PRESET'));
      assert.ok((await ler('/dados/freguesias/alcantara/conteudos.js')).includes('"preset": "novo"'));
      assert.ok((await ler('/dados/freguesias/alcantara/presets/index.js')).includes('"id": "novo"'));
      assert.ok(!fs.existsSync(path.join(raiz, 'dados/freguesias/alcantara/presets/novo.js')) || raiz === gravavel, 'escreveu na raiz');
    },
    'recusa preset de outra freguesia': async () => assert.equal((await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'x', freguesia: 'belem', elementos: [] }))).status, 409),
    'ativar o preset original': async () => { const r = await post('/ativar-preset/alcantara?freguesia=alcantara', ''); assert.equal(r.status, 200); assert.ok((await ler('/dados/freguesias/alcantara/conteudos.js')).includes('"preset": "alcantara"')); },
    'ativar preset escrito como código (exemplo)': async () => { const r = await post('/ativar-preset/exemplo', ''); assert.equal(r.status, 200); assert.ok((await ler('/dados/conteudos.js')).includes('window.CONTEUDOS')); },
    'apagar preset original': async () => {
      const r = await post('/apagar-preset/alcantara?freguesia=alcantara', ''); assert.equal(r.status, 200); const j = await r.json();
      assert.ok(!j.presets.some(p => p.id === 'alcantara')); if (gravavel !== raiz) assert.ok(fs.existsSync(path.join(raiz, 'dados/freguesias/alcantara/presets/alcantara.js')), 'apagou da raiz');
      assert.equal((await post('/ativar-preset/alcantara?freguesia=alcantara', '')).status, 404);
      const r2 = await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'alcantara', titulo: 'Alcântara', elementos: [] })); assert.ok((await r2.json()).presets.some(p => p.id === 'alcantara'), 'não voltou ao guardar');
    },
    'foto': async () => {
      const r = await fetch(base + '/guardar-foto/Fachada%20Ú.jpg', { method: 'POST', headers: { Origin: base }, body: Buffer.from([255, 216, 255]) }); const j = await r.json();
      assert.equal(j.caminho, 'assets/fotos/fachada-u.jpg'); assert.equal((await fetch(base + '/' + j.caminho)).status, 200);
      const j2 = await (await fetch(base + '/guardar-foto/fachada-u.jpg', { method: 'POST', headers: { Origin: base }, body: Buffer.from([1]) })).json(); assert.equal(j2.caminho, 'assets/fotos/fachada-u-2.jpg');
      assert.equal((await (await fetch(base + '/guardar-foto/x.exe', { method: 'POST', headers: { Origin: base }, body: Buffer.from([1]) })).status), 400);
    },
    'cópia do servidor central': async () => {
      const r = await fetch(base + '/copia-central?chave=' + encodeURIComponent('presets/belem/x/1.json') + '&versao=10-a', { method: 'POST', headers: { Origin: base }, body: '{"revisao":1}' }); assert.equal(r.status, 200);
      assert.equal((await (await fetch(base + '/copia-central/presets/belem/x/1.json')).json()).revisao, 1);
      assert.equal((await (await fetch(base + '/copia-central/versoes.json')).json())['presets/belem/x/1.json'], '10-a');
      assert.ok(fs.existsSync(path.join(gravavel, 'copia-central', 'presets', 'belem', 'x', '1.json')), 'não ficou na pasta gravável');
      assert.equal((await fetch(base + '/copia-central?chave=' + encodeURIComponent('../../fora.json'), { method: 'POST', headers: { Origin: base }, body: '{}' })).status, 400);
      assert.equal((await fetch(base + '/copia-central?chave=chaves.json', { method: 'POST', headers: { Origin: base }, body: 'não é json' })).status, 400);
      assert.equal((await fetch(base + '/copia-central?chave=chaves.json', { method: 'POST', headers: { Origin: 'http://exemplo.pt' }, body: '{}' })).status, 403);
      assert.ok((await (await fetch(base + '/ambiente.json')).json()).copia.endsWith('copia-central'));
    },
    'freguesia desconhecida': async () => assert.equal((await post('/guardar?freguesia=atlantida', '{"elementos":[]}')).status, 400),
  };
  for (const [t, f] of Object.entries(testes)) { try { await f(); console.log(`  ok  ${nome}: ${t}`); } catch (err) { falhas++; console.log(`FALHA ${nome}: ${t} — ${err.message}`); } }
  srv.close();
}
const r1 = path.join(tmp, 'browser'); copiarRaiz(r1);
await cenario('browser', r1, r1);
const r2 = path.join(tmp, 'app-raiz'), g2 = path.join(tmp, 'app-dados'); copiarRaiz(r2);
await cenario('aplicação', r2, g2);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
