/**
 * OpenCode AI Proxy Worker
 * Cloudflare Worker yang mem-forward request ke opencode.ai
 * dengan IP Cloudflare, identitas opencode CLI, dan support streaming SSE.
 *
 * Catatan penting: Zen gateway hanya meloloskan request free model yang
 * membawa User-Agent identifier opencode CLI (opencode/latest/<ver>/cli).
 * UA browser (Chrome/Firefox) dianggap client anonim dan ditolak dengan
 * 429 FreeUsageLimitError — jadi JANGAN pakai UA browser di sini.
 * (inspirasi: ZeroHomer/dsh-opencode-zen-bypass)
 *
 * Target endpoints:
 *   - https://opencode.ai/zen/v1/chat/completions
 *   - https://opencode.ai/zen/v1/models
 *   - https://opencode.ai/zen/v1/messages
 *   - https://opencode.ai/zen/v1/responses
 *   - https://opencode.ai/zen/go/v1/*
 */

const TARGET_HOST = "opencode.ai";

// Identitas opencode CLI — rotasi antar versi patch agar terlihat seperti
// banyak user CLI yang berbeda. Format wajib: opencode/latest/<ver>/cli
// (akhiran /cli menandakan client CLI resmi; tanpa ini = 429).
// Jaga daftar ini tetap sinkron dengan release terbaru opencode CLI:
// https://github.com/sst/opencode/releases
const OPENCODE_USER_AGENTS = [
  "opencode/latest/1.18.30/cli",
  "opencode/latest/1.18.29/cli",
  "opencode/latest/1.18.28/cli",
  "opencode/latest/1.18.18/cli",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,PUT,DELETE,PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

// Header yang TIDAK BOLEH lolos ke upstream karena membocorkan identitas
// client asli / tool chain di depan proxy (bisa memicu penolakan gateway).
const BLOCKED_HEADERS = [
  "user-agent",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "x-deepseek-identity",
  "x-dsh-identity",
  "x-app-identity",
  "x-harness-identity",
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addJitter() {
  // 0-50ms jitter untuk bypass burst detection
  return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 50)));
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({ status: "ok", proxy: "opencode-proxy", target: TARGET_HOST }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    try {
      // Tambah jitter kecil untuk bypass burst detection
      await addJitter();

      // Build target URL
      const targetUrl = new URL(request.url);
      targetUrl.hostname = TARGET_HOST;
      targetUrl.port = "443";
      targetUrl.protocol = "https:";

      // Pilih identitas opencode CLI secara acak
      const userAgent = getRandomItem(OPENCODE_USER_AGENTS);

      // Build headers baru -- bersih dari header asli yang bisa bocorkan identitas
      const newHeaders = new Headers();

      // Copy headers yang aman dari request asli
      const allowedHeaders = [
        "content-type",
        "authorization",
        "accept",
        "accept-encoding",
        "accept-language",
        "cache-control",
        "x-api-key",
        "anthropic-version",
        "openai-organization",
      ];

      for (const [key, value] of request.headers.entries()) {
        const lower = key.toLowerCase();
        if (BLOCKED_HEADERS.includes(lower)) continue;
        if (allowedHeaders.includes(lower)) {
          newHeaders.set(key, value);
        }
      }

      // Override dengan identitas opencode CLI
      newHeaders.set("User-Agent", userAgent);
      newHeaders.set("Host", TARGET_HOST);
      newHeaders.set("Origin", `https://${TARGET_HOST}`);
      newHeaders.set("Referer", `https://${TARGET_HOST}/`);
      newHeaders.set("Accept-Language", "en-US,en;q=0.9");
      newHeaders.set("Accept-Encoding", "gzip, deflate, br");
      // Pastikan tidak ada sisa fingerprint browser yang bocor
      for (const h of ["Sec-CH-UA", "Sec-CH-UA-Mobile", "Sec-CH-UA-Platform"]) {
        newHeaders.delete(h);
      }

      // Buat request baru ke opencode.ai
      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        redirect: "follow",
      });

      // Forward request
      const response = await fetch(proxyRequest);

      // Build response headers
      const responseHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(k, v);
      }
      responseHeaders.set("X-Proxied-By", "opencode-proxy");
      // Hapus header yang bisa bocorkan info server
      responseHeaders.delete("cf-ray");
      responseHeaders.delete("cf-cache-status");
      responseHeaders.delete("server");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy error", message: err.message }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }
  },
};
