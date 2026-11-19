import { query, queryOne } from '../db';
import { Errors } from '../middleware/errors';

export const PRODUCT_SELECT = `
  p.id, p.title, p.description, p.price::float AS price, p.old_price::float AS old_price,
  p.rating::float AS rating, p.reviews_count, p.badge, p.image_url, p.gradient, p.created_at,
  c.id AS category_id, c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon`;

export interface ProductDto {
  id: string;
  title: string;
  description: string | null;
  price: number;
  oldPrice: number | null;
  discountPercent: number | null;
  rating: number;
  reviewsCount: number;
  badge: string | null;
  imageUrl: string | null;
  gradient: number;
  createdAt: string;
  category: { id: number; slug: string; name: string; icon: string | null };
  favorite?: boolean;
}

export function mapProduct(r: any): ProductDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    price: r.price,
    oldPrice: r.old_price,
    discountPercent: r.old_price && r.old_price > r.price ? Math.round((1 - r.price / r.old_price) * 100) : null,
    rating: r.rating,
    reviewsCount: r.reviews_count,
    badge: r.badge,
    imageUrl: r.image_url,
    gradient: r.gradient,
    createdAt: r.created_at,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name, icon: r.category_icon },
    ...(r.favorite !== undefined ? { favorite: r.favorite } : {})
  };
}

const favSelect = (param: number) =>
  `, EXISTS(SELECT 1 FROM favorites f WHERE f.user_id = $${param} AND f.product_id = p.id) AS favorite`;

export async function getProduct(id: string, userId?: string): Promise<ProductDto> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound('Товар');
  const row = await queryOne(
    `SELECT ${PRODUCT_SELECT}${userId ? favSelect(2) : ''} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
    userId ? [id, userId] : [id]
  );
  if (!row) throw Errors.notFound('Товар');
  return mapProduct(row);
}

export async function getProductsByIds(ids: string[], userId?: string): Promise<Map<string, ProductDto>> {
  if (!ids.length) return new Map();
  const rows = await query(
    `SELECT ${PRODUCT_SELECT}${userId ? favSelect(2) : ''} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ANY($1::uuid[])`,
    userId ? [ids, userId] : [ids]
  );
  return new Map(rows.map((r) => [r.id, mapProduct(r)]));
}

export async function listCategories() {
  const rows = await query(
    `SELECT c.id, c.slug, c.name, c.icon, count(p.id)::int AS products
     FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.id`
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, icon: r.icon, products: r.products }));
}

export interface ListParams {
  q?: string;
  category?: string;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'rating' | 'new';
  page: number;
  limit: number;
  onlyDiscount?: boolean;
}

const POPULARITY = `(SELECT COALESCE(sum(i.weight), 0) FROM interactions i WHERE i.product_id = p.id)`;

export async function listProducts(params: ListParams, userId?: string) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (params.q) {
    args.push(`%${params.q.replace(/[%_]/g, '\\$&')}%`);
    where.push(`(p.title ILIKE $${args.length} OR p.description ILIKE $${args.length})`);
  }
  if (params.category) {
    args.push(params.category);
    where.push(`c.slug = $${args.length}`);
  }
  if (params.onlyDiscount) where.push('p.old_price IS NOT NULL AND p.old_price > p.price');
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = {
    popular: `${POPULARITY} DESC, p.rating DESC`,
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    rating: 'p.rating DESC, p.reviews_count DESC',
    new: 'p.created_at DESC'
  }[params.sort ?? 'popular'];
  const total = (await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
    args
  ))!.n;
  const listArgs = [...args];
  let fav = '';
  if (userId) {
    listArgs.push(userId);
    fav = favSelect(listArgs.length);
  }
  listArgs.push(params.limit, (params.page - 1) * params.limit);
  const rows = await query(
    `SELECT ${PRODUCT_SELECT}${fav} FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}
     ORDER BY ${order} LIMIT $${listArgs.length - 1} OFFSET $${listArgs.length}`,
    listArgs
  );
  return { items: rows.map(mapProduct), total, page: params.page, limit: params.limit };
}

export async function popular(tab: 'hits' | 'new' | 'sale', limit: number, userId?: string) {
  const order = {
    hits: `${POPULARITY} DESC, p.rating DESC`,
    new: 'p.created_at DESC',
    sale: '(p.old_price - p.price) / NULLIF(p.old_price, 0) DESC'
  }[tab];
  const where = tab === 'sale' ? 'WHERE p.old_price IS NOT NULL AND p.old_price > p.price' : '';
  const args: unknown[] = [limit];
  let fav = '';
  if (userId) {
    args.push(userId);
    fav = favSelect(2);
  }
  const rows = await query(
    `SELECT ${PRODUCT_SELECT}${fav} FROM products p JOIN categories c ON c.id = p.category_id ${where} ORDER BY ${order} LIMIT $1`,
    args
  );
  return rows.map((r) => {
    const p = mapProduct(r);
    if (tab === 'hits') p.badge = p.badge ?? 'Хіт';
    return p;
  });
}
