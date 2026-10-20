// Las pruebas de la simulación, en Node: vida, rangos, ráfagas, que nunca haya más de max, el
// determinismo con la semilla, que un dt grande no rompa nada, y el espacio del mundo y el local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, sortByDepth, hexToLinear } from '../src/index.js';

/** n pasos de dt. */
const correr = (sim, n, dt = 1 / 60, o) => { for (let i = 0; i < n; i++) sim.step(dt, o); return sim; };
const cerca = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;

test('rate: nacen las que dice por segundo, y viven lo que dice life', () => {
  const sim = createSimulation({ rate: 30, life: 10 });
  correr(sim, 60);
  assert.equal(sim.alive, 30);
  const s2 = createSimulation({ rate: 30, life: 0.5 });
  correr(s2, 120);
  assert.ok(Math.abs(s2.alive - 15) <= 1, `en equilibrio: rate × life (${s2.alive})`);
  for (let i = 0; i < s2.alive; i++) assert.ok(s2.data.age[i] < s2.data.life[i]);
});

test('lo que nace al azar queda dentro de sus rangos', () => {
  const sim = createSimulation({
    rate: 500, max: 2000, life: [1, 2], speed: [2, 3], size: [0.1, 0.4], rotation: [10, 20], angularVelocity: [0, 0],
    color: ['#ff0000', '#0000ff'], shape: { type: 'sphere', radius: 1, emitFrom: 'surface' },
  });
  correr(sim, 30);
  const { life, velocity, startSize, rotation, startColor, seed } = sim.data;
  const rojo = hexToLinear('#ff0000');
  assert.ok(sim.alive > 200);
  for (let i = 0; i < sim.alive; i++) {
    assert.ok(life[i] >= 1 && life[i] <= 2, `life ${life[i]}`);
    const v = Math.hypot(velocity[i * 3], velocity[i * 3 + 1], velocity[i * 3 + 2]);
    assert.ok(v >= 2 - 1e-4 && v <= 3 + 1e-4, `speed ${v}`);
    assert.ok(startSize[i] >= 0.1 - 1e-6 && startSize[i] <= 0.4 + 1e-6);
    assert.ok(rotation[i] >= (10 * Math.PI) / 180 - 1e-6 && rotation[i] <= (20 * Math.PI) / 180 + 1e-6);
    // entre rojo y azul, en lineal: r + b = 1, sin verde
    assert.ok(cerca(startColor[i * 3] + startColor[i * 3 + 2], rojo[0], 1e-5) && startColor[i * 3 + 1] === 0);
    assert.ok(seed[i] >= 0 && seed[i] < 1);
  }
});

test('las curvas a lo largo de la vida: tamaño, color y alfa de lo que se dibuja', () => {
  const sim = createSimulation({
    rate: 0, life: 2, size: 2, color: '#ffffff',
    sizeOverLife: [1, 0], alphaOverLife: [[0, 0], [0.5, 1], [1, 1]], colorOverLife: ['#ffffff', '#000000'],
  });
  sim.burst(1);
  correr(sim, 30); // medio segundo: t = 0.25
  const { size, color, age } = sim.data;
  assert.ok(cerca(age[0], 0.5));
  assert.ok(cerca(size[0], 2 * 0.75));
  assert.ok(cerca(color[3], 0.5));
  assert.ok(cerca(color[0], 0.75), 'el color multiplica, en lineal');
});

test('ráfagas: a su tiempo, con sus ciclos, y otra vez en cada vuelta del loop', () => {
  const sim = createSimulation({ rate: 0, life: 100, max: 1000, duration: 1, loop: true, bursts: [{ time: 0, count: 10 }, { time: 0.5, count: 3, cycles: 3, interval: 0.1 }] });
  sim.step(1 / 60);
  assert.equal(sim.alive, 10, 'la de time 0 sale en el primer paso');
  correr(sim, 29);
  assert.equal(sim.alive, 10, 'justo antes de 0.5 s');
  correr(sim, 1); assert.equal(sim.alive, 13);
  correr(sim, 12); assert.equal(sim.alive, 19, 'los tres ciclos');
  correr(sim, 18); assert.equal(sim.alive, 29, 'segunda vuelta: la de time 0 otra vez');
  // un dt que se saltea varias ráfagas no pierde ninguna
  const s2 = createSimulation({ rate: 0, life: 100, max: 1000, duration: 1, loop: false, bursts: [{ time: 0.1, count: 1, cycles: 8, interval: 0.1 }] });
  s2.step(0.95);
  assert.equal(s2.alive, 8);
  // un rango de cantidad
  const s3 = createSimulation({ rate: 0, life: 100, max: 1000, bursts: [{ time: 0, count: [5, 9] }] });
  s3.step(0.01);
  assert.ok(s3.alive >= 5 && s3.alive <= 9);
});

