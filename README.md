# opencode-proxy

Cloudflare Worker proxy untuk OpenCode free provider.

Mem-forward request ke `opencode.ai` dengan IP Cloudflare,
identitas opencode CLI (`opencode/latest/<ver>/cli`), dan support streaming SSE.

> Zen gateway hanya meloloskan free model untuk request ber-UA opencode CLI.
> UA browser ditolak 429 `FreeUsageLimitError` — jadi worker ini TIDAK memakai UA browser.

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

- Rotasi identitas opencode CLI (`opencode/latest/<ver>/cli`, sinkron dengan release CLI terbaru)
- Strip header identitas + fingerprint browser (Sec-CH-UA) yang memicu 429
- Random jitter 0-50ms (bypass burst detection)
- CORS support penuh
- Streaming SSE support
- Zero konfigurasi
