// Contas de utilizador, sessões e histórico de alterações: o mesmo código no servidor da apresentação
// (tools/servidor.mjs: aplicação de computador e npm start) e no servidor central (nucleo.mjs: Node e Cloudflare Workers).
// Só usa a Web Crypto (crypto.subtle), que existe nos dois e no browser.
//
// Palavras-passe: nunca saem do browser (e os acentos e cedilhas não contam nelas: ver normalizarPalavraPasse). A página deriva de cada uma uma «chave de entrada» (PBKDF2-SHA256, 100 000
// iterações, sal = «campo-de-ourique/» + utilizador normalizado) e só essa chave viaja; os servidores guardam um SHA-256
// dela (o «verificador»). O trabalho caro fica no browser (o plano grátis do Workers dá 10 ms de processador por pedido)
// e quem levar o ficheiro das contas continua a ter de fazer as 100 000 iterações por cada palavra-passe que tentar.
// Sessões: um testemunho assinado (HMAC-SHA256) com o utilizador, a versão da palavra-passe e a validade. Mudar a
// palavra-passe (ou repô-la) invalida os testemunhos anteriores dessa conta.
// Erros seguidos bloqueiam a conta por pouco tempo (1 min ao 5.º, a dobrar até 15 min); repor a palavra-passe desbloqueia.
//
// Papéis: «freguesia» edita só a sua freguesia; «cidade» edita todas; «admin» edita todas, vê o histórico e gere as contas.
// Armazém (o mesmo do núcleo): ler(chave) · escrever(chave, texto) · listar(prefixo) · atualizar?(chave, f)
//   contas/contas.json (as contas, com os verificadores) · contas/segredo.json (assina as sessões; nunca sai do servidor)
//   historico/<AAAA-MM>.json (quem fez o quê, só para a administração)
//   evento/atual.json (o evento em curso: { id, nome, ativo, desde, por }; a administração ativa-o e desativa-o)
export const ITERACOES = 100000;
export const PAPEIS_CONTA = { freguesia: 'Freguesia', cidade: 'Cidade', admin: 'Administração' };
const ESPERA_BASE = 60e3, ESPERA_MAX = 15 * 60e3, ERROS_ATE_BLOQUEAR = 5;
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const iguais = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }; // tempo constante
const CHAVE_VALIDA = /^[0-9a-f]{64}$/;
const horaLisboa = ms => new Date(ms).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });

// «Campo de Ourique», «campodeourique» e «CampoDeOurique» são o mesmo utilizador (sem acentos, espaços nem maiúsculas)
// «System Admin» e «Concelhia Lisboa», sem o ponto, também valem (o resultado entra no sal da chave de entrada: não pode mudar)
const ALIASES = { systemadmin: 'system.admin', concelhialisboa: 'concelhia.lisboa' };
export const normalizarUtilizador = u => { const n = String(u || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s'’-]+/g, '').slice(0, 80); return ALIASES[n] || n; };
// a chave de entrada (o browser faz o mesmo cálculo: index.html e consulta.html)
// na palavra-passe, os acentos e as cedilhas não contam («Março» e «Marco» são a mesma; «á» e «a» também), para
// evitar equívocos; as maiúsculas contam
export const normalizarPalavraPasse = p => String(p == null ? '' : p).normalize('NFD').replace(/[̀-ͯ]/g, '');
export async function derivarChave(utilizador, palavraPasse) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizarPalavraPasse(palavraPasse)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('campo-de-ourique/' + normalizarUtilizador(utilizador)), iterations: ITERACOES }, base, 256));
}
export async function verificadorDe(chave) { return hex(await crypto.subtle.digest('SHA-256', enc.encode('verificador/' + chave))); }
export const podeEditar = (conta, freguesia) => !!conta && Array.isArray(conta.freguesias) && (conta.freguesias.includes('*') || conta.freguesias.includes(freguesia));
export const publica = c => c && { utilizador: c.utilizador, nome: c.nome, papel: c.papel, freguesias: c.freguesias.slice() };

