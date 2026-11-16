
const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||   
    (a === 169 && b === 254) ||             
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                                
  );
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::" || l === "::1") return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    const mappedHex = l.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const x = parseInt(mappedHex[1], 16), y = parseInt(mappedHex[2], 16);
      return isPrivateIPv4(`${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`);
    }
    if (/^f[cd]/.test(l)) return true;     
    if (/^fe[89ab]/.test(l)) return true;   
    if (l.startsWith("ff")) return true;    
    return false;
  }
  return true; 
}


function safeLookup(hostname, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  if (typeof options === "number") options = { family: options };
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateIP(a.address));
    if (!ok.length) return cb(new Error("Blocked address"));
    if (options && options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function safeRequest(rawUrl, opts = {}) {
  const { maxRedirects = 3, timeout = 6000, headers = {}, allowedPorts = null } = opts;
  return new Promise((resolve, reject) => {
    const go = (u, left) => {
      let url;
      try { url = new URL(u); } catch { return reject(new Error("Invalid URL")); }
      if (!["http:", "https:"].includes(url.protocol)) return reject(new Error("Bad protocol"));
      if (url.username || url.password) return reject(new Error("Credentials in URL not allowed"));
      const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
      if (allowedPorts && !allowedPorts.includes(port)) return reject(new Error("Port not allowed"));
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(host) && isPrivateIP(host)) return reject(new Error("Blocked address"));
      if (host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".local")) {
        return reject(new Error("Blocked address"));
      }

      const mod = url.protocol === "https:" ? https : http;
      const req = mod.request(url, { method: "GET", headers, lookup: safeLookup, timeout }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (left <= 0) return reject(new Error("Too many redirects"));
          let next;
          try { next = new URL(res.headers.location, url).href; } catch { return reject(new Error("Bad redirect")); }
          return go(next, left - 1);
        }
        resolve({ res, url });
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    };
    go(rawUrl, maxRedirects);
  });
}


function readText(stream, maxBytes = 100000, totalMs = 8000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8"));
    };
    const timer = setTimeout(() => { stream.destroy(); finish(); }, totalMs);
    stream.on("data", (c) => {
      chunks.push(c);
      size += c.length;
      if (size >= maxBytes) { stream.destroy(); finish(); }
    });
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", (e) => { if (!finished) { finished = true; clearTimeout(timer); reject(e); } });
  });
}

module.exports = { safeRequest, readText, isPrivateIP };