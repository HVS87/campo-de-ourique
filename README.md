# Campo de Ourique — apresentação interativa

Apresentação assente num mapa de satélite da freguesia de Campo de Ourique (Lisboa), com o exterior
escurecido e pontos de interesse (pontos, conjuntos de pontos, ruas inteiras e zonas com pontos dentro)
que abrem um painel de informação.

## Como abrir

```bash
node tools/serve.mjs
```

Depois: http://localhost:8081/ (arranca em modo de visualização; o lápis no canto superior direito liga o
modo de edição, e `?editor` abre-o logo). Também abre diretamente a partir do ficheiro `index.html`, sem
servidor; só a imagem de satélite em direto precisa de internet, e sem o servidor local o modo de edição
não grava diretamente (transfere o ficheiro).

## Modo de edição

Liga-se no lápis (canto superior direito). Barra de ferramentas no topo:

- **Mover**: clicar num elemento abre o cartão em modo de formulário; arrastar um ponto muda a posição; largar
  um ponto sobre uma zona mete-o dentro dela (enquanto se arrasta sobre a zona, o ponto encolhe e pulsa e a
  zona pisca, a indicar que vai «mergulhar»); arrastar um ponto para fora da zona tira-o de lá. Numa zona
  selecionada aparecem os vértices: arrastam-se, os pontos médios criam vértices novos e um duplo clique num
  vértice apaga-o.
- **Ponto**: um clique no mapa cria um ponto (dentro de uma zona fica filho dela).
- **Zona** (vértices, duplo clique termina) e **Zona livre** (pincel): desenham zonas novas.
- **Rua**: liga a camada das ruas e um clique numa rua cria o elemento com o traçado do OpenStreetMap.
- **Lote**: liga a camada dos lotes e um clique num lote cria uma zona com o contorno do cadastro.
- **Título e subtítulo** editam-se na segunda linha da barra.
- **Cartão em modo de formulário**: nome, símbolo, texto (parágrafos separados por linha em branco; aceita HTML,
  com botões para ligação, negrito e itálico), fotos (ficheiros do computador, que o servidor grava em
  `assets/fotos/`, ou por endereço; legenda por foto), ordem no índice e no guião (↑ ↓), apagar.
- **Guardar** escreve `dados/conteudos.js` através do servidor local (o ficheiro anterior fica em
  `dados/conteudos.anterior.js`). **Transferir** descarrega o mesmo ficheiro, para quando a apresentação não
  está servida por `tools/serve.mjs`; nesse caso as fotos ficam embebidas. Enquanto há alterações por guardar,
  ficam também num rascunho no browser, que é proposto na próxima vez que se entra em edição.

## Ficheiros

- `index.html` — a apresentação final, pensada para ecrãs 16:9 mas funcional em tablet e telemóvel. Satélite
  DGT OrtoSat 2023 em direto por WMS, com a imagem fixa por baixo (aparece logo e fica como reserva automática
  se o servidor da DGT falhar ou não houver rede); exterior da freguesia escurecido a 72 %. Os pontos de
  interesse são círculos coloridos por tipo, que pulsam ao passar o cursor; a informação abre num cartão
  central. À esquerda, um painel colapsável (fechado ao arrancar, botão ☰) com o índice por tipo, o botão
  «Guião passo a passo» (setas ‹ › ou teclado: ←, →, Espaço, Home, End) e «Vista geral». Em cima à direita,
  uma caixa de pesquisa discreta (atalho: tecla /) que procura lugares, zonas e todas as ruas, sem acentos,
  com escrita predicativa (a conclusão aparece a cinzento; Tab ou → aceita; ↑ ↓ e Enter escolhem na lista).
  Em baixo à esquerda, o botão «Camadas» abre um painel colapsável (fechado ao arrancar) com quatro camadas
  opcionais, todas desligadas por predefinição: «Pontos nas zonas» (mostra sempre os pontos escondidos dentro
  das zonas); «Nomes das ruas» (traçado de todas as ruas da freguesia, OSM: ao passar o cursor a rua
  ilumina-se e o nome surge ao longo da via; a partir do zoom 17 aparecem os nomes de todas as que têm
  comprimento para isso); «Números de polícia» (do cadastro municipal, visíveis a partir do zoom 17,5, só
  para o que está no ecrã); e «Lotes do cadastro» (contornos dos 2689 edifícios da cartografia municipal
  1/1000, com a morada ao passar o cursor). Os pontos dentro
  de uma zona ficam escondidos até se selecionar a zona (ou um deles, pelo índice ou pela pesquisa), ou até
  se ligar o interruptor «Pontos nas zonas». Carregar numa zona faz o mapa voar até ela ocupar o máximo do
  ecrã possível, com os seus pontos à vista; o cartão encosta à direita ou em baixo, conforme o que deixa a
  zona maior, para não a tapar. Ao desselecionar a zona (clique no mapa ou Esc) o mapa volta à vista inicial
  da freguesia. Esc fecha o que estiver aberto. Cada elemento tem ligação própria: `index.html#id`.
