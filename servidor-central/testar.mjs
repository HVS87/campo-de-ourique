// Teste do servidor central: a mesma bateria contra o servidor Node (ficheiros) e contra o Worker do Cloudflare
// (Wrangler local, com um R2 simulado). Cada um arranca numa porta livre, com dados temporários.
//   node servidor-central/testar.mjs          → os dois
//   node servidor-central/testar.mjs node     → só o Node (não precisa de npm install)
//   node servidor-central/testar.mjs worker   → só o Worker
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { derivarChave, verificadorDe } from './contas.mjs';
import { baseDe } from '../comum/juntar.mjs';

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
    spawnSync(process.execPath, [path.join(RAIZ, 'tools', 'preparar-site.mjs')], { stdio: 'ignore' }); // o site que o Worker serve
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
    'alteração cria revisão 2': async () => assert.equal((await (await enviar(contribuidor, 'alcantara', 'teste', preset('B', 2), { autor: 'Hugo', origem: 'aplicacao', base: baseDe(preset('A', 3)) })).json()).revisao, 2), // com a base, o que se tirou sai mesmo
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
    'eventos: o calendário no servidor central': async () => {
      const iso = m => new Date(Date.now() + m * 60000).toISOString(), post = o => pedir(sessoes.Admin, '/eventos', { method: 'POST', body: JSON.stringify(o) });
      assert.equal((await post({ id: 'agenda', nome: 'Agenda', agenda: { inicio: iso(-5), fim: iso(60) } })).status, 200);
      const e = (await (await pedir(null, '/evento')).json()).evento; assert.equal(e.id, 'agenda'); assert.equal(e.calendarizado, true);
      assert.equal((await post({ id: 'agenda2', nome: 'Agenda 2', agenda: { inicio: iso(10), fim: iso(20) } })).status, 409);
      assert.equal((await post({ id: 'agenda', nome: 'Agenda', agenda: { inicio: iso(-5), fim: iso(-1) } })).status, 200);
      assert.ok(!(await (await pedir(null, '/evento')).json()).evento);
      assert.equal((await post({ id: 'agenda', apagar: true })).status, 200);
    },
    'definições: a Visita Guiada inicial no servidor central': async () => {
      assert.equal((await (await pedir(null, '/definicoes')).json()).definicoes.visitaInicial, true);
      assert.equal((await pedir(contribuidor, '/definicoes', { method: 'POST', body: JSON.stringify({ visitaInicial: false }) })).status, 403);
      assert.equal((await pedir(sessoes.Admin, '/definicoes', { method: 'POST', body: JSON.stringify({ visitaInicial: false }) })).status, 200);
      assert.equal((await (await pedir(null, '/definicoes')).json()).definicoes.visitaInicial, false);
      assert.equal((await pedir(sessoes.Admin, '/definicoes', { method: 'POST', body: JSON.stringify({ visitaInicial: true }) })).status, 200);
    },
    'eventos: o catálogo no servidor central': async () => {
      const novo = { id: 'passeios', nome: 'Levantamento de Passeios', termos: { um: 'passeio', varios: 'passeios' }, categorias: [{ id: 'buraco', nome: 'Buraco', cor: '#eb6834' }] };
      assert.deepEqual((await (await pedir(null, '/eventos')).json()).eventos, []);
      assert.equal((await pedir(contribuidor, '/eventos', { method: 'POST', body: JSON.stringify(novo) })).status, 403);
      assert.equal((await pedir(sessoes.Admin, '/eventos', { method: 'POST', body: JSON.stringify(novo) })).status, 200);
      assert.equal((await (await pedir(null, '/eventos')).json()).eventos[0].termos.varios, 'passeios');
      assert.equal((await pedir(sessoes.Admin, '/eventos', { method: 'POST', body: JSON.stringify({ id: 'passeios', apagar: true }) })).status, 200);
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
      // o conjunto de um evento pode ficar sem pontos: guarda-se, conta zero e não tem geometria
      assert.equal((await enviar(contribuidor, 'alcantara', 'vazio', { ...grupo('alcantara', []), preset: 'vazio' })).status, 201);
      const vz = (await (await pedir(contribuidor, '/elementos?freguesia=alcantara')).json()).elementos.find(e => e.preset === 'vazio' && e.evento === 'iluminacao'); assert.ok(vz, 'o conjunto vazio fica'); assert.equal(vz.pontos, 0); assert.ok(!vz.geometria);
      // um envio sem o conjunto: de uma freguesia, volta (vazio); da administração, sai e não volta com um dispositivo atrasado
      assert.equal((await enviar(contribuidor, 'alcantara', 'vazio', { preset: 'vazio', freguesia: 'alcantara', titulo: 'Vazio', elementos: [] })).status, 201);
      const ler = async () => ((await (await pedir(sessoes.Admin, '/presets/alcantara/vazio')).json()).dados.elementos || []).filter(e => e.evento === 'iluminacao');
      assert.equal((await ler()).length, 1, 'uma freguesia não apaga o conjunto do evento');
      assert.equal((await enviar(sessoes.Admin, 'alcantara', 'vazio', { preset: 'vazio', freguesia: 'alcantara', titulo: 'Vazio', elementos: [], conjuntosApagados: ['iluminacao'] })).status, 201);
      assert.equal((await ler()).length, 0, 'a administração apaga-o');
      assert.equal((await enviar(contribuidor, 'alcantara', 'vazio', { ...grupo('alcantara', []), preset: 'vazio' })).status, 201);
      assert.equal((await ler()).length, 0, 'um dispositivo atrasado não o traz de volta');
      assert.equal((await enviar(contribuidor, 'alcantara', 'vazio', { ...grupo('alcantara', ['fundido']), preset: 'vazio' })).status, 201);
      assert.equal((await ler()).length, 1, 'um registo novo traz o conjunto');
      const el = (await (await pedir(contribuidor, '/elementos?freguesia=belem')).json()).elementos.find(e => e.evento === 'iluminacao'); assert.equal(el.pontos, 3); assert.equal(el.contagens.fundido, 2);
      assert.equal((await pedir(sessoes.Admin, '/evento', { method: 'POST', body: JSON.stringify({ id: 'iluminacao', ativo: false }) })).status, 200);
      assert.equal((await (await pedir(null, '/evento')).json()).evento.ativo, false);
      assert.ok((await (await pedir(sessoes.Admin, '/copia')).json()).objetos.some(o => o.chave === 'evento/atual.json'));
    },
    'dois dispositivos ao mesmo tempo: nada se perde': async () => {
      const ler = async () => (await (await pedir(contribuidor, '/presets/carnide/dois')).json()).dados;
      const B0 = { preset: 'dois', freguesia: 'carnide', titulo: 'Dois', subtitulo: '', categorias: [{ id: 'c1', nome: 'Cat', membros: ['a'] }],
        elementos: [{ id: 'a', tipo: 'ponto', nome: 'A', texto: 'texto a', fotos: [{ src: 'f1.jpg' }], pos: [38.7, -9.2] }, { id: 'b', tipo: 'ponto', nome: 'B', texto: 'texto b', fotos: [], pos: [38.71, -9.2] },
          { id: 'z', tipo: 'zona', nome: 'Z', texto: '', fotos: [], poligono: [[38.70, -9.18], [38.71, -9.18], [38.71, -9.17]], filhos: [{ id: 'z1', tipo: 'ponto', nome: 'Z1', texto: 'dentro', fotos: [], pos: [38.706, -9.177] }] },
          { id: 'g', tipo: 'grupo', nome: 'G', texto: '', fotos: [], pontos: [[38.72, -9.2]], detalhes: [{ i: 'g1', nome: 'G1' }] }] };
      assert.equal((await enviar(contribuidor, 'carnide', 'dois', B0)).status, 201);
      const base = baseDe(B0), copia = () => JSON.parse(JSON.stringify(B0)), el = (d, id) => d.elementos.flatMap(e => [e, ...(e.filhos || [])]).find(e => e.id === id);
      // o dispositivo 1 muda o texto de A, acrescenta uma foto a A, um ponto ao conjunto e um ponto novo; o 2 muda B, o ponto da zona, outra foto de A, outro ponto do conjunto, e apaga nada
      const d1 = copia(); el(d1, 'a').texto = 'texto a (1)'; el(d1, 'a').fotos.push({ src: 'f-1.jpg' }); el(d1, 'g').pontos.push([38.73, -9.2]); el(d1, 'g').detalhes.push({ i: 'g2', nome: 'G2' }); d1.elementos.push({ id: 'n1-ab12', tipo: 'ponto', nome: 'Novo 1', texto: '', fotos: [], pos: [38.74, -9.2] }); d1.categorias[0].membros.push('b');
      const d2 = copia(); el(d2, 'b').texto = 'texto b (2)'; el(d2, 'z1').texto = 'dentro (2)'; el(d2, 'a').fotos.push({ src: 'f-2.jpg' }); el(d2, 'g').pontos.push([38.75, -9.2]); el(d2, 'g').detalhes.push({ i: 'g3', nome: 'G3' }); d2.elementos.push({ id: 'n2-cd34', tipo: 'ponto', nome: 'Novo 2', texto: '', fotos: [], pos: [38.76, -9.2] }); d2.titulo = 'Dois (2)';
      const [r1, r2] = await Promise.all([enviar(contribuidor, 'carnide', 'dois', d1, { base }), enviar(contribuidor, 'carnide', 'dois', d2, { base })]);
      assert.equal(r1.status, 201); assert.equal(r2.status, 201);
      let x = await ler();
      assert.equal(el(x, 'a').texto, 'texto a (1)'); assert.equal(el(x, 'b').texto, 'texto b (2)'); assert.equal(el(x, 'z1').texto, 'dentro (2)'); assert.equal(x.titulo, 'Dois (2)');
      assert.deepEqual(el(x, 'a').fotos.map(f => f.src).sort(), ['f-1.jpg', 'f-2.jpg', 'f1.jpg']);
      assert.deepEqual(el(x, 'g').detalhes.map(d => d.i).sort(), ['g1', 'g2', 'g3']); assert.equal(el(x, 'g').pontos.length, 3);
      assert.ok(el(x, 'n1-ab12') && el(x, 'n2-cd34'), 'os dois pontos novos ficam'); assert.deepEqual(x.categorias[0].membros.sort(), ['a', 'b']);
      assert.ok(x.elementos.find(e => e.id === 'z').filhos.some(f => f.id === 'z1'), 'o ponto continua dentro da zona');
      // o mesmo campo mudado nos dois: fica o último e o conflito é dito; apagar de um lado o que o outro mudou não o apaga
      const base2 = baseDe(x), e1 = JSON.parse(JSON.stringify(x)), e2 = JSON.parse(JSON.stringify(x));
      el(e1, 'a').texto = 'versão 1'; el(e2, 'a').texto = 'versão 2';
      e1.elementos = e1.elementos.filter(e => e.id !== 'b'); el(e2, 'b').texto = 'b mudado no 2';
      assert.equal((await enviar(contribuidor, 'carnide', 'dois', e2, { base: base2 })).status, 201);
      const j = await (await enviar(contribuidor, 'carnide', 'dois', e1, { base: base2 })).json();
      x = await ler(); assert.equal(el(x, 'a').texto, 'versão 1'); assert.ok(j.conflitos.some(c => c.nome === 'A' && c.campo === 'texto'), 'o conflito não é dito: ' + JSON.stringify(j.conflitos));
      assert.equal(el(x, 'b').texto, 'b mudado no 2', 'apagar não pode levar o que o outro mudou');
      // apagar o que ninguém mais mudou apaga mesmo; um envio sem base não apaga nada
      const base3 = baseDe(x), f1 = JSON.parse(JSON.stringify(x)); f1.elementos = f1.elementos.filter(e => e.id !== 'n2-cd34');
      await enviar(contribuidor, 'carnide', 'dois', f1, { base: base3 }); x = await ler(); assert.ok(!el(x, 'n2-cd34'), 'o apagado volta');
      const semBase = JSON.parse(JSON.stringify(x)); semBase.elementos = semBase.elementos.filter(e => e.id !== 'n1-ab12');
      await enviar(contribuidor, 'carnide', 'dois', semBase); x = await ler(); assert.ok(el(x, 'n1-ab12'), 'sem base, nada se apaga');
    },
    'categorias: lista e fundir em todos os presets (só a administração)': async () => {
      const base = (cats, p) => ({ preset: p, freguesia: 'penha', titulo: p, elementos: [{ id: 'a', tipo: 'ponto', nome: 'A', texto: '', fotos: [], pos: [38.7, -9.1] }, { id: 'b', tipo: 'ponto', nome: 'B', texto: '', fotos: [], pos: [38.71, -9.1] }], categorias: cats });
      await enviar(contribuidor, 'penha', 'um', base([{ id: 'c1', nome: 'Passeios', icone: '🚶', cor: '#111111', membros: ['a'] }, { id: 'c2', nome: 'passeio', icone: '', cor: '#222222', membros: ['b'] }], 'um'));
      await enviar(contribuidor, 'penha', 'dois', base([{ id: 'c3', nome: 'Passeio', icone: '', cor: '#333333', membros: ['a'] }, { id: 'c4', nome: 'Outra', icone: '', cor: '#444444', membros: ['a'] }], 'dois'));
      const nomes = async () => (await (await pedir(ADMIN, '/categorias')).json()).categorias.filter(c => /passeio|outra/i.test(c.nome));
      assert.equal((await nomes()).length, 3, 'passeio e Passeio são a mesma categoria');
      assert.equal((await pedir(contribuidor, '/categorias/fundir', { method: 'POST', body: JSON.stringify({ de: ['Passeios'], para: 'X' }) })).status, 403);
      const r = await pedir(ADMIN, '/categorias/fundir', { method: 'POST', body: JSON.stringify({ de: ['Passeios', 'passeio'], para: 'Passeios', icone: '🚶', cor: '#111111' }) }); assert.equal(r.status, 200);
      assert.equal((await r.json()).alterados.length, 2);
      const um = (await (await pedir(ADMIN, '/presets/penha/um')).json()), dois = (await (await pedir(ADMIN, '/presets/penha/dois')).json()).dados;
      assert.deepEqual(um.dados.categorias.map(c => [c.nome, c.membros]), [['Passeios', ['a', 'b']]]); assert.equal(um.revisao, 2, 'fundir cria uma revisão');
      assert.deepEqual(dois.categorias.map(c => c.nome).sort(), ['Outra', 'Passeios']); assert.equal(dois.categorias.find(c => c.nome === 'Passeios').icone, '🚶');
      assert.equal((await pedir(ADMIN, '/categorias/fundir', { method: 'POST', body: '{}' })).status, 400);
      await enviar(contribuidor, 'penha', 'um', base([{ id: 'c1', nome: 'passeio', icone: '', cor: '#222222', membros: ['a', 'b'] }], 'um'));
      assert.deepEqual((await (await pedir(ADMIN, '/presets/penha/um')).json()).dados.categorias.map(c => c.nome), ['Passeios'], 'um envio de um ficheiro antigo desfez a fusão');
      await enviar(contribuidor, 'penha', 'tres', base([{ id: 'x', nome: 'Alfa', icone: '', cor: '#111111', membros: ['a'] }, { id: 'y', nome: 'Beta', icone: '', cor: '#222222', membros: ['b'] }], 'tres'));
      await pedir(ADMIN, '/categorias/fundir', { method: 'POST', body: JSON.stringify({ de: ['Alfa', 'Gama'], para: 'Beta', freguesia: 'penha' }) });
      assert.deepEqual((await (await pedir(ADMIN, '/presets/penha/tres')).json()).dados.categorias.map(c => [c.nome, c.membros.length]), [['Beta', 2]], 'o nome final de uma categoria não selecionada criou duas iguais');
    },
    'todos os conjuntos juntam os pontos entre dispositivos, com tipos e sem pisar o resto': async () => {
      const P = (i, s) => ({ i, c: 't1', rua: 'Rua Z', quando: '2026-11-03T10:00:0' + s + '.000Z' }), G = (l, extra = {}) => ({ id: 'bancos', tipo: 'grupo', nome: 'Bancos', texto: '', fotos: [], tiposPonto: [{ id: 't1', nome: 'Partido', icone: '🪑', cor: '#123456' }], pontos: l.map((_, n) => [38.7, -9.1 + n / 1000]), detalhes: l, ...extra });
      const base = (els, extra = {}) => ({ preset: 'cj', freguesia: 'lumiar', titulo: 'CJ', elementos: els, ...extra }), ler = async () => (await (await pedir(ADMIN, '/presets/lumiar/cj')).json()).dados, gr = d => d.elementos.find(e => e.id === 'bancos');
      await enviar(contribuidor, 'lumiar', 'cj', base([G([P('a', 1)])])); await enviar(contribuidor, 'lumiar', 'cj', base([G([P('b', 2)])]));
      assert.deepEqual(gr(await ler()).detalhes.map(x => x.i), ['a', 'b'], 'um dispositivo apagou os pontos do outro');
      await enviar(contribuidor, 'lumiar', 'cj', base([G([P('b', 2)], { nome: 'Velho' })]), { soEvento: true }); assert.equal(gr(await ler()).nome, 'Bancos', 'um registo mudou o nome do conjunto');
      await enviar(contribuidor, 'lumiar', 'cj', base([G([P('b', 2)])], { removidosEvento: { bancos: ['a'] } })); assert.deepEqual(gr(await ler()).detalhes.map(x => x.i), ['b'], 'o ponto tirado voltou');
      await enviar(contribuidor, 'lumiar', 'cj', base([{ id: 'bancos', tipo: 'desmaterializado', nome: 'Bancos', texto: '', fotos: [] }])); assert.equal((await ler()).elementos.filter(e => e.id === 'bancos').length, 1, 'o elemento ficou repetido');
      await enviar(contribuidor, 'lumiar', 'cj2', { ...base([G([P('x', 1), P('y', 2)])]), preset: 'cj2' });
      const l = (await (await pedir(ADMIN, '/elementos?freguesia=lumiar')).json()).elementos.find(e => e.preset === 'cj2' && e.id === 'bancos'); assert.equal(l.pontos, 2); assert.equal(l.contagens.t1, 2); assert.equal(l.tipos[0].nome, 'Partido');
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
    'pontos: a edição mais recente ganha; apagar um preset tira-o e um envio novo trá-lo': async () => {
      const G = (l, p) => ({ id: 'cj', tipo: 'grupo', nome: 'CJ', texto: '', fotos: [], pontos: p || l.map(() => [38.7, -9.1]), detalhes: l }), base = els => ({ preset: 'ed', freguesia: 'estrela', titulo: 'Ed', elementos: els }), ler = async () => (await (await pedir(ADMIN, '/presets/estrela/ed')).json()).dados.elementos.find(e => e.id === 'cj').detalhes[0];
      await enviar(contribuidor, 'estrela', 'ed', base([G([{ i: 'p', rua: 'Antiga' }])]));
      await enviar(contribuidor, 'estrela', 'ed', base([G([{ i: 'p', rua: 'Nova', editado: '2026-11-04T10:00:00.000Z' }])]));
      await enviar(contribuidor, 'estrela', 'ed', base([G([{ i: 'p', rua: 'Antiga' }])]), { soEvento: true }); assert.equal((await ler()).rua, 'Nova', 'um dispositivo desatualizado repôs uma edição antiga');
      await enviar(contribuidor, 'estrela', 'ed', base([G([{ i: 'p', rua: 'Mais nova', editado: '2026-11-04T11:00:00.000Z' }])])); assert.equal((await ler()).rua, 'Mais nova');
      const lista = async () => (await (await pedir(ADMIN, '/presets?freguesia=estrela')).json()).presets.map(p => p.preset);
      assert.ok((await lista()).includes('ed')); assert.equal((await pedir(null, '/presets/estrela/ed/apagar', { method: 'POST', body: '{}' })).status, 401);
      assert.equal((await pedir(contribuidor, '/presets/estrela/ed/apagar', { method: 'POST', body: '{}' })).status, 200); assert.ok(!(await lista()).includes('ed'), 'o preset apagado continua na lista');
      await enviar(contribuidor, 'estrela', 'ed', base([G([{ i: 'p', rua: 'De volta', editado: '2026-11-04T12:00:00.000Z' }])])); assert.ok((await lista()).includes('ed'), 'um envio novo devia trazê-lo de volta');
      await enviar(contribuidor, 'estrela', 'gr', { preset: 'gr', freguesia: 'estrela', titulo: 'Gr', elementos: [{ id: 'cj', tipo: 'grupo', nome: 'CJ', texto: '', fotos: [], pontos: [[38.7, -9.1]] }] }); await enviar(contribuidor, 'estrela', 'gr', { preset: 'gr', freguesia: 'estrela', titulo: 'Gr', elementos: [G([{ i: 'n' }])] }, { soEvento: true });
      assert.equal((await (await pedir(ADMIN, '/presets/estrela/gr')).json()).dados.elementos.filter(e => e.id === 'cj').length, 1, 'o conjunto ficou repetido');
    },
    ...(tipo === 'node' ? {} : { 'apresentação alojada: o site e os dados guardados, sem autoria': async () => {
      const r = await fetch(s.base + '/'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('id="logo-ps"'), 'a raiz devia ser a apresentação');
      assert.ok((await (await fetch(s.base + '/config.js')).text()).includes('location.origin'), 'o config.js devia apontar para este endereço');
      const antes = await (await fetch(s.base + '/dados/freguesias/beato/conteudos.js')).text(); assert.ok(antes.includes('window.CONTEUDOS'), 'sem nada guardado, servem os ficheiros');
      await enviar(contribuidor, 'beato', 'hospedado', { preset: 'hospedado', freguesia: 'beato', titulo: 'Guardado Aqui', elementos: [{ id: 'g', tipo: 'grupo', nome: 'G', texto: '', fotos: [], pontos: [[38.7, -9.1]], detalhes: [{ i: 'x', autor: 'Segredo' }] }] });
      const depois = await fetch(s.base + '/dados/freguesias/beato/conteudos.js'), txt = await depois.text(); assert.ok(txt.startsWith('window.CONTEUDOS = ') && txt.includes('Guardado Aqui'), 'devia servir o preset guardado'); assert.ok(!txt.includes('Segredo'), 'o autor chegou ao público'); assert.equal(depois.headers.get('cache-control'), 'no-store');
      assert.ok((await (await fetch(s.base + '/dados/freguesias/beato/presets/hospedado.js')).text()).startsWith('window.CONTEUDOS_PRESET = '));
      const ind = await (await fetch(s.base + '/dados/freguesias/beato/presets/index.js')).text(); assert.ok(ind.includes('Guardado Aqui') && ind.startsWith('window.PRESETS'), 'o preset novo devia estar no índice');
      assert.equal((await fetch(s.base + '/.contas/contas.json')).status === 200, false, 'as contas não podem ser servidas');
      await pedir(contribuidor, '/presets/beato/hospedado/apagar', { method: 'POST', body: '{}' });
      const semEle = await (await fetch(s.base + '/dados/freguesias/beato/presets/index.js')).text(); assert.ok(!semEle.includes('Guardado Aqui'), 'o preset apagado continua no índice');
      await enviar(ADMIN, 'ajuda', 'exemplo-apagado', { preset: 'exemplo-apagado', freguesia: 'ajuda', titulo: 'X', elementos: [] }); await pedir(ADMIN, '/presets/ajuda/exemplo-apagado/apagar', { method: 'POST', body: '{}' });
    } }),
    'eventos: a abrangência (freguesias e zonas) vale também para o público': async () => {
      const post = (u, o) => pedir(sessoes.Admin, u, { method: 'POST', body: JSON.stringify(o) }), zona = [[38.69, -9.22], [38.70, -9.22], [38.70, -9.20], [38.69, -9.20]];
      const ev = { id: 'abrange', nome: 'Abrange', publico: true, abrangencia: { freguesias: ['ajuda', 'nao valida'], zonas: { ajuda: [{ id: 'z', nome: 'Z', poligono: zona }], belem: [{ id: 'fora', nome: 'Fora', poligono: zona }] } } };
      assert.equal((await post('/eventos', ev)).status, 200);
      const guardado = (await (await pedir(null, '/eventos')).json()).eventos.find(e => e.id === 'abrange');
      assert.deepEqual(guardado.abrangencia, { freguesias: ['ajuda'], zonas: { ajuda: [{ id: 'z', nome: 'Z', poligono: zona }] } }, 'só freguesias válidas, e zonas só das escolhidas');
      assert.equal((await post('/evento', { id: 'abrange', nome: 'Abrange', ativo: true })).status, 200);
      const registo = (f, pos) => pedir(null, '/publico/' + f + '/da-junta', { method: 'POST', body: JSON.stringify({ tipo: 'registo', evento: 'abrange', registo: { pos, rua: 'Rua A', numero: '1' } }) });
      assert.equal((await registo('belem', [38.695, -9.21])).status, 400, 'fora das freguesias do evento');
      await post('/eventos', { ...ev, abrangencia: { freguesias: ['belem'], zonas: { belem: [{ id: 'z', nome: 'Z', poligono: zona }] } } });
      assert.equal((await registo('belem', [38.72, -9.15])).status, 400, 'fora das zonas');
      assert.equal((await registo('belem', [38.695, -9.21])).status, 201, 'dentro da zona');
      await post('/eventos', { ...ev, abrangencia: undefined });
      assert.ok(!(await (await pedir(null, '/eventos')).json()).eventos.find(e => e.id === 'abrange').abrangencia, 'sem abrangência: toda a cidade');
      assert.equal((await post('/evento', { id: 'abrange', nome: 'Abrange', ativo: false })).status, 200);
      assert.equal((await post('/eventos', { id: 'abrange', apagar: true })).status, 200);
    },
    'fotos: à parte do preset, públicas, e as embebidas saem do preset ao chegar': async () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 300 }, (_, i) => (i * 37) % 256)]), foto = (c, f, corpo) => fetch(API + '/fotos/' + f, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...(c ? { Authorization: 'Bearer ' + c } : {}) }, body: corpo });
      await pedir(sessoes.Admin, '/contas/Belem/palavra-passe', { method: 'POST', body: JSON.stringify({ nova: await derivarChave('Belem', 'fotos-teste') }) }); // uma sessão nova, seja qual for o estado deixado pelos testes de antes
      sessoes.Belem = (await (await entrar('Belem', 'fotos-teste')).json()).testemunho;
      assert.equal((await foto(null, 'belem', jpeg)).status, 401, 'sem sessão');
      assert.equal((await foto(sessoes.Belem, 'ajuda', jpeg)).status, 403, 'outra freguesia');
      assert.equal((await foto(sessoes.Belem, 'belem', new TextEncoder().encode('<html>nao sou foto</html>'))).status, 415, 'só imagens');
      const r = await foto(sessoes.Belem, 'belem', jpeg); assert.equal(r.status, 201); const { endereco, chave } = await r.json();
      assert.match(chave, /^fotos\/belem\/[0-9a-f]{32}\.jpg$/); assert.equal(endereco, API + '/' + chave);
      assert.equal((await (await foto(sessoes.Belem, 'belem', jpeg)).json()).chave, chave, 'a mesma foto é o mesmo objeto');
      const g = await fetch(endereco); assert.equal(g.status, 200, 'pública'); assert.equal(g.headers.get('content-type'), 'image/jpeg'); assert.deepEqual(new Uint8Array(await g.arrayBuffer()), jpeg);
      assert.match(g.headers.get('cache-control') || '', /immutable/);
      assert.equal((await fetch(API + '/fotos/belem/' + '0'.repeat(32) + '.jpg')).status, 404);
      // um dispositivo antigo manda as fotos dentro do preset (num ponto e num registo de um conjunto): ficam objetos, o preset só com o endereço
      const dataURL = 'data:image/jpeg;base64,' + Buffer.from(jpeg).toString('base64');
      const dados = { preset: 'fotos', freguesia: 'belem', titulo: 'Fotos', elementos: [{ id: 'f1', tipo: 'ponto', nome: 'Com foto', texto: '', fotos: [{ src: dataURL, legenda: 'antiga' }], pos: [38.697, -9.2] }, { id: 'g1', tipo: 'grupo', nome: 'Registos', texto: '', fotos: [], pontos: [[38.697, -9.201]], detalhes: [{ i: 'a1b2c3d4e5f6', rua: 'Rua A', fotos: [{ src: dataURL, legenda: '' }] }] }] };
      assert.equal((await enviar(sessoes.Belem, 'belem', 'fotos', dados)).status, 201);
      const guardado = (await (await pedir(sessoes.Belem, '/presets/belem/fotos')).json()).dados;
      assert.deepEqual(guardado.elementos[0].fotos, [{ src: endereco, legenda: 'antiga' }]); assert.equal(guardado.elementos[1].detalhes[0].fotos[0].src, endereco);
      assert.ok(!JSON.stringify(guardado).includes('data:image'), 'nada embebido');
      // a cópia local leva as fotos, em binário
      const objs = (await (await pedir(sessoes.Admin, '/copia')).json()).objetos; assert.ok(objs.some(o => o.chave === chave), 'na lista da cópia');
      const o = await pedir(sessoes.Admin, '/objeto?chave=' + encodeURIComponent(chave)); assert.equal(o.status, 200); assert.deepEqual(new Uint8Array(await o.arrayBuffer()), jpeg);
    },
    'página de consulta': async () => { const r = await fetch(s.base + '/consulta'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('Consulta dos dados')); },
  };
  console.log(`\n${tipo === 'node' ? 'Servidor Node' : 'Worker do Cloudflare (local)'}:`);
  for (const [t, f] of Object.entries(testes)) { try { await f(); console.log('  ok  ' + t); } catch (err) { falhas++; console.log('FALHA ' + t + ' — ' + err.message); } }
  s.proc.kill(); await new Promise(r => setTimeout(r, 500)); try { fs.rmSync(s.dados, { recursive: true, force: true }); } catch (err) { /* ainda em uso */ }
}
for (const q of quais) await bateria(q);
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
