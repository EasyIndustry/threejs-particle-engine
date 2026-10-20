// El flipbook: una hoja en grilla con la animación de la partícula por cuadros (humo que se
// enrosca, una chispa que titila, un puñado de escombros distintos), y el círculo suave que se
// usa cuando el emisor no trae textura.
//
// La grilla es la misma que la de threejs-sprite-engine (se comparte el formato, no el código):
// los cuadros van en orden de lectura — de izquierda a derecha y de arriba abajo — y `count`
// dice cuántos se usan si la última fila no está llena. Acá la hoja se mide en cuadros
// (`frames: [columnas, filas]`), no en píxeles: la textura de una partícula puede ser de
// cualquier tamaño.
//
// Cuál cuadro muestra cada partícula:
//   - con `random`, cada una elige uno al nacer y se queda con él (o arranca de ahí si hay fps);
//   - con `fps`, la animación corre a esa velocidad desde que nace, en bucle;
//   - sin fps, la hoja entera dura la vida de la partícula (el primer cuadro al nacer, el último
//     al morir).
//
// Puro: no importa three ni DOM.

/** @typedef {{ frames: [number, number], count: number, fps: number, random: boolean, filter: 'linear' | 'nearest' }} Flipbook */

const CLAVES = ['frames', 'count', 'fps', 'random', 'filter'];
const FILTROS = ['linear', 'nearest'];

/**
 * El flipbook normalizado (sin textura: una hoja de un cuadro).
 * @param {unknown} v @param {string} que @returns {Flipbook}
 */
export function normalizeFlipbook(v, que = 'emitter.texture') {
  if (v === undefined || v === null) return { frames: [1, 1], count: 1, fps: 0, random: false, filter: 'linear' };
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${que}: va { frames: [columnas, filas], count?, fps?, random?, filter? }`);
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of Object.keys(o)) if (!CLAVES.includes(k)) throw new Error(`${que}.${k}: clave desconocida (van ${CLAVES.join(', ')})`);
  /** @type {[number, number]} */
  let frames = [1, 1];
  if (o.frames !== undefined) {
    const f = o.frames;
    if (!Array.isArray(f) || f.length !== 2) throw new TypeError(`${que}.frames: va [columnas, filas]`);
    f.forEach((x, i) => { if (!Number.isInteger(x) || x < 1 || x > 256) throw new RangeError(`${que}.frames[${i}]: va un entero de 1 a 256 (vino ${JSON.stringify(x)})`); });
    frames = [f[0], f[1]];
  }
  const total = frames[0] * frames[1];
  const count = o.count === undefined ? total : o.count;
  if (!Number.isInteger(count) || /** @type {number} */ (count) < 1 || /** @type {number} */ (count) > total) throw new RangeError(`${que}.count: va un entero de 1 a ${total} (columnas × filas)`);
  const fps = o.fps === undefined ? 0 : o.fps;
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 0) throw new RangeError(`${que}.fps: va un número ≥ 0 (0: la hoja dura la vida de la partícula)`);
  if (o.random !== undefined && typeof o.random !== 'boolean') throw new TypeError(`${que}.random: va true o false`);
  const filter = o.filter ?? 'linear';
  if (!FILTROS.includes(/** @type {string} */ (filter))) throw new Error(`${que}.filter: va ${FILTROS.map((x) => `'${x}'`).join(' o ')} ('nearest' para pixel art)`);
  return { frames, count: /** @type {number} */ (count), fps, random: !!o.random, filter: /** @type {Flipbook['filter']} */ (filter) };
}

/**
 * El cuadro de una partícula: con su edad, su vida y su azar propio (de 0 a 1, fijo desde que nace).
 * @param {Flipbook} fb @param {number} age @param {number} life @param {number} seed
 */
export function flipbookFrame(fb, age, life, seed) {
  const n = fb.count;
  if (n === 1) return 0;
  const inicio = fb.random ? Math.min(n - 1, Math.floor(seed * n)) : 0;
  if (fb.fps > 0) return (inicio + Math.floor(age * fb.fps)) % n;
  if (fb.random) return inicio;
  return Math.min(n - 1, Math.max(0, Math.floor((age / life) * n)));
}

/**
 * El rectángulo UV de un cuadro: [u0, v0, u1, v1]. En three la v va para arriba (v = 1 es la fila
 * de arriba de la imagen), así que el cuadro 0 (arriba a la izquierda) tiene v de 1 − 1/filas a 1.
 * El shader del adaptador hace la misma cuenta.
 * @param {number} frame @param {[number, number]} frames [columnas, filas]
 * @returns {[number, number, number, number]}
 */
export function frameUV(frame, [cols, rows]) {
  const col = frame % cols, row = Math.floor(frame / cols);
  return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
}

/**
 * El círculo suave por defecto: blanco, con el alfa que cae del centro al borde. `softness` 0 es un
 * disco de borde duro y 1, un degradé desde el centro. RGBA de 8 bits, fila por fila.
 * @param {number} size el lado, en píxeles @param {number} softness de 0 a 1
 * @returns {Uint8Array}
 */
export function softCircle(size, softness) {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('softCircle: el lado va un entero ≥ 2');
  const px = new Uint8Array(size * size * 4);
  // el borde: de 1 − softness (opaco) a 1 (transparente), en radios; un poco de borde siempre, para
  // que el disco duro no se vea serruchado
  const ancho = Math.max(softness, 2 / size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(dx, dy);
      const a = Math.min(1, Math.max(0, (1 - r) / ancho));
      const i = (y * size + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
    }
  }
  return px;
}
