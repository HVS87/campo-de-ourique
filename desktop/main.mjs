// Aplicação de computador (Electron): a mesma apresentação da versão browser (index.html, dados/, assets/),
// servida pelo mesmo servidor (tools/servidor.mjs) num endereço local, numa janela própria. Funciona sem internet
// (o satélite em direto passa para as imagens guardadas); o que se grava fica na pasta de dados do utilizador,
// fora do programa, e sobrevive às atualizações.
//   npm run app        → abre a aplicação a partir do código (desenvolvimento)
//   npm run dist       → gera o instalador e a versão portátil para Windows em dist/
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidor } from '../tools/servidor.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA_BASE = 47831; // porta fixa: o que a página guarda no browser (gravação automática, fila do servidor central) depende da origem
const TESTE = process.env.CO_TESTE === '1'; // arranque de verificação (desktop/testar-app.mjs): abre, confere e fecha
let janela = null, origem = '';
if (process.env.CO_PASTA_DADOS) app.setPath('userData', process.env.CO_PASTA_DADOS); // para os testes não mexerem nos dados verdadeiros

if (!app.requestSingleInstanceLock()) app.quit(); // uma só instância: a segunda traz a primeira para a frente
app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });

const pastaDados = () => path.join(app.getPath('userData'), 'dados-do-utilizador');
const registo = linha => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'registo.txt'), new Date().toISOString() + ' ' + linha + '\n'); } catch (err) { /* sem registo */ } };

function arrancarServidor() { // primeira porta livre a partir de PORTA_BASE, só neste computador
  const srv = criarServidor({ raiz: RAIZ, gravavel: pastaDados(), app: true, versao: app.getVersion(), registo });
  return new Promise((ok, falha) => {
    let porta = PORTA_BASE;
    const tentar = () => srv.listen(porta, '127.0.0.1');
    srv.on('listening', () => ok(porta));
    srv.on('error', err => { if (err.code === 'EADDRINUSE' && porta < PORTA_BASE + 9) { porta++; tentar(); } else falha(err); });
    tentar();
  });
}

function menu() {
  const ir = url => () => shell.openExternal(url);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Ficheiro', submenu: [
      { label: 'Abrir a pasta dos meus dados', click: () => { fs.mkdirSync(pastaDados(), { recursive: true }); shell.openPath(pastaDados()); } },
      { label: 'Abrir a cópia do servidor central', click: () => { const p = path.join(pastaDados(), 'copia-central'); fs.mkdirSync(p, { recursive: true }); shell.openPath(p); } },
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close', label: 'Fechar' } : { role: 'quit', label: 'Sair' },
    ] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Anular' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recarregar' }, { type: 'separator' },
      { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { role: 'resetZoom', label: 'Tamanho normal' }, { type: 'separator' },
      { role: 'togglefullscreen', label: 'Ecrã inteiro' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Ferramentas de programação' }]),
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Página do projeto', click: ir('https://github.com/HVS87/campo-de-ourique') },
      { label: 'Procurar atualizações', click: () => procurarAtualizacoes(true) },
      { label: 'Sobre', click: () => dialog.showMessageBox(janela, { type: 'info', title: 'Sobre', message: 'Campo de Ourique ' + app.getVersion(), detail: 'Apresentação interativa das freguesias de Lisboa.\nCódigo MIT; dados e imagens de terceiros com as suas licenças (LICENCAS-TERCEIROS.md).\n\nOs teus dados: ' + pastaDados(), buttons: ['Fechar'] }) },
    ] },
  ]));
}

