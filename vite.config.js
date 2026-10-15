import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Absolute imports ('/src/...', '/foundation/...') resolve from the project root.
// When foundation becomes a submodule, add an alias here instead of changing imports.
export default defineConfig({
  plugins: [vue()],
  // Tauri expects a fixed port and must see its own errors
  server: {
    port: 1420,
    strictPort: true
  },
  clearScreen: false
})
