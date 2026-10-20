// Las pruebas de la definición como datos: atajos, errores que dicen dónde, extends, presets,
// hash, curvas, formas y flipbook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineEmitter, hashEmitter, EMITTER_DEFAULTS, PRESETS, normalizeCurve, sampleCurve, sampleColorCurve,
  normalizeShape, sampleShape, SHAPES, normalizeFlipbook, flipbookFrame, frameUV, softCircle, createRandom,
  hexToLinear, linearToHex, noise3,
} from '../src/index.js';

test('defineEmitter: sin nada, los valores por defecto, con la forma completa', () => {
  const d = defineEmitter({});
  assert.deepEqual(Object.keys(d).sort(), Object.keys(EMITTER_DEFAULTS).sort());
  assert.deepEqual(d.life, [1, 1]);
  assert.deepEqual(d.color, ['#ffffff', '#ffffff']);
  assert.deepEqual(d.shape, { type: 'point' });
  assert.deepEqual(d.texture, { frames: [1, 1], count: 1, fps: 0, random: false, filter: 'linear' });
  assert.equal(d.sizeOverLife, null);
  assert.equal(d.turbulence, null);
});

test('defineEmitter: los atajos dan siempre la misma forma', () => {
  const d = defineEmitter({
    size: [0.1, 0.3], speed: 2, color: '#F80', shape: 'sphere',
    bursts: [{ time: 0.5, count: 10 }], sizeOverLife: [1, 0], alphaOverLife: 0.5,
    colorOverLife: ['#fff', '#000', '#f00'], turbulence: { strength: 2 },
  });
  assert.deepEqual(d.size, [0.1, 0.3]);
  assert.deepEqual(d.speed, [2, 2]);
  assert.deepEqual(d.color, ['#ff8800', '#ff8800']);
  assert.deepEqual(d.shape, { type: 'sphere', radius: 1, emitFrom: 'volume' });
  assert.deepEqual(d.bursts, [{ time: 0.5, count: [10, 10], cycles: 1, interval: 0 }]);
  assert.deepEqual(d.sizeOverLife, [[0, 1], [1, 0]]);
  assert.deepEqual(d.alphaOverLife, [[0, 0.5], [1, 0.5]]);
  assert.deepEqual(d.colorOverLife, [[0, '#ffffff'], [0.5, '#000000'], [1, '#ff0000']]);
  assert.deepEqual(d.turbulence, { strength: 2, scale: 1, speed: 0.5 });
  assert.deepEqual(defineEmitter({ shape: { type: 'sphere', surface: true } }).shape.emitFrom, 'surface');
  assert.deepEqual(defineEmitter({ shape: { type: 'box', size: 2 } }).shape.size, [2, 2, 2]);
});

test('defineEmitter: lo normalizado se puede volver a pasar (y guardar en JSON) y da lo mismo', () => {
  for (const nombre of Object.keys(PRESETS)) {
    const d = defineEmitter({ extends: nombre });
    assert.deepEqual(defineEmitter(JSON.parse(JSON.stringify(d))), d, nombre);
  }
  const d = defineEmitter({ shape: { type: 'cone', angle: 20 }, bursts: [{ time: 0, count: [2, 5], cycles: 3, interval: 0.5 }], texture: { frames: [4, 2], count: 7, fps: 10 } });
  assert.deepEqual(defineEmitter(JSON.parse(JSON.stringify(d))), d);
});

