/* =============================================================
   IVIX_TV — page-scrolling rotating galaxy starfield (v10 / site v1.8.33)
   • mobile: canvas не создается;
   • desktop: 30 FPS;
   • canvas fixed, but stars live in page coordinates and scroll with content;
   • clockwise rotation around center of the whole page;
   • faster rotation;
   • lighter trail / less motion blur;
   • no scroll-fixed background behavior.
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
    mouseAmount: 76,
    mouseEase: 0.055,

    // Faster clockwise page-galaxy rotation.
    galaxyRotation: 0.0065,

    // Higher alpha = shorter trail, lower alpha = longer blur.
    trailAlpha: 0.58,

    shootingStars: true,
    shootingEvery: [15, 34],
    nebulae: true,

    layers: [
      { density: 2550,  r: [0.24, 0.62], a: [0.04, 0.16], tw: [0.10, 0.42], twDepth: 0.34, pMouse: 0.08, rotation: 0.42, glow: 0.00, drift: [0.7, 1.8], rayChance: 0.00 },
      { density: 5400,  r: [0.34, 0.92], a: [0.08, 0.30], tw: [0.14, 0.62], twDepth: 0.46, pMouse: 0.24, rotation: 0.68, glow: 0.035, drift: [1.1, 3.0], rayChance: 0.005 },
      { density: 11800, r: [0.50, 1.34], a: [0.16, 0.52], tw: [0.18, 0.82], twDepth: 0.54, pMouse: 0.45, rotation: 0.94, glow: 0.12, drift: [1.8, 4.6], rayChance: 0.014 },
      { density: 31000, r: [0.80, 2.05], a: [0.26, 0.72], tw: [0.20, 0.98], twDepth: 0.60, pMouse: 0.70, rotation: 1.20, glow: 0.25, drift: [2.4, 6.2], rayChance: 0.032 },
      { density: 90000, r: [1.20, 2.75], a: [0.34, 0.78], tw: [0.16, 0.72], twDepth: 0.48, pMouse: 0.90, rotation: 1.45, glow: 0.34, drift: [3.0, 7.5], rayChance: 0.10 },
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
  let pageH = 0;
  let dpr = 1;
  let quality = 1;
  let frameInterval = 1000 / CONFIG.targetFps;
  let lastDraw = 0;
  let firstFrame = true;
  let lastResizeKey = "";
  let scrollY = 0;

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
    if (document.getElementById("ivix-bg-page-orbit-style")) return;

    const style = document.createElement("style");
    style.id = "ivix-bg-page-orbit-style";
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

    gradient.addColorStop(0, "rgba(" + color + ",0.50)");
    gradient.addColorStop(0.22, "rgba(" + color + ",0.14)");
    gradient.addColorStop(1, "rgba(" + color + ",0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    return c;
  }

  function calcQuality() {
    const area = window.innerWidth * window.innerHeight;
    const cores = navigator.hardwareConcurrency || 4;

    let q = 1;
    if (area > 2400000) q *= 0.72;
    else if (area > 1700000) q *= 0.82;
    if (cores <= 4) q *= 0.82;
    if (cores <= 2) q *= 0.68;

    return clamp(q, 0.46, 1);
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
        rayLen: rand(8, 21) * (0.7 + r * 0.28),
        rayAngle: rand(0, Math.PI),
        rayAlpha: rand(0.055, 0.16) * (layerIndex + 1) / CONFIG.layers.length,
        driftAmpX: rand(cfg.drift[0], cfg.drift[1]),
        driftAmpY: rand(cfg.drift[0], cfg.drift[1]) * 0.55,
        driftSpeedX: rand(0.026, 0.080),
        driftSpeedY: rand(0.024, 0.074),
        driftPhaseX: rand(0, Math.PI * 2),
        driftPhaseY: rand(0, Math.PI * 2),
      });
    }

    return { cfg, stars };
  }

  function buildNebulae() {
    if (!CONFIG.nebulae) return [];

    const scale = clamp(Math.min(W, H) / 900, 0.72, 1.20);

    return [
      { x: W * 0.12, y: pageH * 0.18, w: W * 0.72 * scale, h: H * 0.58 * scale, rot: -0.12, colorA: "132, 70, 255", colorB: "80, 38, 160", alpha: 0.044, speed: 0.022, phase: rand(0, Math.PI * 2) },
      { x: W * 0.86, y: pageH * 0.34, w: W * 0.74 * scale, h: H * 0.54 * scale, rot: 0.18, colorA: "180, 104, 255", colorB: "68, 26, 140", alpha: 0.034, speed: 0.020, phase: rand(0, Math.PI * 2) },
      { x: W * 0.48, y: pageH * 0.66, w: W * 0.82 * scale, h: H * 0.50 * scale, rot: -0.06, colorA: "116, 74, 255", colorB: "44, 22, 92", alpha: 0.030, speed: 0.018, phase: rand(0, Math.PI * 2) },
    ];
  }

  function rebuild() {
    quality = calcQuality();
    layers = CONFIG.layers.map(buildLayer);
    nebulae = buildNebulae();

    glowSprites = {};
    const allColors = CONFIG.colorsTop.concat(CONFIG.colorsBottom);
    for (const color of allColors) {
      glowSprites[color] = makeGlow(50, color);
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
    pageH = Math.max(
      H,
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    );

    const nextDpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    const resizeKey = W + "x" + H + "x" + pageH + "@" + nextDpr.toFixed(2);

    if (resizeKey === lastResizeKey && layers.length) return;
    lastResizeKey = resizeKey;

    dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    margin = Math.max(W, H) * 0.24 + CONFIG.mouseAmount;
    rebuild();
  }

  function onScroll() {
    scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function onMouse(e) {
    if (!W || !H) return;
    tmx = (e.clientX / W) * 2 - 1;
    tmy = (e.clientY / H) * 2 - 1;
  }

  function drawSpaceBase(isFirst) {
    ctx.globalCompositeOperation = "source-over";

    if (!isFirst) {
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
    const worldShift = -(scrollY * 0.18) % H;

    const sideA = ctx.createRadialGradient(W * 0.10, H * 0.25 + worldShift, 0, W * 0.10, H * 0.25 + worldShift, W * 0.55);
    sideA.addColorStop(0, "rgba(116, 50, 255, 0.038)");
    sideA.addColorStop(0.48, "rgba(82, 32, 180, 0.014)");
    sideA.addColorStop(1, "rgba(82, 32, 180, 0)");
    ctx.fillStyle = sideA;
    ctx.fillRect(0, 0, W, H);

    const sideB = ctx.createRadialGradient(W * 0.92, H * 0.20 + worldShift * 0.5, 0, W * 0.92, H * 0.20 + worldShift * 0.5, W * 0.55);
    sideB.addColorStop(0, "rgba(155, 70, 255, 0.034)");
    sideB.addColorStop(0.44, "rgba(94, 36, 190, 0.012)");
    sideB.addColorStop(1, "rgba(94, 36, 190, 0)");
    ctx.fillStyle = sideB;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOrganicNebula(n, tnow) {
    const screenY = n.y - scrollY;
    if (screenY < -H || screenY > H * 2) return;

    const pulse = Math.sin(tnow * n.speed + n.phase) * 0.5 + 0.5;
    const shapeA = Math.sin(tnow * n.speed * 0.7 + n.phase * 1.3);
    const shapeB = Math.cos(tnow * n.speed * 0.9 + n.phase * 0.8);

    ctx.save();
    ctx.translate(n.x + shapeA * W * 0.010, screenY + shapeB * H * 0.008);
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
      gradient.addColorStop(0, "rgba(" + n.colorA + ",0.34)");
      gradient.addColorStop(0.40, "rgba(" + n.colorB + ",0.12)");
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
      grad.addColorStop(0.47, "rgba(" + color + "," + (opacity * 0.32).toFixed(3) + ")");
      grad.addColorStop(0.50, "rgba(255,255,255," + opacity.toFixed(3) + ")");
      grad.addColorStop(0.53, "rgba(" + color + "," + (opacity * 0.32).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + color + ",0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }

    strokeLine(angle, len, 0.54, a);
    strokeLine(angle + Math.PI / 2, len * 0.50, 0.38, a * 0.42);

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
      len: rand(130, 210),
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
    gradient.addColorStop(0, "rgba(" + shoot.color + "," + (0.64 * env).toFixed(3) + ")");
    gradient.addColorStop(0.38, "rgba(" + shoot.color + "," + (0.24 * env).toFixed(3) + ")");
    gradient.addColorStop(1, "rgba(" + shoot.color + ",0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoot.x, shoot.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.restore();
  }

  function drawStars(tnow) {
    ctx.globalCompositeOperation = "lighter";

    const colorShift = clamp(scrollY / Math.max(1, pageH - H), 0, 1) * 0.55;
    const cx = W / 2;
    const cy = pageH / 2;

    for (const layer of layers) {
      const cfg = layer.cfg;
      const mouseX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const mouseY = -my * CONFIG.mouseAmount * cfg.pMouse;

      // Positive angle is clockwise in canvas coordinates because Y goes downward.
      const rot = tnow * CONFIG.galaxyRotation * cfg.rotation;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (const s of layer.stars) {
        const tw = (1 - cfg.twDepth) + cfg.twDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.55);
        const a = s.a * tw;
        if (a <= 0.010) continue;

        const dx = s.x - cx;
        const dy = s.y - cy;

        const wx = cx + dx * cos - dy * sin;
        const wy = cy + dx * sin + dy * cos;

        const driftX = Math.sin(tnow * s.driftSpeedX + s.driftPhaseX) * s.driftAmpX;
        const driftY = Math.cos(tnow * s.driftSpeedY + s.driftPhaseY) * s.driftAmpY;

        const px = wx + mouseX + driftX;
        const py = wy - scrollY + mouseY + driftY;

        if (px < -80 || px > W + 80 || py < -80 || py > H + 80) continue;

        const color = mixRgb(s.colorTop, s.colorBottom, colorShift);

        if (s.glow) {
          const gr = s.r * 4.3;
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
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.40, a * 0.54).toFixed(3) + ")";
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
    onScroll();
    nextShoot = performance.now() / 1000 + rand(5, 12);

    const debouncedResize = debounce(resize, 220);
    const debouncedPageResize = debounce(() => {
      const newPageH = Math.max(
        H,
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0
      );
      if (Math.abs(newPageH - pageH) > 160) {
        lastResizeKey = "";
        resize();
      }
    }, 420);

    window.addEventListener("resize", debouncedResize, { passive: true });
    window.addEventListener("orientationchange", debouncedResize, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(debouncedPageResize);
      ro.observe(document.body);
    }

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
