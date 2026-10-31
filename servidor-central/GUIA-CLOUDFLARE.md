# Guia: alojar o PS Lisboa - Repositório da Cidade no Cloudflare

Este guia leva-te desde a criação da conta no Cloudflare até à plataforma estar na internet: a apresentação, o servidor
central e os dados, tudo num só endereço, no plano grátis e com os dados guardados na União Europeia. Demora cerca de
30 a 45 minutos.

No fim, qualquer pessoa abre a apresentação no browser, as Juntas editam com a sua conta, em qualquer aparelho, e o
telemóvel pode instalá-la como aplicação e usar o GPS (ambos precisam de `https`, que o Cloudflare já dá).

Os nomes dos botões do site do Cloudflare estão em inglês, como aparecem lá. O site muda de vez em quando: se um
botão tiver outro nome, procura o mais parecido.

## Como fica montado

| Peça | O que é | Custo |
|---|---|---|
| **Worker** `ps-lisboa-repositorio` | Um pequeno programa na rede do Cloudflare. Serve o site, a API e a página de consulta. | Grátis até 100 000 pedidos por dia. Os ficheiros do site não contam. |
| **Ficheiros estáticos** | A pasta `site/`, com o mapa, as imagens e os dados das 24 freguesias, publicada com o Worker. | Grátis |
| **Balde R2** `ps-lisboa-repositorio` | Onde ficam as contas, as gravações e o histórico, na União Europeia. | Grátis até 10 GB |

O endereço fica assim, sem precisares de comprar um domínio:

```text
https://ps-lisboa-repositorio.<o-teu-nome>.workers.dev            → a apresentação
https://ps-lisboa-repositorio.<o-teu-nome>.workers.dev/consulta   → a consulta dos dados e a administração
https://ps-lisboa-repositorio.<o-teu-nome>.workers.dev/api/v1     → a API
```

## O que vais precisar

- Um endereço de email.
- Um cartão de crédito ou débito. O Cloudflare pode pedi-lo para ativar o armazenamento (R2), como verificação. Dentro
  dos limites grátis não cobra nada.
- Este computador, com a pasta do projeto e o Node.js, que já tens.
- Um gestor de palavras-passe (por exemplo o do browser, o Bitwarden ou o 1Password).

---

## Parte 1 — No site do Cloudflare

### 1. Criar a conta

1. Abre https://dash.cloudflare.com/sign-up.
2. Escreve o email e uma palavra-passe forte, e carrega em **Sign up**.
3. Vai ao email e abre a mensagem do Cloudflare para confirmar o endereço.
4. Se o Cloudflare perguntar o que queres fazer, ou pedir para acrescentar um domínio («Add a domain» ou «Connect a
   domain»), **salta esse passo**. Não é preciso, e o plano fica o **Free**.
5. Recomendado: em **My Profile → Authentication**, liga a verificação em dois passos (**Two-Factor Authentication**).
   É a conta que guarda os dados de todas as freguesias.

### 2. Escolher o endereço workers.dev

1. No menu da esquerda, abre **Workers & Pages** (às vezes está dentro de **Compute**).
2. Na primeira vez, o Cloudflare pede para escolheres um subdomínio, por exemplo `freguesias-lisboa`, que fica
   `freguesias-lisboa.workers.dev`. Escolhe um nome curto e confirma.

   Se não pedir agora, pede no passo 7, no terminal: escreve o nome e carrega em Enter.

### 3. Ativar o armazenamento (R2)

1. No menu da esquerda, abre **R2 Object Storage** (às vezes está dentro de **Storage & databases**).
2. Carrega no botão para começar (o nome pode ser **Purchase R2 Plan**, **Enable R2** ou **Get started**).
3. Escolhe o plano grátis. Se o Cloudflare pedir o cartão, preenche e confirma.
4. **Não cries o balde aqui.** Cria-se no passo 6, a partir do terminal, para ficar de certeza na União Europeia.

---

## Parte 2 — No computador

### 4. Abrir o terminal na pasta do projeto

- **Windows:** abre a pasta `Projeto Campo de Ourique` no Explorador. Clica com o botão direito num espaço vazio e
  escolhe **Abrir no Terminal**.
- **Ou, nesta aplicação do Claude:** usa o painel **Terminal**, que já abre na pasta do projeto.