test('defineEmitter: un error dice dónde está', () => {
  const mal = (def, re) => assert.throws(() => defineEmitter(def), re);
  mal({ colour: '#fff' }, /clave desconocida: colour/);
  mal({ size: [0.5, 'x'] }, /emitter\.size\[1\]: va un número/);
  mal({ size: [0.5, 0.1] }, /emitter\.size: va \[min, max\] con min ≤ max/);
  mal({ size: -1 }, /emitter\.size/);
  mal({ life: 0 }, /emitter\.life: va mayor que 0/);
  mal({ max: 2.5 }, /emitter\.max: va un entero/);
  mal({ max: 0 }, /emitter\.max/);
  mal({ color: 'rojo' }, /emitter\.color: va un color/);
  mal({ color: ['#fff', 3] }, /emitter\.color\[1\]/);
  mal({ shape: 'cilindro' }, /emitter\.shape\.type: forma desconocida/);
  mal({ shape: { type: 'cone', radio: 1 } }, /emitter\.shape\.radio: clave desconocida para cone/);
  mal({ shape: { type: 'cone', angle: 120 } }, /emitter\.shape\.angle: va un número de 0 a 90/);
  mal({ shape: { type: 'disk', emitFrom: 'surface' } }, /emitter\.shape\.emitFrom: disk va 'volume' o 'edge'/);
  mal({ shape: { type: 'point', emitFrom: 'edge' } }, /emitter\.shape\.emitFrom: clave desconocida/);
  mal({ shape: { type: 'sphere', surface: true, emitFrom: 'volume' } }, /surface y emitFrom dicen cosas distintas/);
  mal({ shape: { type: 'ring', radius: 1, width: 2 } }, /emitter\.shape\.width/);
  mal({ bursts: [{ time: 0 }] }, /emitter\.bursts\[0\]\.count: falta/);
  mal({ bursts: [{ count: 5, cycles: 3 }] }, /emitter\.bursts\[0\]\.interval: con cycles > 1/);
  mal({ bursts: [{ count: 5, cuando: 1 }] }, /emitter\.bursts\[0\]\.cuando: clave desconocida/);
  mal({ duration: 1, bursts: [{ count: 5, time: 0.5, cycles: 3, interval: 0.3 }] }, /emitter\.bursts\[0\]: la última ráfaga \(a los 1\.1 s\) cae fuera del ciclo/);
  mal({ sizeOverLife: [[0, 1], [0.5]] }, /emitter\.sizeOverLife\[1\]: va un keyframe/);
  mal({ sizeOverLife: [[0.5, 1], [0.2, 2]] }, /emitter\.sizeOverLife\[1\]\[0\]: los keyframes van en orden/);
  mal({ alphaOverLife: [[0, 2]] }, /emitter\.alphaOverLife\[0\]\[1\]: va de 0 a 1/);
  mal({ colorOverLife: ['#fff', 1] }, /emitter\.colorOverLife\[1\]: va un color/);
  mal({ wind: [1, 0, 0] }, /emitter\.wind: .*va con drag > 0/);
  mal({ gravity: [0, -9.8] }, /emitter\.gravity: va \[x, y, z\]/);
  mal({ turbulence: { strength: 1, scale: 0 } }, /emitter\.turbulence\.scale/);
  mal({ turbulence: { fuerza: 1 } }, /emitter\.turbulence\.fuerza: clave desconocida/);
  mal({ space: 'mundo' }, /emitter\.space: va 'world' o 'local'/);
  mal({ blending: 'multiply' }, /emitter\.blending/);
  mal({ prewarm: true, loop: false }, /emitter\.prewarm: va con loop: true/);
  mal({ texture: { frames: [4, 0] } }, /emitter\.texture\.frames\[1\]/);
  mal({ texture: { frames: [2, 2], count: 5 } }, /emitter\.texture\.count: va un entero de 1 a 4/);
  mal({ texture: { filter: 'bilinear' } }, /emitter\.texture\.filter: va 'linear' o 'nearest'/);
  mal({ softness: 2 }, /emitter\.softness: va de 0 a 1/);
  mal({ seed: 1.5 }, /emitter\.seed: va un entero/);
  mal({ duration: 0 }, /emitter\.duration/);
  mal({ extends: 'niebla' }, /emitter\.extends: preset desconocido niebla/);
  assert.throws(() => defineEmitter(null), /va como un objeto/);
});

test('extends: parte de un preset (o de otra definición) y pisa lo que se pasa', () => {
  const d = defineEmitter({ extends: 'humo', rate: 40 });
  assert.equal(d.rate, 40);
  assert.equal(d.name, 'humo');
  assert.deepEqual(d.life, [3, 5]);
  // la forma, la textura y la turbulencia se pisan por clave
  const r = defineEmitter({ extends: 'humo', shape: { radius: 1 }, turbulence: { strength: 2 } });
  assert.deepEqual(r.shape, { type: 'cone', angle: 14, radius: 1, emitFrom: 'volume' });
  assert.deepEqual(r.turbulence, { strength: 2, scale: 1.5, speed: 0.4 });
  // otra forma: no mezcla las claves de la otra
  assert.deepEqual(defineEmitter({ extends: 'humo', shape: { type: 'box', size: 2 } }).shape, { type: 'box', size: [2, 2, 2], emitFrom: 'volume' });
  // null saca
  assert.equal(defineEmitter({ extends: 'humo', turbulence: null }).turbulence, null);
  // de otra definición, en cadena
  const mio = { extends: 'chispas', rate: 5 };
  assert.equal(defineEmitter({ extends: mio, size: 1 }).rate, 5);
  assert.deepEqual(defineEmitter({ extends: mio }).gravity, [0, -9.8, 0]);
  // el preset no cambia
  assert.equal(PRESETS.humo.rate, 10);
  assert.throws(() => { /** @type {any} */ (PRESETS.humo).rate = 1; }, TypeError);
});

