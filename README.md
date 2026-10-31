# Campo de Ourique — apresentação interativa

Apresentação assente num mapa de satélite da freguesia de Campo de Ourique (Lisboa), com o exterior
escurecido e pontos de interesse (pontos, conjuntos de pontos, ruas inteiras e zonas com pontos dentro)
que abrem um painel de informação.

## Freguesias

A apresentação cobre as 24 freguesias de Lisboa e abre no mapa da cidade, com as 24 (ver «Mapa de Lisboa»): um clique
numa freguesia abre-a. No painel do índice (☰), o botão «⇄ Freguesia», ao lado do nome, abre a lista: escolher outra
recarrega a página só com os dados dessa freguesia (`?freguesia=<id>` no endereço, que abre logo essa freguesia).
Cada freguesia tem os seus presets, os seus rascunhos e o seu `conteudos.js`.

- **Campo de Ourique**: dados em `dados/` (limite e ruas do OpenStreetMap, edificado e espaços verdes da CML).
- **As outras 23**: dados em `dados/freguesias/<id>/`, gerados por `node tools/freguesias.mjs` a partir dos serviços
  abertos da Câmara Municipal de Lisboa: limite oficial («Base_Freguesias»; Alcântara tem duas partes), ruas («Vias e
  Ruas», recortadas ao limite), lotes e números de polícia («Edificado»), espaços verdes e hortas urbanas («Ambiente
  DMEVAE»), mais a imagem de satélite de reserva da DGT. Cada uma começa com um preset vazio com o nome da freguesia.
- **Camadas novas** no painel «Camadas»: «Espaços verdes» (espaços verdes e hortas urbanas da estrutura ecológica
  municipal, com nome, área e gestão ao passar o cursor) e «Mapa da cidade», que troca o satélite pelo mapa do
  OpenStreetMap como fundo (a escolha fica lembrada).

### Mapa de Lisboa

O botão do mapa por cima do zoom (canto inferior esquerdo), «🗺 Lisboa» no índice ou «Ver todas no mapa de
Lisboa» na lista das freguesias afastam o mapa até à cidade inteira, dividida pelas 24 freguesias, com o nome de
cada uma. Também se chega lá ao continuar a afastar (roda do rato ou «−») depois da vista geral da freguesia, ou
com um clique fora do limite da freguesia, sem nada selecionado (com um cartão aberto, o primeiro clique só o fecha).
Ao passar o cursor, a freguesia pulsa e a barra de baixo mostra o nome e a área; um clique abre-a. No ecrã tátil,
o primeiro toque realça a freguesia e o segundo (ou «Abrir …» na barra) abre-a. «← Voltar» (ou Esc) regressa à
freguesia aberta, e a pesquisa encontra também as freguesias. É aqui que a apresentação abre, quando o endereço não
diz a freguesia (`?cidade` também abre neste mapa). Os
limites (`dados/freguesias/limites.js`, 38 kB) só se transferem quando se abre o mapa de Lisboa. No ecrã tátil, juntar
os dedos (pinça) na vista geral da freguesia também abre o mapa de Lisboa.

### Visita guiada

Na primeira vez que se abre a apresentação, uma visita guiada explica a interface passo a passo: cada passo realça
um elemento do ecrã (a escurecer o resto) e explica-o num cartão, com «Seguinte», «Anterior» e uma barra de
progresso. Nos passos do mapa pode-se experimentar ao mesmo tempo; os outros preparam o ecrã sozinhos (abrem o
índice, a legenda, as camadas ou um cartão) e arrumam-no ao sair do passo.

- **Duas partes:** a da visualização arranca na primeira visita; a da edição arranca sozinha na primeira vez que se
  entra no modo de edição (ferramentas, cartão em formulário, «+», guardar e rascunhos, «⋯ Mais», conta, sair).
- **Sair e retomar:** ✕, «Sair» ou Esc interrompem a visita a qualquer momento. O ponto onde se ia fica lembrado
  neste browser (`co-visita-guiada`), e o botão do índice passa a «🎓 Retomar a visita guiada»; «↺ Do início» recomeça.
  Uma visita interrompida só não volta a aparecer sozinha; a terminada também não.
- **Mudar de freguesia a meio:** no mapa de Lisboa, a visita convida a clicar numa freguesia e continua lá, depois
  de a página recarregar.
