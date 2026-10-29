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

Liga-se no lápis (canto superior direito). Barra de ferramentas no topo (em telemóvel mostra só as
ferramentas; «⋯ Mais» abre o título, o subtítulo e os presets):

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
- **Visita guiada** (no índice, em edição): lista ordenada dos destaques com ↑ ↓ e ✕, seletor para acrescentar
  qualquer elemento (incluindo pontos dentro de zonas) e «Repor» para voltar à ordem natural. Cada cartão em
  formulário tem também a caixa «Destaque na visita guiada».
- **Categorias** (no índice, em edição): «+ Nova categoria» abre o cartão da categoria com nome, símbolo, cor,
  lista de membros (tirar com ✕, acrescentar pelo seletor) e «Apagar categoria»; ✎ num chip volta a abrir.
  Em cada cartão de elemento há caixas para o pôr nas categorias. Um elemento pode estar em várias.
- **Cartão em modo de formulário**: nome, símbolo, texto (parágrafos separados por linha em branco; aceita HTML,
  com botões para ligação, negrito e itálico), fotos (ficheiros do computador, que o servidor grava em
  `assets/fotos/`, ou por endereço; legenda por foto), ordem no índice (↑ ↓; a visita segue esta ordem
  enquanto não for personalizada), caixas de categorias e de destaque na visita, apagar.
- **Guardar** escreve `dados/conteudos.js` através do servidor local (o ficheiro anterior fica em
  `dados/conteudos.anterior.js`).
- **Presets** (terceira linha da barra): há vários presets, cada um em `dados/presets/<id>.js`; o seletor troca
  o preset ativo (também existe no fundo do painel do índice, em visualização) e o ativo é copiado para
  `dados/conteudos.js`, que é o que a apresentação abre. Ao arrancar vêm dois: **Campo de Ourique** (vazio,
  para os conteúdos reais) e **Campo de Ourique (exemplo)** (dados de demonstração). **Novo…** cria um preset
  vazio com o nome que escolheres; **Apagar** apaga o ativo (fica uma cópia `.apagado.bak`); **Importar…**
  carrega um preset exportado (.json) ou um `conteudos.js` gravado por esta ferramenta para dentro do preset
  ativo, com confirmação; **Exportar** transfere o preset ativo em JSON; **Transferir conteudos.js** transfere
  o ficheiro no formato de `dados/conteudos.js`, para quando a apresentação não está servida por
  `tools/serve.mjs` (nesse caso as fotos ficam embebidas); **Repor do ficheiro** descarta o trabalho em curso
  e volta ao que está gravado. A gravação automática é independente por preset, e o preset escolhido fica
  lembrado neste browser entre sessões.
- **Gravação automática**: cada alteração fica guardada no browser (localStorage) e é reposta automaticamente ao
  abrir a página, mesmo que não se tenha gravado o ficheiro; a barra indica «Alterações por guardar
  (recuperadas de …)». Se `dados/conteudos.js` tiver sido alterado depois (à mão ou noutro browser), vale o
  ficheiro. Só se perde com «Repor do ficheiro» ou ao limpar os dados do site. O aviso ao fechar a página só
  aparece em modo de edição.

## Modelo de `dados/conteudos.js`

`window.CONTEUDOS = { preset, titulo, subtitulo, elementos, visita?, categorias? }` (o mesmo objeto, em
`window.CONTEUDOS_PRESET`, em cada ficheiro de `dados/presets/`)

- Elemento: `{ id, tipo, nome, icone?, texto, fotos, … }` com `tipo` em `ponto` (`pos: [lat, lon]`), `grupo`
  (`pontos: [[lat, lon], …]`), `rua` (`linhas: [[[lat, lon], …], …]` ou `rua: 'Nome'` para ir buscar o traçado
  a `geo.js`/`ruas.js`) e `zona` (`poligono: [[lat, lon], …]` ou `area: 'Nome'` de `geo.js`; `lote` guarda o
  código SIG quando veio do cadastro; `filhos`: pontos dentro da zona).
- `prioridade` (opcional): cor do elemento no mapa, no índice e no cartão: `urgente` (preto, problema urgente),
  `importante` (vermelho), `preocupante` (amarelo), `pouco` (verde, pouco preocupante) ou `sugestao` (branco,
  sugestão). Sem prioridade, o elemento fica cinzento. Escolhe-se no cartão em modo de edição.
- `texto`: string (pode ter HTML) ou lista de parágrafos. `fotos`: `[{ src, legenda }]` (`src` é um caminho
  como `assets/fotos/x.jpg`, um endereço ou, sem servidor, uma imagem embebida).
- `visita`: lista de ids pela ordem dos destaques (ausente = todos os elementos de topo, pela ordem do índice).
- `categorias`: `[{ id, nome, icone, cor, membros: [ids] }]`.

## Ficheiros

