import bcrypt from 'bcryptjs';
import { pool, query, tx } from './db';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORIES = [
  { slug: 'audio', name: 'Аудіо', icon: '🎧' },
  { slug: 'smartphones', name: 'Смартфони', icon: '📱' },
  { slug: 'laptops', name: 'Ноутбуки', icon: '💻' },
  { slug: 'home', name: 'Для дому', icon: '🏠' },
  { slug: 'sport', name: 'Спорт', icon: '👟' },
  { slug: 'books', name: 'Книги', icon: '📚' }
];

type P = [cat: string, title: string, desc: string, price: number, oldPrice: number | null, rating: number, reviews: number, badge: string | null, groups: string[]];

const PRODUCTS: P[] = [
  ['audio', 'Бездротові навушники Sonic X2', 'Активне шумозаглушення, до 38 годин роботи, швидка зарядка.', 2490, 2990, 4.8, 312, 'Хіт', ['audio', 'tech']],
  ['audio', 'Навушники Pro', 'Повнорозмірні навушники з Hi-Res звуком і м’якими амбушюрами.', 4590, null, 4.9, 540, 'Хіт', ['audio', 'tech']],
  ['audio', 'Навушники Lite', 'Легкі вкладиші на кожен день: чітке звучання та компактний кейс.', 1190, null, 4.4, 98, null, ['audio']],
  ['audio', 'Колонка Boom Mini', 'Портативна Bluetooth-колонка, захист від води IP67, 12 годин музики.', 1290, 1490, 4.6, 410, null, ['audio', 'home']],
  ['audio', 'Колонка Boom Max', 'Потужна колонка зі стереозвуком і підсвіткою для вечірок.', 3490, null, 4.7, 220, null, ['audio', 'home']],
  ['audio', 'Чохол для навушників Soft', 'М’який чохол із мікрофібри, захищає кейс від подряпин.', 290, null, 4.3, 61, null, ['audio']],
  ['audio', 'Вкладиші Buds Air', 'Справжні бездротові вкладиші для тренувань: фіксатори та захист від поту.', 1790, 2190, 4.5, 305, null, ['audio', 'sport']],
  ['audio', 'Студійні навушники Studio 40', 'Закриті мониторні навушники для запису та монтажу.', 3890, null, 4.7, 130, null, ['audio', 'work']],
  ['audio', 'Саундбар Wave 300', 'Саундбар 2.1 з виносним сабвуфером і підтримкою Dolby Audio.', 7990, 8990, 4.6, 87, null, ['audio', 'home']],
  ['audio', 'USB-мікрофон Voice One', 'Конденсаторний мікрофон для стрімів і дзвінків, шумозаглушення.', 2190, null, 4.5, 143, null, ['audio', 'work', 'gaming']],

  ['smartphones', 'Смартфон Nova 12', 'AMOLED 6,7", 256 ГБ, камера 108 Мп, швидка зарядка 67 Вт.', 14990, 16990, 4.8, 860, 'Хіт', ['tech']],
  ['smartphones', 'Смартфон Nova 12 Lite', 'Збалансований смартфон: 128 ГБ, екран 120 Гц, акумулятор 5000 мА·год.', 8990, null, 4.5, 540, null, ['tech']],
  ['smartphones', 'Смартфон Orbit S', 'Флагман із титановою рамкою та оптичним зумом.', 19990, null, 4.7, 310, null, ['tech', 'audio']],
  ['smartphones', 'Павербанк Volt 20 000', 'Ємний павербанк із зарядкою 22,5 Вт і двома портами USB-C.', 990, null, 4.6, 700, null, ['tech', 'sport']],
  ['smartphones', 'Кабель USB-C Braid 1 м', 'Зносостійкий кабель у нейлоновій обплітці, до 100 Вт.', 190, null, 4.7, 703, null, ['tech', 'work', 'audio']],
  ['smartphones', 'Зарядка GaN 65 Вт', 'Компактний адаптер для ноутбука та смартфона.', 1190, 1390, 4.7, 420, null, ['tech', 'work']],
  ['smartphones', 'Захисне скло Shield', 'Загартоване скло 9H з олеофобним покриттям.', 249, null, 4.4, 330, null, ['tech']],
  ['smartphones', 'Чохол Nova Silicone', 'Силіконовий чохол із м’яким покриттям усередині.', 390, null, 4.3, 180, null, ['tech']],
  ['smartphones', 'Бездротова зарядка Pad', 'Зарядна панель із підтримкою Qi, 15 Вт.', 790, null, 4.4, 150, null, ['tech', 'home']],
  ['smartphones', 'Автотримач MagGrip', 'Магнітний тримач для смартфона на панель авто.', 450, null, 4.2, 96, null, ['tech']],

  ['laptops', 'Ноутбук AirBook 14', 'Легкий ноутбук 14", 16 ГБ ОЗП, SSD 512 ГБ, до 15 годин роботи.', 32900, 35900, 4.7, 420, 'Хіт', ['work', 'tech']],
  ['laptops', 'Ноутбук AirBook 16 Pro', 'Екран 16" mini-LED, потужний процесор для творчих завдань.', 54900, null, 4.8, 160, null, ['work']],
  ['laptops', 'Ноутбук GameForce 15', 'Ігровий ноутбук із дискретною відеокартою та екраном 165 Гц.', 42900, 46900, 4.6, 210, null, ['gaming', 'tech']],
  ['laptops', 'Мишка Glide', 'Бездротова ергономічна мишка, тихі кнопки.', 590, null, 4.6, 520, null, ['work']],
  ['laptops', 'Клавіатура Click K2', 'Механічна клавіатура з червоними перемикачами та підсвіткою.', 1890, null, 4.6, 260, null, ['work', 'gaming']],
  ['laptops', 'Рюкзак Urban 15"', 'Міський рюкзак для ноутбука з водовідштовхувальною тканиною.', 1290, null, 4.5, 330, null, ['work', 'sport']],
  ['laptops', 'Монітор View 27"', 'IPS-монітор 27", QHD, 75 Гц, кольоровий охват sRGB 99 %.', 8990, 9990, 4.6, 190, null, ['work', 'gaming']],
  ['laptops', 'Підставка Lift', 'Алюмінієва підставка для ноутбука з регулюванням кута.', 690, null, 4.4, 240, null, ['work']],
  ['laptops', 'Веб-камера Clear 1080p', 'Full HD камера з автофокусом і шумозаглушенням мікрофона.', 1190, null, 4.3, 170, null, ['work']],
  ['laptops', 'SSD Fast 1 ТБ', 'Швидкий NVMe SSD для ноутбука або ПК.', 3290, 3790, 4.8, 410, null, ['work', 'gaming']],

  ['home', 'Кавоварка BrewMate', 'Автоматична кавоварка з капучинатором і таймером.', 5490, 5990, 4.8, 390, 'Хіт', ['home']],
  ['home', 'Робот-пилосос Clean R3', 'Вологе та сухе прибирання, карта приміщення, керування зі смартфона.', 11990, null, 4.6, 280, null, ['home', 'tech']],
  ['home', 'Чайник Glass 1,7 л', 'Скляний електричний чайник із підсвіткою та захистом від перегріву.', 1290, null, 4.5, 450, null, ['home']],
  ['home', 'Блендер Mix Pro', 'Потужний блендер 1200 Вт із функцією пульсу.', 2890, null, 4.4, 200, null, ['home']],
  ['home', 'Мультиварка Cook 6', '6 літрів, 12 програм, відкладений старт.', 3490, 3990, 4.6, 230, null, ['home']],
  ['home', 'Розумна лампа Lumi', 'Wi-Fi лампа з регулюванням кольору та яскравості.', 590, null, 4.3, 310, null, ['home', 'tech']],
  ['home', 'Набір ножів Chef 5', 'П’ять сталевих ножів на магнітній підставці.', 1790, null, 4.7, 170, null, ['home']],
  ['home', 'Плед Cozy 150×200', 'М’який плед із велюрової тканини.', 990, null, 4.6, 140, null, ['home', 'books']],
  ['home', 'Зволожувач Aura', 'Ультразвуковий зволожувач повітря з аромадифузором.', 2190, null, 4.4, 120, null, ['home']],
  ['home', 'Кухонні ваги Gram', 'Точні електронні ваги до 5 кг.', 490, null, 4.5, 260, null, ['home']],

  ['sport', 'Кросівки Run Pro', 'Амортизовані кросівки для бігу з дихаючим верхом.', 2790, 3290, 4.6, 640, 'Хіт', ['sport']],
  ['sport', 'Розумний годинник FitBand 5', 'GPS, пульсометр, до 14 днів без підзарядки.', 3190, null, 4.7, 480, null, ['sport', 'tech']],
  ['sport', 'Килимок для йоги Flex', 'Нековзний килимок 6 мм із чохлом.', 690, null, 4.5, 210, null, ['sport', 'home']],
  ['sport', 'Гантелі розбірні 2×10 кг', 'Регульовані гантелі з хромованими дисками.', 2490, null, 4.6, 130, null, ['sport']],
  ['sport', 'Рюкзак Trail 25 л', 'Туристичний рюкзак із дощовиком і нагрудним ременем.', 1890, null, 4.5, 175, null, ['sport']],
  ['sport', 'Пляшка Steel 750 мл', 'Термопляшка зі сталі, тримає холод 24 години.', 450, null, 4.7, 360, null, ['sport', 'home']],
  ['sport', 'Фітнес-браслет Pulse', 'Крокомір, сон, пульс — компактний трекер активності.', 1490, 1790, 4.4, 520, null, ['sport', 'tech']],
  ['sport', 'Скакалка Speed', 'Швидкісна скакалка з підшипниками.', 190, null, 4.3, 90, null, ['sport']],
  ['sport', 'Спортивні шорти Move', 'Легкі шорти з кишенею для телефона.', 590, null, 4.4, 210, null, ['sport']],
  ['sport', 'Велошолом Safe', 'Легкий шолом із регулюванням і вентиляцією.', 1290, null, 4.5, 100, null, ['sport']],

  ['books', '«Чистий код»', 'Роберт Мартін про те, як писати зрозумілий і підтримуваний код.', 650, null, 4.9, 280, null, ['work', 'books']],
  ['books', '«Дизайн повсякденних речей»', 'Дональд Норман про користувацький досвід і зручність речей.', 480, null, 4.6, 140, null, ['books', 'work']],
  ['books', '«Атомні звички»', 'Джеймс Клір про те, як формувати корисні звички.', 420, 520, 4.8, 610, null, ['books', 'self']],
  ['books', '«Майстер і Маргарита»', 'Класичний роман Михайла Булгакова.', 320, null, 4.8, 330, null, ['books']],
  ['books', 'Python для початківців', 'Покроковий вступ до програмування з практичними завданнями.', 560, null, 4.5, 180, null, ['books', 'work', 'tech']],
  ['books', 'Основи алгоритмів', 'Структури даних і алгоритми простою мовою.', 690, null, 4.6, 120, null, ['books', 'work']],
  ['books', 'Кулінарія за 30 хвилин', 'Сто швидких рецептів для щоденного меню.', 380, null, 4.4, 210, null, ['books', 'home']],
  ['books', 'Мандрівки Європою', 'Путівник маршрутами та місцями, які варто побачити.', 450, null, 4.3, 95, null, ['books']],
  ['books', 'Бігом до здоров’я', 'Посібник для початківців: план тренувань і харчування.', 390, null, 4.5, 150, null, ['books', 'sport']],
  ['books', 'Шахи для всіх', 'Від правил до перших партій: стратегія та тактика.', 410, null, 4.4, 110, null, ['books', 'self']]
];