Se ainda não instalaste as dependências (a pasta `node_modules` não existe), corre:

```bash
npm install
```

### 5. Ligar o computador à conta do Cloudflare

```bash
npx wrangler login
```

Abre-se o browser numa página do Cloudflare. Entra com a conta do passo 1, se pedir, e carrega em **Allow**. Volta ao
terminal: deve dizer `Successfully logged in`. Para confirmar:

```bash
npx wrangler whoami
```

Mostra o teu email e o nome da conta.

### 6. Criar o balde de dados na União Europeia

```bash
npx wrangler r2 bucket create ps-lisboa-repositorio --jurisdiction eu
```

Deve dizer que criou `ps-lisboa-repositorio` com a jurisdição `eu`. O nome tem de ser exatamente este, porque é o
que está em `servidor-central/cloudflare/wrangler.toml`.

### 7. Publicar a plataforma

```bash
npm run central:publicar
```

Este comando faz duas coisas:

1. Gera a pasta `site/`, só com o que a página precisa. As contas locais (`.contas/`) nunca entram. Aparece uma linha
   como `site/ pronta: 222 ficheiros`.
2. Envia o site e o Worker para o Cloudflare. Na primeira vez demora alguns minutos.

Se ainda não escolheste o subdomínio no passo 2, o terminal pergunta-o agora: escreve-o e carrega em Enter. No fim
aparece o endereço, do género:

```text
https://ps-lisboa-repositorio.freguesias-lisboa.workers.dev
```

**Guarda este endereço.** Abre-o já no browser: deve aparecer o mapa de Lisboa.

### 8. Guardar a chave de administração

A chave de administração é uma chave de reserva com acesso a tudo. Serve, por exemplo, se a conta `System.Admin`
ficar bloqueada ou se esqueceres a palavra-passe dela.

1. Inventa uma frase longa, de 5 ou 6 palavras ao acaso, por exemplo `cadeira laranja nuvem tambor elétrico sete`.
   Usa uma tua, não esta.
2. Guarda-a já no gestor de palavras-passe.
3. Corre:

   ```bash
   npx wrangler secret put CHAVE_ADMIN --config servidor-central/cloudflare/wrangler.toml
   ```

4. Quando o terminal pedir, cola a frase e carrega em Enter. Ela não aparece enquanto escreves; é normal.

---

## Parte 3 — Pôr a plataforma a funcionar

### 9. Entrar como administração

1. Abre no browser o teu endereço, com `/consulta` no fim. Aparece a página **Consulta dos dados**.
2. Em cima, entra com o utilizador `System.Admin` e a palavra-passe inicial dele.
3. Aparecem mais três secções: **Histórico de alterações**, **Contas** e **Chaves de acesso**.

### 10. Mudar todas as palavras-passe (faz isto antes de dares o endereço a alguém)

As palavras-passe iniciais seguem uma regra fácil de adivinhar, e o código do projeto é público. Com a plataforma
na internet, qualquer pessoa que adivinhe a regra pode entrar e editar. Por isso:

1. **A tua:** carrega em **Mudar a palavra-passe**, no topo, e escolhe uma nova.
2. **As outras 25:** na secção **Contas**, para cada conta:
   1. escolhe a conta;
   2. carrega em **Gerar** (ou escreve uma);
   3. carrega em **Repor a palavra-passe**;
   4. copia a palavra-passe que aparece, porque não volta a ser mostrada.
3. **Entrega** a cada Junta, e à Concelhia, o seu utilizador e a palavra-passe nova, por um meio privado (pessoalmente,
   por telefone ou numa mensagem que só essa pessoa leia).

Cada pessoa pode depois mudar a sua, na página de consulta ou na apresentação.

### 11. Experimentar

1. Abre o teu endereço e escolhe uma freguesia.
2. Carrega no lápis e entra com a conta dessa freguesia.
3. Muda alguma coisa e carrega em **Guardar**. Na barra de edição aparece «Na fila do servidor central» e, logo a seguir, «Enviado para o servidor central».
4. Abre o mesmo endereço numa janela anónima, sem sessão: a alteração já lá está.
5. Em `/consulta`, como `System.Admin`, o envio aparece em **Presets recebidos** e no **Histórico de alterações**,
   com a conta que o fez.

### 12. Experimentar no telemóvel

