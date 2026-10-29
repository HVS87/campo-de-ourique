# Campo de Ourique — apresentação interativa

Apresentação assente num mapa de satélite da freguesia de Campo de Ourique (Lisboa), com o exterior
escurecido e pontos de interesse (pontos, conjuntos de pontos, ruas inteiras e zonas com pontos dentro)
que abrem um painel de informação.

## Como abrir

```bash
node tools/serve.mjs
```

Depois: http://localhost:8081/ (a apresentação) e http://localhost:8081/?editor (a mesma, com o editor
de zonas e pontos). Também abre diretamente a partir do ficheiro `index.html`, sem servidor; só a imagem
de satélite em direto precisa de internet.

## Ficheiros

- `index.html` — a apresentação final, pensada para ecrãs 16:9 mas funcional em tablet e telemóvel. Satélite
  DGT OrtoSat 2023 em direto por WMS, com a imagem fixa por baixo (aparece logo e fica como reserva automática
  se o servidor da DGT falhar ou não houver rede); exterior da freguesia escurecido a 72 %. Os pontos de
  interesse são círculos coloridos por tipo, que pulsam ao passar o cursor; a informação abre num cartão
  central. À esquerda, um painel colapsável (fechado ao arrancar, botão ☰) com o índice por tipo, o botão
  «Guião passo a passo» (setas ‹ › ou teclado: ←, →, Espaço, Home, End) e «Vista geral». Em cima à direita,
  uma caixa de pesquisa discreta (atalho: tecla /) que procura lugares, zonas e todas as ruas, sem acentos,
  com escrita predicativa (a conclusão aparece a cinzento; Tab ou → aceita; ↑ ↓ e Enter escolhem na lista).
  Em baixo à esquerda, o interruptor «Nomes das ruas» liga uma camada opcional (desligada por predefinição)
  com o traçado de todas as ruas da freguesia: ao passar o cursor a rua ilumina-se e o nome surge ao longo da
  via; a partir do zoom 17 aparecem os nomes de todas as que têm comprimento para isso. Esc fecha o que
  estiver aberto. Cada elemento tem ligação própria: `index.html#id`.
- `index.html?editor` — mostra a barra do editor (só para preparar conteúdos, só com rato): polígono por
  vértices, pincel livre, ponto (fica filho da zona selecionada se cair dentro dela), apagar último,
  copiar JSON. Nada é guardado: o JSON copia-se para `dados/conteudos.js`.
- `dados/conteudos.js` — título, subtítulo e lista de pontos de interesse. O modelo está explicado no
  cabeçalho do ficheiro. Os elementos atuais são exemplos, por substituir pelos reais.
- `dados/geo.js` — limite da freguesia, ruas (Ferreira Borges, Saraiva de Carvalho, Coelho da Rocha),
  jardins e Mercado (OpenStreetMap, ODbL), em `[lat, lon]`, mais os limites da imagem fixa. Em
  `conteudos.js` uma rua ou zona pode referir-se a estes dados por nome (`rua: '...'`, `area: '...'`).
- `dados/ruas.js` — todas as ruas com nome da freguesia (98), recortadas ao limite e encadeadas, geradas por
  `node tools/ruas-osm.mjs` a partir do OpenStreetMap (Overpass). Em `conteudos.js` uma rua pode usar
  `rua: 'Nome'` com qualquer destes nomes.
- `dados/campo-de-ourique.geojson` — o mesmo limite em GeoJSON (OpenStreetMap, relação 6427490).
- `assets/satelite-dgt-2023.jpg` — imagem fixa de 4096×3061 px, OrtoSat 2023 da DGT (CC BY 4.0),
  em EPSG:3857, bbox lat 38.7110–38.7254, lon −9.1775 a −9.1528.
- `assets/fotos/` — fotos dos pontos de interesse, referidas em `conteudos.js`.
- `vendor/leaflet/` — Leaflet 1.9.4 guardado localmente (funciona sem internet).
- `prototipo.html` — protótipo com todas as alternativas comutáveis (satélite, máscara, janela,
  navegação, marcadores, editor), mantido para consulta. Usa o Leaflet do CDN.
- `tools/serve.mjs` — servidor local simples (porta 8081), sem dependências.
- `tools/ruas-osm.mjs` — regenera `dados/ruas.js` a partir do OpenStreetMap (precisa de internet).

Satélite em direto: WMS da DGT, `https://ortos.dgterritorio.gov.pt/wms/ortosat2023`,
camada `ortoSat2023-CorVerdadeira` (~0,3 m/píxel).
