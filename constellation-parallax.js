(() => {
  const scene = document.querySelector('.bg-scene');
  const layers = Array.from(document.querySelectorAll('.bg-layer'));

  if (!scene || !layers.length) return;

  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let latestScroll = window.scrollY || 0;
  let latestMouseX = 0;
  let latestMouseY = 0;
  let ticking = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function updateParallax() {
    const scrollY = latestScroll;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = clamp(scrollY / maxScroll, 0, 1);

    layers.forEach((layer, index) => {
      const depth = parseFloat(layer.dataset.depth || '0.1');

      // Stronger real parallax: near layers move much more, far layers stay calmer.
      const y = scrollY * depth * 1.42;
      const x =
        Math.sin(progress * Math.PI * 2 + index * 1.35) * (12 + index * 7) +
        latestMouseX * depth * 18;

      const driftY = latestMouseY * depth * 12;
      const rotate = Math.sin(progress * Math.PI + index * 0.8) * (0.42 + depth * 1.35);
      const scale = 1 + depth * 0.13;

      layer.style.transform =
        `translate3d(${x.toFixed(2)}px, ${(y + driftY).toFixed(2)}px, 0) ` +
        `scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(3)}deg)`;
    });

    ticking = false;
  }

  function requestUpdate() {
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  function onScroll() {
    latestScroll = window.scrollY || window.pageYOffset || 0;
    requestUpdate();
  }

  function onPointerMove(event) {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;

    latestMouseX = ((event.clientX / width) - 0.5) * 2;
    latestMouseY = ((event.clientY / height) - 0.5) * 2;

    requestUpdate();
  }

  if (reduceMotion) {
    layers.forEach((layer) => {
      layer.style.transform = 'translate3d(0, 0, 0)';
    });
    return;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  updateParallax();
})();
