import { Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Footer from './components/Footer'
import WakeBanner from './components/WakeBanner'
import Header from './components/Header'
import Admin from './pages/Admin'
import Cart from './pages/Cart'
import Catalog from './pages/Catalog'
import Favorites from './pages/Favorites'
import Home from './pages/Home'
import Login from './pages/Login'
import ProductPage from './pages/ProductPage'
import Profile from './pages/Profile'
import Report from './pages/Report'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Header />
      <WakeBanner />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/report" element={<Report />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="container empty"><h1>404</h1><p>Сторінку не знайдено</p></div>} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
