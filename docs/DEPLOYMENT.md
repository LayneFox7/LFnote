# Деплой в интернет

Сервер в проде сам отдаёт собранный фронтенд (`dist/`), поэтому нужен один процесс
на одном домене + PostgreSQL. HTTPS обязателен — в продакшене cookie ставится с флагом `secure`.

Переменные окружения:

| переменная | описание |
|---|---|
| `NODE_ENV=production` | secure-cookie, trust proxy |
| `PORT` | порт (платформы подставляют сами) |
| `DATABASE_URL` | строка подключения к Postgres (если не задана — используются `PGHOST/PGUSER/PGPASSWORD/PGDATABASE`) |
| `PGSSL=true` | включить SSL для Postgres (нужен на большинстве платформ) |

Схема БД применяется при старте (`node server/scripts/init-db.mjs`) — это идемпотентно.
Демо-аккаунт и старые `data/*.json` в прод **не переносим**: пользователи регистрируются сами.

---

## Вариант 1. Railway.app (самый простой)

1. Регистрация через GitHub, кнопка **New Project → Deploy from GitHub repo** → `LayneFox7/LFnote`.
2. **New → Database → PostgreSQL** (Railway добавит `DATABASE_URL` в окружение сервиса).
3. В настройках сервиса:
   - Build: `npm ci && npm run build`
   - Start: `node server/scripts/init-db.mjs && node server/index.js`
   - Env: `NODE_ENV=production`, `PGSSL=true`
4. Открыть выданный URL вида `https://lfnote-production.up.railway.app`.

Каждый пуш в `main` → автодеплой.

## Вариант 2. Render.com (в репозитории уже есть blueprint)

1. Render → **New → Blueprint** → выбрать `LayneFox7/LFnote`.
2. Render поднимет по `render.yaml` веб-сервис + базу Postgres и сам пропишет `DATABASE_URL`.
3. В настройках сервиса добавьте env: `PGSSL=true`.
4. URL вида `https://lfnote.onrender.com`.

> На бесплатном тарифе Render «засыпает» сервис без трафика — первый заход может занять ~1 минуту.

## Вариант 3. VPS + Docker (полный контроль)

В репозитории готовы `Dockerfile` и `docker-compose.yml`.

```bash
git clone https://github.com/Laynefox7/LFnote.git
cd LFnote
POSTGRES_PASSWORD='надёжный_пароль' docker compose up -d --build
```

Приложение на `http://сервер:3001`. Для продакшена поверх нужен реверс-прокси с HTTPS,
например Caddy:

```
lfnote.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

`docker compose` при старте сам применяет схему БД (healthcheck базы + `init-db`).

---

## Проверки после деплоя

- `https://домен/api/docs` — открывается Swagger UI.
- Регистрация нового аккаунта работает, данные изолированы.
- Перезагрузка страницы не разлогинивает (cookie `lfn_session` с флагом Secure).
- Смените пароль/удалите любые тестовые аккаунты.

## Локальная проверка сборки в проде

```bash
npm run build
NODE_ENV=production DATABASE_URL=postgres://lfn:...@localhost:5432/lfnote node server/index.js
# http://localhost:3001 — и фронт, и API
```
