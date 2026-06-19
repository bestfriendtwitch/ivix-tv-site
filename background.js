/* =============================================================
   IVIX_TV — ambient мерцающее звёздное небо
   • прозрачный слой ПОВЕРХ текущего фона сайта (не заменяет его)
   • мягко мерцающие звёзды, ненавязчивый фон под контентом
   • очень лёгкий параллакс при прокрутке (для глубины)
   -------------------------------------------------------------
   Подключение — одна строка перед </body>:
       <script src="background.js" defer></script>
   ============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    // Палитра звёзд (rgb) — мягкий бело-фиолетовый под тему сайта
    colors: ["225, 220, 255", "200, 185, 255", "180, 150, 250", "235, 235, 255"],

    density: 9000,     // 1 звезда на N px² (больше число = меньше звёзд)
    minR: 0.4,         // мин. радиус
    maxR: 1.5,         // макс. радиус
    baseAlpha: [0.18, 0.7], // диапазон базовой яркости

    twinkleSpeed: [0.25, 1.1], // скорость мерцания
    twinkleDepth: 0.7,         // насколько сильно мерцает (0..1)

    glowFraction: 0.12, // доля звёзд с мягким ореолом (самые красивые)
    glowAlpha: 0.5,     // яркость ореола

    parallax: 70,       // лёгкий сдвиг при скролле, px (глубина)
    scrollEase: 0.06,   // плавность параллакса
    drift: 8,           // едва заметное общее покачивание поля, px
    dprCap: 2,
  };

  // ---- Canvas (прозрачный, ПОВЕРХ фона сайта, ПОД контентом) ----
  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    zIndex: "-1", pointerEvents: "none", display: "block",
    background: "transparent",
  });
  function mount() { (document.body || document.documentElement).prepend(canvas); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  const ctx = canvas.getContext("2d", { alpha: true });

  // ---- Состояние ----
  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let glowSprite = null;
  let scrollFrac = 0, scrollDisp = 0;
  let lastT = 0, rafId = null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function makeGlowSprite(size, color) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(" + color + ",1)");
    grd.addColorStop(0.3, "rgba(" + color + ",0.35)");
    grd.addColorStop(1, "rgba(" + color + ",0)");
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  }

  function build() {
    const worldH = H + CONFIG.parallax;
    const n = Math.round((W * worldH) / CONFIG.density);
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rand(0, W),
        y: rand(-CONFIG.parallax * 0.5, H + CONFIG.parallax * 0.5),
        r: rand(CONFIG.minR, CONFIG.maxR),
        a: rand(CONFIG.baseAlpha[0], CONFIG.baseAlpha[1]),
        sp: rand(CONFIG.twinkleSpeed[0], CONFIG.twinkleSpeed[1]),
        ph: rand(0, Math.PI * 2),
        depth: rand(0.3, 1),                 // для параллакса/глубины
        color: CONFIG.colors[(Math.random() * CONFIG.colors.length) | 0],
        glow: Math.random() < CONFIG.glowFraction,
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glowSprite = makeGlowSprite(48, "255, 255, 255");
    build();
    if (reduceMotion) drawFrame(performance.now(), true);
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - window.innerHeight) || 1;
    scrollFrac = Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop) / max));
  }

  function drawFrame(t, isStatic) {
    const tnow = t / 1000;
    scrollDisp += (scrollFrac - scrollDisp) * CONFIG.scrollEase;
    const driftX = Math.sin(tnow * 0.05) * CONFIG.drift;
    const driftY = Math.cos(tnow * 0.04) * CONFIG.drift;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (const s of stars) {
      // мягкое мерцание
      const tw = isStatic ? 0.7
        : (1 - CONFIG.twinkleDepth) +
          CONFIG.twinkleDepth * Math.pow(Math.sin(tnow * s.sp + s.ph) * 0.5 + 0.5, 1.6);
      const a = s.a * tw;
      if (a <= 0.01) continue;

      const px = s.x + driftX * s.depth;
      const py = s.y - scrollDisp * CONFIG.parallax * s.depth + driftY * s.depth;

      if (s.glow) {
        const gr = s.r * 7;
        ctx.globalAlpha = a * CONFIG.glowAlpha;
        ctx.drawImage(glowSprite, px - gr, py - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(" + s.color + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(t) {
    lastT = t;
    drawFrame(t, false);
    rafId = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    else if (!reduceMotion && !rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }
  function debounce(fn, ms) { let id; return function () { clearTimeout(id); id = setTimeout(fn, ms); }; }

  function start() {
    resize(); onScroll(); scrollDisp = scrollFrac;
    window.addEventListener("resize", debounce(resize, 200), { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (reduceMotion) drawFrame(performance.now(), true);
    else { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