- **Teclado:** → ou Espaço avança, ← recua, Esc sai.
- **Adapta-se:** os passos que não se aplicam saltam-se (sem categorias, sem pontos desmaterializados, no mapa de
  Lisboa só os passos da cidade).

A antiga «Visita guiada» dos destaques passou a chamar-se **Vista de Apresentação** (ver o modo de edição e o índice).

## Como abrir

Há duas versões, feitas do mesmo código e dos mesmos dados: a **versão browser** e a **aplicação de computador**.
Tudo o que muda numa muda também na outra, e cada release do GitHub traz as duas.

### Aplicação de computador (Windows, macOS, Linux)

Transfere-se em [Releases](https://github.com/HVS87/campo-de-ourique/releases):

| Ficheiro | Sistema | Notas |
|---|---|---|
| `Campo-de-Ourique-<versão>-instalador.exe` | Windows | Instala e atualiza-se sozinho a partir das releases |
| `Campo-de-Ourique-<versão>-portatil.exe` | Windows | Não instala nada; abre logo, mas não se atualiza sozinho |
| `Campo-de-Ourique-<versão>.dmg` | macOS | |
| `Campo-de-Ourique-<versão>.AppImage` | Linux | |

- **Sem internet:** traz todos os dados das 24 freguesias e funciona sem internet. O satélite em direto passa para
  as imagens guardadas, que dão menos zoom. O «Mapa da cidade», o satélite em direto e o servidor central precisam
  de rede.
- **Onde fica o que se grava:** os presets, as fotos e a cópia ativa ficam na pasta de dados do utilizador, que se
  abre em «Ficheiro → Abrir a pasta dos meus dados» (no Windows, `%APPDATA%\Campo de Ourique\dados-do-utilizador`).
  Sobrepõem-se aos dados que vêm com o programa, e as atualizações não lhes tocam. A gravação automática e a fila
  do servidor central também ficam guardadas.
- **Aviso do sistema:** os executáveis não estão assinados. Na primeira vez, o Windows (SmartScreen) e o macOS
  (Gatekeeper) avisam: no Windows escolhe-se «Mais informações → Executar mesmo assim»; no macOS, botão direito
  → «Abrir».
- **Localização:** «Ponto onde estou» depende de o sistema dar a localização à aplicação.

### Instalar como app no telemóvel ou no tablet

A apresentação alojada em `https` instala-se como aplicação, sem loja nem instalador. No Android aparece um convite no
topo (e o botão «📲 Instalar» no índice ☰); no iPhone e no iPad, esse botão explica o caminho: Safari → Partilhar →
Adicionar ao ecrã principal. Abre em ecrã inteiro, com ícone próprio.

O service worker (`sw.js`) guarda o que já se abriu, para abrir depressa e sem internet: as imagens e as bibliotecas vêm
logo do guardado, os dados vêm da rede, com o guardado como reserva. Contas, sessões e evento nunca se guardam. A
aplicação de computador não precisa disto.

### Versão browser

```bash
node tools/serve.mjs
```

O servidor só responde neste computador; `HOST=0.0.0.0 node tools/serve.mjs` abre-o também à rede local (para ver
noutro aparelho; a gravação continua a aceitar-se só a partir deste computador, e os ficheiros escondidos, como
`.git`, nunca são servidos).

Depois: http://localhost:8081/ (arranca no mapa de Lisboa, em modo de visualização; o lápis no canto superior direito liga o
modo de edição, depois de iniciar sessão, e `?editor` abre-o logo). Também abre diretamente a partir do ficheiro
`index.html`, sem servidor; só a imagem de satélite em direto precisa de internet. Aberta assim, sem servidor local,
a apresentação fica só para ver, a não ser que haja um servidor central configurado: é aí que se verifica a conta,
e «Guardar» transfere o ficheiro e envia o preset para o servidor central.

### Servidor central (opcional)

Com um servidor central, cada «Guardar» envia também o preset para um sítio comum, onde se recolhem e consultam os
dados de todas as pessoas e freguesias. Sem rede, os envios ficam numa fila e seguem quando a rede voltar. O
servidor corre grátis no Cloudflare Workers, com os dados no R2 na União Europeia, e de 24 em 24 horas uma cópia
vem para este computador. A ligação configura-se em `config.js` (para todos) ou no painel «☁ Servidor central» do
modo de edição (para quem o usa). Como o publicar, a cópia local, a reposição e a API estão em
[servidor-central/README.md](servidor-central/README.md).