test('sin loop deja de emitir al terminar el ciclo, y termina cuando mueren todas', () => {
  const sim = createSimulation({ rate: 100, life: 0.5, duration: 1, loop: false });
  correr(sim, 60);
  assert.equal(sim.emitting, false);
  assert.ok(sim.alive > 0 && !sim.done);
  correr(sim, 40);
  assert.equal(sim.alive, 0);
  assert.equal(sim.done, true);
});

test('nunca hay más de max, y las que no entran se cuentan', () => {
  const sim = createSimulation({ rate: 1000, life: 5, max: 50, bursts: [{ time: 0, count: 500 }] });
  for (let i = 0; i < 200; i++) {
    sim.step(1 / 60);
    assert.ok(sim.alive <= 50);
  }
  sim.burst(100);
  assert.equal(sim.alive, 50);
  assert.ok(sim.dropped > 0);
});

test('determinista: la misma semilla y los mismos dt dan lo mismo; otra semilla, otra cosa', () => {
  const def = { extends: 'magia', rate: 80 };
  const dts = Array.from({ length: 90 }, (_, i) => (i % 3 === 0 ? 1 / 30 : 1 / 90));
  const correrCon = (o) => { const s = createSimulation(def, o); for (const dt of dts) s.step(dt, { position: [1, 2, 3] }); return s; };
  const a = correrCon(), b = correrCon(), c = correrCon({ seed: 99 });
  assert.equal(a.alive, b.alive);
  assert.deepEqual(a.data.position.slice(0, a.alive * 3), b.data.position.slice(0, b.alive * 3));
  assert.deepEqual(a.data.color.slice(0, a.alive * 4), b.data.color.slice(0, b.alive * 4));
  assert.notDeepEqual(a.data.position.slice(0, 30), c.data.position.slice(0, 30));
});

test('un dt grande no rompe nada: nada infinito, nunca más de max', () => {
  for (const nombre of ['fuego', 'humo', 'chispas', 'polvo', 'lluvia', 'magia']) {
    const sim = createSimulation({ extends: nombre });
    for (const dt of [0, 1e-7, 0.5, 5, 1e6, 1 / 60]) {
      sim.step(dt, { position: [0, 5, 0] });
      assert.ok(sim.alive <= sim.max, nombre);
      for (let i = 0; i < sim.alive * 3; i++) assert.ok(Number.isFinite(sim.data.position[i]), `${nombre}: posición`);
      for (let i = 0; i < sim.alive * 4; i++) assert.ok(Number.isFinite(sim.data.color[i]), `${nombre}: color`);
    }
  }
  const sim = createSimulation({ rate: 10, life: 100, max: 10000 });
  sim.step(1e6);
  assert.equal(sim.alive, 10, 'más de 1 s cuenta como 1 s');
  assert.throws(() => sim.step(-1), /dt va en segundos/);
  assert.throws(() => sim.step(NaN), /dt va en segundos/);
});

test('fuerzas: la gravedad acelera, el drag frena, el viento arrastra', () => {
  const caer = createSimulation({ rate: 0, life: 10, speed: 0, gravity: [0, -10, 0] });
  caer.burst(1);
  correr(caer, 60);
  assert.ok(cerca(caer.data.velocity[1], -10, 1e-3));
  assert.ok(caer.data.position[1] < -4.5 && caer.data.position[1] > -5.5, `cayó ${caer.data.position[1]}`);
  const frenar = createSimulation({ rate: 0, life: 10, speed: 0, drag: 2, wind: [3, 0, 0] });
  frenar.burst(1);
  correr(frenar, 300);
  assert.ok(cerca(frenar.data.velocity[0], 3, 1e-2), 'con drag, va a la velocidad del viento');
  // el drag no depende del framerate
  const a = createSimulation({ rate: 0, life: 10, speed: 5, drag: 1, shape: { type: 'cone', angle: 0 } });
  const b = createSimulation({ rate: 0, life: 10, speed: 5, drag: 1, shape: { type: 'cone', angle: 0 } });
  a.burst(1); b.burst(1);
  correr(a, 60, 1 / 60); correr(b, 30, 1 / 30);
  assert.ok(cerca(a.data.velocity[1], b.data.velocity[1], 1e-4));
  // speedOverLife multiplica la velocidad al moverse
  const quieta = createSimulation({ rate: 0, life: 10, speed: 5, speedOverLife: 0 });
  quieta.burst(1);
  correr(quieta, 30);
  assert.deepEqual(Array.from(quieta.data.position.slice(0, 3)), [0, 0, 0]);
  // la turbulencia mueve, distinto en cada lugar
  const t = createSimulation({ rate: 0, life: 10, speed: 0, turbulence: { strength: 5, scale: 0.5 }, shape: { type: 'box', size: 4 } });
  t.burst(20);
  correr(t, 30);
  const vs = Array.from({ length: 20 }, (_, i) => t.data.velocity[i * 3]);
  assert.ok(vs.some((v) => Math.abs(v) > 0.01) && new Set(vs.map((v) => v.toFixed(4))).size > 10);
});

