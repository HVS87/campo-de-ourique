// Teste do servidor central: a mesma bateria contra o servidor Node (ficheiros) e contra o Worker do Cloudflare
// (Wrangler local, com um R2 simulado). Cada um arranca numa porta livre, com dados temporários.
//   node servidor-central/testar.mjs          → os dois
//   node servidor-central/testar.mjs node     → só o Node (não precisa de npm install)
//   node servidor-central/testar.mjs worker   → só o Worker
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.join(AQUI, '..');
const portaLivre = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const ADMIN = 'chave-de-administracao-so-para-testes-0123456789';
const quais = process.argv[2] ? [process.argv[2]] : ['node', 'worker'];
let falhas = 0;

async function arrancar(tipo) {
  const porta = await portaLivre(), dados = fs.mkdtempSync(path.join(os.tmpdir(), 'central-' + tipo + '-'));
  let proc;
  if (tipo === 'node') proc = spawn(process.execPath, [path.join(AQUI, 'servidor.mjs')], { env: { ...process.env, DADOS: dados, PORTA: String(porta), ORIGENS: 'http://127.0.0.1:8081', CHAVE_ADMIN: ADMIN }, stdio: ['ignore', 'pipe', 'pipe'] });
  else {
    const wrangler = path.join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (!fs.existsSync(wrangler)) { console.log('  (sem wrangler: corre «npm install» para testar o Worker)'); return null; }
    proc = spawn(process.execPath, [wrangler, 'dev', '--config', path.join(AQUI, 'cloudflare', 'wrangler.toml'), '--local', '--port', String(porta), '--ip', '127.0.0.1', '--persist-to', dados, '--var', 'CHAVE_ADMIN:' + ADMIN, '--var', 'ORIGENS:http://127.0.0.1:8081', '--show-interactive-dev-session=false'],
      { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/api/v1/estado')).ok) return { proc, base, dados }; } catch (err) { /* ainda a arrancar */ } await new Promise(r => setTimeout(r, 500)); }
  proc.kill(); throw new Error(tipo + ' não arrancou');
}

async function bateria(tipo) {
  const s = await arrancar(tipo); if (!s) return;
  const API = s.base + '/api/v1';
  const pedir = (c, u, o = {}) => fetch(API + u, { ...o, headers: { 'Content-Type': 'application/json', ...(c ? { Authorization: 'Bearer ' + c } : {}), ...(o.headers || {}) } });
  const enviar = (c, f, p, dados, extra = {}) => pedir(c, `/presets/${f}/${p}`, { method: 'POST', body: JSON.stringify({ dados, ...extra }) });
  const preset = (titulo, n) => ({ preset: 'teste', freguesia: 'alcantara', titulo, subtitulo: '', categorias: [{ id: 'c1', nome: 'Segurança', membros: ['p1'] }],
    elementos: [{ id: 'p1', tipo: 'ponto', nome: 'Passadeira gasta', prioridade: 'importante', competencia: 'camara', texto: '<p>Faltam <b>riscas</b></p>', fotos: [], pos: [38.705, -9.18] },
      { id: 'z1', tipo: 'zona', nome: 'Largo', texto: '', fotos: [], poligono: [[38.70, -9.18], [38.71, -9.18], [38.71, -9.17]], filhos: [{ id: 'p2', tipo: 'ponto', nome: 'Banco partido', prioridade: 'pouco', texto: '', fotos: [], pos: [38.706, -9.177] }] },
      { id: 'd1', tipo: 'desmaterializado', nome: 'Ideia geral', prioridade: 'sugestao', competencia: 'junta', texto: 'x', fotos: [] }].slice(0, n) });
  let contribuidor, leitor, idLeitor;
  const testes = {
    'estado sem chave': async () => { const j = await (await pedir(null, '/estado')).json(); assert.equal(j.ok, true); assert.equal(j.chave, null); },
    'chave de administração de arranque': async () => assert.equal((await (await pedir(ADMIN, '/estado')).json()).chave.papel, 'admin'),
    'criar chaves pela API': async () => {
      const c = await (await pedir(ADMIN, '/chaves', { method: 'POST', body: JSON.stringify({ nome: 'Contribuidor', papel: 'contribuidor' }) })).json(); contribuidor = c.chave; assert.ok(contribuidor.length > 20);
      const l = await (await pedir(ADMIN, '/chaves', { method: 'POST', body: JSON.stringify({ nome: 'Leitor', papel: 'leitor' }) })).json(); leitor = l.chave; idLeitor = l.id;
      const { chaves } = await (await pedir(ADMIN, '/chaves')).json(); assert.equal(chaves.length, 2); assert.ok(!JSON.stringify(chaves).includes(contribuidor), 'a lista mostra a chave'); assert.ok(!chaves[0].resumo, 'a lista mostra o resumo');
      assert.equal((await pedir(contribuidor, '/chaves')).status, 403);
    },
    'ler e enviar sem chave são recusados': async () => { assert.equal((await pedir(null, '/presets')).status, 401); assert.equal((await enviar(null, 'alcantara', 'teste', preset('A', 3))).status, 401); },
    'leitor não envia': async () => assert.equal((await enviar(leitor, 'alcantara', 'teste', preset('A', 3))).status, 403),
    'contribuidor envia (revisão 1)': async () => { const r = await enviar(contribuidor, 'alcantara', 'teste', preset('A', 3), { autor: 'Hugo', origem: 'browser' }); assert.equal(r.status, 201); assert.equal((await r.json()).revisao, 1); },
    'mesmo conteúdo não cria revisão': async () => { const j = await (await enviar(contribuidor, 'alcantara', 'teste', preset('A', 3))).json(); assert.equal(j.igual, true); assert.equal(j.revisao, 1); },
    'alteração cria revisão 2': async () => assert.equal((await (await enviar(contribuidor, 'alcantara', 'teste', preset('B', 2), { autor: 'Hugo', origem: 'aplicacao' })).json()).revisao, 2),
    'envios simultâneos na mesma freguesia não se perdem': async () => {
      const rs = await Promise.all(['p-a', 'p-b', 'p-c', 'p-d'].map(p => enviar(contribuidor, 'belem', p, { ...preset('S ' + p, 1), freguesia: 'belem' })));
      assert.ok(rs.every(r => r.status === 201), 'algum envio falhou: ' + rs.map(r => r.status));
      const { presets } = await (await pedir(leitor, '/presets?freguesia=belem')).json(); assert.equal(presets.length, 4, 'o índice perdeu presets');
    },
    'freguesia trocada e ids inválidos': async () => { assert.equal((await enviar(contribuidor, 'ajuda', 'teste', preset('C', 1))).status, 409); assert.ok((await pedir(contribuidor, '/presets/Alcantara/x', { method: 'POST', body: '{}' })).status >= 400); },
    'lista e revisões': async () => {
      const { presets } = await (await pedir(leitor, '/presets?freguesia=alcantara')).json(); assert.equal(presets.length, 1); assert.equal(presets[0].titulo, 'B'); assert.equal(presets[0].revisao, 2);
      const { revisoes } = await (await pedir(leitor, '/presets/alcantara/teste/revisoes')).json(); assert.deepEqual(revisoes.map(r => r.revisao), [1, 2]);
      assert.equal((await (await pedir(leitor, '/presets/alcantara/teste?revisao=1')).json()).dados.titulo, 'A');
      assert.equal((await (await pedir(leitor, '/freguesias')).json()).freguesias.length, 2);
    },
    'elementos e filtros': async () => {
      await enviar(contribuidor, 'alcantara', 'teste', preset('C', 3), { autor: 'Hugo' });
      const todos = await (await pedir(leitor, '/elementos?freguesia=alcantara')).json(); assert.equal(todos.total, 4);
      assert.equal(todos.elementos.find(e => e.id === 'p2').dentroDe, 'Largo'); assert.equal(todos.elementos.find(e => e.id === 'p1').texto, 'Faltam riscas'); assert.deepEqual(todos.elementos.find(e => e.id === 'p1').categorias, ['Segurança']);
      assert.equal((await (await pedir(leitor, '/elementos?prioridade=importante')).json()).total, 5); // 1 em Alcântara e 4 em Belém
      assert.equal((await (await pedir(leitor, '/elementos?competencia=junta')).json()).total, 1);
      assert.equal((await (await pedir(leitor, '/elementos?freguesia=alcantara&prioridade=sem')).json()).total, 1);
      assert.equal((await (await pedir(leitor, '/elementos?q=passadeira')).json()).total, 5); // 1 em Alcântara e 4 em Belém
      assert.equal((await (await pedir(leitor, '/elementos')).json()).total, 8);
    },
    'exportações': async () => {
      const b = new Uint8Array(await (await pedir(leitor, '/exportar.csv?freguesia=alcantara')).arrayBuffer()); assert.deepEqual([...b.slice(0, 3)], [0xef, 0xbb, 0xbf], 'sem BOM'); assert.equal(new TextDecoder().decode(b).trim().split('\r\n').length, 5);
      const g = await (await pedir(leitor, '/exportar.geojson?freguesia=alcantara')).json(); assert.equal(g.features.length, 4); assert.equal(g.features.find(f => f.properties.id === 'z1').geometry.type, 'Polygon'); assert.equal(g.features.find(f => f.properties.id === 'd1').geometry, null);
    },
    'registo dos envios': async () => { const { registo } = await (await pedir(leitor, '/registo')).json(); assert.equal(registo.length, 7); assert.equal(registo[0].preset, 'teste'); },
    'cópia: lista e objetos (chaves só para a administração)': async () => {
      const { objetos } = await (await pedir(leitor, '/copia')).json(); assert.ok(objetos.some(o => o.chave === 'presets/alcantara/teste/1.json')); assert.ok(!objetos.some(o => o.chave === 'chaves.json'));
      assert.ok((await (await pedir(ADMIN, '/copia')).json()).objetos.some(o => o.chave === 'chaves.json'));
      assert.equal((await pedir(leitor, '/objeto?chave=chaves.json')).status, 403);
      assert.equal((await (await pedir(leitor, '/objeto?chave=' + encodeURIComponent('presets/alcantara/teste/1.json'))).json()).revisao, 1);
      assert.equal((await pedir(leitor, '/objeto?chave=' + encodeURIComponent('../segredo'))).status, 400);
    },
    'repor objetos (só administração)': async () => {
      const t = await (await pedir(leitor, '/objeto?chave=' + encodeURIComponent('presets/alcantara/teste/1.json'))).text();
      assert.equal((await pedir(contribuidor, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'), { method: 'POST', body: t })).status, 403);
      assert.equal((await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'), { method: 'POST', body: t })).status, 200);
      assert.equal((await (await pedir(leitor, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'))).json()).revisao, 1);
    },
    'retirar uma chave': async () => { assert.equal((await pedir(ADMIN, `/chaves/${idLeitor}/retirar`, { method: 'POST' })).status, 200); assert.equal((await pedir(leitor, '/presets')).status, 401); },
    'CORS para a origem autorizada': async () => {
      const r = await fetch(API + '/presets', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8081', 'Access-Control-Request-Method': 'POST' } }); assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
      assert.equal((await fetch(API + '/estado', { headers: { Origin: 'http://127.0.0.1:8081' } })).headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
      assert.equal((await fetch(API + '/estado', { headers: { Origin: 'https://outro.pt' } })).headers.get('access-control-allow-origin'), null);
    },
    'página de consulta': async () => { const r = await fetch(s.base + '/'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('Consulta dos dados')); },
  };
  console.log(`\n${tipo === 'node' ? 'Servidor Node' : 'Worker do Cloudflare (local)'}:`);
  for (const [t, f] of Object.entries(testes)) { try { await f(); console.log('  ok  ' + t); } catch (err) { falhas++; console.log('FALHA ' + t + ' — ' + err.message); } }
  s.proc.kill(); await new Promise(r => setTimeout(r, 500)); try { fs.rmSync(s.dados, { recursive: true, force: true }); } catch (err) { /* ainda em uso */ }
}
for (const q of quais) await bateria(q);
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
