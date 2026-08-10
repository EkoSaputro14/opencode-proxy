# opencode-proxy

Cloudflare Worker proxy untuk OpenCode free provider.

Mem-forward request ke `opencode.ai` dengan IP Cloudflare,
rotasi User-Agent otomatis, dan support streaming SSE.

## Endpoints yang di-proxy

- `https://opencode.ai/zen/v1/chat/completions`
- `https://opencode.ai/zen/v1/models`
- `https://opencode.ai/zen/v1/messages`
- `https://opencode.ai/zen/v1/responses`

## Setup

### 1. Fork / clone repo ini

### 2. Set GitHub Secrets

Di repo > Settings > Secrets > Actions:

- `CF_API_TOKEN` = Cloudflare API Token
- `CF_ACCOUNT_ID` = Cloudflare Account ID

### 3. Push ke main --> auto deploy

### 4. Konfigurasi 9Router / OmniRoute

Setelah worker jalan, set baseURL di 9Router/OmniRoute:

```
https://opencode-proxy.SUBDOMAIN.workers.dev/zen/v1
```

## Fitur

- Rotasi 8 User-Agent browser
- Rotasi 5 Sec-CH-UA fingerprint profile
- Random jitter 0-50ms (bypass burst detection)
- CORS support penuh
- Streaming SSE support
- Zero konfigurasi
