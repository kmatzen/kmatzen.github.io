/** Vertex shader: NDC quad */
export const VERT_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** Complex math helpers */
const GLSL_COMPLEX = `
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
`;

/** Similarity recursion: S(z) = c + a·z */
const GLSL_RECURSE = `
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
 * Procedural scene: city with building facade, windows, frame recursion.
 * All coordinates use y-down convention (y=0 top, y=1 bottom) matching Canvas 2D.
 */
const GLSL_SCENE = `
// Scene layout uniforms (change with K slider)
uniform float u_sceneCropSize;   // 1/K
uniform vec2  u_sceneCropOffset; // crop origin in scene [0,1]²
uniform vec2  u_sceneBBPos;      // billboard position in scene [0,1]²
uniform float u_sceneBBSize;     // billboard size (square)

// --- Scene constants ---
const vec3 CLOUD_DATA[7] = vec3[7](
  vec3(0.12, 0.08, 0.04), vec3(0.16, 0.06, 0.03), vec3(0.09, 0.07, 0.025),
  vec3(0.60, 0.10, 0.035), vec3(0.64, 0.08, 0.025),
  vec3(0.85, 0.05, 0.03), vec3(0.88, 0.04, 0.02)
);

const vec3 BG_BLDG[10] = vec3[10]( // x, width, height
  vec3(0.00, 0.10, 0.30), vec3(0.10, 0.08, 0.22), vec3(0.18, 0.12, 0.35),
  vec3(0.30, 0.07, 0.20), vec3(0.37, 0.09, 0.28), vec3(0.55, 0.10, 0.32),
  vec3(0.65, 0.08, 0.18), vec3(0.73, 0.12, 0.38), vec3(0.85, 0.07, 0.24),
  vec3(0.92, 0.09, 0.30)
);

const vec3 BG_WALL[10] = vec3[10](
  vec3(0.541, 0.439, 0.376), vec3(0.627, 0.565, 0.541), vec3(0.439, 0.502, 0.627),
  vec3(0.690, 0.596, 0.471), vec3(0.565, 0.596, 0.502), vec3(0.627, 0.533, 0.471),
  vec3(0.533, 0.596, 0.659), vec3(0.439, 0.408, 0.408), vec3(0.596, 0.627, 0.533),
  vec3(0.533, 0.471, 0.533)
);

const vec3 BG_WIN[10] = vec3[10](
  vec3(0.416, 0.333, 0.271), vec3(0.471, 0.439, 0.439), vec3(0.314, 0.376, 0.502),
  vec3(0.565, 0.471, 0.345), vec3(0.439, 0.471, 0.376), vec3(0.502, 0.408, 0.345),
  vec3(0.408, 0.471, 0.533), vec3(0.314, 0.282, 0.282), vec3(0.471, 0.502, 0.408),
  vec3(0.408, 0.345, 0.408)
);

const float TREE_X[4] = float[4](0.15, 0.42, 0.58, 0.87);
const float LAMP_X[2] = float[2](0.05, 0.95);

const vec2 CAR_POS[4] = vec2[4](
  vec2(0.08, 0.56), vec2(0.32, 0.56), vec2(0.70, 0.56), vec2(0.90, 0.56)
);
const vec3 CAR_COL[4] = vec3[4](
  vec3(0.545, 0.125, 0.125), vec3(0.125, 0.314, 0.627),
  vec3(0.125, 0.502, 0.251), vec3(0.627)
);

