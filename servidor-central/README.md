# Servidor central

A apresentação funciona sozinha, no browser ou na aplicação de computador, e guarda os presets localmente. Com um
servidor central, cada «Guardar» envia também o preset para um sítio comum, onde se juntam os dados de todas as
pessoas e de todas as freguesias. Quem tiver acesso pode consultá-los e exportá-los, e uma cópia vem de tempos a
tempos para o computador da administração.

O servidor corre no **Cloudflare Workers, no plano grátis, com os dados no R2 guardados na União Europeia**. A
mesma API existe também em Node, para testar, para abrir uma cópia local, ou para correr num servidor próprio. As
duas versões partilham o mesmo código (`nucleo.mjs` e `contas.mjs`):

| Ficheiro | O que é |
|---|---|
| `nucleo.mjs` | a API inteira, sem dependências |
| `contas.mjs` | contas, sessões e histórico de alterações (também usado pelo servidor da apresentação) |
| `contas-iniciais.mjs` | as 26 contas com que o servidor arranca, só com os verificadores |
| `cloudflare/worker.mjs` e `cloudflare/wrangler.toml` | o Worker do Cloudflare, com os dados no R2 |
| `servidor.mjs` | o mesmo em Node, com os dados em ficheiros |
| `consulta.html` | a página de consulta: filtros, mapa, tabela, exportações e, para a administração, histórico, contas e chaves |
| `repor.mjs` | repõe um servidor a partir de uma cópia local |
| `testar.mjs` | a mesma bateria de testes contra o Node e contra o Worker local |
| `GUIA-CLOUDFLARE.md` | o guia passo a passo para o publicar, desde a criação da conta no Cloudflare |

## Publicar no Cloudflare

O Worker serve a apresentação (ficheiros estáticos da pasta `site/`, gerada por `tools/preparar-site.mjs`) e a API. Os dados da apresentação (`/dados/…/conteudos.js`, `presets/…`) passam pelo Worker: o que está guardado no R2, sem autoria, ou o ficheiro publicado, se ainda não houver nada guardado.

Os passos todos, desde a criação da conta, estão em [GUIA-CLOUDFLARE.md](GUIA-CLOUDFLARE.md). Em resumo, na pasta do
projeto e depois de `npm install`:

```bash
npx wrangler login
npx wrangler r2 bucket create ps-lisboa-repositorio --jurisdiction eu
npm run central:publicar
npx wrangler secret put CHAVE_ADMIN --config servidor-central/cloudflare/wrangler.toml
```

Depois:
1. O endereço que aparece no fim (`https://ps-lisboa-repositorio.<subdomínio>.workers.dev`) é a apresentação, já ligada ao servidor. A consulta dos dados está em `/consulta`.
2. Em `/consulta`, entra como `System.Admin`.
3. **Repõe as palavras-passe de todas as contas.**
4. Só para a aplicação de computador: põe o endereço da API em `config.js`.

Opcional:
- **Limitar quem usa a API a partir do browser:** em `wrangler.toml`, `ORIGENS` passa a ter os endereços da
  apresentação, por exemplo `https://hvs87.github.io,http://127.0.0.1:47831`. A aplicação de computador usa as
  portas 47831 a 47840.
- **Republicar o Worker em cada versão:** a compilação automática do GitHub republica-o se o repositório tiver o
  segredo `CLOUDFLARE_API_TOKEN`.

O Wrangler envia estatísticas de uso anónimas ao Cloudflare. Para as desligar: `npx wrangler telemetry disable`.

### Limites do plano grátis

São folgados para este uso; os números são os indicados pelo Cloudflare em 2026.

| Limite | Valor |
|---|---|
| Pedidos | 100 000 por dia |
| Armazenamento | 10 GB |
| Escritas | 1 milhão por mês |
| Leituras | 10 milhões por mês |

- **Escritas por envio:** cada envio faz 7 escritas.
- **Leituras por consulta:** uma consulta lê no máximo um objeto por freguesia, para caber no tempo de
  processador por pedido do plano grátis.
