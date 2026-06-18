# IVIX_TV site

Статический сайт для Twitch-стримера IVIX_TV.

## Локальный запуск

```bash
python3 -m http.server 8000
```

Открыть:

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

## Структура

```text
index.html              Главная страница
styles.css              Стили сайта
script.js               Меню, активная навигация, Twitch embed
404.html                Страница ошибки
robots.txt              Индексация поисковиками
sitemap.xml             Карта сайта
site.webmanifest        Настройки для мобильного ярлыка/PWA
_headers                Security/cache headers для Cloudflare Pages
_redirects              404-правило для Cloudflare Pages
assets/favicon.svg      Иконка сайта
assets/og-preview.png   Превью для Telegram/VK/Discord
assets/mockup-reference.png  Визуальный референс
```

## Деплой на Cloudflare Pages

1. Создать GitHub-репозиторий, например `ivix-tv-site`.
2. Загрузить все файлы из этой папки в репозиторий.
3. В Cloudflare открыть `Workers & Pages`.
4. Нажать `Create application` → `Pages` → `Connect to Git`.
5. Выбрать репозиторий.
6. Настройки билда:

```text
Framework preset: None
Build command: оставить пустым
Build output directory: /
```

7. Нажать `Save and Deploy`.
8. Получить ссылку вида:

```text
https://ivix-tv-site.pages.dev
```

## Что заменить перед публикацией

В `index.html` заменить заглушки:

- ссылки Telegram/VK/YouTube/TikTok;
- ссылку на донат;
- расписание стримов;
- команды чата;
- описание канала;
- email для сотрудничества, если нужен другой;
- реальные клипы или VOD.

## Важно про Twitch embed

Twitch требует параметр `parent` для встраивания плеера. В `script.js` он подставляется автоматически из текущего домена, поэтому на `localhost` и на Cloudflare Pages плеер должен работать корректно.

После подключения собственного домена ничего дополнительно менять не нужно, если сайт открывается с этого домена.
