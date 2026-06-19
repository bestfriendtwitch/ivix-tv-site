/* =============================================================
   IVIX_TV — анимированный фон "созвездие" (v3, тёмный минимализм)
   • почти чёрная база (#090315), тонкие резкие линии
   • БЕЗ белого: максимум средне-фиолетовый
   • огоньки = мягкие световые блики вдоль ОТРЕЗКА линии,
     которые зажигаются и плавно гаснут в случайных местах
   • очень плавные движения + параллакс (скролл + мышь)
   -------------------------------------------------------------
   Подключение — одна строка перед </body>:
       <script src="background.js" defer></script>
   ============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    takeOverBackground: true,
    forceTransparentPage: true,

    // Тёмная почти-чёрная база (как на референсе rgb(9,3,21))
    baseTop:    "#0b0419",
    baseMid:    "#080315",
    baseBottom: "#06030f",

    // Палитра (rgb) — НИКАКОГО белого
    lineGlow:  "90, 45, 165",    // мягкое сияние линий (тонкое)
    lineCore:  "136, 84, 216",   // ядро линии
    node:      "120, 80, 185",   // тусклые узлы
    star:      "150, 130, 205",  // звёзды
    pulseCore: "150, 102, 200",  // центр блика (макс. яркость ~rgb(146,105,196))
    pulseEdge: "120, 55, 178",   // края блика

    nebula: [
      { x: 0.10, y: 0.12, r: 0.55, c: "110, 50, 220", a: 0.07 },
      { x: 0.92, y: 0.20, r: 0.58, c: "130, 60, 230", a: 0.07 },
      { x: 0.76, y: 0.92, r: 0.60, c: "80, 35, 180",  a: 0.06 },
    ],

    stars: { density: 11000, depth: 0.10, parallax: 0.20, twinkle: 0.6 },

    maxPan: 230, mousePan: 26, dprCap: 2,

    // Плавность
    mouseEase: 0.035,   // меньше = плавнее реакция на мышь
    scrollEase: 0.06,   // сглаживание параллакса по скроллу

    // Слои созвездия: дальний → ближний
    layers: [
      { density: 42000, depth: 0.40, parallax: 0.55, linkDist: 235, maxLinks: 3,
        lineW: 1.0, glowW: 3, glowA: 0.07, coreA: 0.40, nodeR: 0.9, nodeA: 0.22,
        drift: 3.5, driftSpeed: 0.18,
        pulses: 3, pulseLen: 70, speed: 30, peak: 0.62 },
      { density: 30000, depth: 0.85, parallax: 1.00, linkDist: 255, maxLinks: 3,
        lineW: 1.1, glowW: 4, glowA: 0.09, coreA: 0.54, nodeR: 1.1, nodeA: 0.28,
        drift: 5, driftSpeed: 0.24,
        pulses: 4, pulseLen: 95, speed: 40, peak: 0.72 },
    ],
  };

  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    zIndex: "-1", pointerEvents: "none", display: "block",
    background: CONFIG.takeOverBackground ? CONFIG.baseBottom : "transparent",
  });

  function mount() {
    (document.body || document.documentElement).prepend(canvas);
    if (CONFIG.takeOverBackground && CONFIG.forceTransparentPage) {
      const s = document.createElement("style");
      s.textContent = "html,body{background:transparent !important;}";
      const head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      head.appendChild(s);
    }
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  const ctx = canvas.getContext("2d", { alpha: true });

  let W = 0, H = 0, dpr = 1;
  let layers = [], stars = null, baseGrad = null;
  let scrollFrac = 0, scrollDisp = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let lastT = 0, rafId = null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  function newPulse(cfg, edges) {
    const e = edges[(Math.random() * edges.length) | 0];
    const fwd = Math.random() < 0.5;
    return {
      a: fwd ? e[0] : e[1], b: fwd ? e[1] : e[0],
      t: rand(0.1, 0.9),
      speed: cfg.speed * rand(0.8, 1.25),
      life: 0, maxLife: rand(2.4, 5.0),
      state: "active", wait: 0, trail: [],
    };
  }

  function buildLayer(cfg) {
    const worldH = H + CONFIG.maxPan;
    const worldW = W + CONFIG.mousePan * 2 + 100;
    const count = Math.max(6, Math.round((worldW * worldH) / cfg.density));
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        bx: rand(-50, worldW - 50), by: rand(-CONFIG.maxPan, H),
        px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
        ps: rand(0.5, 1.0), x: 0, y: 0,
      });
    }
    const adj = nodes.map(() => []);
    const edges = [];
    const edgeSet = new Set();
    const d2 = cfg.linkDist * cfg.linkDist;
    const kmax = cfg.maxLinks || 3;
    for (let i = 0; i < nodes.length; i++) {
      const near = [];
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const dx = nodes[i].bx - nodes[j].bx, dy = nodes[i].by - nodes[j].by;
        const dd = dx * dx + dy * dy;
        if (dd <= d2) near.push([dd, j]);
      }
      near.sort((p, q) => p[0] - q[0]);
      for (let k = 0; k < Math.min(kmax, near.length); k++) {
        const j = near[k][1];
        const key = i < j ? i + "_" + j : j + "_" + i;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push([i, j]); adj[i].push(j); adj[j].push(i);
      }
    }
    const pulses = [];
    for (let t = 0; t < cfg.pulses && edges.length; t++) {
      const p = newPulse(cfg, edges);
      p.life = rand(0, p.maxLife);           // рассинхрон старта
      pulses.push(p);
    }
    return { cfg, nodes, edges, adj, pulses, worldH };
  }

  function buildStars() {
    const worldH = H + CONFIG.maxPan, worldW = W + CONFIG.mousePan * 2 + 100;
    const n = Math.round((worldW * worldH) / CONFIG.stars.density);
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ bx: rand(0, worldW), by: rand(-CONFIG.maxPan, H),
        r: rand(0.4, 1.1), a: rand(0.12, 0.4), ph: rand(0, Math.PI * 2),
        sp: rand(0.4, 1.2) });
    }
    return arr;
  }

  function rebuild() { layers = CONFIG.layers.map(buildLayer); stars = buildStars(); }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseGrad = ctx.createLinearGradient(0, 0, 0, H);
    baseGrad.addColorStop(0, CONFIG.baseTop);
    baseGrad.addColorStop(0.55, CONFIG.baseMid);
    baseGrad.addColorStop(1, CONFIG.baseBottom);
    rebuild();
    if (reduceMotion) drawStatic();
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - window.innerHeight) || 1;
    scrollFrac = Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop) / max));
  }
  function onMouse(e) { tmx = (e.clientX / W) * 2 - 1; tmy = (e.clientY / H) * 2 - 1; }

  function nextNode(layer, from, current) {
    const ns = layer.adj[current];
    if (!ns.length) return from;
    if (ns.length === 1) return ns[0];
    let n = from, guard = 0;
    while (n === from && guard++ < 6) n = ns[(Math.random() * ns.length) | 0];
    return n;
  }

  function renderBase() {
    ctx.globalCompositeOperation = "source-over";
    if (CONFIG.takeOverBackground) { ctx.fillStyle = baseGrad; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of CONFIG.nebula) {
      const px = n.x * W + mx * CONFIG.mousePan * 1.6;
      const py = n.y * H - scrollDisp * CONFIG.maxPan * 0.5 + my * CONFIG.mousePan * 1.6;
      const r = n.r * Math.max(W, H);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(" + n.c + "," + n.a + ")");
      g.addColorStop(1, "rgba(" + n.c + ",0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function renderStars(tnow) {
    const cfg = CONFIG.stars;
    const offY = -scrollDisp * CONFIG.maxPan * cfg.parallax + my * CONFIG.mousePan * cfg.depth;
    const offX = mx * CONFIG.mousePan * cfg.depth;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of stars) {
      const a = s.a * (1 - cfg.twinkle * 0.5 + cfg.twinkle * 0.5 * Math.sin(tnow * s.sp + s.ph));
      ctx.fillStyle = "rgba(" + CONFIG.star + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(s.bx + offX, s.by + offY, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Мягкий вытянутый блик вдоль отрезка (без яркого ядра, без белого)
  function drawSmear(x, y, ux, uy, half, alpha, peak) {
    const x0 = x - ux * half, y0 = y - uy * half;
    const x1 = x + ux * half, y1 = y + uy * half;
    const passes = [[1.4, 1.0], [4, 0.5], [9, 0.22]]; // ширина, доля яркости -> мягкое размытие
    for (const [w, k] of passes) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0.0, "rgba(" + CONFIG.pulseEdge + ",0)");
      g.addColorStop(0.5, "rgba(" + CONFIG.pulseCore + "," + (peak * alpha * k).toFixed(3) + ")");
      g.addColorStop(1.0, "rgba(" + CONFIG.pulseEdge + ",0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }

  function renderLayer(layer, dt, tnow) {
    const cfg = layer.cfg;
    const offY = -scrollDisp * CONFIG.maxPan * cfg.parallax + my * CONFIG.mousePan * cfg.depth;
    const offX = mx * CONFIG.mousePan * cfg.depth;
    for (const n of layer.nodes) {
      n.x = n.bx + offX + Math.sin(tnow * cfg.driftSpeed * n.ps + n.px) * cfg.drift;
      n.y = n.by + offY + Math.cos(tnow * cfg.driftSpeed * n.ps + n.py) * cfg.drift;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // линии: тонкое сияние + резкое ядро
    if (cfg.glowA > 0) {
      ctx.lineWidth = cfg.glowW;
      ctx.strokeStyle = "rgba(" + CONFIG.lineGlow + "," + cfg.glowA + ")";
      ctx.beginPath();
      for (const [i, j] of layer.edges) {
        const a = layer.nodes[i], b = layer.nodes[j];
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.lineWidth = cfg.lineW;
    ctx.strokeStyle = "rgba(" + CONFIG.lineCore + "," + cfg.coreA + ")";
    ctx.beginPath();
    for (const [i, j] of layer.edges) {
      const a = layer.nodes[i], b = layer.nodes[j];
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // узлы: едва заметные точки (без ореолов, без белого)
    ctx.fillStyle = "rgba(" + CONFIG.node + "," + cfg.nodeA + ")";
    for (const n of layer.nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, cfg.nodeR, 0, Math.PI * 2); ctx.fill();
    }

    // огоньки: зажигаются и гаснут в случайных местах, ползут по линиям
    for (const p of layer.pulses) {
      if (p.state === "wait") {
        p.wait -= dt;
        if (p.wait <= 0) Object.assign(p, newPulse(cfg, layer.edges));
        continue;
      }
      const A = layer.nodes[p.a], B = layer.nodes[p.b];
      const ex = B.x - A.x, ey = B.y - A.y, len = Math.hypot(ex, ey) || 1;
      if (!reduceMotion) {
        p.life += dt;
        p.t += (p.speed * dt) / len;
        if (p.t >= 1) { p.t -= 1; const nx = nextNode(layer, p.a, p.b); p.a = p.b; p.b = nx; }
        if (p.life >= p.maxLife) { p.state = "wait"; p.wait = rand(0.5, 3.2); continue; }
      }
      // плавная огибающая: вспышка -> ровно -> угасание
      const f = p.life / p.maxLife;
      const env = reduceMotion ? 0.8 : smooth(Math.min(f / 0.32, 1)) * smooth(Math.min((1 - f) / 0.4, 1));
      if (env <= 0.01) continue;
      const x = A.x + ex * p.t, y = A.y + ey * p.t;
      const ux = ex / len, uy = ey / len;

      drawSmear(x, y, ux, uy, cfg.pulseLen * 0.5, env, cfg.peak);

      // короткий мягкий хвост (тоже фиолетовый, без ядра)
      p.trail.push(x, y);
      if (p.trail.length > 10) p.trail.splice(0, p.trail.length - 10);
      for (let k = 0; k < p.trail.length - 2; k += 2) {
        const tf = k / p.trail.length;
        ctx.strokeStyle = "rgba(" + CONFIG.pulseEdge + "," + (cfg.peak * env * tf * 0.18).toFixed(3) + ")";
        ctx.lineWidth = 1 + tf * 2;
        ctx.beginPath();
        ctx.moveTo(p.trail[k], p.trail[k + 1]);
        ctx.lineTo(p.trail[k + 2], p.trail[k + 3]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0;
    lastT = t;
    mx += (tmx - mx) * CONFIG.mouseEase;
    my += (tmy - my) * CONFIG.mouseEase;
    scrollDisp += (scrollFrac - scrollDisp) * CONFIG.scrollEase;
    const tnow = t / 1000;
    renderBase();
    renderStars(tnow);
    for (const layer of layers) renderLayer(layer, dt, tnow);
    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    lastT = performance.now();
    scrollDisp = scrollFrac;
    const tnow = lastT / 1000;
    renderBase(); renderStars(tnow);
    for (const layer of layers) renderLayer(layer, 0, tnow);
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
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (reduceMotion) drawStatic();
    else { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
