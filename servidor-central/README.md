# Servidor central

A apresentação funciona sozinha, no browser ou na aplicação de computador, e guarda os presets localmente. Com um
servidor central, cada «Guardar» envia também o preset para um sítio comum, onde se juntam os dados de todas as
pessoas e de todas as freguesias. Quem tiver acesso pode consultá-los e exportá-los, e uma cópia vem de tempos a
tempos para o teu computador.

O servidor corre no **Cloudflare Workers, no plano grátis, com os dados no R2 guardados na União Europeia**. A
mesma API existe também em Node, para testar, para abrir uma cópia local, ou para correr num servidor próprio. As
duas versões partilham o mesmo código (`nucleo.mjs`):

| Ficheiro | O que é |
|---|---|
| `nucleo.mjs` | a API inteira, sem dependências |
| `cloudflare/worker.mjs` e `cloudflare/wrangler.toml` | o Worker do Cloudflare, com os dados no R2 |
| `servidor.mjs` | o mesmo em Node, com os dados em ficheiros |
| `consulta.html` | a página de consulta: filtros, mapa, tabela, exportações e gestão das chaves |
| `repor.mjs` | repõe um servidor a partir de uma cópia local |
| `testar.mjs` | a mesma bateria de testes contra o Node e contra o Worker local |

## Publicar no Cloudflare (uma vez, cerca de 15 minutos)

Precisas de uma conta Cloudflare, que é grátis. Para criar o espaço de armazenamento (R2), o Cloudflare pede um
cartão para verificação, mas não cobra nada dentro dos limites grátis. Na pasta do projeto, depois de
`npm install`:

1. Entrar na conta. Este comando abre o browser para autorizar:

   ```bash
   npx wrangler login
   ```

2. Criar o espaço de armazenamento na União Europeia:

   ```bash
   npx wrangler r2 bucket create campo-de-ourique-central --jurisdiction eu
   ```

3. Escolher a chave de administração. O comando pede para a colar; usa uma frase longa e guarda-a num gestor de
   palavras-passe. Ela dá acesso a tudo, incluindo a criação das outras chaves:

   ```bash
   npx wrangler secret put CHAVE_ADMIN --config servidor-central/cloudflare/wrangler.toml
   ```

4. Publicar:

   ```bash
   npm run central:publicar
   ```

   No fim aparece o endereço, do género `https://campo-de-ourique-central.<a-tua-conta>.workers.dev`.

5. Abrir esse endereço, que é a página de consulta, e entrar com a chave de administração. Em «Chaves de acesso»,
   criar uma chave para cada pessoa ou Junta: `contribuidor` envia e consulta, `leitor` só consulta. Cada chave só
   se mostra quando é criada.

6. Pôr o endereço da API (`https://…workers.dev/api/v1`) em `config.js`, em `CONFIG_CENTRAL.url`, e publicar uma
   versão nova da apresentação. Em alternativa, cada pessoa põe-no no painel «☁ Servidor central».

Opcional:
- **Limitar quem usa a API a partir do browser:** em `wrangler.toml`, `ORIGENS` passa a ter os endereços da
  apresentação, por exemplo `https://hvs87.github.io,http://127.0.0.1:47831`. A aplicação de computador usa as
  portas 47831 a 47840.
- **Republicar o Worker em cada versão:** a compilação automática do GitHub republica-o se o repositório tiver o
  segredo `CLOUDFLARE_API_TOKEN`, um token com a permissão «Edit Cloudflare Workers».

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
- **Mais do que isso:** se um dia não chegar, o plano pago custa 5 dólares por mês e não exige mudanças.

## Cópia local de tempos a tempos

- **Quando:** a aplicação de computador, ou a versão browser com o servidor local (`npm start`), copia o servidor
  central para uma pasta deste computador. Faz isto ao abrir e de 24 em 24 horas (`CONFIG_CENTRAL.copiaHoras` em
  `config.js`; `0` = só à mão).
