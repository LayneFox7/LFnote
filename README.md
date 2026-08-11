# LFnote — планировщик недели

Ежедневник-планировщик на неделю: карточки-заметки с чекбоксами, тегами,
папками, стрелками-связями и цветовыми акцентами. Мультиаккаунтный,
данные хранятся в PostgreSQL.

- Фронтенд: React + TypeScript + Vite (папка `src/`)
- Бэкенд: Node.js + Express, REST API (папка `server/`)
- БД: PostgreSQL (схема `server/db/schema.sql`)
- Документация API: Swagger UI на `/api/docs`

## Быстрый старт

```bash
npm install
createdb lfnote
node server/scripts/init-db.mjs        # применить схему
node server/scripts/migrate-json.mjs   # демо-аккаунт + перенос data/*.json
npm run dev                            # сервер :3001 + фронтенд :5173
```

Открыть `http://localhost:5173`, войти как `demo` / `demo123`.

> Если `createdb` недоступен — создайте базу вручную (например, в pgAdmin)
> с именем `lfnote`. Подробности подключения: `server/db.js` (env `DATABASE_URL`).

## Команды

| команда | назначение |
|---|---|
| `npm run dev` | сервер API (:3001) + фронтенд (:5173) с HMR |
| `npm run server` / `npm start` | только API |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | oxlint |

## Документация

- `docs/API.md` — REST API (аутентификация, заметки, теги, папки, стрелки, цвета)
- `docs/DB.md` — схема PostgreSQL и скрипты миграции
- `docs/SCENARIOS.md` — установка, сброс, перенос данных, проверки
- `docs/USER_GUIDE.md` — руководство пользователя
- Swagger UI: `http://localhost:3001/api/docs` (спецификация: `/api/openapi.json`)
