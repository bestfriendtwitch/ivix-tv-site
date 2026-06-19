# IVIX_TV site

Статический сайт-фанхаб для Twitch-канала **IVIX_TV**.

Сайт: <https://ivixtv.ru/>

## Что внутри

- Главный hero-блок с быстрыми ссылками.
- Twitch-плеер и чат.
- Блок «О канале».
- Блок «Поддержать канал».
- Полезные ссылки: Telegram, ВКонтакте, YouTube, Twitch, TikTok.
- Расписание.
- Клипы.
- Блок для сотрудничества.
- Анимированный звездный фон через `background.js`.

## Текущая структура

```text
index.html
404.html
styles.css
script.js
background.js
robots.txt
sitemap.xml
site.webmanifest
README.md
.gitignore
assets/
  favicon.svg
  og-preview-v2.png
```

## Основные файлы

### `index.html`

Основная разметка сайта, SEO, Open Graph и Twitter meta-теги.

Важные ссылки:

```html
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
<meta property="og:image" content="https://ivixtv.ru/assets/og-preview-v2.png" />
<meta property="og:image:secure_url" content="https://ivixtv.ru/assets/og-preview-v2.png" />
<meta name="twitter:image" content="https://ivixtv.ru/assets/og-preview-v2.png" />
```

### `styles.css`

Все стили сайта.

В конце файла могут лежать финальные override-блоки последних версий. Их не стоит удалять без проверки в браузере, потому что они фиксируют актуальный внешний вид.

### `script.js`

Логика интерфейса и Twitch-embed. Не менять без необходимости.

Особенно осторожно с параметрами `parent` для Twitch-плеера.

### `background.js`

Анимированный звездный фон.

Текущий рабочий принцип: `fixed wrapper + page canvas`.

Не возвращать варианты, где:

- canvas напрямую лежит `absolute` в `body`;
- фон пересчитывается через `scrollY` каждый кадр;
- canvas включен на мобильной версии.

### `assets/`

Только рабочие публичные ассеты сайта.

Ожидаемые файлы:

```text
assets/favicon.svg
assets/og-preview-v2.png
```

Черновики, скриншоты, референсы и дубли в репозиторий не коммитить.

## Что не коммитить

Не добавлять в репозиторий:

```text
favicon.svg                 # дубль в корне
og-preview.png              # старое превью в корне
assets/mockup-reference.png # референс, не используется сайтом
*_old.*
*.bak
*.tmp
CHECK_AFTER_UPLOAD.txt
_redirects
_headers
```

Репозиторий используется как корень статического сайта, поэтому всё лишнее из репозитория может стать публичным файлом на сайте.

## Деплой

Сайт не требует сборки.

Для деплоя достаточно загрузить содержимое корня репозитория на статический хостинг.

Перед деплоем проверить:

```text
https://ivixtv.ru/
https://ivixtv.ru/assets/favicon.svg
https://ivixtv.ru/assets/og-preview-v2.png
https://ivixtv.ru/robots.txt
https://ivixtv.ru/sitemap.xml
```

## Telegram / VK preview

После изменения OG-картинки лучше использовать новое имя файла, например:

```text
assets/og-preview-v2.png
```

После деплоя обновить кэш Telegram:

```text
@WebpageBot
/start
https://ivixtv.ru/
```

Старые уже отправленные сообщения могут не обновиться, проверять лучше новым сообщением.


## Рекомендованный стабильный backup

После финальной проверки:

```bash
git status
git add index.html styles.css script.js background.js 404.html robots.txt sitemap.xml site.webmanifest README.md .gitignore assets
git commit -m "Stable site version"
git tag stable-site
git push origin main
git push origin stable-site
```

Дополнительно можно создать zip-архив стабильной версии и прикрепить его в GitHub Releases.

## Контакты проекта

- Twitch: <https://www.twitch.tv/ivix_tv>
- Telegram: <https://t.me/ivixitsme>
- ВКонтакте: <https://vk.com/ivixitsme>
- YouTube: <https://www.youtube.com/@ivixitsme>
- TikTok: <https://www.tiktok.com/@ivixitsme>
- Donate: <https://www.donationalerts.com/r/ivix_tv>
- Для сотрудничества: `ivix.tv.business@gmail.com`
