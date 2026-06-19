/* =============================================================
   IVIX_TV — desktop-only cinematic starfield (v6)
   Срочный фикс:
   • на мобильной версии фон полностью отключается И дополнительно гасит старые
     bg-scene/body::before/body::after, которые могли перекрывать контент;
   • на ПК canvas рисует свой собственный непрозрачный космический фон,
     поэтому старые CSS-фоны больше не дают темных границ/обрывов;
   • звезды заметнее хаотично двигаются;
   • mouse-parallax сильнее;
   • дифракционные лучи сохранены;
   • фиолетовые туманности не едут со скроллом, а медленно меняют форму,
     позицию и насыщенность.
============================================================= */
(function () {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse) and (max-width: 920px)";
  const STYLE_ID = "ivix-bg-canvas-style-v6";

  function addGlobalSafetyCss() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Kill old experimental background layers everywhere */
      .bg-scene,
      .bg-layer,
      .bg-energy-layer {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      body::before,
      body::after {
        display: none !important;
        content: none !important;
      }

      html,
      body {
        min-height: 100%;
        overflow-x: hidden;
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

      @media (max-width: 760px), (pointer: coarse) and (max-width: 920px) {
        #ivix-bg-canvas,
        .bg-scene,
        .bg-layer,
        .bg-energy-layer {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        body::before,
        body::after {
          display: none !important;
          content: none !important;
        }

        body > :not(script):not(style) {
          visibility: visible !important;
          opacity: 1 !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  addGlobalSafetyCss();

  const media = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;

  function isMobileLike() {
    return media && media.matches;
  }

  // На мобильных не создаем canvas вообще.
  // Но CSS выше уже заглушил старые экспериментальные фоновые слои.
  if (isMobileLike()) return;

  const CONFIG = {
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

    mouseAmount: 138,
    maxPan: 70,
    mouseEase: 0.075,
    scrollEase: 0.075,
    dprCap: 2,

    shootingStars: true,
    shootingEvery: [10, 24],
    nebulae: true,

    layers: [
      { density: 1250,  r: [0.24, 0.70], a: [0.05, 0.18], tw: [0.12, 0.54], twDepth: 0.42, pScroll: 0.018, pMouse: 0.14, glow: 0.00, drift: [2.4, 5.2], rayChance: 0.00 },
      { density: 2600,  r: [0.36, 1.02], a: [0.09, 0.34], tw: [0.16, 0.78], twDepth: 0.56, pScroll: 0.040, pMouse: 0.48, glow: 0.08, drift: [4.0, 9.5], rayChance: 0.012 },
      { density: 5600,  r: [0.54, 1.48], a: [0.18, 0.60], tw: [0.20, 0.98], twDepth: 0.66, pScroll: 0.070, pMouse: 0.96, glow: 0.25, drift: [6.0, 14.0], rayChance: 0.035 },
      { density: 14500, r: [0.85, 2.45], a: [0.30, 0.86], tw: [0.24, 1.18], twDepth: 0.74, pScroll: 0.105, pMouse: 1.55, glow: 0.54, drift: [8.0, 19.0], rayChance: 0.075 },
      { density: 35000, r: [1.35, 3.10], a: [0.42, 0.90], tw: [0.18, 0.85], twDepth: 0.58, pScroll: 0.135, pMouse: 2.05, glow: 0.82, drift: [11.0, 26.0], rayChance: 0.38 },
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

  const ctx = canvas.getContext("2d", { alpha: true });
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
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

  let lastT = 0;
  let rafId = null;
  let shoot = null;
  let nextShoot = 0;
  let mounted = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

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

  function mount() {
    if (mounted) return;
    mounted = true;
    (document.body || document.documentElement).appendChild(canvas);
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

    gradient.addColorStop(0, "rgba(" + color + ",0.68)");
    gradient.addColorStop(0.20, "rgba(" + color + ",0.23)");
    gradient.addColorStop(1, "rgba(" + color + ",0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    return c;
  }

  function buildLayer(cfg, layerIndex) {
    const fieldW = W + marginX * 2;
    const fieldH = H + marginY * 2;
    const n = Math.max(10, Math.round((fieldW * fieldH) / cfg.density));
    const stars = [];

    for (let i = 0; i < n; i += 1) {
      const pair = pickColorPair();
      const r = rand(cfg.r[0], cfg.r[1]);
      const isBright = Math.random() < cfg.rayChance || r > 2.35;

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
        rayLen: rand(9, 28) * (0.7 + r * 0.34),
        rayAngle: rand(0, Math.PI),
        rayAlpha: rand(0.08, 0.26) * (layerIndex + 1) / CONFIG.layers.length,
        driftAmpX: rand(cfg.drift[0], cfg.drift[1]),
        driftAmpY: rand(cfg.drift[0], cfg.drift[1]) * 0.75,
        driftSpeedX: rand(0.070, 0.210),
        driftSpeedY: rand(0.060, 0.190),
        driftPhaseX: rand(0, Math.PI * 2),
        driftPhaseY: rand(0, Math.PI * 2),
      });
    }

    return { cfg, stars };
  }

  function buildNebulae() {
    const minSide = Math.min(W, H);
    const scale = clamp(minSide / 900, 0.72, 1.35);

    return [
      { x: W * 0.12, y: H * 0.22, w: W * 0.78 * scale, h: H * 0.66 * scale, rot: -0.12, colorA: "132, 70, 255", colorB: "80, 38, 160", alpha: 0.080, speed: 0.055, phase: rand(0, Math.PI * 2) },
      { x: W * 0.86, y: H * 0.20, w: W * 0.80 * scale, h: H * 0.60 * scale, rot: 0.18, colorA: "180, 104, 255", colorB: "68, 26, 140", alpha: 0.066, speed: 0.047, phase: rand(0, Math.PI * 2) },
      { x: W * 0.54, y: H * 0.78, w: W * 0.88 * scale, h: H * 0.56 * scale, rot: -0.06, colorA: "116, 74, 255", colorB: "44, 22, 92", alpha: 0.052, speed: 0.040, phase: rand(0, Math.PI * 2) },
      { x: W * 0.36, y: H * 0.46, w: W * 0.58 * scale, h: H * 0.44 * scale, rot: 0.26, colorA: "205, 125, 255", colorB: "40, 18, 84", alpha: 0.038, speed: 0.065, phase: rand(0, Math.PI * 2) },
    ];
  }

  function rebuild() {
    layers = CONFIG.layers.map(buildLayer);
    nebulae = CONFIG.nebulae ? buildNebulae() : [];

    glowSprites = {};
    const allColors = CONFIG.colorsTop.concat(CONFIG.colorsBottom);
    for (const color of allColors) {
      glowSprites[color] = makeGlow(72, color);
    }
  }

  function resize() {
    if (isMobileLike()) {
      stopAndRemove();
      return;
    }

    const rect = canvas.getBoundingClientRect();

    W = Math.max(1, Math.round(rect.width || window.innerWidth || document.documentElement.clientWidth || 1));
    H = Math.max(1, Math.round(rect.height || window.innerHeight || document.documentElement.clientHeight || 1));

    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);

    const nextWidth = Math.round(W * dpr);
    const nextHeight = Math.round(H * dpr);

    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    marginX = CONFIG.mouseAmount + 100;
    marginY = CONFIG.maxPan + CONFIG.mouseAmount + 120;

    rebuild();

    if (reduceMotion) {
      drawFrame(performance.now(), true);
    }
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

  function drawSpaceBase(tnow) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05030b");
    grad.addColorStop(0.40, "#100520");
    grad.addColorStop(1, "#05030b");

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const sideA = ctx.createRadialGradient(W * 0.10, H * 0.22, 0, W * 0.10, H * 0.22, W * 0.55);
    sideA.addColorStop(0, "rgba(116, 50, 255, 0.20)");
    sideA.addColorStop(0.45, "rgba(82, 32, 180, 0.08)");
    sideA.addColorStop(1, "rgba(82, 32, 180, 0)");
    ctx.fillStyle = sideA;
    ctx.fillRect(0, 0, W, H);

    const sideB = ctx.createRadialGradient(W * 0.92, H * 0.18, 0, W * 0.92, H * 0.18, W * 0.55);
    sideB.addColorStop(0, "rgba(155, 70, 255, 0.16)");
    sideB.addColorStop(0.42, "rgba(94, 36, 190, 0.07)");
    sideB.addColorStop(1, "rgba(94, 36, 190, 0)");
    ctx.fillStyle = sideB;
    ctx.fillRect(0, 0, W, H);
  }

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.24, 0.56) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    const speed = rand(760, 1180);

    shoot = {
      x: fromLeft ? rand(-0.10, 0.32) * W : rand(0.68, 1.10) * W,
      y: rand(-0.08, 0.34) * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: rand(0.72, 1.22),
      len: rand(130, 245),
      color: Math.random() < 0.28 ? CONFIG.colorsTop[4] : CONFIG.colorsTop[1],
    };
  }

  function drawOrganicNebula(n, tnow) {
    const pulse = Math.sin(tnow * n.speed + n.phase) * 0.5 + 0.5;
    const shapeA = Math.sin(tnow * n.speed * 0.7 + n.phase * 1.3);
    const shapeB = Math.cos(tnow * n.speed * 0.9 + n.phase * 0.8);
    const driftX = shapeA * W * 0.018;
    const driftY = shapeB * H * 0.014;

    ctx.save();
    ctx.translate(n.x + driftX, n.y + driftY);
    ctx.rotate(n.rot + shapeA * 0.035);
    ctx.scale(n.w / 2, n.h / 2);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = n.alpha * (0.72 + pulse * 0.48);

    for (let i = 0; i < 5; i += 1) {
      const ang = i * 1.256 + n.phase;
      const cx = Math.cos(ang + tnow * n.speed * 0.65) * (0.10 + i * 0.018);
      const cy = Math.sin(ang * 1.15 - tnow * n.speed * 0.55) * (0.09 + i * 0.012);
      const radius = 0.46 + i * 0.075 + Math.sin(tnow * n.speed + i) * 0.035;

      const gradient = ctx.createRadialGradient(cx, cy, 0.04, cx, cy, radius);
      gradient.addColorStop(0, "rgba(" + n.colorA + ",0.56)");
      gradient.addColorStop(0.34, "rgba(" + n.colorB + ",0.22)");
      gradient.addColorStop(0.72, "rgba(" + n.colorB + ",0.065)");
      gradient.addColorStop(1, "rgba(" + n.colorB + ",0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = n.alpha * 1.15;
    ctx.strokeStyle = "rgba(0,0,0,0.62)";
    ctx.lineWidth = 0.030;
    ctx.lineCap = "round";

    for (let i = 0; i < 5; i += 1) {
      const yy = -0.38 + i * 0.18 + Math.sin(tnow * n.speed * 0.8 + i + n.phase) * 0.045;
      ctx.beginPath();
      ctx.moveTo(-0.82, yy);
      ctx.bezierCurveTo(
        -0.42,
        yy - 0.11 + shapeA * 0.03,
        -0.06,
        yy + 0.18 + shapeB * 0.03,
        0.82,
        yy - 0.03
      );
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRay(px, py, star, color, alpha, tnow) {
    const len = star.rayLen * (0.82 + Math.sin(tnow * star.sp * 0.7 + star.ph) * 0.10);
    const angle = star.rayAngle;
    const pulse = 0.72 + Math.sin(tnow * star.sp * 1.2 + star.ph) * 0.28;
    const a = alpha * star.rayAlpha * pulse;

    if (a <= 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    function strokeLine(theta, length, lineWidth, opacity) {
      const dx = Math.cos(theta) * length;
      const dy = Math.sin(theta) * length;

      const grad = ctx.createLinearGradient(px - dx, py - dy, px + dx, py + dy);
      grad.addColorStop(0, "rgba(" + color + ",0)");
      grad.addColorStop(0.46, "rgba(" + color + "," + (opacity * 0.45).toFixed(3) + ")");
      grad.addColorStop(0.50, "rgba(255,255,255," + opacity.toFixed(3) + ")");
      grad.addColorStop(0.54, "rgba(" + color + "," + (opacity * 0.45).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + color + ",0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }

    strokeLine(angle, len, 0.72, a);
    strokeLine(angle + Math.PI / 2, len * 0.60, 0.55, a * 0.55);
    strokeLine(angle + Math.PI / 4, len * 0.34, 0.42, a * 0.34);
    strokeLine(angle - Math.PI / 4, len * 0.30, 0.40, a * 0.28);

    ctx.restore();
  }

  function drawShoot(dt, tnow) {
    if (!CONFIG.shootingStars) return;

    if (!shoot) {
      if (tnow >= nextShoot) spawnShoot();
      return;
    }

    if (!reduceMotion) {
      shoot.life += dt;
      shoot.x += shoot.vx * dt;
      shoot.y += shoot.vy * dt;
    }

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
    gradient.addColorStop(0, "rgba(" + shoot.color + "," + (0.82 * env).toFixed(3) + ")");
    gradient.addColorStop(0.35, "rgba(" + shoot.color + "," + (0.35 * env).toFixed(3) + ")");
    gradient.addColorStop(1, "rgba(" + shoot.color + ",0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.45;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoot.x, shoot.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255," + (0.86 * env).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(shoot.x, shoot.y, 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawStars(tnow, isStatic) {
    ctx.globalCompositeOperation = "lighter";

    const colorShift = Math.pow(scrollDisp, 0.82);

    for (const layer of layers) {
      const cfg = layer.cfg;
      const offX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const offY = -scrollDisp * CONFIG.maxPan * cfg.pScroll - my * CONFIG.mouseAmount * cfg.pMouse;

      for (const s of layer.stars) {
        const tw = isStatic
          ? 0.75
          : (1 - cfg.twDepth) + cfg.twDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.65);

        const a = s.a * tw;
        if (a <= 0.010) continue;

        const driftX = reduceMotion ? 0 : Math.sin(tnow * s.driftSpeedX + s.driftPhaseX) * s.driftAmpX;
        const driftY = reduceMotion ? 0 : Math.cos(tnow * s.driftSpeedY + s.driftPhaseY) * s.driftAmpY;

        const px = s.x + offX + driftX;
        const py = s.y + offY + driftY;

        if (px < -70 || px > W + 70 || py < -70 || py > H + 70) continue;

        const color = mixRgb(s.colorTop, s.colorBottom, colorShift);

        if (s.glow) {
          const gr = s.r * 5.6;
          ctx.globalAlpha = a * 0.52;
          const sprite = glowSprites[s.colorTop] || glowSprites[CONFIG.colorsTop[1]];
          ctx.drawImage(sprite, px - gr, py - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
        }

        if (s.ray) {
          drawRay(px, py, s, color, a, tnow);
        }

        ctx.fillStyle = "rgba(" + color + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.6) {
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.55, a * 0.7).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.35, s.r * 0.36), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawFrame(t, isStatic) {
    const tnow = t / 1000;
    const dt = isStatic ? 0 : Math.min(0.05, (t - lastT) / 1000) || 0;

    if (!isStatic) {
      mx += (tmx - mx) * CONFIG.mouseEase;
      my += (tmy - my) * CONFIG.mouseEase;
      scrollDisp += (scrollFrac - scrollDisp) * CONFIG.scrollEase;
    }

    drawSpaceBase(tnow);

    if (CONFIG.nebulae) {
      for (const n of nebulae) drawOrganicNebula(n, tnow);
    }

    drawStars(tnow, isStatic);
    drawShoot(dt, tnow);
  }

  function frame(t) {
    drawFrame(t, false);
    lastT = t;
    rafId = requestAnimationFrame(frame);
  }

  function stopAndRemove() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    mounted = false;
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }

    if (!reduceMotion && !rafId && mounted) {
      lastT = performance.now();
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

    mount();
    resize();
    onScroll();
    scrollDisp = scrollFrac;

    nextShoot = performance.now() / 1000 + rand(4, 10);

    const debouncedResize = debounce(resize, 160);

    window.addEventListener("resize", debouncedResize, { passive: true });
    window.addEventListener("orientationchange", debouncedResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (media && media.addEventListener) {
      media.addEventListener("change", debouncedResize);
    }

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(debouncedResize);
      ro.observe(canvas);
    }

    if (reduceMotion) {
      drawFrame(performance.now(), true);
    } else {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