### Para programar

```bash
npm install
```

| Comando | O que faz |
|---|---|
| `npm start` | versão browser (`tools/serve.mjs`) |
| `npm run app` | aplicação de computador a partir do código |
| `npm test` e `npm run testar` | testes do servidor da apresentação e do servidor central (em Node e no Worker local) |
| `npm run testar:app` | abre a aplicação, guarda, muda de freguesia e simula a falta de internet |
| `npm run dist` | gera o instalador e a versão portátil para Windows em `dist/` |
| `npm run central` | servidor central em Node (dados em ficheiros) |
| `npm run central:local` | servidor central no Worker do Cloudflare, local, com um R2 simulado |
| `npm run central:publicar` | publica o servidor central no Cloudflare (depois de `npx wrangler login`) |

Para publicar uma versão nova das duas:

1. Subir `version` no `package.json`.
2. Fazer commit e criar a tag `v<versão>` (`git tag v1.2.0 && git push --tags`).
3. A compilação automática (`.github/workflows/aplicacao.yml`) testa, gera os executáveis para Windows, macOS e
   Linux e junta-os à release dessa tag. As aplicações instaladas atualizam-se a partir daí. Se o repositório tiver
   o segredo `CLOUDFLARE_API_TOKEN`, republica também o servidor central.

## Contas e histórico

O modo de edição precisa de iniciar sessão. Há uma conta por freguesia, que edita só essa freguesia, e duas para a
cidade toda:

| Conta | Edita | Também |
|---|---|---|
| uma por freguesia (o nome sem espaços nem acentos, por exemplo `Campodeourique`) | só essa freguesia | — |
| `Concelhia.Lisboa` | todas as freguesias | — |
| `System.Admin` | todas as freguesias | vê o histórico de alterações e gere as contas |

- **Entrar:** o utilizador escreve-se como se quiser («Campo de Ourique», «campodeourique» e «CampoDeOurique» são o
  mesmo). As palavras-passe iniciais foram entregues a cada pessoa e não estão neste repositório (só os
  verificadores, em `servidor-central/contas-iniciais.mjs`). Muda-as logo: são fáceis de adivinhar.
- **Outra freguesia:** uma conta de freguesia vê as outras, mas não as edita. O lápis diz de quem é a freguesia e
  oferece abrir a sua.
- **Lembrar-me:** ao iniciar sessão, «Lembrar-me neste dispositivo» mantém a sessão durante 30 dias neste browser ou nesta
  aplicação, mesmo depois de os fechar. Sem isso, a sessão acaba ao fechar (e, no máximo, ao fim de 12 horas).
- **O botão da conta** (as iniciais, ao lado do lápis, sempre que há sessão):
  - todas as contas mudam a sua palavra-passe e **terminam a sessão**. Com alterações por guardar, pergunta antes:
    «Guardar e terminar», «Manter em rascunho e terminar», «Descartar e terminar» ou «Continuar a editar»;
  - a administração vê também o **histórico de alterações** (quem entrou, guardou, ativou ou apagou presets e
    fotos, com o que mudou em cada gravação: elementos acrescentados, mudados e tirados), que exporta em CSV;
  - e gere as **contas**: vê a última entrada de cada uma e repõe palavras-passe (pode gerar uma), o que também
    desbloqueia a conta.
- **Proteção:** a verificação é feita pelo servidor, não pela página. Cada gravação sem sessão, ou numa freguesia que
  não é da conta, é recusada. Cinco palavras-passe erradas seguidas bloqueiam a conta por um minuto, e o bloqueio
  dobra a cada erro, até 15 minutos.
- **Palavras-passe:** nunca saem do browser. Viaja uma chave derivada delas (PBKDF2), e os servidores guardam um
  resumo dessa chave.
