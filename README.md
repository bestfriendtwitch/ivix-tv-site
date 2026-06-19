# IVIX_TV site

Статический сайт для Twitch-канала **IVIX_TV**.

Основной адрес сайта:

```text
https://ivixtv.ru
```

Технический адрес Cloudflare Pages:

```text
https://ivix-tv-site.pages.dev
```

## Стек

Сайт сделан как простой статический проект:

```text
index.html
styles.css
script.js
404.html
robots.txt
sitemap.xml
site.webmanifest
assets/
```

Без сборщика, без React, без Node.js и без backend.

## Хостинг

Проект хранится в GitHub:

```text
https://github.com/bestfriendtwitch/ivix-tv-site
```

Деплой идет автоматически через **Cloudflare Pages**.

Настройки Cloudflare Pages:

```text
Framework preset: None
Build command: пусто
Build output directory: /
Production branch: main
```

## Домен

Основной домен:

```text
ivixtv.ru
```

Домен куплен у REG.RU, DNS управляется через Cloudflare.

Nameserver-ы Cloudflare:

```text
fattouche.ns.cloudflare.com
laylah.ns.cloudflare.com
```

В Cloudflare Pages подключены custom domains:

```text
ivixtv.ru
www.ivixtv.ru
```

`www.ivixtv.ru` перенаправляется на `ivixtv.ru` через Cloudflare Redirect Rule.

## Аналитика

Cloudflare Web Analytics включена для основного домена:

```text
ivixtv.ru
```

Ручной analytics snippet в HTML не используется, чтобы не было двойного учета.

## Twitch embed

На сайте встроены:

- Twitch-плеер канала `ivix_tv`;
- Twitch-чат на десктопе;
- кнопка открытия чата на Twitch для мобильных устройств.

В `script.js` для Twitch embed указаны разрешенные parent-домены:

```text
ivixtv.ru
www.ivixtv.ru
ivix-tv-site.pages.dev
localhost
127.0.0.1
```

Если Twitch-плеер или чат не обновились после деплоя, сначала сделать жесткое обновление страницы:

```text
Ctrl + F5
```

## Локальный запуск

Открывать сайт лучше через локальный сервер, а не двойным кликом по `index.html`.

```bash
python3 -m http.server 8000
```

Потом открыть:

```text
http://localhost:8000
```

На Windows можно использовать:

```bash
python -m http.server 8000
```

или:

```bash
py -m http.server 8000
```

## Как обновлять сайт

1. Изменить нужные файлы локально.
2. Загрузить измененные файлы в GitHub.
3. Сделать commit в ветку `main`.
4. Cloudflare Pages автоматически задеплоит новую версию.
5. Проверить:

```text
https://ivixtv.ru
https://ivix-tv-site.pages.dev
```

## Важные правила

Не добавлять обратно без необходимости:

```text
_redirects
_headers
CHECK_AFTER_UPLOAD.txt
```

`_redirects` не используется, потому что редирект `www → root` настроен через Cloudflare Rule.

`_headers` можно добавить позже отдельным аккуратным коммитом, если понадобятся security/cache headers.

`CHECK_AFTER_UPLOAD.txt` был временным файлом и больше не нужен.

## Актуальные ссылки

```text
Twitch: https://www.twitch.tv/ivix_tv
Telegram: https://t.me/ivixitsme
VK: https://vk.com/ivixitsme
YouTube: https://www.youtube.com/@ivixitsme
TikTok: https://www.tiktok.com/@ivixitsme
Donate: https://www.donationalerts.com/r/ivix_tv
Все ссылки: https://dalink.to/ivix_tv
```

Контакты для сотрудничества:

```text
ivix.tv.business@gmail.com
@trk_get
```

## Текущая стабильная версия

```text
v1.7.2
```