// o mesmo conteúdo dá sempre o mesmo texto: sem depender da ordem das propriedades nem dos campos vazios
// (um preset escrito à mão e o mesmo preset gravado pelo modo de edição só diferem nisso)
const vazio = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const estavel = v => Array.isArray(v) ? '[' + v.map(estavel).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => !vazio(v[k])).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}'
  : JSON.stringify(v);
// o que mudou entre duas versões de um preset (para o histórico): nomes dos elementos acrescentados, mudados e tirados
export function resumoAlteracoes(antes, depois) {
  const mapa = d => { const m = new Map(); (function rec(l, pai) { for (const e of l || []) { if (!e || !e.id) continue; const { filhos, ...resto } = e; m.set(e.id, { nome: e.nome || e.id, json: estavel({ ...resto, pai }) }); rec(filhos, e.id); } })(d && d.elementos, null); return m; };
  const a = mapa(antes), b = mapa(depois), LIM = 20;
  const acrescentados = [...b.keys()].filter(k => !a.has(k)).map(k => b.get(k).nome);
  const tirados = [...a.keys()].filter(k => !b.has(k)).map(k => a.get(k).nome);
  const mudados = [...b.keys()].filter(k => a.has(k) && a.get(k).json !== b.get(k).json).map(k => b.get(k).nome);
  const outros = [];
  if (antes && depois) for (const [campo, nome] of [['titulo', 'título'], ['subtitulo', 'subtítulo'], ['categorias', 'categorias'], ['visita', 'visita guiada']])
    if (estavel(vazio(antes[campo]) ? null : antes[campo]) !== estavel(vazio(depois[campo]) ? null : depois[campo])) outros.push(nome);
  return { novo: !antes, elementos: b.size, acrescentados: acrescentados.slice(0, LIM), mudados: mudados.slice(0, LIM), tirados: tirados.slice(0, LIM),
    n: { acrescentados: acrescentados.length, mudados: mudados.length, tirados: tirados.length }, outros };
}