1. Abre o endereço no telemóvel.
2. **Android:** aparece um convite para instalar (ou usa o botão **📲 Instalar**, no índice ☰).
   **iPhone e iPad:** no Safari, carrega em **Partilhar → Adicionar ao ecrã principal**.
3. Entra com uma conta, abre um conjunto de pontos e carrega em **📍 Registar na minha localização**. O telemóvel pede
   autorização para usar a localização: aceita.

### 13. Ligar a aplicação de computador (só se a usarem)

O site já está ligado sozinho. A aplicação de computador precisa de saber o endereço:

1. Em `config.js`, põe o endereço da API:

   ```js
   window.CONFIG_CENTRAL = { url: 'https://ps-lisboa-repositorio.freguesias-lisboa.workers.dev/api/v1', enviarAoGuardar: true, copiaHoras: 24 };
   ```

2. Publica uma versão nova (ver «Para publicar uma versão nova» no README principal). As aplicações instaladas
   atualizam-se sozinhas.

**As contas da aplicação são outras.** Cada aplicação instalada arranca com as palavras-passe iniciais. Quando alguém
entra, ela abre a sessão nos dois sítios com a mesma palavra-passe. Por isso, na aplicação, a pessoa entra com a inicial
e, no botão da conta (as iniciais, ao lado do lápis), em **Mudar a palavra-passe**, escreve a inicial como «atual» e a
que lhe deste como «nova».

### 14. A cópia de segurança no teu computador

Na aplicação de computador (ou na versão browser com `npm start`), entra como `System.Admin` com o servidor central
ligado. A apresentação copia o servidor central para este computador ao abrir e de 24 em 24 horas, só com o que
mudou. A cópia fica em **Ficheiro → Abrir a cópia do servidor central**.

