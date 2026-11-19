import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_HASH_ROUTER ? './' : '/',
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
})
