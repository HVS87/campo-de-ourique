// Servidor central no Cloudflare Workers (plano grátis): a API de servidor-central/nucleo.mjs com os dados no R2,
// guardados na União Europeia (jurisdição «eu», ver wrangler.toml). Publicar: ver servidor-central/README.md.
//   npm run central:local     → em http://127.0.0.1:8787 com um R2 simulado (dados em .wrangler/)
//   npm run central:publicar  → publica na conta Cloudflare (depois de «npx wrangler login»)
import pagina from '../consulta.html';
import { criarAPI } from '../nucleo.mjs';

function armazemR2(r2) {
  const listar = async prefixo => {
    const out = []; let cursor;
    do { const r = await r2.list({ prefix: prefixo, cursor }); for (const o of r.objects) out.push({ chave: o.key, tamanho: o.size, data: o.uploaded.toISOString() }); cursor = r.truncated ? r.cursor : undefined; } while (cursor);
    return out;
  };
  return {
    async ler(chave) { const o = await r2.get(chave); return o ? o.text() : null; },
    async escrever(chave, texto) { await r2.put(chave, texto, { httpMetadata: { contentType: 'application/json; charset=utf-8' } }); },
    async apagar(chave) { await r2.delete(chave); },
    listar,
    // ler-mudar-gravar sem pisar outro envio ao mesmo tempo: só grava se o objeto não mudou entretanto (etag), senão repete
    async atualizar(chave, f) {
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const o = await r2.get(chave), novo = f(o ? await o.text() : null);
        const cond = o ? { etagMatches: o.etag } : { etagDoesNotMatch: '*' }; // novo objeto: só se ainda não existir
        const r = await r2.put(chave, novo, { onlyIf: cond, httpMetadata: { contentType: 'application/json; charset=utf-8' } });
        if (r) return;
        await new Promise(ok => setTimeout(ok, 40 * (tentativa + 1)));
      }
      throw Object.assign(new Error('Outro envio está a mexer no mesmo índice; tenta outra vez'), { codigo: 503 }); // 503: a fila da apresentação volta a tentar
    },
  };
}

export default {
  async fetch(request, env) {
    const api = criarAPI({
      armazem: armazemR2(env.DADOS),
      nome: env.NOME || 'Servidor central das freguesias',
      origens: String(env.ORIGENS || '*').split(',').map(s => s.trim()).filter(Boolean),
      leituraPublica: env.LEITURA_PUBLICA === '1',
      chaveAdmin: env.CHAVE_ADMIN || '', // segredo: npx wrangler secret put CHAVE_ADMIN
      pagina,
    });
    return api.tratar(request);
  },
};
