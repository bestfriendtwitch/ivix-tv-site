(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    root.style.setProperty('--geo-scroll', '0px');
    return;
  }

  let ticking = false;

  const update = () => {
    const y = window.scrollY || window.pageYOffset || 0;
    root.style.setProperty('--geo-scroll', `${y}px`);
    ticking = false;
  };

  const requestUpdate = () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  };

  update();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
})();