test('los presets: todos los pedidos, válidos y con el nombre que se usa en extends', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['chispas', 'fuego', 'humo', 'lluvia', 'magia', 'polvo']);
  for (const [nombre, p] of Object.entries(PRESETS)) {
    const d = defineEmitter({ extends: nombre });
    assert.equal(d.name, nombre);
    assert.deepEqual(d, defineEmitter(structuredClone(p)), nombre);
  }
});

test('hashEmitter: igual definición escrita distinto da igual; un cambio da otro', () => {
  const a = { rate: 10, size: 0.2, color: '#FFF', shape: { radius: 1, type: 'sphere' } };
  const b = { shape: { type: 'sphere', radius: 1, emitFrom: 'volume' }, color: ['#ffffff', '#ffffff'], size: [0.2, 0.2], rate: 10 };
  assert.equal(hashEmitter(a), hashEmitter(b));
  assert.notEqual(hashEmitter(a), hashEmitter({ ...a, rate: 11 }));
  assert.equal(hashEmitter({ extends: 'humo' }), hashEmitter(JSON.parse(JSON.stringify(defineEmitter({ extends: 'humo' })))));
  assert.notEqual(hashEmitter(a), hashEmitter(a, 'v2'));
});

test('curvas: atajos, keyframes e interpolación lineal (colores en lineal)', () => {
  assert.deepEqual(normalizeCurve([1, 2, 0], 'c', 'number'), [[0, 1], [0.5, 2], [1, 0]]);
  assert.equal(normalizeCurve(undefined, 'c', 'number'), null);
  const c = normalizeCurve([[0.2, 1], [0.6, 3]], 'c', 'number');
  assert.equal(sampleCurve(c, 0), 1); // antes del primero, el primero
  assert.equal(sampleCurve(c, 0.4), 2);
  assert.equal(sampleCurve(c, 1), 3); // después del último, el último
  // dos keyframes en el mismo t: un salto
  const salto = normalizeCurve([[0, 0], [0.5, 0], [0.5, 1], [1, 1]], 'c', 'number');
  assert.equal(sampleCurve(salto, 0.49), 0);
  assert.equal(sampleCurve(salto, 0.51), 1);
  // los colores se interpolan en lineal: negro y blanco al 50 % no es #808080
  const g = sampleColorCurve(normalizeCurve(['#000000', '#ffffff'], 'c', 'color'), 0.5);
  assert.ok(Math.abs(g[0] - 0.5) < 1e-9);
  assert.equal(linearToHex(g), '#bcbcbc');
  assert.equal(linearToHex(hexToLinear('#c3341f')), '#c3341f');
});

test('formas: cada una nace donde dice y sale para donde dice', () => {
  const r = createRandom(7);
  const p = [0, 0, 0], d = [0, 0, 0];
  const largo = (v) => Math.hypot(...v);
  for (let i = 0; i < 500; i++) {
    sampleShape(normalizeShape({ type: 'sphere', radius: 2, emitFrom: 'surface' }), r.next, p, d);
    assert.ok(Math.abs(largo(p) - 2) < 1e-9 && Math.abs(largo(d) - 1) < 1e-9);
    assert.ok(Math.abs(p[0] / 2 - d[0]) < 1e-9, 'hacia afuera');
    sampleShape(normalizeShape({ type: 'sphere', radius: 2 }), r.next, p, d);
    assert.ok(largo(p) <= 2 + 1e-9);
    sampleShape(normalizeShape({ type: 'box', size: [2, 4, 6], emitFrom: 'surface' }), r.next, p, d);
    assert.ok([Math.abs(p[0]) === 1, Math.abs(p[1]) === 2, Math.abs(p[2]) === 3].some(Boolean), 'en una cara');
    assert.deepEqual(d, [0, 1, 0]);
    sampleShape(normalizeShape({ type: 'cone', angle: 30 }), r.next, p, d);
    assert.deepEqual(p, [0, 0, 0]);
    assert.ok(d[1] >= Math.cos(Math.PI / 6) - 1e-9 && Math.abs(largo(d) - 1) < 1e-9, 'dentro del cono');
    sampleShape(normalizeShape({ type: 'cone', angle: 30, radius: 1, emitFrom: 'edge' }), r.next, p, d);
    assert.ok(Math.abs(Math.hypot(p[0], p[2]) - 1) < 1e-9 && Math.abs(d[1] - Math.cos(Math.PI / 6)) < 1e-9, 'el borde sale con el ángulo entero');
    sampleShape(normalizeShape({ type: 'disk', radius: 3, emitFrom: 'edge' }), r.next, p, d);
    assert.ok(Math.abs(Math.hypot(p[0], p[2]) - 3) < 1e-9 && p[1] === 0);
    sampleShape(normalizeShape({ type: 'ring', radius: 2, width: 0.5 }), r.next, p, d);
    const rr = Math.hypot(p[0], p[2]);
    assert.ok(rr >= 1.5 - 1e-9 && rr <= 2 + 1e-9 && d[1] === 0 && Math.abs(p[0] / rr - d[0]) < 1e-9);
    sampleShape(normalizeShape('point'), r.next, p, d);
    assert.ok(largo(p) === 0 && Math.abs(largo(d) - 1) < 1e-9);
  }
  assert.deepEqual(Object.keys(SHAPES).sort(), ['box', 'cone', 'disk', 'point', 'ring', 'sphere']);
});

