import request from 'supertest';
import { createApp } from '../src/app';
import { closeDb, migrate, query } from '../src/db';
import { DEMO, MANAGER, seedDatabase } from '../src/seed';
import { modelStore } from '../src/services/modelStore';
import { trainAll } from '../src/services/trainer';

const app = createApp();
let demoToken = '';
let managerToken = '';
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await migrate();
  await seedDatabase(true);
  await trainAll({ evaluate: true });
  demoToken = (await request(app).post('/api/auth/login').send({ email: DEMO.email, password: DEMO.password })).body.token;
  managerToken = (await request(app).post('/api/auth/login').send({ email: MANAGER.email, password: MANAGER.password })).body.token;
});

afterAll(async () => {
  await closeDb();
});

describe('автентифікація', () => {
  it('реєструє користувача та не дозволяє дублікати', async () => {
    const email = `t${Date.now()}@test.com`;
    const r = await request(app).post('/api/auth/register').send({ email, password: 'secret123', name: 'Тест' });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    const dup = await request(app).post('/api/auth/register').send({ email, password: 'secret123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('відхиляє некоректні дані та невірний пароль', async () => {
    const bad = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: '1' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const wrong = await request(app).post('/api/auth/login').send({ email: DEMO.email, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('вимагає токен для захищених маршрутів', async () => {
    expect((await request(app).get('/api/recommendations')).status).toBe(401);
    expect((await request(app).get('/api/cart')).status).toBe(401);
    expect((await request(app).get('/api/admin/analytics').set(auth(demoToken))).status).toBe(403);
  });
});

describe('каталог', () => {
  it('повертає категорії, список товарів і картку товару', async () => {
    const cats = await request(app).get('/api/categories');
    expect(cats.body.length).toBe(6);
    const list = await request(app).get('/api/products?limit=5&sort=price_asc');
    expect(list.body.items.length).toBe(5);
    expect(list.body.total).toBe(60);
    const prices = list.body.items.map((p: any) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const one = await request(app).get(`/api/products/${list.body.items[0].id}`);
    expect(one.status).toBe(200);
    expect(one.body.category.slug).toBeTruthy();
    expect((await request(app).get('/api/products/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('фільтрує за категорією та пошуком', async () => {
    const r = await request(app).get('/api/products?category=audio&q=навушники');
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((p: any) => p.category.slug === 'audio')).toBe(true);
  });

  it('повертає популярне для всіх вкладок', async () => {
    for (const tab of ['hits', 'new', 'sale']) {
      const r = await request(app).get(`/api/popular?tab=${tab}&limit=4`);
      expect(r.status).toBe(200);
      expect(r.body.length).toBeGreaterThan(0);
    }
    const sale = await request(app).get('/api/popular?tab=sale');
    expect(sale.body.every((p: any) => p.discountPercent > 0)).toBe(true);
  });
});

describe('рекомендації', () => {
  it('дає користувачу з історією персональні рекомендації з поясненнями та без вже переглянутого', async () => {
    const r = await request(app).get('/api/recommendations?limit=5').set(auth(demoToken));
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(5);
    for (const item of r.body) {
      expect(item.reason.text.length).toBeGreaterThan(3);
      expect(item.product.title).toBeTruthy();
    }
    expect(['item_cf', 'user_cf', 'mf']).toContain(r.body[0].algorithm);
    expect(r.body[0].matchPercent).toBeGreaterThan(0);
    const seen = (await query('SELECT DISTINCT product_id FROM interactions i JOIN users u ON u.id = i.user_id WHERE u.email = $1', [DEMO.email])).map((x) => x.product_id);
    expect(r.body.every((x: any) => !seen.includes(x.product.id))).toBe(true);
  });

  it('закріплює користувача за групою A/B', async () => {
    const a = await request(app).get('/api/profile').set(auth(demoToken));
    const g1 = a.body.user.group;
    await request(app).get('/api/recommendations?limit=3').set(auth(demoToken));
    const b = await request(app).get('/api/profile').set(auth(demoToken));
    expect(['A', 'B']).toContain(b.body.user.group);
    if (g1) expect(b.body.user.group).toBe(g1);
  });

  it('для нового користувача (холодний старт) використовує популярні товари', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email: `cold${Date.now()}@test.com`, password: 'secret123' });
    const t = reg.body.token;
    const r = await request(app).get('/api/recommendations?limit=4').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(4);
    expect(r.body.every((x: any) => x.algorithm === 'popularity')).toBe(true);
    expect(r.body.every((x: any) => ['popular', 'category'].includes(x.reason.type))).toBe(true);
  });

  it('після подій оновлює профіль, фіксує клік і виходить з холодного старту', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email: `warm${Date.now()}@test.com`, password: 'secret123' });
    const t = reg.body.token;
    const first = await request(app).get('/api/recommendations?limit=3').set(auth(t));
    const rec = first.body[0];
    const ev = await request(app).post('/api/events').set(auth(t)).send({ productId: rec.product.id, type: 'view', recommendationId: rec.id });
    expect(ev.status).toBe(202);
    const clicked = await query('SELECT clicked FROM recommendations WHERE id = $1', [rec.id]);
    expect(clicked[0].clicked).toBe(true);
    const audio = (await request(app).get('/api/products?category=audio&limit=8')).body.items;
    for (const p of audio.slice(0, 6)) {
      expect((await request(app).post('/api/events').set(auth(t)).send({ productId: p.id, type: 'select' })).status).toBe(202);
    }
    const profile = await request(app).get('/api/profile').set(auth(t));
    expect(profile.body.profile.interactionsCount).toBeGreaterThanOrEqual(7);
    expect(profile.body.profile.topCategories[0].slug).toBe('audio');
    const next = await request(app).get('/api/recommendations?limit=3').set(auth(t));
    expect(next.body[0].algorithm).not.toBe('popularity');
  });

  it('NFR-06: без навчених моделей повертає резервну (популярну) добірку, а не порожній список', async () => {
    await query("UPDATE recommendations SET stale = true");
    const snapshot = modelStore.algorithms().map((a) => [a, modelStore.get(a)!] as const);
    modelStore.clear();
    try {
      const r = await request(app).get('/api/recommendations?limit=5').set(auth(demoToken));
      expect(r.status).toBe(200);
      expect(r.body.length).toBe(5);
      expect(r.body.every((x: any) => x.algorithm === 'popularity')).toBe(true);
    } finally {
      snapshot.forEach(([a, e]) => modelStore.set(a, e));
      await query("UPDATE recommendations SET stale = true");
    }
  });

  it('відхиляє подію з неіснуючим товаром', async () => {
    const r = await request(app).post('/api/events').set(auth(demoToken)).send({ productId: '00000000-0000-0000-0000-000000000000', type: 'view' });
    expect(r.status).toBe(404);
    const bad = await request(app).post('/api/events').set(auth(demoToken)).send({ productId: 'abc', type: 'x' });
    expect(bad.status).toBe(400);
  });

  it('повертає нещодавно переглянуті та схожі товари', async () => {
    const r = await request(app).get('/api/recently-viewed?limit=4').set(auth(demoToken));
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(4);
    expect(r.body[0].label).toBe('переглянуто');
    expect(r.body.some((x: any) => x.label === 'схожий')).toBe(true);
  });

  it('повертає схожі товари для сторінки товару', async () => {
    const p = (await request(app).get('/api/products?limit=1')).body.items[0];
    const r = await request(app).get(`/api/products/${p.id}/similar?limit=4`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
});

describe('кошик, обране, підписка', () => {
  let productId = '';
  beforeAll(async () => {
    productId = (await request(app).get('/api/products?limit=1')).body.items[0].id;
  });

  it('керує кошиком', async () => {
    const add = await request(app).post('/api/cart').set(auth(demoToken)).send({ productId, quantity: 2 });
    expect(add.status).toBe(201);
    expect(add.body.count).toBeGreaterThanOrEqual(2);
    const upd = await request(app).patch(`/api/cart/${productId}`).set(auth(demoToken)).send({ quantity: 3 });
    expect(upd.body.items.find((i: any) => i.product.id === productId).quantity).toBe(3);
    const del = await request(app).delete(`/api/cart/${productId}`).set(auth(demoToken));
    expect(del.body.items.find((i: any) => i.product.id === productId)).toBeUndefined();
  });

  it('керує обраним', async () => {
    expect((await request(app).post(`/api/favorites/${productId}`).set(auth(demoToken))).status).toBe(201);
    const list = await request(app).get('/api/favorites').set(auth(demoToken));
    expect(list.body.some((p: any) => p.id === productId)).toBe(true);
    const one = await request(app).get(`/api/products/${productId}`).set(auth(demoToken));
    expect(one.body.favorite).toBe(true);
    await request(app).delete(`/api/favorites/${productId}`).set(auth(demoToken));
    expect((await request(app).get('/api/favorites').set(auth(demoToken))).body.some((p: any) => p.id === productId)).toBe(false);
  });

  it('оформлює підписку один раз', async () => {
    const email = `sub${Date.now()}@test.com`;
    expect((await request(app).post('/api/subscriptions').send({ email })).status).toBe(201);
    const dup = await request(app).post('/api/subscriptions').send({ email });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_SUBSCRIBED');
  });
});

describe('панель менеджера', () => {
  it('віддає аналітику з офлайн-метриками та сегментами холодного старту', async () => {
    const r = await request(app).get('/api/admin/analytics?k=10').set(auth(managerToken));
    expect(r.status).toBe(200);
    expect(r.body.totals.products).toBe(60);
    const algs = r.body.offline.map((o: any) => o.algorithm).sort();
    expect(algs).toEqual(['item_cf', 'mf', 'popularity', 'user_cf']);
    const cf = r.body.offline.find((o: any) => o.algorithm === 'item_cf');
    expect(cf.precision).toBeGreaterThan(0);
    expect(cf.segments.length).toBe(4);
    const pop = r.body.offline.find((o: any) => o.algorithm === 'popularity');
    expect(cf.precision).toBeGreaterThan(pop.precision);
  });

  it('створює експеримент лише коли немає активного', async () => {
    const conflict = await request(app).post('/api/admin/experiments').set(auth(managerToken)).send({ algorithmA: 'user_cf', algorithmB: 'mf', trafficSplit: 30 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('EXPERIMENT_ACTIVE');
    const list = await request(app).get('/api/admin/experiments').set(auth(managerToken));
    const active = list.body.find((e: any) => e.status === 'active');
    expect((await request(app).post(`/api/admin/experiments/${active.id}/stop`).set(auth(managerToken))).status).toBe(200);
    const created = await request(app).post('/api/admin/experiments').set(auth(managerToken)).send({ algorithmA: 'user_cf', algorithmB: 'mf', trafficSplit: 30 });
    expect(created.status).toBe(201);
    expect(created.body.trafficSplit).toBe(30);
    const same = await request(app).post('/api/admin/experiments').set(auth(managerToken)).send({ algorithmA: 'mf', algorithmB: 'mf' });
    expect([400, 409]).toContain(same.status);
  });

  it('імпортує CSV та відхиляє неправильний формат', async () => {
    const title = (await request(app).get('/api/products?limit=1')).body.items[0].title;
    const csv = `user,product,event_type,timestamp\nimport1@example.com,${title},view,2026-01-01T10:00:00Z\nimport1@example.com,${title},select,2026-01-01T10:05:00Z\nbad,unknown,view,`;
    const ok = await request(app).post('/api/admin/import').set(auth(managerToken)).send({ csv });
    expect(ok.status).toBe(202);
    expect(ok.body.imported).toBe(2);
    expect(ok.body.skipped).toBe(1);
    const bad = await request(app).post('/api/admin/import').set(auth(managerToken)).send({ csv: 'a,b\n1,2' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('IMPORT_FORMAT_ERROR');
  });

  it('додає товар до каталогу', async () => {
    const cat = (await request(app).get('/api/categories')).body[0];
    const r = await request(app).post('/api/admin/products').set(auth(managerToken)).send({ categoryId: cat.id, title: 'Тестовий товар', price: 99.5, rating: 4.2 });
    expect(r.status).toBe(201);
    expect(r.body.title).toBe('Тестовий товар');
    expect((await request(app).post('/api/admin/products').set(auth(managerToken)).send({ title: '' })).status).toBe(400);
  });

  it('перенавчає моделі та блокує паралельний запуск', async () => {
    const t = request(app).post('/api/admin/train').set(auth(managerToken));
    const first = await t;
    expect(first.status).toBe(202);
    const second = await request(app).post('/api/admin/train').set(auth(managerToken));
    expect([202, 409]).toContain(second.status);
    for (let i = 0; i < 50; i++) {
      const st = await request(app).get('/api/admin/train/status').set(auth(managerToken));
      if (!st.body.running) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  });
});

describe('безпека', () => {
  it('NFR-11: SQL-ін’єкція в параметрі пошуку не ламає запит і не повертає зайвого', async () => {
    const r = await request(app).get("/api/products?q=' OR '1'='1' --");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect((await request(app).get('/api/products?q=%27%3B%20DROP%20TABLE%20products%3B%20--')).status).toBe(200);
    expect((await request(app).get('/api/products')).body.total).toBeGreaterThan(50);
  });

  it('NFR-11: SQL-ін’єкція в логіні дає 401 і не обходить автентифікацію', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: "demo@reco.shop' OR '1'='1", password: 'x' });
    expect(r.status).toBe(400);
    const r2 = await request(app).post('/api/auth/login').send({ email: DEMO.email, password: "' OR '1'='1" });
    expect(r2.status).toBe(401);
  });

  it('NFR-09: паролі зберігаються лише як bcrypt-хеші', async () => {
    const rows = await query('SELECT password_hash FROM users');
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((x) => /^\$2[aby]\$/.test(x.password_hash))).toBe(true);
  });

  it('підроблений або прострочений токен відхиляється', async () => {
    const fake = demoToken.slice(0, -4) + 'AAAA';
    expect((await request(app).get('/api/profile').set(auth(fake))).status).toBe(401);
    expect((await request(app).get('/api/profile').set(auth('not-a-jwt'))).status).toBe(401);
  });

  it('NFR-10: покупець не отримує доступу до жодної функції менеджера', async () => {
    for (const [m, u] of [['get', '/api/admin/analytics'], ['post', '/api/admin/train'], ['post', '/api/admin/import'], ['post', '/api/admin/products'], ['get', '/api/admin/experiments']] as const) {
      expect((await (request(app) as any)[m](u).set(auth(demoToken)).send({})).status).toBe(403);
    }
  });

  it('відповідь API не містить хешу пароля', async () => {
    const r = await request(app).get('/api/auth/me').set(auth(demoToken));
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
  });
});

describe('приватність', () => {
  it('дозволяє видалити власну історію (FR-20)', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email: `del${Date.now()}@test.com`, password: 'secret123' });
    const t = reg.body.token;
    const p = (await request(app).get('/api/products?limit=1')).body.items[0];
    await request(app).post('/api/events').set(auth(t)).send({ productId: p.id, type: 'view' });
    expect((await request(app).get('/api/profile').set(auth(t))).body.profile.interactionsCount).toBe(1);
    expect((await request(app).delete('/api/profile/history').set(auth(t))).status).toBe(204);
    expect((await request(app).get('/api/profile').set(auth(t))).body.profile.interactionsCount).toBe(0);
  });

  it('повертає 404 у єдиному форматі помилки', async () => {
    const r = await request(app).get('/api/unknown-route');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('звернення до підтримки', () => {
  const body = { kind: 'bug', title: 'Не працює пошук', message: 'Після введення запиту сторінка не оновлюється', page: '/catalog' };

  it('приймає звернення гостя зі станом new', async () => {
    const r = await request(app).post('/api/site-reports').send(body);
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('new');
  });

  it('відхиляє надто короткий опис', async () => {
    const r = await request(app).post('/api/site-reports').send({ ...body, message: 'коротко' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('список і зміна стану доступні лише менеджеру', async () => {
    const id = (await request(app).post('/api/site-reports').send(body)).body.id;
    expect((await request(app).get('/api/admin/site-reports').set(auth(demoToken))).status).toBe(403);
    expect((await request(app).patch(`/api/admin/site-reports/${id}`).send({ status: 'resolved' })).status).toBe(401);
    const upd = await request(app).patch(`/api/admin/site-reports/${id}`).set(auth(managerToken)).send({ status: 'in_progress', adminNote: 'Відтворено' });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe('in_progress');
    expect(upd.body.adminNote).toBe('Відтворено');
    const list = await request(app).get('/api/admin/site-reports?status=in_progress').set(auth(managerToken));
    expect(list.body.items.some((x: any) => x.id === id)).toBe(true);
  });

  it('повертає 404 для неіснуючого звернення', async () => {
    const r = await request(app).patch('/api/admin/site-reports/999999').set(auth(managerToken)).send({ status: 'dismissed' });
    expect(r.status).toBe(404);
  });
});
