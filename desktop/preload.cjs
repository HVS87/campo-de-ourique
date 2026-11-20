// Ponte entre a página e a aplicação de computador (só as atualizações): a página continua isolada (contextIsolation,
// sandbox) e só vê estas quatro funções. O processo principal confere que o pedido vem da apresentação.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aplicacaoPC', {
  atualizacoes: {
    estado: () => ipcRenderer.invoke('atualizacoes:estado'),
    automaticas: ligar => ipcRenderer.invoke('atualizacoes:auto', !!ligar),
    procurar: () => ipcRenderer.invoke('atualizacoes:procurar'),
    instalar: () => ipcRenderer.invoke('atualizacoes:instalar'),
    aoMudar: fn => { const f = (e, est) => fn(est); ipcRenderer.on('atualizacoes:mudou', f); return () => ipcRenderer.removeListener('atualizacoes:mudou', f); },
  },
});
