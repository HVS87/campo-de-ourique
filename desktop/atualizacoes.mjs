// Atualizações da aplicação de computador, nos três sistemas. Procura nas releases do GitHub ao arrancar, de 4 em 4 horas e
// ao acordar o computador. Com «Instalar as atualizações automaticamente» ligado (de origem), a versão nova transfere-se por
// trás, confere-se (sha512 do latest*.yml da release) e instala-se ao fechar a aplicação, ou já, com «Reiniciar agora».
// Desligado, só avisa; «Instalar agora» transfere, instala e reabre. Os dados do utilizador ficam sempre onde estão.
//   Windows, instalador e Linux, AppImage → electron-updater: o instalador corre em silêncio; o AppImage troca de ficheiro.
//   Windows, portátil → transfere o .exe novo (latest-portatil.yml) para a mesma pasta e, depois de a aplicação fechar,
//                        põe-no no lugar do antigo (enquanto está aberto, o .exe portátil fica preso).
//   macOS → transfere o .zip (latest-mac.yml), abre-o ao lado da aplicação e, depois de ela fechar, troca a .app
//           (sem a assinatura paga da Apple, o atualizador do macOS, Squirrel.Mac, recusa a versão nova).
// CO_ATUALIZACOES_URL aponta para outra pasta de releases (os testes servem uma local, com versões feitas para isso).
import { app, net, ipcMain, powerMonitor, Menu, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { maisNova, lerYml, GUIAO_MAC, guiaoPortatil, lancarPowerShell } from './atualizacoes-comum.mjs';

const RELEASES = 'https://github.com/HVS87/campo-de-ourique/releases';
const FONTE = (process.env.CO_ATUALIZACOES_URL || RELEASES + '/latest/download').replace(/\/+$/, '');
const HORAS = 4;

let janela = null, origem = '', registo = () => {}, au = null, aTrabalhar = null, relancar = false;
const estado = { versao: app.getVersion(), modo: '', auto: true, fase: 'parado', nova: '', progresso: 0, erro: '', quando: 0, pagina: RELEASES + '/latest' };
// fases: parado · a-procurar · atual · disponivel · a-transferir · pronta (instala-se ao fechar) · erro · manual (este sistema não
// se atualiza sozinho: só avisa e leva à página das versões) · desligado (desenvolvimento)

function modoDeste() {
  if (!app.isPackaged) return 'desenvolvimento';
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_FILE ? 'portatil' : 'instalador';
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'appimage' : 'linux';
  return 'outro';
}

// ---------- preferência (fica na pasta de dados, sobrevive às atualizações) ----------
const ficheiroPrefs = () => path.join(app.getPath('userData'), 'preferencias.json');
function lerPrefs() { try { return JSON.parse(fs.readFileSync(ficheiroPrefs(), 'utf8')) || {}; } catch (err) { return {}; } }
function gravarPrefs(p) { try { fs.writeFileSync(ficheiroPrefs(), JSON.stringify({ ...lerPrefs(), ...p }, null, 1)); } catch (err) { registo('preferências: ' + err.message); } }

function mudar(campos) {
  Object.assign(estado, campos);
  if (janela && !janela.isDestroyed()) janela.webContents.send('atualizacoes:mudou', { ...estado });
  const m = Menu.getApplicationMenu(); const item = m && m.getMenuItemById('atualizar-auto'); if (item) item.checked = estado.auto;
}

async function buscarTexto(nome) {
  const r = await net.fetch(FONTE + '/' + nome, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(r.status === 404 ? 'a versão nova ainda está a ser preparada' : 'resposta ' + r.status);
  return r.text();
}

// transfere com progresso e confere o sha512; sem dados durante um minuto, desiste
async function transferir(ficheiro, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const parcial = destino + '.parcial', ctl = new AbortController(); let parado = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await net.fetch(FONTE + '/' + encodeURIComponent(ficheiro.url), { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error('transferência: resposta ' + r.status);
    const total = ficheiro.size || Number(r.headers.get('content-length')) || 0, hash = crypto.createHash('sha512'), saida = fs.createWriteStream(parcial);
    let feito = 0, ultimo = 0;
    for await (const pedaco of r.body) {
      clearTimeout(parado); parado = setTimeout(() => ctl.abort(), 60000);
      hash.update(pedaco); feito += pedaco.length;
      if (!saida.write(pedaco)) await new Promise(ok => saida.once('drain', ok));
      const p = total ? Math.min(99, Math.floor(feito * 100 / total)) : 0; if (p !== ultimo) { ultimo = p; mudar({ progresso: p }); }
    }
    await new Promise((ok, falha) => saida.end(e => e ? falha(e) : ok()));
    if (ficheiro.sha512 && hash.digest('base64') !== ficheiro.sha512) throw new Error('o ficheiro transferido não confere (sha512); não foi instalado');
    fs.rmSync(destino, { force: true }); fs.renameSync(parcial, destino);
    return destino;
  } catch (err) { fs.rmSync(parcial, { force: true }); throw err; } finally { clearTimeout(parado); }
}
const pastaTransferencias = () => path.join(app.getPath('userData'), 'atualizacao');

// ---------- Windows (instalador) e Linux (AppImage): electron-updater ----------
async function atualizador() {
  if (au) return au;
  const { default: m } = await import('electron-updater');
  au = m.autoUpdater;
  au.logger = { info: () => {}, warn: x => registo('atualizações: ' + x), error: x => registo('atualizações: ' + x), debug: () => {} };
  au.autoDownload = false; au.autoInstallOnAppQuit = estado.auto; au.allowDowngrade = false;
  if (process.env.CO_ATUALIZACOES_URL) au.setFeedURL({ provider: 'generic', url: FONTE });
  au.on('download-progress', p => mudar({ fase: 'a-transferir', progresso: Math.min(99, Math.floor(p.percent || 0)) }));
  au.on('update-downloaded', info => { mudar({ fase: 'pronta', nova: info.version, progresso: 100 }); });
  au.on('error', err => registo('atualizações: ' + (err && err.message)));
  return au;
}
async function procurarEU() {
  const u = await atualizador();
  const r = await u.checkForUpdates();
  const nova = r && r.updateInfo && r.updateInfo.version;
  if (!nova || !maisNova(nova, estado.versao)) return null;
  return nova;
}
async function transferirEU() { const u = await atualizador(); mudar({ fase: 'a-transferir', progresso: 0 }); await u.downloadUpdate(); }

// ---------- Windows (portátil) ----------
const exePortatil = () => process.env.PORTABLE_EXECUTABLE_FILE;
let infoNova = null;
async function procurarProprio() {
  infoNova = lerYml(await buscarTexto(estado.modo === 'mac' ? 'latest-mac.yml' : 'latest-portatil.yml'));
  return infoNova.versao && maisNova(infoNova.versao, estado.versao) ? infoNova.versao : null;
}
function escolherFicheiro() {
  const l = infoNova.ficheiros.filter(f => estado.modo === 'mac' ? /\.zip$/i.test(f.url) : /\.exe$/i.test(f.url));
  return l.find(f => f.url.includes(process.arch)) || l.find(f => !/(arm64|x64|universal)/.test(f.url)) || l[0];
}
// o .exe novo transfere-se para a mesma pasta (.novo) e troca-se depois de a aplicação fechar: enquanto está aberta, o .exe
// portátil fica preso (nem muda de nome). O nome com a versão passa a ser o da versão nova; um nome sem versão mantém-se.
function destinoPortatil(nomeNovo) { const exe = exePortatil(); return /\d+\.\d+\.\d+/.test(path.basename(exe)) ? path.join(path.dirname(exe), nomeNovo) : exe; }
const novoPortatil = nomeNovo => path.join(path.dirname(exePortatil()), '.' + nomeNovo + '.novo');
let exeNovo = null, exeDestino = null;
function trocarPortatil() { // um PowerShell à parte espera que o .exe se solte, troca-o e, se pedido, abre o novo
  const args = process.argv.slice(1).filter(a => !/^--(type|updated)/.test(a));
  lancarPowerShell(vbs => guiaoPortatil({ antigo: exePortatil(), novo: exeNovo, destino: exeDestino, relancar, args, apagar: vbs }));
}
function podeEscreverPasta(p) { const t = path.join(p, '.ps-lisboa-teste-' + process.pid); try { fs.writeFileSync(t, ''); fs.rmSync(t); return true; } catch (err) { return false; } }
export function limparPortatil() { // ao arrancar: restos de uma atualização que não chegou ao fim
  const exe = exePortatil(); if (!exe) return;
  try { for (const f of fs.readdirSync(path.dirname(exe))) if (f.endsWith('.exe.antigo') || (f.startsWith('.') && f.endsWith('.exe.novo'))) fs.rmSync(path.join(path.dirname(exe), f), { force: true }); } catch (err) { /* fica para a próxima */ }
}

// ---------- macOS ----------
const appMac = () => path.resolve(process.execPath, '..', '..', '..'); // …/PS Lisboa.app/Contents/MacOS/PS Lisboa
const preparadaMac = () => path.join(path.dirname(appMac()), '.ps-lisboa-atualizacao');
function podeEscrever(p) { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch (err) { return false; } }
async function prepararMac(zip) {
  const pasta = preparadaMac(); fs.rmSync(pasta, { recursive: true, force: true }); fs.mkdirSync(pasta);
  await new Promise((ok, falha) => execFile('/usr/bin/ditto', ['-x', '-k', zip, pasta], e => e ? falha(e) : ok()));
  const nova = fs.readdirSync(pasta).find(f => f.endsWith('.app'));
  if (!nova) throw new Error('o .zip não tem a aplicação');
  fs.rmSync(zip, { force: true });
  return path.join(pasta, nova);
}
let appNova = null;
function trocarMac() { // corre depois de a aplicação fechar: troca a .app, tira a quarentena e, se pedido, reabre
  spawn('/bin/sh', ['-c', GUIAO_MAC, 'troca', String(process.pid), appMac(), appNova, preparadaMac(), relancar ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- procurar, transferir, instalar ----------
const usaEU = () => estado.modo === 'instalador' || estado.modo === 'appimage';
const usaProprio = () => estado.modo === 'portatil' || estado.modo === 'mac';

export async function procurar(manual = false) {
  if (aTrabalhar) return aTrabalhar;
  if (['desenvolvimento', 'outro'].includes(estado.modo) && !process.env.CO_ATUALIZACOES_URL) { mudar({ fase: 'desligado' }); return estado; }
  if (estado.fase === 'pronta' || estado.fase === 'a-transferir') return estado;
  aTrabalhar = (async () => {
    mudar({ fase: 'a-procurar', erro: '' });
    try {
      let nova;
      if (usaEU()) nova = await procurarEU();
      else if (usaProprio()) nova = await procurarProprio();
      else { infoNova = lerYml(await buscarTexto('latest-linux.yml')); nova = maisNova(infoNova.versao, estado.versao) ? infoNova.versao : null; }
      if (!nova) { mudar({ fase: 'atual', nova: '', quando: Date.now() }); return estado; }
      if (estado.modo === 'linux') { mudar({ fase: 'manual', nova, quando: Date.now() }); return estado; }
      if (estado.modo === 'portatil' && !podeEscreverPasta(path.dirname(exePortatil()))) { mudar({ fase: 'manual', nova, quando: Date.now(), erro: 'sem permissão para escrever em ' + path.dirname(exePortatil()) }); return estado; }
      if (estado.modo === 'mac' && !podeEscrever(path.dirname(appMac()))) { mudar({ fase: 'manual', nova, quando: Date.now(), erro: 'sem permissão para escrever em ' + path.dirname(appMac()) }); return estado; }
      mudar({ fase: 'disponivel', nova, quando: Date.now() });
      if (estado.auto) await obter();
    } catch (err) {
      registo('atualizações: ' + (err && err.message));
      mudar({ fase: 'erro', erro: String(err && err.message || err), quando: Date.now() });
    }
    return estado;
  })();
  try { return await aTrabalhar; } finally { aTrabalhar = null; }
}

async function obter() { // transfere e deixa pronta a instalar
  if (usaEU()) { await transferirEU(); return; }
  mudar({ fase: 'a-transferir', progresso: 0 });
  const f = escolherFicheiro(); if (!f) throw new Error('a release não tem o ficheiro para este sistema');
  if (estado.modo === 'portatil') { exeNovo = await transferir(f, novoPortatil(path.basename(f.url))); exeDestino = destinoPortatil(path.basename(f.url)); }
  else appNova = await prepararMac(await transferir(f, path.join(pastaTransferencias(), path.basename(f.url))));
  mudar({ fase: 'pronta', progresso: 100 });
}

export async function instalarAgora() { // transfere (se ainda não), instala e reabre
  if (estado.fase === 'disponivel' || estado.fase === 'erro') { try { mudar({ erro: '' }); await obter(); } catch (err) { mudar({ fase: 'erro', erro: String(err && err.message || err) }); return estado; } }
  if (estado.fase !== 'pronta') return estado;
  relancar = true;
  if (usaEU()) { au.autoInstallOnAppQuit = true; setImmediate(() => au.quitAndInstall(true, true)); return estado; }
  app.quit(); // portátil e macOS: a troca corre em will-quit e reabre a versão nova
  return estado;
}

export function definirAuto(ligar) {
  gravarPrefs({ atualizacoesAutomaticas: !!ligar });
  mudar({ auto: !!ligar });
  if (au) au.autoInstallOnAppQuit = !!ligar; // desligado, a versão já transferida só se instala com «Instalar agora»
  if (ligar && estado.fase === 'disponivel') procurar().catch(() => {});
  return estado;
}

async function procurarComDialogo() {
  const r = await procurar(true), d = o => dialog.showMessageBox(janela, { type: 'info', buttons: ['Fechar'], ...o });
  if (r.fase === 'atual') d({ message: 'Já tens a versão mais recente (' + r.versao + ').' });
  else if (r.fase === 'erro') d({ type: 'warning', message: 'Não foi possível procurar atualizações.', detail: r.erro });
  else if (r.fase === 'desligado') d({ message: 'Em desenvolvimento não há atualizações.' });
  else if (r.fase === 'manual') { const x = await d({ message: `Há uma versão nova (${r.nova}).`, detail: 'Neste sistema instala-se à mão: transfere-a da página das versões.' + (r.erro ? '\n(' + r.erro + ')' : ''), buttons: ['Abrir a página', 'Fechar'], defaultId: 0, cancelId: 1 }); if (x.response === 0) shell.openExternal(r.pagina); }
  else if (r.fase === 'disponivel') { const x = await d({ message: `Há uma versão nova (${r.nova}).`, detail: 'As atualizações automáticas estão desligadas. Instalar agora? A aplicação reabre sozinha; os teus dados ficam como estão.', buttons: ['Instalar agora', 'Mais tarde'], defaultId: 0, cancelId: 1 }); if (x.response === 0) instalarAgora(); }
  else if (r.fase === 'pronta') { const x = await d({ message: `A versão ${r.nova} está pronta.`, detail: 'Instala-se quando fechares a aplicação. Os teus dados ficam como estão.', buttons: ['Reiniciar agora', 'Mais tarde'], defaultId: 0, cancelId: 1 }); if (x.response === 0) instalarAgora(); }
}
export const itensMenu = () => [
  { label: 'Procurar atualizações', click: () => procurarComDialogo() },
  { id: 'atualizar-auto', label: 'Instalar as atualizações automaticamente', type: 'checkbox', checked: estado.auto, click: i => definirAuto(i.checked) },
];

// ---------- ligação à página (desktop/preload.cjs) ----------
export function iniciar({ janela: j, origem: o, registo: r, teste }) {
  janela = j; origem = o; registo = r || registo;
  estado.modo = modoDeste();
  estado.auto = lerPrefs().atualizacoesAutomaticas !== false;
  if (estado.modo === 'portatil') limparPortatil();
  const daPagina = e => { const u = e.senderFrame && e.senderFrame.url || ''; if (!u.startsWith(origem + '/')) throw new Error('pedido recusado'); };
  ipcMain.handle('atualizacoes:estado', e => { daPagina(e); return { ...estado }; });
  ipcMain.handle('atualizacoes:auto', (e, ligar) => { daPagina(e); return { ...definirAuto(ligar) }; });
  ipcMain.handle('atualizacoes:procurar', async e => { daPagina(e); return { ...(await procurar(true)) }; });
  ipcMain.handle('atualizacoes:instalar', async e => { daPagina(e); return { ...(await instalarAgora()) }; });
  app.on('will-quit', () => { // portátil e macOS: trocar depois de fechar (automáticas ligadas, ou «Instalar agora»)
    if (estado.fase !== 'pronta' || !(estado.auto || relancar)) return;
    try { if (estado.modo === 'mac' && appNova) trocarMac(); else if (estado.modo === 'portatil' && exeNovo) trocarPortatil(); } catch (err) { registo('atualizações: ' + err.message); }
  });
  if (teste) return;
  setTimeout(() => procurar().catch(() => {}), 5000);
  setInterval(() => procurar().catch(() => {}), HORAS * 3600 * 1000);
  powerMonitor.on('resume', () => setTimeout(() => procurar().catch(() => {}), 15000));
}
export const estadoAtual = () => ({ ...estado });
export const aReiniciar = () => relancar; // a fechar para instalar: a página já perguntou pelas alterações por guardar
