// Servidor local da versão browser (sem dependências): serve a apresentação e aceita as gravações do modo de edição.
//   node tools/serve.mjs                → http://localhost:8081 (só neste computador)
//   HOST=0.0.0.0 node tools/serve.mjs   → também na rede local (para ver noutro aparelho; a gravação continua só a partir deste computador)
//   PORT=8090 node tools/serve.mjs      → noutra porta
// O servidor em si está em tools/servidor.mjs, que é o mesmo que a aplicação de computador usa (desktop/main.mjs);
// aqui a pasta da apresentação é também a pasta onde se grava.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidor } from './servidor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8081;
const HOST = process.env.HOST || '127.0.0.1';
criarServidor({ raiz: ROOT }).listen(PORT, HOST, () => console.log(`Apresentação disponível em http://localhost:${PORT}${HOST === '127.0.0.1' ? '' : ' (e na rede local: ' + HOST + ')'}; o modo de edição grava em dados/ e em dados/freguesias/<id>/`));
