# Guia: montar o servidor central no Cloudflare

Este guia leva-te desde a criação da conta no Cloudflare até ao servidor central a funcionar, com a apresentação
ligada a ele. Fica no plano grátis, com os dados guardados na União Europeia. Demora cerca de 30 minutos.

Os nomes dos botões do site do Cloudflare estão em inglês, como aparecem lá. O site muda de vez em quando: se um
botão tiver outro nome, procura o mais parecido.

## O que vais precisar

- Um endereço de email.
- Um cartão de crédito ou débito. O Cloudflare pede-o para ativar o armazenamento (R2), como verificação. Dentro dos
  limites grátis não cobra nada.
- Este computador, com a pasta do projeto e o Node.js, que já tens.
- Um gestor de palavras-passe (por exemplo o do browser, o Bitwarden ou o 1Password), para guardar a chave de
  administração.

Não é preciso ter um domínio: o servidor fica num endereço gratuito do Cloudflare, do género
`https://campo-de-ourique-central.<o-teu-nome>.workers.dev`.

---

## Parte 1 — No site do Cloudflare

### 1. Criar a conta

1. Abre https://dash.cloudflare.com/sign-up.
2. Escreve o email e uma palavra-passe forte, e carrega em **Sign up**.
3. Vai ao email e abre a mensagem do Cloudflare para confirmar o endereço.
4. Se o Cloudflare perguntar o que queres fazer, ou pedir para acrescentar um domínio («Add a domain» ou «Add a
   site»), **salta esse passo**. Não é preciso, e o plano fica o **Free**.
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
3. Escolhe o plano grátis. O Cloudflare pede o cartão como verificação: preenche e confirma.
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
npx wrangler r2 bucket create campo-de-ourique-central --jurisdiction eu
```

Deve dizer `Created bucket 'campo-de-ourique-central' with jurisdiction 'eu'`. O nome tem de ser exatamente este,
porque é o que está em `servidor-central/cloudflare/wrangler.toml`.

### 7. Publicar o servidor

```bash
npm run central:publicar
```

1. Se for a primeira vez e não escolheste o subdomínio no passo 2, o terminal pergunta-o agora: escreve-o e carrega
   em Enter.
2. No fim aparece o endereço do servidor, do género:

   ```text
   https://campo-de-ourique-central.freguesias-lisboa.workers.dev
   ```

**Guarda este endereço.** É o da página de consulta, e o da API é o mesmo com `/api/v1` no fim.

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

## Parte 3 — Pôr o servidor a funcionar

### 9. Entrar como administração

1. Abre no browser o endereço do passo 7. Aparece a página **Consulta dos dados**.
2. Em cima, entra com o utilizador `System.Admin` e a palavra-passe inicial dele.
3. Aparecem mais três secções: **Histórico de alterações**, **Contas** e **Chaves de acesso**.

### 10. Mudar todas as palavras-passe (importante)

As palavras-passe iniciais seguem uma regra fácil de adivinhar, e o código do projeto é público. Com o servidor
na internet, qualquer pessoa que adivinhe a regra pode entrar. Por isso, muda-as antes de dar o endereço a alguém:

1. **A tua:** carrega em **Mudar a palavra-passe**, no topo, e escolhe uma nova.
2. **As outras 25:** na secção **Contas**, para cada conta:
   1. escolhe a conta;
   2. carrega em **Gerar** (ou escreve uma);
   3. carrega em **Repor a palavra-passe**;
   4. copia a palavra-passe que aparece, porque não volta a ser mostrada.
3. **Entrega** a cada Junta, e à Concelhia, o seu utilizador e a palavra-passe nova, por um meio privado (pessoalmente,
   por telefone ou numa mensagem que só essa pessoa leia).

Cada pessoa pode depois mudar a sua, na página de consulta ou na apresentação.

**As contas da aplicação de computador são outras.** Cada aplicação instalada arranca com as palavras-passe
iniciais. Quando alguém entra na apresentação, ela abre a sessão nos dois sítios com a mesma palavra-passe. Por isso:

1. Na aplicação, a pessoa entra com a palavra-passe inicial de lá.
2. No botão da conta (as iniciais, ao lado do lápis), em **Mudar a palavra-passe**, escreve a inicial como «atual» e a palavra-passe que lhe deste como «nova».

A partir daí, a palavra-passe é a mesma nos dois sítios.

### 11. Ligar a apresentação ao servidor

Há duas formas:

- **Para todos (recomendado):** em `config.js`, põe o endereço da API:

  ```js
  window.CONFIG_CENTRAL = { url: 'https://campo-de-ourique-central.freguesias-lisboa.workers.dev/api/v1', enviarAoGuardar: true, copiaHoras: 24 };
  ```

  Publica uma versão nova (ver «Para publicar uma versão nova» no README principal). As aplicações instaladas
  atualizam-se sozinhas e ficam ligadas.
- **Só num computador:** no modo de edição, em **⋯ Mais → ☁ Servidor central**, cola o endereço da API e carrega em
  **Guardar**.

### 12. Experimentar

1. Na apresentação, carrega no lápis e entra com uma conta de freguesia.
2. Muda alguma coisa e carrega em **Guardar**. Na barra de edição, em **⋯ Mais**, deve aparecer
   «central: em dia · enviado às …».
3. Na página de consulta, como `System.Admin`, o envio aparece em **Presets recebidos** e no **Histórico de
   alterações**, com a conta que o fez.

### 13. A cópia de segurança no teu computador

Na aplicação de computador (ou na versão browser com `npm start`), entra como `System.Admin` com o servidor central
ligado. A apresentação copia o servidor central para este computador ao abrir e de 24 em 24 horas, só com o que
mudou. A cópia fica em **Ficheiro → Abrir a cópia do servidor central**.

Convém que essa pasta fique também numa pasta sincronizada (OneDrive, Google Drive) ou num disco externo. Como repor
tudo a partir da cópia está no [README do servidor central](README.md#cópia-local-de-tempos-a-tempos).

---

## Opcional

### Só a tua apresentação usa a API

Em `servidor-central/cloudflare/wrangler.toml`, troca `ORIGENS = "*"` pelos endereços de onde a apresentação abre,
separados por vírgulas, e volta a publicar (passo 7). Por exemplo:

```toml
ORIGENS = "http://127.0.0.1:47831,http://127.0.0.1:47832,http://127.0.0.1:8081,http://localhost:8081"
```

A aplicação de computador usa as portas 47831 a 47840.

### Republicar o servidor sozinho a cada versão

A compilação automática do GitHub pode republicar o servidor central sempre que publicas uma versão nova.

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

A partir daí, cada tag `v…` republica o servidor. A chave de administração e os dados ficam como estão.

### Ver o uso e os limites

No Cloudflare, em **Workers & Pages → campo-de-ourique-central → Metrics**, vês os pedidos. Em **R2 Object Storage**
vês o espaço ocupado. Os limites do plano grátis (100 000 pedidos por dia, 10 GB) estão no
[README do servidor central](README.md#limites-do-plano-grátis) e chegam com folga para as 24 freguesias.

---

## Quando alguma coisa não corre bem

| O que aparece | O que fazer |
|---|---|
| `Not logged in` ou `Authentication error` no terminal | Volta a correr `npx wrangler login` (passo 5). |
| `Please enable R2 through the Cloudflare Dashboard` | Falta o passo 3. |
| `The specified bucket does not exist` ao publicar | O balde não foi criado, ou foi criado sem `--jurisdiction eu`: repete o passo 6. |
| A página de consulta diz «Utilizador ou palavra-passe errados» | O utilizador escreve-se como quiseres, mas a palavra-passe tem de ser exata, com maiúsculas. Se a conta foi reposta, vale a nova. |
| «Demasiadas tentativas erradas» | Espera o tempo indicado, ou repõe a palavra-passe dessa conta como `System.Admin`. |
| A apresentação diz «o servidor central não aceitou a sessão» | A palavra-passe da aplicação e a do servidor central são diferentes: na aplicação, no botão da conta (ao lado do lápis), em **Entrar no servidor central**, entra com a do servidor. Os envios em fila seguem logo a seguir. |
| A apresentação diz «sem ligação ao servidor central» | Confirma o endereço da API (tem de acabar em `/api/v1`) e a internet. Os envios ficam na fila. |
| Esqueceste a palavra-passe de `System.Admin` | Na página de consulta, carrega em «usar uma chave de acesso» e entra com a chave de administração do passo 8. Em **Contas**, repõe a palavra-passe de `System.Admin`. |