- **Palavras-passe:** o cálculo pesado (PBKDF2 com 100 000 iterações) faz-se no browser de quem entra. O servidor
  só calcula um resumo e uma assinatura, que custam menos de 1 ms.
- **Mais do que isso:** se um dia não chegar, o plano pago custa 5 dólares por mês e não exige mudanças.

## Contas, sessões e quem vê o quê

As contas são as mesmas da apresentação (ver o README principal): uma por freguesia, `Concelhia.Lisboa` e
`System.Admin`. Na primeira vez, o servidor cria-as a partir de `contas-iniciais.mjs`; daí em diante, as contas
estão no armazém dele (`contas/contas.json`), e as palavras-passe mudam-se na página de consulta ou na apresentação.

| Quem | Consulta | Envia | Vê quem fez o quê | Gere contas e chaves, faz a cópia |
|---|---|---|---|---|
| conta de freguesia | todas as freguesias | só a sua | — | — |
| `Concelhia.Lisboa` | todas | todas | — | — |
| `System.Admin` | todas | todas | sim | sim |
| chave «leitor» | todas | — | — | — |
| chave «contribuidor» | todas | as freguesias da chave | — | — |
| chave «administração» e `CHAVE_ADMIN` | todas | todas | sim | sim |

- **Sessão:** entrar (`POST /api/v1/sessao`) dá um testemunho que vale uma semana, para que a fila da apresentação
  possa enviar dias depois de uma edição feita sem rede. Mudar ou repor a palavra-passe termina as sessões
  anteriores dessa conta.
- **Bloqueio:** cinco palavras-passe erradas seguidas bloqueiam a conta por um minuto, e o bloqueio dobra a cada erro,
  até 15 minutos. Repor a palavra-passe desbloqueia.
- **Autores:** o autor de cada envio é a conta que o enviou. Só a administração vê os autores e o histórico; para os
  outros, as listas, os elementos e as exportações vêm sem os nomes.
- **Registos de um evento:** cada envio leva o preset inteiro de um dispositivo, mas os registos de um conjunto de evento juntam-se aos que já lá estão (por id); os tirados ficam em `removidosEvento` e não voltam. Um registo de levantamento segue com `soEvento: true`: o servidor só muda os conjuntos do evento e deixa o resto do preset como está. A posição é a do último arrasto (`movido`), e o `autor` de cada registo só chega à administração.
- **Evento:** o levantamento em curso (ver o README principal) fica em `evento/atual.json`; só a administração o liga e desliga, e isso fica no histórico. A página de consulta mostra o estado, o botão para o ligar e o resumo por freguesia.
- **Histórico:** fica um registo por mês (`historico/AAAA-MM.json`) com as entradas, as entradas recusadas, os
  bloqueios, as mudanças e reposições de palavras-passe e cada envio, com o que mudou: elementos acrescentados,
  mudados e tirados, e o título, as categorias e a visita.
- **Chaves de acesso:** são para máquinas (um computador que faz a cópia local, um serviço que lê os dados). As
  pessoas entram com a sua conta.
- **Segredo das sessões:** gera-se na primeira vez e fica no armazém (`contas/segredo.json`, que nunca sai nas
  cópias). Em alternativa, pode vir do segredo `SEGREDO_SESSOES`.

**As contas do servidor central e as da aplicação de computador são separadas** (cada uma arranca com as mesmas
palavras-passe iniciais). A apresentação abre a sessão nos dois com a mesma palavra-passe e muda-a nos dois. Se o
servidor central recusar, a página avisa e os envios esperam até a conta entrar lá (botão da conta, ao lado do lápis → «Entrar no servidor
central»).

## Cópia local de tempos a tempos

- **Quando:** a aplicação de computador, ou a versão browser com o servidor local (`npm start`), copia o servidor
  central para uma pasta deste computador. Faz isto ao abrir e de 24 em 24 horas (`CONFIG_CENTRAL.copiaHoras` em
  `config.js`; `0` = só à mão).
