function buildEmbedElement(m) {
  const embedDiv = document.createElement("div");
  embedDiv.style.borderLeft = `4px solid ${m.embed.color || "#5865F2"}`;
  embedDiv.style.background = "rgba(0, 0, 0, 0.61)";
  embedDiv.style.padding = "12px 16px";
  embedDiv.style.borderRadius = "6px";
  embedDiv.style.maxWidth = "500px";
  embedDiv.style.display = "flex";
  embedDiv.style.flexDirection = "column";
  embedDiv.style.gap = "10px";
  const imageList = Array.isArray(m.embed.images) && m.embed.images.length > 0
    ? m.embed.images
    : (m.embed.image ? [m.embed.image] : []);

  if (imageList.length === 1) {
    const imgEl = document.createElement("img");
    imgEl.src = imageList[0];
    imgEl.loading = "lazy";
    imgEl.style.maxWidth = "100%";
    imgEl.style.borderRadius = "4px";
    imgEl.style.cursor = "zoom-in";
    imgEl.onclick = (e) => { e.stopPropagation(); openImageModal(imageList[0]); };
    embedDiv.appendChild(imgEl);
  } else if (imageList.length > 1) {
    const grid = document.createElement("div");
    const cols = imageList.length === 2 ? 2 : (imageList.length === 3 ? 3 : 2);
    grid.style.cssText = `
      display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:4px;
      border-radius:6px; overflow:hidden;
    `;
    imageList.forEach(src => {
      const imgEl = document.createElement("img");
      imgEl.src = src;
      imgEl.loading = "lazy";
      imgEl.style.cssText = "width:100%; height:100%; max-height:220px; object-fit:cover; cursor:zoom-in; display:block;";
      imgEl.onclick = (e) => { e.stopPropagation(); openImageModal(src); };
      grid.appendChild(imgEl);
    });
    embedDiv.appendChild(grid);
  }

  if (m.embed.title) {
    const titleEl = document.createElement("div");
    titleEl.textContent = m.embed.title;
    titleEl.style.fontWeight = "600";
    titleEl.style.fontSize = "16px";
    titleEl.style.color = "#ffffff";
    embedDiv.appendChild(titleEl);
  }
  if (m.embed.description) {
    const descContainer = typeof m.embed.description === "string"
      ? parseContent(m.embed.description, m.time)
      : document.createTextNode(m.embed.description || '');
    descContainer.style && (descContainer.style.margin = "8px 0");
    embedDiv.appendChild(descContainer);
  }
  if (m.embed.fields && Array.isArray(m.embed.fields) && m.embed.fields.length > 0) {
    const fieldsContainer = document.createElement("div");
    fieldsContainer.style.display = "flex";
    fieldsContainer.style.flexWrap = "wrap";
    fieldsContainer.style.gap = "16px 30px";
    m.embed.fields.forEach(f => {
      if (!f || !f.name) return;
      const fieldDiv = document.createElement("div");
      fieldDiv.style.minWidth = "140px";
      const nameStrong = document.createElement("strong");
      nameStrong.style.color = "#fff";
      nameStrong.textContent = f.name;
      fieldDiv.appendChild(nameStrong);
      fieldDiv.appendChild(document.createElement("br"));
      const valueContainer = typeof f.value === "string" ? parseContent(f.value, m.time) : document.createTextNode(f.value || '');
      fieldDiv.appendChild(valueContainer);
      fieldsContainer.appendChild(fieldDiv);
    });
    embedDiv.appendChild(fieldsContainer);
  }


  if (m.embed.buttons && Array.isArray(m.embed.buttons) && m.embed.buttons.length > 0) {
    const buttonsRow = document.createElement("div");
    buttonsRow.style.cssText = "display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;";

    const styleColors = {
      primary:   { bg: "#b758f2", hover: "#b758f2" },
      secondary: { bg: "#4f545c", hover: "#5d6269" },
      success:   { bg: "#23a559", hover: "#1e8e4c" },
      danger:    { bg: "#da373c", hover: "#c22e32" },
      link:      { bg: "#4f545c", hover: "#5d6269" }
    };

    m.embed.buttons.forEach(btn => {
      if (!btn || !btn.label) return;
      const isLink = btn.style === "link" && btn.url;
      const colors = styleColors[btn.style] || styleColors.secondary;

      const buttonEl = document.createElement(isLink ? "a" : "button");
      buttonEl.textContent = btn.emoji ? `${btn.emoji} ${btn.label}` : btn.label;
      buttonEl.style.cssText = `
        background:${colors.bg}; color:#fff; border:none; padding:8px 14px;
        border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;
        transition:background 0.15s; text-decoration:none; display:inline-flex;
        align-items:center; gap:6px;
      `;
      buttonEl.onmouseover = () => buttonEl.style.background = colors.hover;
      buttonEl.onmouseout = () => buttonEl.style.background = colors.bg;

      if (isLink) {
        if (!isSafeUrl(btn.url)) return;
        buttonEl.href = btn.url;
        buttonEl.target = "_blank";
        buttonEl.rel = "noopener noreferrer";
      } else {
        buttonEl.onclick = () => {
          if (btn.oneTime) {
            buttonEl.disabled = true;
            buttonEl.style.opacity = "0.5";
            buttonEl.style.cursor = "not-allowed";
          }
          socket.emit("embedButtonClick", {
            messageId: m.id,
            buttonId: btn.id || btn.label,
            userId: user.id,
            username: user.username
          });
        };
      }

      buttonsRow.appendChild(buttonEl);
    });

    if (buttonsRow.children.length > 0) embedDiv.appendChild(buttonsRow);
  }

  if (m.embed.footer) {
    const footerDiv = document.createElement("div");
    footerDiv.style.marginTop = "auto";
    footerDiv.style.paddingTop = "8px";
    footerDiv.style.borderTop = "1px solid #40444b";
    footerDiv.style.fontSize = "12px";
    footerDiv.style.color = "#b9bbbe";
    footerDiv.textContent = m.embed.footer;
    embedDiv.appendChild(footerDiv);
  }

  return embedDiv;
}
