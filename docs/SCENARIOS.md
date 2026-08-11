# Сценарии разработки и настройки

## Свежая установка

```bash
npm install
createdb lfnote
node server/scripts/init-db.mjs        # применить схему
node server/scripts/migrate-json.mjs   # демо-аккаунт + перенос data/*.json
npm run dev                            # сервер :3001 + фронтенд :5173
```

Открыть `http://localhost:5173`. Вход: `demo` / `demo123` (или зарегистрируйте свой аккаунт).

## Переменные окружения сервера

| переменная | значение по умолчанию | примечание |
|---|---|---|
| `DATABASE_URL` | `postgres://localhost:5432/lfnote` | строка подключения к Postgres |
| `PORT` | `3001` | порт API |
| `SEED_LOGIN` | `demo` | логин демо-аккаунта при миграции |
| `SEED_PASSWORD` | `demo123` | пароль демо-аккаунта |

## Сброс базы данных

```bash
dropdb lfnote
createdb lfnote
node server/scripts/init-db.mjs
```

> Старые данные из `data/*.json` при этом не трогаются — можно повторить миграцию заново.

## Перенос данных из JSON в Postgres

Данные в `data/tasks.json`, `data/links.json`, `data/tags.json`, `data/columns.json`
переносятся скриптом `server/scripts/migrate-json.mjs` в аккаунт, который он сам создаёт.

Порядок внутри скрипта: пользователь → заметки → теги → связи тегов → стрелки → цвета колонок.
Скрипт идемпотентен и безопасен для повторного запуска.

Чтобы перенести данные под свой логин:

```bash
SEED_LOGIN=ivan SEED_PASSWORD=secret node server/scripts/migrate-json.mjs
```

## Мультиаккаунт и изоляция

- У каждого пользователя свои заметки, теги, стрелки, цвета и папки.
- Все SELECT/UPDATE/DELETE фильтруются по `user_id`; чужие записи недоступны (404).
- Папки других пользователей отклоняются (400), лимит — 10 папок на пользователя.

## Проверки перед релизом

```bash
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```

## Документация API

- Интерактивно: `http://localhost:3001/api/docs` (Swagger UI).
- Спецификация: `http://localhost:3001/api/openapi.json`.
- Подробное описание: `docs/API.md`.