- **Onde ficam as contas e o histórico:** cada servidor tem as suas.
  - Na aplicação de computador ficam na pasta dos dados do utilizador (`.contas/`).
  - Na versão browser ficam na pasta do projeto (`.contas/`, que o git ignora e o servidor nunca serve).
  - No servidor central ficam no armazém dele.
  Ao entrar, a apresentação abre a sessão no servidor local e no servidor central com a mesma palavra-passe; ao
  mudá-la, muda nos dois. Se o servidor central recusar, a página avisa e os envios esperam na fila até a conta
  entrar lá.

## Eventos: levantamentos no terreno

Um **evento** é um levantamento feito por equipas por toda a cidade, como o **Levantamento Iluminação Pública**
(candeeiros apagados ou fundidos e candeeiros em falta ou zonas escuras). O `System.Admin` liga-o e desliga-o no menu da
conta → **Evento** (ou na página de consulta do servidor central). O estado fica no servidor central, se houver, e no
servidor local; a apresentação lembra-o neste browser para abrir sem rede.

Com o evento ativo:

- **Ao entrar no modo de edição e no «+»** (também na vista normal, depois de iniciar sessão), pergunta-se o que se quer
  registar: **Levantamento Iluminação Pública** ou **Outros Problemas**, que leva ao menu habitual.
- **O levantamento:**
  1. escolhe-se o tipo: 💡 Candeeiro apagado/fundido ou 🌑 Candeeiro em falta/zona escura (o último fica lembrado);
  2. a apresentação acompanha o GPS durante uns segundos até ter precisão de 12 m (ou o melhor em 9 s) e põe um
     marcador no mapa, ampliado ao máximo; sem GPS (no computador, ou sem autorização), pede um toque no mapa;
  3. sugere a **morada** (rua e número de porta) a partir dos números de polícia da CML (`edificado.js`) e das ruas, sem
     precisar de internet; arrastar o marcador atualiza a sugestão, e os campos podem corrigir-se à mão;
  4. **Confirmar registo** acrescenta o ponto ao conjunto do evento da freguesia (criado no primeiro registo) e grava;
     o mapa fica livre para o registo seguinte. Sem servidor local, o registo segue só para o servidor central, sem
     transferir ficheiros.
- **O conjunto por freguesia** («Levantamento Iluminação Pública», prioridade importante, competência Câmara) tem no
  cartão uma tabela com o total de falhas registadas e o número de cada tipo, e a lista dos registos com morada e
  data (clicar num leva ao sítio no mapa). Os marcadores têm a cor do tipo. Em edição, cada registo pode tirar-se.
- **O resumo da cidade**, no mapa de Lisboa (botão «💡 Resumo da cidade» na barra), é uma tabela com o total de
  Lisboa e, por freguesia, o número de cada tipo. Vem do servidor central (que junta as 24 freguesias) ou, sem ele,
  dos ficheiros de cada freguesia neste computador.
- **A visita guiada não arranca sozinha** na primeira abertura enquanto o evento durar; continua no índice (☰ → 🎓 Visita guiada).

No modelo de dados, o conjunto leva `evento: "iluminacao"` e `detalhes`, uma entrada por ponto:
`{ i, c: "fundido" | "falta", rua, numero, quando, autor, precisao? }`; `i` identifica o registo. Várias equipas podem
registar na mesma freguesia: o servidor central junta os registos de todos os dispositivos, em vez de os substituir, e
cada dispositivo traz os dos outros ao entrar na edição e depois de enviar. Um registo tirado fica em
`removidosEvento` e não volta. O resumo da cidade soma os presets de cada freguesia, sem contar duas vezes o mesmo registo.

## Modo de edição

Liga-se no lápis (canto superior direito), depois de iniciar sessão. Barra de ferramentas no topo (em telemóvel
mostra só as ferramentas; «⋯ Mais» abre o título, o subtítulo e os presets):

- **Mover**: clicar num elemento abre o cartão em modo de formulário; arrastar um ponto muda a posição; largar
  um ponto sobre uma zona mete-o dentro dela (enquanto se arrasta sobre a zona, o ponto encolhe e pulsa e a
  zona pisca, a indicar que vai «mergulhar»); arrastar um ponto para fora da zona tira-o de lá. Numa zona
  selecionada aparecem os vértices: arrastam-se, os pontos médios criam vértices novos e um duplo clique num
  vértice apaga-o.
