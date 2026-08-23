const https = require("https");
const http = require("http");

function fetchHTML(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        "Accept": "text/html,application/xhtml+xml",
      },
      timeout: 6000,
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location && redirects > 0) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchHTML(next, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

      let html = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        html += chunk;
        if (html.length > 100000) res.destroy();
      });
      res.on("close", () => resolve(html));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function extractOG(html, pageUrl) {
  const og = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*?)["']`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']og:${prop}["']`, "i"));
    return m?.[1]?.trim() || null;
  };
  const meta = (name) => {
    const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*?)["']`, "i")) ||
              html.match(new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']${name}["']`, "i"));
    return m?.[1]?.trim() || null;
  };

  const title =
    og("title") ||
    meta("title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;

  const description = og("description") || meta("description") || null;

  let image = og("image") || og("image:url") || null;
  if (image && image.startsWith("/")) {
    const u = new URL(pageUrl);
    image = `${u.protocol}//${u.host}${image}`;
  }

  const provider = og("site_name") || null;
  let favicon = null;
  const favMatch =
    html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  if (favMatch) {
    favicon = favMatch[1];
    if (favicon.startsWith("/")) {
      const u = new URL(pageUrl);
      favicon = `${u.protocol}//${u.host}${favicon}`;
    } else if (!favicon.startsWith("http")) {
      favicon = null;
    }
  }
  if (!favicon) {
    const domain = new URL(pageUrl).hostname;
    favicon = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  }

  return { title, description, image, provider, favicon };
}


function ogRoute(req, res) {
  const url = req.query.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Missing or invalid url" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");

  fetchHTML(url)
    .then(html => res.json(extractOG(html, url)))
    .catch(err => res.status(500).json({ error: err.message }));
}

module.exports = { ogRoute };