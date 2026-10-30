// Teste do servidor (tools/servidor.mjs) nos dois modos: pasta única (versão browser) e pasta gravável separada
// (aplicação de computador). Trabalha numa cópia temporária de dados/ de Campo de Ourique e de Alcântara; não mexe
// nos ficheiros do projeto. Usa contas de teste próprias (as verdadeiras não estão aqui).   node tools/testar-servidor.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { criarServidor } from './servidor.mjs';
import { derivarChave, verificadorDe } from '../servidor-central/contas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'co-teste-'));
function copiarRaiz(dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dest, 'index.html'));
  for (const f of ['geo.js', 'conteudos.js']) { fs.mkdirSync(path.join(dest, 'dados'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'dados', f), path.join(dest, 'dados', f)); }
  fs.cpSync(path.join(ROOT, 'dados', 'presets'), path.join(dest, 'dados', 'presets'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dados', 'freguesias', 'alcantara'), path.join(dest, 'dados', 'freguesias', 'alcantara'), { recursive: true, filter: s => !s.endsWith('.jpg') && !s.endsWith('edificado.js') });
}
// contas de teste: uma de freguesia, uma da cidade e a administração
const PALAVRAS = { Alcantara: 'teste-alcantara', 'Cidade.Teste': 'teste-cidade', 'Admin.Teste': 'teste-admin' };
const CONTAS = [
  { utilizador: 'Alcantara', nome: 'Alcântara', papel: 'freguesia', freguesias: ['alcantara'] },
  { utilizador: 'Cidade.Teste', nome: 'Cidade', papel: 'cidade', freguesias: ['*'] },
  { utilizador: 'Admin.Teste', nome: 'Administração', papel: 'admin', freguesias: ['*'] },
];
for (const c of CONTAS) c.verificador = await verificadorDe(await derivarChave(c.utilizador, PALAVRAS[c.utilizador]));

let falhas = 0;
async function cenario(nome, raiz, gravavel) {
  const srv = criarServidor({ raiz, gravavel, app: gravavel !== raiz, versao: 'teste', registo: () => {}, contasIniciais: CONTAS });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const porta = srv.address().port, base = 'http://127.0.0.1:' + porta;
  const sessoes = {};
  const post = (u, corpo, { origem = base, quem, cookie } = {}) => fetch(base + u, { method: 'POST', headers: { Origin: origem, 'Content-Type': 'application/json', ...(cookie || quem ? { Cookie: cookie || sessoes[quem] } : {}) }, body: corpo });
  const get = (u, quem, extra = {}) => fetch(base + u, { headers: { ...(quem ? { Cookie: sessoes[quem] } : {}), ...extra } });
  const ler = async u => (await fetch(base + u)).text();
  async function entrar(utilizador, palavra = PALAVRAS[utilizador], como = utilizador, lembrar) {
    const r = await post('/sessao', JSON.stringify({ utilizador, chave: await derivarChave(utilizador, palavra), lembrar }));
    const c = r.headers.get('set-cookie'); if (r.ok) sessoes[como] = c.split(';')[0];
    return { r, c, j: await r.json() };
  }
  const testes = {
    'serve index.html': async () => assert.equal((await fetch(base + '/')).status, 200),
    'ambiente.json': async () => { const j = await (await fetch(base + '/ambiente.json')).json(); assert.equal(j.app, gravavel !== raiz); assert.equal(j.contas, true); },
    'recusa origem alheia': async () => assert.equal((await post('/guardar', '{"sonda":true}', { origem: 'http://exemplo.pt' })).status, 403),
    'sonda sem sessão': async () => { const j = await (await post('/guardar', '{"sonda":true}')).json(); assert.equal(j.sonda, true); assert.equal(j.sessao, null); },
    'recusa nulo e escondidos': async () => {
      assert.equal((await fetch(base + '/%00')).status, 400); assert.equal((await fetch(base + '/.git/config')).status, 403); assert.notEqual((await fetch(base + '/%2e%2e/%2e%2e/windows/win.ini')).status, 200);
      assert.equal((await fetch(base + '/.contas/contas/contas.json')).status, 403); assert.equal((await fetch(base + '/CONTAS~1/contas/contas.json')).status, 403);
    },
    'gravar sem sessão é recusado': async () => {
      assert.equal((await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'x', elementos: [] }))).status, 401);
      assert.equal((await post('/ativar-preset/alcantara?freguesia=alcantara', '')).status, 401);
      assert.equal((await post('/apagar-preset/alcantara?freguesia=alcantara', '')).status, 401);
      assert.equal((await fetch(base + '/guardar-foto/x.jpg', { method: 'POST', headers: { Origin: base }, body: Buffer.from([255, 216, 255]) })).status, 401);
    },
    'palavra-passe errada': async () => { const { r, j } = await entrar('Alcantara', 'errada', 'x'); assert.equal(r.status, 401); assert.equal(j.erro, 'Utilizador ou palavra-passe errados'); },
    'utilizador desconhecido dá o mesmo erro': async () => { const { r, j } = await entrar('Ninguem', 'x', 'x'); assert.equal(r.status, 401); assert.equal(j.erro, 'Utilizador ou palavra-passe errados'); },
    'entrar (sem acentos nem maiúsculas)': async () => {
      const { r, c, j } = await entrar('alcântara', PALAVRAS.Alcantara, 'Alcantara'); assert.equal(r.status, 200); assert.equal(j.sessao.utilizador, 'Alcantara');
      assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); assert.match(c, new RegExp('co_sessao_' + porta + '='));
      assert.doesNotMatch(c, /Max-Age/, 'sem «lembrar-me» o cookie devia acabar ao fechar o browser'); assert.equal(j.sessao.lembrar, false);
      assert.equal((await entrar('Alcantara', 'tésté-alcântara', 'acentos')).r.status, 200, 'a palavra-passe com acentos devia valer (os acentos não contam)');
      assert.equal((await entrar('Alcantara', 'Teste-alcantara', 'maiuscula')).r.status, 401, 'as maiúsculas contam');
      assert.equal((await (await get('/sessao', 'Alcantara')).json()).sessao.utilizador, 'Alcantara');
      assert.equal((await (await post('/guardar', '{"sonda":true}', { quem: 'Alcantara' })).json()).sessao.utilizador, 'Alcantara');
    },
    'lembrar-me: o cookie dura 30 dias e continua depois de mudar a palavra-passe': async () => {
      const { r, c, j } = await entrar('Cidade.Teste', PALAVRAS['Cidade.Teste'], 'lembrada', true); assert.equal(r.status, 200); assert.match(c, /Max-Age=2592000/); assert.equal(j.sessao.lembrar, true);
      assert.equal((await (await get('/sessao', 'lembrada')).json()).sessao.lembrar, true);
      const m = await post('/sessao/palavra-passe', JSON.stringify({ atual: await derivarChave('Cidade.Teste', PALAVRAS['Cidade.Teste']), nova: await derivarChave('Cidade.Teste', 'cidade-2') }), { quem: 'lembrada' });
      assert.equal(m.status, 200); assert.match(m.headers.get('set-cookie'), /Max-Age=2592000/);
      const v = await post('/sessao/palavra-passe', JSON.stringify({ atual: await derivarChave('Cidade.Teste', 'cidade-2'), nova: await derivarChave('Cidade.Teste', PALAVRAS['Cidade.Teste']) }), { quem: 'lembrada', cookie: m.headers.get('set-cookie').split(';')[0] });
      assert.equal(v.status, 200, 'repor a palavra-passe de teste');
    },
    'cookie adulterado não vale': async () => assert.equal((await (await fetch(base + '/sessao', { headers: { Cookie: sessoes.Alcantara.slice(0, -3) + 'AAA' } })).json()).sessao, null),
    'guardar preset novo': async () => {
      const r = await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'novo', titulo: 'Novo {x}\nlinha', elementos: [] }), { quem: 'Alcantara' });
      assert.equal(r.status, 200); const j = await r.json(); assert.ok(j.presets.some(p => p.id === 'novo'));
      assert.ok((await ler('/dados/freguesias/alcantara/presets/novo.js')).includes('window.CONTEUDOS_PRESET'));
      assert.ok((await ler('/dados/freguesias/alcantara/conteudos.js')).includes('"preset": "novo"'));
      assert.ok((await ler('/dados/freguesias/alcantara/presets/index.js')).includes('"id": "novo"'));
      assert.ok(!fs.existsSync(path.join(raiz, 'dados/freguesias/alcantara/presets/novo.js')) || raiz === gravavel, 'escreveu na raiz');
    },
    'conta de freguesia não grava noutra freguesia': async () => {
      const r = await post('/guardar', JSON.stringify({ preset: 'campo-de-ourique', elementos: [] }), { quem: 'Alcantara' });
      assert.equal(r.status, 403); assert.match((await r.json()).erro, /não pode editar campo-de-ourique/);
      assert.equal((await post('/ativar-preset/exemplo', '', { quem: 'Alcantara' })).status, 403);
      assert.equal((await post('/apagar-preset/exemplo', '', { quem: 'Alcantara' })).status, 403);
    },
    'recusa preset de outra freguesia': async () => assert.equal((await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'x', freguesia: 'belem', elementos: [] }), { quem: 'Alcantara' })).status, 409),
    'ativar o preset original': async () => { const r = await post('/ativar-preset/alcantara?freguesia=alcantara', '', { quem: 'Alcantara' }); assert.equal(r.status, 200); assert.ok((await ler('/dados/freguesias/alcantara/conteudos.js')).includes('"preset": "alcantara"')); },
    'conta da cidade grava em todas': async () => {
      assert.equal((await entrar('Cidade.Teste')).r.status, 200);
      const r = await post('/ativar-preset/exemplo', '', { quem: 'Cidade.Teste' }); assert.equal(r.status, 200); assert.ok((await ler('/dados/conteudos.js')).includes('window.CONTEUDOS'));
      assert.equal((await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'da-cidade', elementos: [{ id: 'a', tipo: 'desmaterializado', nome: 'Ideia', texto: '', fotos: [] }] }), { quem: 'Cidade.Teste' })).status, 200);
    },
    'apagar preset original': async () => {
      const r = await post('/apagar-preset/alcantara?freguesia=alcantara', '', { quem: 'Alcantara' }); assert.equal(r.status, 200); const j = await r.json();
      assert.ok(!j.presets.some(p => p.id === 'alcantara')); if (gravavel !== raiz) assert.ok(fs.existsSync(path.join(raiz, 'dados/freguesias/alcantara/presets/alcantara.js')), 'apagou da raiz');
      assert.equal((await post('/ativar-preset/alcantara?freguesia=alcantara', '', { quem: 'Alcantara' })).status, 404);
      const r2 = await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'alcantara', titulo: 'Alcântara', elementos: [] }), { quem: 'Alcantara' }); assert.ok((await r2.json()).presets.some(p => p.id === 'alcantara'), 'não voltou ao guardar');
    },
    'foto': async () => {
      const foto = (n, corpo) => fetch(base + '/guardar-foto/' + n, { method: 'POST', headers: { Origin: base, Cookie: sessoes.Alcantara }, body: Buffer.from(corpo) });
      const j = await (await foto('Fachada%20Ú.jpg', [255, 216, 255])).json();
      assert.equal(j.caminho, 'assets/fotos/fachada-u.jpg'); assert.equal((await fetch(base + '/' + j.caminho)).status, 200);
      assert.equal((await (await foto('fachada-u.jpg', [1])).json()).caminho, 'assets/fotos/fachada-u-2.jpg');
      assert.equal((await foto('x.exe', [1])).status, 400);
    },
    'histórico e contas só para a administração': async () => {
      assert.equal((await get('/historico')).status, 401);
      assert.equal((await get('/historico', 'Alcantara')).status, 403); assert.equal((await get('/historico', 'Cidade.Teste')).status, 403);
      assert.equal((await get('/contas', 'Cidade.Teste')).status, 403);
      assert.equal((await entrar('Admin.Teste')).r.status, 200);
      assert.equal((await get('/historico', 'Admin.Teste', { 'Sec-Fetch-Site': 'cross-site' })).status, 403); // pedido de outra página
      const { historico } = await (await get('/historico', 'Admin.Teste')).json();
      const acoes = historico.map(e => `${e.utilizador}:${e.acao}${e.preset ? ':' + e.preset : ''}`);
      for (const a of ['Alcantara:entrou', 'Alcantara:entrada recusada', 'Alcantara:guardou:novo', 'Alcantara:ativou o preset:alcantara', 'Alcantara:apagou o preset:alcantara', 'Cidade.Teste:guardou:da-cidade', 'Cidade.Teste:ativou o preset:exemplo', 'Alcantara:guardou uma foto:fachada-u.jpg'])
        assert.ok(acoes.includes(a), 'falta no histórico: ' + a);
      assert.ok(!acoes.some(a => a.includes(':guardou:x')), 'a gravação recusada entrou no histórico');
      const g = historico.find(e => e.preset === 'da-cidade'); assert.deepEqual(g.resumo.acrescentados, ['Ideia']); assert.equal(g.freguesia, 'alcantara');
      assert.equal((await (await get('/historico?utilizador=cidade.teste', 'Admin.Teste')).json()).historico.every(e => e.utilizador === 'Cidade.Teste'), true);
      const { contas } = await (await get('/contas', 'Admin.Teste')).json(); assert.equal(contas.length, 3); assert.ok(!JSON.stringify(contas).includes('verificador'));
    },
    'mudar a palavra-passe invalida a sessão antiga': async () => {
      const antiga = sessoes.Alcantara;
      const r = await post('/sessao/palavra-passe', JSON.stringify({ atual: await derivarChave('Alcantara', PALAVRAS.Alcantara), nova: await derivarChave('Alcantara', 'nova-palavra') }), { quem: 'Alcantara' });
      assert.equal(r.status, 200); sessoes.Alcantara = r.headers.get('set-cookie').split(';')[0];
      assert.equal((await (await fetch(base + '/sessao', { headers: { Cookie: antiga } })).json()).sessao, null);
      assert.equal((await (await get('/sessao', 'Alcantara')).json()).sessao.utilizador, 'Alcantara');
      assert.equal((await entrar('Alcantara', PALAVRAS.Alcantara, 'y')).r.status, 401);
      assert.equal((await post('/sessao/palavra-passe', JSON.stringify({ atual: await derivarChave('Alcantara', 'errada'), nova: await derivarChave('Alcantara', 'outra') }), { quem: 'Alcantara' })).status, 403);
    },
    'bloqueio depois de 5 erros e reposição pela administração': async () => {
      const codigos = []; for (let i = 0; i < 6; i++) codigos.push((await entrar('Alcantara', 'errada-' + i, 'y')).r.status);
      assert.deepEqual(codigos.slice(-2), [429, 429]);
      assert.equal((await entrar('Alcantara', 'nova-palavra', 'y')).r.status, 429, 'a certa também espera');
      assert.equal((await post('/contas/Alcantara/palavra-passe', JSON.stringify({ nova: await derivarChave('Alcantara', 'reposta') }), { quem: 'Cidade.Teste' })).status, 403);
      assert.equal((await post('/contas/Alcantara/palavra-passe', JSON.stringify({ nova: await derivarChave('Alcantara', 'reposta') }), { quem: 'Admin.Teste' })).status, 200);
      assert.equal((await entrar('Alcantara', 'reposta')).r.status, 200);
      assert.ok((await (await get('/historico', 'Admin.Teste')).json()).historico.some(e => e.acao === 'repôs a palavra-passe' && e.alvo === 'Alcantara'));
    },
    'evento: todos leem, só a administração liga e desliga': async () => {
      assert.equal((await (await get('/evento')).json()).evento, null);
      assert.equal((await post('/evento', JSON.stringify({ id: 'iluminacao', nome: 'Levantamento Iluminação Pública', ativo: true }), { quem: 'Alcantara' })).status, 403);
      assert.equal((await post('/evento', JSON.stringify({ id: 'iluminacao', nome: 'Levantamento Iluminação Pública', ativo: true }), { quem: 'Cidade.Teste' })).status, 403);
      assert.equal((await post('/evento', JSON.stringify({ id: 'Má id!', ativo: true }), { quem: 'Admin.Teste' })).status, 400);
      const r = await post('/evento', JSON.stringify({ id: 'iluminacao', nome: 'Levantamento Iluminação Pública', ativo: true }), { quem: 'Admin.Teste' }); assert.equal(r.status, 200);
      const e = (await (await get('/evento')).json()).evento; assert.equal(e.ativo, true); assert.equal(e.nome, 'Levantamento Iluminação Pública'); assert.equal(e.por, 'Admin.Teste');
      assert.equal((await post('/evento', JSON.stringify({ id: 'iluminacao', ativo: false }), { quem: 'Admin.Teste' })).status, 200);
      assert.equal((await (await get('/evento')).json()).evento.ativo, false);
      const { historico } = await (await get('/historico', 'Admin.Teste')).json(); assert.ok(historico.some(x => x.acao === 'ativou o evento' && x.utilizador === 'Admin.Teste')); assert.ok(historico.some(x => x.acao === 'desativou o evento'));
    },
    'terminar a sessão': async () => {
      const r = await post('/sessao/terminar', '', { quem: 'Alcantara' }); assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal((await post('/guardar?freguesia=alcantara', JSON.stringify({ preset: 'x', elementos: [] }))).status, 401);
    },
    'cópia do servidor central': async () => {
      const r = await fetch(base + '/copia-central?chave=' + encodeURIComponent('presets/belem/x/1.json') + '&versao=10-a', { method: 'POST', headers: { Origin: base }, body: '{"revisao":1}' }); assert.equal(r.status, 200);
      assert.equal((await (await fetch(base + '/copia-central/presets/belem/x/1.json')).json()).revisao, 1);
      assert.equal((await (await fetch(base + '/copia-central/versoes.json')).json())['presets/belem/x/1.json'], '10-a');
      assert.ok(fs.existsSync(path.join(gravavel, 'copia-central', 'presets', 'belem', 'x', '1.json')), 'não ficou na pasta gravável');
      assert.equal((await fetch(base + '/copia-central?chave=' + encodeURIComponent('historico/2026-10.json'), { method: 'POST', headers: { Origin: base }, body: '[]' })).status, 200);
      assert.equal((await fetch(base + '/copia-central?chave=' + encodeURIComponent('contas/segredo.json'), { method: 'POST', headers: { Origin: base }, body: '{}' })).status, 400);
      assert.equal((await fetch(base + '/copia-central?chave=' + encodeURIComponent('../../fora.json'), { method: 'POST', headers: { Origin: base }, body: '{}' })).status, 400);
      assert.equal((await fetch(base + '/copia-central?chave=chaves.json', { method: 'POST', headers: { Origin: base }, body: 'não é json' })).status, 400);
      assert.equal((await fetch(base + '/copia-central?chave=chaves.json', { method: 'POST', headers: { Origin: 'http://exemplo.pt' }, body: '{}' })).status, 403);
      assert.ok((await (await fetch(base + '/ambiente.json')).json()).copia.endsWith('copia-central'));
    },
    'as contas ficam na pasta gravável, fora do que se serve': async () => {
      assert.ok(fs.existsSync(path.join(gravavel, '.contas', 'contas', 'contas.json')));
      assert.ok(!fs.readFileSync(path.join(gravavel, '.contas', 'contas', 'contas.json'), 'utf8').includes('nova-palavra'));
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