- **Botão «+»** (canto inferior direito): abre a lista do que se pode criar. Fora da edição é um atalho: pede para
  iniciar sessão, se ainda não houver sessão, entra no modo de edição e abre a lista. O que se pode criar: ponto, conjunto de
  pontos, ponto desmaterializado, rua, zona, zona livre e lote. Em telemóveis e tablets tem também «Ponto onde
  estou» e «Rua onde estou», que usam a localização do aparelho (a rua é a mais próxima, até 60 m; fora da
  freguesia, pergunta antes). O browser só dá a localização a páginas em https ou abertas no próprio aparelho.
- **Ponto**: um clique no mapa cria um ponto (dentro de uma zona fica filho dela). Com uma ferramenta de criar
  escolhida, as zonas e as ruas destacadas deixam passar o clique para o mapa.
- **Conjunto**: vários pontos no mapa com um só cartão. Cada clique acrescenta um ponto; Esc ou «Concluído»
  termina. No cartão do conjunto há a lista dos pontos (✕ tira um) e «＋ Acrescentar pontos no mapa»; um ponto
  também se pode «Transformar em conjunto».
- **Pontos desmaterializados**: sem lugar no mapa, aparecem como um ícone circular no canto superior direito,
  por baixo do lápis. Com mais de um, ficam empilhados (com o número): clicar, ou deixar o cursor 3 s por cima,
  abre-os numa fila vertical com os nomes (com deslocamento quando não cabem no ecrã), e tirar o cursor volta a
  empilhá-los. Criam-se no «+» ou com «◌ Desmaterializar» no cartão de um ponto; «📍 Pôr no mapa» faz o caminho
  inverso.
- **Zona** (vértices, duplo clique termina) e **Zona livre** (pincel): desenham zonas novas.
- **Rua**: liga a camada «Nomes das ruas» e um clique numa rua cria o elemento com o traçado dessa camada
  (OpenStreetMap em Campo de Ourique, Câmara Municipal nas outras freguesias).
- **Lote**: liga a camada dos lotes e um clique num lote cria uma zona com o contorno do cadastro.
- **Título e subtítulo** editam-se na segunda linha da barra.
- **Vista de Apresentação** (no índice, em edição): lista ordenada dos destaques com ↑ ↓ e ✕, seletor para
  acrescentar qualquer elemento (incluindo pontos dentro de zonas) e «Repor» para voltar à ordem natural. Cada cartão
  em formulário tem também a caixa «Destaque na Vista de Apresentação».
- **Categorias** (no índice, em edição): «+ Nova categoria» abre o cartão da categoria com nome, símbolo, cor,
  lista de membros (tirar com ✕, acrescentar pelo seletor) e «Apagar categoria»; ✎ na etiqueta da categoria
  volta a abri-lo.
  Em cada cartão de elemento há caixas para o pôr nas categorias. Um elemento pode estar em várias.
- **Cartão em modo de formulário**: nome, prioridade, competência, símbolo, texto (parágrafos separados por linha em branco; aceita HTML,
  com botões para ligação, negrito e itálico), fotos (ficheiros do computador, que o servidor grava em
  `assets/fotos/`, ou por endereço; legenda por foto), ordem no índice (↑ ↓; a Vista de Apresentação segue esta
  ordem enquanto não for personalizada), caixas de categorias e de destaque na apresentação, apagar.
- **Guardar** escreve, através do servidor local, o ficheiro do preset (`presets/<id>.js`) e a cópia ativa
  `conteudos.js`, na pasta da freguesia (`dados/` em Campo de Ourique, `dados/freguesias/<id>/` nas outras); o
  `conteudos.js` anterior fica em `conteudos.anterior.js`.
- **Sair** (ou o lápis) com alterações por guardar pergunta o que fazer: «Guardar e sair», «Sair sem guardar»
  (as alterações são descartadas e não se recuperam: o preset volta ao que está gravado) ou «Continuar a
  editar». Mudar de freguesia com alterações por guardar faz a mesma pergunta.
