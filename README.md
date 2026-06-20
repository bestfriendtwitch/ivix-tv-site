# IVIX_TV site

Статический сайт-фанхаб для Twitch-канала **IVIX_TV**.

Сайт: <https://ivixtv.ru/>

## Что внутри

- Главный hero-блок с быстрыми ссылками.
- Анимированный hero-арт с параллаксом за курсором.
- Twitch-плеер и чат.
- Блок «О канале».
- Блок «Поддержать канал».
- Полезные ссылки: Telegram, ВКонтакте, YouTube, Twitch, TikTok.
- Расписание.
- Клипы.
- Блок для сотрудничества.
- Анимированный звёздный фон через `background.js`.

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
google4545a86f803af70e.html    # подтверждение Google Search Console — НЕ удалять
yandex_23577d53cb2464f6.html   # подтверждение Яндекс.Вебмастер — НЕ удалять
assets/
  favicon.svg
  og-preview-v2.png
  hero-art.webp                # портрет hero-арта (средний слой)
  hero-art-front.webp          # слой искр (передний слой параллакса)
```

## Основные файлы

### `index.html`

Основная разметка сайта, SEO, Open Graph и Twitter meta-теги.
Здесь же подключена Яндекс.Метрика и небольшой инлайн-скрипт параллакса hero-арта.

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

Анимированный звёздный фон.

Текущий рабочий принцип: `fixed wrapper + page canvas`.

Не возвращать варианты, где:

- canvas напрямую лежит `absolute` в `body`;
- фон пересчитывается через `scrollY` каждый кадр;
- canvas включён на мобильной версии.

### Hero-арт и параллакс

Декоративный арт в hero-секции. В `index.html` это блок:

```html
<div class="hero-art" aria-hidden="true">
  <span class="ha-layer ha-back"    data-depth="30"></span>
  <span class="ha-layer ha-portrait" data-depth="-12"></span>
  <span class="ha-layer ha-front"   data-depth="60"></span>
</div>
```

- `ha-back` — облака на CSS-градиентах (задний слой);
- `ha-portrait` — `assets/hero-art.webp` (девушка с микрофоном);
- `ha-front` — `assets/hero-art-front.webp` (искры, передний слой).

Движение слоёв за курсором делает инлайн-скрипт в конце `index.html`. Сила параллакса настраивается атрибутами `data-depth`, глубина «выхода из блоков» — свойством `bottom` у `.hero-art` в CSS. При `prefers-reduced-motion` параллакс отключается автоматически. Сами `.webp` лежат в `assets/` — не удалять.

### `assets/`

Только рабочие публичные ассеты сайта.

Ожидаемые файлы:

```text
assets/favicon.svg
assets/og-preview-v2.png
assets/hero-art.webp
assets/hero-art-front.webp
```

Черновики, скриншоты, референсы и дубли в репозиторий не коммитить.

## Аналитика и поисковые системы

- **Яндекс.Метрика:** счётчик `109996217`. Цель «Переход на Twitch» (идентификатор `twitch_click`)
  висит через `onclick="ym(109996217,'reachGoal','twitch_click')"` на ссылках, ведущих на основной канал
  (кнопки «Смотреть на Twitch», «Открыть стрим», Twitch в шапке/соц-блоке, «Открыть Twitch»).
  Эти `onclick` не удалять — на них держится измерение воронки сайт → Twitch.
- **UTM-метки:** ссылки из соцсетей на сайт размечать через `?utm_source=...&utm_medium=...`,
  чтобы видеть в Метрике, какая площадка приводит людей.
- **Поисковые системы:** сайт зарегистрирован в Яндекс.Вебмастере и Google Search Console.
  Подтверждение прав — файлами `google4545a86f803af70e.html` и `yandex_23577d53cb2464f6.html` в корне.
  **Удалять их нельзя** — иначе слетит подтверждение в поисковиках.

## Что не коммитить

Не добавлять в репозиторий:

```text
favicon.svg                 # дубль в корне
og-preview.png              # старое превью в корне
assets/mockup-reference.png # референс, не используется сайтом
download                    # стрэй-файл (был мусорной копией .gitignore)
*_old.*
*.bak
*.tmp
CHECK_AFTER_UPLOAD.txt
_redirects
_headers
```

Репозиторий используется как корень статического сайта, поэтому всё лишнее из репозитория может стать публичным файлом на сайте.

## Хостинг и деплой

- **Хостинг:** Timeweb App Platform (frontend-приложение). Сборка не требуется — отдаётся статика из репозитория.
- **DNS:** Cloudflare в режиме **только DNS** (запись НЕ проксируется), указывает на IP Timeweb `46.19.64.95`.
  - ⚠️ **Не включать проксирование Cloudflare** (оранжевое облако): с проксированием сайт недоступен
    в РФ без VPN. Именно поэтому проект ушёл с хостинга на Cloudflare на Timeweb, оставив Cloudflare
    только как DNS-«диспетчер» домена.
- **Редирект `www.ivixtv.ru` → `ivixtv.ru`:** на уровне App Platform штатно пока не поддерживается;
  решается отдельно. На SEO это не критично — `canonical` стоит на каждой странице.

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
git add index.html styles.css script.js background.js 404.html robots.txt sitemap.xml site.webmanifest README.md .gitignore assets google4545a86f803af70e.html yandex_23577d53cb2464f6.html
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
