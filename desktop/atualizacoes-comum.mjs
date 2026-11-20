// A parte das atualizações que não depende do Electron (desktop/atualizacoes.mjs usa-a; desktop/testar-atualizacoes.mjs
// testa-a com o Node, em cada sistema, na compilação automática): versões, latest*.yml e os guiões que trocam os ficheiros
// depois de a aplicação fechar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ---------- versões ----------
const partes = v => String(v || '').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
export function maisNova(a, b) { const x = partes(a), y = partes(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }

// o latest*.yml que o electron-builder escreve: «version», «files» (url, sha512, size) e «releaseDate»
export function lerYml(texto) {
  const r = { versao: '', ficheiros: [] }; let atual = null;
  for (const linha of String(texto).split(/\r?\n/)) {
    let m;
    if ((m = /^version:\s*'?([^'\s]+)'?/.exec(linha))) r.versao = m[1];
    else if ((m = /^\s*-\s*url:\s*'?(.+?)'?\s*$/.exec(linha))) r.ficheiros.push(atual = { url: m[1] });
    else if (atual && (m = /^\s+(sha512|size):\s*'?(.+?)'?\s*$/.exec(linha))) atual[m[1]] = m[1] === 'size' ? Number(m[2]) : m[2];
    else if (/^\S/.test(linha)) atual = null;
  }
  return r;
}

// macOS: sh -c GUIAO_MAC troca <pid> <app> <app nova> <pasta da app nova> <reabrir 0|1>
// espera que a aplicação feche, troca a .app (se a nova falhar, repõe a antiga), tira a quarentena e, se pedido, reabre
export const GUIAO_MAC = 'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done\nrm -rf "$2.antigo"\nif mv "$2" "$2.antigo"; then if mv "$3" "$2"; then rm -rf "$2.antigo" "$4"; else mv "$2.antigo" "$2"; fi; fi\n/usr/bin/xattr -dr com.apple.quarantine "$2" 2>/dev/null\n[ "$5" = 1 ] && /usr/bin/open "$2"\nexit 0\n';

// Windows, portátil: PowerShell que espera que o .exe aberto se solte (até 5 minutos), põe o novo no lugar (com o nome da
// versão nova, se o antigo tinha versão no nome), apaga o antigo e, se pedido, abre o novo com os mesmos argumentos
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
export function guiaoPortatil({ antigo, novo, destino, relancar, args = [], apagar = '' }) {
  return [
    "$ErrorActionPreference = 'Stop'",
    apagar ? `Remove-Item -LiteralPath ${literal(apagar)} -Force -ErrorAction SilentlyContinue` : '', // o .vbs que o lançou
    `$antigo = ${literal(antigo)}; $novo = ${literal(novo)}; $destino = ${literal(destino)}; $guardado = $antigo + '.antigo'`,
    'Remove-Item -LiteralPath $guardado -Force -ErrorAction SilentlyContinue',
    '$livre = $false; for ($i = 0; $i -lt 600 -and -not $livre; $i++) { try { Move-Item -LiteralPath $antigo -Destination $guardado -Force; $livre = $true } catch { Start-Sleep -Milliseconds 500 } }',
    'if (-not $livre) { exit 1 }',
    'try { Move-Item -LiteralPath $novo -Destination $destino -Force } catch { Move-Item -LiteralPath $guardado -Destination $antigo -Force; $destino = $antigo }',
    // o antigo pode ficar preso uns segundos (o antivírus a lê-lo); se nem assim sair, a aplicação apaga-o ao abrir
    'for ($i = 0; $i -lt 40 -and (Test-Path -LiteralPath $guardado); $i++) { Remove-Item -LiteralPath $guardado -Force -ErrorAction SilentlyContinue; if (Test-Path -LiteralPath $guardado) { Start-Sleep -Milliseconds 500 } }',
    relancar ? `Start-Process -FilePath $destino${args.length ? ' -ArgumentList ' + args.map(literal).join(',') : ''}` : '',
  ].join('\n');
}

// corre um guião de PowerShell escondido que sobrevive à aplicação: os filhos «normais» morrem com ela (o Node põe-nos num
// job do Windows) e um PowerShell à parte («detached») não arranca sem consola; o wscript, que não tem consola, lança-o.
// O .vbs só tem ASCII (o guião vai em base64), por isso caminhos com acentos não se estragam.
export function lancarPowerShell(fazer) {
  const vbs = path.join(os.tmpdir(), `ps-lisboa-${process.pid}-${Date.now()}.vbs`);
  const b64 = Buffer.from(fazer(vbs), 'utf16le').toString('base64');
  fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${b64}", 0, False\r\n`, 'ascii');
  const p = spawn('wscript.exe', ['//B', '//Nologo', vbs], { detached: true, stdio: 'ignore', windowsHide: true }); p.unref();
  return vbs;
}