- `dados/conteudos.js` — título, subtítulo e lista de pontos de interesse; é o ficheiro que o modo de edição
  grava. O modelo está explicado no cabeçalho do ficheiro. Os elementos atuais são exemplos.
- `dados/geo.js` — limite da freguesia, ruas (Ferreira Borges, Saraiva de Carvalho, Coelho da Rocha),
  jardins e Mercado (OpenStreetMap, ODbL), em `[lat, lon]`, mais os limites da imagem fixa. Em
  `conteudos.js` uma rua ou zona pode referir-se a estes dados por nome (`rua: '...'`, `area: '...'`).
- `dados/ruas.js` — todas as ruas com nome da freguesia (98), recortadas ao limite e encadeadas, geradas por
  `node tools/ruas-osm.mjs` a partir do OpenStreetMap (Overpass). Em `conteudos.js` uma rua pode usar
  `rua: 'Nome'` com qualquer destes nomes.
- `dados/edificado.js` — edificado da freguesia segundo a Câmara Municipal de Lisboa (serviço «Edificado e Vias»
  em geodados / ArcGIS Online): contorno, morada e código SIG de cada edifício, mais os números de polícia
  derivados da morada. Gerado por `node tools/edificado-cml.mjs` (893 kB).
- `dados/campo-de-ourique.geojson` — o mesmo limite em GeoJSON (OpenStreetMap, relação 6427490).
- `assets/satelite-dgt-2023.jpg` — imagem fixa de 4096×3061 px, OrtoSat 2023 da DGT (CC BY 4.0),
  em EPSG:3857, bbox lat 38.7110–38.7254, lon −9.1775 a −9.1528.
- `assets/fotos/` — fotos dos pontos de interesse, referidas em `conteudos.js`.
- `vendor/leaflet/` — Leaflet 1.9.4 guardado localmente (funciona sem internet).
- `prototipo.html` — protótipo com todas as alternativas comutáveis (satélite, máscara, janela,
  navegação, marcadores, editor), mantido para consulta. Usa o Leaflet do CDN.
- `tools/serve.mjs` — servidor local simples (porta 8081), sem dependências; aceita do modo de edição a gravação
  de `dados/conteudos.js` e das fotos em `assets/fotos/` (só a partir desta máquina).
- `tools/ruas-osm.mjs` — regenera `dados/ruas.js` a partir do OpenStreetMap (precisa de internet).
- `tools/edificado-cml.mjs` — regenera `dados/edificado.js` a partir do serviço da CML; `tools/edificado-osm.mjs`
  é a alternativa com o edificado e os números do OpenStreetMap (escreve `dados/edificado-osm.js`).

Satélite em direto: WMS da DGT, `https://ortos.dgterritorio.gov.pt/wms/ortosat2023`,
camada `ortoSat2023-CorVerdadeira` (~0,3 m/píxel).
