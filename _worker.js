/**
 * OpenCode AI Proxy Worker
 * Cloudflare Worker yang mem-forward request ke opencode.ai
 * dengan IP Cloudflare, rotasi User-Agent, dan support streaming SSE.
 *
 * Target endpoints:
 *   - https://opencode.ai/zen/v1/chat/completions
 *   - https://opencode.ai/zen/v1/models
 *   - https://opencode.ai/zen/v1/messages
 *   - https://opencode.ai/zen/v1/responses
 *   - https://opencode.ai/zen/go/v1/*
 */

const TARGET_HOST = "opencode.ai";

// Rotasi User-Agent untuk bypass fingerprint detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0",
];

// Sec-CH-UA profiles untuk fingerprint rotation
const CH_UA_PROFILES = [
  {
    "Sec-CH-UA": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-CH-UA-Mobile": "?0",
  },
  {
    "Sec-CH-UA": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
    "Sec-CH-UA-Platform": '"macOS"',
    "Sec-CH-UA-Mobile": "?0",
  },
  {
    "Sec-CH-UA": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
    "Sec-CH-UA-Platform": '"Linux"',
    "Sec-CH-UA-Mobile": "?0",
  },
  {
    "Sec-CH-UA": '"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"',
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-CH-UA-Mobile": "?0",
  },
  {
    "Sec-CH-UA": '"Firefox";v="127"',
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-CH-UA-Mobile": "?0",
  },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,PUT,DELETE,PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

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

      // Pilih UA dan fingerprint secara acak
      const userAgent = getRandomItem(USER_AGENTS);
      const chProfile = getRandomItem(CH_UA_PROFILES);

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
        if (allowedHeaders.includes(key.toLowerCase())) {
          newHeaders.set(key, value);
        }
      }

      // Override dengan fingerprint yang di-rotasi
      newHeaders.set("User-Agent", userAgent);
      newHeaders.set("Host", TARGET_HOST);
      newHeaders.set("Origin", `https://${TARGET_HOST}`);
      newHeaders.set("Referer", `https://${TARGET_HOST}/`);
      newHeaders.set("Accept-Language", "en-US,en;q=0.9");
      newHeaders.set("Accept-Encoding", "gzip, deflate, br");

      // Set Sec-CH-UA headers dari profile acak
      for (const [k, v] of Object.entries(chProfile)) {
        newHeaders.set(k, v);
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