// --- Window variety interiors ---
vec3 windowVariety(int variety, vec2 lv, int idx) {
  float h = fract(sin(float(idx) * 127.1) * 43758.5453);
  vec3 col = mix(vec3(0.22, 0.25, 0.32), vec3(0.32, 0.25, 0.18), h);

  if (variety == 0) {
    // Curtains drawn back
    if (lv.x < 0.18 || lv.x > 0.82)
      col = mix(col, vec3(0.706, 0.235, 0.235), 0.5);
  } else if (variety == 1) {
    // Warm lamp glow
    float d = length(lv - vec2(0.5, 0.4));
    col += vec3(1.0, 0.784, 0.392) * 0.4 * smoothstep(0.4, 0.0, d);
    if (lv.y >= 0.25 && lv.y <= 0.4 &&
        lv.x >= mix(0.4, 0.35, (lv.y - 0.25) / 0.15) &&
        lv.x <= mix(0.6, 0.65, (lv.y - 0.25) / 0.15))
      col = mix(col, vec3(1.0, 0.863, 0.588), 0.6);
  } else if (variety == 2) {
    // Cat silhouette
    float body = length((lv - vec2(0.5, 0.85)) * vec2(1.5, 1.0));
    float head = length(lv - vec2(0.62, 0.75));
    if (body < 0.12 || head < 0.06) col = mix(col, vec3(0.0), 0.6);
  } else if (variety == 3) {
    // Potted plant
    if (lv.x >= 0.38 && lv.x <= 0.62 && lv.y >= 0.78 && lv.y <= 0.93)
      col = vec3(0.416, 0.251, 0.188);
    float ml = min(min(length(lv - vec2(0.42, 0.68)), length(lv - vec2(0.55, 0.62))),
                   min(length(lv - vec2(0.50, 0.72)), length(lv - vec2(0.60, 0.70))));
    if (ml < 0.07) col = vec3(0.165, 0.478, 0.188);
  } else if (variety == 4) {
    // Bookshelf
    if (lv.x > 0.15 && lv.x < 0.85 && lv.y > 0.2 && lv.y < 0.9) {
      col = vec3(0.416, 0.314, 0.251);
      float shelfY = fract((lv.y - 0.2) / 0.175);
      if (shelfY < 0.1) {
        col = vec3(0.478, 0.376, 0.314);
      } else {
        float bh = fract(sin(floor(lv.x * 10.0 + float(idx) * 0.7) * 127.1
          + floor((lv.y - 0.2) / 0.175) * 311.7) * 43758.5453);
        col = mix(vec3(0.2), vec3(bh, fract(bh * 7.13), fract(bh * 13.71)), 0.7);
      }
    }
  } else if (variety == 5) {
    // TV glow
    if (lv.x >= 0.2 && lv.x <= 0.8 && lv.y >= 0.3 && lv.y <= 0.65)
      col = vec3(0.102, 0.102, 0.165);
    col += vec3(0.392, 0.549, 0.784) * 0.25 * smoothstep(0.5, 0.0, length(lv - vec2(0.5)));
  } else if (variety == 6) {
    // Pendant light
    if (abs(lv.x - 0.5) < 0.003 && lv.y < 0.3)
      col = mix(col, vec3(0.784), 0.4);
    if (length(lv - vec2(0.5, 0.33)) < 0.08)
      col = mix(col, vec3(1.0, 0.902, 0.706), 0.5);
  } else if (variety == 7) {
    // Half curtain
    if (lv.x < 0.35) col = mix(col, vec3(0.235, 0.314, 0.549), 0.45);
    else col += vec3(1.0, 0.784, 0.471) * 0.15;
  } else if (variety == 8) {
    // Person silhouette
    if (length(lv - vec2(0.45, 0.35)) < 0.07) col = mix(col, vec3(0.0), 0.45);
    if (length((lv - vec2(0.45, 0.6)) * vec2(1.0, 0.5)) < 0.1) col = mix(col, vec3(0.0), 0.45);
  } else if (variety == 9) {
    // Venetian blinds
    float blind = fract((lv.y - 0.05) / 0.08);
    if (blind < 0.35) col = mix(col, vec3(0.784, 0.784, 0.745), 0.35);
  } else if (variety == 10) {
    // Candles
    for (int c = 0; c < 3; c++) {
      float cx = 0.3 + float(c) * 0.2;
      if (abs(lv.x - cx) < 0.015 && lv.y >= 0.65 && lv.y <= 0.85)
        col = vec3(0.910, 0.863, 0.753);
      if (length(lv - vec2(cx, 0.62)) < 0.02)
        col = vec3(1.0, 0.784, 0.196);
    }
    col += vec3(1.0, 0.706, 0.314) * 0.2 * smoothstep(0.4, 0.0, length(lv - vec2(0.5, 0.65)));
  } else {
    // Plain with reflection
    if (lv.x >= 0.1 && lv.x <= 0.4 && lv.y >= 0.1 && lv.y <= 0.5)
      col += vec3(0.706, 0.784, 0.863) * 0.12;
  }

  return col;
}

