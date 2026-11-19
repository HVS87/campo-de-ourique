// As fotos de um evento num ficheiro .zip, sem dependências: cada foto entra tal como está guardada (sem compressão: JPEG,
// PNG e WebP já vêm comprimidos, e assim não se perde qualidade nem tempo). Usa-se no backoffice dos eventos, em «Fotos (.zip)».
//   FotosZip.gerar({ entradas: [{ nome: 'Alvalade/001 - Rua X, 1.jpg', src }], aoProgresso }) → Promise<{ blob, incluidas, falhas }>
//     src: o endereço da foto (servidor central, ficheiro da apresentação ou data:image embebida). As que não se conseguem ler
//     ficam de fora e contam em falhas.
(function () {
  'use strict';
  const TABELA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function dataDos(d) { // a data e a hora no formato do .zip (MS-DOS, hora local, resolução de 2 s)
    const ano = Math.max(1980, d.getFullYear());
    return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  const EXTENSAO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  function tipoPelosBytes(b) { // o tipo verdadeiro, pelos primeiros bytes (um servidor pode responder com outro)
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    return '';
  }
  async function ler(src) { // os bytes da foto, ou null
    try {
      const r = await fetch(new URL(src, document.baseURI).href, { cache: 'force-cache', signal: AbortSignal.timeout(30000) });
      if (!r.ok) return null;
      const b = new Uint8Array(await r.arrayBuffer()), tipo = tipoPelosBytes(b);
      return tipo ? { bytes: b, ext: EXTENSAO[tipo] } : null; // não é uma imagem (uma página de erro, por exemplo)
    } catch (err) { return null; }
  }
  const nomeLimpo = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim().replace(/^\.+|\.+$/g, '').slice(0, 90);

  async function gerar({ entradas, aoProgresso }) {
    const utf8 = new TextEncoder(), partes = [], central = [], usados = new Set(), falhas = [], agora = dataDos(new Date());
    let pos = 0, feitas = 0, incluidas = 0;
    const lidas = new Array(entradas.length); let k = 0; // lê 4 de cada vez, mas escreve pela ordem
    await Promise.all(Array.from({ length: Math.min(4, entradas.length) }, async () => { while (k < entradas.length) { const i = k++; lidas[i] = await ler(entradas[i].src); feitas++; if (aoProgresso) aoProgresso(feitas, entradas.length); } }));
    entradas.forEach((e, i) => {
      const f = lidas[i]; if (!f) { falhas.push(e.src); return; }
      const pasta = e.nome.includes('/') ? e.nome.slice(0, e.nome.lastIndexOf('/') + 1) : '', base = e.nome.slice(pasta.length).replace(/\.[a-z0-9]{2,4}$/i, '');
      let nome = pasta + base + '.' + f.ext; for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${pasta}${base} (${n}).${f.ext}`;
      usados.add(nome.toLowerCase());
      const n = utf8.encode(nome), crc = crc32(f.bytes), tam = f.bytes.length;
      if (pos + tam + n.length + 30 > 0xFFFFFFFF) throw new Error('as fotos passam dos 4 GB: escolhe menos freguesias');
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); /* nomes em UTF-8 */ loc.setUint16(8, 0, true); /* sem compressão */
      loc.setUint16(10, agora.hora, true); loc.setUint16(12, agora.dia, true); loc.setUint32(14, crc, true); loc.setUint32(18, tam, true); loc.setUint32(22, tam, true); loc.setUint16(26, n.length, true); loc.setUint16(28, 0, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, agora.hora, true); cen.setUint16(14, agora.dia, true); cen.setUint32(16, crc, true); cen.setUint32(20, tam, true); cen.setUint32(24, tam, true); cen.setUint16(28, n.length, true);
      cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, pos, true);
      partes.push(loc.buffer, n, f.bytes); central.push(cen.buffer, n);
      pos += 30 + n.length + tam; incluidas++; lidas[i] = null;
    });
    if (incluidas > 0xFFFF) throw new Error('demasiadas fotos para um só .zip: escolhe menos freguesias');
    const tamCentral = central.reduce((s, x) => s + x.byteLength, 0), fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, incluidas, true); fim.setUint16(10, incluidas, true); fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    return { blob: new Blob([...partes, ...central, fim.buffer], { type: 'application/zip' }), incluidas, falhas };
  }
  window.FotosZip = { gerar, nomeLimpo, crc32 };
})();
