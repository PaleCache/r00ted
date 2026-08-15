const GIF_CATEGORIES = [
  { label: "Reactions",  query: "reactions" },
  { label: "Hi",         query: "hi" },
  { label: "Bye",        query: "bye" },
  { label: "Yes",        query: "yes" },
  { label: "No",         query: "no" },
  { label: "Congrats",   query: "congratulations" },
  { label: "Dance",      query: "dance" },
  { label: "Love",       query: "love" },
  { label: "Angry",      query: "angry" },
  { label: "Shrug",      query: "shrug" },
];


const colors = [
  { cls: 'ug-gold',          grad: 'linear-gradient(90deg,#ffd700,#ff8800)', name: 'Gold' },
  { cls: 'ug-pink',          grad: 'linear-gradient(90deg,#ff2d95,#c800ff)', name: 'Pink' },
  { cls: 'ug-purple',        grad: 'linear-gradient(90deg,#9d4eff,#4b00ff)', name: 'Purple' },
  { cls: 'ug-cyan',          grad: 'linear-gradient(90deg,#00f2ff,#0066ff)', name: 'Cyan' },
  { cls: 'ug-green',         grad: 'linear-gradient(90deg,#39ff6e,#008f2e)', name: 'Green' },
  { cls: 'ug-red',           grad: 'linear-gradient(90deg,#ff3333,#aa0000)', name: 'Red' },
  { cls: 'ug-blue-silver',   grad: 'linear-gradient(90deg,#3399ff,#c0d4ff)', name: 'Blue Silver' },

  { cls: 'ug-sunset',        grad: 'linear-gradient(90deg,#ff416c,#ff4b2b)', name: 'Sunset' },
  { cls: 'ug-sunrise',       grad: 'linear-gradient(90deg,#ff512f,#f09819,#ffe259)', name: 'Sunrise' },
  { cls: 'ug-peach',         grad: 'linear-gradient(90deg,#ff9a9e,#fad0c4,#ffd1ff)', name: 'Peach' },
  { cls: 'ug-flamingo',      grad: 'linear-gradient(90deg,#f43f5e,#ec4899,#d946ef)', name: 'Flamingo' },
  { cls: 'ug-electric',      grad: 'linear-gradient(90deg,#ff00cc,#3333ff,#00d4ff)', name: 'Electric' },
  { cls: 'ug-tropical',      grad: 'linear-gradient(90deg,#00f5a0,#00d9f5,#7c3aed)', name: 'Tropical' },

  { cls: 'ug-galaxy',        grad: 'linear-gradient(90deg,#0f0c29,#302b63,#7b2cbf)', name: 'Galaxy' },
  { cls: 'ug-nebula',        grad: 'linear-gradient(90deg,#05001a,#4c1d95,#db2777,#fb7185)', name: 'Nebula' },
  { cls: 'ug-cosmos',        grad: 'linear-gradient(90deg,#020617,#172554,#4f46e5,#c026d3)', name: 'Cosmos' },
  { cls: 'ug-starlight',     grad: 'linear-gradient(90deg,#0f172a,#312e81,#818cf8,#e0e7ff)', name: 'Starlight' },
  { cls: 'ug-supernova',     grad: 'linear-gradient(90deg,#1e1b4b,#7e22ce,#e11d48,#fbbf24)', name: 'Supernova' },
  { cls: 'ug-event-horizon', grad: 'linear-gradient(90deg,#000000,#111827,#4c1d95,#c026d3)', name: 'Event Horizon' },

  { cls: 'ug-amethyst',      grad: 'linear-gradient(90deg,#3b0764,#7e22ce,#c084fc)', name: 'Amethyst' },
  { cls: 'ug-royal',         grad: 'linear-gradient(90deg,#1e1b4b,#4338ca,#8b5cf6)', name: 'Royal' },
  { cls: 'ug-violet',        grad: 'linear-gradient(90deg,#4c1d95,#9333ea,#e879f9)', name: 'Violet' },
  { cls: 'ug-magenta',       grad: 'linear-gradient(90deg,#f72585,#b5179e,#7209b7)', name: 'Magenta' },
  { cls: 'ug-cotton-candy',  grad: 'linear-gradient(90deg,#a78bfa,#f472b6,#fda4af)', name: 'Cotton Candy' },
  { cls: 'ug-bubblegum',     grad: 'linear-gradient(90deg,#ec4899,#f472b6,#f9a8d4)', name: 'Bubblegum' },

  { cls: 'ug-inferno',       grad: 'linear-gradient(90deg,#7f1d1d,#ea580c,#facc15)', name: 'Inferno' },
  { cls: 'ug-ember',         grad: 'linear-gradient(90deg,#450a0a,#b91c1c,#f97316)', name: 'Ember' },
  { cls: 'ug-volcanic',      grad: 'linear-gradient(90deg,#09090b,#450a0a,#dc2626,#fb923c)', name: 'Volcanic' },
  { cls: 'ug-molten',        grad: 'linear-gradient(90deg,#1c1917,#991b1b,#f97316,#fde047)', name: 'Molten' },
  { cls: 'ug-firestorm',     grad: 'linear-gradient(90deg,#450a0a,#dc2626,#f97316,#fef08a)', name: 'Firestorm' },

  { cls: 'ug-ocean',         grad: 'linear-gradient(90deg,#023e8a,#0077b6,#48cae4)', name: 'Ocean' },
  { cls: 'ug-deep-sea',      grad: 'linear-gradient(90deg,#020617,#0c4a6e,#0891b2)', name: 'Deep Sea' },
  { cls: 'ug-abyss',         grad: 'linear-gradient(90deg,#020617,#082f49,#164e63)', name: 'Abyss' },
  { cls: 'ug-arctic',        grad: 'linear-gradient(90deg,#0c4a6e,#06b6d4,#bae6fd)', name: 'Arctic' },
  { cls: 'ug-iceberg',       grad: 'linear-gradient(90deg,#172554,#2563eb,#67e8f9)', name: 'Iceberg' },
  { cls: 'ug-electric-blue', grad: 'linear-gradient(90deg,#172554,#2563eb,#22d3ee)', name: 'Electric Blue' },
  { cls: 'ug-cyber-blue',    grad: 'linear-gradient(90deg,#020617,#1d4ed8,#06b6d4)', name: 'Cyber Blue' },

  { cls: 'ug-forest',        grad: 'linear-gradient(90deg,#064e3b,#059669,#34d399)', name: 'Forest' },
  { cls: 'ug-emerald',       grad: 'linear-gradient(90deg,#022c22,#059669,#6ee7b7)', name: 'Emerald' },
  { cls: 'ug-jade',          grad: 'linear-gradient(90deg,#064e3b,#10b981,#2dd4bf)', name: 'Jade' },
  { cls: 'ug-toxic',         grad: 'linear-gradient(90deg,#052e16,#16a34a,#a3e635)', name: 'Toxic' },
  { cls: 'ug-radioactive',   grad: 'linear-gradient(90deg,#17210b,#65a30d,#d9f99d)', name: 'Radioactive' },
  { cls: 'ug-aurora',        grad: 'linear-gradient(90deg,#020617,#1e1b4b,#7c3aed,#06b6d4,#34d399)', name: 'Aurora' },

  { cls: 'ug-midnight',      grad: 'linear-gradient(90deg,#020617,#1e293b,#475569)', name: 'Midnight' },
  { cls: 'ug-void',          grad: 'linear-gradient(90deg,#000000,#111827,#312e81)', name: 'Void' },
  { cls: 'ug-obsidian',      grad: 'linear-gradient(90deg,#09090b,#18181b,#3f3f46)', name: 'Obsidian' },
  { cls: 'ug-phantom',       grad: 'linear-gradient(90deg,#09090b,#1e1b4b,#312e81)', name: 'Phantom' },
  { cls: 'ug-noir',          grad: 'linear-gradient(90deg,#030712,#111827,#1f2937)', name: 'Noir' },
  { cls: 'ug-carbon',        grad: 'linear-gradient(90deg,#18181b,#27272a,#52525b)', name: 'Carbon' },
  { cls: 'ug-black-ice',     grad: 'linear-gradient(90deg,#020617,#172554,#334155)', name: 'Black Ice' },

  { cls: 'ug-champagne',     grad: 'linear-gradient(90deg,#78350f,#d4a574,#fef3c7)', name: 'Champagne' },
  { cls: 'ug-rose-gold',     grad: 'linear-gradient(90deg,#7c2d12,#e8797e,#fbcfe8)', name: 'Rose Gold' },
  { cls: 'ug-platinum',      grad: 'linear-gradient(90deg,#1f2937,#94a3b8,#f1f5f9)', name: 'Platinum' },
  { cls: 'ug-silver',        grad: 'linear-gradient(90deg,#334155,#cbd5e1,#ffffff)', name: 'Silver' },

  { cls: 'ug-neon',          grad: 'linear-gradient(90deg,#ff00ff,#00ffff,#39ff14)', name: 'Neon' },
  { cls: 'ug-cyberpunk',     grad: 'linear-gradient(90deg,#ff0080,#7928ca,#00ffff)', name: 'Cyberpunk' },
  { cls: 'ug-synthwave',     grad: 'linear-gradient(90deg,#12001f,#7b2cbf,#f72585,#ff9f1c)', name: 'Synthwave' },
  { cls: 'ug-laser',         grad: 'linear-gradient(90deg,#00111a,#00e5ff,#ff00aa)', name: 'Laser' },
  { cls: 'ug-matrix',        grad: 'linear-gradient(90deg,#001a0a,#00a63c,#39ff88)', name: 'Matrix' },
  { cls: 'ug-plasma',        grad: 'linear-gradient(90deg,#4c0519,#e11d48,#9333ea,#22d3ee)', name: 'Plasma' },

  { cls: 'ug-prism',         grad: 'linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff85,#00c6ff)', name: 'Prism' },
  { cls: 'ug-rainbow',       grad: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#06b6d4,#8b5cf6)', name: 'Rainbow' },
  { cls: 'ug-dreamscape',    grad: 'linear-gradient(90deg,#312e81,#7c3aed,#ec4899,#f9a8d4)', name: 'Dreamscape' },
  { cls: 'ug-twilight',      grad: 'linear-gradient(90deg,#0f172a,#3730a3,#c026d3,#fb7185)', name: 'Twilight' },
  { cls: 'ug-mystic',        grad: 'linear-gradient(90deg,#172554,#581c87,#be185d)', name: 'Mystic' },
  { cls: 'ug-enchanted',     grad: 'linear-gradient(90deg,#022c22,#115e59,#7e22ce,#c026d3)', name: 'Enchanted' },
  { cls: 'ug-dream',         grad: 'linear-gradient(90deg,#1e3a8a,#7c3aed,#f472b6)', name: 'Dream' },
  { cls: 'ug-holographic',   grad: 'linear-gradient(90deg,#22d3ee,#818cf8,#e879f9,#fb7185,#fde68a)', name: 'Holographic' }
];

function renderAnimatedGradientButtons() {
  const container = document.getElementById("AnimatedgradientButtons");
  if (!container) return;

  container.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-gutter: stable;
  `;
  container.classList.add("dark-scrollbar");

  if ((user.level || 1) >= 2) {
    container.innerHTML = `
      <button class="effect-btn" data-name="Gay Boy 🌈"
        onmouseover="updateNamePreview('username-rainbow')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-rainbow')"
        style="background: linear-gradient(90deg,#ff0000,#ff9900,#ccff00,#00ff00,#00ffff,#0066ff,#cc00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Matrix Code 🔢"
        onmouseover="updateNamePreview('username-matrix-code')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-matrix-code')"
        style="background: linear-gradient(180deg, #00ff41, #008f1e); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;font-family:'Courier New',monospace; font-weight:700; color:#00ff41; font-size:10px; display:flex; align-items:center; justify-content:center;">01</button>

      <button class="effect-btn" data-name="Neon ⚡"
        onmouseover="updateNamePreview('username-neon')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-neon')"
        style="background: linear-gradient(90deg,#00ffea,#ff00c8); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Shimmer ✨"
        onmouseover="updateNamePreview('username-shimmer')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-shimmer')"
        style="background: linear-gradient(90deg,#ffffff,#aaffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Glitch 📡"
        onmouseover="updateNamePreview('username-glitch')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-glitch')"
        style="background: linear-gradient(90deg,#00ffcc,#ff00ff,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Electric ⚙️"
        onmouseover="updateNamePreview('username-electric')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-electric')"
        style="background: linear-gradient(90deg,#00ddff,#ffffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Matrix 🟢"
        onmouseover="updateNamePreview('username-matrix')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-matrix')"
        style="background: linear-gradient(180deg,#00ff41,#008f1e); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Ghost 👻"
        onmouseover="updateNamePreview('username-ghost')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-ghost')"
        style="background: linear-gradient(90deg,#ffffff,#bbbbff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Hellfire 🔥"
        onmouseover="updateNamePreview('username-hellfire')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-hellfire')"
        style="background: linear-gradient(90deg,#ff2200,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Fire 🌋"
        onmouseover="updateNamePreview('username-fire')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-fire')"
        style="background: linear-gradient(90deg,#ff4400,#ffaa00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Cyberpunk 🤖"
        onmouseover="updateNamePreview('username-cyberpunk')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-cyberpunk')"
        style="background: linear-gradient(90deg,#ff006e,#00f5ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Cosmic 🌌"
        onmouseover="updateNamePreview('username-cosmic')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-cosmic')"
        style="background: linear-gradient(90deg,#a78bfa,#60a5fa,#34d399); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Plasma 💜"
        onmouseover="updateNamePreview('username-plasma')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-plasma')"
        style="background: linear-gradient(90deg,#ff1493,#ffb6c1); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Aurora 🌅"
        onmouseover="updateNamePreview('username-aurora')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-aurora')"
        style="background: linear-gradient(90deg,#00ff88,#00ffff,#ff00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Inferno 🌪️"
        onmouseover="updateNamePreview('username-inferno')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-inferno')"
        style="background: linear-gradient(90deg,#ff0000,#ff7f00,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Void 🌑"
        onmouseover="updateNamePreview('username-void')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-void')"
        style="background: linear-gradient(90deg,#0a0e27,#16213e,#0f3460); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Candy 🍭"
        onmouseover="updateNamePreview('username-candy')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-candy')"
        style="background: linear-gradient(90deg,#ff69b4,#ffb6d9,#ffc0cb); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Quantum ⚛️"
        onmouseover="updateNamePreview('username-quantum')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-quantum')"
        style="background: linear-gradient(90deg,#00d9ff,#0099ff,#6600ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Twilight 🌆"
        onmouseover="updateNamePreview('username-twilight')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-twilight')"
        style="background: linear-gradient(90deg,#7c3aed,#ec4899,#f59e0b); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Corrupted 🔥"
        onmouseover="updateNamePreview('username-corrupted')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-corrupted')"
        style="background: linear-gradient(90deg,#ff0080,#7928ca); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Void Pulse ⚫"
        onmouseover="updateNamePreview('username-void-pulse')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-void-pulse')"
        style="background: radial-gradient(circle, #00ffff, #0066ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Acid 🍄"
        onmouseover="updateNamePreview('username-acid')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-acid')"
        style="background: linear-gradient(45deg,#ff0000,#ffff00,#00ff00,#00ffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Fractal ∞"
        onmouseover="updateNamePreview('username-fractal')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-fractal')"
        style="background: linear-gradient(90deg,#ff006e,#8338ec,#3a86ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Hyperdrive 🚀"
        onmouseover="updateNamePreview('username-hyperdrive')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-hyperdrive')"
        style="background: linear-gradient(90deg,#00ffff,#ffffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Supernova ⭐"
        onmouseover="updateNamePreview('username-supernova')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-supernova')"
        style="background: linear-gradient(90deg,#ffff00,#ff8800,#ff0000); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Quantum Entangle ⚛️"
        onmouseover="updateNamePreview('username-quantum-entangle')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-quantum-entangle')"
        style="background: linear-gradient(90deg,#00d9ff,#6600ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Dimensional 🎲"
        onmouseover="updateNamePreview('username-dimensional')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-dimensional')"
        style="background: linear-gradient(90deg,#ff00ff,#00ffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Toxic ☢️"
        onmouseover="updateNamePreview('username-toxic')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-toxic')"
        style="background: linear-gradient(90deg,#39ff14,#00ff00,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Chaos 🌀"
        onmouseover="updateNamePreview('username-chaos')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-chaos')"
        style="background: linear-gradient(90deg,#ff0080,#ff8c00,#40e0d0); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Singularity 🕳️"
        onmouseover="updateNamePreview('username-singularity')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-singularity')"
        style="background: radial-gradient(circle, #ffffff, #ff00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>
    `;
  const activeColor = user.usernameColor || 'username-cyan';
    container.querySelectorAll('.effect-btn').forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      const match = onclickAttr.match(/setNameColor\('([^']+)'\)/);
      const btnColorClass = match ? match[1] : null;
      if (btnColorClass && btnColorClass === activeColor) {
        btn.style.border = "3px solid #FF0000";
        btn.style.boxShadow = "0 0 15px #FF0000";
      }
    });
} else {
  container.innerHTML = `
    <div style="grid-column: 1 / -1; padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%; box-sizing: border-box;">
      🔒 Animated name colors unlock at <strong style="color:#ffd700;">Level 2</strong>
    </div>
  `;
}
}


function setProfileEffect(url) {
  if (url === user.profileEffect) {
    user.profileEffect = null;
  } else {
    user.profileEffect = url;
  }
  localStorage.setItem("chatUser", JSON.stringify(user));

  if (socket && socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner || "",
        customStatus: user.customStatus || "",
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        level: user.level || 1,
        profileHeader: user.profileHeader,
        prestigeBadge: user.prestigeBadge || null,
        profileGradient: user.profileGradient || null,
        profileEffect: user.profileEffect || null
      }
    });
  }

 
  if (currentProfileUser && currentProfileUser.id === user.id) {
    currentProfileUser.profileEffect = user.profileEffect;
  }


  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].profileEffect = user.profileEffect;
  }

  renderProfileEffectButtons();
  showToast(user.profileEffect ? "Profile effect applied!" : "Profile effect removed");
}

function renderProfileEffectButtons() {
  const container = document.getElementById("profileEffectButtons");
  if (!container) return;

  if ((user.level || 1) < 2) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%; box-sizing: border-box;">
        🔒 Profile effects unlock at <strong style="color:#ffd700;">Level 2</strong>
      </div>
    `;
    return;
  }

  const effects = (SERVER_CONFIG.profileEffects || []).length > 0
    ? SERVER_CONFIG.profileEffects
    : (pepeList || []).map(filename => ({
        name: filename.replace(/\.[^/.]+$/, ""),
        url: `/avatars/${filename}`
      }));

  if (effects.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%;">
        No profile effects available.
      </div>
    `;
    return;
  }

  const active = user.profileEffect;
    let html = `
    <div class="dark-scrollbar" style="display:grid; width:100%; grid-template-columns: repeat(10, 1fr); gap: 8px; max-height: 220px; overflow-y: auto; scrollbar-gutter: stable; padding-right: 4px; box-sizing: border-box;">
    `;

  effects.forEach((fx, i) => {
    const isSel = active === fx.url;
    html += `
      <div onclick="setProfileEffect('${fx.url.replace(/'/g, "\\'")}')"
        title="${fx.name || 'Effect ' + (i + 1)}"
        style="
          aspect-ratio: 1; border-radius: 8px; cursor: pointer;
          background: url('${fx.url}') center/cover;
          border: ${isSel ? '3px solid #FF0000' : '2px solid transparent'};
          box-shadow: ${isSel ? '0 0 12px #FF0000' : 'none'};
          box-sizing: border-box; transition: transform 0.1s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}