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

const sections = navLinks
  .map(link => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const setActive = () => {
  const y = window.scrollY + 130;
  let current = sections[0]?.id;
  sections.forEach(section => {
    if (section.offsetTop <= y) current = section.id;
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
};
window.addEventListener('scroll', setActive, { passive: true });
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