- **À mão:** o botão «Copiar agora para este computador», no painel «☁ Servidor central».
- **O que transfere:** só os objetos novos ou mudados. A chave usada tem de poder consultar (contribuidor, leitor
  ou administração). Só uma chave de administração copia também as chaves de acesso.
- **Onde fica:**
  - aplicação de computador: «Ficheiro → Abrir a cópia do servidor central», no Windows
    `%APPDATA%\Campo de Ourique\dados-do-utilizador\copia-central`;
  - versão browser: a pasta `copia-central/` do projeto, que o git ignora.

A pasta tem a mesma forma que os dados do servidor. Por isso serve para duas coisas:

- **Consultar sem internet:**

  ```bash
  DADOS="<pasta da cópia>" CHAVE_ADMIN=<uma chave qualquer> node servidor-central/servidor.mjs
  ```

  Depois abre-se http://127.0.0.1:8090/ e entra-se com essa chave.

- **Repor tudo num servidor novo**, por exemplo um Worker noutra conta (`--com-chaves` repõe também as chaves):

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
`LEITURA_PUBLICA` (1 = consultar sem chave), `NOME`, `CHAVE_ADMIN`. Num servidor próprio, põe-se à frente um
proxy com HTTPS, por exemplo o Caddy com `dados.exemplo.pt { reverse_proxy 127.0.0.1:8090 }`.

## API (versão 1)

Os pedidos levam `Authorization: Bearer <chave>`, exceto `GET /api/v1/estado`. As respostas são JSON, e os erros
vêm como `{ "erro": "…" }`.

| Pedido | Quem | O que faz |
|---|---|---|
| `GET /api/v1/estado` | todos | `{ ok, nome, api, leituraPublica, chave: { nome, papel } \| null }` |
| `POST /api/v1/presets/<freguesia>/<preset>` | contribuidor | recebe `{ dados, autor, origem, versao, quando }` e devolve `{ revisao }` (201), ou `{ igual: true }` se nada mudou |
| `GET /api/v1/presets?freguesia=` | leitor | a revisão mais recente de cada preset |
| `GET /api/v1/presets/<freguesia>/<preset>[?revisao=n]` | leitor | um preset, com `dados` |
| `GET /api/v1/presets/<freguesia>/<preset>/revisoes` | leitor | o histórico |
| `GET /api/v1/freguesias` | leitor | as freguesias com dados |
| `GET /api/v1/elementos?freguesia=&prioridade=&competencia=&tipo=&categoria=&q=` | leitor | todos os elementos, um por linha, com o centro (`lat`, `lon`); `prioridade=sem` e `competencia=sem` dão os que não têm |
| `GET /api/v1/exportar.csv?…` e `GET /api/v1/exportar.geojson?…` | leitor | o mesmo, para transferir |
| `GET /api/v1/registo?limite=` | leitor | os envios mais recentes |
| `GET /api/v1/copia` e `GET /api/v1/objeto?chave=` | leitor | a lista dos objetos (com `versao`) e cada objeto, para a cópia local |
| `POST /api/v1/objeto?chave=` | admin | repõe um objeto |
| `GET` e `POST /api/v1/chaves`, `POST /api/v1/chaves/<id>/retirar` | admin | lista, cria (`{ nome, papel }`; a chave vem só nesta resposta) e retira chaves |

`dados` é o preset no formato da apresentação: `{ preset, freguesia, titulo, subtitulo, elementos, categorias?,
visita? }`. O modelo dos elementos está no README principal.

Erros: `401` falta a chave; `403` a chave não pode fazer isto; `409` o preset é de outra freguesia; `413` o pedido tem
mais de 40 MB; `503` dois envios chocaram no mesmo índice (a apresentação volta a tentar). A apresentação tira da fila um envio
recusado com `400`, `409` ou `413`; os outros erros, e a falta de rede, ficam para mais tarde.

**As fotos não vão para o servidor central.** Vão só as fotos por endereço (https://…). As que estão em
`assets/fotos/` ficam no computador de quem as pôs.
