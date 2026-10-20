// Las pruebas del pixel art, en Node: la sección `pixel` de la definición (atajos, errores, extends,
// hash) y que lo que se dibuja salga redondeado — tamaño en píxeles enteros, giro de a pasos, color
// de la paleta —, sin tocar lo que se simula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defineEmitter, hashEmitter, createSimulation, hexToLinear,
  PIXEL_DEFAULTS, BAYER_4, normalizePixel, pixelSize, stepAngle, createPalette, nearestColor,
} from '../src/index.js';

const correr = (sim, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) sim.step(dt); return sim; };
const cerca = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;

test('pixel: null por defecto; true son los valores por defecto; lo que no se pasa, también', () => {
  assert.equal(defineEmitter({}).pixel, null);
  assert.equal(defineEmitter({ pixel: false }).pixel, null);
  assert.deepEqual(defineEmitter({ pixel: true }).pixel, { ...PIXEL_DEFAULTS });
  assert.deepEqual(defineEmitter({ pixel: { pixelsPerUnit: 32 } }).pixel, { ...PIXEL_DEFAULTS, pixelsPerUnit: 32 });
  assert.equal(defineEmitter({ pixel: { rotation: null } }).pixel?.rotation, null, 'null: giro libre');
  assert.deepEqual(defineEmitter({ pixel: { palette: ['#FFF', '#ff8c1a'] } }).pixel?.palette, ['#ffffff', '#ff8c1a']);
});

test('pixel: un error dice dónde', () => {
  assert.throws(() => defineEmitter({ pixel: { ppu: 16 } }), /emitter\.pixel\.ppu: clave desconocida/);
  assert.throws(() => defineEmitter({ pixel: { pixelsPerUnit: 0 } }), /emitter\.pixel\.pixelsPerUnit: va un número mayor que 0/);
  assert.throws(() => defineEmitter({ pixel: { fade: 'suave' } }), /emitter\.pixel\.fade/);
  assert.throws(() => defineEmitter({ pixel: { snap: 'sí' } }), /emitter\.pixel\.snap/);
  assert.throws(() => defineEmitter({ pixel: { palette: [] } }), /emitter\.pixel\.palette/);
  assert.throws(() => defineEmitter({ pixel: { palette: ['#fff', 'rojo'] } }), /emitter\.pixel\.palette\[1\]/);
  assert.throws(() => defineEmitter({ pixel: { rotation: 400 } }), /emitter\.pixel\.rotation/);
  assert.throws(() => defineEmitter({ pixel: 16 }), /emitter\.pixel: va true, null o/);
});

test('pixel: se guarda en JSON y vuelve igual, entra en el hash y extends lo pisa por clave', () => {
  const d = defineEmitter({ extends: 'chispas', pixel: { palette: ['#ffffff', '#ffe066'], fade: 'cutout' } });
  assert.deepEqual(defineEmitter(JSON.parse(JSON.stringify(d))), d);
  assert.notEqual(hashEmitter({ extends: 'chispas' }), hashEmitter({ extends: 'chispas', pixel: true }));
  assert.equal(hashEmitter({ extends: 'chispas', pixel: true }), hashEmitter({ extends: 'chispas', pixel: { ...PIXEL_DEFAULTS } }));
  const base = { extends: 'humo', pixel: { pixelsPerUnit: 8, fade: 'cutout' } };
  const hijo = defineEmitter({ extends: base, pixel: { snap: false } });
  assert.equal(hijo.pixel?.pixelsPerUnit, 8);
  assert.equal(hijo.pixel?.fade, 'cutout');
  assert.equal(hijo.pixel?.snap, false);
  assert.equal(defineEmitter({ extends: base, pixel: null }).pixel, null, 'null saca la sección');
});

test('pixelSize: píxeles enteros del arte; menos de medio píxel es 0', () => {
  assert.equal(pixelSize(0.5, 16), 0.5);
  assert.equal(pixelSize(0.47, 16), 0.5);       // 7.52 px → 8
  assert.equal(pixelSize(0.45, 16), 7 / 16);    // 7.2 px → 7
  assert.equal(pixelSize(0.02, 16), 0);         // 0.32 px → nada
});

