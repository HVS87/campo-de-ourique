# Licenças de terceiros

A licença MIT do ficheiro [LICENSE](LICENSE) cobre o código deste projeto (HTML, CSS, JavaScript e os scripts em
`tools/`). Os dados e as imagens de terceiros mantêm as suas licenças:

| O quê | Onde | Licença |
|---|---|---|
| Leaflet 1.9.4, © Vladimir Agafonkin, CloudMade | `vendor/leaflet/` | BSD 2-Clause |
| jsPDF 4.2.1, © Parallax, Pure Lyric e colaboradores | `vendor/jspdf/` | MIT |
| Electron 44 (inclui o Chromium e o Node.js), © OpenJS Foundation e colaboradores | dentro da aplicação de computador | MIT (o Chromium e o Node.js trazem as suas licenças, no ficheiro LICENSES.chromium.html da aplicação) |
| electron-updater, © Loopline Systems e colaboradores do electron-builder | dentro da aplicação de computador (atualizações) | MIT |
| Leaflet 1.9.4 por CDN (cdnjs) | página de consulta do servidor central (`servidor-central/consulta.html`) | BSD 2-Clause |
| Ortoimagens DGT OrtoSat 2023 | `assets/satelite-dgt-2023.jpg`, `assets/lisboa-dgt-2023.jpg`, `assets/lisboa-dgt-2023-alto.jpg`, `dados/freguesias/*/satelite.jpg` e camada em direto | CC BY 4.0 |
| Limite da freguesia, ruas e geometrias derivadas do OpenStreetMap | `dados/geo.js`, `dados/ruas.js`, `dados/campo-de-ourique.geojson`, geometrias em `dados/presets/` | © colaboradores do OpenStreetMap, ODbL 1.0 |
| Edificado e números de polícia | `dados/edificado.js`, `dados/freguesias/*/edificado.js` | Câmara Municipal de Lisboa, dados abertos (serviço «Edificado e Vias») |
| Limites das freguesias e ruas (exceto Campo de Ourique) | `dados/freguesias/index.js`, `dados/freguesias/limites.js`, `dados/freguesias/*/geo.js`, `dados/freguesias/*/ruas.js` | Câmara Municipal de Lisboa, dados abertos («Base_Freguesias», «Edificado e Vias») |
| Espaços verdes e hortas urbanas | `dados/verdes.js`, `dados/freguesias/*/verdes.js` | Câmara Municipal de Lisboa, dados abertos («Ambiente DMEVAE») |
| Mapa da cidade (fundo opcional, carregado em direto) | tile.openstreetmap.org | © colaboradores do OpenStreetMap, ODbL; mosaicos sob a política de uso da OSMF |
| Imagens exemplificativas | `assets/fotos/exemplos/` | Wikimedia Commons; autor e licença de cada uma em [CREDITOS.md](assets/fotos/exemplos/CREDITOS.md) |

## Logótipo do Partido Socialista

`assets/icones/ps-logotipo.png` é o logótipo do Partido Socialista (Portugal), usado para identificar a ferramenta. Pertence ao partido, **não** está coberto pela licença MIT deste repositório e não se pode reutilizar sem autorização. Ficheiro obtido na [Wikipédia em português](https://pt.wikipedia.org/wiki/Ficheiro:Partido_Socialista_(Portugal).png), onde está marcado como conteúdo restrito.