- **Quem:** a cópia tem tudo, incluindo o histórico e as contas, por isso só se faz com uma sessão da
  administração no servidor central (`System.Admin`) ou com uma chave de administração no painel «☁ Servidor
  central».
- **À mão:** o botão «Copiar agora para este computador», no painel «☁ Servidor central».
- **O que transfere:** só os objetos novos ou mudados.
- **Onde fica:**
  - aplicação de computador: «Ficheiro → Abrir a cópia do servidor central», no Windows
    `%APPDATA%\Campo de Ourique\dados-do-utilizador\copia-central`;
  - versão browser: a pasta `copia-central/` do projeto, que o git ignora.

A pasta tem a mesma forma que os dados do servidor. Por isso serve para duas coisas:

- **Consultar sem internet:**

  ```bash
  DADOS="<pasta da cópia>" CHAVE_ADMIN=<uma chave qualquer> node servidor-central/servidor.mjs
  ```

  Depois abre-se http://127.0.0.1:8090/ e entra-se com essa chave (ou com as contas, tal como estavam no dia da
  cópia).

- **Repor tudo num servidor novo**, por exemplo um Worker noutra conta (`--com-chaves` repõe também as chaves e as
  contas):

  ```bash
  node servidor-central/repor.mjs --pasta "<pasta da cópia>" --url https://…/api/v1 --admin <chave de administração>
  ```

Uma segunda cópia fora de casa é boa ideia: basta que a pasta da cópia fique numa pasta sincronizada (OneDrive,
Google Drive, um disco externo).

## Correr em Node

```bash
CHAVE_ADMIN=<chave> ORIGENS="*" node servidor-central/servidor.mjs
```

O servidor fica em http://127.0.0.1:8090 e não precisa de dependências.

```bash
node servidor-central/servidor.mjs --nova-chave "Nome" contribuidor
```

Cria uma chave sem passar pela página de consulta.

Variáveis de ambiente: `PORTA` (8090), `HOST` (127.0.0.1), `DADOS` (./dados-central), `ORIGENS` (*),
`LEITURA_PUBLICA` (1 = consultar sem chave), `NOME`, `CHAVE_ADMIN`, `SEGREDO_SESSOES`. Num servidor próprio, põe-se à
frente um proxy com HTTPS, por exemplo o Caddy com `dados.exemplo.pt { reverse_proxy 127.0.0.1:8090 }`.

## API (versão 1)

Os pedidos levam `Authorization: Bearer <testemunho da sessão ou chave de acesso>`, exceto `GET /api/v1/estado` e
`POST /api/v1/sessao`. As respostas são JSON, e os erros vêm como `{ "erro": "…" }`.

