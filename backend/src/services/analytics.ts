import { query } from '../db';
import { getActiveExperiment } from './experiments';
import { trainState } from './trainer';

export async function getAnalytics(k: number) {
  const totals = (await query(
    `SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM products) AS products,
            (SELECT count(*)::int FROM interactions) AS interactions, (SELECT count(*)::int FROM categories) AS categories,
            (SELECT count(*)::int FROM recommendations) AS impressions,
            (SELECT count(*)::int FROM recommendations WHERE clicked) AS clicks`
  ))[0];

  const metricRows = await query(
    `SELECT DISTINCT ON (algorithm, name, segment) algorithm, name, segment, value, computed_at
     FROM metrics WHERE k = $1 OR name = 'users' ORDER BY algorithm, name, segment, computed_at DESC`,
    [k]
  );
  const offline: Record<string, any> = {};
  for (const r of metricRows) {
    const a = (offline[r.algorithm] ??= { algorithm: r.algorithm, k, precision: 0, recall: 0, users: 0, segments: {}, computedAt: r.computed_at });
    if (r.segment === 'all') {
      if (r.name === 'precision') a.precision = r.value;
      if (r.name === 'recall') a.recall = r.value;
      if (r.name === 'users') a.users = r.value;
    } else {
      const s = (a.segments[r.segment] ??= { segment: r.segment, precision: 0, recall: 0, users: 0 });
      s[r.name] = r.value;
    }
  }

  const online = await query(
    `SELECT algorithm, ab_group AS "group", count(*)::int AS impressions, count(*) FILTER (WHERE clicked)::int AS clicks,
            count(DISTINCT user_id)::int AS users
     FROM recommendations GROUP BY algorithm, ab_group ORDER BY algorithm, ab_group`
  );

  return {
    totals,
    offline: Object.values(offline).map((a: any) => ({ ...a, segments: Object.values(a.segments) })),
    online: online.map((o) => ({ ...o, ctr: o.impressions ? o.clicks / o.impressions : 0 })),
    experiment: await getActiveExperiment(),
    training: trainState
  };
}
