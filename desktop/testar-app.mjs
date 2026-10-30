// Verifica o arranque da aplicação de computador: abre-a em modo de teste (sem janela visível), com uma pasta de
// dados temporária, espera que a apresentação monte o mapa e confirma que não houve erros na consola.
//   node desktop/testar-app.mjs                               → a partir do código (Electron de node_modules)
//   node desktop/testar-app.mjs "dist/win-unpacked/Campo de Ourique.exe"  → o programa já gerado
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.argv[2] ? path.resolve(process.argv[2]) : createRequire(import.meta.url)('electron');
const args = process.argv[2] ? [] : [RAIZ];
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'co-app-teste-'));
const filho = spawn(exe, args, { env: { ...process.env, CO_TESTE: '1', CO_PASTA_DADOS: dados, ELECTRON_ENABLE_LOGGING: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let saida = '';
filho.stdout.on('data', d => { saida += d; });
filho.stderr.on('data', d => { saida += d; });
const limite = setTimeout(() => { console.log('FALHA: a aplicação não respondeu em 60 s'); filho.kill(); }, 60000);
filho.on('exit', codigo => {
  clearTimeout(limite);
  const m = /RESULTADO (.+)/.exec(saida);
  const r = m ? JSON.parse(m[1]) : null;
  if (r) console.log(JSON.stringify(r, null, 1)); else console.log(saida.slice(-2000));
  const ok = codigo === 0 && r && r.ok && r.arranque && r.arranque.app === true;
  console.log(ok ? '\naplicação ok' : '\nFALHA (código ' + codigo + ')');
  fs.rmSync(dados, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
});