- **Presets** (terceira linha da barra): há vários presets, cada um em `dados/presets/<id>.js`; o seletor troca
  o preset ativo (também existe no fundo do painel do índice, em visualização) e o ativo é copiado para
  `dados/conteudos.js`, que é o que a apresentação abre. Em Campo de Ourique há dois: **Campo de Ourique** (os
  conteúdos reais) e **Campo de Ourique (exemplo)** (dados de demonstração). **Novo…** cria um preset
  vazio com o nome que escolheres; **Apagar** apaga o ativo (fica uma cópia `.apagado.bak`); **Importar…**
  carrega um preset exportado (.json) ou um `conteudos.js` gravado por esta ferramenta como **preset
  alternativo** desta freguesia (nunca substitui um existente; com o mesmo nome fica «(importado)»), que passa a
  aparecer no seletor; **Exportar** transfere o preset ativo em JSON, com a freguesia a que pertence. Um preset de
  outra freguesia pode abrir-se nessa freguesia (onde fica como alternativo, sem mexer nos presets desta) ou,
  se se quiser, importar-se aqui. O servidor recusa gravar numa freguesia um preset marcado com outra. Sem
  servidor, os presets novos ficam só neste browser (indicado no seletor) até serem exportados;
  **Transferir conteudos.js** transfere
  o ficheiro no formato de `dados/conteudos.js`, para quando a apresentação não está servida por
  `tools/serve.mjs` (nesse caso as fotos ficam embebidas); **Repor do ficheiro** descarta o trabalho em curso
  e volta ao preset tal como está gravado. O rascunho é independente por preset, e o preset escolhido fica
  lembrado neste browser entre sessões.
- **Rascunho (gravação automática)**: cada alteração fica guardada neste dispositivo (localStorage), mesmo que não se
  tenha gravado o ficheiro.
  - **Quando grava:** meio segundo depois da última alteração, e logo que a página vai para segundo plano, se muda
    de janela ou se fecha, mesmo que se feche sem passar pelo aviso.
  - **De quem é:** cada rascunho é da conta que o fez. Volta quando essa conta entra outra vez no modo de edição; a
    barra indica «Alterações por guardar (rascunho de …)». Quem só vê a apresentação, ou entra com outra conta, vê
    os ficheiros.
  - **Ficheiro mais recente:** se o ficheiro do preset tiver sido alterado depois (à mão ou noutro browser), vale o
    ficheiro.
  - **Quando se perde:** com «Sair sem guardar», «Descartar e terminar», «Repor do ficheiro», ao apagar o preset ou ao
    limpar os dados do site.
  - **Ao fechar com alterações por guardar:** o browser pergunta se fecha mesmo, e a aplicação de computador também.
    O rascunho já ficou feito antes da pergunta.

## Modelo de `dados/conteudos.js`

`window.CONTEUDOS = { preset, freguesia, titulo, subtitulo, elementos, visita?, categorias? }` (o mesmo objeto, em
`window.CONTEUDOS_PRESET`, em cada ficheiro de `dados/presets/`; `freguesia` é o id da freguesia do preset)

- Elemento: `{ id, tipo, nome, icone?, texto, fotos, … }` com `tipo` em `ponto` (`pos: [lat, lon]`), `grupo`
  (`pontos: [[lat, lon], …]`, um só cartão para todos), `desmaterializado` (sem geometria: fica no canto superior
  direito), `rua` (`linhas: [[[lat, lon], …], …]` ou `rua: 'Nome'` para ir buscar o traçado
  a `geo.js`/`ruas.js`) e `zona` (`poligono: [[lat, lon], …]` ou `area: 'Nome'` de `geo.js`; `lote` guarda o
  código SIG quando veio do cadastro; `filhos`: pontos dentro da zona).
- `prioridade` (opcional): cor do elemento no mapa, no índice e no cartão: `urgente` (preto, problema urgente),
  `importante` (vermelho), `preocupante` (amarelo), `pouco` (verde, pouco preocupante) ou `sugestao` (branco,
  sugestão). Sem prioridade, o elemento fica cinzento. Escolhe-se no cartão em modo de edição.
- `competencia` (opcional): a quem cabe resolver: `governo` (Governo), `camara` (Câmara Municipal) ou `junta`
  (Junta de Freguesia). Aparece no cartão.
- `texto`: um texto (pode ter HTML) ou uma lista de parágrafos. `fotos`: `[{ src, legenda }]` (`src` é um caminho
  como `assets/fotos/x.jpg`, um endereço ou, sem servidor, uma imagem embebida).
- `visita`: lista de ids pela ordem dos destaques (ausente = todos os elementos de topo, pela ordem do índice).
- `categorias`: `[{ id, nome, icone, cor, membros: [ids] }]`.

