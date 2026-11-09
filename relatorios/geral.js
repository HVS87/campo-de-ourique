// Relatório em PDF das ocorrências (pontos, conjuntos de pontos, ruas em destaque e zonas), independente dos eventos.
// Recebe as ocorrências já escolhidas e filtradas pela página; não sabe nada de servidores nem de presets. Usa as peças comuns do
// relatório dos eventos (relatorios/evento.js, que tem de estar carregado antes) e só se carrega quando se exporta.
// Com uma só freguesia, o relatório é dessa freguesia: a capa com os números, o mapa, a lista e (extensivo) as fichas.
// Com várias, primeiro o resumo (números, mapa da cidade e a tabela por freguesia) e depois um capítulo por freguesia.
// No extensivo, a lista de cada freguesia é um índice (cada linha leva à ficha) e a tabela leva ao capítulo de cada freguesia.
//   RelatorioGeral.gerar({ freguesias, limites, extensivo, fotos, criterios, gravidades, tipos, responsaveis, fonte, aoProgresso }) → Promise<Blob>
//     freguesias: [{ id, nome, ha, imagem: { ficheiro, bounds }, ocorrencias: [ocorrência] }] (as escolhidas, mesmo as que ficaram sem nenhuma)
//     ocorrência: { id, tipo, nome, pri: { id, nome, cor }, comp, quando, texto, fotos: [{ src, legenda }], dentroDe, rua, categorias: [nomes],
//                   geo: { pontos: [[lat, lon]] } | { linhas: [[[lat, lon]]] } | { poligono: [[lat, lon]] } | null,
//                   sub: [{ nome, tipo: { nome, cor } | null, quando, texto, fotos, lat, lon }] (só nos conjuntos) }
//     criterios: [[rótulo, texto]] o que se escolheu; gravidades e tipos: [{ id, nome, cor? }] pela ordem em que aparecem
window.RelatorioGeral = (function () {
  'use strict';
  const B = window.RelatorioEvento && window.RelatorioEvento.base;
  if (!B) throw new Error('falta relatorios/evento.js');
  const { FERRAMENTA, LOGO, WMS, LARG, MARGEM, UTIL, FUNDO_PAGINA, TINTA, SUAVE, LINHA, TINTA_FRACA, LIGACAO,
    limpo, textoDe, data, dataCurta, num, aoFolego, merc, rgb, clara, carregarImagem, canvasDe, emLotes, fotoReduzida, desenharPino, mapaCidade, escritor, cabecalho, quadrosNumeros, escreverFotos, rodape } = B;
  const T = { um: 'ocorrência', varios: 'ocorrências' };
  const plural = n => n === 1 ? T.um : T.varios;
  const corSegura = h => /^#[0-9a-f]{6}$/i.test(h || '') ? h : '#9aa3ad';
  const rgba = (h, a) => { const [r, g, b] = rgb(corSegura(h)); return `rgba(${r},${g},${b},${a})`; };
  const fotosDe = o => (o.fotos || []).length + (o.sub || []).reduce((s, p) => s + (p.fotos || []).length, 0);

  // ---------- os dados ----------
  function preparar(o) {
    const ordemG = new Map(o.gravidades.map((g, i) => [g.id, i])), ordemT = new Map(o.tipos.map((t, i) => [t.id, i]));
    const freguesias = o.freguesias.map(f => {
      const ocorrencias = f.ocorrencias.map(x => ({ ...x, pri: { ...x.pri, cor: corSegura(x.pri.cor) } }))
        .sort((a, b) => (ordemG.get(a.pri.id) ?? 99) - (ordemG.get(b.pri.id) ?? 99) || (ordemT.get(a.tipo) ?? 99) - (ordemT.get(b.tipo) ?? 99) || limpo(a.nome).localeCompare(limpo(b.nome), 'pt'));
      ocorrencias.forEach((x, i) => { x.n = i + 1; });
      return { ...f, ocorrencias, registos: ocorrencias }; // registos: para o mapa da cidade, que é o dos eventos
    });
    const com = freguesias.filter(f => f.ocorrencias.length), todos = com.flatMap(f => f.ocorrencias);
    return { ev: { nome: 'Relatório de ocorrências', descricao: '', competencia: '' }, assunto: 'Relatório de ocorrências', freguesias, com, todos,
      gravidades: o.gravidades.map(g => ({ ...g, cor: corSegura(g.cor) })), tipos: o.tipos, responsaveis: o.responsaveis || [], criterios: o.criterios || [], fotos: o.fotos !== false, extensivo: o.extensivo !== false };
  }
  // o sítio de cada ocorrência no mapa: onde fica o número
  function ancora(x) {
    const g = x.geo; if (!g) return null;
    if (g.pontos && g.pontos.length) return g.pontos[0];
    if (g.linhas && g.linhas.length) { const l = g.linhas.reduce((a, b) => (b.length > a.length ? b : a)); return l[Math.floor(l.length / 2)]; }
    if (g.poligono && g.poligono.length) { let a = 0, b = 0; for (const p of g.poligono) { a += p[0]; b += p[1]; } return [a / g.poligono.length, b / g.poligono.length]; }
    return null;
  }
  const pontosDe = x => { const g = x.geo; return !g ? [] : g.pontos || (g.linhas ? g.linhas.flat() : g.poligono || []); };

  // ---------- os mapas ----------
  function desenharGeometria(g, x, P, escala) { // escala: a grossura das linhas
    const geo = x.geo; if (!geo) return;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (geo.poligono) {
      g.beginPath(); geo.poligono.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath();
      g.fillStyle = rgba(x.pri.cor, .3); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5 * escala; g.stroke(); g.strokeStyle = x.pri.cor; g.lineWidth = 2.6 * escala; g.stroke();
    }
    if (geo.linhas) for (const [cor, w] of [['#fff', 9], [x.pri.cor, 5]]) { g.strokeStyle = cor; g.lineWidth = w * escala; for (const l of geo.linhas) { g.beginPath(); l.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); } }
  }
  const ordemDesenho = l => [...l].sort((a, b) => (b.geo && b.geo.poligono ? 1 : 0) - (a.geo && a.geo.poligono ? 1 : 0) || (b.geo && b.geo.linhas ? 1 : 0) - (a.geo && a.geo.linhas ? 1 : 0)); // as zonas por baixo, as ruas a seguir, os pontos por cima
  async function mapaFreguesia(f, limite) { // a freguesia na sua imagem, com o exterior escurecido e as ocorrências numeradas
    const img = f.imagem ? await carregarImagem(f.imagem.ficheiro) : null; f.foto = img;
    const aneis = (limite && limite.aneis) || [], pts = [...aneis.flat(), ...f.ocorrencias.flatMap(pontosDe)].map(p => merc(p[0], p[1]));
    if (!pts.length) return null;
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    const fx = (x1 - x0) * .05 || 100, fy = (y1 - y0) * .05 || 100; x0 -= fx; x1 += fx; y0 -= fy; y1 += fy;
    const prop = (y1 - y0) / (x1 - x0), larg = prop > 1 ? Math.round(1300 / prop) : 1300, alt = Math.round(larg * prop), c = canvasDe(larg, alt), g = c.getContext('2d'), esc = larg / (x1 - x0);
    const P = (lat, lon) => { const [x, y] = merc(lat, lon); return [(x - x0) * esc, (y1 - y) * esc]; };
    g.fillStyle = '#20252b'; g.fillRect(0, 0, larg, alt);
    if (img) { const b = f.imagem.bounds, [ix, iy] = P(b[1][0], b[0][1]), [fxx, fyy] = P(b[0][0], b[1][1]); g.drawImage(img, ix, iy, fxx - ix, fyy - iy); }
    g.beginPath(); g.rect(0, 0, larg, alt); const contorno = () => { for (const a of aneis) { a.forEach((p, i) => { const [x, y] = P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); } }; contorno();
    g.fillStyle = 'rgba(8,10,14,.62)'; g.fill('evenodd');
    g.beginPath(); contorno(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
    const n = f.ocorrencias.length, numerados = n <= 80, r = numerados ? 13 : 6;
    for (const x of ordemDesenho(f.ocorrencias)) desenharGeometria(g, x, P, 1);
    for (const x of f.ocorrencias) if (x.geo && x.geo.pontos && x.geo.pontos.length > 1) for (const p of x.geo.pontos.slice(1)) { const [a, b] = P(p[0], p[1]); desenharPino(g, a, b, 5, x.pri.cor); } // os outros pontos dos conjuntos
    for (const x of [...f.ocorrencias].reverse()) { const p = ancora(x); if (!p) continue; const [a, b] = P(p[0], p[1]); desenharPino(g, a, b, r, x.pri.cor, numerados ? String(x.n) : ''); }
    return { url: c.toDataURL('image/jpeg', .74), proporcao: prop, numerados };
  }
  let satelite = !(navigator.onLine === false), falhasSat = 0;
  async function mapaOcorrencia(x, f, w, h) { // o sítio da ocorrência, com pelo menos 180 m de largura e a escala
    const pts = pontosDe(x).map(p => merc(p[0], p[1])); if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const lat = (ancora(x) || [38.72])[0], fator = 1 / Math.cos(lat * Math.PI / 180);
    const metros = Math.max(180, (Math.max(...xs) - Math.min(...xs)) / fator * 1.3, (Math.max(...ys) - Math.min(...ys)) / fator * 1.3 * w / h), mx = metros * fator / 2, my = mx * h / w;
    const c = canvasDe(w, h), g = c.getContext('2d'); g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, h); let ok = false;
    if (satelite) {
      const img = await carregarImagem(`${WMS}&width=${w}&height=${h}&bbox=${cx - mx},${cy - my},${cx + mx},${cy + my}`, 12000);
      if (img) { g.drawImage(img, 0, 0, w, h); ok = true; falhasSat = 0; } else if (++falhasSat >= 4) satelite = false; // sem rede ou serviço em baixo: o resto vem da imagem guardada
    }
    if (!ok && f.foto) { const b = f.imagem.bounds, [ix0, iy1] = merc(b[0][0], b[0][1]), [ix1, iy0] = merc(b[1][0], b[1][1]), kx = f.foto.naturalWidth / (ix1 - ix0), ky = f.foto.naturalHeight / (iy0 - iy1); g.drawImage(f.foto, (cx - mx - ix0) * kx, (iy0 - cy - my) * ky, 2 * mx * kx, 2 * my * ky, 0, 0, w, h); }
    const P = (la, lo) => { const [a, b] = merc(la, lo); return [(a - (cx - mx)) / (2 * mx) * w, ((cy + my) - b) / (2 * my) * h]; };
    desenharGeometria(g, x, P, w / 460);
    if (x.geo.pontos) {
      const varios = x.geo.pontos.length > 1 && x.geo.pontos.length <= 40;
      x.geo.pontos.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (!varios) { g.beginPath(); g.arc(a, b, w * .055, 0, 7); g.strokeStyle = '#fff'; g.lineWidth = w * .009; g.stroke(); } const t = x.sub && x.sub[i] && x.sub[i].tipo; desenharPino(g, a, b, w * (varios ? .028 : .021), t ? corSegura(t.cor) : x.pri.cor, varios ? String(i + 1) : ''); }); // num conjunto, a cor do tipo de cada ponto, como na lista
    }
    const barraM = [20, 50, 100, 200, 500, 1000].reduce((a, b) => (Math.abs(b - metros / 4) < Math.abs(a - metros / 4) ? b : a)), barra = barraM / metros * w, bx = w * .04, by = h - h * .07;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(bx - 5, by - w * .05, barra + 10, w * .05 + h * .04);
    g.fillStyle = '#fff'; g.fillRect(bx, by, barra, Math.max(2, h * .012)); g.font = `600 ${Math.round(w * .03)}px Arial, sans-serif`; g.textAlign = 'left'; g.fillText(barraM >= 1000 ? barraM / 1000 + ' km' : barraM + ' m', bx, by - w * .012);
    return c.toDataURL('image/jpeg', .72);
  }

  // ---------- a escrita ----------
  function pintaCor(E, x, y, cor, r) { E.cor(cor, true); if (clara(cor)) { E.doc.setDrawColor(...rgb('#8a929c')); E.doc.setLineWidth(.2); E.doc.circle(x, y, r, 'FD'); } else E.doc.circle(x, y, r, 'F'); } // o branco da «Sugestão» precisa de contorno
  function numero(E, x, y, cor, n, r) { pintaCor(E, x, y, cor, r); E.letra(r > 2.5 ? 8 : 6.5, 'bold', clara(cor) ? '#0b0b0b' : '#ffffff'); E.doc.text(String(n), x, y + r * .42, { align: 'center' }); }
  function criterios(E, R) { // o que se escolheu, numa caixa
    if (!R.criterios.length) return;
    const { doc, letra, cor } = E, linhas = R.criterios.map(([a, b]) => { letra(8.5); return { a: limpo(a) + ': ', l: doc.splitTextToSize(limpo(b), UTIL - 8 - (letra(8.5, 'bold'), doc.getTextWidth(limpo(a) + ': '))) }; });
    const h = linhas.reduce((s, x) => s + x.l.length * E.altLinha(8.5), 0) + 5;
    cor(TINTA_FRACA, true); doc.roundedRect(MARGEM, E.y, UTIL, h, 1.5, 1.5, 'F'); let y = E.y + 3.6;
    for (const x of linhas) { letra(8.5, 'bold', SUAVE); doc.text(x.a, MARGEM + 4, y); const dx = doc.getTextWidth(x.a); letra(8.5, 'normal', TINTA); x.l.forEach((t, i) => doc.text(t, MARGEM + 4 + dx, y + i * E.altLinha(8.5))); y += x.l.length * E.altLinha(8.5); }
    E.y += h + 5;
  }
  const periodo = t => { const d = t.map(x => x.quando).filter(Boolean).sort(), de = d[0], ate = d[d.length - 1]; return de ? (dataCurta(de) === dataCurta(ate) ? dataCurta(de) : dataCurta(de) + ' a ' + dataCurta(ate)) : '-'; };
  function barras(E, titulo, itens, chave, t) { // uma contagem por item, em barras com a cor de cada um
    const { doc, letra, cor } = E; if (itens.length < 2) return;
    E.garantir(9 + itens.length * 5.6); letra(10.5, 'bold'); doc.text(titulo, MARGEM, E.y + 3); E.y += 7;
    const maior = Math.max(1, ...itens.map(k => t.filter(x => chave(x) === k.id).length));
    for (const k of itens) {
      const q = t.filter(x => chave(x) === k.id).length, c = k.cor || '#5d9eea'; pintaCor(E, MARGEM + 1.4, E.y + 1.7, c, 1.3);
      letra(9.5); doc.text(doc.splitTextToSize(limpo(k.nome), 72)[0], MARGEM + 5, E.y + 2.8);
      if (q) { cor(c, true); if (clara(c)) { doc.setDrawColor(...rgb('#8a929c')); doc.setLineWidth(.2); doc.roundedRect(MARGEM + 80, E.y + .5, 76 * q / maior, 2.6, .6, .6, 'FD'); } else doc.roundedRect(MARGEM + 80, E.y + .5, 76 * q / maior, 2.6, .6, .6, 'F'); }
      letra(9.5, 'bold'); doc.text(num(q), LARG - MARGEM, E.y + 2.8, { align: 'right' }); E.y += 5.6;
    }
    E.y += 3;
  }
  function resumoContagens(E, R, t) {
    barras(E, 'Por gravidade', R.gravidades, x => x.pri.id, t);
    barras(E, 'Por tipo', R.tipos, x => x.tipo, t);
    barras(E, 'Por responsável', R.responsaveis, x => x.compId, t);
  }
  function escreverResumo(E, R, logo, limites) {
    const { doc, letra, cor, linhaH } = E, t = R.todos, n = t.length, toda = R.freguesias.length === limites.length;
    cabecalho(E, R, logo, toda ? 'Relatório da cidade de Lisboa' : `Relatório de ${R.freguesias.length} freguesias`);
    criterios(E, R);
    quadrosNumeros(E, [[num(n), T.varios + ' no total'], [`${R.com.length} de ${R.freguesias.length}`, 'freguesias com ' + T.varios], [num(t.filter(fotosDe).length), 'com fotografia'], [periodo(t), 'período (data de criação)']]);
    resumoContagens(E, R, t);
    // o mapa da cidade (as freguesias que não entram ficam a cinzento, como as que não têm nenhuma)
    const mapa = mapaCidade(R, limites);
    if (FUNDO_PAGINA - E.y - 16 < 90) E.pagina();
    letra(10.5, 'bold'); doc.text('Por freguesia, no mapa', MARGEM, E.y + 3); E.y += 6;
    const livre = FUNDO_PAGINA - E.y - 9; let h = Math.min(livre, UTIL * mapa.proporcao), w = h / mapa.proporcao;
    doc.addImage(mapa.url, 'PNG', MARGEM + (UTIL - w) / 2, E.y, w, h); E.y += h + 2;
    let x = MARGEM; letra(8, 'normal', SUAVE); doc.text(T.varios + ':', x, E.y + 3); x += doc.getTextWidth(T.varios + ':') + 2;
    const faixas = [[TINTA_FRACA, toda ? '0' : '0 ou fora do relatório'], ...mapa.cortes.map((c, i) => [mapa.corDe(c), (i ? mapa.cortes[i - 1] + 1 : 1) === c ? String(c) : `${i ? mapa.cortes[i - 1] + 1 : 1}-${c}`])];
    for (const [c, txt] of faixas) { cor(c, true); doc.rect(x, E.y + .7, 5, 3, 'F'); letra(8, 'normal', SUAVE); doc.text(txt, x + 6, E.y + 3); x += 7 + doc.getTextWidth(txt) + 3; }
    // a tabela: no detalhado e no resumido, o nome de cada freguesia leva ao seu capítulo
    E.pagina(); E.titulo('Por freguesia' + (R.com.length ? ' (toca no nome para ir ao capítulo)' : ''));
    const cols = R.gravidades.length > 1 && R.gravidades.length <= 6 ? R.gravidades : [], xTotal = 167, xDens = 182, xPag = LARG - MARGEM, x0c = 66, lc = 15; // lc: a largura de cada coluna da gravidade
    if (cols.length) { // as colunas levam só a cor: os nomes ficam na legenda, por cima
      let x = MARGEM; for (const k of cols) { letra(8, 'normal', SUAVE); const t = limpo(k.nome), w = 5 + doc.getTextWidth(t); if (x > MARGEM && x + w > LARG - MARGEM) { x = MARGEM; E.y += 4.4; } pintaCor(E, x + 1.1, E.y + 1.2, k.cor, 1.1); letra(8, 'normal', SUAVE); doc.text(t, x + 3.2, E.y + 2.2); x += w + 3; }
      E.y += 8;
    }
    letra(7.5, 'bold', SUAVE); doc.text('Freguesia', MARGEM, E.y);
    cols.forEach((k, i) => pintaCor(E, x0c + i * lc + lc - 4, E.y - 1, k.cor, 1.5));
    letra(7.5, 'bold', SUAVE); doc.text('Total', xTotal, E.y, { align: 'right' }); doc.text('/km²', xDens, E.y, { align: 'right' }); doc.text('Pág.', xPag, E.y, { align: 'right' });
    E.y += 1.8; linhaH(E.y); E.y += 1;
    const ordem = [...R.freguesias].sort((a, b) => b.ocorrencias.length - a.ocorrencias.length || a.nome.localeCompare(b.nome, 'pt')), ligacoes = [];
    for (const f of ordem) {
      const q = f.ocorrencias.length, fraca = q ? TINTA : SUAVE; E.garantir(6.3); const yb = E.y + 4;
      letra(9, q ? 'bold' : 'normal', q ? LIGACAO : fraca); doc.text(doc.splitTextToSize(limpo(f.nome), x0c - MARGEM - 4)[0], MARGEM, yb);
      letra(9, 'normal', fraca); cols.forEach((k, i) => doc.text(num(f.ocorrencias.filter(o => o.pri.id === k.id).length), x0c + i * lc + lc - 2, yb, { align: 'right' }));
      letra(9, 'bold', fraca); doc.text(num(q), xTotal, yb, { align: 'right' });
      letra(9, 'normal', fraca); doc.text(f.ha ? (q / f.ha * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '-', xDens, yb, { align: 'right' }); // 100 ha = 1 km²
      if (q) ligacoes.push({ f, pagina: doc.getCurrentPageInfo().pageNumber, y: E.y, xPag, yb });
      E.y += 5.2; linhaH(E.y); E.y += 1.1;
    }
    return ligacoes;
  }
  function chipsGravidade(E, R, f) {
    const { doc, letra } = E; let x = MARGEM;
    for (const k of R.gravidades) { const q = f.ocorrencias.filter(o => o.pri.id === k.id).length; if (!q) continue; letra(9); const t = `${limpo(k.nome)}: ${num(q)}`, w = 6.6 + doc.getTextWidth(t); if (x > MARGEM && x + w > LARG - MARGEM) { x = MARGEM; E.y += 4.8; } pintaCor(E, x + 1.2, E.y + 1.3, k.cor, 1.3); letra(9); doc.text(t, x + 3.6, E.y + 2.4); x += w + 2; }
    E.y += 6;
  }
  async function colocarMapa(E, f, limite, maxH, titulo) {
    const { doc, letra } = E, mapa = await mapaFreguesia(f, limite); if (!mapa) return;
    let hm = Math.min(maxH, UTIL * mapa.proporcao); if (FUNDO_PAGINA - E.y - 12 < Math.min(hm, 80)) E.pagina(); hm = Math.min(hm, FUNDO_PAGINA - E.y - 12); const wm = hm / mapa.proporcao;
    if (titulo) { letra(10.5, 'bold'); doc.text(titulo, MARGEM, E.y + 3); E.y += 6; }
    doc.addImage(mapa.url, 'JPEG', MARGEM + (UTIL - wm) / 2, E.y, wm, hm); E.y += hm + 1.5;
    if (!mapa.numerados) { letra(8, 'normal', SUAVE); doc.text(`Com ${num(f.ocorrencias.length)} ${T.varios}, o mapa mostra só os sítios; os números estão na lista.`, MARGEM, E.y + 2.5); E.y += 4.5; }
  }
  async function escreverCapitulo(E, R, f, limite, avancar) { // uma freguesia, no relatório de várias
    const { doc, letra, linhaH } = E, n = f.ocorrencias.length;
    E.pagina(); E.secao = ''; const inicio = doc.getCurrentPageInfo().pageNumber;
    letra(9, 'normal', SUAVE); doc.text(R.ev.nome, MARGEM, E.y + 1); E.y += 3;
    letra(17, 'bold'); doc.text(limpo(f.nome), MARGEM, E.y + 6); letra(11, 'bold'); doc.text(`${num(n)} ${plural(n)}`, LARG - MARGEM, E.y + 6, { align: 'right' }); E.y += 10;
    chipsGravidade(E, R, f);
    await colocarMapa(E, f, limite, 120);
    E.y += 3; linhaH(E.y); E.y += 4;
    const linhas = escreverLista(E, R, f, R.extensivo);
    if (R.extensivo) { E.pagina(); E.titulo('Ficha de cada ' + T.um); E.secao = limpo(f.nome) + ' · fichas (continuação)'; await escreverFichas(E, R, f, avancar); ligarLista(E, linhas); }
    else await avancar(n);
    f.foto = null;
    return inicio;
  }
  async function escreverRelatorioFreguesia(E, R, f, limite, logo, avancar) { // uma só freguesia
    const { doc } = E, t = f.ocorrencias, n = t.length, nome = limpo(f.nome);
    cabecalho(E, R, logo, 'Relatório da freguesia: ' + nome);
    criterios(E, R);
    const dens = f.ha ? (n / f.ha * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '-'; // 100 ha = 1 km²
    quadrosNumeros(E, [[num(n), T.varios + ' em ' + nome], [num(t.filter(fotosDe).length), 'com fotografia'], [dens, T.varios + ' por km²'], [periodo(t), 'período (data de criação)']]);
    resumoContagens(E, R, t);
    await colocarMapa(E, f, limite, 120, 'No mapa');
    E.pagina(); const linhas = escreverLista(E, R, f, R.extensivo);
    if (R.extensivo) { E.pagina(); E.titulo('Ficha de cada ' + T.um); E.secao = nome + ' · fichas (continuação)'; await escreverFichas(E, R, f, avancar); ligarLista(E, linhas); }
    f.foto = null; return doc;
  }
  const NOME_TIPO = { ponto: 'Ponto', grupo: 'Conjunto de pontos', rua: 'Rua em destaque', zona: 'Zona', desmaterializado: 'Sem localização' };
  const tipoNome = x => NOME_TIPO[x.tipo] || x.tipo;
  const linhaSec = x => [tipoNome(x) + (x.sub ? ` (${x.sub.length} ponto${x.sub.length === 1 ? '' : 's'})` : ''), x.dentroDe ? 'em ' + limpo(x.dentroDe) : '', x.comp ? limpo(x.comp) : ''].filter(Boolean).join(' · ');
  function escreverLista(E, R, f, indice) { // devolve onde ficou cada linha, para a ligar à ficha depois de as fichas estarem escritas
    const { doc, letra, linhaH } = E, nome = limpo(f.nome), xPag = LARG - MARGEM, xFotos = indice ? xPag - 12 : xPag, xData = xFotos - 26, xGrav = xData - 40, linhas = [];
    E.titulo('Lista de ' + T.varios + (indice ? ' (toca numa linha para ir à ficha)' : '')); E.secao = nome + ' · lista de ' + T.varios + ' (continuação)';
    letra(7.5, 'bold', SUAVE); doc.text('N.º', MARGEM, E.y); doc.text('Ocorrência', MARGEM + 10, E.y); doc.text('Gravidade', xGrav, E.y); doc.text('Data', xData, E.y); doc.text('Fotos', xFotos, E.y, { align: 'right' }); if (indice) doc.text('Pág.', xPag, E.y, { align: 'right' });
    E.y += 1.8; linhaH(E.y); E.y += 1;
    for (const x of f.ocorrencias) {
      const lm = (letra(9, 'bold'), doc.splitTextToSize(limpo(x.nome) || 'Sem nome', xGrav - MARGEM - 13).slice(0, 2)), ls = (letra(8), doc.splitTextToSize(linhaSec(x), xGrav - MARGEM - 13).slice(0, 2));
      const h = lm.length * E.altLinha(9) + ls.length * E.altLinha(8) + 2.6; E.garantir(h + 1); const yb = E.y + 3.6;
      numero(E, MARGEM + 2.2, yb - 1.1, x.pri.cor, x.n, 2.1);
      letra(9, 'bold', indice ? LIGACAO : TINTA); doc.text(lm, MARGEM + 10, yb);
      letra(8, 'normal', SUAVE); doc.text(ls, MARGEM + 10, yb + lm.length * E.altLinha(9));
      pintaCor(E, xGrav + 1, yb - 1.1, x.pri.cor, 1.1); letra(8.5, 'normal', SUAVE); doc.text(doc.splitTextToSize(limpo(x.pri.nome), xData - xGrav - 6).slice(0, 2), xGrav + 3.4, yb);
      doc.text(x.quando ? dataCurta(x.quando) : '-', xData, yb); doc.text(num(fotosDe(x)), xFotos, yb, { align: 'right' });
      linhas.push({ r: x, pagina: doc.getCurrentPageInfo().pageNumber, y: E.y, h, yb, xPag });
      E.y += h; linhaH(E.y); E.y += 1.1;
    }
    E.secao = '';
    return linhas;
  }
  function ligarLista(E, linhas) { // já com as fichas escritas: cada linha leva à sua, e mostra a página
    const { doc } = E, ultima = doc.getNumberOfPages();
    for (const l of linhas) { if (!l.r.pagina) continue; doc.setPage(l.pagina); E.letra(8.5, 'normal', LIGACAO); doc.text(String(l.r.pagina), l.xPag, l.yb, { align: 'right' }); doc.link(MARGEM, l.y, UTIL, l.h, { pageNumber: l.r.pagina, top: Math.max(0, l.r.yFicha - 4) }); }
    doc.setPage(ultima);
  }
  async function escreverFichas(E, R, f, avancar) { // os mapas ficam prontos antes de escrever, para pedir vários ao mesmo tempo
    const denso = R.todos.length > 200, W = denso ? 300 : 460, H = Math.round(W * 44 / 64);
    await emLotes(f.ocorrencias, 6, async x => { x.mapa = x.geo ? await mapaOcorrencia(x, f, W, H) : null; });
    for (const x of f.ocorrencias) { await escreverFicha(E, R, x); delete x.mapa; await avancar(1); }
  }
  function corrido(E, texto, t, c, x, larg) { // texto a toda a largura, a passar de página quando for preciso
    const { doc, letra } = E; letra(t, 'normal', c); const linhas = doc.splitTextToSize(texto, larg);
    for (const l of linhas) { E.garantir(E.altLinha(t)); letra(t, 'normal', c); doc.text(l, x, E.y + E.altLinha(t) * .78); E.y += E.altLinha(t); }
  }
  async function escreverFicha(E, R, x) {
    const { doc, letra, linhaH, cor } = E, wm = 64, hm = 44, comMapa = !!x.mapa, xt = comMapa ? MARGEM + wm + 5 : MARGEM, lt = comMapa ? UTIL - wm - 5 : UTIL;
    const titulo = limpo(x.nome) || 'Sem nome', linhasT = (letra(11, 'bold'), doc.splitTextToSize(titulo, UTIL - 12)), texto = textoDe(x.texto);
    E.garantir(linhasT.length * E.altLinha(11) + 6 + (comMapa ? hm : 20) + 4 + (R.fotos && (x.fotos || []).length ? 46 : 0)); // a ficha não se separa do mapa nem da primeira fila de fotos
    x.pagina = doc.getCurrentPageInfo().pageNumber; x.yFicha = E.y; // para o índice da lista
    numero(E, MARGEM + 3, E.y + 2.4, x.pri.cor, x.n, 3);
    letra(11, 'bold'); doc.text(linhasT, MARGEM + 8, E.y + 3.6); E.y += linhasT.length * E.altLinha(11) + 1.5;
    // o tipo, a gravidade (com a sua cor) e o responsável
    letra(8.5, 'bold'); const g = limpo(x.pri.nome), wg = doc.getTextWidth(g) + 5; cor(x.pri.cor, true);
    if (clara(x.pri.cor)) { doc.setDrawColor(...rgb('#8a929c')); doc.setLineWidth(.2); doc.roundedRect(MARGEM + 8, E.y, wg, 4.6, 1, 1, 'FD'); } else doc.roundedRect(MARGEM + 8, E.y, wg, 4.6, 1, 1, 'F');
    letra(8.5, 'bold', clara(x.pri.cor) ? '#0b0b0b' : '#ffffff'); doc.text(g, MARGEM + 10.5, E.y + 3.3);
    letra(8.5, 'normal', SUAVE); doc.text(doc.splitTextToSize([tipoNome(x), x.comp ? 'Responsável: ' + limpo(x.comp) : 'Responsável por definir'].join(' · '), UTIL - wg - 12)[0], MARGEM + 10 + wg, E.y + 3.3); E.y += 7;
    const y0 = E.y; if (comMapa) doc.addImage(x.mapa, 'JPEG', MARGEM, y0, wm, hm);
    const linha = (rot, val) => { letra(8.5, 'bold', SUAVE); doc.text(rot, xt, E.y + 2.8); const dx = doc.getTextWidth(rot + ' '); letra(8.5, 'normal', TINTA); const l = doc.splitTextToSize(limpo(val), lt - dx).slice(0, 3); doc.text(l, xt + dx, E.y + 2.8); E.y += 4.4 * l.length; };
    if (x.dentroDe) linha('Dentro de:', x.dentroDe);
    if (x.rua && limpo(x.rua) !== limpo(x.nome)) linha('Rua:', x.rua);
    if ((x.categorias || []).length) linha('Categorias:', x.categorias.join(', '));
    letra(8.5, 'normal', SUAVE); doc.text(x.quando ? 'Criada a ' + data(x.quando, true) : 'Data de criação desconhecida', xt, E.y + 2.8); E.y += 4.4;
    const a = ancora(x); if (a) { letra(8.5, 'normal', SUAVE); doc.text('Localização: ', xt, E.y + 2.8); const dx = doc.getTextWidth('Localização: '); doc.setTextColor(32, 93, 170); doc.textWithLink(`${a[0].toFixed(5)}, ${a[1].toFixed(5)}`, xt + dx, E.y + 2.8, { url: `https://www.openstreetmap.org/?mlat=${a[0]}&mlon=${a[1]}#map=18/${a[0]}/${a[1]}` }); E.y += 4.4; }
    let resto = [];
    if (texto) { E.y += 1.5; letra(8.5, 'bold', SUAVE); doc.text('Descrição', xt, E.y + 2.8); E.y += 4.2; resto = E.paragrafos(texto, xt, lt, 9.5, TINTA, comMapa ? y0 + hm : FUNDO_PAGINA); }
    E.y = Math.max(E.y, comMapa ? y0 + hm : E.y) + 2;
    if (resto.length) { corrido(E, resto.join('\n').replace(/([^\n])\n(?!\n)/g, '$1 '), 9.5, TINTA, MARGEM, UTIL); E.y += 2; } // o que não coube ao lado do mapa segue a toda a largura
    const maximo = R.todos.reduce((s, o) => s + fotosDe(o), 0) > 150 ? 650 : 1000;
    if (R.fotos && (x.fotos || []).length) await escreverFotos(E, x.fotos, maximo);
    if (x.sub && x.sub.length) { // os pontos do conjunto, cada um com o seu texto e as suas fotos
      E.y += 1.5; E.garantir(12); letra(9.5, 'bold'); doc.text(`Pontos do conjunto (${x.sub.length})`, MARGEM, E.y + 3); E.y += 6;
      for (const [i, p] of x.sub.entries()) {
        E.garantir(10); numero(E, MARGEM + 2.2, E.y + 1.9, p.tipo ? corSegura(p.tipo.cor) : x.pri.cor, i + 1, 2.1);
        letra(9, 'bold'); doc.text(doc.splitTextToSize(limpo(p.nome) || 'Ponto ' + (i + 1), UTIL - 10)[0], MARGEM + 7, E.y + 2.9); E.y += 4.4;
        const meta = [p.tipo ? limpo(p.tipo.nome) : '', p.quando ? 'registado a ' + data(p.quando, true) : '', p.lat != null ? `${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : ''].filter(Boolean).join(' · ');
        if (meta) { letra(8, 'normal', SUAVE); doc.text(doc.splitTextToSize(meta, UTIL - 10)[0], MARGEM + 7, E.y + 2.6); E.y += 4; }
        const tp = textoDe(p.texto); if (tp) { E.y += .5; corrido(E, tp, 9, TINTA, MARGEM + 7, UTIL - 7); E.y += 1; }
        if (R.fotos && (p.fotos || []).length) { E.y += 1; await escreverFotos(E, p.fotos, maximo); }
        E.y += 1.5;
      }
    }
    E.y += 1.5; E.garantir(1); linhaH(E.y); E.y += 4;
  }

  async function gerar(o) {
    if (!window.jspdf) throw new Error('a biblioteca de PDF não carregou');
    const R = preparar(o); if (!R.todos.length) throw new Error('não há ocorrências para incluir');
    const so = R.freguesias.length === 1 ? R.freguesias[0] : null; if (so) R.ambito = limpo(so.nome);
    satelite = !(navigator.onLine === false); falhasSat = 0;
    const porLimite = Object.fromEntries(o.limites.map(l => [l.id, l])), progresso = o.aoProgresso || (() => {});
    const logo = await carregarImagem(LOGO), E = escritor(R), { doc } = E;
    doc.setProperties({ title: R.ev.nome + (R.ambito ? ' - ' + R.ambito : ''), subject: R.assunto, creator: FERRAMENTA });
    let logoUrl = null; if (logo) { const c = canvasDe(180, 180); c.getContext('2d').drawImage(logo, 0, 0, 180, 180); logoUrl = c.toDataURL('image/png'); }
    let feitos = 0; const total = R.todos.length, avancar = async k => { const antes = feitos; feitos += k || 1; if (Math.floor(antes / 5) !== Math.floor(feitos / 5) || feitos >= total) { progresso(Math.min(feitos, total), total); await aoFolego(); } };
    if (so) { await escreverRelatorioFreguesia(E, R, so, porLimite[so.id], logoUrl, avancar); return rodape(E, R, o); }
    const ligacoes = escreverResumo(E, R, logoUrl, o.limites), paginaDe = {};
    for (const f of R.com) { paginaDe[f.id] = await escreverCapitulo(E, R, f, porLimite[f.id], avancar); doc.outline.add(null, limpo(f.nome) + ' (' + f.ocorrencias.length + ')', { pageNumber: paginaDe[f.id] }); }
    // o índice da tabela e o rodapé só se sabem no fim
    for (const l of ligacoes) { const p = paginaDe[l.f.id]; if (!p) continue; doc.setPage(l.pagina); E.letra(9, 'normal', LIGACAO); doc.text(String(p), l.xPag, l.yb, { align: 'right' }); doc.link(MARGEM, l.y, UTIL, 5.2, { pageNumber: p }); }
    doc.setPage(doc.getNumberOfPages());
    return rodape(E, R, o);
  }
  return { gerar };
})();
