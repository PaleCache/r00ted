(function () {
  const OG_PROXY = "/og";
  function injectStyles() {
    if (document.getElementById("rlp-styles")) return;
    const s = document.createElement("style");
    s.id = "rlp-styles";
    s.textContent = `
      .rlp-card {
        display: inline-flex;
        flex-direction: column;
        max-width: 132px;
        width: 45%;
        border-radius: 4px;
        overflow: hidden;
        background: var(--surface-1, rgba(0,0,0,0.9));
        border-left: 4px solid #2c2b2b;
        margin: 4px 0;
        cursor: pointer;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        box-sizing: border-box;
        position: relative;
      }
      .rlp-inner {
        padding: 8px 16px 16px 12px;
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .rlp-provider {
        font-size: 12px;
        font-weight: 400;
        color: var(--text-primary, #dbdee1);
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rlp-provider img {
        width: 14px; height: 14px;
        border-radius: 2px; flex-shrink: 0;
      }
      .rlp-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-accent, #ff0000);
        line-height: 1.375;
        margin-bottom: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .rlp-card:hover .rlp-title { text-decoration: underline; }
      .rlp-desc {
        font-size: 13.5px;
        color: var(--text-secondary, #dbdee1);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-bottom: 0;
        word-break: break-word;
      }
      .rlp-domain {
        font-size: 12px;
        color: var(--text-muted, #80848e);
        margin-top: 8px;
      }
      .rlp-thumb-inline {
        width: 80px;
        height: 80px;
        flex-shrink: 0;
        border-radius: 4px;
        overflow: hidden;
        position: absolute;
        top: 8px;
        right: 16px;
      }
      .rlp-thumb-inline img {
        width: 100%; height: 100%;
        object-fit: cover; display: block;
      }
      .rlp-image-wrap {
        width: 100%;
        max-height: 300px;
        overflow: hidden;
        border-radius: 4px;
        margin-top: 12px;
      }
      .rlp-image-wrap img {
        width: 100%;
        display: block;
        object-fit: cover;
        max-height: 300px;
      }
      .rlp-loading {
        padding: 10px 12px;
        display: flex; align-items: center; gap: 8px;
        font-size: 12px; color: var(--text-muted, #80848e);
      }
      @keyframes rlp-spin { to { transform: rotate(360deg); } }
      .rlp-spinner {
        width: 11px; height: 11px; border-radius: 50%;
        border: 1.5px solid var(--border-strong, #4e5058);
        border-top-color: var(--text-accent, #5865f2);
        animation: rlp-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  function fetchOG(url) {
    return fetch(`${OG_PROXY}?url=${encodeURIComponent(url)}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function cleanDesc(text) {
    if (!text) return null;
    return text.replace(/([.!?])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  }

  function buildSimpleRichLink(url) {
    injectStyles();

    let domain;
    try { domain = new URL(url).hostname.replace(/^www\./, ""); }
    catch { domain = url; }

    const card = document.createElement("div");
    card.className = "rlp-card";
    card.addEventListener("click", () => window.open(url, "_blank", "noopener,noreferrer"));
    card.innerHTML = `<div class="rlp-loading"><span class="rlp-spinner"></span><span>Loading preview…</span></div>`;

    fetchOG(url)
      .then(data => render(card, url, domain, data))
      .catch(() => renderFallback(card, url, domain));

    return card;
  }

  function render(card, url, domain, data) {
    card.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "rlp-inner";
    let thumbEl = null;
    let heroEl = null;

    if (data.image) {
      const probe = new Image();
      probe.src = data.image;

      thumbEl = document.createElement("div");
      thumbEl.className = "rlp-thumb-inline";
      const thumbImg = document.createElement("img");
      thumbImg.src = data.image;
      thumbImg.onerror = () => thumbEl.remove();
      thumbEl.appendChild(thumbImg);

      heroEl = document.createElement("div");
      heroEl.className = "rlp-image-wrap";
      heroEl.style.display = "none";
      const heroImg = document.createElement("img");
      heroImg.src = data.image;
      heroImg.onerror = () => heroEl.remove();
      heroEl.appendChild(heroImg);

      probe.onload = function () {
        const ratio = this.naturalWidth / Math.max(this.naturalHeight, 1);
        if (this.naturalWidth >= 400 && ratio > 1.3) {
          thumbEl.remove();
          heroEl.style.display = "";
          inner.style.paddingRight = "16px";
        } else if (this.naturalWidth < 80 || this.naturalHeight < 80) {
          thumbEl.remove();
        }
      };
      probe.onerror = () => { thumbEl.remove(); heroEl.remove(); };
    }

   
    const provider = document.createElement("div");
    provider.className = "rlp-provider";
    const fav = document.createElement("img");
    fav.src = data.favicon || `https://www.google.com/s2/favicons?sz=16&domain=${domain}`;
    fav.onerror = () => { fav.src = `https://www.google.com/s2/favicons?sz=16&domain=${domain}`; };
    provider.append(fav, document.createTextNode(data.provider || domain));
    inner.appendChild(provider);

    if (data.title) {
      const t = document.createElement("div");
      t.className = "rlp-title";
      t.textContent = data.title;
      if (thumbEl) t.style.paddingRight = "100px";
      inner.appendChild(t);
    }

    
    const desc = cleanDesc(data.description);
    if (desc) {
      const d = document.createElement("div");
      d.className = "rlp-desc";
      d.textContent = desc;
      if (thumbEl) d.style.paddingRight = "100px";
      inner.appendChild(d);
    }

    
    const domainEl = document.createElement("div");
    domainEl.className = "rlp-domain";
    domainEl.textContent = domain;
    inner.appendChild(domainEl);
    if (heroEl) inner.appendChild(heroEl);
    card.appendChild(inner);
    if (thumbEl) card.appendChild(thumbEl);
  }

  function renderFallback(card, url, domain) {
    card.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "rlp-inner";

    const provider = document.createElement("div");
    provider.className = "rlp-provider";
    const fav = document.createElement("img");
    fav.src = `https://www.google.com/s2/favicons?sz=16&domain=${domain}`;
    fav.onerror = () => fav.remove();
    provider.append(fav, document.createTextNode(domain.toUpperCase()));
    inner.appendChild(provider);

    const t = document.createElement("div");
    t.className = "rlp-title";
    t.textContent = url;
    inner.appendChild(t);

    const domainEl = document.createElement("div");
    domainEl.className = "rlp-domain";
    domainEl.textContent = domain;
    inner.appendChild(domainEl);

    card.appendChild(inner);
  }

  window.buildSimpleRichLink = buildSimpleRichLink;
})();