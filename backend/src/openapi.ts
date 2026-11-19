const bearer = [{ bearerAuth: [] }];
const json = (schema: object = { type: 'object' }) => ({ content: { 'application/json': { schema } } });
const ok = (d = 'Успішно') => ({ '200': { description: d, ...json() } });

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'RecoShop API', version: '1.0.0', description: 'API веб-системи рекомендацій на основі колаборативної фільтрації' },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/api/health': { get: { summary: 'Стан сервера', responses: ok() } },
    '/api/auth/register': { post: { summary: 'Реєстрація', requestBody: json({ properties: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } } }), responses: { '201': { description: 'Створено' }, '409': { description: 'EMAIL_TAKEN' } } } },
    '/api/auth/login': { post: { summary: 'Вхід', requestBody: json({ properties: { email: { type: 'string' }, password: { type: 'string' } } }), responses: { ...ok(), '401': { description: 'INVALID_CREDENTIALS' } } } },
    '/api/auth/me': { get: { summary: 'Поточний користувач', security: bearer, responses: ok() } },
    '/api/categories': { get: { summary: 'Категорії', responses: ok() } },
    '/api/products': { get: { summary: 'Каталог (q, category, sort, page, limit, discount)', responses: ok() } },
    '/api/products/{id}': { get: { summary: 'Картка товару', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/api/products/{id}/similar': { get: { summary: 'Схожі товари', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/api/popular': { get: { summary: 'Популярне (tab: hits | new | sale) — резерв для холодного старту', responses: ok() } },
    '/api/recommendations': { get: { summary: 'Персональні рекомендації з поясненнями', security: bearer, parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: ok() } },
    '/api/recently-viewed': { get: { summary: 'Нещодавно переглянуті та схожі', security: bearer, responses: ok() } },
    '/api/events': { post: { summary: 'Подія взаємодії (view | select)', security: bearer, requestBody: json({ properties: { productId: { type: 'string' }, type: { type: 'string', enum: ['view', 'select'] }, recommendationId: { type: 'integer' } } }), responses: { '202': { description: 'Прийнято' } } } },
    '/api/cart': { get: { summary: 'Кошик', security: bearer, responses: ok() }, post: { summary: 'Додати в кошик', security: bearer, responses: { '201': { description: 'Додано' } } } },
    '/api/favorites': { get: { summary: 'Обране', security: bearer, responses: ok() } },
    '/api/subscriptions': { post: { summary: 'Підписка на добірки', requestBody: json({ properties: { email: { type: 'string' } } }), responses: { '201': { description: 'Підписано' }, '409': { description: 'ALREADY_SUBSCRIBED' } } } },
    '/api/profile': { get: { summary: 'Профіль вподобань', security: bearer, responses: ok() } },
    '/api/profile/history': { delete: { summary: 'Видалити власну історію взаємодій', security: bearer, responses: { '204': { description: 'Видалено' } } } },
    '/api/site-reports': { post: { summary: 'Скарга або повідомлення про помилку сайту (гість або користувач)', requestBody: json({ properties: { kind: { type: 'string', enum: ['complaint', 'bug'] }, title: { type: 'string' }, message: { type: 'string' }, page: { type: 'string' } } }), responses: { '201': { description: 'Прийнято' }, '400': { description: 'VALIDATION_ERROR' } } } },
    '/api/admin/site-reports': { get: { summary: 'Список звернень (status, kind, page, limit)', security: bearer, responses: ok() } },
    '/api/admin/site-reports/{id}': { patch: { summary: 'Змінити стан і нотатку звернення', security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: json({ properties: { status: { type: 'string', enum: ['new', 'in_progress', 'resolved', 'dismissed'] }, adminNote: { type: 'string' } } }), responses: ok() } },
    '/api/admin/analytics': { get: { summary: 'Аналітика (precision@k, recall@k, CTR, холодний старт)', security: bearer, responses: ok() } },
    '/api/admin/train': { post: { summary: 'Запустити навчання моделей', security: bearer, responses: { '202': { description: 'Запущено' }, '409': { description: 'TRAINING_IN_PROGRESS' } } } },
    '/api/admin/experiments': { get: { summary: 'Експерименти', security: bearer, responses: ok() }, post: { summary: 'Створити A/B-експеримент', security: bearer, responses: { '201': { description: 'Створено' }, '409': { description: 'EXPERIMENT_ACTIVE' } } } },
    '/api/admin/import': { post: { summary: 'Імпорт взаємодій (CSV: user,product,event_type[,timestamp])', security: bearer, responses: { '202': { description: 'Імпортовано' }, '422': { description: 'IMPORT_FORMAT_ERROR' } } } },
    '/api/admin/products': { post: { summary: 'Додати товар', security: bearer, responses: { '201': { description: 'Створено' } } } }
  }
};
