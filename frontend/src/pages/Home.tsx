import { useQuery } from '@tanstack/react-query'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, Category, Product, RecoItem } from '../api'
import { useAuth } from '../auth'
import ProductCard from '../components/ProductCard'

const TABS = [['hits', 'Хіти'], ['new', 'Новинки'], ['sale', 'Знижки']] as const

export default function Home() {
  const { user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('hits')
  const [email, setEmail] = useState('')
  const [subMsg, setSubMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<{ items: Product[]; total: number }>('/products?limit=1') })
  const recs = useQuery({ queryKey: ['recommendations', user?.id], queryFn: () => api<RecoItem[]>('/recommendations?limit=5'), enabled: !!user })
  const popular = useQuery({ queryKey: ['popular', tab, user?.id], queryFn: () => api<Product[]>(`/popular?tab=${tab}&limit=4`) })
  const recent = useQuery({ queryKey: ['recent', user?.id], queryFn: () => api<{ label: string; product: Product }[]>('/recently-viewed?limit=4'), enabled: !!user })
  const anonTop = useQuery({ queryKey: ['popular', 'hits', 'anon'], queryFn: () => api<Product[]>('/popular?tab=hits&limit=5'), enabled: !user })

  useEffect(() => {
    if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [loc.hash])

  const search = (e: FormEvent) => { e.preventDefault(); nav(`/catalog?q=${encodeURIComponent(q)}`) }
  const subscribe = async (e: FormEvent) => {
    e.preventDefault()
    try { await api('/subscriptions', { method: 'POST', body: { email } }); setSubMsg({ ok: true, text: 'Дякуємо! Ви підписані на добірки.' }); setEmail('') }
    catch (err) { setSubMsg({ ok: false, text: (err as Error).message }) }
  }

  const totalProducts = stats.data?.total ?? 0
  const rec = recs.data ?? []

  return (
    <>
      <section className="hero container">
        <div className="hero-main">
          <span className="pill">ПЕРСОНАЛЬНІ РЕКОМЕНДАЦІЇ</span>
          <h1>Магазин, який знає, що вам <span className="grad">сподобається</span></h1>
          <p className="lead">Аналізуємо, що переглядають і купують люди зі схожими інтересами, та підбираємо для вас найкраще.</p>
          <form className="search" onSubmit={search}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Що шукаєте сьогодні?" />
            <button className="btn btn-primary btn-sm">Знайти</button>
          </form>
          <div className="hero-btns">
            <a className="btn btn-primary" href="#foryou" onClick={(e) => { e.preventDefault(); document.getElementById('foryou')?.scrollIntoView({ behavior: 'smooth' }) }}>Мої рекомендації</a>
            <Link className="btn btn-ghost" to="/catalog">Каталог</Link>
          </div>
        </div>
        <div className="hero-side">
          <div className="stat-tile stat-purple"><span>Кількість категорій</span><b>{cats.data?.length ?? 0}</b></div>
          <div className="stat-tile"><span>Товарів у каталозі</span><b>{totalProducts}</b></div>
        </div>
      </section>

      <section id="categories" className="section container">
        <h2>Категорії</h2>
        <div className="cat-grid">
          {cats.data?.map((c) => (
            <Link key={c.id} to={`/catalog?category=${c.slug}`} className="card cat">
              <span className="cat-icon">{c.icon}</span><b>{c.name}</b>
            </Link>
          ))}
        </div>
      </section>

      <section id="foryou" className="section container">
        <div className="section-head">
          <h2>{user ? 'Рекомендовано для вас' : 'Спробуйте персональні рекомендації'}</h2>
          {user && <span className="muted small">Алгоритм підбирає товари за вашою історією</span>}
        </div>
        {!user && (
          <div className="card promo">
            <div><b>Увійдіть, щоб побачити добірку саме для вас</b><p className="muted">Поки що показуємо те, що купують найчастіше. Демо-акаунт: demo@reco.shop / demo1234</p></div>
            <Link to="/login" className="btn btn-primary">Увійти</Link>
          </div>
        )}
        {user ? (
          rec.length ? (
            <div className="reco-grid">
              {rec.map((r, i) => (
                <ProductCard key={r.id} big={i === 0} product={r.product} matchPercent={r.matchPercent} reason={r.reason.text}
                  to={`/product/${r.product.id}?rec=${r.id}`} />
              ))}
            </div>
          ) : <p className="muted">{recs.isLoading ? 'Підбираємо…' : 'Поки немає рекомендацій. Перегляньте кілька товарів.'}</p>
        ) : (
          <div className="reco-grid">{anonTop.data?.map((p, i) => <ProductCard key={p.id} big={i === 0} product={p} />)}</div>
        )}
      </section>

      <section id="popular" className="section container">
        <div className="section-head">
          <h2>Популярне зараз</h2>
          <div className="tabs">{TABS.map(([k, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
        </div>
        <div className="grid4">{popular.data?.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      </section>

      {user && (recent.data?.length ?? 0) > 0 && (
        <section className="section container">
          <h2>Нещодавно переглянуті та схожі</h2>
          <div className="grid4">{recent.data!.map((r) => <ProductCard key={r.product.id} product={r.product} label={r.label} />)}</div>
        </section>
      )}

      <section id="why" className="section container">
        <h2>Чому обирають RecoShop</h2>
        <div className="grid3">
          <div className="card feat"><span>🎯</span><b>Точні рекомендації</b><p className="muted">Колаборативна фільтрація знаходить товари, які обирали покупці зі схожим смаком.</p></div>
          <div className="card feat"><span>💡</span><b>Зрозуміло, чому саме це</b><p className="muted">Під кожною рекомендацією — пояснення: «Бо ви переглядали…» або «Купують разом з…».</p></div>
          <div className="card feat"><span>🔒</span><b>Ви керуєте даними</b><p className="muted">Історію переглядів можна видалити в профілі одним кліком.</p></div>
        </div>
      </section>

      <section id="subscribe" className="section container">
        <div className="card subscribe">
          <div><h2>Підпишіться на добірки</h2><p className="muted">Раз на тиждень — нові товари та знижки у ваших улюблених категоріях.</p></div>
          <form onSubmit={subscribe} className="search">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ваш e-mail" />
            <button className="btn btn-primary">Підписатися</button>
          </form>
          {subMsg && <p className={subMsg.ok ? 'ok' : 'err'}>{subMsg.text}</p>}
        </div>
      </section>
    </>
  )
}