test('flipbook: el cuadro según la edad, fps o azar, y su UV con la v para arriba', () => {
  const vida = normalizeFlipbook({ frames: [4, 4] });
  assert.equal(flipbookFrame(vida, 0, 2, 0.5), 0);
  assert.equal(flipbookFrame(vida, 1, 2, 0.5), 8);
  assert.equal(flipbookFrame(vida, 1.999, 2, 0.5), 15);
  const fps = normalizeFlipbook({ frames: [2, 2], count: 3, fps: 10 });
  assert.deepEqual([0, 0.1, 0.2, 0.3, 0.4].map((t) => flipbookFrame(fps, t + 1e-6, 5, 0)), [0, 1, 2, 0, 1]);
  const azar = normalizeFlipbook({ frames: [4, 1], random: true });
  assert.equal(flipbookFrame(azar, 0, 1, 0.6), 2);
  assert.equal(flipbookFrame(azar, 0.9, 1, 0.6), 2, 'se queda con el que eligió');
  assert.equal(flipbookFrame(normalizeFlipbook(undefined), 0.5, 1, 0.3), 0);
  // el cuadro 0 es el de arriba a la izquierda: en three, v de 0.75 a 1
  assert.deepEqual(frameUV(0, [4, 4]), [0, 0.75, 0.25, 1]);
  assert.deepEqual(frameUV(5, [4, 4]), [0.25, 0.5, 0.5, 0.75]);
  assert.deepEqual(frameUV(0, [1, 1]), [0, 0, 1, 1]);
});

test('el círculo suave: opaco en el centro, transparente en las esquinas, con el borde que pide softness', () => {
  const alfa = (px, n, x, y) => px[(y * n + x) * 4 + 3];
  const duro = softCircle(32, 0), suave = softCircle(32, 1);
  assert.equal(alfa(duro, 32, 16, 16), 255);
  assert.equal(alfa(duro, 32, 0, 0), 0);
  assert.equal(alfa(duro, 32, 16, 4), 255, 'duro: opaco casi hasta el borde');
  assert.ok(alfa(suave, 32, 16, 4) < 128, 'suave: ya se desvanece');
  assert.equal(suave[0], 255, 'blanco: el color lo pone la partícula');
});

test('el azar y el ruido: deterministas con la semilla', () => {
  const a = createRandom(42), b = createRandom(42), c = createRandom(43);
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(Array.from({ length: 5 }, () => b.next()), xs);
  assert.notDeepEqual(Array.from({ length: 5 }, () => c.next()), xs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  assert.equal(noise3(1.3, 2.7, -0.4, 5), noise3(1.3, 2.7, -0.4, 5));
  assert.notEqual(noise3(1.3, 2.7, -0.4, 5), noise3(1.3, 2.7, -0.4, 6));
  for (let i = 0; i < 200; i++) { const n = noise3(i * 0.37, i * 0.11, i * 0.53); assert.ok(n >= -1 && n <= 1); }
  // suave: dos puntos cerca dan valores cerca
  assert.ok(Math.abs(noise3(0.5, 0.5, 0.5) - noise3(0.501, 0.5, 0.5)) < 0.01);
});
