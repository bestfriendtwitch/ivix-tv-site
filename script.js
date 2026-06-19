const burger = document.querySelector('.burger');
const nav = document.querySelector('.main-nav');
const navLinks = [...document.querySelectorAll('.main-nav a')];

burger?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
});

navLinks.forEach(link => {
  link.addEventListener('click', event => {
    nav.classList.remove('open');
    burger?.setAttribute('aria-expanded', 'false');

    const href = link.getAttribute('href');

    if (link.dataset.scrollTop === 'true') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (href === '#about') {
      const target = document.querySelector('#about');
      if (target) {
        event.preventDefault();
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 78;
        const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 2;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
  });
});

const navTargets = navLinks
  .map(link => {
    const selector = link.getAttribute('href');
    return { link, target: selector ? document.querySelector(selector) : null };
  })
  .filter(item => item.target);

const setActive = () => {
  if (!navTargets.length) return;

  const anchorY = window.scrollY + Math.min(window.innerHeight * 0.22, 190);
  let current = navTargets[0];

  navTargets.forEach(item => {
    const top = item.target.getBoundingClientRect().top + window.scrollY;
    if (top <= anchorY) current = item;
  });

  navLinks.forEach(link => link.classList.remove('active'));
  current.link.classList.add('active');
};
window.addEventListener('scroll', setActive, { passive: true });
window.addEventListener('resize', setActive);
setActive();

document.getElementById('year').textContent = new Date().getFullYear();

const host = window.location.hostname;
const validHost = Boolean(host && host !== '');

const twitchParents = [
  host,
  'ivixtv.ru',
  'www.ivixtv.ru',
  'ivix-tv-site.pages.dev',
  'localhost',
  '127.0.0.1'
]
  .filter(Boolean)
  .filter((value, index, list) => list.indexOf(value) === index);

const addTwitchParents = params => {
  twitchParents.forEach(parent => params.append('parent', parent));
};

const playerTarget = document.getElementById('twitch-player');
const wrap = document.querySelector('.player-wrap');
const statusDot = document.getElementById('stream-status-dot');
const statusText = document.getElementById('stream-status-text');

const setStreamStatus = state => {
  if (!statusDot || !statusText) return;

  statusDot.classList.remove('status-online', 'status-offline', 'status-checking');

  if (state === 'online') {
    statusDot.classList.add('status-online');
    statusText.textContent = 'Сейчас в эфире';
    return;
  }

  if (state === 'checking') {
    statusDot.classList.add('status-checking');
    statusText.textContent = 'Проверяем эфир';
    return;
  }

  statusDot.classList.add('status-offline');
  statusText.textContent = 'Сейчас не в эфире';
};

const loadScript = src => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
    if (window.Twitch?.Player) resolve();
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

if (playerTarget && wrap) {
  const channel = wrap.dataset.channel || 'ivix_tv';

  if (validHost) {
    setStreamStatus('checking');

    loadScript('https://player.twitch.tv/js/embed/v1.js')
      .then(() => {
        const player = new Twitch.Player('twitch-player', {
          channel,
          muted: true,
          width: '100%',
          height: '100%',
          parent: twitchParents
        });

        let statusResolved = false;
        const resolveStatus = state => {
          statusResolved = true;
          setStreamStatus(state);
        };

        player.addEventListener(Twitch.Player.READY, () => {
          wrap.classList.add('player-ready');
          window.setTimeout(() => {
            if (!statusResolved) setStreamStatus('offline');
          }, 3500);
        });

        player.addEventListener(Twitch.Player.ONLINE, () => resolveStatus('online'));
        player.addEventListener(Twitch.Player.OFFLINE, () => resolveStatus('offline'));
        player.addEventListener(Twitch.Player.ENDED, () => resolveStatus('offline'));
      })
      .catch(() => {
        setStreamStatus('offline');
        playerTarget.remove();
      });
  } else {
    setStreamStatus('offline');
    playerTarget.remove();
  }
}

const chat = document.getElementById('twitch-chat');
const chatWrap = document.querySelector('.chat-embed-wrap');
if (chat && chatWrap) {
  const channel = chatWrap.dataset.channel || 'ivix_tv';
  if (validHost) {
    const params = new URLSearchParams();
    addTwitchParents(params);
    params.set('darkpopout', '');
    chat.src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${params.toString()}`;
    chat.addEventListener('load', () => chatWrap.classList.add('chat-ready'), { once: true });
  } else {
    chat.remove();
  }
}
