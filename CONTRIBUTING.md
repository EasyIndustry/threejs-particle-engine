# Contribuir

Este motor se vendoriza en varias apps. La pregunta antes de cada cambio no es "¿le sirve a
la app que lo pidió?" sino "¿le sirve a cualquier app de three.js que necesite partículas?".

**Primero, [`POLITICA.md`](POLITICA.md):** qué entra, cómo se evalúa un pedido y qué puede pasar
con él. Un pedido de una app de casa pasa por el mismo filtro que uno de afuera.

## Cómo se pide algo

- **Un pedido:** un issue con la plantilla *Pedido*. Contá el problema, no solo la solución, y a
  qué otro tipo de app le serviría.
- **Un error:** un issue con la plantilla *Error*, con cómo reproducirlo.
- **Un PR:** mejor después de un issue `aceptado`, para no hacer trabajo que no va a entrar. La
  plantilla del PR trae el checklist del contrato.

## Agnóstico: qué entra y qué no

- **Entra:** lo que cualquier sistema de partículas necesita: formas, nacimientos, ráfagas, rangos,
  curvas, fuerzas, flipbook, espacio del mundo o local, y cómo se dibuja.
- **No entra:** los efectos de una app (sus valores, sus nombres): son definiciones en la app, con
  `extends`. Un preset nuevo entra solo si es un efecto típico que no se arma pisando uno que hay.
- **Ningún motor de la suite se importa** (render, materiales, sprites, juego): se conectan desde
  la app con los puntos de extensión (`emitter.object`, `texture`, `update(dt, camera)`).

## El contrato

1. **Un emisor es datos:** `defineEmitter` lo valida y lo normaliza, se guarda en JSON y se vuelve
   a pasar dando lo mismo, y dos definiciones iguales (aunque escritas distinto) dan el mismo hash.
2. **Una clave que no existe es un error**, no un valor que se ignora, y **un error dice dónde**
   (`emitter.size[1]: …`, `emitter.shape.radio: clave desconocida`).
3. **La simulación es pura y determinista:** la misma definición, la misma semilla y los mismos
   `dt` dan lo mismo, en Node y en el navegador. Nunca hay más de `max` vivas, y un `dt` grande
   no rompe nada.
4. **Lo puro no importa three ni el DOM** (`src/`), y una prueba lo frena si pasa. three se importa
   solo en `adapters/three/`.
5. **Cada miembro de la API tiene su línea en `src/members.js`** (una tabla por objeto: el motor y
   el emisor). Una prueba exige que cada tabla y su API coincidan, en las dos direcciones.
6. **Lo que se dibuja respeta a threejs-render-engine:** la malla se marca `userData.noEdge` y
   `userData.noAO`, y es un material de shader propio (el path tracer lo deja afuera solo).
7. **Sin dependencias:** three es *peer* (`>=0.160.0`, probado con 0.170.0); `typescript` es solo
   para `npm run typecheck`.

## Cómo se agrega algo

La regla: **una feature entra primero al núcleo y después al adaptador.**

1. En `src/` (la definición en `emitter.js`, la simulación en `simulation.js`, o un módulo nuevo),
   con su prueba en `test/`, en Node.
2. Si cambia cómo se dibuja, en `adapters/three/particles.js`, con su línea en `src/members.js`.
3. Probado a ojo en `examples/index.html`.
4. En el `CHANGELOG.md`, y si rompe algo, marcado **Ruptura** con cómo migrar (una clave que
   cambia de sentido rompe las definiciones guardadas).

El tipado se verifica con `npm run typecheck`, en modo estricto (cubre `src/`). Los tipos van en
JSDoc: los archivos siguen siendo `.js` y no hay paso de build.

## Ramas, pre-releases y releases

**Hasta la 1.0, todo pasa por `test`.** `main` solo se actualiza para la 1.0 (y para la política del
repo y lo que no es código); mientras tanto no hay PR de `test` a `main` ni release sin `-rc`.

- **`test`** es la rama de trabajo y de lo que se prueba en una app. El trabajo se hace en ramas
  propias y se mergea a `test` (con merge commit, nunca squash: los tags tienen que seguir
  apuntando a commits de `test`).
- **Pre-release `vX.Y.Z-rc.N`** sobre un commit de `test`: es lo que una app vendoriza. Cada issue
  que entra suma un rc (`-rc.2`, `-rc.3`…), o abre la versión siguiente (`0.2.0-rc.1`).
- **La serie arranca en `0.1.0-rc.1`.**
- **1.0:** recién ahí `test` pasa a `main` (PR con merge commit), con su commit de release y
  `gh release create v1.0.0`.

### Publicar un pre-release

1. `package.json` dice la versión del rc (`0.1.0-rc.1`) y `CHANGELOG.md` tiene su entrada (lo que
   rompe, arriba de todo).
2. `test` apunta a ese commit.
3. ```bash
   gh release create v0.1.0-rc.1 --prerelease --target <sha completo> --title v0.1.0-rc.1 --notes-file <notas>
   ```
   `--target` necesita el SHA de 40 caracteres: con uno abreviado, GitHub contesta
   "target_commitish is invalid".
