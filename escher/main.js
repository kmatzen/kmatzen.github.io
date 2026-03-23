import { VERT_SRC, FRAG_DROSTE_SRC, FRAG_LOG_SRC, FRAG_LOG_ALIGNED_SRC } from "./shaders.js";

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(err || "shader compile failed");
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(err || "program link failed");
  }
  return prog;
}

function setupQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  return { vao, buf };
}

function bindQuadAttribs(gl, program, vao) {
  gl.bindVertexArray(vao);
  const locPos = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
}

/**
 * Raster recursive inset: axis-aligned copy, w = c + a·z in ℂ with a = s real.
 * c is the bottom-left corner of the inner square in UV; inner must lie in [0,1]².
 * @param {number} size
 * @param {{ re: number, im: number }} c
 * @param {{ re: number, im: number }} a  — must be real (im = 0)
 */
function makeRecursiveTexture(size, c, a) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");


  function drawLevel(depth, scale, offsetX, offsetY) {
    if (depth <= 0) return;
    const s = scale;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(s, s);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, size * 0.55);
    sky.addColorStop(0, "#4a7fb5");
    sky.addColorStop(1, "#a8d0e6");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size * 0.55);

    // Clouds
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (const [cx, cy, r] of [[0.2, 0.12, 0.05], [0.24, 0.10, 0.04], [0.17, 0.11, 0.035],
                                 [0.75, 0.18, 0.045], [0.79, 0.16, 0.035], [0.72, 0.17, 0.03]]) {
      ctx.beginPath();
      ctx.arc(size * cx, size * cy, size * r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sun
    ctx.fillStyle = "#f0d060";
    ctx.beginPath();
    ctx.arc(size * 0.88, size * 0.08, size * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // Ground
    const ground = ctx.createLinearGradient(0, size * 0.55, 0, size);
    ground.addColorStop(0, "#6b8e5a");
    ground.addColorStop(1, "#3d5c2e");
    ctx.fillStyle = ground;
    ctx.fillRect(0, size * 0.55, size, size * 0.45);

    // Checkerboard path
    const pathLeft = size * 0.3;
    const pathRight = size * 0.7;
    const horizon = size * 0.55;
    const vanishX = size * 0.5;
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const t0 = i / rows;
      const t1 = (i + 1) / rows;
      const y0 = horizon + (size - horizon) * t0;
      const y1 = horizon + (size - horizon) * t1;
      const x0L = vanishX + (pathLeft - vanishX) * t0;
      const x0R = vanishX + (pathRight - vanishX) * t0;
      const x1L = vanishX + (pathLeft - vanishX) * t1;
      const x1R = vanishX + (pathRight - vanishX) * t1;
      const cols = 4;
      for (let j = 0; j < cols; j++) {
        const fL0 = x0L + (x0R - x0L) * (j / cols);
        const fR0 = x0L + (x0R - x0L) * ((j + 1) / cols);
        const fL1 = x1L + (x1R - x1L) * (j / cols);
        const fR1 = x1L + (x1R - x1L) * ((j + 1) / cols);
        ctx.fillStyle = (i + j) % 2 === 0 ? "#d4c9a8" : "#8b7355";
        ctx.beginPath();
        ctx.moveTo(fL0, y0);
        ctx.lineTo(fR0, y0);
        ctx.lineTo(fR1, y1);
        ctx.lineTo(fL1, y1);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Building left
    ctx.fillStyle = "#c4956a";
    ctx.fillRect(size * 0.02, size * 0.2, size * 0.22, size * 0.35);
    ctx.fillStyle = "#a07050";
    ctx.fillRect(size * 0.05, size * 0.25, size * 0.06, size * 0.08);
    ctx.fillRect(size * 0.15, size * 0.25, size * 0.06, size * 0.08);
    ctx.fillRect(size * 0.05, size * 0.38, size * 0.06, size * 0.08);
    ctx.fillRect(size * 0.15, size * 0.38, size * 0.06, size * 0.08);

    // Building right
    ctx.fillStyle = "#b8c4d0";
    ctx.fillRect(size * 0.76, size * 0.15, size * 0.22, size * 0.4);
    ctx.fillStyle = "#8b4040";
    ctx.beginPath();
    ctx.moveTo(size * 0.74, size * 0.15);
    ctx.lineTo(size * 0.87, size * 0.05);
    ctx.lineTo(size * 1.0, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7090a0";
    ctx.fillRect(size * 0.80, size * 0.22, size * 0.05, size * 0.07);
    ctx.fillRect(size * 0.90, size * 0.22, size * 0.05, size * 0.07);
    ctx.fillRect(size * 0.80, size * 0.35, size * 0.05, size * 0.07);
    ctx.fillRect(size * 0.90, size * 0.35, size * 0.05, size * 0.07);

    // Tree
    ctx.fillStyle = "#5c3a1e";
    ctx.fillRect(size * 0.62, size * 0.3, size * 0.03, size * 0.25);
    ctx.fillStyle = "#3a6b2a";
    ctx.beginPath();
    ctx.arc(size * 0.635, size * 0.25, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a7b38";
    ctx.beginPath();
    ctx.arc(size * 0.65, size * 0.28, size * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Billboard matches the recursion region: c=(0.375,0.375), a=0.25
    const bx = c.re * size, by = c.im * size;
    const bw = a.re * size, bh = a.re * size;
    // Recurse into the billboard
    const sc = a.re;
    const tx = c.re * size;
    const ty = c.im * size;
    ctx.save();
    ctx.transform(sc, 0, 0, sc, tx, ty);
    drawLevel(depth - 1, 1, 0, 0);
    ctx.restore();

    // Posts and frame (drawn after recursion so they're on top)
    ctx.fillStyle = "#6b5030";
    const postW = bw * 0.08;
    ctx.fillRect(bx + bw * 0.08, by + bh, postW, size * 0.75 - (by + bh));
    ctx.fillRect(bx + bw * 0.84, by + bh, postW, size * 0.75 - (by + bh));
    ctx.strokeStyle = "#5c3a1e";
    ctx.lineWidth = size * 0.006;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = "#8b6914";
    ctx.lineWidth = size * 0.003;
    ctx.strokeRect(bx + size * 0.005, by + size * 0.005, bw - size * 0.01, bh - size * 0.01);

    ctx.restore();
  }

  const RECURSION_DEPTH = 8;
  drawLevel(RECURSION_DEPTH, 1, 0, 0);

  return canvas;
}

function main() {
  const canvas = document.getElementById("c");
  const sourceCanvas = document.getElementById("source");
  const logCanvas = document.getElementById("log");
  const logAlignedCanvas = document.getElementById("logAligned");

  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  const glLog = logCanvas.getContext("webgl2", { alpha: false, antialias: true });
  const glLogAligned = logAlignedCanvas.getContext("webgl2", { alpha: false, antialias: true });
  if (!gl || !glLog || !glLogAligned) {
    alert("WebGL2 required");
    return;
  }

  const program = createProgram(gl, VERT_SRC, FRAG_DROSTE_SRC);
  const programLog = createProgram(glLog, VERT_SRC, FRAG_LOG_SRC);
  const programLogAligned = createProgram(glLogAligned, VERT_SRC, FRAG_LOG_ALIGNED_SRC);

  const mainQuad = setupQuad(gl);
  const logQuad = setupQuad(glLog);
  const logAlignedQuad = setupQuad(glLogAligned);
  bindQuadAttribs(gl, program, mainQuad.vao);
  bindQuadAttribs(glLog, programLog, logQuad.vao);
  bindQuadAttribs(glLogAligned, programLogAligned, logAlignedQuad.vao);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /** Centered recursion: c = ((1−s)/2, (1−s)/2); inner square centered in the frame. */
  const insetScale = 1 / 4;
  const cEmb = { re: 0.5 * (1 - insetScale), im: 0.5 * (1 - insetScale) };
  const aEmb = { re: insetScale, im: 0 };

  const raster = makeRecursiveTexture(2048, cEmb, aEmb);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);

  /** Second context cannot use the main context's texture object; duplicate upload. */
  const texLog = glLog.createTexture();
  glLog.bindTexture(glLog.TEXTURE_2D, texLog);
  glLog.texParameteri(glLog.TEXTURE_2D, glLog.TEXTURE_MIN_FILTER, glLog.LINEAR);
  glLog.texParameteri(glLog.TEXTURE_2D, glLog.TEXTURE_MAG_FILTER, glLog.LINEAR);
  glLog.texParameteri(glLog.TEXTURE_2D, glLog.TEXTURE_WRAP_S, glLog.CLAMP_TO_EDGE);
  glLog.texParameteri(glLog.TEXTURE_2D, glLog.TEXTURE_WRAP_T, glLog.CLAMP_TO_EDGE);
  glLog.pixelStorei(glLog.UNPACK_FLIP_Y_WEBGL, true);
  glLog.texImage2D(glLog.TEXTURE_2D, 0, glLog.RGBA, glLog.RGBA, glLog.UNSIGNED_BYTE, raster);

  const texLogAligned = glLogAligned.createTexture();
  glLogAligned.bindTexture(glLogAligned.TEXTURE_2D, texLogAligned);
  glLogAligned.texParameteri(glLogAligned.TEXTURE_2D, glLogAligned.TEXTURE_MIN_FILTER, glLogAligned.LINEAR);
  glLogAligned.texParameteri(glLogAligned.TEXTURE_2D, glLogAligned.TEXTURE_MAG_FILTER, glLogAligned.LINEAR);
  glLogAligned.texParameteri(glLogAligned.TEXTURE_2D, glLogAligned.TEXTURE_WRAP_S, glLogAligned.CLAMP_TO_EDGE);
  glLogAligned.texParameteri(glLogAligned.TEXTURE_2D, glLogAligned.TEXTURE_WRAP_T, glLogAligned.CLAMP_TO_EDGE);
  glLogAligned.pixelStorei(glLogAligned.UNPACK_FLIP_Y_WEBGL, true);
  glLogAligned.texImage2D(
    glLogAligned.TEXTURE_2D,
    0,
    glLogAligned.RGBA,
    glLogAligned.RGBA,
    glLogAligned.UNSIGNED_BYTE,
    raster
  );

  const srcCtx = sourceCanvas.getContext("2d");
  srcCtx.imageSmoothingEnabled = true;
  srcCtx.drawImage(raster, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const uTex = gl.getUniformLocation(program, "u_tex");
  const uRes = gl.getUniformLocation(program, "u_resolution");
  const uPolarOrigin = gl.getUniformLocation(program, "u_polarOrigin");
  const uCenter = gl.getUniformLocation(program, "u_center");
  const uA = gl.getUniformLocation(program, "u_a");
  const uAlpha = gl.getUniformLocation(program, "u_alpha");
  const uViewCenter = gl.getUniformLocation(program, "u_viewCenter");
  const uViewScale = gl.getUniformLocation(program, "u_viewScale");
  const uPeriod = gl.getUniformLocation(program, "u_period");
  const uLnPeriod = gl.getUniformLocation(program, "u_lnPeriod");

  const uTexLog = glLog.getUniformLocation(programLog, "u_tex");
  const uResLog = glLog.getUniformLocation(programLog, "u_resolution");
  const uPolarOriginLog = glLog.getUniformLocation(programLog, "u_polarOrigin");
  const uCenterLog = glLog.getUniformLocation(programLog, "u_center");
  const uALog = glLog.getUniformLocation(programLog, "u_a");
  const uRMinLog = glLog.getUniformLocation(programLog, "u_rMin");
  const uRMaxLog = glLog.getUniformLocation(programLog, "u_rMax");
  const uThetaMinLog = glLog.getUniformLocation(programLog, "u_thetaMin");
  const uThetaMaxLog = glLog.getUniformLocation(programLog, "u_thetaMax");

  const uTexLogAligned = glLogAligned.getUniformLocation(programLogAligned, "u_tex");
  const uResLogAligned = glLogAligned.getUniformLocation(programLogAligned, "u_resolution");
  const uPolarOriginAligned = glLogAligned.getUniformLocation(programLogAligned, "u_polarOrigin");
  const uCenterAligned = glLogAligned.getUniformLocation(programLogAligned, "u_center");
  const uAAligned = glLogAligned.getUniformLocation(programLogAligned, "u_a");
  const uAlphaAligned = glLogAligned.getUniformLocation(programLogAligned, "u_alpha");
  const uZetaA = glLogAligned.getUniformLocation(programLogAligned, "u_zetaA");
  const uZetaEdgeU = glLogAligned.getUniformLocation(programLogAligned, "u_zetaEdgeU");
  const uZetaEdgeV = glLogAligned.getUniformLocation(programLogAligned, "u_zetaEdgeV");
  const uLnPeriodAligned = glLogAligned.getUniformLocation(programLogAligned, "u_lnPeriod");

  /** Polar map around image center (0.5, 0.5); recursion unwind still uses c (u_center). */
  const polarOrigin = { x: 0.5, y: 0.5 };
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  let rMaxPolarBase = 0;
  for (const [x, y] of corners) {
    rMaxPolarBase = Math.max(
      rMaxPolarBase,
      Math.hypot(x - polarOrigin.x, y - polarOrigin.y)
    );
  }
  /** >1 widens the ln(r) axis so the polar view is zoomed out radially. */
  const polarRadialZoomOut = 2;
  const rMaxPolar = rMaxPolarBase * polarRadialZoomOut;
  const rMinPolar = 0.002;

  const L0 = Math.log(rMinPolar);
  const L1 = Math.log(rMaxPolar);
  /** ζ = ln r + i·θ; both axes in natural units (nepers / radians) for conformal α·ζ. */
  const lnRange = L1 - L0;
  const thetaMin = -lnRange / 2;
  const thetaMax = lnRange / 2;
  /**
   * α in polar form: α = scale · e^(iθ). Sliders control angle and magnitude.
   * Default: rotation=0, scale=1 (identity). Correct alignment at α·(4ln4 + 2πi) = 2πi.
   */
  // Droste preset: α = 2πi / (ln(4) + 2πi)
  // 1 radial level inward per angular turn, CCW spiral
  const c1 = Math.log(4);
  const denom = c1 * c1 + 4 * Math.PI * Math.PI;
  const drosteAlphaRe = 4 * Math.PI * Math.PI / denom;
  const drosteAlphaIm = 2 * Math.PI * c1 / denom;
  const drosteAngle = Math.atan2(drosteAlphaIm, drosteAlphaRe);
  const drosteScale = Math.hypot(drosteAlphaRe, drosteAlphaIm);

  const defaultAlphaAngle = drosteAngle;
  const defaultAlphaScale = drosteScale;

  const angleSlider = document.getElementById("alphaAngle");
  const scaleSlider = document.getElementById("alphaScale");
  const angleVal = document.getElementById("alphaAngleVal");
  const scaleVal = document.getElementById("alphaScaleVal");
  angleSlider.value = defaultAlphaAngle;
  scaleSlider.value = defaultAlphaScale;

  let alphaLog = { re: 0, im: 0 };
  let zetaA = { re: 0, im: 0 };
  let zetaEdgeU = { re: 0, im: 0 };
  let zetaEdgeV = { re: 0, im: 0 };
  let drostePeriod = 1.0;

  function updateAlpha() {
    const angle = parseFloat(angleSlider.value);
    const scale = parseFloat(scaleSlider.value);
    angleVal.textContent = angle.toFixed(4);
    scaleVal.textContent = scale.toFixed(4);

    alphaLog = { re: scale * Math.cos(angle), im: scale * Math.sin(angle) };

    // Fixed viewport in ζ' space — same extent as panel 2's ζ-space so α's effect is visible
    zetaA = { re: L0, im: thetaMin };
    zetaEdgeU = { re: L1 - L0, im: 0 };
    zetaEdgeV = { re: 0, im: thetaMax - thetaMin };

    // Droste period = 2π (one full turn in radians, the natural θ period)
    drostePeriod = 2 * Math.PI;
  }

  updateAlpha();

  angleSlider.addEventListener("input", () => { updateAlpha(); draw(); });
  scaleSlider.addEventListener("input", () => { updateAlpha(); draw(); });

  function applyPreset(angle, scale) {
    angleSlider.value = angle;
    scaleSlider.value = scale;
    updateAlpha();
    saveHash();
    draw();
  }

  document.getElementById("presetIdentity").addEventListener("click", () => {
    applyPreset(0, 1);
  });

  document.getElementById("presetDroste").addEventListener("click", () => {
    applyPreset(drosteAngle, drosteScale);
  });

  // Print Gallery preset: α = 2πi / (-ln(4) + 2πi)
  // 1 radial level inward per angular turn, CW spiral
  const pgDenom = c1 * c1 + 4 * Math.PI * Math.PI;
  const pgAlphaRe = 4 * Math.PI * Math.PI / pgDenom;
  const pgAlphaIm = -2 * Math.PI * c1 / pgDenom;
  const pgAngle = Math.atan2(pgAlphaIm, pgAlphaRe);
  const pgScale = Math.hypot(pgAlphaRe, pgAlphaIm);

  document.getElementById("presetPrintGallery").addEventListener("click", () => {
    applyPreset(pgAngle, pgScale);
  });

  // --- Animation ---
  let animating = false;
  let animRAF = null;
  const animBtn = document.getElementById("btnAnimate");

  function animationLoop(t) {
    if (!animating) return;
    // Slowly rotate α: ~0.3 rad/sec
    let angle = parseFloat(angleSlider.value) + 0.005;
    // Wrap to (-π, π] robustly (handles long-backgrounded tabs)
    angle = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
    angleSlider.value = angle;
    updateAlpha();
    draw();
    animRAF = requestAnimationFrame(animationLoop);
  }

  // Don't save hash every frame during animation (too noisy), but save on stop

  animBtn.addEventListener("click", () => {
    animating = !animating;
    animBtn.classList.toggle("active", animating);
    animBtn.textContent = animating ? "Stop" : "Animate";
    if (animating) {
      animRAF = requestAnimationFrame(animationLoop);
    } else {
      if (animRAF) cancelAnimationFrame(animRAF);
      saveHash();
    }
  });

  // --- URL hash state ---
  function saveHash() {
    const angle = parseFloat(angleSlider.value);
    const scale = parseFloat(scaleSlider.value);
    const hash = `a=${angle.toFixed(4)}&s=${scale.toFixed(4)}`;
    history.replaceState(null, "", "#" + hash);
  }

  function loadHash() {
    const hash = location.hash.slice(1);
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const a = params.get("a");
    const s = params.get("s");
    if (a !== null && s !== null) {
      angleSlider.value = parseFloat(a);
      scaleSlider.value = parseFloat(s);
      updateAlpha();
      return true;
    }
    return false;
  }

  // Save hash whenever sliders change
  angleSlider.addEventListener("input", saveHash);
  scaleSlider.addEventListener("input", saveHash);

  // Load from hash on startup (after presets are defined)
  loadHash();

  // --- Pinch-to-zoom on panel 4 ---
  let touches = new Map();

  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) touches.delete(t.identifier);
  }, { passive: true });

  canvas.addEventListener("touchcancel", (e) => {
    for (const t of e.changedTouches) touches.delete(t.identifier);
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if (touches.size === 2 && e.touches.length === 2) {
      e.preventDefault();
      const [t0, t1] = [...e.touches];
      const prev = [...touches.values()];
      const oldDist = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
      const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (oldDist > 10 && newDist > 10) {
        const factor = oldDist / newDist;
        viewScale = Math.min(8, Math.max(0.35, viewScale * factor));
      }
      // Also pan from midpoint movement
      const oldMid = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 };
      const newMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const rect = canvas.getBoundingClientRect();
      const dx = (newMid.x - oldMid.x) / rect.width;
      const dy = -(newMid.y - oldMid.y) / rect.height;
      viewCenter.x -= dx * viewScale;
      viewCenter.y -= dy * viewScale;

      for (const t of e.touches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      draw();
    }
  }, { passive: false });

  let viewCenter = { x: 0.5, y: 0.5 };
  let viewScale = 1.2;
  let dragging = false;
  let last = { x: 0, y: 0 };

  function setViewUniforms(glCtx, resW, resH) {
    glCtx.uniform2f(uRes, resW, resH);
    glCtx.uniform2f(uPolarOrigin, polarOrigin.x, polarOrigin.y);
    glCtx.uniform2f(uCenter, cEmb.re, cEmb.im);
    glCtx.uniform2f(uA, aEmb.re, aEmb.im);
    glCtx.uniform2f(uAlpha, alphaLog.re, alphaLog.im);
    glCtx.uniform2f(uViewCenter, viewCenter.x, viewCenter.y);
    glCtx.uniform1f(uViewScale, viewScale);
    glCtx.uniform1f(uPeriod, drostePeriod);
    glCtx.uniform1f(uLnPeriod, Math.log(1 / Math.hypot(aEmb.re, aEmb.im)));
  }

  function setLogUniforms() {
    glLog.uniform2f(uResLog, logCanvas.width, logCanvas.height);
    glLog.uniform2f(uPolarOriginLog, polarOrigin.x, polarOrigin.y);
    glLog.uniform2f(uCenterLog, cEmb.re, cEmb.im);
    glLog.uniform2f(uALog, aEmb.re, aEmb.im);
    glLog.uniform1f(uRMinLog, rMinPolar);
    glLog.uniform1f(uRMaxLog, rMaxPolar);
    glLog.uniform1f(uThetaMinLog, thetaMin);
    glLog.uniform1f(uThetaMaxLog, thetaMax);
  }

  function setLogAlignedUniforms() {
    glLogAligned.uniform2f(uResLogAligned, logAlignedCanvas.width, logAlignedCanvas.height);
    glLogAligned.uniform2f(uPolarOriginAligned, polarOrigin.x, polarOrigin.y);
    glLogAligned.uniform2f(uCenterAligned, cEmb.re, cEmb.im);
    glLogAligned.uniform2f(uAAligned, aEmb.re, aEmb.im);
    glLogAligned.uniform2f(uAlphaAligned, alphaLog.re, alphaLog.im);
    glLogAligned.uniform2f(uZetaA, zetaA.re, zetaA.im);
    glLogAligned.uniform2f(uZetaEdgeU, zetaEdgeU.re, zetaEdgeU.im);
    glLogAligned.uniform2f(uZetaEdgeV, zetaEdgeV.re, zetaEdgeV.im);
    glLogAligned.uniform1f(uLnPeriodAligned, Math.log(1 / Math.hypot(aEmb.re, aEmb.im)));
  }

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(mainQuad.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uTex, 0);
    setViewUniforms(gl, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    glLog.viewport(0, 0, logCanvas.width, logCanvas.height);
    glLog.clearColor(0.05, 0.05, 0.06, 1);
    glLog.clear(glLog.COLOR_BUFFER_BIT);
    glLog.useProgram(programLog);
    glLog.bindVertexArray(logQuad.vao);
    glLog.activeTexture(glLog.TEXTURE0);
    glLog.bindTexture(glLog.TEXTURE_2D, texLog);
    glLog.uniform1i(uTexLog, 0);
    setLogUniforms();
    glLog.drawArrays(glLog.TRIANGLES, 0, 6);

    glLogAligned.viewport(0, 0, logAlignedCanvas.width, logAlignedCanvas.height);
    glLogAligned.clearColor(0.05, 0.05, 0.06, 1);
    glLogAligned.clear(glLogAligned.COLOR_BUFFER_BIT);
    glLogAligned.useProgram(programLogAligned);
    glLogAligned.bindVertexArray(logAlignedQuad.vao);
    glLogAligned.activeTexture(glLogAligned.TEXTURE0);
    glLogAligned.bindTexture(glLogAligned.TEXTURE_2D, texLogAligned);
    glLogAligned.uniform1i(uTexLogAligned, 0);
    setLogAlignedUniforms();
    glLogAligned.drawArrays(glLogAligned.TRIANGLES, 0, 6);
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    last.x = e.clientX;
    last.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - last.x) / canvas.width;
    const dy = -(e.clientY - last.y) / canvas.height;
    last.x = e.clientX;
    last.y = e.clientY;
    viewCenter.x -= dx * viewScale;
    viewCenter.y -= dy * viewScale;
    draw();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      viewScale = Math.min(8, Math.max(0.35, viewScale * factor));
      draw();
    },
    { passive: false }
  );

  // --- Interactive hover overlays ---
  // Overlay canvases positioned over each target using fixed positioning + JS sync.
  function makeOverlay(target) {
    const overlay = document.createElement("canvas");
    overlay.width = target.width;
    overlay.height = target.height;
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "1000";
    document.body.appendChild(overlay);

    function sync() {
      const r = target.getBoundingClientRect();
      overlay.style.left = r.left + "px";
      overlay.style.top = r.top + "px";
      overlay.style.width = r.width + "px";
      overlay.style.height = r.height + "px";
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync);
    overlay._sync = sync;
    return overlay;
  }

  const overSource = makeOverlay(sourceCanvas);
  const overLog = makeOverlay(logCanvas);
  const overAligned = makeOverlay(logAlignedCanvas);
  const overDroste = makeOverlay(canvas);

  const lnPeriod = Math.log(1 / Math.hypot(aEmb.re, aEmb.im));
  const TAU = 2 * Math.PI;

  // Lattice dot search bounds: how many periods to check in each direction
  const LATTICE_LN_COPIES = 6;   // ±6 radial periods
  const LATTICE_THETA_COPIES = 3; // ±3 angular periods

  // Coordinate conversions
  function uvToSourcePx(u, v) {
    return { x: u * sourceCanvas.width, y: (1 - v) * sourceCanvas.height };
  }

  function zetaToLogPx(lnr, theta) {
    const nx = (lnr - L0) / (L1 - L0);
    const ny = (theta - thetaMin) / (thetaMax - thetaMin);
    return { x: nx * logCanvas.width, y: (1 - ny) * logCanvas.height };
  }

  function zetaPrimeToAlignedPx(re, im) {
    const nx = (re - zetaA.re) / zetaEdgeU.re;
    const ny = (im - zetaA.im) / zetaEdgeV.im;
    return { x: nx * logAlignedCanvas.width, y: (1 - ny) * logAlignedCanvas.height };
  }

  function uvToDrostePx(u, v) {
    // Shader: pos = (frag/res - viewCenter) * viewScale + 0.5
    // Invert: frag/res = (uv - 0.5) / viewScale + viewCenter
    const normX = (u - 0.5) / viewScale + viewCenter.x;
    const normY = (v - 0.5) / viewScale + viewCenter.y;
    return { x: normX * overDroste.width, y: (1 - normY) * overDroste.height };
  }

  function cmul_js(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }

  function cdiv_js(a, b) {
    const d = b.re * b.re + b.im * b.im;
    if (d < 1e-20) return { re: 1e10, im: 1e10 };
    return {
      re: (a.re * b.re + a.im * b.im) / d,
      im: (a.im * b.re - a.re * b.im) / d,
    };
  }

  function syncOverlays() {
    overSource._sync();
    overLog._sync();
    overAligned._sync();
    overDroste._sync();
  }

  function clearOverlays() {
    for (const ov of [overSource, overLog, overAligned, overDroste]) {
      const ctx = ov.getContext("2d");
      ctx.clearRect(0, 0, ov.width, ov.height);
    }
  }

  // Draw a circle at constant r in source space (maps to vertical line in log space)
  function drawCircleInSource(ctx, r, color, lineWidth) {
    const cx = polarOrigin.x * sourceCanvas.width;
    const cy = (1 - polarOrigin.y) * sourceCanvas.height;
    const rPx = r * sourceCanvas.width;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, TAU);
    ctx.stroke();
  }

  // Draw a radial line at constant theta in source space (maps to horizontal line in log space)
  function drawRadialInSource(ctx, theta, rMin, rMax, color, lineWidth) {
    const cx = polarOrigin.x;
    const cy = polarOrigin.y;
    const p1 = uvToSourcePx(cx + rMin * Math.cos(theta), cy + rMin * Math.sin(theta));
    const p2 = uvToSourcePx(cx + rMax * Math.cos(theta), cy + rMax * Math.sin(theta));
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Draw a spiral in source space (maps to a tilted line in log space)
  function drawSpiralInSource(ctx, lnrStart, thetaStart, slope, color, lineWidth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    const steps = 300;
    const tRange = TAU * 3;
    for (let i = 0; i <= steps; i++) {
      const t = -tRange / 2 + (tRange * i) / steps;
      const theta = thetaStart + t;
      const lnr = lnrStart + t * slope;
      const r = Math.exp(lnr);
      const u = polarOrigin.x + r * Math.cos(theta);
      const v = polarOrigin.y + r * Math.sin(theta);
      const p = uvToSourcePx(u, v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Draw overlays for all four panels based on a hover point in ζ-space (lnr, theta)
  function drawHoverGuides(lnr, theta) {
    syncOverlays();
    clearOverlays();
    const r = Math.exp(lnr);

    // Panel 1: circle at constant r, radial at constant θ, and crosshair dot
    const srcCtx2 = overSource.getContext("2d");
    drawCircleInSource(srcCtx2, r, "rgba(0, 200, 255, 0.6)", 1.5);
    drawRadialInSource(srcCtx2, theta, 0, 1.5, "rgba(255, 100, 200, 0.6)", 1.5);
    // Dot at the hover point
    const hp = uvToSourcePx(polarOrigin.x + r * Math.cos(theta), polarOrigin.y + r * Math.sin(theta));
    srcCtx2.fillStyle = "rgba(255, 255, 0, 0.9)";
    srcCtx2.beginPath();
    srcCtx2.arc(hp.x, hp.y, 4, 0, TAU);
    srcCtx2.fill();

    // Also draw the α·Δζ lattice spiral through this point
    // The spiral where ζ' = const along the α direction
    if (Math.abs(alphaLog.im) > 0.01 || Math.abs(alphaLog.re - 1) > 0.01) {
      // Slope in ζ-space: dln(r)/dθ = α_re/α_im (direction perpendicular to α)
      const slope = alphaLog.re / (alphaLog.im || 1e-10);
      drawSpiralInSource(srcCtx2, lnr, theta, slope, "rgba(100, 255, 100, 0.4)", 1.5);
    }

    // Panel 2: vertical line at constant ln(r), horizontal at constant θ
    const logCtx = overLog.getContext("2d");
    // Vertical line (constant ln r → circle in source)
    const vx = zetaToLogPx(lnr, 0);
    logCtx.strokeStyle = "rgba(0, 200, 255, 0.6)";
    logCtx.lineWidth = 1.5;
    logCtx.beginPath();
    logCtx.moveTo(vx.x, 0);
    logCtx.lineTo(vx.x, logCanvas.height);
    logCtx.stroke();
    // Horizontal line (constant θ → radial in source)
    const hy = zetaToLogPx(0, theta);
    logCtx.strokeStyle = "rgba(255, 100, 200, 0.6)";
    logCtx.beginPath();
    logCtx.moveTo(0, hy.y);
    logCtx.lineTo(logCanvas.width, hy.y);
    logCtx.stroke();
    // Dot
    const lp = zetaToLogPx(lnr, theta);
    logCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    logCtx.beginPath();
    logCtx.arc(lp.x, lp.y, 4, 0, TAU);
    logCtx.fill();

    // Lattice dots in panel 2: periodic copies of the hovered point
    logCtx.fillStyle = "rgba(255, 255, 0, 0.4)";
    for (let di = -LATTICE_LN_COPIES; di <= LATTICE_LN_COPIES; di++) {
      for (let dj = -LATTICE_THETA_COPIES; dj <= LATTICE_THETA_COPIES; dj++) {
        if (di === 0 && dj === 0) continue;
        const lnrL = lnr + di * lnPeriod;
        const thetaL = theta + dj * TAU;
        const ltp = zetaToLogPx(lnrL, thetaL);
        if (ltp.x < -5 || ltp.x > logCanvas.width + 5 ||
            ltp.y < -5 || ltp.y > logCanvas.height + 5) continue;
        logCtx.beginPath();
        logCtx.arc(ltp.x, ltp.y, 3, 0, TAU);
        logCtx.fill();
      }
    }

    // Panel 3: transform through α → ζ' = α·ζ
    const zp = cmul_js(alphaLog, { re: lnr, im: theta });
    const alCtx = overAligned.getContext("2d");
    // Vertical line in ζ' at constant ζ'.re (= α·ζ constant-real line → spiral in source)
    const av = zetaPrimeToAlignedPx(zp.re, 0);
    alCtx.strokeStyle = "rgba(100, 255, 100, 0.6)";
    alCtx.lineWidth = 1.5;
    alCtx.beginPath();
    alCtx.moveTo(av.x, 0);
    alCtx.lineTo(av.x, logAlignedCanvas.height);
    alCtx.stroke();
    // Horizontal line in ζ' at constant ζ'.im
    const ah = zetaPrimeToAlignedPx(0, zp.im);
    alCtx.strokeStyle = "rgba(255, 180, 50, 0.6)";
    alCtx.beginPath();
    alCtx.moveTo(0, ah.y);
    alCtx.lineTo(logAlignedCanvas.width, ah.y);
    alCtx.stroke();
    // Dot
    const ap = zetaPrimeToAlignedPx(zp.re, zp.im);
    alCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    alCtx.beginPath();
    alCtx.arc(ap.x, ap.y, 4, 0, TAU);
    alCtx.fill();

    // Lattice dots in panel 3: periodic copies mapped through α
    alCtx.fillStyle = "rgba(255, 255, 0, 0.4)";
    for (let di = -LATTICE_LN_COPIES; di <= LATTICE_LN_COPIES; di++) {
      for (let dj = -LATTICE_THETA_COPIES; dj <= LATTICE_THETA_COPIES; dj++) {
        if (di === 0 && dj === 0) continue;
        const lnrL = lnr + di * lnPeriod;
        const thetaL = theta + dj * TAU;
        const zpL = cmul_js(alphaLog, { re: lnrL, im: thetaL });
        const ltp = zetaPrimeToAlignedPx(zpL.re, zpL.im);
        if (ltp.x < -5 || ltp.x > logAlignedCanvas.width + 5 ||
            ltp.y < -5 || ltp.y > logAlignedCanvas.height + 5) continue;
        alCtx.beginPath();
        alCtx.arc(ltp.x, ltp.y, 3, 0, TAU);
        alCtx.fill();
      }
    }

    // Panel 4 (Droste): the point maps to Cartesian via exp of ζ'
    const drCtx = overDroste.getContext("2d");
    const rDroste = Math.exp(zp.re);
    const thetaDroste = zp.im;

    // Circle at constant r (= constant ζ'.re → vertical in panel 3)
    // Draw as a polyline to handle non-uniform scaling correctly
    const dCenter = uvToDrostePx(polarOrigin.x, polarOrigin.y);
    drCtx.strokeStyle = "rgba(100, 255, 100, 0.6)";
    drCtx.lineWidth = 4;
    drCtx.beginPath();
    const circSteps = 120;
    for (let i = 0; i <= circSteps; i++) {
      const ang = (TAU * i) / circSteps;
      const cp = uvToDrostePx(
        polarOrigin.x + rDroste * Math.cos(ang),
        polarOrigin.y + rDroste * Math.sin(ang)
      );
      if (i === 0) drCtx.moveTo(cp.x, cp.y);
      else drCtx.lineTo(cp.x, cp.y);
    }
    drCtx.stroke();

    // Radial line at constant θ (= constant ζ'.im → horizontal in panel 3)
    const rFar = 2.0;
    const dp1 = uvToDrostePx(polarOrigin.x, polarOrigin.y);
    const dp2 = uvToDrostePx(
      polarOrigin.x + rFar * Math.cos(thetaDroste),
      polarOrigin.y + rFar * Math.sin(thetaDroste)
    );
    drCtx.strokeStyle = "rgba(255, 180, 50, 0.6)";
    drCtx.lineWidth = 4;
    drCtx.beginPath();
    drCtx.moveTo(dp1.x, dp1.y);
    drCtx.lineTo(dp2.x, dp2.y);
    drCtx.stroke();

    // Dot
    const ddp = uvToDrostePx(
      polarOrigin.x + rDroste * Math.cos(thetaDroste),
      polarOrigin.y + rDroste * Math.sin(thetaDroste)
    );
    drCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    drCtx.beginPath();
    drCtx.arc(ddp.x, ddp.y, 10, 0, TAU);
    drCtx.fill();
  }

  // Convert mouse position on a panel to ζ-space
  function sourceCanvasToZeta(e) {
    const rect = sourceCanvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = 1 - (e.clientY - rect.top) / rect.height;
    const dx = u - polarOrigin.x;
    const dy = v - polarOrigin.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-10) return null;
    return { lnr: Math.log(r), theta: Math.atan2(dy, dx) };
  }

  function logCanvasToZeta(e) {
    const rect = logCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1 - (e.clientY - rect.top) / rect.height;
    const lnr = L0 + nx * (L1 - L0);
    const theta = thetaMin + ny * (thetaMax - thetaMin);
    return { lnr, theta };
  }

  function alignedCanvasToZeta(e) {
    const rect = logAlignedCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1 - (e.clientY - rect.top) / rect.height;
    const zpRe = zetaA.re + nx * zetaEdgeU.re;
    const zpIm = zetaA.im + ny * zetaEdgeV.im;
    // ζ = ζ'/α
    const zeta = cdiv_js({ re: zpRe, im: zpIm }, alphaLog);
    return { lnr: zeta.re, theta: zeta.im };
  }

  function drosteCanvasToZeta(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    // Screen to normalized: posX = sx, posY = 1 - sy
    // Shader: uv = (pos - viewCenter) * viewScale + 0.5
    const u = (sx - viewCenter.x) * viewScale + 0.5;
    const v = (1 - sy - viewCenter.y) * viewScale + 0.5;
    const dx = u - polarOrigin.x;
    const dy = v - polarOrigin.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-10) return null;
    const thetaD = Math.atan2(dy, dx);
    // ζ' = (ln r, θ), then ζ = ζ'/α
    const zeta = cdiv_js({ re: Math.log(r), im: thetaD }, alphaLog);
    return { lnr: zeta.re, theta: zeta.im };
  }

  function onHover(toZeta) {
    return (e) => {
      const z = toZeta(e);
      if (z) drawHoverGuides(z.lnr, z.theta);
    };
  }

  sourceCanvas.addEventListener("pointermove", onHover(sourceCanvasToZeta));
  logCanvas.addEventListener("pointermove", onHover(logCanvasToZeta));
  logAlignedCanvas.addEventListener("pointermove", onHover(alignedCanvasToZeta));
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) return;
    const z = drosteCanvasToZeta(e);
    if (z) drawHoverGuides(z.lnr, z.theta);
  });

  for (const el of [sourceCanvas, logCanvas, logAlignedCanvas, canvas]) {
    el.addEventListener("pointerleave", clearOverlays);
  }

  draw();
}

main();