## Ficheiros

- `index.html` — a apresentação final, pensada para ecrãs 16:9 mas funcional em tablet e telemóvel (em ecrãs
  estreitos o zoom faz-se com os dedos e os controlos saem da frente do cartão e da apresentação). Satélite
  DGT OrtoSat 2023 em direto por WMS, com a imagem fixa por baixo (aparece logo e fica como reserva automática
  se o servidor da DGT falhar ou não houver rede); exterior da freguesia escurecido a 72 %. Os pontos de
  interesse são círculos com a cor da prioridade, que pulsam ao passar o cursor, tal como as ruas destacadas
  e as zonas, de onde saem ondas da mesma cor; a informação abre num cartão
  central (no telemóvel, em baixo; com o telemóvel deitado, à direita); no cartão de um ponto dentro de uma zona, a
  seta ‹ ao lado do ✕ volta ao cartão da zona. À esquerda, um painel colapsável
  (fechado ao arrancar, botão ☰) com as categorias (etiquetas que
  filtram o mapa e o índice; combinam-se; ▶ apresenta a categoria; «Mostrar tudo» limpa), o índice por tipo,
  o botão «🎓 Visita guiada» (explica a interface, ver acima), o botão «▶ Vista de Apresentação» (percorre os
  destaques um a um: setas ‹ › ou teclado: ←, →, Espaço, Home, End; um seletor na barra troca entre a
  apresentação completa e a de cada categoria) e «Vista geral». As categorias também aparecem na pesquisa e,
  nos cartões, como etiquetas que abrem o cartão da categoria (lista de membros, «Apresentar», «Mostrar só esta»). Em cima à direita,
  uma caixa de pesquisa discreta (atalho: tecla /) que procura pontos, zonas, categorias, todas as ruas e as
  freguesias, sem acentos e com várias palavras («quinta lou»), com escrita preditiva (a conclusão aparece a
  cinzento; Tab ou → aceita; ↑ ↓ e Enter escolhem na lista).
  Em baixo à esquerda, o botão «Camadas» abre um painel colapsável (fechado ao arrancar) com seis camadas
  opcionais, todas desligadas por predefinição: «Pontos nas zonas» (mostra sempre os pontos escondidos dentro
  das zonas); «Nomes das ruas» (traçado de todas as ruas da freguesia, do OpenStreetMap em Campo de Ourique e
  da Câmara Municipal nas outras; desligada, a camada fica suspensa e não pesa ao mover o mapa; ao passar o cursor a rua
  ilumina-se e o nome surge ao longo da via; a partir do zoom 17 aparecem os nomes de todas as que têm
  comprimento para isso); «Números de polícia» (do cadastro municipal, desenhados num canvas a partir do
  zoom 17,5, só para o que está no ecrã); «Lotes do cadastro» (contornos dos edifícios da cartografia municipal
  1/1000, com a morada ao passar o cursor); «Espaços verdes» (espaços verdes e hortas urbanas da CML, com nome,
  área e gestão); e «Mapa da cidade» (troca o satélite pelo mapa do OpenStreetMap). Os pontos dentro
  de uma zona ficam escondidos até se selecionar a zona (ou um deles, pelo índice ou pela pesquisa), ou até
  se ligar o interruptor «Pontos nas zonas». No canto inferior direito, o botão «Legenda» (fechado ao arrancar)
  mostra o significado das cores e quantos elementos há de cada prioridade: preto para problemas urgentes,
  vermelho para situações importantes, amarelo para situações preocupantes, verde para situações pouco
  preocupantes e branco para sugestões. Carregar numa zona faz o mapa voar até ela ocupar o máximo do
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
- `tools/servidor.mjs` — o servidor em si (ficheiros e gravações do modo de edição), partilhado pela versão browser e
  pela aplicação de computador; pode ler de uma pasta e gravar noutra. `tools/testar-servidor.mjs` testa-o nos dois
  modos.
- `desktop/main.mjs` — a aplicação de computador (Electron): arranca o mesmo servidor só neste computador e abre a
  apresentação numa janela; atualizações pelas releases do GitHub. `desktop/testar-app.mjs` verifica o arranque.