test('stepAngle: de a pasos; 0 es sin giro y null, libre', () => {
  const g = Math.PI / 180;
  assert.ok(cerca(stepAngle(100 * g, 90), 90 * g));
  assert.ok(cerca(stepAngle(-50 * g, 90), -90 * g));
  assert.ok(cerca(stepAngle(30 * g, 45), 45 * g));
  assert.equal(stepAngle(1.234, 0), 0);
  assert.equal(stepAngle(1.234, null), 1.234);
});

test('la paleta: cada color al más cercano, en lineal, y los oscuros no se confunden', () => {
  const p = createPalette(['#000000', '#202020', '#ffffff', '#ff0000']);
  const c = new Float32Array(hexToLinear('#1c1c1c'));
  assert.equal(nearestColor(p, c), 1, 'un gris muy oscuro va al #202020, no al negro');
  assert.deepEqual([...c], [...new Float32Array(hexToLinear('#202020'))]);
  const otro = new Float32Array(4);
  assert.equal(nearestColor(p, otro, 0, hexToLinear('#e01010')), 3);
});

test('BAYER_4: los 16 umbrales, todos distintos, entre 0 y 1', () => {
  assert.equal(BAYER_4.length, 16);
  assert.equal(new Set(BAYER_4).size, 16);
  for (const x of BAYER_4) assert.ok(x > 0 && x < 1);
});

test('la simulación con pixel: tamaño en píxeles, giro de a 90° y colores de la paleta; lo simulado no cambia', () => {
  const paleta = ['#ffffff', '#ffe066', '#ff8c1a', '#c0392b'];
  const def = {
    rate: 200, max: 500, life: [0.5, 1], size: [0.1, 0.6], rotation: [0, 360], angularVelocity: [-200, 200],
    color: ['#ffd000', '#ff2000'], colorOverLife: ['#ffffff', '#802010'], sizeOverLife: [1, 0.2],
  };
  const sim = correr(createSimulation({ ...def, pixel: { pixelsPerUnit: 16, palette: paleta } }), 40);
  const libre = correr(createSimulation(def), 40);
  const lineales = paleta.map(hexToLinear);
  const g90 = Math.PI / 2;
  assert.ok(sim.alive > 50);
  assert.equal(sim.alive, libre.alive, 'nace y muere lo mismo');
  for (let i = 0; i < sim.alive; i++) {
    const px = sim.data.size[i] * 16;
    assert.ok(cerca(px, Math.round(px)), `tamaño ${px} px`);
    assert.ok(cerca(sim.data.angle[i] / g90, Math.round(sim.data.angle[i] / g90)), `giro ${sim.data.angle[i]}`);
    const rgb = [0, 1, 2].map((k) => sim.data.color[i * 4 + k]);
    assert.ok(lineales.some((l) => l.every((v, k) => cerca(v, rgb[k]))), `color ${rgb}`);
    // lo simulado es lo mismo que sin pixel
    assert.equal(sim.data.position[i * 3], libre.data.position[i * 3]);
    assert.equal(sim.data.rotation[i], libre.data.rotation[i]);
  }
  // sin pixel, el giro que se dibuja es el simulado
  for (let i = 0; i < libre.alive; i++) assert.equal(libre.data.angle[i], libre.data.rotation[i]);
});

test('el adaptador: los defines de pixel art y la misma matriz de Bayer que el núcleo', async () => {
  const s = await readFile(new URL('../adapters/three/particles.js', import.meta.url), 'utf8');
  for (const k of ['PIXEL', 'PIXEL_SNAP', 'FADE_DITHER', 'FADE_CUTOUT']) assert.match(s, new RegExp(`#ifdef ${k}|defined\\(${k}\\)`), k);
  assert.match(s, /BAYER_4\.map/, 'la matriz del shader sale de src/pixel.js');
  assert.match(s, /\bangle\b[^;]*= sim\.data/, 'dibuja el giro redondeado (angle), no el simulado');
});
