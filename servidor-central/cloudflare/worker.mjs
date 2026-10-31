// Servidor central e apresentação no Cloudflare Workers (plano grátis): a API de servidor-central/nucleo.mjs com os dados
// no R2, guardados na União Europeia (jurisdição «eu», ver wrangler.toml), e o site (pasta site/, gerada por
// tools/preparar-site.mjs) como ficheiros estáticos. Publicar: ver servidor-central/GUIA-CLOUDFLARE.md.
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
        const o = await r2.get(chave), atual = o ? await o.text() : null, novo = f(atual);
        if (novo == null || novo === atual) return; // nada mudou: não se grava
        const cond = o ? { etagMatches: o.etag } : { etagDoesNotMatch: '*' }; // novo objeto: só se ainda não existir
        const r = await r2.put(chave, novo, { onlyIf: cond, httpMetadata: { contentType: 'application/json; charset=utf-8' } });
        if (r) return;
        await new Promise(ok => setTimeout(ok, 40 * (tentativa + 1)));
      }
      throw Object.assign(new Error('Outro envio está a mexer no mesmo índice; tenta outra vez'), { codigo: 503 }); // 503: a fila da apresentação volta a tentar
    },
  };
}

// /dados/conteudos.js, /dados/presets/x.js, e os mesmos em /dados/freguesias/<id>/: o que está guardado no R2 ou, sem nada, o ficheiro
const FICHEIRO_DADOS = /^\/dados\/(?:freguesias\/([a-z0-9-]+)\/)?(conteudos\.js|presets\/[a-z0-9-]+\.js)$/;
async function servirDados(request, env, m) {
  const f = m[1] || 'campo-de-ourique', ficheiro = m[2];
  let base = null;
  if (ficheiro === 'presets/index.js') { try { const r = await env.ASSETS.fetch(request.url); base = JSON.parse((await r.text()).replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '')); } catch (err) { base = null; } }
  let d = null; try { d = await api.dadosApresentacao(f, ficheiro, base); } catch (err) { d = null; } // uma falha no R2 não pode deixar a página sem dados
  if (d && d.apagados) { // o preset dos ficheiros foi apagado: serve o primeiro dos que restam
    const pasta = m[0].slice(0, -'conteudos.js'.length), ativo = await env.ASSETS.fetch(request.url), txt = await ativo.text(), id = (/"preset": *"([^"]+)"/.exec(txt) || [])[1];
    if (id && d.apagados.includes(id)) { try { const r = await env.ASSETS.fetch(new URL(pasta + 'presets/index.js', request.url)), l = JSON.parse((await r.text()).replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '')), outro = l.find(p => !d.apagados.includes(p.id)); if (outro) return new Response((await (await env.ASSETS.fetch(new URL(pasta + 'presets/' + outro.id + '.js', request.url))).text()).replace('window.CONTEUDOS_PRESET', 'window.CONTEUDOS'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } }); } catch (err) { /* serve o ficheiro */ } }
    return env.ASSETS.fetch(request);
  }
  if (!d) return env.ASSETS.fetch(request);
  return new Response(request.method === 'HEAD' ? null : d.texto, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', ...(d.quando ? { 'Last-Modified': new Date(d.quando).toUTCString() } : {}) } });
}

let api = null; // uma por instância do Worker (guarda a chave das sessões já preparada entre pedidos)
export default {
  async fetch(request, env) {
    api = api || criarAPI({
      armazem: armazemR2(env.DADOS),
      nome: env.NOME || 'Servidor central das freguesias',
      origens: String(env.ORIGENS || '*').split(',').map(s => s.trim()).filter(Boolean),
      leituraPublica: env.LEITURA_PUBLICA === '1',
      chaveAdmin: env.CHAVE_ADMIN || '', // segredo: npx wrangler secret put CHAVE_ADMIN
      segredoSessoes: env.SEGREDO_SESSOES || '', // opcional; sem ele, o segredo das sessões é gerado na primeira vez e fica no R2
      pagina,
    });
    const m = env.ASSETS && (request.method === 'GET' || request.method === 'HEAD') ? FICHEIRO_DADOS.exec(new URL(request.url).pathname) : null;
    if (m) return servirDados(request, env, m);
    return api.tratar(request);
  },
};
