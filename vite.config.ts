import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serve HTTPS when local mkcert certs exist (Safari's HTTPS-Only mode refuses
// plain-HTTP localhost); fall back to HTTP so the repo works without them.
// Generate with: mkcert -key-file .certs/localhost-key.pem -cert-file .certs/localhost.pem localhost 127.0.0.1 ::1
const key = '.certs/localhost-key.pem'
const cert = '.certs/localhost.pem'
const https =
  fs.existsSync(key) && fs.existsSync(cert) ? { key: fs.readFileSync(key), cert: fs.readFileSync(cert) } : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { https },
  // Set by the Pages deploy workflow (e.g. /retirement-planner/); local dev and builds stay at /
  base: process.env.BASE_PATH ?? '/',
})
