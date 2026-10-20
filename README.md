# threejs-particle-engine

Partículas para [three.js](https://threejs.org): humo, chispas, polvo, magia, lluvia, explosiones.
El emisor es **datos** — se valida, se hashea y se guarda en JSON, como un material de
threejs-material-engine —, la simulación es pura y determinista, y cada emisor se dibuja con una
sola llamada.

```js
import { createParticleEngine } from 'threejs-particle-engine/three';

const particulas = createParticleEngine();
const fuego = particulas.emitter({ extends: 'fuego' });                    // un preset
const humo = particulas.emitter({ extends: 'humo', rate: 20, wind: [1, 0, 0] });
humo.position = [0, 0.7, 0];
escena.add(fuego.object, humo.object);                                     // o motor.content.add(…)

const chispazo = particulas.emitter({                                      // una explosión de una vez
  extends: 'chispas', loop: false, rate: 0, bursts: [{ time: 0, count: [200, 260] }],
  shape: { type: 'sphere', radius: 0.1 },
}, { autoDispose: true });                                                  // se suelta sola al terminar

// en cada cuadro: avanza todo y sube lo que cambió (con la cámara, ordena los de blending normal)
renderer.setAnimationLoop(() => { particulas.update(reloj.getDelta(), camara); renderer.render(escena, camara); });
particulas.help();                                                          // todo lo que hay
```

- **Un emisor es una definición**: `max`, `rate`, `bursts` (`{ time, count, cycles?, interval? }`),
  `duration` + `loop`, `prewarm` (arranca como si ya hubiera estado andando); la forma (`point`,
  `sphere`, `box`, `cone`, `disk`, `ring`, con `emitFrom`: adentro, en la superficie o en el borde);
  al nacer `life`, `speed`, `size`, `rotation`, `angularVelocity` y `color`, cada uno un valor o un
  rango `[min, max]`; a lo largo de la vida `sizeOverLife`, `colorOverLife`, `alphaOverLife` y
  `speedOverLife` como curvas (`[[t, v], …]`, interpolación lineal, colores en lineal); fuerzas
  `gravity`, `drag`, `wind` (la velocidad del aire: va con drag) y `turbulence { strength, scale,
  speed }`; `space: 'world' | 'local'` (el humo de un auto queda en el mundo; el aura de un
  personaje lo sigue); el flipbook `texture: { frames: [columnas, filas], count?, fps?, random?,
  filter? }`; `blending: 'normal' | 'additive'`, `softness` y `seed`.
- **Validada, con errores que dicen dónde**: `defineEmitter(def)` normaliza los atajos (un valor en
  vez de un rango, `'sphere'` en vez de `{ type: 'sphere' }`, curvas cortas como `[1, 0]`) y tira
  `emitter.size[1]: va un número`, `clave desconocida: colour`, `emitter.wind: … va con drag > 0`.
  Lo normalizado se guarda en JSON y se vuelve a pasar dando lo mismo, y `hashEmitter(def)` da el
  mismo hash para la misma definición escrita distinto.
- **Presets como datos**: `fuego`, `humo`, `chispas`, `polvo`, `lluvia`, `magia`. La app los copia
  y pisa: `{ extends: 'humo', rate: 40 }` (la forma, la textura y la turbulencia se pisan por clave).
  `extends` también acepta otra definición de la app.
- **La simulación, pura**, en arrays tipados (`createSimulation(def)`): corre en Node, así que se
  prueba ahí — vida, rangos, ráfagas, nunca más de `max`, determinismo con la misma semilla, un `dt`
  grande que no rompe nada. Los que nacen dentro de un cuadro nacen en su momento y, en `'world'`,
  repartidos por el camino del emisor: sin grumos aunque se mueva rápido.
- **Una llamada de dibujo por emisor**: un `InstancedBufferGeometry` (un quad) con atributos por
  instancia (posición, color con alfa, tamaño, rotación y cuadro) y un `ShaderMaterial` que orienta
  el quad hacia la cámara en el vértice; `depthWrite: false`; blending normal (ordenado de atrás
  para adelante con `update(dt, camera)`) o aditivo; la niebla de three. Se sube solo el rango de
  las vivas (`addUpdateRange`).
- **Sin textura, un círculo suave** generado (`softness`: de borde duro a todo degradé). **Con
  `texture`**, cualquier `THREE.Texture`: una hoja de flipbook, o una que hornea
  threejs-material-engine (su generador `dots`, por ejemplo).
- **Formas procedurales, sin textura**: `form: { type, …parámetros }` dibuja la partícula con una
  función de distancia (SDF) en el shader: `circle`, `ring` (`thickness`), `square` (`roundness`),
  `diamond`, `star` (`points`, `inner`), `cross` (`thickness`), `spark` (`width`) y `noise` (`amount`,
  `scale`: una mancha con el borde de ruido, distinta en cada partícula). Sale nítida a cualquier
  tamaño (antialias con la derivada) y, con `pixel`, la misma forma sale pixelada. `softness` es su
  borde, y `formOverLife: { inner: [0.5, 0.2] }` anima sus parámetros a lo largo de la vida (una onda
  que se abre, una estrella que se afina). Con una textura, la forma es su máscara. Una app suma las
  suyas con `particulas.registerForm({ name: 'app/gota', version, params, glsl })`: el cuerpo de
  `float formSDF(vec2 p, vec4 f, float seed)` con el quad de -1 a 1, sus parámetros (hasta 4) como
  variables y `formNoise(vec2)` para usar; su `version` entra en el hash. `form` no es `shape`: `shape`
  es de donde nacen.
- **Pixel art**: `pixel: { pixelsPerUnit, snap, fade, palette, rotation }` (o `pixel: true`) hace que
  las partículas sean del mismo mundo que los sprites de threejs-sprite-engine:
  - el tamaño se redondea a **píxeles enteros** del arte (`pixelsPerUnit`, como en los sprites), y la
    textura se muestrea en esa grilla: sin textura, el círculo sale como un disco de píxeles;
  - `snap` pega la posición a la grilla de píxeles en el plano de la vista;
  - `fade`: `'dither'` desvanece con un **tramado** de Bayer 4 × 4 en píxeles del arte, `'cutout'`
    recorta duro, `'alpha'` es la transparencia de siempre;
  - `palette` lleva el color final (nacimiento × `colorOverLife`) al **más cercano de la paleta**:
    salta por escalones en vez de pasar por los tonos intermedios;
  - `rotation` gira de a pasos (90: cuartos de vuelta; 0: sin giro; `null`: libre).

  El tamaño, el color y el giro se redondean en la simulación (lo prueba Node); lo simulado no
  cambia. Con una textura de la app, se usa una copia con `NearestFilter` (también con `texture: {
  filter: 'nearest' }` sin `pixel`). La grilla del flipbook es la misma de threejs-sprite-engine:
  cuadros en orden de lectura, de arriba a la izquierda, con `count` si la última fila no está llena.
  Con cámara en perspectiva, cada partícula queda en la grilla de su profundidad; la grilla exacta de
  toda la pantalla es el look pixelado de render
  ([threejs-render-engine#13](https://github.com/EasyIndustry/threejs-render-engine/issues/13)).
- **Sin build**, módulos ES. **Núcleo puro**: `src/` no importa three ni el DOM. three está en
  `adapters/three/`, como *peer* opcional.

## Estructura

```
src/
  emitter.js       defineEmitter (validar y normalizar, extends), hashEmitter
  simulation.js    createSimulation: la simulación en arrays tipados; sortByDepth
  presets.js       los presets (datos)
  shapes.js        las formas: dónde nace cada partícula y hacia dónde sale
  curves.js        las curvas a lo largo de la vida
  flipbook.js      el cuadro del flipbook, su UV y el círculo suave
  noise.js         el ruido de la turbulencia
  random.js        el azar con semilla (mulberry32)
  color.js         hex ↔ lineal
  help.js, members.js
adapters/three/
  particles.js     createParticleEngine: el dibujo con instancias y el ShaderMaterial
examples/          una página con los presets, una explosión y un flipbook
test/              las pruebas, en Node
```

## Usarlo, sin build

```html
<script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "threejs-particle-engine/three": "./vendor/threejs-particle-engine/adapters/three/particles.js" } }
</script>
```

three es *peer* (`>=0.160.0`, probado con 0.170.0). El núcleo (`threejs-particle-engine`, en
`src/index.js`) no lo necesita: sirve en un servidor o en un worker para validar y simular.

## Con threejs-render-engine y los otros motores

El motor no importa a ningún otro motor de la suite: la app los conecta.

```js
import { createEngine } from 'threejs-render-engine';
import { createParticleEngine } from 'threejs-particle-engine/three';

const motor = createEngine(document.body, { preset: 'dark' });
const particulas = createParticleEngine();
const antorcha = particulas.emitter({ extends: 'fuego' });
antorcha.position = [2, 1.2, 0];
motor.content.add(antorcha.object);
motor.onFrame((dt) => particulas.update(dt, motor.camera));
```

- **Las marcas de render**: la malla de cada emisor se marca sola `userData.noEdge` y
  `userData.noAO` (una partícula no tiene aristas ni hace oclusión). El objeto del emisor no se
  marca: lo que la app cuelga adentro (la antorcha) sigue como siempre.
- **El render final** (path tracing) deja afuera las partículas solo: son un material de shader
  propio, que el path tracer no entiende (`src/flags.js` de render). No hace falta `noRender`.
- **La niebla** del preset de render se aplica a las partículas (las aditivas se apagan en la
  niebla en vez de aclararse).
- **threejs-material-engine**: una textura horneada (un mapa de `bake()`) va como `texture`.
- **threejs-sprite-engine**: la grilla del flipbook es el mismo formato que la de una hoja de sprites;
  para pixel art, `pixel` con el mismo `pixelsPerUnit` que los sprites. El look pixelado de la pantalla entera es de render (pedido en
  [threejs-render-engine#13](https://github.com/EasyIndustry/threejs-render-engine/issues/13)), y el
  filtro nearest en materiales, de material-engine
  ([threejs-material-engine#1](https://github.com/EasyIndustry/threejs-material-engine/issues/1)).
- **threejs-game-engine**: un emisor es una entidad más con su `.object` (y `done` dice cuándo se
  puede sacar una de una vez).

## Lo que todavía no hace

- **Simulación en la GPU** (GPGPU) para cientos de miles de partículas: hoy simula en JS (20 000
  vivas con turbulencia y tres curvas cuestan unos 8 ms por paso en Node, en una máquina de
  escritorio).
- **Colisión** con el piso o con la escena.
- **Partículas suaves** (soft particles: que se desvanezcan al cortar una superficie): necesitan la
  textura de profundidad de la escena, que es de render (un issue futuro a threejs-render-engine).
  `softness` hoy es solo el borde del círculo por defecto.
- **Estelas** (trails) y partículas estiradas según la velocidad (la lluvia hoy son gotas redondas).
- **Sub-emisores**: una chispa que al morir larga humo.
- Mientras tanto, `speedOverLife` multiplica la velocidad entera (con la gravedad incluida) y la
  turbulencia es ruido de valor, no un campo de rotor: alcanza para humo, polvo y magia, no para un
  fluido.

## Pruebas

```
node --test
npm run typecheck
```

Lo que dibuja se prueba a ojo en `examples/index.html` (por HTTP: `python3 -m http.server` en la
raíz del repo y abrir `/examples/`).

## Contribuir

El motor es agnóstico: no entra el efecto de una app, entra la herramienta que resuelve esa clase
de problema para cualquier app. Qué entra y cómo se evalúa un pedido está en
[`POLITICA.md`](POLITICA.md); cómo se contribuye, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licencia

MIT
