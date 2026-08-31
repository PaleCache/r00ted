(function () {
  const LOC_KEY = "r00ted_weather_location";
  const SETTINGS_KEY = "r00ted_weather_settings";
  const POS_KEY = "r00ted_weather_pos";

  const defaults = {
    refreshMinutes: 30,
    tempUnit: "celsius",
    windUnit: "kmh",
  };

  let location = null;
  let settings = { ...defaults };
  let refreshTimer = null;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }

  function save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn("weatherWidget: localStorage write failed", e);
    }
  }

  function clear(key) {
    try { localStorage.removeItem(key); } catch {}
  }

 
  const codes = {
    0: ["Clear sky", "☀️"],
    1: ["Mainly clear", "🌤️"],
    2: ["Partly cloudy", "⛅"],
    3: ["Overcast", "☁️"],
    45: ["Fog", "🌫️"],
    48: ["Rime fog", "🌫️"],
    51: ["Light drizzle", "🌦️"],
    53: ["Drizzle", "🌦️"],
    55: ["Dense drizzle", "🌧️"],
    56: ["Freezing drizzle", "🌧️"],
    57: ["Freezing drizzle", "🌧️"],
    61: ["Light rain", "🌧️"],
    63: ["Rain", "🌧️"],
    65: ["Heavy rain", "🌧️"],
    66: ["Freezing rain", "🌧️"],
    67: ["Freezing rain", "🌧️"],
    71: ["Light snow", "🌨️"],
    73: ["Snow", "🌨️"],
    75: ["Heavy snow", "❄️"],
    77: ["Snow grains", "❄️"],
    80: ["Light showers", "🌦️"],
    81: ["Showers", "🌧️"],
    82: ["Violent showers", "⛈️"],
    85: ["Snow showers", "🌨️"],
    86: ["Heavy snow showers", "❄️"],
    95: ["Thunderstorm", "⛈️"],
    96: ["Thunderstorm w/ hail", "⛈️"],
    99: ["Severe thunderstorm", "⛈️"],
  };

  function describe(code) {
    return codes[code] || ["Unknown", "❓"];
  }

  function temp(c) {
    if (c == null) return "-";
    const v = settings.tempUnit === "fahrenheit" ? (c * 9) / 5 + 32 : c;
    return Math.round(v) + "°" + (settings.tempUnit === "fahrenheit" ? "F" : "C");
  }

  function windUnitParam() {
    if (settings.windUnit === "mph") return "mph";
    if (settings.windUnit === "ms") return "ms";
    return "kmh";
  }

  function wind(val) {
    if (val == null) return "-";
    const label = settings.windUnit === "mph" ? "mph" : settings.windUnit === "ms" ? "m/s" : "km/h";
    return Math.round(val) + " " + label;
  }

  function dayName(dateStr, i) {
    if (i === 0) return "Today";
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
  }

 
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      #weatherModal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 40500;
        font-family: inherit;
        pointer-events: none;
      }
        #weatherModal .weather-modal-box {
            position: fixed;
            width: 534px;
            max-width: 95vw;
            height: 560px;
            max-height: 88vh;
            min-width: 340px;
            min-height: 320px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #2c2e33;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            color: #fff;
            pointer-events: auto;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        }
        #weatherModal .weather-modal-box.weather-dragging { transition: none !important; }
        #weatherResizeHandle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 18px;
            height: 18px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #4a4d54 50%);
            border-bottom-right-radius: 14px;
            z-index: 5;
        }
      #weatherModal .weather-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-bottom: 1px solid #232529;
        cursor: move;
        user-select: none;
        flex: 0 0 auto;
        position: relative;
      }
      #weatherModal .weather-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      #weatherModal .weather-header h3 {
        margin: 0;
        font-size: 15px;
        color: #fff;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      #weatherModal .weather-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      #weatherModal .weather-icon-btn {
        background: none;
        border: none;
        color: #8a8d93;
        font-size: 15px;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: 0.15s;
      }
      #weatherModal .weather-icon-btn:hover {
        color: #fff;
        background: #232529;
      }
      #weatherModal .weather-close {
        background: none;
        border: none;
        color: #8a8d93;
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
        padding: 4px 6px;
      }
      #weatherModal .weather-close:hover { color: #fff; }
      #weatherModal .weather-body {
        padding: 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1 1 auto;
        min-height: 0;
      }
      #weatherModal .weather-privacy-note {
        font-size: 11px;
        color: #6b6e74;
        line-height: 1.5;
        border-left: 2px solid #FF0000;
        padding-left: 10px;
      }
      #weatherModal .weather-input-row {
        display: flex;
        gap: 8px;
      }
      #weatherModal input[type="text"] {
        flex: 1;
        min-width: 0;
        background: #1a1b1e;
        border: 1px solid #2c2e33;
        border-radius: 8px;
        color: #fff;
        padding: 10px 12px;
        font-size: 13px;
        outline: none;
      }
      #weatherModal input[type="text"]:focus {
        border-color: #FF0000;
      }
      #weatherModal button.weather-action {
        background: #FF0000;
        border: none;
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: filter 0.15s;
      }
      #weatherModal button.weather-action:hover { filter: brightness(1.15); }
      #weatherModal button.weather-action.secondary {
        background: #1e1f22;
        color: #c7c9cd;
      }
      #weatherModal button.weather-action.secondary:hover { background: #26282c; }
        #weatherModal button.weather-action.danger {
            background: #ff0017;
            color: #fbfbfb;
        }
      #weatherModal .weather-suggestions {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 160px;
        overflow-y: auto;
        border: 1px solid #232529;
        border-radius: 8px;
        background: #131417;
      }
      #weatherModal .weather-suggestion-item {
        padding: 9px 12px;
        font-size: 13px;
        cursor: pointer;
        color: #dcddde;
        border-bottom: 1px solid #1c1d20;
      }
      #weatherModal .weather-suggestion-item:last-child { border-bottom: none; }
      #weatherModal .weather-suggestion-item:hover { background: #1c1d20; }
      #weatherModal .weather-status {
        font-size: 12px;
        color: #6b6e74;
        min-height: 14px;
      }
      #weatherModal .weather-status.error { color: #ff6b6e; }

      #weatherModal .weather-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: radial-gradient(circle at top left, rgba(255,0,0,0.12), transparent 60%), #111214;
        border: 1px solid #232529;
        border-radius: 12px;
        padding: 18px 20px;
      }
      #weatherModal .weather-hero .hero-icon { font-size: 48px; line-height: 1; }
      #weatherModal .weather-hero .hero-temp { font-size: 34px; font-weight: 800; }
      #weatherModal .weather-hero .hero-desc { font-size: 13px; color: #b9bbbe; margin-top: 2px; }
      #weatherModal .weather-hero .hero-right { text-align: right; }
      #weatherModal .weather-hero-stats {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #949ba4;
      }

      #weatherModal .weather-forecast {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      #weatherModal .forecast-day {
        flex: 0 0 auto;
        width: 56px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        background: #111214;
        border: 1px solid #232529;
        border-radius: 10px;
        padding: 10px 4px;
      }
      #weatherModal .forecast-day .fd-label {
        font-size: 11px;
        color: #949ba4;
        font-weight: 600;
      }
      #weatherModal .forecast-day .fd-icon { font-size: 20px; }
      #weatherModal .forecast-day .fd-hi { font-size: 12px; color: #fff; font-weight: 700; }
      #weatherModal .forecast-day .fd-lo { font-size: 11px; color: #6b6e74; }

      #weatherModal .weather-footer-actions {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      #weatherModal .weather-settings-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #weatherModal .weather-settings-group label {
        font-size: 12px;
        color: #949ba4;
        font-weight: 600;
      }
      #weatherModal select {
        background: #1a1b1e;
        border: 1px solid #2c2e33;
        border-radius: 8px;
        color: #fff;
        padding: 9px 10px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
      }
      #weatherModal select:focus { border-color: #FF0000; }
      #weatherModal .weather-settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid #1c1d20;
      }
      #weatherModal .weather-settings-row:last-of-type { border-bottom: none; }
      #weatherModal .weather-current-tower {
        font-size: 12px;
        color: #6b6e74;
      }
      #weatherModal .weather-current-tower strong { color: #dcddde; }
    `;
    document.head.appendChild(s);
  }


  function injectButton() {
    if (document.getElementById("weatherBtn")) return;
    const container =
      document.getElementById("hiddenGameButtons")?.parentElement ||
      document.querySelector(".sidebar-actions");

    const btn = document.createElement("button");
    btn.id = "weatherBtn";
    btn.className = "sidebar-icon-btn";
    btn.title = "Weather";
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.774 4.769h.99c1.913 0 3.463 1.56 3.463 3.486c0 1.927 -1.55 3.483 -3.463 3.483h-11.883" />
      </svg>
    `;
    btn.addEventListener("click", openModal);

    if (container) container.appendChild(btn);
    else document.body.appendChild(btn);
  }


  function injectModal() {
    const modal = document.createElement("div");
    modal.id = "weatherModal";
    modal.innerHTML = `
      <div class="weather-modal-box" id="weatherModalBox">
        <div class="weather-header" id="weatherDragHandle">
          <div class="weather-header-left">
            <h3>🌤️ Weather</h3>
          </div>
          <div class="weather-header-actions">
            <button class="weather-icon-btn" id="weatherSettingsBtn" title="Settings">⚙</button>
            <button class="weather-icon-btn" id="weatherRefreshBtn" title="Refresh">⟳</button>
            <button class="weather-close" id="weatherModalCloseBtn">×</button>
          </div>
        </div>
        <div class="weather-body" id="weatherBodyCurrent">
          <div class="weather-privacy-note">
            Tower + settings stay in this browser only (localStorage).
            Weather comes straight from your device -> Open-Meteo.
            Nothing hits r00ted's server.
          </div>

          <div class="weather-input-row">
            <input type="text" id="weatherTowerInput" placeholder="Set your tower (city/town)" autocomplete="off">
            <button class="weather-action" id="weatherSearchBtn">Search</button>
          </div>

          <div class="weather-suggestions" id="weatherSuggestions" style="display:none;"></div>
          <div class="weather-status" id="weatherStatus"></div>

          <div id="weatherResults" style="display:none; flex-direction:column; gap:14px;">
            <div class="weather-current-tower" id="weatherTowerLabel"></div>

            <div class="weather-hero">
              <div style="display:flex; align-items:center; gap:14px;">
                <div class="hero-icon" id="wxHeroIcon"></div>
                <div>
                  <div class="hero-temp" id="wxHeroTemp"></div>
                  <div class="hero-desc" id="wxHeroDesc"></div>
                </div>
              </div>
              <div class="weather-hero-stats">
                <span id="wxFeels"></span>
                <span id="wxHumidity"></span>
                <span id="wxWind"></span>
              </div>
            </div>

            <div class="weather-forecast" id="weatherForecast"></div>
          </div>

          <div class="weather-footer-actions">
            <button class="weather-action danger" id="weatherClearBtn">Clear saved tower</button>
          </div>
        </div>

        <div class="weather-body" id="weatherBodySettings" style="display:none;">
          <div class="weather-settings-row">
            <div class="weather-settings-group" style="flex:1;">
              <label>Auto-refresh</label>
            </div>
            <select id="settingRefreshInterval">
              <option value="0">Manual only</option>
              <option value="5">Every 5 min</option>
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="60">Every hour</option>
              <option value="180">Every 3 hours</option>
            </select>
          </div>
          <div class="weather-settings-row">
            <div class="weather-settings-group" style="flex:1;">
              <label>Temperature</label>
            </div>
            <select id="settingTempUnit">
              <option value="celsius">Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </div>
          <div class="weather-settings-row">
            <div class="weather-settings-group" style="flex:1;">
              <label>Wind speed</label>
            </div>
            <select id="settingWindUnit">
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="ms">m/s</option>
            </select>
          </div>
          <div class="weather-privacy-note" style="margin-top:4px;">
            These settings live only in localStorage on this machine.
          </div>
          <div class="weather-footer-actions">
            <button class="weather-action secondary" id="weatherBackBtn">Back</button>
            <button class="weather-action" id="weatherSaveSettingsBtn">Save</button>
          </div>
        </div>
        <div id="weatherResizeHandle"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#weatherModalCloseBtn").addEventListener("click", closeModal);
    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById("weatherSearchBtn").addEventListener("click", doSearch);
    document.getElementById("weatherTowerInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
    document.getElementById("weatherClearBtn").addEventListener("click", clearTower);
    document.getElementById("weatherRefreshBtn").addEventListener("click", () => {
      if (location) getWeather(location);
    });

    document.getElementById("weatherSettingsBtn").addEventListener("click", showSettings);
    document.getElementById("weatherBackBtn").addEventListener("click", showMain);
    document.getElementById("weatherSaveSettingsBtn").addEventListener("click", saveSettings);

    const box = document.getElementById("weatherModalBox");
    makeDraggable(box, document.getElementById("weatherDragHandle"));
    makeResizable(box, document.getElementById("weatherResizeHandle"));
  }

 
  function makeDraggable(box, handle) {
    if (!box || !handle) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function onPointerDown(e) {
      if (e.target.closest("button")) return;
      dragging = true;
      box.classList.add("weather-dragging");

      const rect = box.getBoundingClientRect();
      box.style.position = "fixed";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.margin = "0";

      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxLeft = window.innerWidth - box.offsetWidth;
      const maxTop = window.innerHeight - box.offsetHeight;
      const newLeft = Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft));
      const newTop = Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop));
      box.style.left = newLeft + "px";
      box.style.top = newTop + "px";
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      box.classList.remove("weather-dragging");
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
    }

    handle.addEventListener("mousedown", onPointerDown);
  }

  
  function makeResizable(box, handle) {
    if (!box || !handle) return;
    let resizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    function onDown(e) {
      resizing = true;
      const rect = box.getBoundingClientRect();
      box.style.position = "fixed";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.margin = "0";

      startX = e.clientX;
      startY = e.clientY;
      startW = rect.width;
      startH = rect.height;

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
      e.stopPropagation();
    }

    function onMove(e) {
      if (!resizing) return;
      const minW = parseInt(getComputedStyle(box).minWidth) || 340;
      const minH = parseInt(getComputedStyle(box).minHeight) || 320;
      const maxW = window.innerWidth * 0.95;
      const maxH = window.innerHeight * 0.88;

      const newW = Math.min(maxW, Math.max(minW, startW + (e.clientX - startX)));
      const newH = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY)));

      box.style.width = newW + "px";
      box.style.height = newH + "px";
    }

    function onUp() {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    handle.addEventListener("mousedown", onDown);
  }

  

function applyPosition() {
  const box = document.getElementById("weatherModalBox");
  if (!box) return;

  const width = 534;
  const height = 704;

  box.style.width = width + "px";
  box.style.height = height + "px";
  box.style.left = Math.max(0, (window.innerWidth - width) / 2) + "px";
  box.style.top = Math.max(0, (window.innerHeight - height) / 2) + "px";
  box.style.margin = "0";
}

  function showSettings() {
    document.getElementById("settingRefreshInterval").value = String(settings.refreshMinutes);
    document.getElementById("settingTempUnit").value = settings.tempUnit;
    document.getElementById("settingWindUnit").value = settings.windUnit;
    document.getElementById("weatherBodyCurrent").style.display = "none";
    document.getElementById("weatherBodySettings").style.display = "flex";
    document.getElementById("weatherBodySettings").style.flexDirection = "column";
  }

  function showMain() {
    document.getElementById("weatherBodySettings").style.display = "none";
    document.getElementById("weatherBodyCurrent").style.display = "flex";
    document.getElementById("weatherBodyCurrent").style.flexDirection = "column";
  }

  function saveSettings() {
    settings.refreshMinutes = parseInt(document.getElementById("settingRefreshInterval").value, 10);
    settings.tempUnit = document.getElementById("settingTempUnit").value;
    settings.windUnit = document.getElementById("settingWindUnit").value;
    save(SETTINGS_KEY, settings);
    scheduleRefresh();
    if (location) getWeather(location);
    showMain();
  }

  function status(msg, err) {
    const el = document.getElementById("weatherStatus");
    el.textContent = msg || "";
    el.className = "weather-status" + (err ? " error" : "");
  }

  async function geocode(q) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    return data.results || [];
  }

  async function doSearch() {
    const q = document.getElementById("weatherTowerInput").value.trim();
    if (!q) return;
    status("Searching…");
    document.getElementById("weatherSuggestions").style.display = "none";
    try {
      const results = await geocode(q);
      if (!results.length) {
        status("No matches. Try another name.", true);
        return;
      }
      if (results.length === 1) {
        pickLocation(results[0]);
      } else {
        showSuggestions(results);
        status("");
      }
    } catch {
      status("Search failed - check connection.", true);
    }
  }

  function showSuggestions(results) {
    const box = document.getElementById("weatherSuggestions");
    box.innerHTML = "";
    results.forEach((r) => {
      const item = document.createElement("div");
      item.className = "weather-suggestion-item";
      const region = [r.admin1, r.country].filter(Boolean).join(", ");
      item.textContent = region ? `${r.name} - ${region}` : r.name;
      item.addEventListener("click", () => pickLocation(r));
      box.appendChild(item);
    });
    box.style.display = "flex";
  }

  function pickLocation(r) {
    const loc = {
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    };
    location = loc;
    save(LOC_KEY, loc);
    document.getElementById("weatherSuggestions").style.display = "none";
    document.getElementById("weatherTowerInput").value = "";
    getWeather(loc);
  }

  

  function clearTower() {
    clear(LOC_KEY);
    location = null;
    document.getElementById("weatherResults").style.display = "none";
    status("Tower cleared.");
    stopRefresh();
  }

  async function getWeather(loc) {
    status("Fetching…");
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&wind_speed_unit=${windUnitParam()}&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("forecast failed");
      const data = await res.json();
      render(loc, data);
      status("");
      scheduleRefresh();
    } catch {
      status("Couldn't fetch weather - check connection.", true);
    }
  }

  function render(loc, data) {
    const cur = data.current;
    const [label, icon] = describe(cur.weather_code);

    document.getElementById("weatherTowerLabel").innerHTML = `Tower: <strong>${loc.name}</strong>`;
    document.getElementById("wxHeroIcon").textContent = icon;
    document.getElementById("wxHeroTemp").textContent = temp(cur.temperature_2m);
    document.getElementById("wxHeroDesc").textContent = label;
    document.getElementById("wxFeels").textContent = `Feels like ${temp(cur.apparent_temperature)}`;
    document.getElementById("wxHumidity").textContent = `💧 ${cur.relative_humidity_2m}% humidity`;
    document.getElementById("wxWind").textContent = `💨 ${wind(cur.wind_speed_10m)} wind`;

    const forecastEl = document.getElementById("weatherForecast");
    forecastEl.innerHTML = "";
    const daily = data.daily;
    daily.time.forEach((dateStr, i) => {
      const [, dIcon] = describe(daily.weather_code[i]);
      const day = document.createElement("div");
      day.className = "forecast-day";
      day.innerHTML = `
        <div class="fd-label">${dayName(dateStr, i)}</div>
        <div class="fd-icon">${dIcon}</div>
        <div class="fd-hi">${temp(daily.temperature_2m_max[i])}</div>
        <div class="fd-lo">${temp(daily.temperature_2m_min[i])}</div>
      `;
      forecastEl.appendChild(day);
    });

    document.getElementById("weatherResults").style.display = "flex";
  }

  function scheduleRefresh() {
    stopRefresh();
    const mins = settings.refreshMinutes;
    if (!mins || mins <= 0) return;
    refreshTimer = setInterval(() => {
      if (location) getWeather(location);
    }, mins * 60 * 1000);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function openModal() {
    document.getElementById("weatherModal").style.display = "block";
    applyPosition();
    showMain();
    const saved = load(LOC_KEY, null);
    if (saved && saved.lat != null) {
      location = saved;
      getWeather(saved);
    }
  }

  function closeModal() {
    document.getElementById("weatherModal").style.display = "none";
  }

  function init() {
    settings = load(SETTINGS_KEY, defaults);
    injectStyles();
    injectButton();
    injectModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();