// Configuração da apresentação (comum à versão browser e à aplicação de computador).
//
// Servidor central (opcional): para onde vão também os presets guardados, para se recolherem e consultarem os dados
// de todos. Sem «url», a apresentação funciona só localmente. Cada pessoa pode ainda pôr outro endereço, o seu nome
// e a sua chave de acesso no painel «☁ Servidor central» (modo de edição, «⋯ Mais»); isso fica só no seu browser.
// O servidor de referência e a descrição da API estão em servidor-central/.
window.CONFIG_CENTRAL = {
  url: '',                // por exemplo 'https://dados.exemplo.pt/api/v1'
  enviarAoGuardar: true,  // cada «Guardar» põe o preset na fila de envio para o servidor central
  copiaHoras: 24,         // de quantas em quantas horas se copia o servidor central para este computador (0 = só à mão)
};