// --- Main scene drawing function ---
// p in [0,1]², y-down (y=0 = top/sky, y=1 = bottom/street)
vec3 drawScene(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0)
    return vec3(0.06, 0.06, 0.08);

  vec3 col;

  // === Sky / Ground ===
  if (p.y < 0.45) {
    float t = p.y / 0.45;
    col = mix(vec3(0.227, 0.376, 0.565), vec3(0.478, 0.690, 0.847), smoothstep(0.0, 0.6, t));
    col = mix(col, vec3(0.784, 0.863, 0.910), smoothstep(0.6, 1.0, t));
    // Clouds
    for (int i = 0; i < 7; i++) {
      float d = length(p - CLOUD_DATA[i].xy);
      col = mix(col, vec3(1.0), 0.5 * smoothstep(CLOUD_DATA[i].z, CLOUD_DATA[i].z * 0.5, d));
    }
  } else {
    col = vec3(0.376); // street
    if (p.y < 0.51) col = vec3(0.565, 0.565, 0.533); // sidewalk
    // Road markings
    if (abs(p.y - 0.65) < 0.002) {
      if (fract(p.x / 0.05) < 0.6) col = vec3(0.753, 0.753, 0.251);
    }
  }

  // === Background buildings ===
  for (int i = 0; i < 10; i++) {
    vec3 b = BG_BLDG[i];
    float bTop = 0.45 - b.z;
    if (p.x >= b.x && p.x < b.x + b.y && p.y >= bTop && p.y < 0.45) {
      col = BG_WALL[i];
      // Window grid
      float winW = b.y * 0.2;
      int rows = int(b.z / 0.05);
      for (int r = 1; r < 10; r++) {
        if (r >= rows) break;
        for (int c = 0; c < 2; c++) {
          float wx = b.x + b.y * (0.2 + float(c) * 0.45);
          float wy = bTop + float(r) * 0.045;
          if (p.x >= wx && p.x < wx + winW && p.y >= wy && p.y < wy + 0.025)
            col = BG_WIN[i];
        }
      }
    }
  }

  // === Building facade ===
  float winPad = u_sceneBBSize * 0.08;
  vec2 winSz = vec2(u_sceneBBSize + winPad * 2.0);
  vec2 spacing = winSz * 1.5;
  vec2 frameCtr = u_sceneBBPos + vec2(u_sceneBBSize * 0.5);
  vec2 gridOrig = frameCtr - vec2(3.0, 2.0) * spacing;

  float bp = spacing.x * 0.4;
  float bldgX = gridOrig.x - winSz.x * 0.5 - bp;
  float bldgY = gridOrig.y - winSz.y * 0.5 - bp * 1.5;
  float bldgW = 6.0 * spacing.x + winSz.x + bp * 2.0;
  float bldgH = 0.45 - bldgY;

  if (p.x >= bldgX && p.x < bldgX + bldgW && p.y >= bldgY && p.y < bldgY + bldgH) {
    col = vec3(0.722, 0.659, 0.596); // facade wall
    // Brick lines
    if (fract((p.y - bldgY) / 0.006) < 0.15) col *= 0.94;

    // Window grid
    vec2 gridRel = p - gridOrig;
    vec2 cell = floor(gridRel / spacing + vec2(0.5));
    int ci = int(cell.x);
    int ri = int(cell.y);

    if (ci >= 0 && ci < 7 && ri >= 0 && ri < 5) {
      vec2 winCtr = gridOrig + cell * spacing;
      vec2 winMin = winCtr - winSz * 0.5;

      if (p.x >= winMin.x && p.x < winMin.x + winSz.x &&
          p.y >= winMin.y && p.y < winMin.y + winSz.y &&
          winMin.y + winSz.y <= bldgY + bldgH) {
        vec2 luv = (p - winMin) / winSz;
        int winIdx = ri * 7 + ci;
        bool isFrame = (ci == 3 && ri == 2);

        if (isFrame) {
          // Frame window: interior wall
          col = vec3(0.910, 0.878, 0.816);
          if (luv.y < 0.04) col -= vec3(0.08);
          if (luv.x < 0.03) col -= vec3(0.08);
          // Picture frame border
          float fp = u_sceneBBSize * 0.03;
          if (p.x >= u_sceneBBPos.x - fp && p.x < u_sceneBBPos.x + u_sceneBBSize + fp &&
              p.y >= u_sceneBBPos.y - fp && p.y < u_sceneBBPos.y + u_sceneBBSize + fp) {
            if (p.x < u_sceneBBPos.x || p.x >= u_sceneBBPos.x + u_sceneBBSize ||
                p.y < u_sceneBBPos.y || p.y >= u_sceneBBPos.y + u_sceneBBSize) {
              col = vec3(0.353, 0.251, 0.188); // frame border
            }
            // else: inside billboard — interior wall (recursion fallback at max depth)
          }
        } else {
          // Regular window
          int variety = winIdx - (winIdx / 12) * 12;
          col = windowVariety(variety, luv, winIdx);
        }

        // Window frame outline
        float edge = min(min(luv.x, 1.0 - luv.x), min(luv.y, 1.0 - luv.y));
        if (edge < 0.015) col = mix(col, vec3(0.910, 0.878, 0.847), 0.7);

        // Window sill (at bottom of window)
        if (luv.y > 0.97) col = vec3(0.816, 0.784, 0.722);
      }
    }
  }

  // === Street details (drawn on top) ===
  // Lamp posts
  for (int i = 0; i < 2; i++) {
    float lx = LAMP_X[i];
    if (abs(p.x - lx) < 0.004 && p.y >= 0.25 && p.y < 0.47)
      col = vec3(0.251);
    if (length(p - vec2(lx, 0.25)) < 0.015)
      col = vec3(0.910, 0.847, 0.376);
  }

  // Trees
  for (int i = 0; i < 4; i++) {
    float tx = TREE_X[i];
    if (abs(p.x - tx) < 0.005 && p.y >= 0.38 && p.y < 0.46)
      col = vec3(0.290, 0.208, 0.125);
    if (length(p - vec2(tx, 0.36)) < 0.03)
      col = vec3(0.165, 0.408, 0.157);
    if (length(p - vec2(tx + 0.01, 0.37)) < 0.022)
      col = vec3(0.227, 0.471, 0.220);
  }

  // Cars
  for (int i = 0; i < 4; i++) {
    vec2 cp = CAR_POS[i];
    if (p.x >= cp.x && p.x < cp.x + 0.06 && p.y >= cp.y && p.y < cp.y + 0.025) {
      col = CAR_COL[i];
      if (p.x >= cp.x + 0.015 && p.x < cp.x + 0.03 && p.y >= cp.y + 0.003 && p.y < cp.y + 0.015)
        col = vec3(0.627, 0.753, 0.816);
    }
    if (length(p - vec2(cp.x + 0.012, cp.y + 0.025)) < 0.006 ||
        length(p - vec2(cp.x + 0.048, cp.y + 0.025)) < 0.006)
      col = vec3(0.133);
  }

  return col;
}

