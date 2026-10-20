// La simulación de un emisor, pura, en arrays tipados (estructura de arrays: un Float32Array por
// atributo, todas las partículas seguidas). Las vivas están siempre juntas en [0, alive): cuando
// una muere, la última ocupa su lugar. Así el adaptador sube solo ese rango.
//
//   const sim = createSimulation({ extends: 'humo' });
//   sim.step(1 / 60, { position: [0, 1, 0] });   // el emisor dónde está (y su rotación, [x, y, z, w])
//   sim.alive;                                   // cuántas hay (con prewarm, ya lleno desde el primer paso)
//   sim.data.position;                           // Float32Array: x, y, z de cada una
//
// Determinista: la misma definición, la misma semilla y la misma secuencia de dt dan lo mismo, en
// Node y en el navegador.
//
// Cada paso se parte en subpasos de 1/30 s como mucho (las fuerzas no se disparan con un dt
// grande), y un dt de más de 1 s cuenta como 1 s: una pestaña que vuelve de estar oculta no larga
// de golpe todo lo que se perdió. Nunca hay más de `max` vivas: lo que no entra se pierde (y se
// cuenta en `dropped`, para ajustar `max`).
//
// Las que nacen dentro de un paso nacen en su momento: con la edad que les toca y, en 'world', en
// el punto del camino del emisor donde estaba en ese momento (sin grumos aunque se mueva rápido).
//
// Con `pixel` (pixel art), lo que se dibuja sale ya redondeado: el tamaño a píxeles enteros, el
// color al de la paleta y el giro a pasos (pixel.js). Lo que se simula (velocidades, edad, el giro
// libre en `rotation`) no cambia: el redondeo es solo de `size`, `color` y `angle`.
//
// Con `form`, `data.form` tiene los parámetros de la forma de cada una (4 por partícula, en el orden
// de los de la forma): los de la definición, pisados por formOverLife según la edad.
//
// Puro: no importa three ni DOM.
import { resolveEmitter } from './emitter.js';
import { createRandom } from './random.js';
import { hexToLinear } from './color.js';
import { sampleCurve, linearColorCurve, sampleLinearColor } from './curves.js';
import { sampleShape } from './shapes.js';
import { flipbookFrame } from './flipbook.js';
import { noise3 } from './noise.js';
import { pixelSize, stepAngle, createPalette, nearestColor } from './pixel.js';
import { getForm } from './form.js';

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat */

/** El subpaso más largo, en segundos. */
export const MAX_SUBSTEP = 1 / 30;
/** El dt más largo que se simula en un paso, en segundos. */
export const MAX_DELTA = 1;

/**
 * Los arrays de la simulación: lo que la partícula tiene desde que nace y lo que se dibuja.
 * @typedef {{
 *   position: Float32Array, velocity: Float32Array, age: Float32Array, life: Float32Array,
 *   startSize: Float32Array, startColor: Float32Array, rotation: Float32Array, spin: Float32Array, seed: Float32Array,
 *   size: Float32Array, color: Float32Array, angle: Float32Array, frame: Float32Array, form: Float32Array,
 * }} ParticleData
 */

/**
 * v girado por el cuaternión q (unitario). Escribe en `out`.
 * @param {Quat} q @param {number} x @param {number} y @param {number} z @param {Vec3} out
 */
function girar(q, x, y, z, out) {
  const [qx, qy, qz, qw] = q;
  // t = 2 (q × v); v' = v + w t + q × t
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** @param {unknown} v @param {number} n @param {string} que */
function vector(v, n, que) {
  if (!Array.isArray(v) && !ArrayBuffer.isView(v)) throw new TypeError(`${que}: va un array de ${n} números`);
  const a = /** @type {ArrayLike<number>} */ (v);
  if (a.length !== n) throw new TypeError(`${que}: va un array de ${n} números`);
  for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) throw new TypeError(`${que}: va un array de ${n} números finitos`);
  return a;
}

/**
 * Una simulación de un emisor.
 * @param {Record<string, unknown> | import('./emitter.js').EmitterDef} def la definición (se valida con defineEmitter)
 * @param {{ seed?: number, autoplay?: boolean }} [opts] `seed` pisa la de la definición (dos emisores
 *   iguales que no se vean iguales); `autoplay` (true): arranca emitiendo.
 */