| Pedido | Quem | O que faz |
|---|---|---|
| `GET /api/v1/estado` | todos | `{ ok, nome, api, leituraPublica, chave: { nome, papel, utilizador, conta, freguesias } \| null }` |
| `POST /api/v1/sessao` | todos | recebe `{ utilizador, chave }` (a chave de entrada derivada da palavra-passe: ver `contas.mjs`) e devolve `{ sessao, testemunho, expira }` |
| `POST /api/v1/sessao/palavra-passe` | a própria conta | recebe `{ atual, nova }` (chaves de entrada) e devolve um testemunho novo |
| `POST /api/v1/presets/<freguesia>/<preset>` | contas e chaves que enviam para essa freguesia | recebe `{ dados, origem, versao, quando }` e devolve `{ revisao }` (201), ou `{ igual: true }` se nada mudou |
| `GET /api/v1/presets?freguesia=` | leitor | a revisão mais recente de cada preset |
| `GET /api/v1/presets/<freguesia>/<preset>[?revisao=n]` | leitor | um preset, com `dados` |
| `GET /api/v1/presets/<freguesia>/<preset>/revisoes` | leitor | o histórico de revisões do preset |
| `GET /api/v1/freguesias` | leitor | as freguesias com dados |
| `GET /api/v1/elementos?freguesia=&prioridade=&competencia=&tipo=&categoria=&q=` | leitor | todos os elementos, um por linha, com o centro (`lat`, `lon`); `prioridade=sem` e `competencia=sem` dão os que não têm |
| `GET /api/v1/exportar.csv?…` e `GET /api/v1/exportar.geojson?…` | leitor | o mesmo, para transferir |
| `GET /api/v1/historico?freguesia=&utilizador=&limite=&meses=` | admin | quem fez o quê, do mais recente para o mais antigo |
| `GET /api/v1/evento` | todos | o evento em curso: `{ evento: { id, nome, ativo, desde, por } | null }` |
| `POST /api/v1/evento` | admin | recebe `{ id, nome, ativo }` e liga ou desliga o evento |
| `GET /api/v1/categorias` | leitor | as categorias de todos os presets e onde são usadas |
| `POST /api/v1/categorias/fundir` | administração | `{ de: [nomes], para, icone, cor }` junta-as numa só em todo o lado (cada preset alterado ganha uma revisão) |
| `GET /api/v1/definicoes` | todos | as opções gerais: `{ definicoes: { visitaInicial } }` |
| `POST /api/v1/definicoes` | admin | recebe `{ visitaInicial }`: a Visita Guiada abre ou não sozinha a quem nunca a viu |
| `GET /api/v1/eventos` | todos | os eventos criados pela administração: `{ eventos: [{ id, nome, icone, descricao, competencia, termos, categorias }] }` |
| `POST /api/v1/eventos` | admin | cria ou altera um evento; com `{ id, apagar: true }` apaga-o (recusa se estiver ativo) |
| `GET /api/v1/evento/resumo?id=` | leitor | por freguesia, quantos registos de cada categoria tem o evento, somando os presets, e o total da cidade |
| `GET /api/v1/contas` | admin | as contas, sem os verificadores, com a última entrada e o bloqueio |
| `POST /api/v1/contas/<utilizador>/palavra-passe` | admin | recebe `{ nova }` (chave de entrada) e repõe a palavra-passe |
| `GET /api/v1/copia` e `GET /api/v1/objeto?chave=` | admin | a lista dos objetos (com `versao`) e cada objeto, para a cópia local |
| `POST /api/v1/objeto?chave=` | admin | repõe um objeto |
| `GET` e `POST /api/v1/chaves`, `POST /api/v1/chaves/<id>/retirar` | admin | lista, cria (`{ nome, papel, freguesias? }`; a chave vem só nesta resposta) e retira chaves |

«leitor» quer dizer qualquer conta ou chave (ou ninguém, com `LEITURA_PUBLICA=1`). Para quem não é da
administração, as respostas de leitura vêm sem `autor`, `contribuidor` e `utilizador`.

`dados` é o preset no formato da apresentação: `{ preset, freguesia, titulo, subtitulo, elementos, categorias?,
visita? }`. O modelo dos elementos está no README principal.

Erros:

| Código | Quer dizer |
|---|---|
| `401` | falta a sessão ou a chave, ou a sessão terminou (também: utilizador ou palavra-passe errados) |
| `403` | a conta ou a chave não pode fazer isto (por exemplo, enviar para outra freguesia) |
| `409` | o preset é de outra freguesia |
| `413` | o pedido tem mais de 40 MB |
| `429` | conta bloqueada por tentativas erradas (`ate` diz até quando) |
| `503` | dois envios chocaram no mesmo índice (a apresentação volta a tentar) |

A apresentação tira da fila um envio recusado com `400`, `403`, `409` ou `413`; os outros erros, e a falta de rede,
ficam para mais tarde.

**As fotos não vão para o servidor central.** Vão só as fotos por endereço (https://…). As que estão em
`assets/fotos/` ficam no computador de quem as pôs.
