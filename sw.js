// Service worker da app instalada: guarda a apresentação para abrir depressa e sem internet.
// As imagens e as bibliotecas vêm logo do que está guardado (e atualizam-se por trás); o resto vem da rede, com o guardado
// como reserva, para quem tem rede ver sempre os dados mais recentes. Contas, sessões, evento e cópia central nunca se guardam;
// a API e o que vem de outros sites (satélite em direto) passam ao lado.
const CACHE = 'co-v7';
const BASE = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'dados/freguesias/index.js', 'dados/freguesias/limites.js', 'dados/freguesias/ruas-cidade.js', 'vendor/jspdf/jspdf.umd.min.js', 'relatorios/evento.js', 'assets/lisboa-dgt-2023.jpg', 'assets/lisboa-dgt-2023-alto.jpg', 'assets/icones/icone-192.png', 'assets/icones/icone-512.png', 'assets/icones/ps-logotipo.png'];
const NUNCA = /\/(api|consulta|sessao|eventos?|definicoes|categorias|historico|contas|guardar|ativar-preset|apagar-preset|guardar-foto|copia-central)(\/|$)|\/ambiente\.json$/;
const ESTAVEL = /\.(jpe?g|png|webp|gif|avif|svg|woff2)$|\/vendor\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => { /* fica para a primeira visita */ })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(l => Promise.all(l.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const chave = pedido => { const u = new URL(pedido.url); return u.origin + u.pathname; }; // ?t=… e ?freguesia=… são o mesmo ficheiro: uma só entrada, sempre a mais recente
async function guardar(pedido, resposta) { if (resposta && resposta.ok && resposta.type === 'basic') { try { const c = await caches.open(CACHE); await c.put(chave(pedido), resposta.clone()); } catch (err) { /* sem espaço: a resposta da rede serve na mesma */ } } return resposta; }
const guardado = pedido => caches.match(chave(pedido));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || NUNCA.test(u.pathname)) return;
  if (ESTAVEL.test(u.pathname)) {
    e.respondWith(guardado(r).then(g => { const rede = fetch(r).then(x => guardar(r, x)); if (g) { rede.catch(() => {}); return g; } return rede; }));
    return;
  }
  e.respondWith(fetch(r).then(x => guardar(r, x)).catch(async err => {
    const g = await guardado(r); if (g) return g;
    if (r.mode === 'navigate') { const i = await caches.match('index.html'); if (i) return i; }
    throw err;
  }));
});
