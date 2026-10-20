// El motor de partículas para three.js: cada emisor es una simulación pura (src/simulation.js)
// dibujada con una sola llamada: un InstancedBufferGeometry (un quad) con atributos por instancia
// — posición, color con alfa, y tamaño, rotación y cuadro del flipbook — y un ShaderMaterial que
// orienta el quad hacia la cámara en el vértice.
//
//   const particulas = createParticleEngine();
//   const humo = particulas.emitter({ extends: 'humo', rate: 20 });
//   motor.content.add(humo.object);                                   // threejs-render-engine
//   motor.onFrame((dt) => particulas.update(dt, motor.camera));
//   particulas.help();
//
// - Sin textura, un círculo suave generado (DataTexture, una por softness, compartida). Con
//   `texture`, cualquier THREE.Texture de la app (el motor no la suelta); `texture.frames` de la
//   definición dice cómo es la grilla del flipbook.
// - `depthWrite: false`; blending aditivo o normal. Con blending normal y la cámara en update(), las
//   vivas se ordenan de atrás para adelante (sort, por defecto true); el aditivo no lo necesita.
// - La malla se marca sola `userData.noEdge` y `userData.noAO` (las respeta threejs-render-engine:
//   una partícula no tiene aristas ni hace oclusión). El path tracer del render final la deja afuera
//   solo, porque es un material de shader propio.
// - En 'world' las partículas se guardan en coordenadas del mundo y el shader usa solo la vista
//   (no la matriz del objeto): quedan donde nacieron aunque el emisor se mueva. En 'local', con la
//   del objeto: siguen al emisor. El tamaño va en unidades del mundo (la escala del objeto no lo
//   cambia).
// - Los atributos se suben solo en el rango de las vivas (addUpdateRange).
import * as THREE from 'three';
import { resolveEmitter, defineEmitter, hashEmitter } from '../../src/emitter.js';
import { createSimulation, sortByDepth } from '../../src/simulation.js';
import { PRESETS } from '../../src/presets.js';
import { softCircle } from '../../src/flipbook.js';
import { help } from '../../src/help.js';
import { ENGINE_MEMBERS, EMITTER_MEMBERS } from '../../src/members.js';

// El quad mira a la cámara: se arma en el espacio de la vista, girado por la rotación de la
// partícula. El cuadro del flipbook va en orden de lectura desde arriba a la izquierda, con la v
// para arriba (la misma cuenta que frameUV en src/flipbook.js).
const VERT = /* glsl */ `
#include <common>
attribute vec3 iPosition;
attribute vec4 iColor;
attribute vec3 iParams; // tamaño, rotación (radianes), cuadro
uniform vec2 uFrames;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
#ifdef ESPACIO_MUNDO
  vec4 mvPosition = viewMatrix * vec4(iPosition, 1.0);
#else
  vec4 mvPosition = modelViewMatrix * vec4(iPosition, 1.0);
#endif
  float c = cos(iParams.y), s = sin(iParams.y);
  vec2 q = position.xy * iParams.x;
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mvPosition;
  float cuadro = floor(iParams.z + 0.5);
  float col = mod(cuadro, uFrames.x), fila = floor(cuadro / uFrames.x);
  vUv = vec2((col + uv.x) / uFrames.x, 1.0 - (fila + 1.0 - uv.y) / uFrames.y);
  vColor = iColor;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`;

// El color de la partícula (lineal) por la textura. En la niebla, lo normal se mezcla con el color
// de la niebla y lo aditivo se apaga (sumar el color de la niebla iluminaría).
const FRAG = /* glsl */ `
#include <common>
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
#include <logdepthbuf_fragment>
  vec4 color = vColor * texture2D(uMap, vUv);
  if (color.a < 0.002) discard;
  gl_FragColor = color;
#include <tonemapping_fragment>
#include <colorspace_fragment>
#ifdef USE_FOG
#ifdef FOG_EXP2
  float niebla = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
  float niebla = smoothstep(fogNear, fogFar, vFogDepth);
#endif
#ifdef ADITIVO
  gl_FragColor.rgb *= 1.0 - niebla;
#else
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, niebla);
#endif
#endif
}`;

/** El lado del círculo suave, en píxeles. */
const LADO_CIRCULO = 64;

/**
 * @param {{ sort?: boolean }} [opts] `sort` (true): ordenar de atrás para adelante los emisores de
 *   blending normal cuando update() recibe la cámara. Cada emisor lo puede pisar.
 */
