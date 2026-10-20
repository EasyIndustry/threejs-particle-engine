// threejs-particle-engine, la parte pura: la definición de un emisor como datos, su hash, los
// presets y la simulación en arrays tipados. Corre en Node y en el navegador. El dibujo (un
// InstancedBufferGeometry y un ShaderMaterial) está en adapters/three/particles.js.
export { defineEmitter, resolveEmitter, hashEmitter, stableStringify, EMITTER_DEFAULTS } from './emitter.js';
export { createSimulation, sortByDepth, MAX_SUBSTEP, MAX_DELTA } from './simulation.js';
export { PRESETS } from './presets.js';
export { SHAPES, normalizeShape, sampleShape } from './shapes.js';
export { normalizeCurve, sampleCurve, sampleColorCurve } from './curves.js';
export { normalizeFlipbook, flipbookFrame, frameUV, softCircle } from './flipbook.js';
export { PIXEL_DEFAULTS, PIXEL_FADES, BAYER_4, normalizePixel, pixelSize, stepAngle, createPalette, nearestColor } from './pixel.js';
export { MAX_FORM_PARAMS, FORM_NOISE_GLSL, registerForm, getForm, listForms, normalizeForm, formSignature, formGLSL } from './form.js';
export { ALIGN_TYPES, normalizeAlign, planeBasis } from './align.js';
export { createRandom } from './random.js';
export { noise3 } from './noise.js';
export { isHexColor, hexToLinear, linearToHex } from './color.js';
export { help, memberNames } from './help.js';
export { ENGINE_MEMBERS, EMITTER_MEMBERS } from './members.js';
