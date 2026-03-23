import { VERT_SRC, FRAG_SOURCE_SRC, FRAG_DROSTE_SRC, FRAG_LOG_SRC, FRAG_LOG_ALIGNED_SRC } from "./shaders.js";

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

function main() {
  const canvas = document.getElementById("c");
  const sourceCanvas = document.getElementById("source");
  const logCanvas = document.getElementById("log");
  const logAlignedCanvas = document.getElementById("logAligned");

  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  const glSrc = sourceCanvas.getContext("webgl2", { alpha: false, antialias: true });
  const glLog = logCanvas.getContext("webgl2", { alpha: false, antialias: true });
  const glLogAligned = logAlignedCanvas.getContext("webgl2", { alpha: false, antialias: true });
  if (!gl || !glSrc || !glLog || !glLogAligned) {
    alert("WebGL2 required");
    return;
  }

  const program = createProgram(gl, VERT_SRC, FRAG_DROSTE_SRC);
  const programSrc = createProgram(glSrc, VERT_SRC, FRAG_SOURCE_SRC);
  const programLog = createProgram(glLog, VERT_SRC, FRAG_LOG_SRC);
  const programLogAligned = createProgram(glLogAligned, VERT_SRC, FRAG_LOG_ALIGNED_SRC);

  const mainQuad = setupQuad(gl);
  const srcQuad = setupQuad(glSrc);
  const logQuad = setupQuad(glLog);
  const logAlignedQuad = setupQuad(glLogAligned);
  bindQuadAttribs(gl, program, mainQuad.vao);
  bindQuadAttribs(glSrc, programSrc, srcQuad.vao);
  bindQuadAttribs(glLog, programLog, logQuad.vao);
  bindQuadAttribs(glLogAligned, programLogAligned, logAlignedQuad.vao);

  /** Recursive copy is always centered at (0.5, 0.5). */
  const insetScale = 1 / 16;
  const cEmb = { re: 0.5 - insetScale / 2, im: 0.5 - insetScale / 2 };
  const aEmb = { re: insetScale, im: 0 };

  let currentK = 3.5;

  // --- Scene uniform computation ---
  function computeSceneUniforms(K) {
    const cropNormX = Math.max(0, 0.75 - 0.5 / K);
    const cropNormY = Math.max(0, 0.25 - 0.5 / K);
    const cropSize = 1.0 / K;
    const bbSize = aEmb.re; // insetScale
    const frameNormW = K * aEmb.re;
    const frameNormX = cEmb.re - cropNormX * frameNormW;
    const frameNormY = cEmb.im - cropNormY * frameNormW;
    const bbX = cropNormX + frameNormX * cropSize;
    const bbY = cropNormY + frameNormY * cropSize;
    return { cropNormX, cropNormY, cropSize, bbX, bbY, bbSize };
  }

  // --- Uniform locations: Droste (panel 4) ---
  const uRes = gl.getUniformLocation(program, "u_resolution");
  const uPolarOrigin = gl.getUniformLocation(program, "u_polarOrigin");
  const uCenter = gl.getUniformLocation(program, "u_center");
  const uA = gl.getUniformLocation(program, "u_a");
  const uAlpha = gl.getUniformLocation(program, "u_alpha");
  const uViewCenter = gl.getUniformLocation(program, "u_viewCenter");
  const uViewScale = gl.getUniformLocation(program, "u_viewScale");
  const uPeriod = gl.getUniformLocation(program, "u_period");
  const uLnPeriod = gl.getUniformLocation(program, "u_lnPeriod");
  const uHoleRadius = gl.getUniformLocation(program, "u_holeRadius");
  const uSceneCropSize = gl.getUniformLocation(program, "u_sceneCropSize");
  const uSceneCropOffset = gl.getUniformLocation(program, "u_sceneCropOffset");
  const uSceneBBPos = gl.getUniformLocation(program, "u_sceneBBPos");
  const uSceneBBSize = gl.getUniformLocation(program, "u_sceneBBSize");

  // --- Uniform locations: Source preview (panel 1) ---
  const uResSrc = glSrc.getUniformLocation(programSrc, "u_resolution");
  const uSceneCropSizeSrc = glSrc.getUniformLocation(programSrc, "u_sceneCropSize");
  const uSceneCropOffsetSrc = glSrc.getUniformLocation(programSrc, "u_sceneCropOffset");
  const uSceneBBPosSrc = glSrc.getUniformLocation(programSrc, "u_sceneBBPos");
  const uSceneBBSizeSrc = glSrc.getUniformLocation(programSrc, "u_sceneBBSize");

  // --- Uniform locations: Log-polar (panel 2) ---
  const uResLog = glLog.getUniformLocation(programLog, "u_resolution");
  const uPolarOriginLog = glLog.getUniformLocation(programLog, "u_polarOrigin");
  const uCenterLog = glLog.getUniformLocation(programLog, "u_center");
  const uALog = glLog.getUniformLocation(programLog, "u_a");
  const uRMinLog = glLog.getUniformLocation(programLog, "u_rMin");
  const uRMaxLog = glLog.getUniformLocation(programLog, "u_rMax");
  const uThetaMinLog = glLog.getUniformLocation(programLog, "u_thetaMin");
  const uThetaMaxLog = glLog.getUniformLocation(programLog, "u_thetaMax");
  const uSceneCropSizeLog = glLog.getUniformLocation(programLog, "u_sceneCropSize");
  const uSceneCropOffsetLog = glLog.getUniformLocation(programLog, "u_sceneCropOffset");
  const uSceneBBPosLog = glLog.getUniformLocation(programLog, "u_sceneBBPos");
  const uSceneBBSizeLog = glLog.getUniformLocation(programLog, "u_sceneBBSize");

  // --- Uniform locations: Log-aligned (panel 3) ---
  const uResLogAligned = glLogAligned.getUniformLocation(programLogAligned, "u_resolution");
  const uPolarOriginAligned = glLogAligned.getUniformLocation(programLogAligned, "u_polarOrigin");
  const uCenterAligned = glLogAligned.getUniformLocation(programLogAligned, "u_center");
  const uAAligned = glLogAligned.getUniformLocation(programLogAligned, "u_a");
  const uAlphaAligned = glLogAligned.getUniformLocation(programLogAligned, "u_alpha");
  const uZetaA = glLogAligned.getUniformLocation(programLogAligned, "u_zetaA");
  const uZetaEdgeU = glLogAligned.getUniformLocation(programLogAligned, "u_zetaEdgeU");
  const uZetaEdgeV = glLogAligned.getUniformLocation(programLogAligned, "u_zetaEdgeV");
  const uLnPeriodAligned = glLogAligned.getUniformLocation(programLogAligned, "u_lnPeriod");
  const uSceneCropSizeAligned = glLogAligned.getUniformLocation(programLogAligned, "u_sceneCropSize");
  const uSceneCropOffsetAligned = glLogAligned.getUniformLocation(programLogAligned, "u_sceneCropOffset");
  const uSceneBBPosAligned = glLogAligned.getUniformLocation(programLogAligned, "u_sceneBBPos");
  const uSceneBBSizeAligned = glLogAligned.getUniformLocation(programLogAligned, "u_sceneBBSize");

  /** Polar map around image center (0.5, 0.5); recursion unwind still uses c (u_center). */
  const polarOrigin = { x: 0.5, y: 0.5 };
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let rMaxPolarBase = 0;
  for (const [x, y] of corners) {
    rMaxPolarBase = Math.max(rMaxPolarBase, Math.hypot(x - polarOrigin.x, y - polarOrigin.y));
  }
  const polarRadialZoomOut = 2;
  const rMaxPolar = rMaxPolarBase * polarRadialZoomOut;
  const rMinPolar = 0.002;

  const L0 = Math.log(rMinPolar);
  const L1 = Math.log(rMaxPolar);
  const lnRange = L1 - L0;
  const thetaMin = -lnRange / 2;
  const thetaMax = lnRange / 2;

  const levelsSelect = document.getElementById("levelsPerTurn");

  function computeSpiralPresets(nLevels) {
    const zoomPerTurn = Math.pow(1 / insetScale, nLevels);
    const c1 = Math.log(zoomPerTurn);
    const denom = c1 * c1 + 4 * Math.PI * Math.PI;
    const ccwRe = 4 * Math.PI * Math.PI / denom;
    const ccwIm = 2 * Math.PI * c1 / denom;
    const cwRe = ccwRe;
    const cwIm = -ccwIm;
    return {
      ccwAngle: Math.atan2(ccwIm, ccwRe),
      ccwScale: Math.hypot(ccwRe, ccwIm),
      cwAngle: Math.atan2(cwIm, cwRe),
      cwScale: Math.hypot(cwRe, cwIm),
    };
  }

  let presets = computeSpiralPresets(parseInt(levelsSelect.value));

  const angleSlider = document.getElementById("alphaAngle");
  const scaleSlider = document.getElementById("alphaScale");
  const angleVal = document.getElementById("alphaAngleVal");
  const scaleVal = document.getElementById("alphaScaleVal");
  angleSlider.value = presets.ccwAngle;
  scaleSlider.value = presets.ccwScale;

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
    zetaA = { re: L0, im: thetaMin };
    zetaEdgeU = { re: L1 - L0, im: 0 };
    zetaEdgeV = { re: 0, im: thetaMax - thetaMin };
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
    applyPreset(presets.ccwAngle, presets.ccwScale);
  });

  document.getElementById("presetPrintGallery").addEventListener("click", () => {
    applyPreset(presets.cwAngle, presets.cwScale);
  });

  levelsSelect.addEventListener("change", () => {
    presets = computeSpiralPresets(parseInt(levelsSelect.value));
    applyPreset(presets.ccwAngle, presets.ccwScale);
  });

  // --- Outpaint K slider ---
  const outpaintSlider = document.getElementById("outpaintK");
  const outpaintVal = document.getElementById("outpaintKVal");
  outpaintSlider.addEventListener("input", () => {
    currentK = parseFloat(outpaintSlider.value);
    outpaintVal.textContent = currentK.toFixed(1);
    draw();
  });

  // --- Central hole toggle ---
  let showHole = true;
  const holeBtn = document.getElementById("btnHole");
  holeBtn.addEventListener("click", () => {
    showHole = !showHole;
    holeBtn.classList.toggle("active", showHole);
    draw();
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

  angleSlider.addEventListener("input", saveHash);
  scaleSlider.addEventListener("input", saveHash);
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

  // --- Helper: set scene uniforms on a GL context ---
  function setSceneUniforms(glCtx, locs, su) {
    glCtx.uniform1f(locs.cropSize, su.cropSize);
    glCtx.uniform2f(locs.cropOffset, su.cropNormX, su.cropNormY);
    glCtx.uniform2f(locs.bbPos, su.bbX, su.bbY);
    glCtx.uniform1f(locs.bbSize, su.bbSize);
  }

  function setViewUniforms(glCtx, resW, resH, su) {
    glCtx.uniform2f(uRes, resW, resH);
    glCtx.uniform2f(uPolarOrigin, polarOrigin.x, polarOrigin.y);
    glCtx.uniform2f(uCenter, cEmb.re, cEmb.im);
    glCtx.uniform2f(uA, aEmb.re, aEmb.im);
    glCtx.uniform2f(uAlpha, alphaLog.re, alphaLog.im);
    glCtx.uniform2f(uViewCenter, viewCenter.x, viewCenter.y);
    glCtx.uniform1f(uViewScale, viewScale);
    glCtx.uniform1f(uPeriod, drostePeriod);
    glCtx.uniform1f(uLnPeriod, Math.log(1 / Math.hypot(aEmb.re, aEmb.im)));
    glCtx.uniform1f(uHoleRadius, showHole ? 0.12 : 0.0);
    setSceneUniforms(glCtx, {
      cropSize: uSceneCropSize,
      cropOffset: uSceneCropOffset,
      bbPos: uSceneBBPos,
      bbSize: uSceneBBSize,
    }, su);
  }

  function setLogUniforms(su) {
    glLog.uniform2f(uResLog, logCanvas.width, logCanvas.height);
    glLog.uniform2f(uPolarOriginLog, polarOrigin.x, polarOrigin.y);
    glLog.uniform2f(uCenterLog, cEmb.re, cEmb.im);
    glLog.uniform2f(uALog, aEmb.re, aEmb.im);
    glLog.uniform1f(uRMinLog, rMinPolar);
    glLog.uniform1f(uRMaxLog, rMaxPolar);
    glLog.uniform1f(uThetaMinLog, thetaMin);
    glLog.uniform1f(uThetaMaxLog, thetaMax);
    setSceneUniforms(glLog, {
      cropSize: uSceneCropSizeLog,
      cropOffset: uSceneCropOffsetLog,
      bbPos: uSceneBBPosLog,
      bbSize: uSceneBBSizeLog,
    }, su);
  }

  function setLogAlignedUniforms(su) {
    glLogAligned.uniform2f(uResLogAligned, logAlignedCanvas.width, logAlignedCanvas.height);
    glLogAligned.uniform2f(uPolarOriginAligned, polarOrigin.x, polarOrigin.y);
    glLogAligned.uniform2f(uCenterAligned, cEmb.re, cEmb.im);
    glLogAligned.uniform2f(uAAligned, aEmb.re, aEmb.im);
    glLogAligned.uniform2f(uAlphaAligned, alphaLog.re, alphaLog.im);
    glLogAligned.uniform2f(uZetaA, zetaA.re, zetaA.im);
    glLogAligned.uniform2f(uZetaEdgeU, zetaEdgeU.re, zetaEdgeU.im);
    glLogAligned.uniform2f(uZetaEdgeV, zetaEdgeV.re, zetaEdgeV.im);
    glLogAligned.uniform1f(uLnPeriodAligned, Math.log(1 / Math.hypot(aEmb.re, aEmb.im)));
    setSceneUniforms(glLogAligned, {
      cropSize: uSceneCropSizeAligned,
      cropOffset: uSceneCropOffsetAligned,
      bbPos: uSceneBBPosAligned,
      bbSize: uSceneBBSizeAligned,
    }, su);
  }

  function setSrcUniforms(su) {
    glSrc.uniform2f(uResSrc, sourceCanvas.width, sourceCanvas.height);
    setSceneUniforms(glSrc, {
      cropSize: uSceneCropSizeSrc,
      cropOffset: uSceneCropOffsetSrc,
      bbPos: uSceneBBPosSrc,
      bbSize: uSceneBBSizeSrc,
    }, su);
  }

  function draw() {
    const su = computeSceneUniforms(currentK);

    // Panel 1: Source preview
    glSrc.viewport(0, 0, sourceCanvas.width, sourceCanvas.height);
    glSrc.clearColor(0.05, 0.05, 0.06, 1);
    glSrc.clear(glSrc.COLOR_BUFFER_BIT);
    glSrc.useProgram(programSrc);
    glSrc.bindVertexArray(srcQuad.vao);
    setSrcUniforms(su);
    glSrc.drawArrays(glSrc.TRIANGLES, 0, 6);

    // Panel 4: Droste
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(mainQuad.vao);
    setViewUniforms(gl, canvas.width, canvas.height, su);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Panel 2: Log-polar
    glLog.viewport(0, 0, logCanvas.width, logCanvas.height);
    glLog.clearColor(0.05, 0.05, 0.06, 1);
    glLog.clear(glLog.COLOR_BUFFER_BIT);
    glLog.useProgram(programLog);
    glLog.bindVertexArray(logQuad.vao);
    setLogUniforms(su);
    glLog.drawArrays(glLog.TRIANGLES, 0, 6);

    // Panel 3: Aligned
    glLogAligned.viewport(0, 0, logAlignedCanvas.width, logAlignedCanvas.height);
    glLogAligned.clearColor(0.05, 0.05, 0.06, 1);
    glLogAligned.clear(glLogAligned.COLOR_BUFFER_BIT);
    glLogAligned.useProgram(programLogAligned);
    glLogAligned.bindVertexArray(logAlignedQuad.vao);
    setLogAlignedUniforms(su);
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
    clearOverlays();
    draw();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      viewScale = Math.min(8, Math.max(0.35, viewScale * factor));
      clearOverlays();
      draw();
    },
    { passive: false }
  );

  // --- Interactive hover overlays ---
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

  const LATTICE_LN_COPIES = 6;
  const LATTICE_THETA_COPIES = 3;

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

  function drawHoverGuides(lnr, theta) {
    syncOverlays();
    clearOverlays();
    const r = Math.exp(lnr);

    // Panel 1
    const srcCtx2 = overSource.getContext("2d");
    drawCircleInSource(srcCtx2, r, "rgba(0, 200, 255, 0.6)", 3);
    drawRadialInSource(srcCtx2, theta, 0, 1.5, "rgba(255, 100, 200, 0.6)", 3);
    const hp = uvToSourcePx(polarOrigin.x + r * Math.cos(theta), polarOrigin.y + r * Math.sin(theta));
    srcCtx2.fillStyle = "rgba(255, 255, 0, 0.9)";
    srcCtx2.beginPath();
    srcCtx2.arc(hp.x, hp.y, 7, 0, TAU);
    srcCtx2.fill();
    if (Math.abs(alphaLog.im) > 0.01 || Math.abs(alphaLog.re - 1) > 0.01) {
      const slopeGreen = alphaLog.im / (alphaLog.re || 1e-10);
      drawSpiralInSource(srcCtx2, lnr, theta, slopeGreen, "rgba(100, 255, 100, 0.6)", 3);
      const slopeOrange = -alphaLog.re / (alphaLog.im || 1e-10);
      drawSpiralInSource(srcCtx2, lnr, theta, slopeOrange, "rgba(255, 180, 50, 0.6)", 3);
    }

    // Panel 2
    const logCtx = overLog.getContext("2d");
    const vx = zetaToLogPx(lnr, 0);
    logCtx.strokeStyle = "rgba(0, 200, 255, 0.6)";
    logCtx.lineWidth = 3;
    logCtx.beginPath();
    logCtx.moveTo(vx.x, 0);
    logCtx.lineTo(vx.x, logCanvas.height);
    logCtx.stroke();
    const hy = zetaToLogPx(0, theta);
    logCtx.strokeStyle = "rgba(255, 100, 200, 0.6)";
    logCtx.lineWidth = 3;
    logCtx.beginPath();
    logCtx.moveTo(0, hy.y);
    logCtx.lineTo(logCanvas.width, hy.y);
    logCtx.stroke();
    if (Math.abs(alphaLog.im) > 0.01 || Math.abs(alphaLog.re - 1) > 0.01) {
      const slopeGreen = alphaLog.im / (alphaLog.re || 1e-10);
      const thetaAtL0 = theta + (L0 - lnr) / slopeGreen;
      const thetaAtL1 = theta + (L1 - lnr) / slopeGreen;
      const gp0 = zetaToLogPx(L0, thetaAtL0);
      const gp1 = zetaToLogPx(L1, thetaAtL1);
      logCtx.strokeStyle = "rgba(100, 255, 100, 0.6)";
      logCtx.lineWidth = 3;
      logCtx.beginPath();
      logCtx.moveTo(gp0.x, gp0.y);
      logCtx.lineTo(gp1.x, gp1.y);
      logCtx.stroke();
      const slopeOrange = -alphaLog.re / (alphaLog.im || 1e-10);
      const thetaAtL0o = theta + (L0 - lnr) / slopeOrange;
      const thetaAtL1o = theta + (L1 - lnr) / slopeOrange;
      const op0 = zetaToLogPx(L0, thetaAtL0o);
      const op1 = zetaToLogPx(L1, thetaAtL1o);
      logCtx.strokeStyle = "rgba(255, 180, 50, 0.6)";
      logCtx.lineWidth = 3;
      logCtx.beginPath();
      logCtx.moveTo(op0.x, op0.y);
      logCtx.lineTo(op1.x, op1.y);
      logCtx.stroke();
    }
    const lp = zetaToLogPx(lnr, theta);
    logCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    logCtx.beginPath();
    logCtx.arc(lp.x, lp.y, 7, 0, TAU);
    logCtx.fill();
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
        logCtx.arc(ltp.x, ltp.y, 5, 0, TAU);
        logCtx.fill();
      }
    }

    // Panel 3
    const zp = cmul_js(alphaLog, { re: lnr, im: theta });
    const alCtx = overAligned.getContext("2d");
    // Cyan tilted line: constant lnr → ζ' = α·(lnr + iθ) as θ varies
    const zpThetaLo = cmul_js(alphaLog, { re: lnr, im: thetaMin - TAU });
    const zpThetaHi = cmul_js(alphaLog, { re: lnr, im: thetaMax + TAU });
    const ctA0 = zetaPrimeToAlignedPx(zpThetaLo.re, zpThetaLo.im);
    const ctA1 = zetaPrimeToAlignedPx(zpThetaHi.re, zpThetaHi.im);
    alCtx.strokeStyle = "rgba(0, 200, 255, 0.6)";
    alCtx.lineWidth = 3;
    alCtx.beginPath();
    alCtx.moveTo(ctA0.x, ctA0.y);
    alCtx.lineTo(ctA1.x, ctA1.y);
    alCtx.stroke();
    // Pink tilted line: constant θ → ζ' = α·(lnr + iθ₀) as lnr varies
    const zpLnLo = cmul_js(alphaLog, { re: L0, im: theta });
    const zpLnHi = cmul_js(alphaLog, { re: L1, im: theta });
    const ptA0 = zetaPrimeToAlignedPx(zpLnLo.re, zpLnLo.im);
    const ptA1 = zetaPrimeToAlignedPx(zpLnHi.re, zpLnHi.im);
    alCtx.strokeStyle = "rgba(255, 100, 200, 0.6)";
    alCtx.lineWidth = 3;
    alCtx.beginPath();
    alCtx.moveTo(ptA0.x, ptA0.y);
    alCtx.lineTo(ptA1.x, ptA1.y);
    alCtx.stroke();
    const av = zetaPrimeToAlignedPx(zp.re, 0);
    alCtx.strokeStyle = "rgba(100, 255, 100, 0.6)";
    alCtx.lineWidth = 3;
    alCtx.beginPath();
    alCtx.moveTo(av.x, 0);
    alCtx.lineTo(av.x, logAlignedCanvas.height);
    alCtx.stroke();
    const ah = zetaPrimeToAlignedPx(0, zp.im);
    alCtx.strokeStyle = "rgba(255, 180, 50, 0.6)";
    alCtx.lineWidth = 3;
    alCtx.beginPath();
    alCtx.moveTo(0, ah.y);
    alCtx.lineTo(logAlignedCanvas.width, ah.y);
    alCtx.stroke();
    const ap = zetaPrimeToAlignedPx(zp.re, zp.im);
    alCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    alCtx.beginPath();
    alCtx.arc(ap.x, ap.y, 7, 0, TAU);
    alCtx.fill();
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
        alCtx.arc(ltp.x, ltp.y, 5, 0, TAU);
        alCtx.fill();
      }
    }

    // Panel 4
    const drCtx = overDroste.getContext("2d");
    const rDroste = Math.exp(zp.re);
    const thetaDroste = zp.im;

    // Cyan log-spiral: constant lnr → ζ' = α·(lnr + iθ), exp gives r=exp(Re), θ=Im
    const spiralSteps = 300;
    const spiralThetaRange = TAU * 3;
    drCtx.strokeStyle = "rgba(0, 200, 255, 0.6)";
    drCtx.lineWidth = 3;
    drCtx.beginPath();
    for (let i = 0; i <= spiralSteps; i++) {
      const t = -spiralThetaRange / 2 + (spiralThetaRange * i) / spiralSteps;
      const zpS = cmul_js(alphaLog, { re: lnr, im: theta + t });
      const rS = Math.exp(zpS.re);
      const sp = uvToDrostePx(
        polarOrigin.x + rS * Math.cos(zpS.im),
        polarOrigin.y + rS * Math.sin(zpS.im)
      );
      if (i === 0) drCtx.moveTo(sp.x, sp.y);
      else drCtx.lineTo(sp.x, sp.y);
    }
    drCtx.stroke();

    // Pink log-spiral: constant θ → ζ' = α·(lnr + iθ₀), exp gives r=exp(Re), θ=Im
    drCtx.strokeStyle = "rgba(255, 100, 200, 0.6)";
    drCtx.lineWidth = 3;
    drCtx.beginPath();
    for (let i = 0; i <= spiralSteps; i++) {
      const t = L0 + (L1 - L0) * i / spiralSteps;
      const zpS = cmul_js(alphaLog, { re: t, im: theta });
      const rS = Math.exp(zpS.re);
      const sp = uvToDrostePx(
        polarOrigin.x + rS * Math.cos(zpS.im),
        polarOrigin.y + rS * Math.sin(zpS.im)
      );
      if (i === 0) drCtx.moveTo(sp.x, sp.y);
      else drCtx.lineTo(sp.x, sp.y);
    }
    drCtx.stroke();

    // Green circle: constant Re(ζ') → constant r in Droste space
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

    // Orange radial: constant Im(ζ') → constant θ in Droste space
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

    const ddp = uvToDrostePx(
      polarOrigin.x + rDroste * Math.cos(thetaDroste),
      polarOrigin.y + rDroste * Math.sin(thetaDroste)
    );
    drCtx.fillStyle = "rgba(255, 255, 0, 0.9)";
    drCtx.beginPath();
    drCtx.arc(ddp.x, ddp.y, 10, 0, TAU);
    drCtx.fill();
  }

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
    const zeta = cdiv_js({ re: zpRe, im: zpIm }, alphaLog);
    return { lnr: zeta.re, theta: zeta.im };
  }

  function drosteCanvasToZeta(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    const u = (sx - viewCenter.x) * viewScale + 0.5;
    const v = (1 - sy - viewCenter.y) * viewScale + 0.5;
    const dx = u - polarOrigin.x;
    const dy = v - polarOrigin.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-10) return null;
    const thetaD = Math.atan2(dy, dx);
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