// atualizações automáticas pelas releases do GitHub (só no instalador; a versão portátil e o desenvolvimento não se atualizam sozinhos)
const portatil = !!process.env.PORTABLE_EXECUTABLE_DIR;
async function procurarAtualizacoes(manual) {
  if (!app.isPackaged || portatil) { if (manual) dialog.showMessageBox(janela, { type: 'info', message: portatil ? 'A versão portátil não se atualiza sozinha.' : 'Em desenvolvimento não há atualizações.', detail: 'Transfere a versão nova em https://github.com/HVS87/campo-de-ourique/releases', buttons: ['Fechar'] }); return; }
  try {
    const { default: atualizador } = await import('electron-updater');
    const au = atualizador.autoUpdater;
    au.autoDownload = true; au.logger = null;
    au.removeAllListeners();
    au.on('update-downloaded', info => {
      dialog.showMessageBox(janela, { type: 'info', title: 'Atualização', message: `A versão ${info.version} está pronta.`, detail: 'Reinicia a aplicação para a instalar. Os teus dados ficam como estão.', buttons: ['Reiniciar agora', 'Mais tarde'], defaultId: 0, cancelId: 1 })
        .then(r => { if (r.response === 0) au.quitAndInstall(); });
    });
    if (manual) {
      au.once('update-not-available', () => dialog.showMessageBox(janela, { type: 'info', message: 'Já tens a versão mais recente (' + app.getVersion() + ').', buttons: ['Fechar'] }));
      au.once('error', err => dialog.showMessageBox(janela, { type: 'warning', message: 'Não foi possível procurar atualizações.', detail: String(err && err.message || err), buttons: ['Fechar'] }));
    } else au.on('error', () => { /* sem rede: tenta-se na próxima vez */ });
    await au.checkForUpdates();
  } catch (err) { registo('atualizações: ' + (err && err.message)); }
}

