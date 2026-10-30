// Contas com que os servidores arrancam (servidor-central/contas.mjs): uma por freguesia, que edita só essa freguesia,
// a Concelhia de Lisboa (todas as freguesias) e a administração do sistema (todas, mais o histórico e a gestão das contas).
// Só tem os verificadores, nunca as palavras-passe; a administração entregou-as a cada pessoa. Depois do primeiro
// arranque, as contas ficam no armazém de cada servidor (contas/contas.json) e as mudanças fazem-se lá (modo de edição
// ou página de consulta); mudar este ficheiro não mexe em servidores que já arrancaram.
export default [
  { utilizador: 'Ajuda', nome: 'Ajuda', papel: 'freguesia', freguesias: ['ajuda'], verificador: '072d93dd7e211ab77ccd10dd86f067da4aee3ad938df7c580dd629f19f6405db' },
  { utilizador: 'Alcantara', nome: 'Alcântara', papel: 'freguesia', freguesias: ['alcantara'], verificador: '15d015e742fcad21c848e055f8b1746aa3a69dffe7daca5a213ea4f5a4579e4b' },
  { utilizador: 'Alvalade', nome: 'Alvalade', papel: 'freguesia', freguesias: ['alvalade'], verificador: '6fa63d544979a435a25239c658d90d098b429ef6aae8f1623c22994f2c6b4cf6' },
  { utilizador: 'Areeiro', nome: 'Areeiro', papel: 'freguesia', freguesias: ['areeiro'], verificador: '9be9963a88f71dc899d8640ac519104efa39f1c09c017e7c51093eb7d482ae8c' },
  { utilizador: 'Arroios', nome: 'Arroios', papel: 'freguesia', freguesias: ['arroios'], verificador: '4802ba6e7a59e5c786066d4546efdfeba050c99439fe8ac88926a9f49c466987' },
  { utilizador: 'Avenidasnovas', nome: 'Avenidas Novas', papel: 'freguesia', freguesias: ['avenidas-novas'], verificador: 'cdc67f7ee623f9417272e02fd7abcde6c7dbd2b43d49c89437e4b5298fb4fcef' },
  { utilizador: 'Beato', nome: 'Beato', papel: 'freguesia', freguesias: ['beato'], verificador: 'c9e293e2f3a8a8afb54082df1222f9373973044b6b8a0e764119b58063536978' },
  { utilizador: 'Belem', nome: 'Belém', papel: 'freguesia', freguesias: ['belem'], verificador: 'c48c1cac2c35859fd4e678b149f5cedfa4017f36ac188b8a055d9541f4b2524f' },
  { utilizador: 'Benfica', nome: 'Benfica', papel: 'freguesia', freguesias: ['benfica'], verificador: 'f5d54986da2eac903a0e3264c1142d2925456129191003ce137089adb091da96' },
  { utilizador: 'Campodeourique', nome: 'Campo de Ourique', papel: 'freguesia', freguesias: ['campo-de-ourique'], verificador: '15807f962419a05e09dd75493de826fe7916a8da00c7f77a2e31ed39a4c6d575' },
  { utilizador: 'Campolide', nome: 'Campolide', papel: 'freguesia', freguesias: ['campolide'], verificador: '0f3ee38e6d5fd053a6fea77ca5afcbe28c57af849ac064fcda73dc346835cb9a' },
  { utilizador: 'Carnide', nome: 'Carnide', papel: 'freguesia', freguesias: ['carnide'], verificador: 'a92a6e84b4fd1c6de36bb16a06ea9d04739c3275418d3de8a6c9c59040a259d6' },
  { utilizador: 'Estrela', nome: 'Estrela', papel: 'freguesia', freguesias: ['estrela'], verificador: 'ddc4ec1a8b8aee816f0265e400282b24ad1150084611b9efcea54945ac16e076' },
  { utilizador: 'Lumiar', nome: 'Lumiar', papel: 'freguesia', freguesias: ['lumiar'], verificador: 'a4e396c35e281cad0afffce568cacf33bda64f7894b6646e6738a7dd6159a110' },
  { utilizador: 'Marvila', nome: 'Marvila', papel: 'freguesia', freguesias: ['marvila'], verificador: '2dc47d89fa7d7c335e8001473a2ab19a745fd2fb82fba41a6e344da15e05811b' },
  { utilizador: 'Misericordia', nome: 'Misericórdia', papel: 'freguesia', freguesias: ['misericordia'], verificador: 'beecff77f4232df210cfb7be18dbe1c7d114b98c36f6a81ac0adc36809c715a5' },
  { utilizador: 'Olivais', nome: 'Olivais', papel: 'freguesia', freguesias: ['olivais'], verificador: 'a3d6aab00396698d4be33353c62aa6dd2c14f4416297d6be24446b1047e8adba' },
  { utilizador: 'Parquedasnacoes', nome: 'Parque das Nações', papel: 'freguesia', freguesias: ['parque-das-nacoes'], verificador: 'e15412a8d21597886f17c559524d1e829530647c3126258956b57992933d1541' },
  { utilizador: 'Penhadefranca', nome: 'Penha de França', papel: 'freguesia', freguesias: ['penha-de-franca'], verificador: '4302a8bd004f18cb7317fe032d0c2b24bbce6d1043d10eea475a6ef21ec486b6' },
  { utilizador: 'Santaclara', nome: 'Santa Clara', papel: 'freguesia', freguesias: ['santa-clara'], verificador: 'c237faae6aa707b370b14a9ee4870a3a3ea437a1cf7627c18f8a8026fb2596a6' },
  { utilizador: 'Santamariamaior', nome: 'Santa Maria Maior', papel: 'freguesia', freguesias: ['santa-maria-maior'], verificador: '34db5bad17f7e45dd3cf8300b122d346ffb2fc1a08543cb1b7d20cbb8a6d448e' },
  { utilizador: 'Santoantonio', nome: 'Santo António', papel: 'freguesia', freguesias: ['santo-antonio'], verificador: '8de644d226d92b85244965b055a6b81dbc95bcccda6807ed27e038818721ac29' },
  { utilizador: 'Saodomingosdebenfica', nome: 'São Domingos de Benfica', papel: 'freguesia', freguesias: ['sao-domingos-de-benfica'], verificador: '269693500e16ac05ad376c3325e90501b408842a5e2b9e9e61442541ffe7edb5' },
  { utilizador: 'Saovicente', nome: 'São Vicente', papel: 'freguesia', freguesias: ['sao-vicente'], verificador: '47ac9a7c7cde08735573ad02dec45f70bae527063c97b2c876080273f54ec0f2' },
  { utilizador: 'Concelhia.Lisboa', nome: 'Concelhia de Lisboa', papel: 'cidade', freguesias: ['*'], verificador: '2980be2c57bfed11a16b57a6a0e90ef6ccbe4dcd60ec83a0eb04b23ba4b0d5e4' },
  { utilizador: 'System.Admin', nome: 'Administração do sistema', papel: 'admin', freguesias: ['*'], verificador: '9b59efa0105785097ed942dabc166359fe428b3c1b77349f5449afb01781040b' },
];
