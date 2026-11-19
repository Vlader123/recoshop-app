# RecoShop — інтернет-магазин із рекомендаціями (колаборативна фільтрація)

Повноцінний навчальний проєкт: **React + TypeScript** (клієнт), **Node.js + Express + TypeScript** (API), **PostgreSQL**, **Kafka** (необов'язково).

## 1. Швидкий старт

### Варіант А — Docker (найпростіше)
```bash
docker compose up --build
```
Відкрийте **http://localhost:8080** (сайт), **http://localhost:3000/api/docs** (Swagger-документація API).
При першому запуску база сама наповнюється: 6 категорій, 60 товарів, ~400 синтетичних користувачів і ~12 000 подій, після чого моделі навчаються (≈1 с).

### Варіант Б — локально (для розробки)
Потрібні Node.js 20+ і PostgreSQL 14+.
```bash
# 1) база даних
createdb recoshop            # користувач/пароль: recoshop / recoshop (або змініть DATABASE_URL)

# 2) бекенд  (порт 3000)
cd backend
cp .env.example .env
npm install
npm run dev                  # створить таблиці, наповнить даними, навчить моделі

# 3) фронтенд  (порт 5173)
cd ../frontend
npm install
npm run dev                  # http://localhost:5173
```

### Демо-акаунти
| Роль | E-mail | Пароль |
|---|---|---|
| Покупець (є історія → персональні рекомендації) | demo@reco.shop | demo1234 |
| Менеджер (панель «Аналітика») | manager@reco.shop | manager123 |
| Новий користувач (холодний старт) | зареєструйтесь на сайті | — |

## 2. Що до чого підключено

```
Браузер ──► React (Vite / nginx) ──/api──► Express API ──► PostgreSQL
                                              │  ▲
                                              │  └── моделі рекомендацій у пам'яті (item-CF, user-CF, MF, popularity)
                                              ▼
                                  (необов'язково) Kafka ──► consumer ──► PostgreSQL
```

1. **Фронтенд → API.** Усі запити клієнта йдуть на відносний шлях `/api/...` (`frontend/src/api.ts`). У розробці його проксує Vite (`vite.config.ts`, змінна `API_URL`), у Docker — nginx (`frontend/nginx.conf`, на сервіс `api`). JWT-токен зберігається в `localStorage` і додається заголовком `Authorization: Bearer …`.
2. **API → PostgreSQL.** Змінна `DATABASE_URL`. Схема створюється автоматично (`backend/src/db/schema.ts`), початкові дані — `backend/src/seed.ts`.
3. **Події користувача.** Перегляд товару → `POST /api/events {type:"view"}`; додавання в кошик/обране → подія `select` (вага 3). Події потрапляють у таблицю `interactions`, оновлюють профіль уподобань і скидають кеш рекомендацій користувача.
   - **Без Kafka** (за замовчуванням, `KAFKA_BROKERS` порожній): API пише в БД напряму.
   - **З Kafka**: задайте `KAFKA_BROKERS=kafka:9092`. API публікує події в топік `user-events`, а окремий процес `consumer` (`npm run consumer`) читає їх і пише в БД. Якщо Kafka недоступна — API автоматично повертається до прямого запису.
4. **Навчання моделей.** При старті API (`TRAIN_ON_START`) та за кнопкою «Перенавчити» в адмін-панелі; виконується у `worker_threads`, щоб не блокувати API. Моделі зберігаються в пам'яті, метрики — у таблиці `metrics`.
5. **Рекомендації** (`GET /api/recommendations`): кеш → якщо у користувача менше 5 унікальних переглядів — холодний старт (популярне з урахуванням категорій) → інакше алгоритм його A/B-групи → відсів уже баченого → пояснення («Бо ви переглядали…») → збереження з `?rec=ID` для підрахунку CTR. Користувач, якого ще немає в навченій моделі, отримує item-based рекомендації за «живою» історією.
6. **A/B-експеримент.** Групу (A/B) визначає хеш id користувача; за замовчуванням Item-CF (A) проти матричної факторизації (B). Результати (покази/кліки/CTR) — в адмін-панелі.

## 3. Структура проєкту
```
backend/src
  config.ts           налаштування з .env
  db/                 схема PostgreSQL, пул з'єднань
  recsys/             алгоритми (чисті класи, без БД): itemCF, userCF, mf, popularity, evaluator
  services/           каталог, рекомендації, навчання, експерименти, аналітика
  events/             publisher (Kafka/прямий запис), consumer, handler
  routes/             auth, catalog, user (кошик, обране, профіль), subscriptions, admin
  openapi.ts          опис API для /api/docs
backend/tests         Jest + Supertest (48 тестів)
frontend/src
  api.ts, auth.tsx, hooks.ts       клієнт API, авторизація, спільні хуки
  pages/                           Home, Catalog, ProductPage, Cart, Favorites, Login, Profile, Admin
  components/                      Header, Footer, ProductCard
  index.css                        темна тема (lime #C6FF3D + purple)
```

## 4. Змінні середовища (`backend/.env`)
| Змінна | За замовчуванням | Призначення |
|---|---|---|
| `PORT` | 3000 | порт API |
| `DATABASE_URL` | postgres://recoshop:recoshop@localhost:5432/recoshop | підключення до PostgreSQL |
| `JWT_SECRET` | dev-secret-change-me | **обов'язково змініть у продакшні** |
| `CORS_ORIGIN` | http://localhost:5173 | дозволений origin фронтенду |
| `KAFKA_BROKERS` | (порожньо) | адреси брокерів; порожньо = без Kafka |
| `KAFKA_TOPIC` | user-events | топік подій |
| `SEED_ON_START` | true | наповнити порожню БД демо-даними |
| `TRAIN_ON_START` | true | навчити моделі при старті |
| `TRAIN_IN_WORKER` | true | навчання в окремому потоці |
| `MIN_INTERACTIONS` | 5 | поріг холодного старту |
| `RECO_TTL_MINUTES` | 30 | час життя кешу рекомендацій |

## 5. Команди
```bash
# backend
npm run dev | build | start     # розробка / збірка / запуск зібраного
npm run migrate | seed | train | evaluate   # службові команди (seed --force перестворює дані)
npm run consumer                # споживач Kafka
npm test                        # потрібна БД recoshop_test (див. нижче)
# frontend
npm run dev | build | preview
```
Тести: `createdb recoshop_test` (або `TEST_DATABASE_URL=postgres://user@host:port/recoshop_test npm test`). Тести самі очищають і наповнюють цю БД — не вказуйте робочу базу!

## 6. API (коротко, повний опис — `/api/docs`)
- `POST /api/auth/register | login`, `GET /api/auth/me`
- `GET /api/categories`, `/api/products` (q, category, sort, page, limit, discount), `/api/products/:id`, `/api/products/:id/similar`, `/api/popular?tab=hits|new|sale`
- `GET /api/recommendations`, `/api/recently-viewed`, `POST /api/events`
- `GET/POST /api/cart`, `PATCH/DELETE /api/cart/:productId`; `GET /api/favorites`, `POST/DELETE /api/favorites/:productId`
- `POST /api/subscriptions`; `GET /api/profile`, `DELETE /api/profile/history`
- Менеджер: `GET /api/admin/analytics`, `POST /api/admin/train | evaluate`, `GET /api/admin/train/status`, `GET/POST /api/admin/experiments`, `POST /api/admin/experiments/:id/stop`, `POST/PUT /api/admin/products`, `POST /api/admin/import` (CSV `user,product,event_type[,timestamp]`)

Помилки мають єдиний формат `{ "error": { "code", "message", "details" } }`.

## 7. Обмеження та ідеї для розвитку
- «Оформлення замовлення» — демонстраційна заглушка (оплати й замовлень немає).
- Моделі живуть у пам'яті одного процесу й перенавчаються при старті; для кількох інстансів API винесіть їх у Redis/файл або запускайте навчання окремим сервісом.
- Зображення товарів — градієнтні заглушки; для реальних фото заповніть `image_url` (адмін-форма/CSV/SQL).
- Ідеї: реальні замовлення й оплата, відгуки, hybrid-модель з контентними ознаками, оновлення моделей за розкладом (cron), метрики Prometheus.

## Розгортання на сервері (ЛР6)

1. Сервер Ubuntu з Docker: `sudo apt install docker.io docker-compose-v2`
2. `git clone <репозиторій> ~/recoshop && cd ~/recoshop`
3. Створити `.env` з `JWT_SECRET=<довгий випадковий рядок>`
4. `docker compose up -d --build` → сайт на порту 8080
5. Перевірка: `curl http://localhost:8080/api/health`
6. Оновлення: `git pull && docker compose up -d --build` (його ж виконує `.github/workflows/deploy.yml`)

## Розгортання через GitHub (без Docker)

GitHub Pages віддає лише статику, тому: **frontend → GitHub Pages**, **API + PostgreSQL → Render** (безкоштовно).

1. Створіть репозиторій на GitHub і завантажте туди вміст папки `recoshop` (гілка `main`).
2. render.com → New → **Blueprint** → виберіть репозиторій (файл `render.yaml` створить API і БД).
   У змінній **CORS_ORIGIN** вкажіть `https://<ваш-логін>.github.io`. Дочекайтесь Live і скопіюйте адресу `https://recoshop-api-xxxx.onrender.com`.
3. GitHub → Settings → Pages → Source: **GitHub Actions**.
4. GitHub → Settings → Secrets and variables → Actions → **Variables** → New: `API_URL` = адреса з кроку 2 (без `/` в кінці).
5. Actions → Pages → Run workflow. Сайт: `https://<логін>.github.io/<репозиторій>/`.

Безкоштовний API засинає після простою — перший запит може тривати до хвилини.
