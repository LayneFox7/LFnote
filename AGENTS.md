# LFnote — Контекст проекта

## Что это
Недельный планировщик-канбан с задачами, заметками, связями (стрелки), тегами, папками, видами (Неделя/Горизонт/Список/Гант) и авторизацией.

## Стек
- **Frontend:** Vite 8 + React 19 + TypeScript 6, HMR на `:5173`
- **Backend:** Express 5 + pg (PostgreSQL), порт `:3001`
- **БД:** PostgreSQL на `:5432`, пользователь `lfn`, база `lfnote`
- **Зависимости:** bcryptjs, cookie-parser, swagger-ui-express

## Структура файлов

### Frontend (`src/`)
| Файл | Описание |
|---|---|
| `App.tsx` (1192) | Корневой компонент: стейт, хуки, маршрутизация по видам |
| `arrows.tsx` (810) | Арроры: ArrowsProvider, ArrowsLayer, path building, hit testing |
| `api.ts` (~150) | API-клиент: `api()`, `post()`, `patch_()` + экспортные функции |
| `types.ts` (69) | Типы: Task, Link, ArrowStyle, LinkType, View, FilterType |
| `date.ts` (76) | Утилиты дат: toISODate, isToday, formatWeekLabel и т.д. |
| `sanitize.ts` (132) | sanitize(), splitHtmlLines(), toggleCheckboxInHtml() |
| `editor.ts` (45) | useRichEditor hook |

### Компоненты (`src/components/`)
| Файл | Описание |
|---|---|
| `GanttView.tsx` (862) | Гantt-вид: таблица + полосы, drag, resize, зависимости |
| `DayColumn.tsx` (311) | Колонка дня (неделя): openTasks/openNotes, done, editing |
| `TaskRow.tsx` (258) | Карточка задачи: чекбокс, текст, меню стиля, conn-handle |
| `ListView.tsx` (183) | Список: groups by date, quick-add textarea |
| `RowsView.tsx` (178) | Горизонт: ряды-дни с open/done секциями |
| `WeekStrip.tsx` (124) | Топбар: навигация, календарь, вид, фильтр, user-chip, AdminPanel |
| `FolderBar.tsx` (153) | Бар папок: создание, выбор, переименование |
| `TagBar.tsx` (141) | Бар тегов: фильтр по тегам |
| `NewNoteEditor.tsx` (104) | Rich-редактор новой задачи/заметки |
| `TaskEditor.tsx` (43) | Редактор существующей задачи (dblclick) |
| `FormatToolbar.tsx` (108) | Тулбар форматирования (bold, list, checklist) |
| `AdminPanel.tsx` | Панель управления: статистика пользователя |
| `LoginScreen.tsx` (89) | Экран входа/регистрации |
| `CalendarPopup.tsx` (56) | Мини-календарь для выбора даты |
| `DoneArea.tsx` (126) | Секция выполненных задач |

### Сервер (`server/`)
| Файл | Описание |
|---|---|
| `index.js` (576) | Express роуты: auth, tasks, links, tags, folders, columns, admin, logging |
| `auth.js` (64) | bcrypt, сессии, requireAuth middleware |
| `db.js` (103) | pg Pool, rowToTask/rowToLink/rowToFolder, getUserTasks |
| `openapi.js` (467) | Swagger-спецификация |
| `db/schema.sql` | DDL: users, sessions, tasks, links, tags, task_tags, folders, columns |

## API (`/api/*`)
- `POST /auth/register|login`, `POST /auth/logout`, `GET /auth/me`
- `GET|POST /tasks`, `PATCH|DELETE /tasks/:id`, `POST /tasks/batch`
- `GET|POST /links`, `PATCH|DELETE /links/:id`
- `GET|POST /tags`, `PATCH|DELETE /tags/:name`
- `GET|POST /folders`, `PATCH|DELETE /folders/:id`
- `GET /columns`, `PUT|DELETE /columns/:date`
- `GET /admin/stats`
- `GET /api/docs` (Swagger), `GET /api/openapi.json`

## Типы данных
```ts
type TaskType = 'task' | 'note'
type FilterType = 'all' | 'tasks' | 'notes'
type View = 'week' | 'rows' | 'list' | 'gantt'
type ArrowType = 'straight' | 'elbow' | 'rounded' | 'routed' | 'sketch'
type LinkType = 'dependency' | 'dataflow' | 'sequence' | 'parent' | 'status'
```

## Ключевые паттерны
- **Миграции БД:** append-only `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` внизу `schema.sql`, сервер применяет при старте
- **API клиент:** `api<T>(path)` / `post<T>(path, body)` / `patch_<T>(path, body)` — generic-обёртки над `authFetch`
- **Состояние задач:** `useState<Task[]>` в App, прокидывается через пропсы
- **Редактирование:** `editingId` → `TaskEditor` или `NewNoteEditor`
- **Стрелки:** `ArrowsProvider` (контекст) → `ArrowsLayer` (SVG-оверлей) в каждом виде
- **Карточки:** `TaskRow` с `data-task-id`, `registerEl(id, el)` для arrow hit-testing
- **Arrow hit-testing:** `elementFromPoint()` с временным скрытием SVG
- **Создание связи:** `startConnection` → `beginDrag` → `finish` → `findTaskAtPoint` → `onCreate(from, to)`
- **Дубли связей:** клиентская проверка в `finish()`, серверная в `POST /links` (409)

## Команды запуска
```bash
# Dev (frontend + backend)
node server/index.js &     # :3001
npx vite --port 5173        # :5173

# TypeScript check
npx tsc --noEmit

# Server logging (включено по умолчанию, отключить: LOG_REQUESTS=0)
```

## Текущие баги
- **Стрелки не прикрепляются к карточкам** в week/rows/list видах. Debug-логи в `arrows.tsx` (`[arrows]` в консоли). Предположительно проблема в `findTaskAtPoint` → `elementFromPoint` не находит `.task` элемент.
- Логи показывают что `weekNode` может быть `null` или `elementFromPoint` возвращает элемент без `.task` предка.

## История изменений
1. Базовый планировщик: задачи, неделя, чекбоксы, drag-and-drop
2. Виды: Горизонт, Список, Гantt
3. Теги, папки, цвета колонок
4. Авторизация (cookie-based сессии)
5. Заметки (type='note'): amber-стиль, 📝, без чекбокса, фильтр Все/Задачи/Заметки
6. Новый редактор `NewNoteEditor` с rich-text, checklist, разделением по строкам
7. Стрелки (links): 5 типов линий, 9 цветов, drag-and-drop создание, контекстное меню
8. Стрелки расширены: hover-подсветка карточек, метки на линиях, семантические типы (LinkType), анимация пунктира, защита от дублей
9. Серверное логирование (middleware), админ-панель (статистика)
10. Оптимизация api.ts: generic-хелперы `api()` / `post()` / `patch_()`
