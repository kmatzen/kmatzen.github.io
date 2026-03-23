/** Vertex shader: NDC quad */
export const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** Shared GLSL helpers: cmul, cdiv, in_unit_square, display_to_source_uv. */
const GLSL_HELPERS = `
vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
  float d = dot(b, b);
  if (d < 1e-20) return vec2(1e10);
  return vec2(
    (a.x * b.x + a.y * b.y) / d,
    (a.y * b.x - a.x * b.y) / d
  );
}

bool in_unit_square(vec2 z) {
  return z.x >= 0.0 && z.x <= 1.0 && z.y >= 0.0 && z.y <= 1.0;
}

/** Wind outward (S forward) then inward (S inverse). */
vec2 display_to_source_uv(vec2 w) {
  vec2 z = w;
  for (int i = 0; i < MAX_DEPTH; i++) {
    if (in_unit_square(z)) break;
    z = u_center + cmul(u_a, z);
  }
  for (int i = 0; i < MAX_DEPTH; i++) {
    vec2 rel = z - u_center;
    vec2 inner = cdiv(rel, u_a);
    if (in_unit_square(inner)) {
      z = inner;
    } else {
      break;
    }
  }
  return z;
}
`;

/**
 * Fragment shader: exponential map of panel 3.
 */
export const FRAG_DROSTE_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform vec2 u_polarOrigin;
uniform vec2 u_center;
uniform vec2 u_a;
uniform vec2 u_alpha;
uniform vec2 u_viewCenter;
uniform float u_viewScale;
uniform float u_period;
uniform float u_lnPeriod;

const int MAX_DEPTH = 48;
const float TAU = 6.283185307179586;

${GLSL_HELPERS}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 pos = frag / u_resolution;

  // Pan / zoom
  pos = (pos - u_viewCenter) * u_viewScale + vec2(0.5);

  // Polar relative to origin
  vec2 rel = pos - u_polarOrigin;
  float r = length(rel);
  if (r < 1e-10) {
    outColor = vec4(0.06, 0.06, 0.08, 1.0);
    return;
  }
  float theta = atan(rel.y, rel.x);

  // Treat output log-polar as ζ′ directly (panel 3 coordinates); ζ = (ln r, θ) in natural units
  vec2 zp = vec2(log(r), theta);

  // First tiling: wrap ζ′.θ to [0, 2π) so exp() maps to a single-valued annulus.
  // This is needed because the output polar coordinates can span arbitrary angles.
  zp.y = zp.y - u_period * floor(zp.y / u_period);

  // Invert α once: ζ = ζ′/α → source log-polar coordinates
  vec2 zeta = cdiv(zp, u_alpha);

  // Second tiling: wrap ζ into the fundamental domain of the recursive similarity.
  // θ tiles with period 2π (one full angular turn), ln(r) tiles with period ln(1/|a|)
  // (one recursion level). Together these ensure every point maps into the source.
  zeta.y = zeta.y - TAU * floor(zeta.y / TAU);
  zeta.x = zeta.x - u_lnPeriod * floor(zeta.x / u_lnPeriod);

  float r_out = exp(zeta.x);
  float theta_out = zeta.y;
  vec2 w = u_polarOrigin + vec2(r_out * cos(theta_out), r_out * sin(theta_out));

  vec2 uv = display_to_source_uv(w);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.06, 0.06, 0.08, 1.0);
    return;
  }

  outColor = texture(u_tex, uv);
}
`;

/**
 * Polar view: x = ln(r), y = θ. Axes span the same ζ-space range for isotropic display.
 */
export const FRAG_LOG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform vec2 u_polarOrigin;
uniform vec2 u_center;
uniform vec2 u_a;
uniform float u_rMin;
uniform float u_rMax;
uniform float u_thetaMin;
uniform float u_thetaMax;

const int MAX_DEPTH = 48;

${GLSL_HELPERS}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float nx = frag.x / u_resolution.x;
  float ny = frag.y / u_resolution.y;

  float r = exp(mix(log(u_rMin), log(u_rMax), nx));
  float theta = mix(u_thetaMin, u_thetaMax, ny);

  vec2 w = u_polarOrigin + vec2(r * cos(theta), r * sin(theta));

  vec2 uv = display_to_source_uv(w);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.06, 0.06, 0.08, 1.0);
    return;
  }

  outColor = texture(u_tex, uv);
}
`;

/**
 * ζ′ = α·ζ view. Viewport is an axis-aligned rectangle in ζ′ space.
 */
export const FRAG_LOG_ALIGNED_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform vec2 u_polarOrigin;
uniform vec2 u_center;
uniform vec2 u_a;
uniform vec2 u_alpha;
uniform vec2 u_zetaA;
uniform vec2 u_zetaEdgeU;
uniform vec2 u_zetaEdgeV;
uniform float u_lnPeriod;

const int MAX_DEPTH = 48;
const float TAU = 6.283185307179586;

${GLSL_HELPERS}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float nx = frag.x / u_resolution.x;
  float ny = frag.y / u_resolution.y;

  vec2 zeta_prime = u_zetaA + nx * u_zetaEdgeU + ny * u_zetaEdgeV;
  vec2 zeta = cdiv(zeta_prime, u_alpha);

  // Tile ζ so it always maps to the fundamental domain
  zeta.y = zeta.y - TAU * floor(zeta.y / TAU);                      // θ period = 2π
  zeta.x = zeta.x - u_lnPeriod * floor(zeta.x / u_lnPeriod);       // ln(r) period

  float ln_r = zeta.x;
  float theta = zeta.y;
  float r = exp(ln_r);
  vec2 w = u_polarOrigin + vec2(r * cos(theta), r * sin(theta));

  vec2 uv = display_to_source_uv(w);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.06, 0.06, 0.08, 1.0);
    return;
  }

  outColor = texture(u_tex, uv);
}
`;