// --- Entry point: source UV → scene color with frame recursion ---
vec4 sceneColor(vec2 suv) {
  // Map GL source UV (y-up) to scene UV (y-down)
  vec2 scUV = u_sceneCropOffset + vec2(suv.x, 1.0 - suv.y) * u_sceneCropSize;

  // Frame recursion: if inside billboard, remap to full scene [0,1]²
  for (int i = 0; i < 8; i++) {
    vec2 rel = (scUV - u_sceneBBPos) / u_sceneBBSize;
    if (rel.x >= 0.0 && rel.x <= 1.0 && rel.y >= 0.0 && rel.y <= 1.0) {
      scUV = rel;
    } else {
      break;
    }
  }

  return vec4(drawScene(scUV), 1.0);
}
`;

/**
 * Fragment shader: source preview (panel 1).
 * Just renders sceneColor directly — no coordinate transforms.
 */
export const FRAG_SOURCE_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;

${GLSL_SCENE}

void main() {
  outColor = sceneColor(v_uv);
}
`;

/**
 * Fragment shader: exponential map (Droste effect, panel 4).
 */
export const FRAG_DROSTE_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform vec2 u_polarOrigin;
uniform vec2 u_center;
uniform vec2 u_a;
uniform vec2 u_alpha;
uniform vec2 u_viewCenter;
uniform float u_viewScale;
uniform float u_period;
uniform float u_lnPeriod;
uniform float u_holeRadius;

const int MAX_DEPTH = 48;
const float TAU = 6.283185307179586;

${GLSL_COMPLEX}
${GLSL_RECURSE}
${GLSL_SCENE}

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

  // Blank circle in the center (like Escher's original)
  if (u_holeRadius > 0.0 && r < u_holeRadius) {
    outColor = vec4(0.92, 0.90, 0.85, 1.0);
    return;
  }
  float theta = atan(rel.y, rel.x);

  vec2 zp = vec2(log(r), theta);
  zp.y = zp.y - u_period * floor(zp.y / u_period);

  vec2 zeta = cdiv(zp, u_alpha);
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

  outColor = sceneColor(uv);
}
`;

/**
 * Polar view: x = ln(r), y = θ (panel 2).
 */
export const FRAG_LOG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform vec2 u_polarOrigin;
uniform vec2 u_center;
uniform vec2 u_a;
uniform float u_rMin;
uniform float u_rMax;
uniform float u_thetaMin;
uniform float u_thetaMax;

const int MAX_DEPTH = 48;

${GLSL_COMPLEX}
${GLSL_RECURSE}
${GLSL_SCENE}

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

  outColor = sceneColor(uv);
}
`;

/**
 * ζ′ = α·ζ view (panel 3).
 */
export const FRAG_LOG_ALIGNED_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

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

${GLSL_COMPLEX}
${GLSL_RECURSE}
${GLSL_SCENE}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float nx = frag.x / u_resolution.x;
  float ny = frag.y / u_resolution.y;

  vec2 zeta_prime = u_zetaA + nx * u_zetaEdgeU + ny * u_zetaEdgeV;
  vec2 zeta = cdiv(zeta_prime, u_alpha);

  zeta.y = zeta.y - TAU * floor(zeta.y / TAU);
  zeta.x = zeta.x - u_lnPeriod * floor(zeta.x / u_lnPeriod);

  float ln_r = zeta.x;
  float theta = zeta.y;
  float r = exp(ln_r);
  vec2 w = u_polarOrigin + vec2(r * cos(theta), r * sin(theta));

  vec2 uv = display_to_source_uv(w);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.06, 0.06, 0.08, 1.0);
    return;
  }

  outColor = sceneColor(uv);
}
`;
