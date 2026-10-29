// Preset «Exemplo»: dados de demonstração com os quatro tipos de elemento (ponto, conjunto, rua, zona com pontos dentro).
// O modo de edição grava os presets em dados/presets/<id>.js e copia o ativo para dados/conteudos.js (ao gravar,
// este cabeçalho é substituído; o modelo completo dos campos está no README.md).
// Carregado depois de dados/geo.js e dados/ruas.js, por isso pode usar window.MAPA_DADOS (ruas e áreas do OpenStreetMap).
//
// Modelo de cada elemento:
//   { id, tipo: 'ponto' | 'grupo' | 'rua' | 'zona', nome, icone, texto, fotos, pos | pontos | linhas | poligono, filhos }
//
//   id        identificador único, sem espaços (serve também na ligação: index.html#id)
//   tipo      'ponto'  — um lugar, com `pos: [lat, lon]`
//             'grupo'  — vários marcadores com o mesmo cartão, com `pontos: [[lat, lon], ...]`
//             'rua'    — rua em toda a extensão, com `linhas: [[[lat, lon], ...], ...]`
//                        ou só `rua: 'Nome'` para ir buscar o traçado a geo.js ou a ruas.js
//             'zona'   — área pintada, com `poligono: [[lat, lon], ...]`
//                        ou só `area: 'Nome'` para ir buscar o polígono a geo.js (areas);
//                        pode ter `filhos`: pontos dentro da zona, que só aparecem quando a zona está selecionada
//   nome      título do cartão
//   icone     um emoji ou símbolo, mostrado no índice e no cartão
//   texto     texto do cartão: uma string (pode ter HTML) ou uma lista de parágrafos
//   fotos     lista de fotos: 'assets/fotos/x.jpg' ou { src: 'assets/fotos/x.jpg', legenda: '...' }
//   prioridade (opcional) cor no mapa: 'urgente' (preto), 'importante' (vermelho), 'preocupante' (amarelo),
//             'pouco' (verde) ou 'sugestao' (branco); sem prioridade fica cinzento
//
// Opcionais no objeto principal: visita: [ids] (ordem dos destaques) e categorias: [{ id, nome, icone, cor, membros: [ids] }].
// Para criar e editar tudo isto sem tocar neste ficheiro: abrir a apresentação e carregar no lápis (modo de edição).
//
// Os elementos abaixo são EXEMPLOS: textos e posições por substituir pelos conteúdos reais.

(function () {
  const D = window.MAPA_DADOS;
  const centro = pts => { let a = 0, b = 0; for (const p of pts) { a += p[0]; b += p[1]; } return [a / pts.length, b / pts.length]; };
  const cMercado = centro(D.areas['Mercado de Campo de Ourique']);
  const cParada = centro(D.areas['Jardim da Parada']);
  // pontos únicos da Rua Coelho da Rocha, de oeste para leste (só para as posições de exemplo do grupo)
  const coelho = [...new Map(D.ruas['Rua Coelho da Rocha'].flat().map(p => [p.join(), p])).values()].sort((a, b) => a[1] - b[1]);

  window.CONTEUDOS_PRESET = {
    preset: 'exemplo',
    titulo: 'Campo de Ourique (exemplo)',
    subtitulo: 'Dados de demonstração',
    elementos: [
      {
        id: 'mercado', tipo: 'ponto', prioridade: 'pouco', nome: 'Mercado de Campo de Ourique', icone: '🛒', pos: cMercado,
        texto: [
          'Ponto singular: um marcador, um cartão. Aqui entra o texto real, com fotos e, se quiseres, datas.',
          'Este segundo parágrafo é só para mostrar que o texto pode ser uma lista de parágrafos.',
        ],
        fotos: [],
      },
      {
        id: 'cafes', tipo: 'grupo', prioridade: 'sugestao', nome: 'Os cafés da Coelho da Rocha', icone: '☕',
        pontos: [coelho[Math.floor(coelho.length * .15)], coelho[Math.floor(coelho.length * .5)], coelho[Math.floor(coelho.length * .85)]],
        texto: 'Conjunto de pontos: três marcadores partilham o mesmo cartão e acendem-se juntos quando se seleciona qualquer um deles. Posições de exemplo.',
        fotos: [],
      },
      {
        id: 'ferreira-borges', tipo: 'rua', prioridade: 'importante', nome: 'Rua Ferreira Borges', icone: '🛣️', rua: 'Rua Ferreira Borges',
        texto: 'Rua em toda a extensão: o traçado vem do OpenStreetMap (todos os troços com este nome dentro da freguesia) e ilumina-se ao selecionar.',
        fotos: [],
      },
      {
        id: 'saraiva-carvalho', tipo: 'rua', prioridade: 'preocupante', nome: 'Rua Saraiva de Carvalho', icone: '🛣️', rua: 'Rua Saraiva de Carvalho',
        texto: 'Segunda rua, para ver duas ruas lado a lado.',
        fotos: [],
      },
      {
        id: 'parada', tipo: 'zona', prioridade: 'urgente', nome: 'Jardim da Parada', icone: '🌳', area: 'Jardim da Parada',
        texto: 'Zona: polígono tirado do OpenStreetMap. Ao selecionar, a zona preenche-se e aparecem os pontos que contém.',
        fotos: [],
        filhos: [
          { id: 'parada-coreto', tipo: 'ponto', prioridade: 'sugestao', nome: 'Coreto (exemplo)', icone: '🎶', pos: [cParada[0] + 0.00008, cParada[1] - 0.00025], texto: 'Ponto dentro da zona. Posição de exemplo.', fotos: [] },
          { id: 'parada-quiosque', tipo: 'ponto', prioridade: 'importante', nome: 'Quiosque (exemplo)', icone: '🥐', pos: [cParada[0] - 0.00012, cParada[1] + 0.00028], texto: 'Outro ponto dentro da zona. Posição de exemplo.', fotos: [] },
        ],
      },
      {
        id: 'quarteirao-mercado', tipo: 'zona', prioridade: 'preocupante', nome: 'Quarteirão do Mercado (zona pintada)', icone: '🧱',
        poligono: [[cMercado[0] + 0.00075, cMercado[1] - 0.0011], [cMercado[0] + 0.00085, cMercado[1] + 0.0009], [cMercado[0] - 0.0008, cMercado[1] + 0.001], [cMercado[0] - 0.0009, cMercado[1] - 0.001]],
        texto: 'Zona desenhada à mão (um retângulo de exemplo): um bairro, um quarteirão, «a nossa rua e arredores». No modo de edição desenham-se zonas destas diretamente no mapa.',
        fotos: [],
        filhos: [
          { id: 'quarteirao-ponto', tipo: 'ponto', prioridade: 'pouco', nome: 'Ponto dentro do quarteirão', icone: '📍', pos: [cMercado[0] - 0.0004, cMercado[1] + 0.0005], texto: 'Exemplo.', fotos: [] },
        ],
      },
    ],
  };
})();
