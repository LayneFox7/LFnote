# База данных (PostgreSQL)

Схема: `server/db/schema.sql`. Применение: `node server/scripts/init-db.mjs`.

Пул соединений: `server/db.js` (env: `DATABASE_URL`, по умолчанию `postgres://localhost:5432/lfnote`).

## Таблицы

### users
| колонка | тип | примечание |
|---|---|---|
| id | SERIAL PK | |
| login | TEXT UNIQUE | 3–40 символов |
| password_hash | TEXT | bcrypt, `hashPassword()` из `server/auth.js` |
| created_at | TIMESTAMPTZ | |

### sessions
| колонка | тип | примечание |
|---|---|---|
| token | TEXT PK | UUID, хранится в HTTP-only cookie `lfnote_token` |
| user_id | INT FK → users (CASCADE) | |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | 30 дней |

### folders
| колонка | тип | примечание |
|---|---|---|
| id | SERIAL PK | |
| user_id | INT FK → users (CASCADE) | |
| name | TEXT | UNIQUE (user_id, name) |
| position | INT | порядок в списке |
| created_at | TIMESTAMPTZ | |

Ограничение «максимум 10 папок» реализовано на уровне приложения (`server/index.js`, `POST /api/folders`).

### tasks
| колонка | тип | примечание |
|---|---|---|
| id | TEXT PK | UUID v4 (на клиенте — `crypto.randomUUID()`) |
| user_id | INT FK → users (CASCADE) | |
| folder_id | INT FK → folders (SET NULL) | при удалении папки заметки остаются |
| text | TEXT | HTML |
| date | TEXT | ISO `YYYY-MM-DD` |
| start_date | TEXT | начало на диаграмме Ганта (NULL — как `date`) |
| end_date | TEXT | конец на диаграмме Ганта (NULL — как `start_date`) |
| parent_id | TEXT FK → tasks (CASCADE) | родительская задача (иерархия Ганта) |
| progress | INTEGER | прогресс 0–100, по умолчанию 0 |
| done | BOOLEAN | |
| order_key | DOUBLE PRECISION | порядок в колонке дня |
| style | JSONB | заливка/штриховка/шрифт |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

### links
| колонка | тип | примечание |
|---|---|---|
| id | TEXT PK | |
| user_id | INT FK → users (CASCADE) | |
| from_id / to_id | TEXT FK → tasks (CASCADE) | |
| style | JSONB | тип/цвет/ширина/пунктир |
| created_at | TIMESTAMPTZ | |

### tags
| колонка | тип | примечание |
|---|---|---|
| id | SERIAL PK | |
| user_id | INT FK → users (CASCADE) | |
| name | TEXT | UNIQUE (user_id, name) |

Имена тегов хранятся в нижнем регистре (уникальность без учёта регистра).

### task_tags
| колонка | тип | примечание |
|---|---|---|
| task_id | TEXT FK → tasks (CASCADE) | |
| tag_id | INT FK → tags (CASCADE) | |

PK = (task_id, tag_id).

### columns
| колонка | тип | примечание |
|---|---|---|
| user_id | INT FK → users (CASCADE) | |
| date | TEXT | ISO `YYYY-MM-DD` |
| color | TEXT | |

PK = (user_id, date).

## Индексы

`idx_tasks_user`, `idx_tasks_user_date`, `idx_tasks_folder`, `idx_links_user`, `idx_folders_user`, `idx_sessions_user` — заданы в `schema.sql`.

## Скрипты

| скрипт | назначение |
|---|---|
| `server/scripts/init-db.mjs` | применяет `schema.sql` |
| `server/scripts/migrate-json.mjs` | создаёт аккаунт (по умолчанию `demo`/`demo123`, env `SEED_LOGIN`/`SEED_PASSWORD`) и переносит данные из `data/*.json` (tasks, links, tags, columns) в PostgreSQL |

Миграция идемпотентна: существующие записи не дублируются (`INSERT … ON CONFLICT DO NOTHING`), повторный запуск безопасен.
