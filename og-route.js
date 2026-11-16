
const { safeRequest, readText } = require("./safe-fetch");

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { data, exp: Date.now() + CACHE_TTL });
}

function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}


function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const s = tag.slice(0, 2000);
  let m;
  while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? "");
  return attrs;
}


function collectTags(html, lower, name, limit = 300) {
  const out = [];
  let i = 0;
  while (out.length < limit) {
    i = lower.indexOf("<" + name, i);
    if (i === -1) break;
    const j = lower.indexOf(">", i);
    if (j === -1) break;
    out.push(parseAttrs(html.slice(i, j + 1)));
    i = j + 1;
  }
  return out;
}

function absUrl(value, base) {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

function extractOG(html, pageUrl) {
  const lower = html.toLowerCase();
  const metas = collectTags(html, lower, "meta");
  const get = (key) => {
    const hit = metas.find((a) => (a.property === key || a.name === key) && a.content);
    return hit ? hit.content.trim() : null;
  };

  let titleTag = null;
  const ti = lower.indexOf("<title");
  if (ti !== -1) {
    const ts = lower.indexOf(">", ti);
    const te = ts === -1 ? -1 : lower.indexOf("</title", ts);
    if (ts !== -1 && te !== -1) titleTag = decode(html.slice(ts + 1, te)).trim();
  }

  const title = (get("og:title") || get("twitter:title") || get("title") || titleTag || "").slice(0, 200) || null;
  const description = (get("og:description") || get("twitter:description") || get("description") || "").slice(0, 400) || null;
  const image = absUrl(get("og:image") || get("og:image:url") || get("twitter:image"), pageUrl);
  const provider = (get("og:site_name") || "").slice(0, 100) || null;

  let favicon = null;
  const links = collectTags(html, lower, "link", 100);
  const iconLink = links.find((a) => a.href && /(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/i.test(a.rel || ""));
  if (iconLink) favicon = absUrl(iconLink.href, pageUrl);
  if (!favicon) {
    favicon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(pageUrl).hostname)}`;
  }

  return { title, description, image, provider, favicon };
}

async function ogRoute(req, res) {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!url || url.length > 2000 || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Missing or invalid url" });
  }

  res.setHeader("Cache-Control", "private, max-age=3600");

  const cached = cacheGet(url);
  if (cached) return res.json(cached);

  try {
    const { res: up, url: finalUrl } = await safeRequest(url, {
      maxRedirects: 3,
      timeout: 6000,
      allowedPorts: [80, 443],
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const type = up.headers["content-type"] || "";
    if (up.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
      up.destroy();
      return res.status(502).json({ error: "Could not load preview" });
    }

    const html = await readText(up, 100000, 8000);
    const data = extractOG(html, finalUrl.href);
    cacheSet(url, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "Could not load preview" });
  }
}

module.exports = { ogRoute };