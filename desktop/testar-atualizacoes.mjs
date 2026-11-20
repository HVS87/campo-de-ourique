// Verifica as atualizações da aplicação de computador sem a abrir (a compilação automática corre-o em cada sistema, depois
// de gerar os executáveis):   node desktop/testar-atualizacoes.mjs [pasta]      (pasta: dist)
//   - as versões e a leitura dos latest*.yml;
//   - cada latest*.yml da pasta: o ficheiro que indica existe e o sha512 e o tamanho conferem (é o que a aplicação confere);
//   - macOS: o latest-mac.yml tem o .zip, o .zip abre (ditto) e traz a .app, e o guião troca uma .app pela nova depois de
//     o processo sair (e repõe a antiga se a nova não estiver lá);
//   - Windows: o guião do portátil espera que o .exe preso se solte e troca-o pelo novo, com o nome da versão nova.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { maisNova, lerYml, GUIAO_MAC, guiaoPortatil, lancarPowerShell } from './atualizacoes-comum.mjs';

const DIST = path.resolve(process.argv[2] || 'dist');
const falhas = [];
const ok = (nome, cond, info) => { console.log((cond ? 'ok  ' : 'FALHOU ') + nome + (cond || info === undefined ? '' : ' :: ' + JSON.stringify(info))); if (!cond) falhas.push(nome); };
const espera = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'co-atualizacoes-'));

// versões e latest*.yml
ok('1.20.0 é mais nova do que 1.19.9', maisNova('1.20.0', '1.19.9') && !maisNova('1.19.9', '1.20.0') && !maisNova('1.19.0', '1.19.0') && maisNova('v2.0.0', '1.99.99'));
const exemplo = lerYml("version: 1.20.0\nfiles:\n  - url: PS-Lisboa-1.20.0.zip\n    sha512: abc==\n    size: 12\n  - url: PS-Lisboa-1.20.0.dmg\n    sha512: def==\n    size: 34\n    blockMapSize: 5\npath: PS-Lisboa-1.20.0.zip\nsha512: abc==\nreleaseDate: '2026-11-19T12:52:53.703Z'\n");
ok('lê o latest*.yml', exemplo.versao === '1.20.0' && exemplo.ficheiros.length === 2 && exemplo.ficheiros[1].url === 'PS-Lisboa-1.20.0.dmg' && exemplo.ficheiros[0].size === 12 && exemplo.ficheiros[1].sha512 === 'def==', exemplo);

const sha512 = f => new Promise((ok, falha) => { const h = crypto.createHash('sha512'); fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => ok(h.digest('base64'))).on('error', falha); });
const ymls = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter(f => /^latest.*\.yml$/.test(f)) : [];
for (const y of ymls) {
  const l = lerYml(fs.readFileSync(path.join(DIST, y), 'utf8'));
  ok(`${y}: versão ${l.versao} e ${l.ficheiros.length} ficheiro(s)`, l.versao && l.ficheiros.length, l);
  for (const f of l.ficheiros) {
    const p = path.join(DIST, f.url);
    ok(`${y}: ${f.url} existe, sha512 e tamanho conferem`, fs.existsSync(p) && fs.statSync(p).size === f.size && (await sha512(p)) === f.sha512);
  }
}

