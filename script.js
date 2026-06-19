const burger = document.querySelector('.burger');
const nav = document.querySelector('.main-nav');
const navLinks = [...document.querySelectorAll('.main-nav a')];

burger?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    burger?.setAttribute('aria-expanded', 'false');
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

  const anchorY = window.scrollY + Math.min(window.innerHeight * 0.42, 360);
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

const player = document.getElementById('twitch-player');
const wrap = document.querySelector('.player-wrap');
if (player && wrap) {
  const channel = wrap.dataset.channel || 'ivix_tv';
  if (validHost) {
    const params = new URLSearchParams();
    params.set('channel', channel);
    params.set('muted', 'true');
    addTwitchParents(params);
    player.src = `https://player.twitch.tv/?${params.toString()}`;
    player.addEventListener('load', () => wrap.classList.add('player-ready'), { once: true });
  } else {
    player.remove();
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
