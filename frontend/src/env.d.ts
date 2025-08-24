/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_API_URL_DEVELOPMENT: string
  readonly VITE_API_URL_PRODUCTION: string
  readonly VITE_SOCKET_URL_DEVELOPMENT: string
  readonly VITE_SOCKET_URL_PRODUCTION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 