test("'world': nacen donde está el emisor, repartidas por su camino, y se quedan en el mundo", () => {
  const sim = createSimulation({ rate: 600, life: 10, speed: 0, max: 1000 });
  sim.step(1 / 60, { position: [10, 0, 0] });
  const n1 = sim.alive;
  for (let i = 0; i < n1; i++) assert.equal(sim.data.position[i * 3], 10, 'la primera vez, en su lugar (no viene del origen)');
  sim.step(1 / 60, { position: [20, 0, 0] });
  const xs = Array.from({ length: sim.alive - n1 }, (_, k) => sim.data.position[(n1 + k) * 3]);
  assert.ok(Math.min(...xs) > 10 && Math.max(...xs) <= 20 && new Set(xs).size > 5, 'repartidas por el camino');
  sim.step(1 / 60, { position: [-50, 0, 0] });
  assert.equal(sim.data.position[0], 10, 'las viejas no se mueven con el emisor');
  // la rotación del emisor gira la forma
  const cono = createSimulation({ rate: 0, life: 10, speed: 1, shape: { type: 'cone', angle: 0 } });
  const s = Math.SQRT1_2;
  cono.step(0, { rotation: [0, 0, -s, s] }); // −90° en z: +y pasa a +x
  cono.burst(1);
  assert.ok(cerca(cono.data.velocity[0], 1) && cerca(cono.data.velocity[1], 0));
});

test("'local': las posiciones son del emisor, y la gravedad del mundo se gira a su espacio", () => {
  const sim = createSimulation({ rate: 0, life: 10, speed: 0, space: 'local', gravity: [0, -1, 0] });
  sim.step(0, { position: [100, 0, 0], rotation: [0, 0, 1, 0] }); // dado vuelta (180° en z)
  sim.burst(1);
  assert.deepEqual(Array.from(sim.data.position.slice(0, 3)), [0, 0, 0]);
  correr(sim, 60, 1 / 60, { position: [200, 0, 0], rotation: [0, 0, 1, 0] });
  assert.ok(sim.data.velocity[1] > 0.99, 'para el emisor dado vuelta, la gravedad es +y');
  assert.ok(cerca(sim.data.position[0], 0));
});

test('play, stop, pause, clear y burst', () => {
  const sim = createSimulation({ rate: 60, life: 10 }, { autoplay: false });
  correr(sim, 30);
  assert.equal(sim.alive, 0);
  sim.play();
  correr(sim, 30);
  assert.equal(sim.alive, 30);
  sim.pause();
  const edad = sim.data.age[0];
  correr(sim, 30);
  assert.equal(sim.alive, 30);
  assert.equal(sim.data.age[0], edad, 'en pausa no envejecen');
  sim.play();
  correr(sim, 30);
  assert.equal(sim.alive, 60);
  sim.stop();
  correr(sim, 30);
  assert.equal(sim.alive, 60);
  sim.clear();
  assert.equal(sim.alive, 0);
  sim.burst(7);
  assert.equal(sim.alive, 7);
  assert.throws(() => sim.burst(-1), /burst/);
});

test('prewarm: arranca como si ya hubiera estado andando, donde está el emisor', () => {
  const sim = createSimulation({ rate: 20, life: 2, duration: 1, prewarm: true, speed: 0 });
  sim.step(1 / 60, { position: [5, 0, 0] });
  assert.ok(sim.alive >= 38, `lleno desde el primer paso (${sim.alive})`);
  for (let i = 0; i < sim.alive; i++) assert.equal(sim.data.position[i * 3], 5);
  const sin = createSimulation({ rate: 20, life: 2, duration: 1 });
  sin.step(1 / 60);
  assert.ok(sin.alive <= 1);
});

test('sortByDepth: de la más lejana a la más cercana', () => {
  const pos = new Float32Array([0, 0, 1, 0, 0, 5, 0, 0, 3, 0, 0, -2]);
  assert.deepEqual(Array.from(sortByDepth(pos, 4, [0, 0, 10])), [3, 0, 2, 1]);
  assert.deepEqual(Array.from(sortByDepth(pos, 2, [0, 0, 10])), [0, 1]);
});
