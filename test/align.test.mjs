// Las pruebas de la orientación (align), en Node: los atajos, los errores que dicen dónde, extends,
// JSON, la base del plano, y que el hash de un emisor no cambie por claves nuevas que no usa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defineEmitter, hashEmitter, normalizeAlign, planeBasis } from '../src/index.js';

const cerca = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('align: null y camera miran a la cámara; los atajos dan siempre la misma forma', () => {
  assert.equal(defineEmitter({}).align, null);
  assert.equal(defineEmitter({ align: 'camera' }).align, null);
  assert.deepEqual(defineEmitter({ align: 'velocity' }).align, { type: 'velocity', stretch: 0.05 });
  assert.deepEqual(defineEmitter({ align: { type: 'velocity', stretch: 0.2 } }).align, { type: 'velocity', stretch: 0.2 });
  assert.deepEqual(defineEmitter({ align: 'plane' }).align, { type: 'plane', normal: [0, 1, 0] });
  assert.deepEqual(defineEmitter({ align: { type: 'plane', normal: [0, 0, 3] } }).align, { type: 'plane', normal: [0, 0, 1] }, 'la normal, unitaria');
});

test('align: un error dice dónde', () => {
  assert.throws(() => defineEmitter({ align: 'hacia-arriba' }), /emitter\.align\.type: va 'camera', 'velocity', 'plane'/);
  assert.throws(() => defineEmitter({ align: { type: 'velocity', normal: [0, 1, 0] } }), /emitter\.align\.normal: clave desconocida con type 'velocity' \(van type, stretch\)/);
  assert.throws(() => defineEmitter({ align: { type: 'velocity', stretch: -1 } }), /emitter\.align\.stretch: va un número ≥ 0/);
  assert.throws(() => defineEmitter({ align: { type: 'plane', normal: [0, 0, 0] } }), /emitter\.align\.normal: va un vector que no sea cero/);
  assert.throws(() => defineEmitter({ align: { type: 'plane', normal: [0, 1] } }), /emitter\.align\.normal: va \[x, y, z\]/);
  assert.throws(() => normalizeAlign(5), /emitter\.align: va 'camera'/);
});

test('align: vuelve igual por JSON, entra en el hash y extends la pisa por clave (salvo otro tipo)', () => {
  const d = defineEmitter({ extends: 'chispas', align: { type: 'velocity', stretch: 0.1 } });
  assert.deepEqual(defineEmitter(JSON.parse(JSON.stringify(d))), d);
  assert.notEqual(hashEmitter({ extends: 'chispas' }), hashEmitter(d));
  const base = { extends: 'chispas', align: { type: 'velocity', stretch: 0.1 } };
  assert.deepEqual(defineEmitter({ extends: base, align: { stretch: 0.3 } }).align, { type: 'velocity', stretch: 0.3 });
  assert.deepEqual(defineEmitter({ extends: base, align: { type: 'plane' } }).align, { type: 'plane', normal: [0, 1, 0] });
  assert.equal(defineEmitter({ extends: base, align: null }).align, null);
});

test('planeBasis: u y v unitarios, perpendiculares entre sí y a la normal, con u × v = n', () => {
  const normales = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [1, 0, 0], [0.3, 0.8, -0.5], [-1, 1, 1], [0.0001, 1, 0]];
  for (const m of normales) {
    const l = Math.hypot(...m);
    const n = m.map((x) => x / l);
    const [u, v] = planeBasis(n);
    assert.ok(cerca(punto(u, u), 1) && cerca(punto(v, v), 1), `unitarios para ${m}`);
    assert.ok(cerca(punto(u, v), 0) && cerca(punto(u, n), 0) && cerca(punto(v, n), 0), `perpendiculares para ${m}`);
    cruz(u, v).forEach((x, i) => assert.ok(cerca(x, n[i]), `u × v = n para ${m}`));
  }
  // en el piso, "arriba" del arte es −z; en una pared que mira a +z, es +y
  assert.deepEqual(planeBasis([0, 1, 0]).map((e) => e.map((x) => x + 0)), [[1, 0, 0], [0, 0, -1]]);
  assert.deepEqual(planeBasis([0, 0, 1]).map((e) => e.map((x) => x + 0)), [[1, 0, 0], [0, 1, 0]]);
});

test('el hash de un emisor que no usa las claves nuevas (pixel, form, align) es el de la 0.1.0-rc.1', () => {
  // calculados con el código de la 0.1.0-rc.1 (cc174ef)
  assert.equal(hashEmitter({}), '18ohdlo0gv6');
  assert.equal(hashEmitter({ extends: 'humo' }), '14oxpkjng4q');
  assert.equal(hashEmitter({ extends: 'fuego' }), '24k37sa3o85');
  assert.notEqual(hashEmitter({ extends: 'humo', pixel: true }), '14oxpkjng4q');
});

test('el adaptador: los defines de la orientación, la velocidad por instancia y el plano de dos caras', async () => {
  const s = await readFile(new URL('../adapters/three/particles.js', import.meta.url), 'utf8');
  for (const k of ['ALIGN_VELOCITY', 'ALIGN_PLANE']) assert.match(s, new RegExp(`#ifdef ${k}\\b`), k);
  assert.match(s, /setAttribute\('iVelocity'/);
  assert.match(s, /planeBasis\(d\.align\.normal\)/, 'la base sale del núcleo');
  assert.match(s, /DoubleSide/);
});
