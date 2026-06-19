/* =============================================================
   IVIX_TV — фотореалистичное мерцающее звёздное небо (v2)
   • прозрачный слой ПОВЕРХ фона сайта (не заменяет его)
   • 4 слоя глубины (параллакс по скроллу И по мыши)
   • яркие звёзды с ореолом (блум) и дифракционными лучами,
     цветовая температура, мягкое мерцание
   • редкие падающие звёзды
   -------------------------------------------------------------
   Подключение: <script src="background.js" defer></script> перед </body>
   ============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    // Реалистичные оттенки звёзд (rgb): голубо-белые, белые, фиолетовые,
    // редкие тёплые — под фиолетовую тему сайта
    colors: [
      "205, 218, 255",  // голубо-белый
      "235, 240, 255",  // белый
      "215, 200, 255",  // фиолетово-белый
      "190, 172, 255",  // мягкий фиолет
      "255, 236, 210",  // тёплый (редко)
    ],
    warmIndex: 4, warmChance: 0.10, // как часто берём тёплый оттенок

    mouseAmount: 38,   // сила параллакса от мыши, px
    maxPan: 130,       // сила параллакса при скролле, px
    mouseEase: 0.045,  // плавность мыши
    scrollEase: 0.06,  // плавность скролла

    shootingStars: true,
    shootingEvery: [10, 24],  // интервал между падающими звёздами, c

    dprCap: 2,

    // Слои: дальний → ближний. density = площадь на 1 звезду (меньше = гуще)
    layers: [
      { density: 2400,  r: [0.35, 0.9], a: [0.06, 0.28], tw: [0.2, 0.8],  twDepth: 0.55, pScroll: 0.12, pMouse: 0.06, glow: 0.00, spike: 0.00 },
      { density: 6000,  r: [0.6, 1.2],  a: [0.16, 0.45], tw: [0.25, 1.0], twDepth: 0.70, pScroll: 0.28, pMouse: 0.20, glow: 0.14, spike: 0.00 },
      { density: 13000, r: [0.9, 1.7],  a: [0.30, 0.70], tw: [0.3, 1.1],  twDepth: 0.78, pScroll: 0.52, pMouse: 0.46, glow: 0.50, spike: 0.10 },
      { density: 38000, r: [1.3, 2.7],  a: [0.45, 0.95], tw: [0.35, 1.2], twDepth: 0.82, pScroll: 0.88, pMouse: 0.82, glow: 1.00, spike: 0.42 },
    ],
  };

  // ---- Canvas (прозрачный, поверх фона, под контентом) ----
  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    zIndex: "-1", pointerEvents: "none", display: "block", background: "transparent",
  });
  function mount() { (document.body || document.documentElement).prepend(canvas); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  const ctx = canvas.getContext("2d", { alpha: true });

  // ---- Состояние ----
  let W = 0, H = 0, dpr = 1, marginX = 0, marginY = 0;
  let layers = [];
  let glowSprites = {}, spikeSprite = null;
  let scrollFrac = 0, scrollDisp = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let lastT = 0, rafId = null;
  let shoot = null, nextShoot = 0;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Мягкий ореол (блум) — пре-рендер на каждый цвет
  function makeGlow(size, color) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(" + color + ",0.9)");
    grd.addColorStop(0.25, "rgba(" + color + ",0.35)");
    grd.addColorStop(1, "rgba(" + color + ",0)");
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  }

  // Дифракционные лучи (крестик + слабый диагональный) — белые
  function makeSpike(size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); const cx = size / 2;
    g.globalCompositeOperation = "lighter";
    const rg = g.createRadialGradient(cx, cx, 0, cx, cx, size * 0.14);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
    function arm(angle, len, bright, w) {
      g.save(); g.translate(cx, cx); g.rotate(angle);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, "rgba(255,255,255," + bright + ")");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = grad; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke(); g.restore();
    }
    const L = size * 0.5;
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) arm(a, L, 0.85, 1.1);
    const Ld = size * 0.3;
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) arm(a, Ld, 0.28, 0.9);
    return c;
  }

  function pickColor() {
    if (Math.random() < CONFIG.warmChance) return CONFIG.colors[CONFIG.warmIndex];
    const i = (Math.random() * (CONFIG.colors.length - 1)) | 0; // без тёплого
    return CONFIG.colors[i];
  }

  function buildLayer(cfg) {
    const fieldW = W + marginX * 2, fieldH = H + marginY * 2;
    const n = Math.max(4, Math.round((fieldW * fieldH) / cfg.density));
    const arr = [];
    for (let i = 0; i < n; i++) {
      const color = pickColor();
      arr.push({
        x: rand(-marginX, W + marginX),
        y: rand(-marginY, H + marginY),
        r: rand(cfg.r[0], cfg.r[1]),
        a: rand(cfg.a[0], cfg.a[1]),
        sp: rand(cfg.tw[0], cfg.tw[1]),
        ph: rand(0, Math.PI * 2),
        color, coreColor: color,
        glow: Math.random() < cfg.glow,
        spike: Math.random() < cfg.spike,
        spin: rand(0, Math.PI),       // лёгкий поворот лучей
      });
    }
    return { cfg, stars: arr };
  }

  function rebuild() {
    layers = CONFIG.layers.map(buildLayer);
    glowSprites = {};
    for (const col of CONFIG.colors) glowSprites[col] = makeGlow(64, col);
    spikeSprite = makeSpike(96);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    W = window.innerWidth; H = window.innerHeight;
    marginX = CONFIG.mouseAmount + 20;
    marginY = CONFIG.maxPan + CONFIG.mouseAmount + 20;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuild();
    if (reduceMotion) drawFrame(performance.now(), true);
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - window.innerHeight) || 1;
    scrollFrac = Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop) / max));
  }
  function onMouse(e) { tmx = (e.clientX / W) * 2 - 1; tmy = (e.clientY / H) * 2 - 1; }

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.25, 0.6) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    const speed = rand(900, 1400);
    shoot = {
      x: fromLeft ? rand(-0.05, 0.4) * W : rand(0.6, 1.05) * W,
      y: rand(-0.05, 0.35) * H,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0, max: rand(0.7, 1.2), len: rand(140, 260),
      color: Math.random() < 0.3 ? CONFIG.colors[CONFIG.warmIndex] : CONFIG.colors[1],
    };
  }

  function drawShoot(dt, tnow) {
    if (!CONFIG.shootingStars) return;
    if (!shoot) { if (tnow >= nextShoot) spawnShoot(); return; }
    if (!reduceMotion) { shoot.life += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; }
    const f = shoot.life / shoot.max;
    if (f >= 1) { shoot = null; nextShoot = tnow + rand(CONFIG.shootingEvery[0], CONFIG.shootingEvery[1]); return; }
    const env = Math.sin(Math.min(f, 1) * Math.PI); // плавно появилась-исчезла
    const sp = Math.hypot(shoot.vx, shoot.vy) || 1;
    const ux = shoot.vx / sp, uy = shoot.vy / sp;
    const tailX = shoot.x - ux * shoot.len, tailY = shoot.y - uy * shoot.len;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(shoot.x, shoot.y, tailX, tailY);
    g.addColorStop(0, "rgba(" + shoot.color + "," + (0.85 * env).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + shoot.color + ",0)");
    ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(tailX, tailY); ctx.stroke();
    // головка
    ctx.fillStyle = "rgba(255,255,255," + (0.9 * env).toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(shoot.x, shoot.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFrame(t, isStatic) {
    const tnow = t / 1000;
    if (!isStatic) {
      mx += (tmx - mx) * CONFIG.mouseEase;
      my += (tmy - my) * CONFIG.mouseEase;
      scrollDisp += (scrollFrac - scrollDisp) * CONFIG.scrollEase;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (const layer of layers) {
      const cfg = layer.cfg;
      const offX = -mx * CONFIG.mouseAmount * cfg.pMouse;
      const offY = -scrollDisp * CONFIG.maxPan * cfg.pScroll - my * CONFIG.mouseAmount * cfg.pMouse;
      for (const s of layer.stars) {
        const tw = isStatic ? 0.75
          : (1 - cfg.twDepth) + cfg.twDepth *
            Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.7);
        const a = s.a * tw;
        if (a <= 0.012) continue;
        const px = s.x + offX, py = s.y + offY;

        if (s.glow) {
          const gr = s.r * 6;
          ctx.globalAlpha = a * 0.6;
          ctx.drawImage(glowSprites[s.color], px - gr, py - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
        }
        if (s.spike) {
          const kr = s.r * (7 + 3 * tw);
          ctx.globalAlpha = a * 0.7;
          ctx.drawImage(spikeSprite, px - kr, py - kr, kr * 2, kr * 2);
          ctx.globalAlpha = 1;
        }
        // ядро
        ctx.fillStyle = "rgba(" + s.coreColor + "," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(px, py, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    drawShoot(isStatic ? 0 : Math.min(0.05, (t - lastT) / 1000) || 0, tnow);
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(t) {
    drawFrame(t, false);
    lastT = t;
    rafId = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    else if (!reduceMotion && !rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }
  function debounce(fn, ms) { let id; return function () { clearTimeout(id); id = setTimeout(fn, ms); }; }

  function start() {
    resize(); onScroll(); scrollDisp = scrollFrac;
    nextShoot = performance.now() / 1000 + rand(3, 8);
    window.addEventListener("resize", debounce(resize, 200), { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (reduceMotion) drawFrame(performance.now(), true);
    else { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
