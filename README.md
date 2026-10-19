# Iso Game (PixiJS + Colyseus)

## Màquina virtual

- **Usuari:** *multi*
- **Contrasenya:** *patata1234*

## Engegar servidor i client

### Servidor (port 2567)

1. `cd server`
2. `npm start`

#### Crear base de dades

Nomes cal executar `npm run create-db`.

### Client (port 5173)

1. `cd client`
2. `npm run dev`

## Crear mapes isometrics

Fet amb el programa [Tiled](https://thorbjorn.itch.io/tiled). El projecte del mapa esta a `client/public/assets/map.tmx`.

La capa principal es diu `ground` i despres hi ha la capa `collision` que determina les caselles que tindran col·lisions i que per tant el jugador no podra passar.

> La capa de col·lisions s'ha d'anomenar `collision`, si no tambe s'hauria de canviar en el codi.

## Actualitzar el mapa del joc

Hi ha 2 passos importants a fer:

1. Exportar el mapa **(File > Export > JSON map files (\*.tmj, \*.json))** a `client/public/assets/map.tmj`.
2. Obrir el fitxer exportat (`client/public/assets/map.tmj`) i canviar el parametre `source` del que hi hagi a **"map_tiles.tsx"**.

L'aparta de **tilesets** hauria de quedar aixi:

```json
...
"tilesets":[
    {
        "firstgid":1,
        "source":"map_tiles.tsx"
    }
],
...
```

## Problemes alhora d'executar

Si hi ha qualsevol problema el millor es eliminar la carpeta `node_modules` i el fitxer `package-lock.json`.