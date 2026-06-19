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
  const random = (min, max) => min + Math.random() * (max - min);

  function updateParallax() {
    const scrollY = latestScroll;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = clamp(scrollY / maxScroll, 0, 1);

    layers.forEach((layer, index) => {
      const depth = parseFloat(layer.dataset.depth || '0.1');

      const y = scrollY * depth * 1.48;
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

  function createEnergyLayer() {
    let energyLayer = scene.querySelector('.bg-energy-layer');
    if (!energyLayer) {
      energyLayer = document.createElement('div');
      energyLayer.className = 'bg-energy-layer';
      scene.appendChild(energyLayer);
    }
    return energyLayer;
  }

  const energySegments = [
    [[3, 25], [16, 16]], [[16, 16], [29, 24]], [[29, 24], [45, 18]], [[45, 18], [61, 28]],
    [[8, 49], [23, 39]], [[23, 39], [36, 52]], [[36, 52], [52, 44]], [[52, 44], [68, 55]],
    [[5, 74], [21, 63]], [[21, 63], [36, 77]], [[36, 77], [55, 66]], [[55, 66], [72, 78]],
    [[70, 16], [83, 8]], [[83, 8], [94, 18]], [[74, 38], [88, 30]], [[88, 30], [100, 42]],
    [[67, 58], [84, 47]], [[84, 47], [98, 61]], [[70, 82], [88, 69]], [[88, 69], [103, 82]],
    [[32, 30], [50, 22]], [[50, 22], [66, 34]], [[32, 58], [50, 48]], [[50, 48], [68, 62]],
    [[31, 86], [52, 74]], [[52, 74], [72, 88]], [[15, 16], [23, 39]], [[45, 18], [36, 52]],
    [[83, 8], [88, 30]], [[88, 30], [84, 47]], [[52, 44], [84, 47]], [[36, 77], [52, 74]]
  ];

  function spawnEnergyPulse(energyLayer) {
    const pulse = document.createElement('span');
    pulse.className = 'bg-energy-pulse';

    const segment = energySegments[Math.floor(Math.random() * energySegments.length)];
    const reversed = Math.random() > 0.5;
    const start = reversed ? segment[1] : segment[0];
    const end = reversed ? segment[0] : segment[1];

    // Sometimes disappear before the segment end.
    const endFactor = random(0.44, 1.02);
    const endX = start[0] + (end[0] - start[0]) * endFactor;
    const endY = start[1] + (end[1] - start[1]) * endFactor;

    const jitterStartX = random(-1.2, 1.2);
    const jitterStartY = random(-1.2, 1.2);
    const jitterEndX = random(-1.5, 1.5);
    const jitterEndY = random(-1.5, 1.5);

    const sx = `${start[0] + jitterStartX}vw`;
    const sy = `${start[1] + jitterStartY}vh`;
    const ex = `${endX + jitterEndX}vw`;
    const ey = `${endY + jitterEndY}vh`;

    const angle = Math.atan2((endY - start[1]), (endX - start[0])) * 180 / Math.PI;
    const duration = random(3600, 8800);
    const size = random(5.5, 10.5);
    const maxOpacity = random(0.44, 0.86);

    pulse.style.setProperty('--sx', sx);
    pulse.style.setProperty('--sy', sy);
    pulse.style.setProperty('--ex', ex);
    pulse.style.setProperty('--ey', ey);
    pulse.style.setProperty('--pulse-angle', `${angle.toFixed(2)}deg`);
    pulse.style.setProperty('--pulse-size', `${size.toFixed(2)}px`);
    pulse.style.setProperty('--max-opacity', maxOpacity.toFixed(2));
    pulse.style.animation = `ivixEnergySpark ${duration}ms cubic-bezier(.22,.62,.23,1) forwards`;

    energyLayer.appendChild(pulse);

    window.setTimeout(() => {
      pulse.remove();
    }, duration + 160);
  }

  function startEnergyPulses() {
    if (reduceMotion) return;

    const energyLayer = createEnergyLayer();
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    const maxPulses = isMobile ? 5 : 11;

    let active = 0;

    const loop = () => {
      if (document.hidden) {
        window.setTimeout(loop, 1200);
        return;
      }

      if (active < maxPulses) {
        active += 1;
        spawnEnergyPulse(energyLayer);
        window.setTimeout(() => {
          active = Math.max(0, active - 1);
        }, random(3800, 9000));
      }

      window.setTimeout(loop, random(isMobile ? 950 : 520, isMobile ? 1900 : 1350));
    };

    // Initial staggered sparks.
    for (let i = 0; i < (isMobile ? 3 : 7); i += 1) {
      window.setTimeout(() => {
        active += 1;
        spawnEnergyPulse(energyLayer);
        window.setTimeout(() => {
          active = Math.max(0, active - 1);
        }, random(4200, 8500));
      }, i * random(280, 640));
    }

    window.setTimeout(loop, 900);
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
  startEnergyPulses();
})();
