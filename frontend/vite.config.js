import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

// Only use HTTPS when not in Electron
const isElectron = process.env.ELECTRON === 'true'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    ...(!isElectron && fs.existsSync('/home/jeremy/servercert/key.pem') && fs.existsSync('/home/jeremy/servercert/cert.pem') && {
      https: {
        key: fs.readFileSync('/home/jeremy/servercert/key.pem'),
        cert: fs.readFileSync('/home/jeremy/servercert/cert.pem'),
      },
    }),
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
