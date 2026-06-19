/* =============================================================
   IVIX_TV — fixed-wrapper page canvas starfield (v25 / site v1.8.48)
   • mobile: canvas не создается;
   • desktop: 30 FPS;
   • no second scrollbar: wrapper is fixed + overflow:hidden;
   • old smooth principle restored: large page-canvas moves with scroll by transform;
   • no redraw/rebuild loops during Ctrl+F5;
   • faster clockwise rotation and frequent random shooting stars preserved.
============================================================= */
(function () {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse) and (max-width: 920px)";
  const media = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if ((media && media.matches) || reduceMotion) return;

  const CONFIG = {
    targetFps: 30,
    dprCap: 1.10,
    maxCanvasHeight: 9000,

    colorsTop: [
      "205, 218, 255",
      "235, 240, 255",
      "215, 200, 255",
      "190, 172, 255",
      "255, 236, 210",
    ],
    colorsBottom: [
      "158, 188, 255",
      "185, 162, 255",
      "205, 125, 255",
      "130, 100, 255",
      "225, 198, 255",
    ],

    warmChance: 0.08,
    mouseAmount: 198,
    mouseEase: 0.055,

    galaxyRotation: 0.0139,
    trailAlpha: 0.78,

    shootingStars: true,
    shootingEvery: [3.1, 7.8],
    maxShootingStars: 4,
    nebulae: true,

    layers: [
      { density: 2050,  r: [0.24, 0.62], a: [0.04, 0.17], tw: [0.10, 0.42], twDepth: 0.34, pMouse: 0.04, rotation: 0.42, glow: 0.00, drift: [0.6, 1.5], rayChance: 0.00 },
      { density: 4550,  r: [0.34, 0.95], a: [0.08, 0.32], tw: [0.14, 0.62], twDepth: 0.46, pMouse: 0.12, rotation: 0.70, glow: 0.035, drift: [0.9, 2.4], rayChance: 0.008 },
      { density: 9800,  r: [0.50, 1.42], a: [0.16, 0.56], tw: [0.18, 0.82], twDepth: 0.54, pMouse: 0.22, rotation: 0.98, glow: 0.12, drift: [1.4, 3.5], rayChance: 0.022 },
      { density: 26000, r: [0.80, 2.18], a: [0.26, 0.78], tw: [0.20, 0.98], twDepth: 0.60, pMouse: 0.34, rotation: 1.26, glow: 0.26, drift: [1.8, 4.8], rayChance: 0.052 },
      { density: 70000, r: [1.20, 2.95], a: [0.38, 0.86], tw: [0.16, 0.72], twDepth: 0.48, pMouse: 0.46, rotation: 1.54, glow: 0.36, drift: [2.2, 5.6], rayChance: 0.18 },
    ],
  };

  const wrap = document.createElement("div");
  wrap.id = "ivix-bg-wrap";
  wrap.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  let W = 0;
  let pageH = 0;
  let dpr = 1;
  let quality = 1;
  let frameInterval = 1000 / CONFIG.targetFps;
  let lastDraw = 0;
  let firstFrame = true;
  let lastResizeKey = "";

  let margin = 0;
  let layers = [];
  let nebulae = [];
  let glowSprites = {};
  let mx = 0;
  let my = 0;
  let tmx = 0;
  let tmy = 0;
  let rafId = null;
  let mounted = false;
  let shoots = [];
  let nextShoot = 0;
  let scrollRaf = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function injectCss() {
    if (document.getElementById("ivix-bg-fixed-wrapper-style")) return;

    const style = document.createElement("style");
    style.id = "ivix-bg-fixed-wrapper-style";
    style.textContent = `
      html {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        scrollbar-gutter: stable;
      }

      html,
      body {
        background-color: #05030b;
      }

      body {
        position: relative !important;
        overflow-x: hidden !important;
        max-width: 100vw !important;
      }

      #ivix-bg-wrap {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        overflow: hidden !important;
        pointer-events: none !important;
        z-index: 0 !important;
        contain: layout paint size style !important;
      }

      #ivix-bg-wrap > #ivix-bg-canvas {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100vw !important;
        height: var(--ivix-page-bg-height, 100vh) !important;
        max-width: 100vw !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        display: block !important;
        overflow: hidden !important;
        pointer-events: none !important;
        will-change: transform !important;
        transform: translate3d(0, 0, 0);
      }

      body > :not(#ivix-bg-wrap):not(style):not(script) {
        position: relative;
        z-index: 2;
      }

      .site-header {
        z-index: 1200 !important;
      }

      .bg-scene,
      .bg-layer,
      .bg-energy-layer,
      .noise {
        display: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function parseRgb(rgb) {
    return rgb.split(",").map((x) => parseFloat(x.trim()));
  }

  function mixRgb(a, b, t) {
    const ca = parseRgb(a);
    const cb = parseRgb(b);
    return [
      Math.round(lerp(ca[0], cb[0], t)),
      Math.round(lerp(ca[1], cb[1], t)),
      Math.round(lerp(ca[2], cb[2], t)),
    ].join(", ");
  }

  function pickColorPair() {
    let i;
    if (Math.random() < CONFIG.warmChance) i = 4;
    else i = (Math.random() * (CONFIG.colorsTop.length - 1)) | 0;

    return {
      top: CONFIG.colorsTop[i],
      bottom: CONFIG.colorsBottom[i % CONFIG.colorsBottom.length],
    };
  }

  function makeGlow(size, color) {
    const c = document.createElement("canvas");
    c.width = c.height = size;

    const g = c.getContext("2d");
    const gradient = g.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );

    gradient.addColorStop(0, "rgba(" + color + ",0.50)");
    gradient.addColorStop(0.22, "rgba(" + color + ",0.14)");
    gradient.addColorStop(1, "rgba(" + color + ",0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    return c;
  }

  function calcQuality() {
    const area = W * Math.min(pageH, window.innerHeight || 900);
    const cores = navigator.hardwareConcurrency || 4;

    let q = 1;
    if (area > 2400000) q *= 0.68;
    else if (area > 1700000) q *= 0.80;
    if (cores <= 4) q *= 0.82;
    if (cores <= 2) q *= 0.68;

    return clamp(q, 0.44, 1);
  }

  function buildLayer(cfg, layerIndex) {
    const worldArea = W * (pageH + margin * 2);
    const n = Math.max(10, Math.round((worldArea * quality) / cfg.density));
    const stars = [];

    for (let i = 0; i < n; i += 1) {
      const pair = pickColorPair();
      const r = rand(cfg.r[0], cfg.r[1]);
      const isBright = Math.random() < cfg.rayChance || r > 2.28;

      stars.push({
        x: rand(-margin, W + margin),
        y: rand(-margin, pageH + margin),
        r,
        a: rand(cfg.a[0], cfg.a[1]),
        sp: rand(cfg.tw[0], cfg.tw[1]),
        ph: rand(0, Math.PI * 2),
        colorTop: pair.top,
        colorBottom: pair.bottom,
        glow: Math.random() < cfg.glow,
        ray: isBright,
        rayLen: rand(8, 22) * (0.7 + r * 0.28),
        rayAngle: rand(0, Math.PI),
        rayAlpha: rand(0.055, 0.18) * (layerIndex + 1) / CONFIG.layers.length,
        driftAmpX: rand(cfg.drift[0], cfg.drift[1]),
        driftAmpY: rand(cfg.drift[0], cfg.drift[1]) * 0.50,
        driftSpeedX: rand(0.020, 0.060),
        driftSpeedY: rand(0.018, 0.055),
        driftPhaseX: rand(0, Math.PI * 2),
        driftPhaseY: rand(0, Math.PI * 2),
      });
    }

    return { cfg, stars };
  }

  function buildNebulae() {
    if (!CONFIG.nebulae) return [];

    const viewportH = window.innerHeight || 900;
    const scale = clamp(Math.min(W, viewportH) / 900, 0.72, 1.15);

    return [
      { x: W * 0.12, y: pageH * 0.18, w: W * 0.72 * scale, h: viewportH * 0.58 * scale, rot: -0.12, colorA: "132, 70, 255", colorB: "80, 38, 160", alpha: 0.035, speed: 0.018, phase: rand(0, Math.PI * 2) },
      { x: W * 0.86, y: pageH * 0.34, w: W * 0.74 * scale, h: viewportH * 0.54 * scale, rot: 0.18, colorA: "180, 104, 255", colorB: "68, 26, 140", alpha: 0.028, speed: 0.016, phase: rand(0, Math.PI * 2) },
      { x: W * 0.48, y: pageH * 0.66, w: W * 0.82 * scale, h: viewportH * 0.50 * scale, rot: -0.06, colorA: "116, 74, 255", colorB: "44, 22, 92", alpha: 0.024, speed: 0.014, phase: rand(0, Math.PI * 2) },
    ];
  }

  function rebuild() {
    quality = calcQuality();
    layers = CONFIG.layers.map(buildLayer);
    nebulae = buildNebulae();

    glowSprites = {};
    const allColors = CONFIG.colorsTop.concat(CONFIG.colorsBottom);
    for (const color of allColors) {
      glowSprites[color] = makeGlow(52, color);
    }

    firstFrame = true;
  }

  function getNaturalPageHeight() {
    // The wrapper is fixed and out of document flow, so it should not affect scrollHeight.
    return Math.max(
      window.innerHeight || 1,
      document.documentElement.scrollHeight || 0,
      document.body ? document.body.scrollHeight || 0 : 0
    );
  }

  function resize() {
    if (media && media.matches) {
      stopAndRemove();
      return;
    }

    W = Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || 1));
    pageH = Math.min(getNaturalPageHeight(), CONFIG.maxCanvasHeight);

    const nextDpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    const resizeKey = W + "x" + pageH + "@" + nextDpr.toFixed(2);

    if (resizeKey === lastResizeKey && layers.length) {
      updateCanvasTransform();
      return;
    }

    lastResizeKey = resizeKey;
    dpr = nextDpr;

    canvas.style.setProperty("--ivix-page-bg-height", pageH + "px");
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(pageH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    margin = Math.max(W, window.innerHeight || 900) * 0.24 + CONFIG.mouseAmount;
    rebuild();
    updateCanvasTransform();
  }

  function updateCanvasTransform() {
    const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    canvas.style.transform = "translate3d(0," + (-Math.round(y)) + "px,0)";
  }

  function scheduleCanvasTransform() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateCanvasTransform();
    });
  }

  function onMouse(e) {
    if (!W || !pageH) return;
    tmx = (e.clientX / W) * 2 - 1;
    tmy = (e.clientY / Math.max(1, window.innerHeight || 1)) * 2 - 1;
  }

  function drawSpaceBase(isFirst) {
    ctx.globalCompositeOperation = "source-over";

    if (!isFirst) {
      ctx.fillStyle = "rgba(5, 3, 11, " + CONFIG.trailAlpha + ")";
      ctx.fillRect(0, 0, W, pageH);
      return;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, pageH);
    grad.addColorStop(0, "#05030b");
    grad.addColorStop(0.44, "#100520");
    grad.addColorStop(1, "#05030b");

    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, pageH);
  }

  function drawAmbientGlow() {
    const sideA = ctx.createRadialGradient(W * 0.10, pageH * 0.22, 0, W * 0.10, pageH * 0.22, W * 0.55);
    sideA.addColorStop(0, "rgba(116, 50, 255, 0.034)");
    sideA.addColorStop(0.48, "rgba(82, 32, 180, 0.013)");
    sideA.addColorStop(1, "rgba(82, 32, 180, 0)");
    ctx.fillStyle = sideA;
    ctx.fillRect(0, 0, W, pageH);

    const sideB = ctx.createRadialGradient(W * 0.92, pageH * 0.42, 0, W * 0.92, pageH * 0.42, W * 0.55);
    sideB.addColorStop(0, "rgba(155, 70, 255, 0.032)");
    sideB.addColorStop(0.44, "rgba(94, 36, 190, 0.012)");
    sideB.addColorStop(1, "rgba(94, 36, 190, 0)");
    ctx.fillStyle = sideB;
    ctx.fillRect(0, 0, W, pageH);
  }

  function drawOrganicNebula(n, tnow) {
    const pulse = Math.sin(tnow * n.speed + n.phase) * 0.5 + 0.5;
    const shapeA = Math.sin(tnow * n.speed * 0.7 + n.phase * 1.3);
    const shapeB = Math.cos(tnow * n.speed * 0.9 + n.phase * 0.8);

    ctx.save();
    ctx.translate(n.x + shapeA * W * 0.008, n.y + shapeB * (window.innerHeight || 900) * 0.006);
    ctx.rotate(n.rot + shapeA * 0.018);
    ctx.scale(n.w / 2, n.h / 2);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = n.alpha * (0.70 + pulse * 0.25);

    for (let i = 0; i < 2; i += 1) {
      const ang = i * 2.3 + n.phase;
      const cx = Math.cos(ang + tnow * n.speed * 0.30) * (0.10 + i * 0.018);
      const cy = Math.sin(ang * 1.15 - tnow * n.speed * 0.28) * (0.09 + i * 0.012);
      const radius = 0.55 + i * 0.10;

      const gradient = ctx.createRadialGradient(cx, cy, 0.04, cx, cy, radius);
      gradient.addColorStop(0, "rgba(" + n.colorA + ",0.30)");
      gradient.addColorStop(0.42, "rgba(" + n.colorB + ",0.10)");
      gradient.addColorStop(1, "rgba(" + n.colorB + ",0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRay(px, py, star, color, alpha, tnow) {
    const len = star.rayLen * (0.86 + Math.sin(tnow * star.sp * 0.65 + star.ph) * 0.08);
    const angle = star.rayAngle;
    const a = alpha * star.rayAlpha;
    if (a <= 0.012) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    function strokeLine(theta, length, lineWidth, opacity) {
      const dx = Math.cos(theta) * length;
      const dy = Math.sin(theta) * length;
      const grad = ctx.createLinearGradient(px - dx, py - dy, px + dx, py + dy);

      grad.addColorStop(0, "rgba(" + color + ",0)");
      grad.addColorStop(0.47, "rgba(" + color + "," + (opacity * 0.30).toFixed(3) + ")");
      grad.addColorStop(0.50, "rgba(255,255,255," + opacity.toFixed(3) + ")");
      grad.addColorStop(0.53, "rgba(" + color + "," + (opacity * 0.30).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + color + ",0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }

    strokeLine(angle, len, 0.52, a);
    strokeLine(angle + Math.PI / 2, len * 0.48, 0.36, a * 0.40);

    ctx.restore();
  }

  function spawnShoot() {
    if (!CONFIG.shootingStars || shoots.length >= CONFIG.maxShootingStars) return;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewportH = window.innerHeight || 900;
    const edge = Math.floor(Math.random() * 4);
    let x, y, angle;

    if (edge === 0) {
      x = -60;
      y = scrollY + rand(-0.12, 1.12) * viewportH;
      angle = rand(-0.75, 0.75);
    } else if (edge === 1) {
      x = W + 60;
      y = scrollY + rand(-0.12, 1.12) * viewportH;
      angle = Math.PI + rand(-0.75, 0.75);
    } else if (edge === 2) {
      x = rand(-0.10, 1.10) * W;
      y = scrollY - 80;
      angle = Math.PI / 2 + rand(-0.85, 0.85);
    } else {
      x = rand(-0.10, 1.10) * W;
      y = scrollY + viewportH + 80;
      angle = -Math.PI / 2 + rand(-0.85, 0.85);
    }

    const speed = rand(650, 1160);

    shoots.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: rand(0.60, 1.15),
      len: rand(105, 230),
      width: rand(0.85, 1.25),
      color: Math.random() < 0.26 ? CONFIG.colorsTop[4] : CONFIG.colorsTop[(Math.random() * 3) | 0],
    });
  }

  function drawShoots(dt, tnow) {
    if (!CONFIG.shootingStars) return;

    if (tnow >= nextShoot) {
      spawnShoot();
      if (Math.random() < 0.35) spawnShoot();
      nextShoot = tnow + rand(CONFIG.shootingEvery[0], CONFIG.shootingEvery[1]);
    }

    for (let i = shoots.length - 1; i >= 0; i -= 1) {
      const s = shoots[i];

      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const f = s.life / s.max;
      if (f >= 1) {
        shoots.splice(i, 1);
        continue;
      }

      const env = Math.sin(Math.min(f, 1) * Math.PI);
      const speed = Math.hypot(s.vx, s.vy) || 1;
      const ux = s.vx / speed;
      const uy = s.vy / speed;
      const tailX = s.x - ux * s.len;
      const tailY = s.y - uy * s.len;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const gradient = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
      gradient.addColorStop(0, "rgba(" + s.color + "," + (0.66 * env).toFixed(3) + ")");
      gradient.addColorStop(0.38, "rgba(" + s.color + "," + (0.24 * env).toFixed(3) + ")");
      gradient.addColorStop(1, "rgba(" + s.color + ",0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawStars(tnow) {
    ctx.globalCompositeOperation = "lighter";

    const colorShift = 0.34;
    const cx = W / 2;
    const cy = pageH / 2;

    for (const layer of layers) {
      const cfg = layer.cfg;
      const mouseX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const mouseY = -my * CONFIG.mouseAmount * cfg.pMouse;

      const rot = tnow * CONFIG.galaxyRotation * cfg.rotation;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (const s of layer.stars) {
        const tw = (1 - cfg.twDepth) + cfg.twDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.55);
        const a = s.a * tw;
        if (a <= 0.010) continue;

        const dx = s.x - cx;
        const dy = s.y - cy;

        const px = cx + dx * cos - dy * sin + mouseX + Math.sin(tnow * s.driftSpeedX + s.driftPhaseX) * s.driftAmpX;
        const py = cy + dx * sin + dy * cos + mouseY + Math.cos(tnow * s.driftSpeedY + s.driftPhaseY) * s.driftAmpY;

        if (px < -90 || px > W + 90 || py < -90 || py > pageH + 90) continue;

        const color = mixRgb(s.colorTop, s.colorBottom, colorShift);

        if (s.glow) {
          const gr = s.r * 4.15;
          ctx.globalAlpha = a * 0.34;
          const sprite = glowSprites[s.colorTop] || glowSprites[CONFIG.colorsTop[1]];
          ctx.drawImage(sprite, px - gr, py - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
        }

        if (s.ray) drawRay(px, py, s, color, a, tnow);

        ctx.fillStyle = "rgba(" + color + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.7) {
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.42, a * 0.56).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.28, s.r * 0.30), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawFrame(t) {
    const tnow = t / 1000;
    const dt = Math.min(0.07, (t - lastDraw) / 1000) || 0;

    mx += (tmx - mx) * CONFIG.mouseEase;
    my += (tmy - my) * CONFIG.mouseEase;

    drawSpaceBase(firstFrame);
    if (firstFrame) firstFrame = false;

    drawAmbientGlow();

    if (CONFIG.nebulae) {
      for (const n of nebulae) drawOrganicNebula(n, tnow);
    }

    drawStars(tnow);
    drawShoots(dt, tnow);
  }

  function frame(t) {
    rafId = requestAnimationFrame(frame);

    const delta = t - lastDraw;
    if (delta < frameInterval) return;

    lastDraw = t - (delta % frameInterval);
    drawFrame(t);
  }

  function stopAndRemove() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    mounted = false;
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }

    if (!rafId && mounted) {
      lastDraw = performance.now();
      firstFrame = true;
      rafId = requestAnimationFrame(frame);
    }
  }

  function debounce(fn, ms) {
    let id;
    return function () {
      clearTimeout(id);
      id = setTimeout(fn, ms);
    };
  }

  function applyScrollbarGuard() {
    const html = document.documentElement;
    const body = document.body;

    if (!html || !body) return;

    html.style.overflowX = "hidden";
    html.style.overflowY = "auto";
    html.style.scrollbarGutter = "stable";

    body.style.position = "relative";
    body.style.overflowX = "hidden";
    body.style.maxWidth = "100vw";

    wrap.style.position = "fixed";
    wrap.style.inset = "0";
    wrap.style.width = "100vw";
    wrap.style.height = "100vh";
    wrap.style.overflow = "hidden";
    wrap.style.pointerEvents = "none";
    wrap.style.contain = "layout paint size style";

    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100vw";
    canvas.style.height = pageH + "px";
    canvas.style.maxWidth = "100vw";
    canvas.style.maxHeight = "none";
    canvas.style.overflow = "hidden";
    canvas.style.pointerEvents = "none";
    canvas.style.willChange = "transform";
    canvas.style.setProperty("--ivix-page-bg-height", pageH + "px");

    updateCanvasTransform();

    const oldBgLayers = document.querySelectorAll(".bg-scene, .bg-layer, .bg-energy-layer, .noise");
    oldBgLayers.forEach((el) => {
      el.style.display = "none";
      el.style.overflow = "hidden";
      el.style.maxWidth = "100vw";
      el.style.maxHeight = "100vh";
    });
  }

  function start() {
    if (media && media.matches) {
      stopAndRemove();
      return;
    }

    injectCss();

    if (!mounted) {
      mounted = true;
      wrap.appendChild(canvas);
      (document.body || document.documentElement).appendChild(wrap);
    }

    resize();
    applyScrollbarGuard();
    nextShoot = performance.now() / 1000 + rand(2.2, 5.2);

    const debouncedResize = debounce(() => {
      resize();
      applyScrollbarGuard();
    }, 250);

    const debouncedPageResize = debounce(() => {
      const nextPageH = Math.min(getNaturalPageHeight(), CONFIG.maxCanvasHeight);
      if (Math.abs(nextPageH - pageH) > 180) {
        lastResizeKey = "";
        resize();
        applyScrollbarGuard();
      }
    }, 500);

    window.addEventListener("resize", debouncedResize, { passive: true });
    window.addEventListener("orientationchange", debouncedResize, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("scroll", scheduleCanvasTransform, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(debouncedPageResize);
      ro.observe(document.body);
      ro.observe(document.documentElement);
    }

    if (window.MutationObserver) {
      const mo = new MutationObserver(() => requestAnimationFrame(applyScrollbarGuard));
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    }

    if (media && media.addEventListener) {
      media.addEventListener("change", debouncedResize);
    }

    setInterval(applyScrollbarGuard, 1600);

    lastDraw = performance.now();
    firstFrame = true;
    rafId = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