// horas: validade de uma sessão normal; horasLembrar: com «lembrar-me» (fica neste dispositivo, por exemplo 30 dias)
// Categorias: o mesmo nome (sem contar acentos nem maiúsculas) é a mesma categoria, em qualquer freguesia ou preset.
export const nomeCategoria = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// junta num só as categorias com estes nomes, neste preset; devolve true se o preset mudou
export function fundirCategorias(dados, de, para, modelo = {}) {
  const lista = dados && dados.categorias; if (!Array.isArray(lista)) return false;
  const nomes = new Set([...de, para].map(nomeCategoria)), iguais = lista.filter(c => c && nomes.has(nomeCategoria(c.nome))); if (!iguais.length) return false;
  const fica = iguais.find(c => nomeCategoria(c.nome) === nomeCategoria(para)) || iguais[0], mudou = iguais.length > 1 || fica.nome !== para;
  fica.nome = para; fica.membros = [...new Set(iguais.flatMap(c => c.membros || []))];
  if (modelo.icone) fica.icone = modelo.icone; if (modelo.cor) fica.cor = modelo.cor;
  dados.categorias = lista.filter(c => !iguais.includes(c) || c === fica);
  return mudou;
}
// a lista para a administração: cada categoria e onde é usada. presets: [{ freguesia, preset, dados }]
export function juntarCategorias(presets) {
  const m = new Map();
  for (const { freguesia, preset, dados } of presets) for (const c of (dados && dados.categorias) || []) {
    if (!c || !c.nome) continue; const k = nomeCategoria(c.nome);
    if (!m.has(k)) m.set(k, { nome: c.nome, icone: c.icone || '', cor: c.cor || '', ocorrencias: [] });
    m.get(k).ocorrencias.push({ freguesia, preset, membros: c.n != null ? c.n : (c.membros || []).length });
  }
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}
export function pedidoFundir(b) { // valida o pedido de fundir categorias; null se não servir
  const de = Array.isArray(b && b.de) ? b.de.filter(x => typeof x === 'string' && x.trim()).slice(0, 50) : [], para = typeof (b && b.para) === 'string' ? b.para.trim().slice(0, 80) : '';
  return de.length && para ? { de, para, freguesia: typeof b.freguesia === 'string' ? b.freguesia : '', modelo: { icone: typeof b.icone === 'string' ? b.icone.slice(0, 8) : '', cor: typeof b.cor === 'string' ? b.cor.slice(0, 20) : '' } } : null;
}
export function criarContas({ armazem, iniciais = [], segredo = '', horas = 12, horasLembrar = 30 * 24 }) {
  const K = 'contas/contas.json', KS = 'contas/segredo.json';
  const lerJSON = async k => { const t = await armazem.ler(k); if (t == null) return null; try { return JSON.parse(t); } catch (err) { return null; } };
  const atualizarJSON = (k, f) => armazem.atualizar
    ? armazem.atualizar(k, t => { let v = null; try { v = t == null ? null : JSON.parse(t); } catch (err) { v = null; } return JSON.stringify(f(v), null, 1); })
    : lerJSON(k).then(v => armazem.escrever(k, JSON.stringify(f(v), null, 1)));
  const contaInicial = c => ({ utilizador: c.utilizador, nome: c.nome, papel: c.papel, freguesias: c.freguesias.slice(), verificador: c.verificador, versao: 1, ativa: true, falhas: 0, bloqueadaAte: 0, criada: new Date().toISOString(), alterada: null, ultimaEntrada: null });
  let pronto = null;
  const garantir = () => pronto || (pronto = (async () => { // na primeira vez, as contas iniciais
    if (!(await armazem.ler(K))) await atualizarJSON(K, v => v && Array.isArray(v.contas) ? v : { contas: iniciais.map(contaInicial) });
  })().catch(err => { pronto = null; throw err; }));
  async function todas() { await garantir(); const v = await lerJSON(K); return v && Array.isArray(v.contas) ? v.contas : []; }
  const procurar = (l, u) => { const n = normalizarUtilizador(u); return n ? l.find(c => normalizarUtilizador(c.utilizador) === n) || null : null; };
  async function mudarConta(u, f) { // ler, mudar e gravar uma conta sem pisar outra mudança ao mesmo tempo
    await garantir(); let out = null;
    await atualizarJSON(K, v => { const l = (v && v.contas) || []; const c = procurar(l, u); if (c) out = f(c); return { ...(v || {}), contas: l }; });
    return out;
  }

  let chaveHmac = null;
  async function hmac() { // o segredo das sessões: o indicado (variável de ambiente) ou um gerado na primeira vez e guardado no armazém
    if (chaveHmac) return chaveHmac;
    let s = segredo;
    if (!s) {
      const v = await lerJSON(KS);
      if (v && v.segredo) s = v.segredo;
      else { const b = new Uint8Array(32); crypto.getRandomValues(b); const novo = hex(b); await atualizarJSON(KS, x => x && x.segredo ? x : { segredo: novo }); s = (await lerJSON(KS)).segredo; }
    }
    chaveHmac = await crypto.subtle.importKey('raw', enc.encode('sessoes/' + s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return chaveHmac;
  }
  async function testemunho(c, lembrar) {
    const expira = Date.now() + (lembrar ? horasLembrar : horas) * 3600e3, carga = b64url(enc.encode(JSON.stringify({ u: normalizarUtilizador(c.utilizador), v: c.versao, e: expira, l: lembrar ? 1 : 0 })));
    return { testemunho: 's1.' + carga + '.' + b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmac(), enc.encode(carga)))), expira };
  }

  // (utilizador, chave de entrada) → { conta, testemunho, expira, lembrar } ou { erro, codigo }; contexto: { origem, lembrar }
  async function entrar(utilizador, chave, contexto = {}) {
    const errado = { erro: 'Utilizador ou palavra-passe errados', codigo: 401 };
    if (!normalizarUtilizador(utilizador) || !CHAVE_VALIDA.test(String(chave || ''))) return errado;
    const c0 = procurar(await todas(), utilizador);
    if (!c0 || !c0.ativa) return errado; // não diz se a conta existe
    const agora = Date.now();
    if (c0.bloqueadaAte > agora) return { erro: `Demasiadas tentativas erradas: a conta está bloqueada até às ${horaLisboa(c0.bloqueadaAte)}`, codigo: 429, ate: c0.bloqueadaAte };
    const certo = iguais(await verificadorDe(chave), c0.verificador);
    let bloqueou = 0;
    const c = await mudarConta(utilizador, x => {
      if (certo) { x.falhas = 0; x.bloqueadaAte = 0; x.ultimaEntrada = new Date().toISOString(); }
      else { x.falhas = (x.falhas || 0) + 1; if (x.falhas >= ERROS_ATE_BLOQUEAR) { x.bloqueadaAte = agora + Math.min(ESPERA_MAX, ESPERA_BASE * 2 ** (x.falhas - ERROS_ATE_BLOQUEAR)); bloqueou = x.bloqueadaAte; } }
      return { ...x };
    });
    await registar({ conta: c, acao: certo ? 'entrou' : bloqueou ? 'conta bloqueada' : 'entrada recusada', origem: contexto.origem });
    if (!certo) return bloqueou ? { erro: `Demasiadas tentativas erradas: a conta está bloqueada até às ${horaLisboa(bloqueou)}`, codigo: 429, ate: bloqueou } : errado;
    return { conta: { ...publica(c), lembrar: !!contexto.lembrar }, lembrar: !!contexto.lembrar, ...(await testemunho(c, contexto.lembrar)) };
  }
  // testemunho → a conta (pública, com «lembrar») ou null
  async function verificar(t) {
    const m = /^s1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(t || '')); if (!m) return null;
    let carga; try { if (!(await crypto.subtle.verify('HMAC', await hmac(), deB64url(m[2]), enc.encode(m[1])))) return null; carga = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (err) { return null; }
    if (!carga || !(carga.e > Date.now())) return null;
    const c = procurar(await todas(), carga.u);
    return c && c.ativa && c.versao === carga.v ? { ...publica(c), lembrar: !!carga.l } : null;
  }
  async function trocarVerificador(utilizador, nova, porAdmin) {
    const ver = await verificadorDe(nova);
    return mudarConta(utilizador, x => { x.verificador = ver; x.versao = (x.versao || 1) + 1; x.falhas = 0; x.bloqueadaAte = 0; x.alterada = new Date().toISOString(); x.repostaPor = porAdmin || null; return { ...x }; });
  }
  // a própria conta: precisa da chave atual; devolve um testemunho novo (os outros deixam de valer)
  async function mudarPalavraPasse(conta, atual, nova, contexto = {}) {
    if (!conta || !CHAVE_VALIDA.test(String(atual || '')) || !CHAVE_VALIDA.test(String(nova || ''))) return { erro: 'Pedido inválido', codigo: 400 };
    const c0 = procurar(await todas(), conta.utilizador); if (!c0 || !c0.ativa) return { erro: 'Conta desconhecida', codigo: 404 };
    if (!iguais(await verificadorDe(atual), c0.verificador)) return { erro: 'A palavra-passe atual não está certa', codigo: 403 };
    if (iguais(atual, nova)) return { erro: 'A palavra-passe nova é igual à atual', codigo: 400 };
    const c = await trocarVerificador(conta.utilizador, nova);
    await registar({ conta: c, acao: 'mudou a palavra-passe', origem: contexto.origem });
    return { conta: { ...publica(c), lembrar: !!conta.lembrar }, lembrar: !!conta.lembrar, ...(await testemunho(c, conta.lembrar)) }; // continua lembrada, se estava
  }
  // administração: repõe a palavra-passe de outra conta (e desbloqueia-a)
  async function reporPalavraPasse(admin, utilizador, nova, contexto = {}) {
    if (!admin || admin.papel !== 'admin') return { erro: 'Só a administração repõe palavras-passe', codigo: 403 };
    if (!CHAVE_VALIDA.test(String(nova || ''))) return { erro: 'Pedido inválido', codigo: 400 };
    if (!procurar(await todas(), utilizador)) return { erro: 'Conta desconhecida', codigo: 404 };
    const c = await trocarVerificador(utilizador, nova, admin.utilizador);
    await registar({ conta: admin, acao: 'repôs a palavra-passe', alvo: c.utilizador, origem: contexto.origem });
    return { conta: publica(c) };
  }
  async function listar() {
    return (await todas()).map(c => ({ ...publica(c), ativa: c.ativa, bloqueadaAte: c.bloqueadaAte > Date.now() ? c.bloqueadaAte : 0, falhas: c.falhas || 0, ultimaEntrada: c.ultimaEntrada, alterada: c.alterada }));
  }

  // ---- histórico: um objeto por mês, só para a administração ----
  async function registar({ conta, acao, freguesia, preset, revisao, resumo, alvo, origem }) {
    const quando = new Date().toISOString(), e = { quando, utilizador: conta ? conta.utilizador : '', nome: conta ? conta.nome : '', papel: conta ? conta.papel : '', acao };
    if (freguesia) e.freguesia = freguesia;
    if (preset) e.preset = preset;
    if (revisao) e.revisao = revisao;
    if (resumo) e.resumo = resumo;
    if (alvo) e.alvo = alvo;
    if (origem) e.origem = String(origem).slice(0, 30);
    await atualizarJSON(`historico/${quando.slice(0, 7)}.json`, v => (Array.isArray(v) ? v : []).concat(e));
  }
  async function historico({ freguesia, utilizador, limite = 300, meses = 3 } = {}) {
    const chaves = (await armazem.listar('historico/')).map(o => o.chave).filter(k => /^historico\/\d{4}-\d{2}\.json$/.test(k)).sort().reverse().slice(0, Math.max(1, Math.min(Number(meses) || 3, 24)));
    const n = utilizador ? normalizarUtilizador(utilizador) : '';
    return (await Promise.all(chaves.map(k => lerJSON(k)))).filter(Array.isArray).flat()
      .filter(e => (!freguesia || e.freguesia === freguesia) && (!n || normalizarUtilizador(e.utilizador) === n || normalizarUtilizador(e.alvo) === n))
      .sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, Math.max(1, Math.min(Number(limite) || 300, 2000)));
  }
  // ---- evento: um levantamento no terreno (por exemplo da iluminação pública) que a administração liga e desliga ----
  const KE = 'evento/atual.json';
  async function lerEvento() { const e = await lerJSON(KE); return e && e.id ? e : null; }
  async function definirEvento(admin, { id, nome, ativo }, contexto = {}) {
    if (!admin || admin.papel !== 'admin') return { erro: 'Só a administração liga e desliga eventos', codigo: 403 };
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(id || ''))) return { erro: 'Evento inválido', codigo: 400 };
    const atual = await lerEvento(), evento = { id, nome: String(nome || (atual && atual.nome) || id).slice(0, 80), ativo: !!ativo, desde: new Date().toISOString(), por: admin.utilizador };
    await armazem.escrever(KE, JSON.stringify(evento, null, 1));
    await registar({ conta: admin, acao: (ativo ? 'ativou' : 'desativou') + ' o evento', alvo: evento.nome, origem: contexto.origem });
    return { evento };
  }
  return { entrar, verificar, mudarPalavraPasse, reporPalavraPasse, listar, registar, historico, garantir, lerEvento, definirEvento };
}