- `config.js` — configuração comum (endereço do servidor central).
- `servidor-central/` — servidor central de referência, página de consulta e testes.
- `servidor-central/contas.mjs` — contas, sessões e histórico de alterações, o mesmo código nos dois servidores;
  `servidor-central/contas-iniciais.mjs` — as 26 contas com que arrancam (só os verificadores).
- `tools/serve.mjs` — servidor local simples (porta 8081), sem dependências; aceita do modo de edição, com uma
  sessão, a gravação dos presets (`dados/presets/`, cópia ativa em `dados/conteudos.js`) e das fotos em
  `assets/fotos/` (só a partir desta máquina e da própria página).
- `tools/ruas-osm.mjs` — regenera `dados/ruas.js` a partir do OpenStreetMap (precisa de internet).
- `manifest.webmanifest`, `sw.js` e `assets/icones/` — instalar como app e abrir sem internet.
- `assets/lisboa-dgt-2023.jpg` e `assets/lisboa-dgt-2023-alto.jpg` — a imagem de Lisboa que aparece logo ao abrir (deitada e
  ao alto, conforme o ecrã), gerada por `node tools/imagem-lisboa.mjs`. O satélite em direto carrega por trás e só entra,
  numa transição, quando o primeiro ecrã estiver completo. Sem internet, é o fundo do mapa de Lisboa.
- `tools/freguesias.mjs` — gera `dados/freguesias/` (lista, limites do mapa de Lisboa e dados de cada freguesia) e
  `dados/verdes.js`; não apaga presets que já existam. `node tools/freguesias.mjs ajuda belem` refaz só essas;
  `--so-limites` escreve só a lista e `dados/freguesias/limites.js`.
- `tools/edificado-cml.mjs` — regenera `dados/edificado.js` a partir do serviço da CML; `tools/edificado-osm.mjs`
  é a alternativa com o edificado e os números do OpenStreetMap (escreve `dados/edificado-osm.js`).

Satélite em direto: WMS da DGT, `https://ortos.dgterritorio.gov.pt/wms/ortosat2023`,
camada `ortoSat2023-CorVerdadeira` (~0,3 m/píxel).

## Licença

O código deste projeto está sob a licença MIT: ver [LICENSE](LICENSE). Os dados e as imagens de terceiros
(Leaflet, DGT, OpenStreetMap, Câmara Municipal de Lisboa e Wikimedia Commons) mantêm as suas licenças, listadas
em [LICENCAS-TERCEIROS.md](LICENCAS-TERCEIROS.md).

## Conjuntos, quarteirões, duplicados, categorias e modo claro/escuro

- **Conjuntos de pontos:** o cartão geral lista os pontos, e cada ponto tem um sub-cartão com nome, texto e fotos próprios (`detalhes[i]` do conjunto), com a seta ‹ de volta ao cartão-mãe. No telemóvel, as fotos vêm da galeria ou da câmara. Em edição, largar um ponto solto em cima de um ponto do conjunto agrega-o; também se pode agregar pelo cartão, e «Desagregar» devolve-o a ponto solto, com o que levava.
- **Ruas por quarteirões:** uma rua é o conjunto dos seus quarteirões, de cruzamento a cruzamento (`quarteiroes`: os ids dos ligados; sem o campo, a rua toda; `tracado`: a rua toda, quando a rua não vem dos dados da freguesia). Em edição ligam-se e desligam-se no cartão ou com um clique na rua. A frase dentro de `<span class="quarteiroes-auto">` no texto atualiza-se sozinha; sem ela, é acrescentada no início.
- **Pontos duplicados:** um ponto a menos de 8 m de outro, ou a menos de 50 m com o mesmo nome, faz perguntar se se consolida ou se mantêm ambos (`duplicadosMantidos` lembra a escolha). As consolidações revertem-se em «Por validar», até à validação, que acontece ao guardar.
- **Categorias:** ao criar, as sugestões mostram as que já existem, nesta e nas outras freguesias, e um nome semelhante faz propor usar a existente. O `System.Admin`, no menu da conta → **Categorias**, funde categorias em todas as freguesias e presets (`GET /categorias`, `POST /categorias/fundir`, nos dois servidores).
- **Modo claro e modo escuro:** o claro é o de origem; o slider está no índice ☰ e a escolha fica neste browser (`co-tema`).
