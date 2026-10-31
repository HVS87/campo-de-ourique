// Relatório em PDF de um evento: primeiro o resumo da cidade, depois cada freguesia com o seu mapa e as fichas dos registos.
// Não sabe nada sobre nenhum evento em particular: recebe o evento (nome, tipos, termos) e os registos já juntos. Só se carrega
// quando se exporta, tal como a biblioteca de PDF (vendor/jspdf). Os mapas são desenhados em canvas: as imagens das freguesias
// vêm da apresentação e, com rede, o detalhe de cada ficha vem do satélite em direto da DGT (sem rede, recorta-se a imagem guardada).
//   RelatorioEvento.gerar({ evento, freguesias, limites, tipos, fotos, fonte, aoProgresso }) → Promise<Blob>
//     freguesias: [{ id, nome, ha, imagem: { ficheiro, bounds }, registos: [{ lat, lon, c, rua, numero, nome, texto, fotos, quando, precisao }] }]
//     competencia: quem tem de resolver (o nome, opcional); limites: window.LIMITES_FREGUESIAS; tipos: ids dos tipos a incluir (omitido: todos); fotos: incluir as fotos (omitido: sim)
window.RelatorioEvento = (function () {
  'use strict';
  const FERRAMENTA = 'PS Lisboa - Repositório da Cidade', LOGO = 'assets/icones/ps-logotipo.png';
  const WMS = 'https://ortos.dgterritorio.gov.pt/wms/ortosat2023?service=WMS&request=GetMap&layers=ortoSat2023-CorVerdadeira&styles=&format=image/jpeg&version=1.3.0&crs=EPSG:3857';
  const LARG = 210, ALT = 297, MARGEM = 15, UTIL = LARG - 2 * MARGEM, FUNDO_PAGINA = ALT - 16;
  const TINTA = '#1b2129', SUAVE = '#555d68', LINHA = '#d5dae0', TINTA_FRACA = '#eef0f2';
  const RAMPA = ['#cde2fb', '#9bc4f5', '#5d9eea', '#2a78d6', '#184f96']; // magnitude: um só tom, do claro para o escuro
  const SEM_TIPO = { id: 'sem', nome: 'Sem tipo', cor: '#8a929c' };

  // a letra do PDF só tem o alfabeto latino (Windows-1252): os emojis e outros símbolos saem do texto, para não aparecerem como lixo
  const CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const limpo = s => [...String(s == null ? '' : s).replace(/→/g, '->').replace(/\r/g, '')].filter(c => { const k = c.codePointAt(0); return c === '\n' || (k >= 32 && k < 127) || (k >= 160 && k <= 255) || CP1252.includes(c); }).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const semMarcas = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const textoDe = t => limpo(semMarcas(Array.isArray(t) ? t.join('\n\n') : t));
  const data = (iso, comHora) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-PT', comHora ? { dateStyle: 'short', timeStyle: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' }); };
  const dataCurta = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }); };
  const num = n => Number(n).toLocaleString('pt-PT');
  const plural = (n, ev) => n === 1 ? ev.um : ev.varios;
  const aoFolego = () => new Promise(r => setTimeout(r)); // deixa a página respirar e o progresso aparecer
  const merc = (lat, lon) => { const p = L.CRS.EPSG3857.project(L.latLng(lat, lon)); return [p.x, p.y]; };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const clara = h => { const [r, g, b] = rgb(h); return .299 * r + .587 * g + .114 * b > 150; };
  const corSegura = h => /^#[0-9a-f]{6}$/i.test(h || '') ? h : SEM_TIPO.cor;

  function carregarImagem(src, ms) {
    return new Promise(ok => {
      const i = new Image(), t = setTimeout(() => ok(null), ms || 15000);
      if (/^https?:/i.test(src)) i.crossOrigin = 'anonymous';
      i.onload = () => { clearTimeout(t); ok(i); }; i.onerror = () => { clearTimeout(t); ok(null); };
      i.src = src;
    });
  }
  const canvasDe = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  async function emLotes(lista, n, f) { let k = 0; await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (k < lista.length) { const i = k++; await f(lista[i], i); } })); }

  // ---------- os dados ----------
  function preparar(o) {
    const ev = o.evento, termos = ev.termos || {}, base = (ev.categorias || []).map(c => ({ ...c, cor: corSegura(c.cor) }));
    const pedidos = o.tipos ? new Set(o.tipos) : null;
    const tipoDe = r => base.find(t => t.id === r.c) || SEM_TIPO;
    const freguesias = o.freguesias.map(f => ({ ...f, registos: f.registos.filter(r => !pedidos || pedidos.has(tipoDe(r).id)).map(r => ({ ...r, tipo: tipoDe(r) })) }));
    const com = freguesias.filter(f => f.registos.length), todos = com.flatMap(f => f.registos);
    for (const f of com) f.registos.forEach((r, i) => { r.n = i + 1; });
    const tipos = [...base, SEM_TIPO].filter(t => (!pedidos || pedidos.has(t.id)) && (t.id !== 'sem' || todos.some(r => r.tipo.id === 'sem')));
    return { ev: { nome: limpo(ev.nome), um: limpo(termos.um) || 'registo', varios: limpo(termos.varios) || 'registos', descricao: limpo(ev.descricao), competencia: limpo(o.competencia) }, freguesias, com, todos, tipos, fotos: o.fotos !== false };
  }

  // ---------- os mapas ----------
  function mapaCidade(R, limites) { // cada freguesia com a cor da sua contagem
    const porId = Object.fromEntries(R.freguesias.map(f => [f.id, f.registos.length])), maximo = Math.max(1, ...Object.values(porId));
    const cortes = [...new Set([.2, .4, .6, .8, 1].map(x => Math.ceil(x * maximo)))], corDe = n => n ? RAMPA[RAMPA.length - cortes.length + cortes.findIndex(c => n <= c)] : TINTA_FRACA;
    const pts = limites.flatMap(f => f.aneis.flat()).map(p => merc(p[0], p[1]));
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    const larg = 1500, alt = larg * (y1 - y0) / (x1 - x0), m = 8, esc = (larg - 2 * m) / (x1 - x0), c = canvasDe(larg, alt + 2 * m), g = c.getContext('2d');
    const P = (lat, lon) => { const [x, y] = merc(lat, lon); return [m + (x - x0) * esc, m + (y1 - y) * esc]; };
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.lineJoin = 'round';
    for (const f of limites) {
      g.beginPath(); for (const a of f.aneis) { a.forEach((p, i) => { const [x, y] = P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); }
      g.fillStyle = corDe(porId[f.id] || 0); g.fill('evenodd'); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    }
    for (const f of limites) {
      const n = porId[f.id] || 0, [x, y] = P(f.rotulo[0], f.rotulo[1]), fundo = corDe(n), cor = clara(fundo) ? TINTA : '#fff'; g.textAlign = 'center'; g.fillStyle = cor;
      const partes = f.nome.length > 15 ? f.nome.replace(/ de /, ' de\n').split('\n') : [f.nome];
      g.font = '600 19px Arial, sans-serif'; partes.forEach((t, i) => g.fillText(t, x, y + i * 21 - 3));
      g.font = '700 25px Arial, sans-serif'; g.fillText(num(n), x, y + partes.length * 21 + 5);
    }
    return { url: c.toDataURL('image/png'), proporcao: c.height / c.width, cortes, corDe };
  }
  function desenharPino(g, x, y, r, cor, texto) {
    g.beginPath(); g.arc(x, y, r + Math.max(1.5, r * .16), 0, 7); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = cor; g.fill();
    if (texto) { g.fillStyle = clara(cor) ? '#0b0b0b' : '#fff'; g.font = `700 ${Math.round(r * (texto.length > 2 ? .95 : 1.15))}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(texto, x, y + .5); g.textBaseline = 'alphabetic'; }
  }
  async function mapaFreguesia(f, limite) { // a freguesia na sua imagem, com o exterior escurecido e os registos numerados
    const img = f.imagem ? await carregarImagem(f.imagem.ficheiro) : null; f.foto = img;
    const aneis = (limite && limite.aneis) || [], pts = [...aneis.flat(), ...f.registos.map(r => [r.lat, r.lon])].map(p => merc(p[0], p[1]));
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    const fx = (x1 - x0) * .05 || 100, fy = (y1 - y0) * .05 || 100; x0 -= fx; x1 += fx; y0 -= fy; y1 += fy;
    const prop = (y1 - y0) / (x1 - x0), larg = prop > 1 ? Math.round(1300 / prop) : 1300, alt = Math.round(larg * prop), c = canvasDe(larg, alt), g = c.getContext('2d'), esc = larg / (x1 - x0);
    const P = (lat, lon) => { const [x, y] = merc(lat, lon); return [(x - x0) * esc, (y1 - y) * esc]; };
    g.fillStyle = '#20252b'; g.fillRect(0, 0, larg, alt);
    if (img) { const b = f.imagem.bounds, [ix, iy] = P(b[1][0], b[0][1]), [fxx, fyy] = P(b[0][0], b[1][1]); g.drawImage(img, ix, iy, fxx - ix, fyy - iy); }
    g.beginPath(); g.rect(0, 0, larg, alt); const contorno = () => { for (const a of aneis) { a.forEach((p, i) => { const [x, y] = P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); } }; contorno();
    g.fillStyle = 'rgba(8,10,14,.62)'; g.fill('evenodd');
    g.beginPath(); contorno(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
    const n = f.registos.length, numerados = n <= 60, r = numerados ? 13 : 6;
    for (const reg of [...f.registos].reverse()) { const [x, y] = P(reg.lat, reg.lon); desenharPino(g, x, y, r, reg.tipo.cor, numerados ? String(reg.n) : ''); }
    return { url: c.toDataURL('image/jpeg', .74), proporcao: prop, numerados };
  }
  let satelite = !(navigator.onLine === false), falhasSat = 0;
  async function mapaFicha(r, f, w, h) { // o sítio exato: cerca de 180 m de largura, com o ponto ao centro e a escala
    const metros = 180, [cx, cy] = merc(r.lat, r.lon), fator = 1 / Math.cos(r.lat * Math.PI / 180), mx = metros * fator / 2, my = mx * h / w;
    const c = canvasDe(w, h), g = c.getContext('2d'); g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, h); let ok = false;
    if (satelite) {
      const img = await carregarImagem(`${WMS}&width=${w}&height=${h}&bbox=${cx - mx},${cy - my},${cx + mx},${cy + my}`, 12000);
      if (img) { g.drawImage(img, 0, 0, w, h); ok = true; falhasSat = 0; } else if (++falhasSat >= 4) satelite = false; // sem rede ou serviço em baixo: o resto vem da imagem guardada
    }
    if (!ok && f.foto) { const b = f.imagem.bounds, [ix0, iy1] = merc(b[0][0], b[0][1]), [ix1, iy0] = merc(b[1][0], b[1][1]), kx = f.foto.naturalWidth / (ix1 - ix0), ky = f.foto.naturalHeight / (iy0 - iy1); g.drawImage(f.foto, (cx - mx - ix0) * kx, (iy0 - cy - my) * ky, 2 * mx * kx, 2 * my * ky, 0, 0, w, h); }
    g.beginPath(); g.arc(w / 2, h / 2, w * .055, 0, 7); g.strokeStyle = '#fff'; g.lineWidth = w * .009; g.stroke();
    desenharPino(g, w / 2, h / 2, w * .021, r.tipo.cor);
    const barra = 50 / metros * w, bx = w * .04, by = h - h * .07; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(bx - 5, by - w * .05, barra + 10, w * .05 + h * .04);
    g.fillStyle = '#fff'; g.fillRect(bx, by, barra, Math.max(2, h * .012)); g.font = `600 ${Math.round(w * .03)}px Arial, sans-serif`; g.textAlign = 'left'; g.fillText('50 m', bx, by - w * .012);
    return c.toDataURL('image/jpeg', .72);
  }
  async function fotoReduzida(foto, maximo) { // nunca maior do que o necessário para imprimir: mantém o PDF com um tamanho razoável
    const img = await carregarImagem(foto.src); if (!img || !img.naturalWidth) return null;
    const k = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k), c = canvasDe(w, h), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    try { return { url: c.toDataURL('image/jpeg', .74), w, h }; } catch (err) { return null; } // de outro site, sem autorização para a ler
  }

  // ---------- a escrita ----------
  function escritor(R) {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }); let y = MARGEM, secao = '';
    doc.setProperties({ title: R.ev.nome + ' - relatório da cidade', subject: 'Relatório de evento', creator: FERRAMENTA });
    const cor = (h, fundo) => { const [a, b, c] = rgb(h); if (fundo) doc.setFillColor(a, b, c); else doc.setTextColor(a, b, c); };
    const letra = (t, estilo, c) => { doc.setFont('helvetica', estilo || 'normal'); doc.setFontSize(t); cor(c || TINTA); };
    const altLinha = t => t * .3528 * 1.28;
    const garantir = h => { if (y + h > FUNDO_PAGINA) { doc.addPage(); y = MARGEM; if (secao) { letra(8, 'normal', SUAVE); doc.text(secao, MARGEM, y); y += 6; } } };
    const pagina = () => { doc.addPage(); y = MARGEM; };
    const linhaH = (yy, x0, x1) => { doc.setDrawColor(...rgb(LINHA)); doc.setLineWidth(.2); doc.line(x0 == null ? MARGEM : x0, yy, x1 == null ? LARG - MARGEM : x1, yy); };
    const pinta = (x, yy, c, r) => { cor(c, true); doc.circle(x, yy, r || 1.3, 'F'); };
    const titulo = t => { garantir(14); letra(13, 'bold'); doc.text(t, MARGEM, y + 4); y += 10; };
    const paragrafos = (texto, x, larg, t, c, limiteY) => { // escreve até limiteY; devolve as linhas que ficaram por escrever
      letra(t, 'normal', c); const linhas = doc.splitTextToSize(texto, larg), h = altLinha(t); let k = 0;
      while (k < linhas.length && y + h <= (limiteY || FUNDO_PAGINA)) { doc.text(linhas[k], x, y + h * .78); y += h; k++; }
      return linhas.slice(k);
    };
    return { doc, cor, letra, altLinha, garantir, pagina, linhaH, pinta, titulo, paragrafos, get y() { return y; }, set y(v) { y = v; }, set secao(v) { secao = v; } };
  }
  function escreverResumo(E, R, logo, mapa) {
    const { doc, letra, pinta, cor, linhaH } = E, t = R.todos, n = t.length;
    if (logo) doc.addImage(logo, 'PNG', MARGEM, MARGEM - 1, 15, 15);
    letra(9, 'normal', SUAVE); doc.text(FERRAMENTA, MARGEM + 19, MARGEM + 3);
    letra(19, 'bold'); const tit = doc.splitTextToSize(R.ev.nome, UTIL - 19); doc.text(tit[0], MARGEM + 19, MARGEM + 10.5);
    letra(9.5, 'normal', SUAVE); doc.text('Relatório da cidade de Lisboa · gerado a ' + data(new Date().toISOString()), MARGEM + 19, MARGEM + 15.5);
    E.y = MARGEM + 21; linhaH(E.y); E.y += 5;
    if (R.ev.descricao) { E.paragrafos(R.ev.descricao, MARGEM, UTIL, 9.5, SUAVE); E.y += 1; }
    if (R.ev.competencia) { letra(9.5, 'bold'); doc.text('Competência: ' + R.ev.competencia, MARGEM, E.y + 3); E.y += 5; }
    E.y += 2;
    // os números principais
    const datas = t.map(r => r.quando).filter(Boolean).sort(), comFoto = t.filter(r => (r.fotos || []).length).length, de = datas[0], ate = datas[datas.length - 1];
    const quadros = [[num(n), R.ev.varios + ' no total'], [`${R.com.length} de ${R.freguesias.length}`, 'freguesias com ' + R.ev.varios], [num(comFoto), 'com fotografia'], [de ? (dataCurta(de) === dataCurta(ate) ? dataCurta(de) : dataCurta(de) + ' a ' + dataCurta(ate)) : '-', 'período dos registos']];
    const lq = (UTIL - 9) / 4;
    quadros.forEach(([a, b], i) => { const x = MARGEM + i * (lq + 3); cor(TINTA_FRACA, true); doc.roundedRect(x, E.y, lq, 20, 1.5, 1.5, 'F'); letra(a.length > 12 ? 11 : 18, 'bold'); doc.text(a, x + 3, E.y + (a.length > 12 ? 9 : 10)); letra(8.5, 'normal', SUAVE); doc.text(doc.splitTextToSize(b, lq - 6).slice(0, 2), x + 3, E.y + 14.5); });
    E.y += 26;
    if (R.tipos.length > 1) { // por tipo
      letra(10.5, 'bold'); doc.text('Por tipo', MARGEM, E.y + 3); E.y += 7;
      const maior = Math.max(1, ...R.tipos.map(k => t.filter(r => r.tipo.id === k.id).length));
      for (const k of R.tipos) {
        const q = t.filter(r => r.tipo.id === k.id).length; pinta(MARGEM + 1.4, E.y + 1.7, k.cor);
        letra(9.5); doc.text(doc.splitTextToSize(limpo(k.nome), 72)[0], MARGEM + 5, E.y + 2.8);
        cor(k.cor, true); if (q) doc.roundedRect(MARGEM + 80, E.y + .5, 76 * q / maior, 2.6, .6, .6, 'F');
        letra(9.5, 'bold'); doc.text(num(q), LARG - MARGEM, E.y + 2.8, { align: 'right' }); E.y += 5.6;
      }
      E.y += 3;
    }
    // o mapa da cidade
    letra(10.5, 'bold'); doc.text('Por freguesia, no mapa', MARGEM, E.y + 3); E.y += 6;
    const livre = FUNDO_PAGINA - E.y - 9; let h = Math.min(livre, UTIL * mapa.proporcao), w = h / mapa.proporcao;
    doc.addImage(mapa.url, 'PNG', MARGEM + (UTIL - w) / 2, E.y, w, h); E.y += h + 2;
    let x = MARGEM; letra(8, 'normal', SUAVE); doc.text(R.ev.varios + ':', x, E.y + 3); x += doc.getTextWidth(R.ev.varios + ':') + 2;
    const faixas = [[TINTA_FRACA, '0'], ...mapa.cortes.map((c, i) => [mapa.corDe(c), (i ? mapa.cortes[i - 1] + 1 : 1) === c ? String(c) : `${i ? mapa.cortes[i - 1] + 1 : 1}-${c}`])];
    for (const [c, txt] of faixas) { cor(c, true); doc.rect(x, E.y + .7, 5, 3, 'F'); letra(8, 'normal', SUAVE); doc.text(txt, x + 6, E.y + 3); x += 7 + doc.getTextWidth(txt) + 3; }
    // a tabela
    E.pagina(); E.titulo('Por freguesia');
    const colTipos = R.tipos.length > 1 && R.tipos.length <= 4 ? R.tipos : [], xTotal = 132, xDens = 150, xPag = LARG - MARGEM, xBarra = 152;
    letra(7.5, 'bold', SUAVE); const cab = colTipos.map(k => doc.splitTextToSize(limpo(k.nome).replace(/\//g, '/ '), 16.5).slice(0, 4)), altCab = Math.max(1, ...cab.map(l => l.length)); E.y += (altCab - 1) * E.altLinha(7.5);
    doc.text('Freguesia', MARGEM, E.y);
    colTipos.forEach((k, i) => { const xd = 62 + i * 18 + 8, l = cab[i]; l.forEach((tx, j) => doc.text(tx, xd, E.y - (l.length - 1 - j) * E.altLinha(7.5), { align: 'right' })); pinta(xd - 15.2, E.y - (l.length - 1) * E.altLinha(7.5) - 1, k.cor, 1); });
    doc.text('Total', xTotal, E.y, { align: 'right' }); doc.text('/100 ha', xDens, E.y, { align: 'right' }); doc.text('Pág.', xPag, E.y, { align: 'right' });
    E.y += 1.8; linhaH(E.y); E.y += 1;
    const ordem = [...R.freguesias].sort((a, b) => b.registos.length - a.registos.length || a.nome.localeCompare(b.nome, 'pt')), maior = Math.max(1, ...ordem.map(f => f.registos.length)), ligacoes = [];
    for (const f of ordem) {
      const q = f.registos.length, fraca = q ? TINTA : SUAVE; E.garantir(6.3); const yb = E.y + 4;
      letra(9, q ? 'bold' : 'normal', fraca); doc.text(limpo(f.nome), MARGEM, yb);
      letra(9, 'normal', fraca); colTipos.forEach((k, i) => doc.text(num(f.registos.filter(r => r.tipo.id === k.id).length), 62 + i * 18 + 8, yb, { align: 'right' }));
      letra(9, 'bold', fraca); doc.text(num(q), xTotal, yb, { align: 'right' });
      letra(9, 'normal', fraca); doc.text(f.ha ? (q / f.ha * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '-', xDens, yb, { align: 'right' });
      if (q) { let bx = xBarra; const larg = 22 * q / maior; for (const k of R.tipos) { const s = f.registos.filter(r => r.tipo.id === k.id).length; if (!s) continue; const w2 = larg * s / q; cor(k.cor, true); doc.rect(bx, yb - 2.5, Math.max(.4, w2 - .25), 2.8, 'F'); bx += w2; } ligacoes.push({ f, pagina: doc.getCurrentPageInfo().pageNumber, y: E.y, xPag, yb }); }
      E.y += 5.2; linhaH(E.y); E.y += 1.1;
    }
    // as ruas com mais registos
    const ruas = new Map(); for (const f of R.com) for (const r of f.registos) if (r.rua) { const k = r.rua + '|' + f.id, x2 = ruas.get(k) || { rua: r.rua, f: f.nome, n: 0 }; x2.n++; ruas.set(k, x2); }
    const top = [...ruas.values()].sort((a, b) => b.n - a.n || a.rua.localeCompare(b.rua, 'pt')).slice(0, 10).filter(x2 => x2.n > 1);
    if (top.length) {
      E.y += 5; E.garantir(10 + top.length * 5.4); E.titulo('Ruas com mais ' + R.ev.varios);
      for (const x2 of top) { letra(9, 'bold'); doc.text(num(x2.n), MARGEM + 6, E.y + 3, { align: 'right' }); letra(9); doc.text(doc.splitTextToSize(limpo(x2.rua), 105)[0], MARGEM + 10, E.y + 3); letra(9, 'normal', SUAVE); doc.text(limpo(x2.f), LARG - MARGEM, E.y + 3, { align: 'right' }); E.y += 5.4; }
    }
    return ligacoes;
  }
  async function escreverFreguesia(E, R, f, limite, avancar) {
    const { doc, letra, pinta, linhaH } = E, n = f.registos.length;
    E.pagina(); E.secao = ''; const inicio = doc.getCurrentPageInfo().pageNumber;
    letra(9, 'normal', SUAVE); doc.text(R.ev.nome, MARGEM, E.y + 1); E.y += 3;
    letra(17, 'bold'); doc.text(limpo(f.nome), MARGEM, E.y + 6); letra(11, 'bold'); doc.text(`${num(n)} ${plural(n, R.ev)}`, LARG - MARGEM, E.y + 6, { align: 'right' }); E.y += 10;
    if (R.tipos.length > 1) { let x = MARGEM; for (const k of R.tipos) { const q = f.registos.filter(r => r.tipo.id === k.id).length; if (!q) continue; letra(9, 'normal', TINTA); const t = doc.splitTextToSize(`${limpo(k.nome)}: ${num(q)}`, UTIL - 5)[0], w = 6.6 + doc.getTextWidth(t); if (x > MARGEM && x + w > LARG - MARGEM) { x = MARGEM; E.y += 4.8; } pinta(x + 1.2, E.y + 1.3, k.cor); letra(9, 'normal', TINTA); doc.text(t, x + 3.6, E.y + 2.4); x += w + 2; } E.y += 6; }
    const mapa = await mapaFreguesia(f, limite), hm = Math.min(120, UTIL * mapa.proporcao), wm = hm / mapa.proporcao;
    doc.addImage(mapa.url, 'JPEG', MARGEM + (UTIL - wm) / 2, E.y, wm, hm); E.y += hm + 1.5;
    if (!mapa.numerados) { letra(8, 'normal', SUAVE); doc.text(`Com ${num(n)} ${R.ev.varios}, o mapa mostra só os pontos; a localização de cada um está na sua ficha.`, MARGEM, E.y + 2.5); E.y += 4.5; }
    E.y += 3; linhaH(E.y); E.y += 4; E.secao = limpo(f.nome) + ' (continuação)';
    // fichas: o detalhe do mapa fica pronto antes de escrever, para pedir vários ao mesmo tempo
    const denso = R.todos.length > 200, W = denso ? 300 : 460, H = Math.round(W * 44 / 64);
    await emLotes(f.registos, 6, async r => { r.mapa = await mapaFicha(r, f, W, H); });
    for (const r of f.registos) { await escreverFicha(E, R, r); delete r.mapa; await avancar(); }
    f.foto = null;
    return inicio;
  }
  async function escreverFicha(E, R, r) {
    const { doc, letra, pinta, linhaH } = E, wm = 64, hm = 44, xt = MARGEM + wm + 5, lt = UTIL - wm - 5;
    const titulo = limpo(r.rua ? r.rua + (r.numero ? ', ' + r.numero : '') : (r.nome || 'Sem morada')), linhasT = (letra(11, 'bold'), doc.splitTextToSize(titulo, UTIL - 12));
    const texto = textoDe(r.texto);
    E.garantir(linhasT.length * E.altLinha(11) + hm + 4 + (R.fotos && (r.fotos || []).length ? 46 : 0)); // a ficha não se separa da primeira fila de fotos
    pinta(MARGEM + 3, E.y + 2.4, r.tipo.cor, 3); letra(8, 'bold', clara(r.tipo.cor) ? '#0b0b0b' : '#ffffff'); doc.text(String(r.n), MARGEM + 3, E.y + 3.4, { align: 'center' });
    letra(11, 'bold'); doc.text(linhasT, MARGEM + 8, E.y + 3.6); E.y += linhasT.length * E.altLinha(11) + 2;
    const y0 = E.y; doc.addImage(r.mapa, 'JPEG', MARGEM, y0, wm, hm);
    if (r.nome && r.rua) { letra(9.5, 'bold'); doc.text(doc.splitTextToSize(limpo(r.nome), lt)[0], xt, E.y + 3); E.y += 5; }
    if (R.tipos.length > 1) { pinta(xt + 1.2, E.y + 1.8, r.tipo.cor, 1.2); letra(9); doc.text(doc.splitTextToSize(limpo(r.tipo.nome), lt - 4)[0], xt + 3.6, E.y + 2.9); E.y += 5; }
    letra(8.5, 'normal', SUAVE);
    if (r.quando) { doc.text('Registado a ' + data(r.quando, true), xt, E.y + 2.8); E.y += 4.4; }
    const coords = `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`; letra(8.5, 'normal', SUAVE); doc.text('Localização: ', xt, E.y + 2.8); const dx = doc.getTextWidth('Localização: ');
    doc.setTextColor(32, 93, 170); doc.textWithLink(coords, xt + dx, E.y + 2.8, { url: `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=19/${r.lat}/${r.lon}` }); E.y += 4.4;
    if (r.precisao) { letra(8.5, 'normal', SUAVE); doc.text(`Precisão do GPS: cerca de ${Math.round(r.precisao)} m`, xt, E.y + 2.8); E.y += 4.4; }
    let resto = [];
    if (texto) { E.y += 1.5; letra(8.5, 'bold', SUAVE); doc.text('Notas', xt, E.y + 2.8); E.y += 4.2; resto = E.paragrafos(texto, xt, lt, 9.5, TINTA, y0 + hm); }
    E.y = Math.max(E.y, y0 + hm) + 2;
    // o que não coube ao lado do mapa segue a toda a largura
    if (resto.length) { const txt = doc.splitTextToSize(resto.join('\n').replace(/([^\n])\n(?!\n)/g, '$1 '), UTIL); letra(9.5); for (const l of txt) { E.garantir(E.altLinha(9.5)); letra(9.5); doc.text(l, MARGEM, E.y + E.altLinha(9.5) * .78); E.y += E.altLinha(9.5); } E.y += 2; }
    if (R.fotos && (r.fotos || []).length) await escreverFotos(E, r.fotos, R.todos.reduce((s, x) => s + (x.fotos || []).length, 0) > 150 ? 650 : 1000);
    E.y += 1.5; E.garantir(1); linhaH(E.y); E.y += 4;
  }
  async function escreverFotos(E, fotos, maximo) {
    const { doc, letra } = E, por = 3, gap = 3, wc = (UTIL - gap * (por - 1)) / por, hMax = 42, falhas = [];
    const prontas = []; await emLotes(fotos, 4, async (f, i) => { const o = typeof f === 'string' ? { src: f } : f, p = await fotoReduzida(o, maximo); if (p) prontas[i] = { ...p, legenda: textoDe(o.legenda) }; else falhas.push(o.src); });
    const lista = prontas.filter(Boolean);
    for (let i = 0; i < lista.length; i += por) {
      const fila = lista.slice(i, i + por).map(p => { const k = Math.min(wc / p.w, hMax / p.h); return { ...p, wmm: p.w * k, hmm: p.h * k, leg: p.legenda ? (letra(8), doc.splitTextToSize(p.legenda, wc).slice(0, 2)) : [] }; });
      const h = Math.max(...fila.map(p => p.hmm + (p.leg.length ? p.leg.length * E.altLinha(8) + 1 : 0)));
      E.garantir(h + 2);
      fila.forEach((p, k) => { const x = MARGEM + k * (wc + gap); doc.addImage(p.url, 'JPEG', x, E.y, p.wmm, p.hmm); if (p.leg.length) { letra(8, 'normal', SUAVE); doc.text(p.leg, x, E.y + p.hmm + 3); } });
      E.y += h + 2;
    }
    if (falhas.length) { E.garantir(5); letra(8, 'normal', SUAVE); doc.text(`${falhas.length === 1 ? 'Uma foto não pôde ser incluída' : falhas.length + ' fotos não puderam ser incluídas'} (sem acesso ao ficheiro).`, MARGEM, E.y + 3); E.y += 5; }
  }

  async function gerar(o) {
    if (!window.jspdf) throw new Error('a biblioteca de PDF não carregou');
    const R = preparar(o); if (!R.todos.length) throw new Error('não há registos para incluir');
    satelite = !(navigator.onLine === false); falhasSat = 0;
    const porLimite = Object.fromEntries(o.limites.map(l => [l.id, l])), progresso = o.aoProgresso || (() => {});
    const logo = await carregarImagem(LOGO), E = escritor(R), { doc } = E, mapa = mapaCidade(R, o.limites);
    let logoUrl = null; if (logo) { const c = canvasDe(180, 180); c.getContext('2d').drawImage(logo, 0, 0, 180, 180); logoUrl = c.toDataURL('image/png'); }
    const ligacoes = escreverResumo(E, R, logoUrl, mapa);
    let feitos = 0; const total = R.todos.length, avancar = async () => { feitos++; if (feitos % 5 === 0 || feitos === total) { progresso(feitos, total); await aoFolego(); } };
    const paginaDe = {};
    for (const f of R.com) { paginaDe[f.id] = await escreverFreguesia(E, R, f, porLimite[f.id], avancar); doc.outline.add(null, limpo(f.nome) + ' (' + f.registos.length + ')', { pageNumber: paginaDe[f.id] }); }
    // o índice da tabela e o rodapé só se sabem no fim
    for (const l of ligacoes) { doc.setPage(l.pagina); E.letra(9, 'normal', '#205daa'); const p = paginaDe[l.f.id]; doc.text(String(p), l.xPag, l.yb, { align: 'right' }); doc.link(MARGEM, l.y, UTIL, 5.2, { pageNumber: p }); }
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p); E.linhaH(ALT - 13); E.letra(7.5, 'normal', SUAVE);
      doc.text(`${R.ev.nome} · ${FERRAMENTA}`, MARGEM, ALT - 9.5); doc.text(`Página ${p} de ${n}`, LARG - MARGEM, ALT - 9.5, { align: 'right' });
      doc.text(`Dados: ${limpo(o.fonte || '')}. Ortoimagens © DGT 2023 (CC BY 4.0). Limites © Câmara Municipal de Lisboa.`, MARGEM, ALT - 6.5);
    }
    return doc.output('blob');
  }
  return { gerar };
})();