export function createParticleEngine({ sort = true } = {}) {
  /** @type {Set<ReturnType<typeof crear>>} */
  const emisores = new Set();
  /** Los círculos suaves, por softness: compartidos entre los emisores. @type {Map<string, THREE.DataTexture>} */
  const circulos = new Map();
  let creados = 0;
  // para no pedir memoria en cada cuadro
  const tPos = new THREE.Vector3(), tEsc = new THREE.Vector3(), ojo = new THREE.Vector3();
  const tRot = new THREE.Quaternion();
  const inversa = new THREE.Matrix4();
  /** @type {[number, number, number]} */ const posicion = [0, 0, 0];
  /** @type {[number, number, number, number]} */ const rotacion = [0, 0, 0, 1];
  /** @type {[number, number, number]} */ const vista = [0, 0, 0];

  /** El círculo suave de una softness. @param {number} softness */
  function circulo(softness) {
    const k = softness.toFixed(3);
    let t = circulos.get(k);
    if (!t) {
      t = new THREE.DataTexture(softCircle(LADO_CIRCULO, softness), LADO_CIRCULO, LADO_CIRCULO, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      t.name = `círculo suave ${k}`;
      circulos.set(k, t);
    }
    return t;
  }

  /**
   * Un emisor: la simulación, su malla y su API.
   * @param {Record<string, unknown>} def
   * @param {{ texture?: THREE.Texture | null, seed?: number, sort?: boolean, autoplay?: boolean, autoDispose?: boolean }} [opts]
   */
  function crear(def, { texture = null, seed, sort: ordenar = sort, autoplay = true, autoDispose = false } = {}) {
    const d = resolveEmitter(def);
    if (texture !== null && !(/** @type {any} */ (texture)?.isTexture)) throw new TypeError('emitter(def, { texture }): va una THREE.Texture (o nada: el círculo suave)');
    // cada emisor arranca con otra semilla (la de la definición más cuántos se crearon antes):
    // deterministas, pero dos fuegos iguales no titilan igual
    const sim = createSimulation(d, { seed: seed ?? (d.seed + creados) % 2 ** 32, autoplay });
    creados++;
    const N = d.max;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const aParams = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosition', aPos);
    geo.setAttribute('iColor', aColor);
    geo.setAttribute('iParams', aParams);
    geo.instanceCount = 0;

    // pixel art: con filter 'nearest' se usa una copia de la textura de la app con NearestFilter
    // (comparte la imagen; la de la app queda como estaba)
    /** @type {THREE.Texture | null} */
    let copia = null;
    let versionFuente = -1;
    if (texture && d.texture.filter === 'nearest') {
      copia = texture.clone();
      copia.magFilter = THREE.NearestFilter;
      copia.minFilter = THREE.NearestFilter;
      copia.generateMipmaps = false;
    }
    /** Si la imagen de la app cambió (o terminó de cargar), la copia se vuelve a subir. */
    const alDia = () => {
      if (!copia || copia.source.version === versionFuente) return;
      copia.needsUpdate = true; // sube la versión de la fuente
      versionFuente = copia.source.version;
    };
    alDia();

    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFrames: { value: new THREE.Vector2(d.texture.frames[0], d.texture.frames[1]) } }]);
    // la textura va aparte: merge clona las texturas
    uniforms.uMap = { value: copia ?? texture ?? circulo(d.softness) };
    /** @type {Record<string, string>} */
    const defines = {};
    if (d.space === 'world') defines.ESPACIO_MUNDO = '';
    if (d.blending === 'additive') defines.ADITIVO = '';
    const mat = new THREE.ShaderMaterial({
      name: `partículas ${d.name}`.trim(), vertexShader: VERT, fragmentShader: FRAG, uniforms, defines,
      transparent: true, depthWrite: false, fog: true,
      blending: d.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const malla = new THREE.Mesh(geo, mat);
    malla.frustumCulled = false; // las partículas se van de cualquier caja que se calcule al crearla
    malla.visible = false;
    malla.name = 'partículas';
    malla.userData.noEdge = true;
    malla.userData.noAO = true;
    malla.userData.particleEngine = { hash: hashEmitter(d), name: d.name };
    const object = new THREE.Group();
    object.name = d.name || 'emisor';
    object.add(malla);

    // ordenar sin pedir memoria en cada cuadro
    const orden = new Uint32Array(N), distancias = new Float32Array(N);

    /** Dónde está el emisor en el mundo, para la simulación. */
    function ubicar() {
      object.updateWorldMatrix(true, false);
      object.matrixWorld.decompose(tPos, tRot, tEsc);
      posicion[0] = tPos.x; posicion[1] = tPos.y; posicion[2] = tPos.z;
      rotacion[0] = tRot.x; rotacion[1] = tRot.y; rotacion[2] = tRot.z; rotacion[3] = tRot.w;
    }

    /** Copia las vivas a los atributos (en orden de atrás para adelante si hace falta) y las sube. @param {THREE.Camera | undefined} camara */
    function subir(camara) {
      const n = sim.alive;
      const { position: P, color: C, size, rotation, frame } = sim.data;
      /** @type {Uint32Array | null} */
      let o = null;
      if (ordenar && camara && d.blending === 'normal' && n > 1) {
        camara.updateWorldMatrix(true, false);
        ojo.setFromMatrixPosition(camara.matrixWorld);
        if (d.space === 'local') ojo.applyMatrix4(inversa.copy(object.matrixWorld).invert());
        vista[0] = ojo.x; vista[1] = ojo.y; vista[2] = ojo.z;
        o = sortByDepth(P, n, vista, orden, distancias);
      }
      const ap = /** @type {Float32Array} */ (aPos.array), ac = /** @type {Float32Array} */ (aColor.array), ar = /** @type {Float32Array} */ (aParams.array);
      if (o) {
        for (let k = 0; k < n; k++) {
          const i = o[k];
          ap[k * 3] = P[i * 3]; ap[k * 3 + 1] = P[i * 3 + 1]; ap[k * 3 + 2] = P[i * 3 + 2];
          ac[k * 4] = C[i * 4]; ac[k * 4 + 1] = C[i * 4 + 1]; ac[k * 4 + 2] = C[i * 4 + 2]; ac[k * 4 + 3] = C[i * 4 + 3];
          ar[k * 3] = size[i]; ar[k * 3 + 1] = rotation[i]; ar[k * 3 + 2] = frame[i];
        }
      } else {
        ap.set(P.subarray(0, n * 3));
        ac.set(C.subarray(0, n * 4));
        for (let i = 0; i < n; i++) { ar[i * 3] = size[i]; ar[i * 3 + 1] = rotation[i]; ar[i * 3 + 2] = frame[i]; }
      }
      if (n > 0) {
        for (const [a, ancho] of /** @type {const} */ ([[aPos, 3], [aColor, 4], [aParams, 3]])) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, n * ancho);
          a.needsUpdate = true;
        }
      }
      geo.instanceCount = n;
      malla.visible = n > 0;
      alDia();
    }

    let soltado = false;
    const emisor = {
      object,
      def: d,
      simulation: sim,
      /** El Vector3 del object; se puede asignar un [x, y, z] o un Vector3. */
      get position() { return object.position; },
      set position(v) {
        const a = /** @type {any} */ (v);
        if (Array.isArray(a)) object.position.fromArray(a);
        else object.position.copy(a);
      },
      get alive() { return sim.alive; },
      get emitting() { return sim.emitting; },
      get done() { return sim.done; },
      play() { sim.play(); return emisor; },
      stop() { sim.stop(); return emisor; },
      pause() { sim.pause(); return emisor; },
      clear() { sim.clear(); subir(undefined); return emisor; },
      /** n partículas ya, donde está el emisor ahora. @param {number} n */
      burst(n) {
        ubicar();
        sim.step(0, { position: posicion, rotation: rotacion });
        sim.burst(n);
        subir(undefined);
        return emisor;
      },
      dispose() {
        if (soltado) return;
        soltado = true;
        object.removeFromParent();
        geo.dispose();
        mat.dispose();
        copia?.dispose();
        emisores.delete(interno);
      },
      /** @param {{ print?: boolean }} [o] */
      help(o) { return help(`ParticleEmitter${d.name ? ` "${d.name}"` : ''} — un emisor de partículas`, EMITTER_MEMBERS, o); },
    };
    const interno = {
      emisor,
      malla,
      /** @param {number} dt @param {THREE.Camera | undefined} camara */
      actualizar(dt, camara) {
        ubicar();
        sim.step(dt, { position: posicion, rotation: rotacion });
        subir(camara);
        if (autoDispose && sim.done) emisor.dispose();
      },
    };
    emisores.add(interno);
    return interno;
  }

  const motor = {
    /**
     * Un emisor nuevo. Su `.object` va a la escena (motor.content); update() lo avanza.
     * @param {Record<string, unknown>} def
     * @param {{ texture?: THREE.Texture | null, seed?: number, sort?: boolean, autoplay?: boolean, autoDispose?: boolean }} [opts]
     */
    emitter(def, opts) { return crear(def, opts).emisor; },
    /** La definición completa y validada (ver defineEmitter). @param {Record<string, unknown>} def */
    define: (def) => defineEmitter(def),
    /** El identificador de la definición. @param {Record<string, unknown>} def */
    hash: (def) => hashEmitter(def),
    PRESETS,
    /** Los emisores que hay. */
    get emitters() { return [...emisores].map((e) => e.emisor); },

    /**
     * Avanza todos los emisores dt segundos y sube sus atributos. Con la cámara, ordena las vivas
     * de los emisores de blending normal.
     * @param {number} dt @param {THREE.Camera} [camera]
     */
    update(dt, camera) {
      for (const e of [...emisores]) e.actualizar(dt, camera);
    },

    /** Qué hay: emisores, partículas vivas, llamadas de dibujo y las que no entraron por max. */
    stats() {
      let alive = 0, drawCalls = 0, dropped = 0;
      for (const e of emisores) {
        alive += e.emisor.alive;
        dropped += e.emisor.simulation.dropped;
        if (e.malla.visible) drawCalls++;
      }
      return { emitters: emisores.size, alive, drawCalls, dropped };
    },

    /** Suelta todos los emisores y los círculos suaves (las texturas de la app no). */
    dispose() {
      for (const e of [...emisores]) e.emisor.dispose();
      for (const t of circulos.values()) t.dispose();
      circulos.clear();
    },

    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('ParticleEngine — partículas para three.js', ENGINE_MEMBERS, o); },
  };
  return motor;
}
