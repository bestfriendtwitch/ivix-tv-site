/* =============================================================
   IVIX_TV — optimized rotating galaxy starfield (v9 / site v1.8.32)
   • mobile: canvas не создается;
   • desktop: 30 FPS;
   • фон не привязан к прокрутке сайта;
   • звезды медленно вращаются по часовой стрелке вокруг центра экрана;
   • легкий едва заметный trail без сильной нагрузки;
   • mouse-parallax сохранен, но без scroll-parallax;
   • вкладка неактивна — анимация останавливается.
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
    dprCap: 1.45,

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
    mouseAmount: 96,
    mouseEase: 0.06,

    // One full turn takes a very long time; closer layers rotate a bit faster.
    galaxyRotation: 0.0026,

    trailAlpha: 0.30,

    shootingStars: true,
    shootingEvery: [14, 32],
    nebulae: true,

    layers: [
      { density: 1900,  r: [0.24, 0.62], a: [0.04, 0.16], tw: [0.10, 0.42], twDepth: 0.34, pMouse: 0.10, rotation: 0.42, glow: 0.00, drift: [0.8, 2.0], rayChance: 0.00 },
      { density: 4100,  r: [0.34, 0.92], a: [0.08, 0.30], tw: [0.14, 0.62], twDepth: 0.46, pMouse: 0.30, rotation: 0.68, glow: 0.04, drift: [1.4, 3.5], rayChance: 0.006 },
      { density: 8800,  r: [0.50, 1.34], a: [0.16, 0.52], tw: [0.18, 0.82], twDepth: 0.54, pMouse: 0.56, rotation: 0.92, glow: 0.14, drift: [2.0, 5.2], rayChance: 0.018 },
      { density: 23500, r: [0.80, 2.05], a: [0.26, 0.72], tw: [0.20, 0.98], twDepth: 0.60, pMouse: 0.86, rotation: 1.15, glow: 0.30, drift: [2.8, 7.0], rayChance: 0.040 },
      { density: 68000, r: [1.20, 2.75], a: [0.34, 0.78], tw: [0.16, 0.72], twDepth: 0.48, pMouse: 1.08, rotation: 1.38, glow: 0.42, drift: [3.4, 8.5], rayChance: 0.14 },
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
  let shoot = null;
  let nextShoot = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function injectCss() {
    if (document.getElementById("ivix-bg-rotating-style")) return;

    const style = document.createElement("style");
    style.id = "ivix-bg-rotating-style";
    style.textContent = `
      html, body { background-color: #05030b; }

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

      .site-header { z-index: 1200 !important; }

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

    gradient.addColorStop(0, "rgba(" + color + ",0.54)");
    gradient.addColorStop(0.22, "rgba(" + color + ",0.16)");
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
    if (cores <= 4) q *= 0.84;
    if (cores <= 2) q *= 0.70;

    return clamp(q, 0.50, 1);
  }

  function buildLayer(cfg, layerIndex) {
    const radiusMax = Math.hypot(W, H) / 2 + margin;
    const fieldArea = Math.PI * radiusMax * radiusMax;
    const n = Math.max(8, Math.round((fieldArea * quality) / cfg.density));
    const stars = [];

    for (let i = 0; i < n; i += 1) {
      const pair = pickColorPair();
      const r = rand(cfg.r[0], cfg.r[1]);
      const isBright = Math.random() < cfg.rayChance || r > 2.28;

      // sqrt for even distribution across disk
      const orbitRadius = Math.sqrt(Math.random()) * radiusMax;
      const angle = rand(0, Math.PI * 2);

      stars.push({
        orbitRadius,
        angle,
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
        driftAmpY: rand(cfg.drift[0], cfg.drift[1]) * 0.58,
        driftSpeedX: rand(0.032, 0.100),
        driftSpeedY: rand(0.030, 0.092),
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
      { x: W * 0.14, y: H * 0.24, w: W * 0.72 * scale, h: H * 0.58 * scale, rot: -0.12, colorA: "132, 70, 255", colorB: "80, 38, 160", alpha: 0.052, speed: 0.030, phase: rand(0, Math.PI * 2) },
      { x: W * 0.86, y: H * 0.20, w: W * 0.74 * scale, h: H * 0.54 * scale, rot: 0.18, colorA: "180, 104, 255", colorB: "68, 26, 140", alpha: 0.042, speed: 0.026, phase: rand(0, Math.PI * 2) },
      { x: W * 0.56, y: H * 0.80, w: W * 0.80 * scale, h: H * 0.50 * scale, rot: -0.06, colorA: "116, 74, 255", colorB: "44, 22, 92", alpha: 0.034, speed: 0.022, phase: rand(0, Math.PI * 2) },
    ];
  }

  function rebuild() {
    quality = calcQuality();
    layers = CONFIG.layers.map(buildLayer);
    nebulae = buildNebulae();

    glowSprites = {};
    const allColors = CONFIG.colorsTop.concat(CONFIG.colorsBottom);
    for (const color of allColors) {
      glowSprites[color] = makeGlow(54, color);
    }

    firstFrame = true;
  }

  function resize() {
    if (media && media.matches) {
      stopAndRemove();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    H = Math.max(1, Math.round(rect.height || window.innerHeight || 1));

    const nextDpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    const resizeKey = W + "x" + H + "@" + nextDpr.toFixed(2);

    if (resizeKey === lastResizeKey && layers.length) return;
    lastResizeKey = resizeKey;

    dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    margin = Math.max(W, H) * 0.22 + CONFIG.mouseAmount;
    rebuild();
  }

  function onMouse(e) {
    if (!W || !H) return;
    tmx = (e.clientX / W) * 2 - 1;
    tmy = (e.clientY / H) * 2 - 1;
  }

  function drawSpaceBase(isFirst) {
    ctx.globalCompositeOperation = "source-over";

    if (!isFirst) {
      // This creates a subtle trail while keeping performance cheap.
      ctx.fillStyle = "rgba(5, 3, 11, " + CONFIG.trailAlpha + ")";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05030b");
    grad.addColorStop(0.44, "#100520");
    grad.addColorStop(1, "#05030b");

    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawAmbientGlow() {
    const sideA = ctx.createRadialGradient(W * 0.10, H * 0.22, 0, W * 0.10, H * 0.22, W * 0.55);
    sideA.addColorStop(0, "rgba(116, 50, 255, 0.045)");
    sideA.addColorStop(0.48, "rgba(82, 32, 180, 0.018)");
    sideA.addColorStop(1, "rgba(82, 32, 180, 0)");
    ctx.fillStyle = sideA;
    ctx.fillRect(0, 0, W, H);

    const sideB = ctx.createRadialGradient(W * 0.92, H * 0.18, 0, W * 0.92, H * 0.18, W * 0.55);
    sideB.addColorStop(0, "rgba(155, 70, 255, 0.040)");
    sideB.addColorStop(0.44, "rgba(94, 36, 190, 0.016)");
    sideB.addColorStop(1, "rgba(94, 36, 190, 0)");
    ctx.fillStyle = sideB;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOrganicNebula(n, tnow) {
    const pulse = Math.sin(tnow * n.speed + n.phase) * 0.5 + 0.5;
    const shapeA = Math.sin(tnow * n.speed * 0.7 + n.phase * 1.3);
    const shapeB = Math.cos(tnow * n.speed * 0.9 + n.phase * 0.8);

    ctx.save();
    ctx.translate(n.x + shapeA * W * 0.010, n.y + shapeB * H * 0.008);
    ctx.rotate(n.rot + shapeA * 0.020);
    ctx.scale(n.w / 2, n.h / 2);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = n.alpha * (0.72 + pulse * 0.28);

    for (let i = 0; i < 3; i += 1) {
      const ang = i * 2.1 + n.phase;
      const cx = Math.cos(ang + tnow * n.speed * 0.36) * (0.10 + i * 0.018);
      const cy = Math.sin(ang * 1.15 - tnow * n.speed * 0.32) * (0.09 + i * 0.012);
      const radius = 0.50 + i * 0.095;

      const gradient = ctx.createRadialGradient(cx, cy, 0.04, cx, cy, radius);
      gradient.addColorStop(0, "rgba(" + n.colorA + ",0.38)");
      gradient.addColorStop(0.40, "rgba(" + n.colorB + ",0.14)");
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
      grad.addColorStop(0.47, "rgba(" + color + "," + (opacity * 0.34).toFixed(3) + ")");
      grad.addColorStop(0.50, "rgba(255,255,255," + opacity.toFixed(3) + ")");
      grad.addColorStop(0.53, "rgba(" + color + "," + (opacity * 0.34).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + color + ",0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }

    strokeLine(angle, len, 0.56, a);
    strokeLine(angle + Math.PI / 2, len * 0.52, 0.40, a * 0.44);

    ctx.restore();
  }

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.24, 0.56) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    const speed = rand(700, 1020);

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
    gradient.addColorStop(0, "rgba(" + shoot.color + "," + (0.70 * env).toFixed(3) + ")");
    gradient.addColorStop(0.38, "rgba(" + shoot.color + "," + (0.28 * env).toFixed(3) + ")");
    gradient.addColorStop(1, "rgba(" + shoot.color + ",0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoot.x, shoot.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.restore();
  }

  function drawStars(tnow) {
    ctx.globalCompositeOperation = "lighter";

    const colorShift = 0.28;
    const cx = W / 2;
    const cy = H / 2;

    for (const layer of layers) {
      const cfg = layer.cfg;
      const mouseX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const mouseY = -my * CONFIG.mouseAmount * cfg.pMouse;

      // Clockwise rotation in screen coordinates means negative angle.
      const rot = -tnow * CONFIG.galaxyRotation * cfg.rotation;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (const s of layer.stars) {
        const tw = (1 - cfg.twDepth) + cfg.twDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.55);
        const a = s.a * tw;
        if (a <= 0.010) continue;

        const baseX = Math.cos(s.angle) * s.orbitRadius;
        const baseY = Math.sin(s.angle) * s.orbitRadius;
        const rx = baseX * cos - baseY * sin;
        const ry = baseX * sin + baseY * cos;

        const driftX = Math.sin(tnow * s.driftSpeedX + s.driftPhaseX) * s.driftAmpX;
        const driftY = Math.cos(tnow * s.driftSpeedY + s.driftPhaseY) * s.driftAmpY;

        const px = cx + rx + mouseX + driftX;
        const py = cy + ry + mouseY + driftY;

        if (px < -80 || px > W + 80 || py < -80 || py > H + 80) continue;

        const color = mixRgb(s.colorTop, s.colorBottom, colorShift);

        if (s.glow) {
          const gr = s.r * 4.6;
          ctx.globalAlpha = a * 0.38;
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
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.44, a * 0.58).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.30, s.r * 0.32), 0, Math.PI * 2);
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
    drawShoot(dt, tnow);
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

  function start() {
    if (media && media.matches) {
      stopAndRemove();
      return;
    }

    injectCss();

    if (!mounted) {
      mounted = true;
      (document.body || document.documentElement).appendChild(canvas);
    }

    resize();
    nextShoot = performance.now() / 1000 + rand(5, 12);

    const debouncedResize = debounce(resize, 180);

    window.addEventListener("resize", debouncedResize, { passive: true });
    window.addEventListener("orientationchange", debouncedResize, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (media && media.addEventListener) {
      media.addEventListener("change", debouncedResize);
    }

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