export function createSimulation(def, { seed, autoplay = true } = {}) {
  const d = resolveEmitter(def);
  const N = d.max;
  /** @type {ParticleData} */
  const data = {
    position: new Float32Array(N * 3), velocity: new Float32Array(N * 3),
    age: new Float32Array(N), life: new Float32Array(N),
    startSize: new Float32Array(N), startColor: new Float32Array(N * 3),
    rotation: new Float32Array(N), spin: new Float32Array(N), seed: new Float32Array(N),
    size: new Float32Array(N), color: new Float32Array(N * 4), angle: new Float32Array(N), frame: new Float32Array(N),
    form: new Float32Array(d.form ? N * 4 : 0),
  };
  const semilla = seed === undefined ? d.seed : seed;
  if (!Number.isInteger(semilla)) throw new TypeError(`seed: va un entero (vino ${JSON.stringify(seed)})`);
  const rnd = createRandom(semilla);
  const azar = rnd.next;

  // lo que no cambia, ya calculado
  const RAD = Math.PI / 180;
  const colorA = hexToLinear(d.color[0]), colorB = hexToLinear(d.color[1]);
  const curvaColor = d.colorOverLife ? linearColorCurve(d.colorOverLife) : null;
  const { sizeOverLife: curvaTam, alphaOverLife: curvaAlfa, speedOverLife: curvaVel, turbulence: turb, pixel } = d;
  const paleta = pixel?.palette ? createPalette(pixel.palette) : null;
  // los parámetros de la forma, en su orden: el valor fijo y, si hay, la curva de formOverLife
  const parametrosForma = d.form
    ? Object.keys(/** @type {import('./form.js').Form} */ (getForm(d.form.type)).params).map((k) => ({
      valor: /** @type {import('./form.js').FormDef} */ (d.form).params[k], curva: d.formOverLife?.[k] ?? null,
    }))
    : [];

  let vivas = 0, tiempo = 0, reloj = 0, resto = 0, perdidas = 0;
  let emitiendo = false, pausada = false, porPrecalentar = false, ubicada = false;
  // dónde está el emisor: ahora y al principio del paso (para repartir los nacimientos en el camino)
  /** @type {Vec3} */ const pos = [0, 0, 0];
  /** @type {Vec3} */ const antes = [0, 0, 0];
  /** @type {Quat} */ const rot = [0, 0, 0, 1];
  // las fuerzas, en el espacio de la simulación (en 'local', giradas al del emisor)
  /** @type {Vec3} */ const g = [...d.gravity];
  /** @type {Vec3} */ const viento = [...d.wind];
  /** @type {Vec3} */ const p = [0, 0, 0];
  /** @type {Vec3} */ const dir = [0, 0, 0];
  /** @type {import('./color.js').RGB} */ const c = [0, 0, 0];

  /** La última viva pasa al lugar i (que murió). @param {number} i */
  function matar(i) {
    const j = --vivas;
    if (i === j) return;
    for (const k of /** @type {const} */ (['position', 'velocity', 'startColor'])) {
      const a = data[k];
      a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2];
    }
    for (const k of /** @type {const} */ (['age', 'life', 'startSize', 'rotation', 'spin', 'seed'])) data[k][i] = data[k][j];
  }

  /** Avanza las vivas h segundos: edad, fuerzas, posición y giro. @param {number} h */
  function mover(h) {
    if (h <= 0) return;
    const { position: P, velocity: V, age, life, rotation, spin } = data;
    const amort = d.drag > 0 ? Math.exp(-d.drag * h) : 1;
    const deriva = turb ? reloj * turb.speed : 0;
    for (let i = 0; i < vivas;) {
      age[i] += h;
      if (age[i] >= life[i]) { matar(i); continue; }
      const i3 = i * 3;
      let vx = V[i3] + g[0] * h, vy = V[i3 + 1] + g[1] * h, vz = V[i3 + 2] + g[2] * h;
      if (turb && turb.strength > 0) {
        const x = P[i3] / turb.scale + deriva, y = P[i3 + 1] / turb.scale + deriva, z = P[i3 + 2] / turb.scale + deriva;
        const f = turb.strength * h;
        vx += noise3(x, y, z, semilla) * f;
        vy += noise3(x + 31.4, y + 17.3, z + 5.9, semilla + 1) * f;
        vz += noise3(x + 7.7, y + 43.1, z + 23.2, semilla + 2) * f;
      }
      if (amort !== 1) {
        vx = viento[0] + (vx - viento[0]) * amort;
        vy = viento[1] + (vy - viento[1]) * amort;
        vz = viento[2] + (vz - viento[2]) * amort;
      }
      V[i3] = vx; V[i3 + 1] = vy; V[i3 + 2] = vz;
      const k = curvaVel ? sampleCurve(curvaVel, age[i] / life[i]) * h : h;
      P[i3] += vx * k; P[i3 + 1] += vy * k; P[i3 + 2] += vz * k;
      rotation[i] += spin[i] * h;
      i++;
    }
  }

  /**
   * Nace una partícula que ya tiene `edad` segundos, donde estaba el emisor en la fracción `f` del
   * paso (0: al principio, 1: al final).
   * @param {number} edad @param {number} f
   */
  function nacer(edad, f) {
    if (vivas >= N) { perdidas++; return; }
    const vida = d.life[0] + (d.life[1] - d.life[0]) * azar();
    sampleShape(d.shape, azar, p, dir);
    const rapidez = d.speed[0] + (d.speed[1] - d.speed[0]) * azar();
    const tam = d.size[0] + (d.size[1] - d.size[0]) * azar();
    const giro = (d.rotation[0] + (d.rotation[1] - d.rotation[0]) * azar()) * RAD;
    const vang = (d.angularVelocity[0] + (d.angularVelocity[1] - d.angularVelocity[0]) * azar()) * RAD;
    const tc = azar();
    const propia = azar();
    if (edad >= vida) return; // nació y murió dentro del mismo paso
    const i = vivas++, i3 = i * 3;
    let vx = dir[0] * rapidez, vy = dir[1] * rapidez, vz = dir[2] * rapidez;
    if (d.space === 'world') {
      girar(rot, p[0], p[1], p[2], p);
      girar(rot, vx, vy, vz, dir);
      vx = dir[0]; vy = dir[1]; vz = dir[2];
      for (let k = 0; k < 3; k++) p[k] += antes[k] + (pos[k] - antes[k]) * f;
    }
    // la parte del paso que ya vivió, con un solo paso de Euler
    vx += g[0] * edad; vy += g[1] * edad; vz += g[2] * edad;
    data.position[i3] = p[0] + vx * edad; data.position[i3 + 1] = p[1] + vy * edad; data.position[i3 + 2] = p[2] + vz * edad;
    data.velocity[i3] = vx; data.velocity[i3 + 1] = vy; data.velocity[i3 + 2] = vz;
    data.age[i] = edad; data.life[i] = vida;
    data.startSize[i] = tam;
    data.rotation[i] = giro + vang * edad; data.spin[i] = vang;
    for (let k = 0; k < 3; k++) data.startColor[i3 + k] = colorA[k] + (colorB[k] - colorA[k]) * tc;
    data.seed[i] = propia;
  }

  /**
   * Los nacimientos de h segundos de reloj: por `rate` y por las ráfagas, ciclo por ciclo.
   * @param {number} h @param {number} f0 @param {number} f1 la parte del paso que es este subpaso
   */
  function emitir(h, f0, f1) {
    let quedan = h;
    /** La fracción del paso en la que nace una que tiene `edad` al final del subpaso. @param {number} edad */
    const fraccion = (edad) => (h > 0 ? f1 - (edad / h) * (f1 - f0) : f1);
    while (quedan > 0 && emitiendo) {
      const seg = Math.min(quedan, d.duration - tiempo);
      const a = tiempo, b = tiempo + seg, despues = quedan - seg;
      if (d.rate > 0) {
        const total = resto + d.rate * seg;
        const n = Math.floor(total);
        for (let j = 0; j < n; j++) {
          const nace = a + (j + 1 - resto) / d.rate;
          const edad = Math.max(0, b - nace) + despues;
          nacer(edad, fraccion(edad));
        }
        resto = total - n;
      }
      for (const r of d.bursts) {
        for (let k = 0; k < r.cycles; k++) {
          const t = r.time + k * r.interval;
          if (t < a || t >= b) continue;
          const n = r.count[0] === r.count[1] ? r.count[0] : rnd.int(r.count[0], r.count[1]);
          const edad = b - t + despues;
          for (let j = 0; j < n; j++) nacer(edad, fraccion(edad));
        }
      }
      quedan = despues;
      tiempo = b;
      if (tiempo >= d.duration - 1e-9) {
        if (d.loop) tiempo = 0;
        else { emitiendo = false; tiempo = d.duration; }
      }
    }
  }

  /** Avanza dt segundos, en subpasos. @param {number} dt */
  function avanzar(dt) {
    const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP - 1e-9));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      mover(h);
      emitir(h, k / n, (k + 1) / n);
      reloj += h;
    }
  }

  /** Lo que se dibuja: tamaño, color con alfa, giro y cuadro, según la edad (con pixel, redondeados). */
  function dibujo() {
    const { age, life, startSize, startColor, seed: propia, size, color, rotation, angle, frame } = data;
    for (let i = 0; i < vivas; i++) {
      const t = age[i] / life[i];
      size[i] = curvaTam ? startSize[i] * sampleCurve(curvaTam, t) : startSize[i];
      angle[i] = rotation[i];
      if (pixel) {
        size[i] = pixelSize(size[i], pixel.pixelsPerUnit);
        angle[i] = stepAngle(rotation[i], pixel.rotation);
      }
      const i3 = i * 3, i4 = i * 4;
      if (curvaColor) {
        sampleLinearColor(curvaColor, t, c);
        color[i4] = startColor[i3] * c[0]; color[i4 + 1] = startColor[i3 + 1] * c[1]; color[i4 + 2] = startColor[i3 + 2] * c[2];
      } else {
        color[i4] = startColor[i3]; color[i4 + 1] = startColor[i3 + 1]; color[i4 + 2] = startColor[i3 + 2];
      }
      if (paleta) nearestColor(paleta, color, i4);
      color[i4 + 3] = curvaAlfa ? sampleCurve(curvaAlfa, t) : 1;
      frame[i] = flipbookFrame(d.texture, age[i], life[i], propia[i]);
      for (let k = 0; k < parametrosForma.length; k++) {
        const { valor, curva } = parametrosForma[k];
        data.form[i * 4 + k] = curva ? sampleCurve(curva, t) : valor;
      }
    }
  }

  /** Las fuerzas en el espacio de la simulación: en 'local', giradas al revés del emisor. */
  function fuerzas() {
    if (d.space !== 'local') return;
    /** @type {Quat} */ const inv = [-rot[0], -rot[1], -rot[2], rot[3]];
    girar(inv, d.gravity[0], d.gravity[1], d.gravity[2], g);
    girar(inv, d.wind[0], d.wind[1], d.wind[2], viento);
  }

  /**
   * Como si hubiera estado andando: un ciclo entero (o una vida, si es más larga), quieto donde está
   * el emisor. Se hace en el primer paso después de play(), cuando ya se sabe dónde está.
   */
  function precalentar() {
    const total = Math.max(d.duration, d.life[1]);
    antes[0] = pos[0]; antes[1] = pos[1]; antes[2] = pos[2];
    for (let t = 0; t < total - 1e-9; t += MAX_SUBSTEP) avanzar(Math.min(MAX_SUBSTEP, total - t));
  }

  /** Arranca a emitir desde el principio del ciclo (con prewarm, ya lleno). */
  function arrancar() {
    emitiendo = true;
    tiempo = 0;
    resto = 0;
    porPrecalentar = d.prewarm;
  }

  const sim = {
    /** La definición completa (defineEmitter). */
    def: d,
    /** El máximo de vivas (el largo de los arrays). */
    max: N,
    /** La semilla con que arrancó. */
    seed: semilla,
    /** Los arrays: las vivas son las primeras `alive`. */
    data,
    /** Cuántas hay vivas. */
    get alive() { return vivas; },
    /** En qué momento del ciclo va, en segundos (de 0 a duration). */
    get time() { return tiempo; },
    /** Cuánto tiempo simuló en total, en segundos (lo que usa la turbulencia). */
    get clock() { return reloj; },
    /** ¿Está emitiendo? (Sin loop, deja de emitir al terminar el ciclo.) */
    get emitting() { return emitiendo; },
    /** ¿Está en pausa? */
    get paused() { return pausada; },
    /** ¿Terminó? No emite más y no queda ninguna viva: un emisor de una vez se puede soltar. */
    get done() { return !emitiendo && vivas === 0; },
    /** Cuántas no nacieron porque ya había `max` vivas. */
    get dropped() { return perdidas; },

    /**
     * Avanza dt segundos. `position` y `rotation` ([x, y, z, w]) son los del emisor en el mundo:
     * en 'world' las nuevas nacen ahí; en 'local' la rotación lleva la gravedad y el viento al
     * espacio del emisor.
     * @param {number} dt @param {{ position?: ArrayLike<number>, rotation?: ArrayLike<number> }} [o]
     */
    step(dt, { position, rotation } = {}) {
      if (typeof dt !== 'number' || !(dt >= 0) || !Number.isFinite(dt)) throw new RangeError(`step(dt): dt va en segundos, ≥ 0 (vino ${dt})`);
      antes[0] = pos[0]; antes[1] = pos[1]; antes[2] = pos[2];
      if (position !== undefined) {
        const v = vector(position, 3, 'step: position');
        pos[0] = v[0]; pos[1] = v[1]; pos[2] = v[2];
        // la primera vez no viene de ningún lado: no reparte nacimientos desde el origen
        if (!ubicada) { antes[0] = v[0]; antes[1] = v[1]; antes[2] = v[2]; ubicada = true; }
      }
      if (rotation !== undefined) {
        const q = vector(rotation, 4, 'step: rotation');
        const l = Math.hypot(q[0], q[1], q[2], q[3]);
        if (!(l > 0)) throw new RangeError('step: rotation va un cuaternión [x, y, z, w] que no sea cero');
        rot[0] = q[0] / l; rot[1] = q[1] / l; rot[2] = q[2] / l; rot[3] = q[3] / l;
        fuerzas();
      }
      if (pausada) return sim;
      if (porPrecalentar) { porPrecalentar = false; precalentar(); }
      avanzar(Math.min(dt, MAX_DELTA));
      dibujo();
      return sim;
    },

    /** n partículas ya, donde está el emisor (cuentan para max). @param {number} n */
    burst(n) {
      if (!Number.isInteger(n) || n < 0) throw new RangeError(`burst(n): n va un entero ≥ 0 (vino ${n})`);
      antes[0] = pos[0]; antes[1] = pos[1]; antes[2] = pos[2];
      for (let i = 0; i < n; i++) nacer(0, 1);
      dibujo();
      return sim;
    },
    /** Arranca a emitir desde el principio del ciclo y saca la pausa; si ya emitía, sigue. */
    play() {
      pausada = false;
      if (!emitiendo) arrancar();
      return sim;
    },
    /** Deja de emitir: las vivas terminan su vida. */
    stop() { emitiendo = false; return sim; },
    /** Congela todo (step no avanza nada) hasta play(). */
    pause() { pausada = true; return sim; },
    /** Saca todas las vivas, ya (sigue emitiendo si emitía). */
    clear() { vivas = 0; return sim; },
  };
  if (autoplay) arrancar();
  return sim;
}

/** @typedef {ReturnType<typeof createSimulation>} Simulation */

/**
 * El orden para dibujar de atrás para adelante: los índices de las `count` primeras, de la más
 * lejana a la más cercana a `eye` (en el mismo espacio que las posiciones). Lo necesita el
 * blending normal; el aditivo no (sumar no depende del orden).
 * @param {Float32Array} positions @param {number} count @param {ArrayLike<number>} eye
 * @param {Uint32Array} [out] @param {Float32Array} [scratch] para no pedir memoria en cada cuadro
 * @returns {Uint32Array}
 */
export function sortByDepth(positions, count, eye, out = new Uint32Array(count), scratch = new Float32Array(count)) {
  const ex = eye[0], ey = eye[1], ez = eye[2];
  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3] - ex, dy = positions[i * 3 + 1] - ey, dz = positions[i * 3 + 2] - ez;
    scratch[i] = dx * dx + dy * dy + dz * dz;
    out[i] = i;
  }
  const orden = out.subarray(0, count);
  orden.sort((a, b) => scratch[b] - scratch[a]);
  return orden;
}
