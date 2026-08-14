export const openapi = {
  openapi: '3.0.0',
  info: {
    title: 'LFnote API',
    version: '1.0.0',
    description:
      'Персональный блокнот-планнер: недельный планёр с карточками, стрелками, тегами, папками и заметками.\n\n' +
      'Данные привязаны к аккаунту: каждый пользователь видит и изменяет только свои карточки, стрелки, теги, папки и цвета колонок.\n\n' +
      'Авторизация — по куки-сессии (httpOnly cookie `lfn_session`), создаваемой при входе или регистрации.',
  },
  servers: [{ url: '/api', description: 'Локальный сервер' }],
  tags: [
    { name: 'auth', description: 'Регистрация, вход, выход, текущий пользователь' },
    { name: 'folders', description: 'Папки для карточек (максимум 10 на аккаунт)' },
    { name: 'tasks', description: 'Карточки (заметки) на ленте' },
    { name: 'tags', description: 'Теги карточек' },
    { name: 'links', description: 'Стрелки между карточками' },
    { name: 'columns', description: 'Цвета колонок недели' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'lfn_session',
        description: 'httpOnly куки-сессия, выдаётся при login/register',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: { id: { type: 'integer' }, login: { type: 'string' } },
        required: ['id', 'login'],
      },
      Folder: {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' }, position: { type: 'integer' } },
        required: ['id', 'name'],
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string', description: 'HTML/текст карточки' },
          date: { type: 'string', example: '2026-08-12' },
          startDate: { type: 'string', nullable: true, description: 'Начало на диаграмме Ганта' },
          endDate: { type: 'string', nullable: true, description: 'Конец на диаграмме Ганта' },
          parentId: { type: 'string', nullable: true, description: 'Родительская задача (иерархия Ганта)' },
          progress: { type: 'integer', minimum: 0, maximum: 100, description: 'Прогресс выполнения, %' },
          done: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          order: { type: 'number' },
          style: { type: 'object', nullable: true, description: '{ bg?, hatch?, font? }' },
          tags: { type: 'array', items: { type: 'string' } },
          folderId: { type: 'integer', nullable: true },
        },
        required: ['id', 'text', 'date', 'done'],
      },
      Link: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          style: { type: 'object', nullable: true, description: '{ type?, color?, width?, dashed? }' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'from', 'to'],
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['auth'],
        summary: 'Регистрация нового аккаунта',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  login: { type: 'string', minLength: 3, maxLength: 40, example: 'demo' },
                  password: { type: 'string', minLength: 6, example: 'secret1' },
                },
                required: ['login', 'password'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Аккаунт создан, сессия установлена', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: { description: 'Некорректные логин/пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Логин уже занят', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Вход по логину и паролю',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  login: { type: 'string', example: 'demo' },
                  password: { type: 'string', example: 'secret1' },
                },
                required: ['login', 'password'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Сессия установлена', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          401: { description: 'Неверный логин или пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        summary: 'Выход (завершение сессии)',
        responses: {
          200: { description: 'Сессия завершена' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Текущий пользователь',
        responses: {
          200: { description: 'Текущий пользователь', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/folders': {
      get: {
        tags: ['folders'],
        summary: 'Список папок текущего аккаунта',
        responses: {
          200: {
            description: 'Папки',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { folders: { type: 'array', items: { $ref: '#/components/schemas/Folder' } } } },
              },
            },
          },
        },
      },
      post: {
        tags: ['folders'],
        summary: 'Создать папку (лимит 10)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string', minLength: 1, maxLength: 40, example: 'Работа' } },
                required: ['name'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Папка создана', content: { 'application/json': { schema: { $ref: '#/components/schemas/Folder' } } } },
          400: { description: 'Лимит 10 папок или невалидное имя', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/folders/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: {
        tags: ['folders'],
        summary: 'Переименовать папку',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
          },
        },
        responses: {
          200: { description: 'Папка переименована', content: { 'application/json': { schema: { $ref: '#/components/schemas/Folder' } } } },
          404: { description: 'Папка не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['folders'],
        summary: 'Удалить папку (карточки остаются без папки)',
        responses: {
          200: { description: 'Папка удалена' },
          404: { description: 'Папка не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/tasks': {
      get: {
        tags: ['tasks'],
        summary: 'Все карточки аккаунта (невыполненные из прошлых дней переносятся на сегодня)',
        responses: {
          200: {
            description: 'Карточки',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } },
              },
            },
          },
        },
      },
      post: {
        tags: ['tasks'],
        summary: 'Создать карточку',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string', example: 'Созвон с командой' },
                  date: { type: 'string', example: '2026-08-12' },
                  folderId: { type: 'integer', nullable: true },
                  startDate: { type: 'string', nullable: true },
                  endDate: { type: 'string', nullable: true },
                  parentId: { type: 'string', nullable: true },
                  progress: { type: 'integer', minimum: 0, maximum: 100 },
                },
                required: ['text', 'date'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Карточка создана', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
          400: { description: 'Невалидные данные или папка не принадлежит аккаунту', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/tasks/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      patch: {
        tags: ['tasks'],
        summary: 'Изменить карточку (текст, даты, done, order, style, tags, folderId, Гант)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  date: { type: 'string' },
                  done: { type: 'boolean' },
                  order: { type: 'number' },
                  style: { type: 'object', nullable: true },
                  tags: { type: 'array', items: { type: 'string' } },
                  folderId: { type: 'integer', nullable: true },
                  startDate: { type: 'string', nullable: true },
                  endDate: { type: 'string', nullable: true },
                  parentId: { type: 'string', nullable: true },
                  progress: { type: 'integer', minimum: 0, maximum: 100 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Обновлённая карточка', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
          400: { description: 'Папка не принадлежит аккаунту', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Карточка не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['tasks'],
        summary: 'Удалить карточку (вместе со стрелками и тегами)',
        responses: {
          200: { description: 'Карточка удалена' },
          404: { description: 'Карточка не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/tasks/batch': {
      post: {
        tags: ['tasks'],
        summary: 'Массовое обновление дат, прогресса и иерархии задач',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        date: { type: 'string' },
                        order: { type: 'number' },
                        startDate: { type: 'string', nullable: true },
                        endDate: { type: 'string', nullable: true },
                        progress: { type: 'integer', minimum: 0, maximum: 100 },
                        parentId: { type: 'string', nullable: true },
                      },
                      required: ['id'],
                    },
                  },
                },
                required: ['tasks'],
              },
            },
          },
        },
        responses: { 200: { description: 'Обновлено' } },
      },
    },
    '/tags': {
      get: {
        tags: ['tags'],
        summary: 'Список тегов аккаунта',
        responses: {
          200: { description: 'Теги', content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } } } } },
        },
      },
      post: {
        tags: ['tags'],
        summary: 'Создать тег',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string', maxLength: 40 } }, required: ['name'] },
            },
          },
        },
        responses: {
          201: { description: 'Список тегов', content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } } } } },
        },
      },
    },
    '/tags/{name}': {
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      patch: {
        tags: ['tags'],
        summary: 'Переименовать тег (обновляется на всех карточках)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
          },
        },
        responses: { 200: { description: 'Список тегов' } },
      },
      delete: {
        tags: ['tags'],
        summary: 'Удалить тег (снимается со всех карточек)',
        responses: { 200: { description: 'Список тегов' } },
      },
    },
    '/links': {
      get: {
        tags: ['links'],
        summary: 'Стрелки аккаунта',
        responses: {
          200: {
            description: 'Стрелки',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { links: { type: 'array', items: { $ref: '#/components/schemas/Link' } } } },
              },
            },
          },
        },
      },
      post: {
        tags: ['links'],
        summary: 'Создать стрелку между карточками',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
            },
          },
        },
        responses: {
          201: { description: 'Стрелка создана', content: { 'application/json': { schema: { $ref: '#/components/schemas/Link' } } } },
          409: { description: 'Стрелка уже существует' },
        },
      },
    },
    '/links/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      patch: {
        tags: ['links'],
        summary: 'Изменить стрелку (концы или стиль)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  style: { type: 'object', nullable: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Обновлённая стрелка', content: { 'application/json': { schema: { $ref: '#/components/schemas/Link' } } } } },
      },
      delete: {
        tags: ['links'],
        summary: 'Удалить стрелку',
        responses: { 200: { description: 'Стрелка удалена' } },
      },
    },
    '/columns': {
      get: {
        tags: ['columns'],
        summary: 'Цвета колонок аккаунта',
        responses: {
          200: { description: 'Цвета по датам', content: { 'application/json': { schema: { type: 'object', additionalProperties: { type: 'string' } } } } },
        },
      },
    },
    '/columns/{date}': {
      parameters: [{ name: 'date', in: 'path', required: true, schema: { type: 'string' } }],
      put: {
        tags: ['columns'],
        summary: 'Задать цвет колонки',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', properties: { color: { type: 'string', example: '#4f7cff' } }, required: ['color'] } },
          },
        },
        responses: { 200: { description: 'Цвет задан' } },
      },
      delete: {
        tags: ['columns'],
        summary: 'Сбросить цвет колонки',
        responses: { 200: { description: 'Цвет сброшен' } },
      },
    },
  },
}