async function abrirJanela() {
  const porta = await arrancarServidor();
  origem = `http://127.0.0.1:${porta}`;
  registo(`servidor em ${origem}; dados em ${pastaDados()}`);
  janela = new BrowserWindow({
    width: 1600, height: 900, minWidth: 360, minHeight: 360, show: false, backgroundColor: '#e9edf2', title: 'Campo de Ourique',
    icon: path.join(RAIZ, 'desktop', 'recursos', 'icone.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  janela.once('ready-to-show', () => { if (!TESTE) { janela.maximize(); janela.show(); } });
  // ligações para fora (fontes, OpenStreetMap, servidor central…) abrem no browser do sistema
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(origem)) shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origem)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // fechar (ou recarregar) com alterações por guardar: a página já as pôs em rascunho; o Electron não mostra o aviso do
  // browser, por isso pergunta-se aqui
  janela.webContents.on('will-prevent-unload', e => {
    if (TESTE) { e.preventDefault(); return; }
    const r = dialog.showMessageBoxSync(janela, { type: 'warning', title: 'Alterações por guardar', message: 'Há alterações por guardar no modo de edição.',
      detail: 'Se fechares agora, ficam em rascunho neste computador e voltam quando a mesma conta entrar outra vez no modo de edição.',
      buttons: ['Fechar e manter em rascunho', 'Continuar a editar'], defaultId: 1, cancelId: 1, noLink: true });
    if (r === 0) e.preventDefault(); // preventDefault aqui deixa fechar
  });
  janela.webContents.session.setPermissionRequestHandler((wc, permissao, decidir) => decidir(['geolocation', 'fullscreen', 'clipboard-sanitized-write'].includes(permissao)));
  if (TESTE) { ligarTeste(); janela.webContents.on('dom-ready', () => janela.webContents.executeJavaScript('try { localStorage.setItem("co-visita-guiada", JSON.stringify({ feita: true, edicaoFeita: true })); } catch (e) {}').catch(() => {})); } // sem a visita guiada automática no teste
  await janela.loadURL(origem + '/');
}

function ligarTeste() { // verificação (desktop/testar-app.mjs): arranque, sessão e gravação na pasta do utilizador, outra freguesia e sem internet
  const erros = [];
  janela.webContents.on('console-message', (e, nivel, mensagem) => { const lv = e.level !== undefined ? e.level : nivel, msg = e.message !== undefined ? e.message : mensagem; if (lv === 'error' || lv === 3) erros.push(msg); });
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const js = codigo => janela.webContents.executeJavaScript(codigo).catch(err => ({ ok: false, erro: String(err) }));
  const carregar = url => new Promise(ok => { janela.webContents.once('did-finish-load', ok); janela.loadURL(url); });
  janela.webContents.once('did-finish-load', async () => {
    const r = { erros };
    await espera(4000);
    if (process.env.CO_CAPTURA) { const img = await janela.webContents.capturePage(); fs.writeFileSync(process.env.CO_CAPTURA, img.toPNG()); } // imagem da janela, para ver o aspeto
    r.arranque = await js(`(async () => { const M = window.__mapa; if (!M) return { ok: false }; const amb = await fetch('ambiente.json').then(r => r.json()); return { ok: true, freguesia: M.FREG.id, elementos: M.ELEMENTOS.length, presets: M.PRESETS.length, app: amb.app, versao: amb.versao }; })()`);
    // gravar: fica na pasta de dados do utilizador; o programa não muda
    r.gravar = await js(`(async () => { const M = window.__mapa; await M.entrarConta(${JSON.stringify(process.env.CO_TESTE_UTILIZADOR || '')}, ${JSON.stringify(process.env.CO_TESTE_PALAVRA || '')}); if (!(await M.pedirEdicao())) return { ok: false, erro: 'sem sessão' }; M.novoDesmaterializado(); const g = await M.guardar(); const t = await fetch('dados/presets/' + M.C.preset + '.js').then(r => r.text()); return { ok: g === 'servidor' && t.includes('Novo ponto desmaterializado'), guardar: g, preset: M.C.preset }; })()`);
    const gravado = path.join(pastaDados(), 'dados', 'presets', (r.gravar.preset || 'x') + '.js'), original = path.join(RAIZ, 'dados', 'presets', (r.gravar.preset || 'x') + '.js');
    r.gravar.naPastaDoUtilizador = fs.existsSync(gravado);
    r.gravar.programaIntacto = !fs.readFileSync(original, 'utf8').includes('Novo ponto desmaterializado');
    // outra freguesia
    await carregar(origem + '/?freguesia=alcantara'); await espera(3000);
    r.freguesia = await js(`({ ok: !!window.__mapa && window.__mapa.FREG.id === 'alcantara', ruas: window.__mapa && window.__mapa.RUAS_VISTA.length })`);
    // sem internet: tudo o que não é deste computador falha; a apresentação usa as imagens guardadas
    janela.webContents.session.webRequest.onBeforeRequest((d, decidir) => decidir({ cancel: !d.url.startsWith(origem) && /^https?:/.test(d.url) }));
    const antes = erros.length;
    await carregar(origem + '/?freguesia=campo-de-ourique'); await espera(5000);
    r.semInternet = await js(`({ ok: !!window.__mapa && !window.__mapa.map.hasLayer(window.__mapa.dgt), elementos: window.__mapa && window.__mapa.ELEMENTOS.length, aviso: document.querySelector('#aviso').textContent })`);
    erros.splice(antes, erros.length - antes, ...erros.slice(antes).filter(m => !/Failed to load resource|ERR_BLOCKED|net::/.test(m))); // os pedidos bloqueados de propósito não contam
    r.ok = [r.arranque, r.gravar, r.freguesia, r.semInternet].every(x => x && x.ok) && r.gravar.naPastaDoUtilizador && r.gravar.programaIntacto && !erros.length;
    process.stdout.write('RESULTADO ' + JSON.stringify(r) + '\n');
    app.exit(r.ok ? 0 : 1);
  });
}

app.whenReady().then(async () => {
  menu();
  try { await abrirJanela(); } catch (err) { dialog.showErrorBox('Campo de Ourique', 'Não foi possível arrancar: ' + (err && err.message)); app.quit(); return; }
  if (!TESTE) setTimeout(() => procurarAtualizacoes(false), 5000);
});
app.on('window-all-closed', () => app.quit());
