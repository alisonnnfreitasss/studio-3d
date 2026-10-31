// Depth of field as one gather pass (after Dennis Gustafsson, "Bokeh depth of field in a single pass"):
// each pixel walks a golden-angle spiral out to the largest blur and takes a sample only if that
// sample's own blur disc reaches back to the pixel. A sample behind the pixel is capped at the pixel's
// own blur, so a sharp part never smears onto the wall behind it and the wall never haloes onto the
// part (the stock pmndrs DepthOfFieldEffect left pink outlines at those edges). No noise, no history:
// the same frame always gives the same pixels.
import { Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";

const frag = /* glsl */ `
uniform float focusZ;   // distance to the focus point along the view (world units)
uniform float band;     // sharp zone, as |1 - focusZ / z| (0.12 = about +-13% of the distance)
uniform float gain;     // how fast the blur grows outside the band
uniform float maxBlur;  // largest blur radius, in buffer pixels
uniform float radScale; // spiral step: smaller = more samples

float blurPx(const in float z) {
  float u = abs(1.0 - focusZ / max(z, 1e-3));
  float k = max(u - band, 0.0) / (1.0 - band);
  return clamp(k * gain, 0.0, 1.0) * maxBlur;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float zc = -getViewZ(depth);
  float bc = blurPx(zc);
  vec3 col = texture2D(inputBuffer, uv).rgb;
  float tot = 1.0;
  float radius = radScale;
  float ang = 0.0;
  for (int i = 0; i < 1024; i++) {
    if (radius >= maxBlur) break;
    vec2 suv = uv + vec2(cos(ang), sin(ang)) * texelSize * radius;
    vec3 sc = texture2D(inputBuffer, suv).rgb;
    float zs = -getViewZ(readDepth(suv));
    float bs = blurPx(zs);
    if (zs > zc) bs = min(bs, bc * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, bs);
    col += mix(col / tot, sc, m);
    tot += 1.0;
    ang += 2.39996323;
    radius += radScale / radius;
  }
  outputColor = vec4(col / tot, inputColor.a);
}
`;

export class GatherDOF extends Effect {
  constructor({ maxBlur = 8, band = 0.12, gain = 2.4, radScale = 0.9 } = {}) {
    super("GatherDOF", frag, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ["focusZ", new Uniform(10)],
        ["band", new Uniform(band)],
        ["gain", new Uniform(gain)],
        ["maxBlur", new Uniform(maxBlur)],
        ["radScale", new Uniform(radScale)],
      ]),
    });
  }
  set focusZ(v) { this.uniforms.get("focusZ").value = v; }
}

// HDR clamp, its own pass before AO, depth of field and bloom. A smooth window or lacquer lit by a
// point light makes a specular peak in the thousands; tone mapping alone clips it to a small dot, but
// bloom and the DOF gather spread it into a white disc. Clamping first keeps fire and flashes (a few
// units) blooming while single hot pixels stay small. max() also flushes NaN on most GPUs.
const clampFrag = /* glsl */ `
uniform float maxValue;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  float peak = max(c.r, max(c.g, c.b));
  outputColor = vec4(peak > maxValue ? c * (maxValue / peak) : c, inputColor.a);
}
`;

export class HdrClamp extends Effect {
  constructor({ maxValue = 8 } = {}) {
    super("HdrClamp", clampFrag, { uniforms: new Map([["maxValue", new Uniform(maxValue)]]) });
  }
}

// The grade a frame asks for, per view (env.grey, env.dim): after tone mapping, before the saturation,
// contrast and vignette. grey 0..1 mixes toward the luma (a rewind or a flashback runs in greyscale);
// dim 0..1 darkens the frame toward a cool night (1 keeps about 55% of the light with a blue cast; up to
// 2 goes darker), for a storm or a night the sky presets alone leave too bright. Both 0 = no change.
const gradeFrag = /* glsl */ `
uniform float gradeGrey;
uniform float gradeDim;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), clamp(gradeGrey, 0.0, 1.0));
  c *= max(mix(vec3(1.0), vec3(0.5, 0.56, 0.72), gradeDim), vec3(0.0));
  outputColor = vec4(c, inputColor.a);
}
`;

export class Grade extends Effect {
  constructor() {
    super("Grade", gradeFrag, { uniforms: new Map([["gradeGrey", new Uniform(0)], ["gradeDim", new Uniform(0)]]) });
  }
  set(grey = 0, dim = 0) {
    this.uniforms.get("gradeGrey").value = Math.min(1, Math.max(0, grey));
    this.uniforms.get("gradeDim").value = Math.min(2, Math.max(0, dim));
  }
}
