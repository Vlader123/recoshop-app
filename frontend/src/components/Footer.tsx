import { Link } from 'react-router-dom'
import { API_BASE } from '../api'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-in">
        <div><Link to="/" className="logo"><span className="logo-mark">✦</span>RecoShop</Link>
          <p className="muted">Навчальний проєкт: інтернет-магазин із рекомендаціями на основі колаборативної фільтрації.</p></div>
        <div className="footer-links">
          <Link to="/catalog">Каталог</Link><Link to="/favorites">Обране</Link><Link to="/cart">Кошик</Link><Link to="/report?kind=complaint">Скарга</Link><Link to="/report?kind=bug">Повідомити про помилку</Link><a href={`${API_BASE}/api/docs`} target="_blank" rel="noreferrer">API-документація</a>
        </div>
      </div>
      <div className="container muted small">© 2026 RecoShop. Оформлення замовлення — демонстраційна заглушка.</div>
    </footer>
  )
}