const PERSONAS: { name: string; groups: string[] }[] = [
  { name: 'Меломан', groups: ['audio', 'tech'] },
  { name: 'Технар', groups: ['tech', 'work'] },
  { name: 'Домосід', groups: ['home', 'books'] },
  { name: 'Спортсмен', groups: ['sport', 'tech'] },
  { name: 'Офісний працівник', groups: ['work', 'books'] },
  { name: 'Геймер', groups: ['gaming', 'tech', 'work'] }
];

export const DEMO = { email: 'demo@reco.shop', password: 'demo1234', name: 'Демо-користувач' };
export const MANAGER = { email: 'manager@reco.shop', password: 'manager123', name: 'Менеджер' };

export async function seedDatabase(force = false): Promise<void> {
  const rand = rng(2026);
  if (force) {
    await pool.query(
      'TRUNCATE interactions, recommendations, metrics, experiments, models, favorites, cart_items, user_profiles, subscriptions, products, categories, users RESTART IDENTITY CASCADE'
    );
  }
  const now = Date.now();
  const DAY = 86400_000;

  await tx(async (c) => {
    for (const cat of CATEGORIES) await c.query('INSERT INTO categories (slug, name, icon) VALUES ($1,$2,$3)', [cat.slug, cat.name, cat.icon]);
    const catIds = new Map((await c.query('SELECT id, slug FROM categories')).rows.map((r) => [r.slug, r.id]));
    for (let i = 0; i < PRODUCTS.length; i++) {
      const [cat, title, desc, price, oldPrice, rating, reviews, badge] = PRODUCTS[i];
      const created = new Date(now - Math.floor(rand() * 120) * DAY);
      await c.query(
        `INSERT INTO products (category_id, title, description, price, old_price, rating, reviews_count, badge, gradient, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [catIds.get(cat), title, desc, price, oldPrice, rating, reviews, badge && badge !== 'Хіт' ? badge : null, i % 8, created]
      );
    }
  });

  const products = (await query<{ id: string; title: string }>('SELECT id, title FROM products')).map((p) => ({
    ...p,
    meta: PRODUCTS.find((x) => x[1] === p.title)!
  }));

  const demoHash = await bcrypt.hash(DEMO.password, 10);
  const managerHash = await bcrypt.hash(MANAGER.password, 10);
  const randomHash = await bcrypt.hash('not-a-real-password-' + rand(), 4);
  const users: { email: string; name: string; hash: string; role: string; persona: number; events: number }[] = [
    { email: DEMO.email, name: DEMO.name, hash: demoHash, role: 'user', persona: 0, events: 26 },
    { email: MANAGER.email, name: MANAGER.name, hash: managerHash, role: 'manager', persona: 1, events: 12 }
  ];
  for (let i = 0; i < 400; i++) {
    const r = rand();
    const events = r < 0.2 ? 2 + Math.floor(rand() * 3) : r < 0.5 ? 5 + Math.floor(rand() * 11) : 16 + Math.floor(rand() * 45);
    users.push({ email: `user${i + 1}@example.com`, name: `Покупець ${i + 1}`, hash: randomHash, role: 'user', persona: Math.floor(rand() * PERSONAS.length), events });
  }
  await pool.query(
    `INSERT INTO users (email, name, password_hash, role)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])`,
    [users.map((u) => u.email), users.map((u) => u.name), users.map((u) => u.hash), users.map((u) => u.role)]
  );
  const idByEmail = new Map((await query<{ id: string; email: string }>('SELECT id, email FROM users')).map((u) => [u.email, u.id]));

  const baseWeight = (m: P) => 0.3 + (m[6] / 400) * (m[5] / 5);
  const pick = (groups: string[]) => {
    const inGroup = rand() < 0.85;
    const pool_ = products.filter((p) => (inGroup ? p.meta[8].some((g) => groups.includes(g)) : true));
    const total = pool_.reduce((s, p) => s + baseWeight(p.meta), 0);
    let t = rand() * total;
    for (const p of pool_) {
      t -= baseWeight(p.meta);
      if (t <= 0) return p;
    }
    return pool_[pool_.length - 1];
  };
  const uid: string[] = [];
  const pid: string[] = [];
  const typ: string[] = [];
  const wgt: number[] = [];
  const ts: string[] = [];
  for (const u of users) {
    const persona = PERSONAS[u.persona];
    const start = now - (3 + Math.floor(rand() * 55)) * DAY;
    for (let e = 0; e < u.events; e++) {
      const p = pick(persona.groups);
      const t = new Date(start + (e / u.events) * (now - start) * 0.98 + rand() * 3600_000).toISOString();
      uid.push(idByEmail.get(u.email)!);
      pid.push(p.id);
      typ.push('view');
      wgt.push(1);
      ts.push(t);
      if (rand() < 0.3) {
        uid.push(idByEmail.get(u.email)!);
        pid.push(p.id);
        typ.push('select');
        wgt.push(3);
        ts.push(new Date(Date.parse(t) + 60_000).toISOString());
      }
    }
  }
  const BATCH = 4000;
  for (let i = 0; i < uid.length; i += BATCH) {
    await pool.query(
      `INSERT INTO interactions (user_id, product_id, event_type, weight, created_at)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::int[], $5::timestamptz[])`,
      [uid.slice(i, i + BATCH), pid.slice(i, i + BATCH), typ.slice(i, i + BATCH), wgt.slice(i, i + BATCH), ts.slice(i, i + BATCH)]
    );
  }

  await pool.query(
    `INSERT INTO user_profiles (user_id, top_categories, interactions_count)
     SELECT u.id,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'weight', t.w) ORDER BY t.w DESC)
                      FROM (SELECT c.slug, c.name, sum(i.weight)::int AS w FROM interactions i
                            JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
                            WHERE i.user_id = u.id GROUP BY c.slug, c.name ORDER BY w DESC LIMIT 5) t), '[]'::jsonb),
            (SELECT count(*)::int FROM interactions WHERE user_id = u.id)
     FROM users u ON CONFLICT (user_id) DO NOTHING`
  );
}