if (process.platform === 'darwin') {
  // o .zip das atualizações
  const y = path.join(DIST, 'latest-mac.yml');
  if (fs.existsSync(y)) {
    const zip = lerYml(fs.readFileSync(y, 'utf8')).ficheiros.find(f => /\.zip$/.test(f.url));
    ok('latest-mac.yml tem o .zip', !!zip);
    if (zip) {
      const pasta = path.join(tmp, 'zip'); fs.mkdirSync(pasta);
      execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(DIST, zip.url), pasta]);
      const app = fs.readdirSync(pasta).find(f => f.endsWith('.app'));
      ok('o .zip traz a .app com o executável', app && fs.readdirSync(path.join(pasta, app, 'Contents', 'MacOS')).length > 0, fs.readdirSync(pasta));
    }
  }
  // o guião da troca, com .apps de faz de conta
  const troca = async (comNova) => {
    const apl = path.join(tmp, 'Aplicacoes-' + comNova), app = path.join(apl, 'PS Lisboa.app'), prep = path.join(apl, '.ps-lisboa-atualizacao'), nova = path.join(prep, 'PS Lisboa - Repositório da Cidade.app');
    fs.mkdirSync(path.join(app, 'Contents'), { recursive: true }); fs.writeFileSync(path.join(app, 'Contents', 'versao'), 'antiga');
    if (comNova) { fs.mkdirSync(path.join(nova, 'Contents'), { recursive: true }); fs.writeFileSync(path.join(nova, 'Contents', 'versao'), 'nova'); }
    const aberta = spawn('/bin/sleep', ['2']); // a «aplicação» ainda aberta
    const g = spawn('/bin/sh', ['-c', GUIAO_MAC, 'troca', String(aberta.pid), app, nova, prep, '0'], { stdio: 'ignore' });
    await espera(800);
    const antesDeFechar = fs.readFileSync(path.join(app, 'Contents', 'versao'), 'utf8');
    await new Promise(r => g.on('exit', r));
    return { antesDeFechar, depois: fs.existsSync(app) ? fs.readFileSync(path.join(app, 'Contents', 'versao'), 'utf8') : '(sem app)', resto: fs.readdirSync(apl) };
  };
  let r = await troca(true);
  ok('macOS: espera que a aplicação feche e troca a .app pela nova', r.antesDeFechar === 'antiga' && r.depois === 'nova' && r.resto.join() === 'PS Lisboa.app', r);
  r = await troca(false);
  ok('macOS: sem a .app nova, a antiga fica', r.depois === 'antiga' && r.resto.includes('PS Lisboa.app') && !r.resto.includes('PS Lisboa.app.antigo'), r);
}

if (process.platform === 'win32') {
  // o guião do portátil: o .exe antigo está preso (como enquanto a aplicação está aberta) e solta-se 3 s depois
  const pasta = path.join(tmp, 'portátil ç'), antigo = path.join(pasta, 'PS-Lisboa-1.19.0-portatil.exe'), novo = path.join(pasta, '.PS-Lisboa-1.20.0-portatil.exe.novo'), destino = path.join(pasta, 'PS-Lisboa-1.20.0-portatil.exe');
  fs.mkdirSync(pasta); fs.writeFileSync(antigo, 'antigo'); fs.writeFileSync(novo, 'novo');
  const lit = s => "'" + s.replace(/'/g, "''") + "'";
  const preso = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [System.IO.File]::Open(${lit(antigo)}, 'Open', 'Read', 'None'); Start-Sleep -Seconds 3; $f.Close()`], { stdio: 'ignore' });
  await espera(1500);
  const vbs = lancarPowerShell(v => guiaoPortatil({ antigo, novo, destino, relancar: false, apagar: v })); // como a aplicação: pelo wscript
  await espera(800);
  const aMeio = fs.readdirSync(pasta).sort();
  await new Promise(r => preso.exitCode !== null ? r() : preso.on('exit', r));
  for (let i = 0; i < 40 && fs.readdirSync(pasta).join() !== path.basename(destino); i++) await espera(500);
  const fim = fs.readdirSync(pasta);
  ok('portátil: espera que o .exe se solte', aMeio.includes(path.basename(antigo)), aMeio);
  ok('portátil: fica só o .exe novo, com o nome da versão nova', fim.join() === path.basename(destino) && fs.readFileSync(destino, 'utf8') === 'novo', fim);
  ok('portátil: o guião lançado apaga-se', !fs.existsSync(vbs), vbs);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\natualizações ok');
process.exit(falhas.length ? 1 : 0);
