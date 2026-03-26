# Even Run

App independente para Even G2.

## O que ja esta aqui

- Escolha de atividade: RUN, BIKE, WALK
- Modo de teste com origem mock e destinos mock, sem depender do GPS real
- Metricas de distancia, tempo, ritmo/velocidade e laps
- Mapa gratuito no browser usando embed do OpenStreetMap
- Rota mock seguindo ruas via OSRM publico
- Snapshot monocromatico da rota para o G2 via `updateImageRawData` ao pausar ou finalizar
- Snapshot do G2 composto com tiles raster do CartoDB Dark basemap
- Bridge dedicada ao G2 usando somente containers de `text`, `list` e `image`

## Como rodar

1. `cd Even-run`
2. `npm install`
3. `npm run dev`

## Limitacao real do SDK

O SDK publico usado no WebView expoe `createStartUpPageContainer`, `rebuildPageContainer`,
`textContainerUpgrade` e `updateImageRawData`, mas nao documenta uma API para abrir a UI
nativa de `Navigate` do G2 a partir de apps browser. Por isso este app renderiza o
mini-mapa por conta propria no oculos.

## Como mover depois

1. Copiar a pasta `Even-run`
2. Rodar `npm install`
3. Usar `npm run dev` ou `npm run build`
4. Usar 'npx @evenrealities/evenhub-simulator URL_DO_SERVIDOR            '
