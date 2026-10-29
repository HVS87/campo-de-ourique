// Conteúdos da apresentação: título e pontos de interesse.
// Carregado depois de dados/geo.js, por isso pode usar window.MAPA_DADOS (ruas e áreas do OpenStreetMap).
//
// Modelo de cada elemento:
//   { id, tipo: 'ponto' | 'grupo' | 'rua' | 'zona', nome, icone, texto, fotos, pos | pontos | linhas | poligono, filhos }
//
//   id        identificador único, sem espaços (serve também na ligação: index.html#id)
//   tipo      'ponto'  — um lugar, com `pos: [lat, lon]`
//             'grupo'  — vários marcadores com a mesma janela, com `pontos: [[lat, lon], ...]`
//             'rua'    — rua em toda a extensão, com `linhas: [[[lat, lon], ...], ...]`
//                        ou só `rua: 'Nome'` para ir buscar o traçado a geo.js (ruas)
//             'zona'   — área pintada, com `poligono: [[lat, lon], ...]`
//                        ou só `area: 'Nome'` para ir buscar o polígono a geo.js (areas);
//                        pode ter `filhos`: pontos dentro da zona, que só aparecem quando a zona está selecionada
//   nome      título da janela
//   icone     um emoji ou símbolo, mostrado no índice e na janela (os marcadores são pinos numerados)
//   texto     texto da janela: uma string (pode ter HTML) ou uma lista de parágrafos
//   fotos     lista de fotos: 'assets/fotos/x.jpg' ou { src: 'assets/fotos/x.jpg', legenda: '...' }
//
// Para obter coordenadas de novas zonas e pontos: abrir index.html?editor, desenhar, e copiar o JSON.
//
// Os elementos abaixo são EXEMPLOS: textos e posições por substituir pelos conteúdos reais.

(function () {
  const D = window.MAPA_DADOS;
  const centro = pts => { let a = 0, b = 0; for (const p of pts) { a += p[0]; b += p[1]; } return [a / pts.length, b / pts.length]; };
  const cMercado = centro(D.areas['Mercado de Campo de Ourique']);
  const cParada = centro(D.areas['Jardim da Parada']);
  // pontos únicos da Rua Coelho da Rocha, de oeste para leste (só para as posições de exemplo do grupo)
  const coelho = [...new Map(D.ruas['Rua Coelho da Rocha'].flat().map(p => [p.join(), p])).values()].sort((a, b) => a[1] - b[1]);

  window.CONTEUDOS = {
    titulo: 'Campo de Ourique',
    subtitulo: 'Um passeio pela freguesia',
    elementos: [
      {
        id: 'mercado', tipo: 'ponto', nome: 'Mercado de Campo de Ourique', icone: '🛒', pos: cMercado,
        texto: [
          'Ponto singular: um marcador, uma janela. Aqui entra o texto real, com fotos e, se quiseres, datas.',
          'Este segundo parágrafo é só para mostrar que o texto pode ser uma lista de parágrafos.',
        ],
        fotos: [],
      },
      {
        id: 'cafes', tipo: 'grupo', nome: 'Os cafés da Coelho da Rocha', icone: '☕',
        pontos: [coelho[Math.floor(coelho.length * .15)], coelho[Math.floor(coelho.length * .5)], coelho[Math.floor(coelho.length * .85)]],
        texto: 'Conjunto de pontos: três marcadores partilham a mesma janela e acendem-se juntos quando se seleciona qualquer um deles. Posições de exemplo.',
        fotos: [],
      },
      {
        id: 'ferreira-borges', tipo: 'rua', nome: 'Rua Ferreira Borges', icone: '🛣️', rua: 'Rua Ferreira Borges',
        texto: 'Rua em toda a extensão: o traçado vem do OpenStreetMap (todos os troços com este nome dentro da freguesia) e ilumina-se ao selecionar.',
        fotos: [],
      },
      {
        id: 'saraiva-carvalho', tipo: 'rua', nome: 'Rua Saraiva de Carvalho', icone: '🛣️', rua: 'Rua Saraiva de Carvalho',
        texto: 'Segunda rua, para ver duas ruas lado a lado.',
        fotos: [],
      },
      {
        id: 'parada', tipo: 'zona', nome: 'Jardim da Parada', icone: '🌳', area: 'Jardim da Parada',
        texto: 'Zona: polígono tirado do OpenStreetMap. Ao selecionar, a zona preenche-se e aparecem os pontos que contém.',
        fotos: [],
        filhos: [
          { id: 'parada-coreto', tipo: 'ponto', nome: 'Coreto (exemplo)', icone: '🎶', pos: [cParada[0] + 0.00008, cParada[1] - 0.00025], texto: 'Ponto dentro da zona. Posição de exemplo.', fotos: [] },
          { id: 'parada-quiosque', tipo: 'ponto', nome: 'Quiosque (exemplo)', icone: '🥐', pos: [cParada[0] - 0.00012, cParada[1] + 0.00028], texto: 'Outro ponto dentro da zona. Posição de exemplo.', fotos: [] },
        ],
      },
      {
        id: 'quarteirao-mercado', tipo: 'zona', nome: 'Quarteirão do Mercado (zona pintada)', icone: '🧱',
        poligono: [[cMercado[0] + 0.00075, cMercado[1] - 0.0011], [cMercado[0] + 0.00085, cMercado[1] + 0.0009], [cMercado[0] - 0.0008, cMercado[1] + 0.001], [cMercado[0] - 0.0009, cMercado[1] - 0.001]],
        texto: 'Zona desenhada à mão (um retângulo de exemplo): um bairro, um quarteirão, «a nossa rua e arredores». Com o editor (index.html?editor) desenham-se zonas destas e copia-se o JSON para aqui.',
        fotos: [],
        filhos: [
          { id: 'quarteirao-ponto', tipo: 'ponto', nome: 'Ponto dentro do quarteirão', icone: '📍', pos: [cMercado[0] - 0.0004, cMercado[1] + 0.0005], texto: 'Exemplo.', fotos: [] },
        ],
      },
    ],
  };
})();
