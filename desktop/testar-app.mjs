// Verifica o arranque da aplicação de computador: abre-a em modo de teste (sem janela visível), com uma pasta de
// dados temporária e uma conta de teste, espera que a apresentação monte o mapa, entra, grava e confirma que não houve erros na consola.
//   node desktop/testar-app.mjs                               → a partir do código (Electron de node_modules)
//   node desktop/testar-app.mjs "dist/win-unpacked/Campo de Ourique.exe"  → o programa já gerado
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { derivarChave, verificadorDe } from '../servidor-central/contas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.argv[2] ? path.resolve(process.argv[2]) : createRequire(import.meta.url)('electron');
const args = process.argv[2] ? [] : [RAIZ];
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'co-app-teste-'));
// uma conta de teste (as verdadeiras não estão aqui), já no sítio onde a aplicação guarda as contas
const UTILIZADOR = 'Teste.App', PALAVRA = 'palavra-de-teste-' + Math.random().toString(36).slice(2);
const contas = path.join(dados, 'dados-do-utilizador', '.contas', 'contas'); fs.mkdirSync(contas, { recursive: true });
fs.writeFileSync(path.join(contas, 'contas.json'), JSON.stringify({ contas: [{ utilizador: UTILIZADOR, nome: 'Teste', papel: 'cidade', freguesias: ['*'], verificador: await verificadorDe(await derivarChave(UTILIZADOR, PALAVRA)), versao: 1, ativa: true, falhas: 0, bloqueadaAte: 0 }] }));
const filho = spawn(exe, args, { env: { ...process.env, CO_TESTE: '1', CO_PASTA_DADOS: dados, CO_TESTE_UTILIZADOR: UTILIZADOR, CO_TESTE_PALAVRA: PALAVRA, ELECTRON_ENABLE_LOGGING: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
