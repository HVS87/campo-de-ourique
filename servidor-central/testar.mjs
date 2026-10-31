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
import { derivarChave, verificadorDe } from './contas.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.join(AQUI, '..');
// contas de teste (as verdadeiras não estão aqui): carregadas pela reposição de objetos da administração
const PALAVRAS = { Belem: 'teste-belem', 'Cidade.Teste': 'teste-cidade', 'Admin.Teste': 'teste-admin' };
const CONTAS = { contas: await Promise.all([
  { utilizador: 'Belem', nome: 'Belém', papel: 'freguesia', freguesias: ['belem'] },
  { utilizador: 'Cidade.Teste', nome: 'Cidade', papel: 'cidade', freguesias: ['*'] },
  { utilizador: 'Admin.Teste', nome: 'Administração', papel: 'admin', freguesias: ['*'] },
].map(async c => ({ ...c, verificador: await verificadorDe(await derivarChave(c.utilizador, PALAVRAS[c.utilizador])), versao: 1, ativa: true, falhas: 0, bloqueadaAte: 0 }))) };
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
  const sessoes = {};
  const entrar = async (utilizador, palavra, lembrar) => pedir(null, '/sessao', { method: 'POST', body: JSON.stringify({ utilizador, chave: await derivarChave(utilizador, palavra), lembrar }) });
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
    'quem fez o quê só para a administração': async () => {
      const { presets } = await (await pedir(leitor, '/presets?freguesia=alcantara')).json(); assert.ok(!('autor' in presets[0]) && !('contribuidor' in presets[0]), 'o leitor vê o autor');
      assert.ok(!(await (await pedir(leitor, '/elementos?freguesia=alcantara')).json()).elementos.some(e => 'autor' in e));
      assert.ok(!('autor' in (await (await pedir(leitor, '/presets/alcantara/teste')).json())));
      assert.ok(!(await (await pedir(leitor, '/exportar.csv?freguesia=alcantara')).text()).split('\r\n')[0].includes('autor'));
      assert.equal((await (await pedir(ADMIN, '/presets?freguesia=alcantara')).json()).presets[0].autor, 'Hugo');
      assert.ok((await (await pedir(ADMIN, '/exportar.csv?freguesia=alcantara')).text()).split('\r\n')[0].includes('autor'));
      assert.equal((await pedir(leitor, '/historico')).status, 403); assert.equal((await pedir(contribuidor, '/historico')).status, 403); assert.equal((await pedir(null, '/historico')).status, 401);
      const { historico } = await (await pedir(ADMIN, '/historico')).json(); assert.equal(historico.filter(e => e.acao === 'guardou').length, 7); assert.ok(historico.every(e => e.utilizador === 'chave:Contribuidor'));
      const h = historico.find(e => e.preset === 'teste' && e.revisao === 2); assert.deepEqual(h.resumo.tirados, ['Ideia geral']); assert.deepEqual(h.resumo.outros, ['título']);
    },
    'cópia: só para a administração': async () => {
      assert.equal((await pedir(leitor, '/copia')).status, 403); assert.equal((await pedir(contribuidor, '/copia')).status, 403);
      assert.equal((await pedir(leitor, '/objeto?chave=' + encodeURIComponent('presets/alcantara/teste/1.json'))).status, 403);
      const { objetos } = await (await pedir(ADMIN, '/copia')).json(); assert.ok(objetos.some(o => o.chave === 'presets/alcantara/teste/1.json')); assert.ok(objetos.some(o => o.chave === 'chaves.json')); assert.ok(objetos.some(o => o.chave.startsWith('historico/')));
      assert.equal((await (await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('presets/alcantara/teste/1.json'))).json()).revisao, 1);
      assert.equal((await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('../segredo'))).status, 400);
      assert.equal((await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('contas/segredo.json'))).status, 400);
    },
    'repor objetos (só administração)': async () => {
      const t = await (await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('presets/alcantara/teste/1.json'))).text();
      assert.equal((await pedir(contribuidor, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'), { method: 'POST', body: t })).status, 403);
      assert.equal((await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'), { method: 'POST', body: t })).status, 200);
      assert.equal((await (await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('presets/ajuda/reposto/1.json'))).json()).revisao, 1);
    },
    'retirar uma chave': async () => { assert.equal((await pedir(ADMIN, `/chaves/${idLeitor}/retirar`, { method: 'POST' })).status, 200); assert.equal((await pedir(leitor, '/presets')).status, 401); },
    'CORS para a origem autorizada': async () => {
      const r = await fetch(API + '/presets', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8081', 'Access-Control-Request-Method': 'POST' } }); assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
      assert.equal((await fetch(API + '/estado', { headers: { Origin: 'http://127.0.0.1:8081' } })).headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
      assert.equal((await fetch(API + '/estado', { headers: { Origin: 'https://outro.pt' } })).headers.get('access-control-allow-origin'), null);
    },
    'contas: entrar e enviar só para a sua freguesia': async () => {
      assert.equal((await pedir(ADMIN, '/objeto?chave=' + encodeURIComponent('contas/contas.json'), { method: 'POST', body: JSON.stringify(CONTAS) })).status, 200);
      const errada = await entrar('Belem', 'errada'); assert.equal(errada.status, 401);
      const ninguem = await entrar('Ninguem', 'x'); assert.equal(ninguem.status, 401); assert.equal((await ninguem.json()).erro, (await (await entrar('Belem', 'errada')).json()).erro, 'diz se a conta existe');
      const r = await entrar('belém', PALAVRAS.Belem); assert.equal(r.status, 200); const j = await r.json(); sessoes.Belem = j.testemunho;
      assert.ok(j.testemunho.startsWith('s1.')); assert.ok(j.expira > Date.now() + 23 * 3600e3 && j.expira < Date.now() + 25 * 3600e3, 'sem «lembrar-me» a sessão devia durar um dia'); assert.equal(j.lembrar, false);
      const l = await (await entrar('Belem', PALAVRAS.Belem, true)).json(); assert.ok(l.expira > Date.now() + 29 * 24 * 3600e3, 'com «lembrar-me» a sessão devia durar 30 dias'); assert.equal(l.sessao.lembrar, true); assert.deepEqual(j.sessao.freguesias, ['belem']);
      const e = await (await pedir(sessoes.Belem, '/estado')).json(); assert.equal(e.chave.utilizador, 'Belem'); assert.equal(e.chave.papel, 'contribuidor');
      assert.equal((await enviar(sessoes.Belem, 'belem', 'da-junta', { ...preset('Junta', 1), freguesia: 'belem' })).status, 201);
      const outra = await enviar(sessoes.Belem, 'alcantara', 'da-junta', preset('Junta', 1)); assert.equal(outra.status, 403); assert.match((await outra.json()).erro, /não pode editar alcantara/);
      assert.equal((await pedir(sessoes.Belem, '/historico')).status, 403); assert.equal((await pedir(sessoes.Belem, '/contas')).status, 403); assert.equal((await pedir(sessoes.Belem, '/copia')).status, 403);
      assert.equal((await pedir(sessoes.Belem, '/presets?freguesia=alcantara')).status, 200, 'uma conta de freguesia consulta as outras');
      assert.equal((await pedir(sessoes.Belem.slice(0, -4) + 'AAAA', '/presets')).status, 401, 'testemunho adulterado');
    },
    'contas: cidade envia para todas; administração vê o histórico com as contas': async () => {
      sessoes.Cidade = (await (await entrar('Cidade.Teste', PALAVRAS['Cidade.Teste'])).json()).testemunho;
      assert.equal((await enviar(sessoes.Cidade, 'alcantara', 'da-cidade', preset('Cidade', 2))).status, 201);
      assert.equal((await pedir(sessoes.Cidade, '/historico')).status, 403);
      sessoes.Admin = (await (await entrar('Admin.Teste', PALAVRAS['Admin.Teste'])).json()).testemunho;
      const { historico } = await (await pedir(sessoes.Admin, '/historico')).json();
      assert.ok(historico.some(x => x.utilizador === 'Belem' && x.acao === 'guardou' && x.freguesia === 'belem' && x.preset === 'da-junta'));
      assert.ok(historico.some(x => x.utilizador === 'Cidade.Teste' && x.acao === 'guardou' && x.freguesia === 'alcantara'));
      assert.ok(historico.some(x => x.utilizador === 'Belem' && x.acao === 'entrada recusada'));
      assert.equal((await (await pedir(sessoes.Admin, '/historico?freguesia=belem&utilizador=belem')).json()).historico.every(x => x.freguesia === 'belem'), true);
      assert.equal((await (await pedir(sessoes.Admin, '/presets?freguesia=belem')).json()).presets.find(p => p.preset === 'da-junta').autor, 'Belém');
      assert.equal((await (await pedir(sessoes.Admin, '/presets/belem/da-junta')).json()).utilizador, 'Belem');
      const { contas } = await (await pedir(sessoes.Admin, '/contas')).json(); assert.equal(contas.length, 3); assert.ok(!JSON.stringify(contas).includes('verificador'));
      assert.ok((await (await pedir(sessoes.Admin, '/copia')).json()).objetos.some(o => o.chave === 'contas/contas.json'));
    },
    'contas: mudar a palavra-passe, bloqueio e reposição': async () => {
      const antiga = sessoes.Belem;
      const m = await pedir(antiga, '/sessao/palavra-passe', { method: 'POST', body: JSON.stringify({ atual: await derivarChave('Belem', PALAVRAS.Belem), nova: await derivarChave('Belem', 'outra-palavra') }) });
      assert.equal(m.status, 200); sessoes.Belem = (await m.json()).testemunho;
      assert.equal((await pedir(antiga, '/presets')).status, 401, 'a sessão antiga continua a valer');
      assert.equal((await pedir(sessoes.Belem, '/presets')).status, 200);
      const codigos = []; for (let i = 0; i < 6; i++) codigos.push((await entrar('Belem', 'errada-' + i)).status);
      assert.deepEqual(codigos.slice(-2), [429, 429]); assert.equal((await entrar('Belem', 'outra-palavra')).status, 429, 'a certa também espera');
      assert.equal((await pedir(sessoes.Cidade, '/contas/Belem/palavra-passe', { method: 'POST', body: JSON.stringify({ nova: await derivarChave('Belem', 'reposta-1') }) })).status, 403);
      assert.equal((await pedir(sessoes.Admin, '/contas/Belem/palavra-passe', { method: 'POST', body: JSON.stringify({ nova: await derivarChave('Belem', 'reposta-1') }) })).status, 200);
      assert.equal((await entrar('Belem', 'reposta-1')).status, 200);
      assert.equal((await pedir(ADMIN, '/contas/Belem/palavra-passe', { method: 'POST', body: JSON.stringify({ nova: await derivarChave('Belem', 'reposta-2') }) })).status, 200, 'a chave de administração também repõe');
      assert.equal((await pedir(sessoes.Belem, '/presets')).status, 401);
    },
    'chave de contribuidor limitada a uma freguesia': async () => {
      const c = await (await pedir(ADMIN, '/chaves', { method: 'POST', body: JSON.stringify({ nome: 'Só Ajuda', papel: 'contribuidor', freguesias: ['ajuda'] }) })).json();
      assert.deepEqual(c.freguesias, ['ajuda']);
      assert.equal((await enviar(c.chave, 'ajuda', 'k', { ...preset('K', 1), freguesia: 'ajuda' })).status, 201);
      assert.equal((await enviar(c.chave, 'belem', 'k', { ...preset('K', 1), freguesia: 'belem' })).status, 403);
    },
    'evento: estado, ativação e resumo por freguesia': async () => {
      assert.equal((await (await pedir(null, '/evento')).json()).evento, null);
      assert.equal((await pedir(contribuidor, '/evento', { method: 'POST', body: JSON.stringify({ id: 'iluminacao', ativo: true }) })).status, 403);
      assert.equal((await pedir(sessoes.Admin, '/evento', { method: 'POST', body: JSON.stringify({ id: 'iluminacao', nome: 'Levantamento Iluminação Pública', ativo: true }) })).status, 200);
      assert.equal((await (await pedir(null, '/evento')).json()).evento.ativo, true);
      const grupo = (f, det) => ({ preset: 'lev', freguesia: f, titulo: 'Lev', elementos: [{ id: 'levantamento-iluminacao-publica', tipo: 'grupo', nome: 'Levantamento Iluminação Pública', evento: 'iluminacao', texto: '', fotos: [], pontos: det.map((d, i) => [38.7 + i / 1000, -9.18]), detalhes: det.map(c => ({ c, rua: 'Rua X', numero: '10' })) }] });
      assert.equal((await enviar(contribuidor, 'belem', 'lev', grupo('belem', ['fundido', 'fundido', 'falta']))).status, 201);
      assert.equal((await enviar(contribuidor, 'alcantara', 'lev', grupo('alcantara', ['falta']))).status, 201);
      const r = await (await pedir(contribuidor, '/evento/resumo')).json();
      assert.equal(r.evento, 'iluminacao'); assert.equal(r.total, 4); assert.deepEqual(r.freguesias.belem.contagens, { fundido: 2, falta: 1 }); assert.equal(r.freguesias.belem.total, 3); assert.equal(r.freguesias.alcantara.total, 1);
      assert.equal((await pedir(null, '/evento/resumo')).status, 401);
      const el = (await (await pedir(contribuidor, '/elementos?freguesia=belem')).json()).elementos.find(e => e.evento === 'iluminacao'); assert.equal(el.pontos, 3); assert.equal(el.contagens.fundido, 2);
      assert.equal((await pedir(sessoes.Admin, '/evento', { method: 'POST', body: JSON.stringify({ id: 'iluminacao', ativo: false }) })).status, 200);
      assert.equal((await (await pedir(null, '/evento')).json()).evento.ativo, false);
      assert.ok((await (await pedir(sessoes.Admin, '/copia')).json()).objetos.some(o => o.chave === 'evento/atual.json'));
    },
    'evento: um registo não pisa o resto do preset, envios simultâneos não se perdem, sem id não duplica': async () => {
      const R = (i, q, extra = {}) => ({ i, c: 'fundido', rua: 'Rua W', numero: '1', quando: '2026-11-02T10:00:0' + q + '.000Z', autor: 'Equipa', ...extra });
      const grupo = (lista, pontos) => ({ id: 'lev', tipo: 'grupo', nome: 'Lev', evento: 'iluminacao', texto: '', fotos: [], pontos: pontos || lista.map((_, n) => [38.7, -9.2 + n / 1000]), detalhes: lista });
      const base = els => ({ preset: 'so', freguesia: 'graca', titulo: 'T', elementos: els }), zona = { id: 'z', tipo: 'ponto', nome: 'Z', texto: '', fotos: [], pos: [38.7, -9.2] };
      const ler = async (c = ADMIN) => (await (await pedir(c, '/presets/graca/so')).json()).dados, lev = d => d.elementos.find(e => e.evento === 'iluminacao');
      await enviar(contribuidor, 'graca', 'so', base([zona, grupo([R('a', 1)])]));
      assert.equal((await enviar(contribuidor, 'graca', 'so', { ...base([grupo([R('b', 2)])]), titulo: 'Velho' }, { soEvento: true })).status, 201);
      let d = await ler(); assert.ok(d.elementos.some(e => e.id === 'z'), 'o registo apagou o que o outro dispositivo tinha'); assert.equal(d.titulo, 'T'); assert.deepEqual(lev(d).detalhes.map(x => x.i), ['a', 'b']);
      const rs = await Promise.all(['c', 'd', 'e', 'f'].map((i, n) => enviar(contribuidor, 'graca', 'so', base([grupo([R(i, n + 3)])]), { soEvento: true })));
      assert.ok(rs.every(r => r.status === 201), 'envio recusado: ' + rs.map(r => r.status));
      d = await ler(); assert.equal(lev(d).detalhes.length, 6, 'um envio simultâneo pisou outro');
      const { revisoes } = await (await pedir(ADMIN, '/presets/graca/so/revisoes')).json(); assert.equal(new Set(revisoes.map(r => r.revisao)).size, revisoes.length, 'revisões repetidas');
      assert.ok(!JSON.stringify(await ler(contribuidor)).includes('Equipa'), 'o nome de quem registou chega a quem não é da administração');
      const semNome = lev(await ler(contribuidor)).detalhes; await enviar(contribuidor, 'graca', 'so', base([grupo(semNome, lev(d).pontos)]), { soEvento: true });
      d = await ler(); assert.equal(lev(d).detalhes[0].autor, 'Equipa', 'um envio de quem não vê o autor apagou-o');
      const pts = lev(d).pontos.map(p => p.slice()), mov = lev(d).detalhes.map(x => ({ ...x })); pts[0] = [38.71, -9.21]; mov[0].movido = '2026-11-02T11:00:00.000Z';
      await enviar(contribuidor, 'graca', 'so', base([grupo(mov, pts)]), { soEvento: true });
      await enviar(contribuidor, 'graca', 'so', base([grupo(lev(d).detalhes, lev(d).pontos)]), { soEvento: true }); // outro dispositivo, com a posição velha
      assert.deepEqual(lev(await ler()).pontos[0], [38.71, -9.21], 'a posição velha ganhou ao último arrasto');
      const velho = { c: 'falta', rua: 'Rua V', numero: '9', quando: '2026-01-01T00:00:00.000Z' };
      for (let n = 0; n < 2; n++) await enviar(contribuidor, 'graca', 'antigos', { ...base([grupo([velho], [[38.7, -9.2]])]), preset: 'antigos' });
      assert.equal((await (await pedir(ADMIN, '/presets/graca/antigos')).json()).dados.elementos[0].detalhes.length, 1, 'registos sem id duplicaram');
    },
    'evento: os registos de dois dispositivos juntam-se e os tirados não voltam': async () => {
      const R = (i, c, q) => ({ i, c, rua: 'Rua Y', numero: i, quando: '2026-11-01T10:00:0' + q + '.000Z' });
      const g = (lista, extra = {}) => ({ preset: 'disp', freguesia: 'ajuda', titulo: 'Disp', elementos: [{ id: 'lev', tipo: 'grupo', nome: 'Lev', evento: 'iluminacao', texto: '', fotos: [], pontos: lista.map((x, n) => [38.7, -9.2 + n / 1000]), detalhes: lista }], ...extra });
      const atual = async () => (await (await pedir(ADMIN, '/presets/ajuda/disp')).json()).dados.elementos.find(e => e.evento === 'iluminacao');
      assert.equal((await enviar(contribuidor, 'ajuda', 'disp', g([R('a1', 'fundido', 1), R('a2', 'falta', 2)]))).status, 201);
      assert.equal((await enviar(contribuidor, 'ajuda', 'disp', g([R('b1', 'fundido', 3)]))).status, 201);
      let e = await atual(); assert.deepEqual(e.detalhes.map(d => d.i), ['a1', 'a2', 'b1'], 'um dispositivo apagou os registos do outro'); assert.equal(e.pontos.length, 3);
      assert.equal((await (await enviar(contribuidor, 'ajuda', 'disp', g([R('b1', 'fundido', 3)]))).json()).igual, true, 'reenviar o mesmo não cria revisão');
      assert.equal((await enviar(contribuidor, 'ajuda', 'disp', g([R('a1', 'fundido', 1), R('b1', 'fundido', 3)], { removidosEvento: { iluminacao: ['a2'] } }))).status, 201);
      e = await atual(); assert.deepEqual(e.detalhes.map(d => d.i), ['a1', 'b1'], 'o registo tirado voltou');
      assert.equal((await enviar(contribuidor, 'ajuda', 'disp', { preset: 'disp', freguesia: 'ajuda', titulo: 'Sem conjunto', elementos: [] })).status, 201);
      e = await atual(); assert.equal(e.detalhes.length, 2, 'um preset sem o conjunto apagou os registos');
      await enviar(contribuidor, 'ajuda', 'copia', { ...g([R('a1', 'fundido', 1), R('c1', 'falta', 4)]), preset: 'copia' });
      const r = await (await pedir(contribuidor, '/evento/resumo?id=iluminacao')).json(); assert.equal(r.freguesias.ajuda.total, 3, 'o resumo devia somar os presets sem contar duas vezes'); assert.deepEqual(r.freguesias.ajuda.contagens, { fundido: 2, falta: 1 });
    },
    'página de consulta': async () => { const r = await fetch(s.base + '/'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('Consulta dos dados')); },
  };
  console.log(`\n${tipo === 'node' ? 'Servidor Node' : 'Worker do Cloudflare (local)'}:`);
  for (const [t, f] of Object.entries(testes)) { try { await f(); console.log('  ok  ' + t); } catch (err) { falhas++; console.log('FALHA ' + t + ' — ' + err.message); } }
  s.proc.kill(); await new Promise(r => setTimeout(r, 500)); try { fs.rmSync(s.dados, { recursive: true, force: true }); } catch (err) { /* ainda em uso */ }
}
for (const q of quais) await bateria(q);
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
