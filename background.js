/* =============================================================
   IVIX_TV — анимированный фон "созвездие" (v2, неоновое свечение)
   • тёмная база как в оригинале (#080415)
   • светящиеся линии (блум) + светящиеся узлы + звёздное поле
   • огоньки-импульсы, ползущие по линиям (линия подсвечивается)
   • параллакс по скроллу и мыши
   -------------------------------------------------------------
   Подключение — одна строка перед </body>:
       <script src="background.js" defer></script>
   ============================================================= */
(function () {
  "use strict";

  const CONFIG = {
    // true  — холст сам рисует тёмную базу и становится фоном сайта (рекомендуется);
    // false — база НЕ рисуется, созвездие накладывается поверх текущего фона сайта.
    takeOverBackground: true,
    forceTransparentPage: true, // делать html/body прозрачными (только при takeOverBackground)

    // Тёмная база (как в оригинале)
    baseTop:    "#0b0518",
    baseMid:    "#08030f",
    baseBottom: "#06030c",

    // Палитра (rgb)
    lineGlow:   "120, 70, 230",   // мягкое сияние линий
    lineCore:   "180, 130, 255",  // яркое ядро линий
    node:       "150, 95, 245",   // свечение узлов
    nodeCore:   "245, 240, 255",  // ядро узла
    star:       "200, 180, 255",  // звёзды
    pulseGlow:  "168, 85, 247",   // свечение огонька
    pulseCore:  "255, 250, 255",  // ядро огонька

    // мягкие облака для глубины
    nebula: [
      { x: 0.12, y: 0.14, r: 0.55, c: "124, 53, 255", a: 0.10 },
      { x: 0.90, y: 0.22, r: 0.60, c: "150, 70, 240", a: 0.10 },
      { x: 0.74, y: 0.90, r: 0.62, c: "92, 40, 200",  a: 0.08 },
    ],

    stars: { density: 9000, depth: 0.10, parallax: 0.20, twinkle: 0.7 },

    maxPan: 240, mousePan: 30, dprCap: 2,

    // Слои созвездия: дальний → ближний
    layers: [
      { density: 46000, depth: 0.40, parallax: 0.55, linkDist: 230, maxLinks: 3,
        lineW: 1.0, glowW: 5, glowA: 0.10, coreA: 0.30, nodeR: 2.0, hubEvery: 5,
        pulses: 4, speed: 60, drift: 7 },
      { density: 34000, depth: 0.85, parallax: 1.00, linkDist: 250, maxLinks: 3,
        lineW: 1.3, glowW: 7, glowA: 0.14, coreA: 0.42, nodeR: 2.6, hubEvery: 4,
        pulses: 6, speed: 80, drift: 11 },
    ],
  };

  // ---- Canvas ----
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

  // ---- Состояние ----
  let W = 0, H = 0, dpr = 1;
  let layers = [], stars = null, baseGrad = null;
  let glowNode = null, glowPulse = null;
  let scrollFrac = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let lastT = 0, rafId = null;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Пре-рендер мягкого свечения (спрайт) для узлов/огоньков — даёт настоящий блум
  function makeGlowSprite(size, color, hardness) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(" + color + ",1)");
    grd.addColorStop(hardness, "rgba(" + color + ",0.45)");
    grd.addColorStop(1, "rgba(" + color + ",0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
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
        ps: rand(0.25, 0.7), x: 0, y: 0, pulse: rand(0, Math.PI * 2),
        hub: i % cfg.hubEvery === 0,
      });
    }
    const adj = nodes.map(() => []);
    const edges = [];
    const edgeSet = new Set();
    const d2 = cfg.linkDist * cfg.linkDist;
    const kmax = cfg.maxLinks || 3;
    for (let i = 0; i < nodes.length; i++) {
      // ближайшие соседи в радиусе linkDist
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
      const e = edges[(Math.random() * edges.length) | 0];
      pulses.push({ a: e[0], b: e[1], t: Math.random(),
        speed: cfg.speed * rand(0.8, 1.3), trail: [] });
    }
    return { cfg, nodes, edges, adj, pulses, worldH };
  }

  function buildStars() {
    const worldH = H + CONFIG.maxPan, worldW = W + CONFIG.mousePan * 2 + 100;
    const n = Math.round((worldW * worldH) / CONFIG.stars.density);
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ bx: rand(0, worldW), by: rand(-CONFIG.maxPan, H),
        r: rand(0.4, 1.3), a: rand(0.25, 0.8), ph: rand(0, Math.PI * 2),
        sp: rand(0.5, 1.6) });
    }
    return arr;
  }

  function rebuild() {
    layers = CONFIG.layers.map(buildLayer);
    stars = buildStars();
  }

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
    glowNode = makeGlowSprite(64, CONFIG.node, 0.22);
    glowPulse = makeGlowSprite(96, CONFIG.pulseGlow, 0.18);
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
    // облака
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of CONFIG.nebula) {
      const px = n.x * W + mx * CONFIG.mousePan * 1.6;
      const py = n.y * H - scrollFrac * CONFIG.maxPan * 0.5 + my * CONFIG.mousePan * 1.6;
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
    const offY = -scrollFrac * CONFIG.maxPan * cfg.parallax + my * CONFIG.mousePan * cfg.depth;
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

  function renderLayer(layer, dt, tnow) {
    const cfg = layer.cfg;
    const offY = -scrollFrac * CONFIG.maxPan * cfg.parallax + my * CONFIG.mousePan * cfg.depth;
    const offX = mx * CONFIG.mousePan * cfg.depth;
    for (const n of layer.nodes) {
      n.x = n.bx + offX + Math.sin(tnow * n.ps + n.px) * cfg.drift;
      n.y = n.by + offY + Math.cos(tnow * n.ps + n.py) * cfg.drift;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // ЛИНИИ — проход 1: мягкое сияние (блум)
    ctx.lineWidth = cfg.glowW;
    ctx.strokeStyle = "rgba(" + CONFIG.lineGlow + "," + cfg.glowA + ")";
    ctx.beginPath();
    for (const [i, j] of layer.edges) {
      const a = layer.nodes[i], b = layer.nodes[j];
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    // ЛИНИИ — проход 2: яркое ядро
    ctx.lineWidth = cfg.lineW;
    ctx.strokeStyle = "rgba(" + CONFIG.lineCore + "," + cfg.coreA + ")";
    ctx.beginPath();
    for (const [i, j] of layer.edges) {
      const a = layer.nodes[i], b = layer.nodes[j];
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // УЗЛЫ — свечение (спрайт) + ядро
    for (const n of layer.nodes) {
      const k = n.hub ? 1.7 : 1.0;
      const pr = cfg.nodeR * k * (3.2 + 0.5 * Math.sin(tnow * 1.4 + n.pulse));
      ctx.globalAlpha = n.hub ? 0.55 : 0.4;
      ctx.drawImage(glowNode, n.x - pr, n.y - pr, pr * 2, pr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(" + CONFIG.nodeCore + ",0.9)";
    for (const n of layer.nodes) {
      const cr = cfg.nodeR * (n.hub ? 1.15 : 0.7);
      ctx.beginPath(); ctx.arc(n.x, n.y, cr, 0, Math.PI * 2); ctx.fill();
    }

    // ОГОНЬКИ — импульс, подсвечивающий линию + хвост
    for (const p of layer.pulses) {
      const A = layer.nodes[p.a], B = layer.nodes[p.b];
      const ex = B.x - A.x, ey = B.y - A.y, len = Math.hypot(ex, ey) || 1;
      if (!reduceMotion) p.t += (p.speed * dt) / len;
      if (p.t >= 1) {
        p.t -= 1;
        const nxt = nextNode(layer, p.a, p.b);
        p.a = p.b; p.b = nxt; p.trail.length = 0;
      }
      const x = A.x + ex * p.t, y = A.y + ey * p.t;
      const ux = ex / len, uy = ey / len;

      // линия "загорается" вокруг импульса: яркий отрезок с градиентом
      const seg = 46;
      const x0 = x - ux * seg, y0 = y - uy * seg;
      const x1 = x + ux * seg, y1 = y + uy * seg;
      const lg = ctx.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, "rgba(" + CONFIG.pulseGlow + ",0)");
      lg.addColorStop(0.5, "rgba(" + CONFIG.pulseCore + ",0.9)");
      lg.addColorStop(1, "rgba(" + CONFIG.pulseGlow + ",0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth = cfg.lineW + 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();

      // хвост
      p.trail.push(x, y);
      if (p.trail.length > 18) p.trail.splice(0, p.trail.length - 18);
      for (let k = 0; k < p.trail.length - 2; k += 2) {
        const f = k / p.trail.length;
        ctx.strokeStyle = "rgba(" + CONFIG.pulseGlow + "," + (0.04 + f * 0.22) + ")";
        ctx.lineWidth = (cfg.nodeR) * (0.5 + f * 1.2);
        ctx.beginPath();
        ctx.moveTo(p.trail[k], p.trail[k + 1]);
        ctx.lineTo(p.trail[k + 2], p.trail[k + 3]);
        ctx.stroke();
      }

      // свечение + ядро огонька
      const gr = cfg.nodeR * 7;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(glowPulse, x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(" + CONFIG.pulseCore + ",1)";
      ctx.beginPath(); ctx.arc(x, y, cfg.nodeR * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0;
    lastT = t;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    const tnow = t / 1000;
    renderBase();
    renderStars(tnow);
    for (const layer of layers) renderLayer(layer, dt, tnow);
    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    lastT = performance.now();
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
    resize(); onScroll();
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
