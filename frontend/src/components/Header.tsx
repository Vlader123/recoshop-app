import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useCart } from '../hooks'

const links = [
  ['Категорії', '/#categories'], ['Для вас', '/#foryou'], ['Популярне', '/#popular'], ['Переваги', '/#why'], ['Підписка', '/#subscribe'],
]

export default function Header() {
  const { user, logout } = useAuth()
  const cart = useCart()
  const nav = useNavigate()
  const loc = useLocation()
  const goto = (e: React.MouseEvent, to: string) => {
    e.preventDefault()
    const id = to.split('#')[1]
    if (loc.pathname === '/') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    else nav(to)
  }
  return (
    <header className="header">
      <div className="container header-in">
        <Link to="/" className="logo"><span className="logo-mark">◆</span>RecoShop</Link>
        <nav className="nav">
          {links.map(([t, to]) => <a key={to} href={to} onClick={(e) => goto(e, to)}>{t}</a>)}
          <NavLink to="/catalog">Каталог</NavLink>
        </nav>
        <div className="header-actions">
          {user?.role === 'manager' && <NavLink to="/admin" className="btn btn-ghost btn-sm">Аналітика</NavLink>}
          {user && <NavLink to="/favorites" className="icon-btn" title="Обране">♡</NavLink>}
          {user ? (
            <>
              <NavLink to="/profile" className="btn btn-ghost btn-sm">{user.name || 'Профіль'}</NavLink>
              <button className="btn btn-ghost btn-sm" onClick={() => { logout(); nav('/') }}>Вийти</button>
            </>
          ) : <NavLink to="/login" className="btn btn-ghost btn-sm">Увійти</NavLink>}
          <NavLink to="/cart" className="btn btn-ghost btn-sm">Кошик <span className="cart-badge">{cart.data?.count ?? 0}</span></NavLink>
        </div>
      </div>
    </header>
  )
}
