# LFnote REST API

База: `http://localhost:3001` (в продакшене — тот же домен, что и фронтенд, путь `/api`).

Формат ответов — JSON. При ошибке сервер возвращает HTTP-код и тело вида `{"error": "сообщение"}`.

## Сессии

- Сессия хранится в **HTTP-only cookie** `lfnote_token`.
- Все эндпоинты ниже требуют авторизации, кроме `POST /api/auth/register` и `POST /api/auth/login`.
- Cookie передаётся автоматически (на фронтенде включён `credentials: 'include'`), поэтому в примерах ниже `-b/-c` cookie-jar нужны только для curl.
- При отсутствии/истечении сессии — `401 {"error":"Требуется авторизация"}`.
- Сессии живут 30 дней; сессия пользователя единственная: при новом входе старая удаляется.

### POST /api/auth/register — регистрация

Тело: `{"login": "имя", "password": "пароль"}`. Ограничения: логин 3–40 символов, пароль ≥ 4 символов.

Ответ `201`:

```json
{ "user": { "id": 2, "login": "alice" } }
```

### POST /api/auth/login — вход

Тело: `{"login", "password"}`. Ответ `200`:

```json
{ "user": { "id": 2, "login": "alice" } }
```

### POST /api/auth/logout — выход

Удаляет сессию. Ответ `200 {"ok":true}`.

### GET /api/auth/me — текущий пользователь

Ответ `200`:

```json
{ "user": { "id": 2, "login": "alice" } }
```

Если сессия невалидна — `401`.

---

## Заметки (tasks)

Поле `text` — HTML (санитизируется на клиенте). Поле `date` — ISO `YYYY-MM-DD`.
Для диаграммы Ганта у задачи есть поля `startDate`, `endDate`, `parentId` (иерархия),
`progress` (0–100). Если `startDate`/`endDate` отсутствуют, на Ганте задача занимает день `date`.

### GET /api/tasks — список

Ответ:

```json
{
  "tasks": [
    {
      "id": "b2e…",
      "text": "<p>Купить молоко</p>",
      "date": "2026-08-12",
      "startDate": "2026-08-10",
      "endDate": "2026-08-14",
      "parentId": null,
      "progress": 40,
      "done": false,
      "createdAt": "2026-08-10T18:00:00.000Z",
      "completedAt": null,
      "order": 1000,
      "style": { "bg": "#e9c46a", "hatch": true, "font": null },
      "tags": ["дом"],
      "folderId": 1
    }
  ]
}
```

`style` может быть `null`. `folderId` — `null`, если заметка не в папке.
`startDate`/`endDate`/`parentId` могут быть `null`; `progress` — число 0–100.

### POST /api/tasks — создать

Тело: `{"text", "date"}` + опционально `{"startDate", "endDate", "parentId", "progress", "folderId"}`.
Ответ `201` — объект `task` как выше.

### PATCH /api/tasks/:id — изменить

Тело — любое подмножество: `{"text", "date", "done", "order", "style", "folderId", "tags", "startDate", "endDate", "parentId", "progress"}`.
- `folderId` — число (id папки пользователя) или `null` (убрать из папки).
- `tags` — полный новый массив имён тегов; сервер синхронизирует связь `task_tags`.
- `startDate`/`endDate` — ISO `YYYY-MM-DD` или `null` (сбросить на `date`).
- `parentId` — id существующей задачи пользователя или `null` (сделать верхнеуровневой);
  циклы иерархии запрещены (задача не может стать родителем своего потомка).
- `progress` — целое 0–100.
- Если заметка не принадлежит текущему пользователю — `404`.

### DELETE /api/tasks/:id — удалить

`200 {"ok":true}`. Связанные `links`, `task_tags` и подзадачи удаляются каскадно (FK `ON DELETE CASCADE`).

### POST /api/tasks/batch — массовое обновление

Тело:

```json
{
  "tasks": [
    { "id": "a1", "date": "2026-08-13", "order": 1000 },
    { "id": "b2", "folderId": 2 },
    { "id": "c3", "startDate": "2026-08-20", "endDate": "2026-09-01", "progress": 50 }
  ]
}
```

Каждый элемент может содержать `date`, `order`, `folderId`. Ответ `200 {"ok":true}`.
`folderId` проверяется на принадлежность папки пользователю.

---

## Стрелки (links)

### GET /api/links — список

```json
{ "links": [ { "id": "l1", "from": "a1", "to": "b2", "createdAt": "…", "style": { "type": "routed", "color": "#d9534f", "width": 2, "dashed": false } } ] }
```

### POST /api/links — создать

Тело: `{"from", "to"}`. Проверка: обе заметки должны существовать и принадлежать пользователю, `from !== to`. Ответ `201` — объект `link`.

### PATCH /api/links/:id — изменить

Тело: `{"from", "to", "style"}`.

### DELETE /api/links/:id — удалить

`200 {"ok":true}`.

---

## Цвета колонок

### GET /api/columns — все цвета

```json
{ "columns": { "2026-08-12": "#e9c46a" } }
```

### PUT /api/columns/:date — задать цвет

Тело: `{"color": "#e9c46a"}`. Ответ `200 {"ok":true}`.

### DELETE /api/columns/:date — сбросить цвет

`200 {"ok":true}`.

---

## Теги

Имена тегов уникальны в рамках пользователя (без учёта регистра — см. схему БД), максимум 40 символов.

### GET /api/tags — список

```json
{ "tags": ["дом", "работа"] }
```

### POST /api/tags — создать

Тело: `{"name": "дом"}`. Ответ `201` — обновлённый список `{"tags": [...]}`.

### PATCH /api/tags/:name — переименовать

Путь — старое имя (URL-encoded), тело `{"name": "новое"}`. Ответ — обновлённый список `tags`.
Переименование обновляет и связи заметок (пересоздаёт тег и перевешивает `task_tags`).

### DELETE /api/tags/:name — удалить

Ответ — обновлённый список `tags`. Связи заметок удаляются каскадно.

---

## Папки

Максимум **10 папок** на пользователя. Имена уникальны в рамках пользователя (см. схему БД).

### GET /api/folders — список

```json
{ "folders": [ { "id": 1, "name": "Работа", "position": 0 } ] }
```

### POST /api/folders — создать

Тело: `{"name": "Работа"}`. Ответ `201`:

```json
{ "folder": { "id": 1, "name": "Работа", "position": 1 } }
```

При превышении лимита 10 — `400 {"error":"Максимум 10 папок"}`.

### PATCH /api/folders/:id — переименовать

Тело: `{"name": "Новое"}`. Ответ — объект `folder`.

### DELETE /api/folders/:id — удалить

`200 {"ok":true}`. Заметки папки остаются, `folder_id` становится `null` (FK `ON DELETE SET NULL`).

---

## Интерактивная документация

Swagger UI: `http://localhost:3001/api/docs` (OpenAPI-спецификация: `GET /api/openapi.json`).