- `index.html` — a apresentação final, pensada para ecrãs 16:9 mas funcional em tablet e telemóvel (em ecrãs
  estreitos o zoom faz-se com os dedos e os controlos saem da frente do cartão e da visita). Satélite
  DGT OrtoSat 2023 em direto por WMS, com a imagem fixa por baixo (aparece logo e fica como reserva automática
  se o servidor da DGT falhar ou não houver rede); exterior da freguesia escurecido a 72 %. Os pontos de
  interesse são círculos com a cor da prioridade, que pulsam ao passar o cursor, tal como as ruas destacadas
  e as zonas, de onde saem ondas da mesma cor; a informação abre num cartão
  central. À esquerda, um painel colapsável (fechado ao arrancar, botão ☰) com as categorias (chips que
  filtram o mapa e o índice; combinam-se; ▶ visita a categoria; «Mostrar tudo» limpa), o índice por tipo,
  o botão «Visita guiada» (setas ‹ › ou teclado: ←, →, Espaço, Home, End; um seletor na barra troca entre a
  visita completa e a visita de cada categoria) e «Vista geral». As categorias também aparecem na pesquisa e,
  nos cartões, como chips que abrem o cartão da categoria (lista de membros, «Visitar», «Mostrar só esta»). Em cima à direita,
  uma caixa de pesquisa discreta (atalho: tecla /) que procura lugares, zonas e todas as ruas, sem acentos,
  com escrita preditiva (a conclusão aparece a cinzento; Tab ou → aceita; ↑ ↓ e Enter escolhem na lista).
  Em baixo à esquerda, o botão «Camadas» abre um painel colapsável (fechado ao arrancar) com quatro camadas
  opcionais, todas desligadas por predefinição: «Pontos nas zonas» (mostra sempre os pontos escondidos dentro
  das zonas); «Nomes das ruas» (traçado de todas as ruas da freguesia, OSM: ao passar o cursor a rua
  ilumina-se e o nome surge ao longo da via; a partir do zoom 17 aparecem os nomes de todas as que têm
  comprimento para isso); «Números de polícia» (do cadastro municipal, desenhados num canvas a partir do
  zoom 17,5, só para o que está no ecrã); e «Lotes do cadastro» (contornos dos 2689 edifícios da cartografia municipal
  1/1000, com a morada ao passar o cursor). Os pontos dentro
  No canto inferior direito, o botão «Legenda» (fechado ao arrancar) mostra o significado das cores e quantos
  elementos há de cada prioridade: preto para problemas urgentes, vermelho para situações importantes, amarelo
  para situações preocupantes, verde para situações pouco preocupantes e branco para sugestões.
  de uma zona ficam escondidos até se selecionar a zona (ou um deles, pelo índice ou pela pesquisa), ou até
  se ligar o interruptor «Pontos nas zonas». Carregar numa zona faz o mapa voar até ela ocupar o máximo do
  ecrã possível, com os seus pontos à vista; o cartão encosta à direita ou em baixo, conforme o que deixa a
  zona maior, para não a tapar. Ao desselecionar a zona (clique no mapa ou Esc) o mapa volta à vista inicial
  da freguesia. Esc fecha o que estiver aberto. Cada elemento tem ligação própria: `index.html#id`.
- `dados/conteudos.js` — cópia do preset ativo (`preset`, título, subtítulo, elementos, `visita`, `categorias`),
  gravada pelo modo de edição; é o que a apresentação carrega.
- `dados/presets/` — um ficheiro por preset (`window.CONTEUDOS_PRESET`) e `index.js` com a lista
  (`window.PRESETS`), regenerada pelo servidor a cada gravação. `exemplo.js` tem os dados de demonstração;
  `campo-de-ourique.js` é o preset vazio para os conteúdos reais.
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
  dos presets (`dados/presets/`, cópia ativa em `dados/conteudos.js`) e das fotos em `assets/fotos/` (só a
  partir desta máquina e da própria página).
- `tools/ruas-osm.mjs` — regenera `dados/ruas.js` a partir do OpenStreetMap (precisa de internet).
- `tools/edificado-cml.mjs` — regenera `dados/edificado.js` a partir do serviço da CML; `tools/edificado-osm.mjs`
  é a alternativa com o edificado e os números do OpenStreetMap (escreve `dados/edificado-osm.js`).

Satélite em direto: WMS da DGT, `https://ortos.dgterritorio.gov.pt/wms/ortosat2023`,
camada `ortoSat2023-CorVerdadeira` (~0,3 m/píxel).

## Licença

O código deste projeto está sob a licença MIT: ver [LICENSE](LICENSE). Os dados e as imagens de terceiros
(Leaflet, DGT, OpenStreetMap, Câmara Municipal de Lisboa e Wikimedia Commons) mantêm as suas licenças, listadas
em [LICENCAS-TERCEIROS.md](LICENCAS-TERCEIROS.md).
