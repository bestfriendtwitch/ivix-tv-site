/* =============================================================
   IVIX_TV — optimized desktop starfield (v8 / site v1.8.29)
   Оптимизация:
   • мобильная версия: canvas не создается;
   • desktop: адаптивное качество под экран и FPS;
   • ограничение FPS до ~42, вместо постоянных 60;
   • меньше дорогих glow/лучей, но визуально фон сохранен;
   • звезды не пересоздаются при каждом мелком resize;
   • туманности перерисовываются мягче и дешевле;
   • вкладка неактивна — анимация полностью останавливается;
   • при падении производительности качество само снижается.
============================================================= */
(function () {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse) and (max-width: 920px)";

  const media = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isMobileLike() {
    return media && media.matches;
  }

  if (isMobileLike() || reduceMotion) {
    return;
  }

  const CONFIG = {
    targetFps: 42,
    minFpsBeforeThrottle: 28,
    dprCap: 1.5,

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

    warmChance: 0.07,
    mouseAmount: 105,
    maxPan: 52,
    mouseEase: 0.06,
    scrollEase: 0.065,

    shootingStars: true,
    shootingEvery: [13, 30],

    nebulae: true,

    // density: меньше число = больше звезд.
    // Эти значения легче, чем v6/v7, но визуально плотность сохранена.
    layers: [
      { density: 1900,  r: [0.24, 0.62], a: [0.04, 0.16], tw: [0.10, 0.42], twDepth: 0.36, pScroll: 0.010, pMouse: 0.10, glow: 0.00, drift: [1.0, 2.8], rayChance: 0.00 },
      { density: 4100,  r: [0.34, 0.92], a: [0.08, 0.30], tw: [0.14, 0.62], twDepth: 0.48, pScroll: 0.024, pMouse: 0.34, glow: 0.04, drift: [1.8, 4.6], rayChance: 0.006 },
      { density: 8800,  r: [0.50, 1.34], a: [0.16, 0.52], tw: [0.18, 0.82], twDepth: 0.56, pScroll: 0.044, pMouse: 0.68, glow: 0.14, drift: [2.8, 7.0], rayChance: 0.018 },
      { density: 23500, r: [0.80, 2.05], a: [0.26, 0.72], tw: [0.20, 0.98], twDepth: 0.62, pScroll: 0.070, pMouse: 1.05, glow: 0.32, drift: [4.0, 10.0], rayChance: 0.040 },
      { density: 68000, r: [1.20, 2.75], a: [0.34, 0.78], tw: [0.16, 0.72], twDepth: 0.48, pScroll: 0.090, pMouse: 1.28, glow: 0.44, drift: [5.0, 13.0], rayChance: 0.16 },
    ],
  };

  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "0",
    pointerEvents: "none",
    display: "block",
    background: "transparent",
  });

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  let W = 0;
  let H = 0;
  let dpr = 1;
  let quality = 1;
  let frameInterval = 1000 / CONFIG.targetFps;
  let lastDraw = 0;
  let fpsSamples = [];
  let lastResizeKey = "";

  let marginX = 0;
  let marginY = 0;
  let layers = [];
  let nebulae = [];
  let glowSprites = {};
  let scrollFrac = 0;
  let scrollDisp = 0;
  let mx = 0;
  let my = 0;
  let tmx = 0;
  let tmy = 0;
  let rafId = null;
  let mounted = false;
  let shoot = null;
  let nextShoot = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function injectCss() {
    if (document.getElementById("ivix-bg-optimized-style")) return;

    const style = document.createElement("style");
    style.id = "ivix-bg-optimized-style";
    style.textContent = `
      html, body {
        background-color: #05030b;
      }

      #ivix-bg-canvas {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 0 !important;
        pointer-events: none !important;
        display: block !important;
      }

      body > :not(#ivix-bg-canvas):not(style):not(script) {
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
    if (Math.random() < CONFIG.warmChance) {
      i = 4;
    } else {
      i = (Math.random() * (CONFIG.colorsTop.length - 1)) | 0;
    }

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

    gradient.addColorStop(0, "rgba(" + color + ",0.58)");
    gradient.addColorStop(0.22, "rgba(" + color + ",0.18)");
    gradient.addColorStop(1, "rgba(" + color + ",0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    return c;
  }

  function calcQuality() {
    const area = window.innerWidth * window.innerHeight;
    const cores = navigator.hardwareConcurrency || 4;

    let q = 1;

    if (area > 2400000) q *= 0.74;
    else if (area > 1700000) q *= 0.84;

    if (cores <= 4) q *= 0.82;
    if (cores <= 2) q *= 0.68;

    return clamp(q, 0.48, 1);
  }

  function buildLayer(cfg, layerIndex) {
    const fieldW = W + marginX * 2;
    const fieldH = H + marginY * 2;
    const n = Math.max(8, Math.round((fieldW * fieldH * quality) / cfg.density));
    const stars = [];

    for (let i = 0; i < n; i += 1) {
      const pair = pickColorPair();
      const r = rand(cfg.r[0], cfg.r[1]);
      const isBright = Math.random() < cfg.rayChance || r > 2.28;

      stars.push({
        x: rand(-marginX, W + marginX),
        y: rand(-marginY, H + marginY),
        r,
        a: rand(cfg.a[0], cfg.a[1]),
        sp: rand(cfg.tw[0], cfg.tw[1]),
        ph: rand(0, Math.PI * 2),
        colorTop: pair.top,
        colorBottom: pair.bottom,
        glow: Math.random() < cfg.glow,
        ray: isBright,
        rayLen: rand(8, 22) * (0.7 + r * 0.30),
        rayAngle: rand(0, Math.PI),
        rayAlpha: rand(0.06, 0.18) * (layerIndex + 1) / CONFIG.layers.length,
        driftAmpX: rand(cfg.drift[0], cfg.drift[1]),
        driftAmpY: rand(cfg.drift[0], cfg.drift[1]) * 0.64,
        driftSpeedX: rand(0.040, 0.135),
        driftSpeedY: rand(0.035, 0.125),
        driftPhaseX: rand(0, Math.PI * 2),
        driftPhaseY: rand(0, Math.PI * 2),
      });
    }

    return { cfg, stars };
  }

  function buildNebulae() {
    if (!CONFIG.nebulae) return [];

    const minSide = Math.min(W, H);
    const scale = clamp(minSide / 900, 0.72, 1.25);

    return [
      { x: W * 0.14, y: H * 0.24, w: W * 0.72 * scale, h: H * 0.58 * scale, rot: -0.12, colorA: "132, 70, 255", colorB: "80, 38, 160", alpha: 0.062, speed: 0.038, phase: rand(0, Math.PI * 2) },
      { x: W * 0.86, y: H * 0.20, w: W * 0.74 * scale, h: H * 0.54 * scale, rot: 0.18, colorA: "180, 104, 255", colorB: "68, 26, 140", alpha: 0.050, speed: 0.032, phase: rand(0, Math.PI * 2) },
      { x: W * 0.56, y: H * 0.80, w: W * 0.80 * scale, h: H * 0.50 * scale, rot: -0.06, colorA: "116, 74, 255", colorB: "44, 22, 92", alpha: 0.040, speed: 0.030, phase: rand(0, Math.PI * 2) },
    ];
  }

  function rebuild() {
    quality = calcQuality();
    layers = CONFIG.layers.map(buildLayer);
    nebulae = buildNebulae();

    glowSprites = {};
    const allColors = CONFIG.colorsTop.concat(CONFIG.colorsBottom);
    for (const color of allColors) {
      glowSprites[color] = makeGlow(56, color);
    }
  }

  function resize() {
    if (isMobileLike()) {
      stopAndRemove();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    H = Math.max(1, Math.round(rect.height || window.innerHeight || 1));

    const resizeKey = W + "x" + H + "@" + Math.min(window.devicePixelRatio || 1, CONFIG.dprCap).toFixed(2);
    if (resizeKey === lastResizeKey && layers.length) return;
    lastResizeKey = resizeKey;

    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    marginX = CONFIG.mouseAmount + 84;
    marginY = CONFIG.maxPan + CONFIG.mouseAmount + 100;

    rebuild();
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - window.innerHeight) || 1;
    scrollFrac = clamp((window.scrollY || doc.scrollTop || 0) / max, 0, 1);
  }

  function onMouse(e) {
    if (!W || !H) return;
    tmx = (e.clientX / W) * 2 - 1;
    tmy = (e.clientY / H) * 2 - 1;
  }

  function drawSpaceBase() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05030b");
    grad.addColorStop(0.44, "#100520");
    grad.addColorStop(1, "#05030b");

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const sideA = ctx.createRadialGradient(W * 0.10, H * 0.22, 0, W * 0.10, H * 0.22, W * 0.55);
    sideA.addColorStop(0, "rgba(116, 50, 255, 0.16)");
    sideA.addColorStop(0.48, "rgba(82, 32, 180, 0.06)");
    sideA.addColorStop(1, "rgba(82, 32, 180, 0)");
    ctx.fillStyle = sideA;
    ctx.fillRect(0, 0, W, H);

    const sideB = ctx.createRadialGradient(W * 0.92, H * 0.18, 0, W * 0.92, H * 0.18, W * 0.55);
    sideB.addColorStop(0, "rgba(155, 70, 255, 0.13)");
    sideB.addColorStop(0.44, "rgba(94, 36, 190, 0.05)");
    sideB.addColorStop(1, "rgba(94, 36, 190, 0)");
    ctx.fillStyle = sideB;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOrganicNebula(n, tnow) {
    const pulse = Math.sin(tnow * n.speed + n.phase) * 0.5 + 0.5;
    const shapeA = Math.sin(tnow * n.speed * 0.7 + n.phase * 1.3);
    const shapeB = Math.cos(tnow * n.speed * 0.9 + n.phase * 0.8);

    ctx.save();
    ctx.translate(n.x + shapeA * W * 0.012, n.y + shapeB * H * 0.010);
    ctx.rotate(n.rot + shapeA * 0.025);
    ctx.scale(n.w / 2, n.h / 2);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = n.alpha * (0.75 + pulse * 0.35);

    for (let i = 0; i < 3; i += 1) {
      const ang = i * 2.1 + n.phase;
      const cx = Math.cos(ang + tnow * n.speed * 0.45) * (0.10 + i * 0.018);
      const cy = Math.sin(ang * 1.15 - tnow * n.speed * 0.40) * (0.09 + i * 0.012);
      const radius = 0.50 + i * 0.095;

      const gradient = ctx.createRadialGradient(cx, cy, 0.04, cx, cy, radius);
      gradient.addColorStop(0, "rgba(" + n.colorA + ",0.48)");
      gradient.addColorStop(0.38, "rgba(" + n.colorB + ",0.18)");
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
      grad.addColorStop(0.47, "rgba(" + color + "," + (opacity * 0.36).toFixed(3) + ")");
      grad.addColorStop(0.50, "rgba(255,255,255," + opacity.toFixed(3) + ")");
      grad.addColorStop(0.53, "rgba(" + color + "," + (opacity * 0.36).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + color + ",0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }

    strokeLine(angle, len, 0.60, a);
    strokeLine(angle + Math.PI / 2, len * 0.54, 0.42, a * 0.48);

    ctx.restore();
  }

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.24, 0.56) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    const speed = rand(720, 1080);

    shoot = {
      x: fromLeft ? rand(-0.10, 0.32) * W : rand(0.68, 1.10) * W,
      y: rand(-0.08, 0.34) * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: rand(0.72, 1.22),
      len: rand(130, 220),
      color: Math.random() < 0.25 ? CONFIG.colorsTop[4] : CONFIG.colorsTop[1],
    };
  }

  function drawShoot(dt, tnow) {
    if (!CONFIG.shootingStars) return;

    if (!shoot) {
      if (tnow >= nextShoot) spawnShoot();
      return;
    }

    shoot.life += dt;
    shoot.x += shoot.vx * dt;
    shoot.y += shoot.vy * dt;

    const f = shoot.life / shoot.max;
    if (f >= 1) {
      shoot = null;
      nextShoot = tnow + rand(CONFIG.shootingEvery[0], CONFIG.shootingEvery[1]);
      return;
    }

    const env = Math.sin(Math.min(f, 1) * Math.PI);
    const speed = Math.hypot(shoot.vx, shoot.vy) || 1;
    const ux = shoot.vx / speed;
    const uy = shoot.vy / speed;
    const tailX = shoot.x - ux * shoot.len;
    const tailY = shoot.y - uy * shoot.len;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const gradient = ctx.createLinearGradient(shoot.x, shoot.y, tailX, tailY);
    gradient.addColorStop(0, "rgba(" + shoot.color + "," + (0.74 * env).toFixed(3) + ")");
    gradient.addColorStop(0.38, "rgba(" + shoot.color + "," + (0.30 * env).toFixed(3) + ")");
    gradient.addColorStop(1, "rgba(" + shoot.color + ",0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.20;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoot.x, shoot.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.restore();
  }

  function drawStars(tnow) {
    ctx.globalCompositeOperation = "lighter";

    const colorShift = Math.pow(scrollDisp, 0.82);

    for (const layer of layers) {
      const cfg = layer.cfg;
      const offX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const offY = -scrollDisp * CONFIG.maxPan * cfg.pScroll - my * CONFIG.mouseAmount * cfg.pMouse;

      for (const s of layer.stars) {
        const tw = (1 - cfg.twDepth) + cfg.twDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.55);
        const a = s.a * tw;
        if (a <= 0.010) continue;

        const driftX = Math.sin(tnow * s.driftSpeedX + s.driftPhaseX) * s.driftAmpX;
        const driftY = Math.cos(tnow * s.driftSpeedY + s.driftPhaseY) * s.driftAmpY;

        const px = s.x + offX + driftX;
        const py = s.y + offY + driftY;

        if (px < -70 || px > W + 70 || py < -70 || py > H + 70) continue;

        const color = mixRgb(s.colorTop, s.colorBottom, colorShift);

        if (s.glow) {
          const gr = s.r * 4.8;
          ctx.globalAlpha = a * 0.42;
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
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.48, a * 0.62).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.32, s.r * 0.34), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawFrame(t) {
    const tnow = t / 1000;
    const dt = Math.min(0.06, (t - lastDraw) / 1000) || 0;

    mx += (tmx - mx) * CONFIG.mouseEase;
    my += (tmy - my) * CONFIG.mouseEase;
    scrollDisp += (scrollFrac - scrollDisp) * CONFIG.scrollEase;

    drawSpaceBase();

    if (CONFIG.nebulae) {
      for (const n of nebulae) drawOrganicNebula(n, tnow);
    }

    drawStars(tnow);
    drawShoot(dt, tnow);
  }

  function monitorPerformance(delta) {
    if (!delta) return;

    const fps = 1000 / delta;
    fpsSamples.push(fps);
    if (fpsSamples.length < 90) return;

    const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
    fpsSamples = [];

    if (avg < CONFIG.minFpsBeforeThrottle && quality > 0.52) {
      quality = Math.max(0.52, quality * 0.82);
      CONFIG.targetFps = Math.max(32, CONFIG.targetFps - 6);
      frameInterval = 1000 / CONFIG.targetFps;
      rebuild();
    }
  }

  function frame(t) {
    rafId = requestAnimationFrame(frame);

    const delta = t - lastDraw;
    if (delta < frameInterval) return;

    monitorPerformance(delta);
    lastDraw = t - (delta % frameInterval);
    drawFrame(t);
  }

  function stopAndRemove() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
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

  function start() {
    if (isMobileLike()) {
      stopAndRemove();
      return;
    }

    injectCss();
    if (!mounted) {
      mounted = true;
      (document.body || document.documentElement).appendChild(canvas);
    }

    resize();
    onScroll();
    scrollDisp = scrollFrac;
    nextShoot = performance.now() / 1000 + rand(5, 12);

    const debouncedResize = debounce(resize, 180);

    window.addEventListener("resize", debouncedResize, { passive: true });
    window.addEventListener("orientationchange", debouncedResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (media && media.addEventListener) {
      media.addEventListener("change", debouncedResize);
    }

    lastDraw = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
