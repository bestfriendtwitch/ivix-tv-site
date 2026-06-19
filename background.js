/* =============================================================
   IVIX_TV — анимированный фон "созвездие"
   • эффект глубины (параллакс) при прокрутке и движении мыши
   • огоньки, ползущие по линиям между точками
   -------------------------------------------------------------
   Самодостаточный модуль: сам создаёт <canvas>, рисует ТЁМНУЮ
   базу + созвездие, и забирает фон страницы на себя, чтобы его
   ничто не перекрывало. Подключение — одна строка перед </body>:
       <script src="background.js" defer></script>
   ============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    // Холст сам становится фоном страницы (надёжно, без проблем со слоями).
    // Если хочешь, наоборот, наложить поверх своего фона — поставь false.
    takeOverBackground: false,

    // Тёмная база (непрозрачная), под палитру сайта
    baseTop:    "#0c0717",
    baseMid:    "#0a0512",
    baseBottom: "#070410",

    line:        "138, 96, 246",   // цвет линий (rgb)
    node:        "196, 142, 255",  // цвет точек
    travelCore:  "255, 255, 255",  // ядро огонька
    travelGlow:  "168, 85, 247",   // свечение огонька
    nebula: [                      // мягкие фиолетовые «облака» для глубины
      { x: 0.14, y: 0.16, r: 0.55, c: "124, 53, 255", a: 0.16 },
      { x: 0.90, y: 0.26, r: 0.60, c: "168, 85, 247", a: 0.15 },
      { x: 0.72, y: 0.88, r: 0.65, c: "96, 42, 214",  a: 0.13 },
    ],

    maxPan: 240,      // вертикальный сдвиг от скролла (глубина), px
    mousePan: 28,     // параллакс от мыши, px
    dprCap: 2,

    // Слои глубины: дальний → ближний
    layers: [
      { density: 12000, depth: 0.18, parallax: 0.30, linkDist: 150, lineW: 0.7, nodeR: 1.1, alpha: 0.38, travelers: 3, speed: 40, drift: 5 },
      { density: 15000, depth: 0.45, parallax: 0.60, linkDist: 170, lineW: 1.0, nodeR: 1.7, alpha: 0.62, travelers: 6, speed: 54, drift: 8 },
      { density: 19000, depth: 0.85, parallax: 1.00, linkDist: 190, lineW: 1.3, nodeR: 2.4, alpha: 0.92, travelers: 7, speed: 70, drift: 12 },
    ],
  };

  // ---- Canvas ----
  const canvas = document.createElement("canvas");
  canvas.id = "ivix-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "-1",
    pointerEvents: "none",
    display: "block",
    background: CONFIG.baseBottom, // анти-мигание до первой отрисовки
  });

  function mount() {
    (document.body || document.documentElement).prepend(canvas);
    if (CONFIG.takeOverBackground) {
      // Чтобы фон страницы не перекрывал холст — делаем его прозрачным.
      const s = document.createElement("style");
      s.textContent = "html,body{background:transparent !important;}";
      const head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      head.appendChild(s);
    }
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  const ctx = canvas.getContext("2d", { alpha: true });

  // ---- Состояние ----
  let W = 0, H = 0, dpr = 1;
  let layers = [];
  let baseGrad = null;
  let scrollFrac = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let lastT = 0, rafId = null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function buildLayer(cfg) {
    const worldH = H + CONFIG.maxPan;
    const worldW = W + CONFIG.mousePan * 2 + 80;
    const count = Math.max(8, Math.round((worldW * worldH) / cfg.density));
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        bx: rand(-40, worldW - 40),
        by: rand(-CONFIG.maxPan, H),
        px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
        ps: rand(0.3, 0.8), x: 0, y: 0, pulse: rand(0, Math.PI * 2),
      });
    }
    const adj = nodes.map(() => []);
    const edges = [];
    const d2 = cfg.linkDist * cfg.linkDist;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].bx - nodes[j].bx, dy = nodes[i].by - nodes[j].by;
        if (dx * dx + dy * dy <= d2) { edges.push([i, j]); adj[i].push(j); adj[j].push(i); }
      }
    }
    const travelers = [];
    for (let t = 0; t < cfg.travelers && edges.length; t++) {
      const e = edges[(Math.random() * edges.length) | 0];
      travelers.push({
        a: e[0], b: e[1], t: Math.random(),
        speed: cfg.speed * rand(0.8, 1.25),
        size: cfg.nodeR * rand(1.4, 2.1), trail: [],
      });
    }
    return { cfg, nodes, edges, adj, travelers, worldH };
  }

  function rebuild() { layers = CONFIG.layers.map(buildLayer); }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseGrad = ctx.createLinearGradient(0, 0, 0, H);
    baseGrad.addColorStop(0, CONFIG.baseTop);
    baseGrad.addColorStop(0.6, CONFIG.baseMid);
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
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);
  }

  function renderNebula() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of CONFIG.nebula) {
      const px = n.x * W + mx * CONFIG.mousePan * 1.5;
      const py = n.y * H - scrollFrac * CONFIG.maxPan * 0.5 + my * CONFIG.mousePan * 1.5;
      const r = n.r * Math.max(W, H);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(" + n.c + "," + n.a + ")");
      g.addColorStop(1, "rgba(" + n.c + ",0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function renderLayer(layer, dt) {
    const cfg = layer.cfg;
    const offY = -scrollFrac * CONFIG.maxPan * cfg.parallax + my * CONFIG.mousePan * cfg.depth;
    const offX = mx * CONFIG.mousePan * cfg.depth;
    const tnow = lastT / 1000;
    for (const n of layer.nodes) {
      n.x = n.bx + offX + Math.sin(tnow * n.ps + n.px) * cfg.drift;
      n.y = n.by + offY + Math.cos(tnow * n.ps + n.py) * cfg.drift;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = cfg.lineW;
    ctx.strokeStyle = "rgba(" + CONFIG.line + "," + cfg.alpha * 0.55 + ")";
    ctx.beginPath();
    for (const [i, j] of layer.edges) {
      const a = layer.nodes[i], b = layer.nodes[j];
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(" + CONFIG.node + "," + cfg.alpha + ")";
    for (const n of layer.nodes) {
      const r = cfg.nodeR * (0.85 + 0.25 * Math.sin(tnow * 1.5 + n.pulse));
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const tr of layer.travelers) {
      const A = layer.nodes[tr.a], B = layer.nodes[tr.b];
      const ex = B.x - A.x, ey = B.y - A.y, len = Math.hypot(ex, ey) || 1;
      if (!reduceMotion) tr.t += (tr.speed * dt) / len;
      if (tr.t >= 1) {
        tr.t -= 1;
        const nxt = nextNode(layer, tr.a, tr.b);
        tr.a = tr.b; tr.b = nxt; tr.trail.length = 0;
      }
      const x = A.x + ex * tr.t, y = A.y + ey * tr.t;
      tr.trail.push(x, y);
      if (tr.trail.length > 16) tr.trail.splice(0, tr.trail.length - 16);
      for (let k = 0; k < tr.trail.length - 2; k += 2) {
        const f = k / tr.trail.length;
        ctx.strokeStyle = "rgba(" + CONFIG.travelGlow + "," + (0.05 + f * 0.28) + ")";
        ctx.lineWidth = tr.size * (0.4 + f);
        ctx.beginPath();
        ctx.moveTo(tr.trail[k], tr.trail[k + 1]);
        ctx.lineTo(tr.trail[k + 2], tr.trail[k + 3]);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, tr.size * 6);
      g.addColorStop(0, "rgba(" + CONFIG.travelCore + ",0.95)");
      g.addColorStop(0.25, "rgba(" + CONFIG.travelGlow + ",0.55)");
      g.addColorStop(1, "rgba(" + CONFIG.travelGlow + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, tr.size * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(" + CONFIG.travelCore + ",1)";
      ctx.beginPath(); ctx.arc(x, y, tr.size * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0;
    lastT = t;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    renderBase();
    renderNebula();
    for (const layer of layers) renderLayer(layer, dt);
    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    lastT = performance.now();
    renderBase(); renderNebula();
    for (const layer of layers) renderLayer(layer, 0);
  }

  function onVisibility() {
    if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    else if (!reduceMotion && !rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  function debounce(fn, ms) { let id; return function () { clearTimeout(id); id = setTimeout(fn, ms); }; }

  function start() {
    resize();
    onScroll();
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
