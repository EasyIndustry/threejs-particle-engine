# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones
según [SemVer](https://semver.org): mientras sea `0.x`, una versión menor puede romper algo,
y si rompe queda dicho arriba de todo en esa entrada. Los pre-releases (`-rc.N`) se prueban
en una app antes del release (ver `CONTRIBUTING.md`).

## [0.1.0-rc.1] - 2026-10-20

Primera versión.

### Agregado

- **El emisor como datos** (`defineEmitter`): `max`, `rate`, `bursts` (`time`, `count` fijo o
  `[min, max]`, `cycles`, `interval`), `duration`, `loop`, `prewarm`; la forma (`point`, `sphere`,
  `box`, `cone`, `disk`, `ring`, con `emitFrom`); al nacer `life`, `speed`, `size`, `rotation`,
  `angularVelocity` y `color`, cada uno fijo o un rango; las curvas a lo largo de la vida
  `sizeOverLife`, `colorOverLife`, `alphaOverLife` y `speedOverLife` (keyframes con interpolación
  lineal, colores en lineal, y atajos); las fuerzas `gravity`, `drag`, `wind` y `turbulence`;
  `space` (`'world'` o `'local'`); el flipbook `texture: { frames, count, fps, random, filter }`
  (`filter: 'nearest'` para pixel art); `blending`, `softness` y `seed`. Atajos que se normalizan,
  lo normalizado se puede volver a pasar, y errores que dicen dónde (`emitter.size[1]: …`). Una
  clave que no existe es un error.
- **`extends`**: parte de un preset o de otra definición y pisa lo que se pasa.
- **`hashEmitter`**: igual definición escrita distinto, igual hash.
- **`PRESETS`**: `fuego`, `humo`, `chispas`, `polvo`, `lluvia` y `magia`, como datos congelados.
- **La simulación pura** (`createSimulation`) en arrays tipados, con las vivas juntas al principio:
  `step(dt, { position, rotation })`, `burst(n)`, `play`, `stop`, `pause`, `clear`, `alive`, `done`,
  `dropped`. Determinista con la semilla (mulberry32), subpasos de 1/30 s, un `dt` de más de 1 s
  cuenta como 1 s, nunca más de `max`. Los nacimientos de un paso nacen en su momento y, en
  `'world'`, repartidos por el camino del emisor. En `'local'`, la gravedad y el viento se giran al
  espacio del emisor. `sortByDepth` para dibujar de atrás para adelante.
- **El adaptador de three** (`createParticleEngine`, en `threejs-particle-engine/three`): cada emisor
  es un `InstancedBufferGeometry` con un `ShaderMaterial` que orienta el quad hacia la cámara, una
  sola llamada de dibujo, `depthWrite: false`, blending normal (ordenado de atrás para adelante con
  la cámara) o aditivo, niebla de three, el círculo suave por defecto (`DataTexture`) o la textura de
  la app, y las marcas `userData.noEdge` / `noAO` para threejs-render-engine. Los atributos se suben
  solo en el rango de las vivas. `emitter(def, { texture, seed, sort, autoplay, autoDispose })`,
  `update(dt, camera)`, `stats()`, `dispose()` y `help()` en el motor y en cada emisor.
- `examples/index.html`: los seis presets, una explosión de una vez y un flipbook en pixel art.
