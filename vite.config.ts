import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GH Pages serves at https://<user>.github.io/<repo>/, so base must match
// the repo name. Override at build time with VITE_BASE for custom domains.
const base = process.env.VITE_BASE ?? '/outreach-friend-tool/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5174,
  },
})
