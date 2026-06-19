/* =============================================================
   IVIX_TV — фотореалистичное звёздное небо (v3)
   Fixes:
   • canvas добавляется в конец <body>, не ломает :first-child на мобиле;
   • размер back-store берётся из фактического размера canvas, а не только innerWidth/innerHeight;
   • звёзды остаются круглыми на ПК и телефоне;
   • аккуратные далёкие туманности, очень слабые и органичные;
   • прозрачный слой позади контента, основной фон сайта не заменяется.
============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    colors: [
      "205, 218, 255",
      "235, 240, 255",
      "215, 200, 255",
      "190, 172, 255",
      "255, 236, 210",
    ],
    warmIndex: 4,
    warmChance: 0.10,

    mouseAmount: 34,
    maxPan: 118,
    mouseEase: 0.045,
    scrollEase: 0.06,
    dprCap: 2,

    shootingStars: true,
    shootingEvery: [12, 28],

    nebulae: true,

    layers: [
      { density: 2200,  r: [0.30, 0.75], a: [0.05, 0.20], tw: [0.18, 0.65], twDepth: 0.45, pScroll: 0.10, pMouse: 0.04, glow: 0.00 },
      { density: 5200,  r: [0.45, 1.05], a: [0.10, 0.34], tw: [0.22, 0.90], twDepth: 0.58, pScroll: 0.24, pMouse: 0.15, glow: 0.08 },
      { density: 11500, r: [0.65, 1.45], a: [0.20, 0.58], tw: [0.26, 1.05], twDepth: 0.68, pScroll: 0.46, pMouse: 0.36, glow: 0.28 },
      { density: 33000, r: [0.95, 2.10], a: [0.32, 0.82], tw: [0.30, 1.18], twDepth: 0.74, pScroll: 0.76, pMouse: 0.66, glow: 0.52 },
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
    zIndex: "-1",
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

  function mount() {
    if (mounted) return;
    mounted = true;

    // Важно: append, не prepend. Так мы не меняем первый элемент body
    // и не ломаем mobile-верстку, завязанную на :first-child.
    (document.body || document.documentElement).appendChild(canvas);
  }

  function pickColor() {
    if (Math.random() < CONFIG.warmChance) return CONFIG.colors[CONFIG.warmIndex];
    return CONFIG.colors[(Math.random() * (CONFIG.colors.length - 1)) | 0];
  }

  function makeGlow(size, color) {
    const c = document.createElement("canvas");
    c.width = c.height = size;

    const g = c.getContext("2d");
    const gradient = g.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );

    gradient.addColorStop(0, "rgba(" + color + ",0.72)");
    gradient.addColorStop(0.22, "rgba(" + color + ",0.25)");
    gradient.addColorStop(1, "rgba(" + color + ",0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    return c;
  }

  function buildLayer(cfg) {
    const fieldW = W + marginX * 2;
    const fieldH = H + marginY * 2;
    const n = Math.max(6, Math.round((fieldW * fieldH) / cfg.density));
    const stars = [];

    for (let i = 0; i < n; i += 1) {
      const color = pickColor();

      stars.push({
        x: rand(-marginX, W + marginX),
        y: rand(-marginY, H + marginY),
        r: rand(cfg.r[0], cfg.r[1]),
        a: rand(cfg.a[0], cfg.a[1]),
        sp: rand(cfg.tw[0], cfg.tw[1]),
        ph: rand(0, Math.PI * 2),
        color,
        glow: Math.random() < cfg.glow,
      });
    }

    return { cfg, stars };
  }

  function buildNebulae() {
    if (!CONFIG.nebulae) return [];

    const minSide = Math.min(W, H);
    const scale = clamp(minSide / 900, 0.72, 1.35);

    return [
      {
        x: W * 0.16,
        y: H * 0.24,
        w: W * 0.72 * scale,
        h: H * 0.58 * scale,
        rot: -0.18,
        colorA: "132, 70, 255",
        colorB: "80, 38, 160",
        alpha: 0.075,
        pScroll: 0.055,
        pMouse: 0.018,
      },
      {
        x: W * 0.84,
        y: H * 0.18,
        w: W * 0.68 * scale,
        h: H * 0.52 * scale,
        rot: 0.22,
        colorA: "180, 104, 255",
        colorB: "68, 26, 140",
        alpha: 0.060,
        pScroll: 0.075,
        pMouse: 0.022,
      },
      {
        x: W * 0.60,
        y: H * 0.84,
        w: W * 0.74 * scale,
        h: H * 0.46 * scale,
        rot: -0.08,
        colorA: "116, 74, 255",
        colorB: "44, 22, 92",
        alpha: 0.050,
        pScroll: 0.10,
        pMouse: 0.026,
      },
    ];
  }

  function rebuild() {
    layers = CONFIG.layers.map(buildLayer);
    nebulae = buildNebulae();

    glowSprites = {};
    for (const color of CONFIG.colors) {
      glowSprites[color] = makeGlow(64, color);
    }
  }

  function resize() {
    // Главный фикс растягивания:
    // берем фактический CSS-размер canvas, а не предполагаемый innerWidth/innerHeight.
    const rect = canvas.getBoundingClientRect();

    W = Math.max(1, Math.round(rect.width || window.innerWidth || document.documentElement.clientWidth || 1));
    H = Math.max(1, Math.round(rect.height || window.innerHeight || document.documentElement.clientHeight || 1));

    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);

    const nextWidth = Math.round(W * dpr);
    const nextHeight = Math.round(H * dpr);

    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    marginX = CONFIG.mouseAmount + 28;
    marginY = CONFIG.maxPan + CONFIG.mouseAmount + 28;

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

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.25, 0.58) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    const speed = rand(760, 1180);

    shoot = {
      x: fromLeft ? rand(-0.10, 0.32) * W : rand(0.68, 1.10) * W,
      y: rand(-0.08, 0.34) * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: rand(0.72, 1.22),
      len: rand(130, 245),
      color: Math.random() < 0.28 ? CONFIG.colors[CONFIG.warmIndex] : CONFIG.colors[1],
    };
  }

  function drawNebula(n) {
    const offX = -mx * CONFIG.mouseAmount * n.pMouse;
    const offY = -scrollDisp * CONFIG.maxPan * n.pScroll - my * CONFIG.mouseAmount * n.pMouse;

    ctx.save();
    ctx.translate(n.x + offX, n.y + offY);
    ctx.rotate(n.rot);
    ctx.scale(n.w / 2, n.h / 2);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = n.alpha;

    let gradient = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
    gradient.addColorStop(0, "rgba(" + n.colorA + ",0.72)");
    gradient.addColorStop(0.28, "rgba(" + n.colorB + ",0.28)");
    gradient.addColorStop(0.70, "rgba(" + n.colorB + ",0.08)");
    gradient.addColorStop(1, "rgba(" + n.colorB + ",0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();

    // Темные прожилки внутри облака: не фотореализм NASA, но мягко и органично.
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = n.alpha * 0.40;
    ctx.strokeStyle = "rgba(4, 3, 10, 0.85)";
    ctx.lineWidth = 0.025;
    ctx.lineCap = "round";

    for (let i = 0; i < 4; i += 1) {
      const yy = -0.30 + i * 0.20 + Math.sin(i * 2.1) * 0.04;
      ctx.beginPath();
      ctx.moveTo(-0.78, yy);
      ctx.bezierCurveTo(-0.38, yy - 0.10, -0.08, yy + 0.16, 0.76, yy - 0.04);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
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

        const px = s.x + offX;
        const py = s.y + offY;

        if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;

        if (s.glow) {
          const gr = s.r * 5.2;
          ctx.globalAlpha = a * 0.50;
          ctx.drawImage(glowSprites[s.color], px - gr, py - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
        }

        // Только круглое ядро. Без лучей, чтобы не было вытянутого вида.
        ctx.fillStyle = "rgba(" + s.color + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
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

    ctx.clearRect(0, 0, W, H);

    if (CONFIG.nebulae) {
      for (const n of nebulae) drawNebula(n);
    }

    drawStars(tnow, isStatic);
    drawShoot(dt, tnow);
  }

  function frame(t) {
    drawFrame(t, false);
    lastT = t;
    rafId = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }

    if (!reduceMotion && !rafId) {
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