Convém que essa pasta fique também numa pasta sincronizada (OneDrive, Google Drive) ou num disco externo. Como repor
tudo a partir da cópia está no [README do servidor central](README.md#cópia-local-de-tempos-a-tempos).

---

## O dia a dia

### Como os dados aparecem no site

- **Sem nada guardado** numa freguesia, o site mostra os dados que vieram com a publicação.
- **Depois de alguém guardar**, o Worker passa a servir o que está no servidor central. Num preset guardado por uma
  Junta, é o que todos veem, logo a seguir.
- **Com vários presets guardados** numa freguesia, quem chega vê o que foi enviado por último. Os outros estão na lista
  de presets, no modo de edição.
- **Apagar um preset**, no modo de edição, tira-o da apresentação e da lista para todos. As revisões ficam no servidor central, e voltar a enviá-lo traz o preset de volta.
- **Tudo o que está nos presets é público**, como numa apresentação. O nome de quem fez cada registo não sai para
  ninguém além da administração. As contas e o histórico nunca são públicos.

### Publicar uma alteração ao site

Sempre que o código ou os dados de base mudarem, volta a correr:

```bash
npm run central:publicar
```

Os dados guardados no R2 não mudam com isto. Antes de publicar, confirma que a versão é a que queres: a publicação
vai para a internet logo a seguir.

### Ver o uso e os limites

No Cloudflare, em **Workers & Pages → ps-lisboa-repositorio → Metrics**, vês os pedidos. Em **R2 Object Storage**
vês o espaço ocupado. Os limites do plano grátis:

| Limite | Plano grátis | Na prática |
|---|---|---|
| Pedidos ao Worker | 100 000 por dia | Só contam os que passam pelo Worker (API, consulta e dados guardados). |
| Processamento | 10 ms por pedido | A palavra-passe é calculada no browser, para isto chegar. Uma fusão de categorias corre freguesia a freguesia pela mesma razão. |
| Ficheiros do site | 20 000 ficheiros, 25 MiB cada | Temos cerca de 220, o maior com 3,6 MB. |
| Pedidos aos ficheiros do site | Sem limite | Grátis. |
| Espaço no R2 | 10 GB por mês | As fotos enviadas por quem edita ficam dentro dos presets: é o que mais cresce. |
| Operações no R2 | 1 milhão de escritas e 10 milhões de leituras por mês | Chegam com folga para as 24 freguesias. |

Se um pedido exceder o limite de processamento, o Cloudflare devolve o erro 1102. Os envios ficam na fila e voltam a
tentar.

---

## Opcional

### Um domínio teu (por exemplo `mapa.exemplo.pt`)

1. No Cloudflare, em **Domains → Add a domain** (ou **Connect a domain**), acrescenta o teu domínio e segue as instruções
   para mudar os servidores de nomes, no sítio onde o compraste.
2. Em **Workers & Pages → ps-lisboa-repositorio → Settings → Domains & Routes → Add → Custom domain**, escreve o
   endereço e confirma.

O site passa a funcionar também nesse endereço, sem mudares nada. Só a aplicação de computador (passo 13) precisa de o
saber.

### Republicar sozinho a cada versão

A compilação automática do GitHub pode republicar a plataforma sempre que publicas uma versão nova.

1. **O identificador da conta:** no Cloudflare, em **Workers & Pages**, copia o **Account ID** (está na coluna da
   direita ou na página da conta).
2. **O token:**
   1. em **My Profile → API Tokens** (ou **Manage account → Account API Tokens**), carrega em **Create Token**;
   2. escolhe o modelo **Edit Cloudflare Workers**;
   3. em **Account Resources**, escolhe só a tua conta;
   4. confirma que as permissões incluem **Workers R2 Storage: Edit**; se não incluírem, acrescenta-a;
   5. carrega em **Continue to summary → Create Token** e copia o token, porque só aparece uma vez.
3. **No GitHub**, no repositório, em **Settings → Secrets and variables → Actions → New repository secret**, cria
   dois segredos:
   - `CLOUDFLARE_API_TOKEN`, com o token;
   - `CLOUDFLARE_ACCOUNT_ID`, com o identificador da conta.

A partir daí, cada tag `v…` republica o site e o Worker. A chave de administração e os dados ficam como estão.

### Restringir quem usa a API a partir de outros sites

O site alojado usa a API do próprio endereço. A aplicação de computador e a versão local vêm de outros endereços. Para
só esses poderem usá-la, em `servidor-central/cloudflare/wrangler.toml` troca `ORIGENS = "*"` por estes endereços,
separados por vírgulas, e volta a publicar:

```toml
ORIGENS = "http://127.0.0.1:47831,http://127.0.0.1:47832,http://127.0.0.1:8081,http://localhost:8081"
```

A aplicação de computador usa as portas 47831 a 47840.

### Experimentar antes de publicar

```bash
npm run central:local
```

Abre http://127.0.0.1:8787 com o site e um R2 simulado, só neste computador. Os dados de teste ficam em `.wrangler/`.

---

## Quando alguma coisa não corre bem

| O que aparece | O que fazer |
|---|---|
| `Not logged in` ou `Authentication error` no terminal | Volta a correr `npx wrangler login` (passo 5). |
| `Please enable R2 through the Cloudflare Dashboard` | Falta o passo 3. |
| `The specified bucket does not exist` ao publicar | O balde não foi criado, ou foi criado sem `--jurisdiction eu`: repete o passo 6. |
| `EPERM` ou «Permission denied» em `site` ao publicar | O `npm run central:local` está a correr e tem a pasta aberta: para-o com Ctrl+C e repete. |
| O endereço abre, mas o mapa não muda depois de publicar | O browser guardou a versão anterior: recarrega a página duas vezes. |
| A página de consulta diz «Utilizador ou palavra-passe errados» | O utilizador escreve-se como quiseres, mas a palavra-passe tem de ser exata, com maiúsculas. Se a conta foi reposta, vale a nova. |
| «Demasiadas tentativas erradas» | Espera o tempo indicado, ou repõe a palavra-passe dessa conta como `System.Admin`. |
| A aplicação diz «o servidor central não aceitou a sessão» | A palavra-passe da aplicação e a do servidor central são diferentes: na aplicação, no botão da conta (ao lado do lápis), em **Entrar no servidor central**, entra com a do servidor. Os envios em fila seguem logo a seguir. |
| A apresentação diz «sem ligação ao servidor central» | Confirma a internet e, na aplicação, o endereço da API (tem de acabar em `/api/v1`). Os envios ficam na fila. |
| O telemóvel não pede a localização | Só funciona em `https`, e a autorização pode ter sido recusada antes: nas definições do browser, permite a localização para este endereço. |
| Esqueceste a palavra-passe de `System.Admin` | Em `/consulta`, carrega em «usar uma chave de acesso» e entra com a chave de administração do passo 8. Em **Contas**, repõe a palavra-passe de `System.Admin`. |
