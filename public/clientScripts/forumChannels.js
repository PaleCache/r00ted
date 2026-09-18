
let forumPostAuthors = new Map();
let forumHoverSuppressedUntil = 0;
function isOwnActivity(userId) {
  console.log('[DEBUG isOwnActivity]', { userId, myId: user.id, match: String(userId) === String(user.id) });
  return userId !== undefined && String(userId) === String(user.id);
}



function addForumUnseen(channel, postId, messageId) {
  if (!forumUnseenPosts.has(channel)) forumUnseenPosts.set(channel, new Map());
  const postMap = forumUnseenPosts.get(channel);
  if (!postMap.has(postId)) postMap.set(postId, new Set());
  const msgSet = postMap.get(postId);

  if (!msgSet.has(messageId)) {
    msgSet.add(messageId);
    const count = (unreadCounts.get(channel) || 0) + 1;
    unreadCounts.set(channel, count);
    updateChannelBadge(channel, count);
  }
}

function clearForumUnseen(channel, postId) {
  const postMap = forumUnseenPosts.get(channel);
  if (!postMap || !postMap.has(postId)) return;

  const removed = postMap.get(postId).size;
  postMap.delete(postId);

  const count = Math.max(0, (unreadCounts.get(channel) || 0) - removed);
  unreadCounts.set(channel, count);
  updateChannelBadge(channel, count);
}

function clearForumUnseenMessage(channel, postId, messageId) {
  const postMap = forumUnseenPosts.get(channel);
  if (!postMap || !postMap.has(postId)) return;
  const msgSet = postMap.get(postId);
  if (!msgSet.has(messageId)) return;

  msgSet.delete(messageId);
  if (msgSet.size === 0) postMap.delete(postId);

  const count = Math.max(0, (unreadCounts.get(channel) || 0) - 1);
  unreadCounts.set(channel, count);
  updateChannelBadge(channel, count);
}


function insertEmoteImageIntoEditable(editableEl, filename) {
  restoreForumSelection(editableEl);
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);

  const img = document.createElement("img");
  img.src = `/avatars/${filename}`;
  img.className = "inline-emote";
  img.contentEditable = "false";
  img.dataset.emoteFile = filename;
  img.style.cssText = "width:22px; height:22px; object-fit:contain; vertical-align:middle; margin:0 1px;";

  range.deleteContents();
  range.insertNode(img);
  const space = document.createTextNode(" ");
  img.after(space);

  const after = document.createRange();
  after.setStartAfter(space);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  savedForumRanges.set(editableEl, after.cloneRange());
}


const savedForumRanges = new WeakMap();

function saveForumSelection(editableEl) {
  const sel = window.getSelection();
  if (sel.rangeCount && editableEl.contains(sel.anchorNode)) {
    savedForumRanges.set(editableEl, sel.getRangeAt(0).cloneRange());
  }
}

function restoreForumSelection(editableEl) {
  editableEl.focus();
  const sel = window.getSelection();
  const saved = savedForumRanges.get(editableEl);

  const range = (saved && editableEl.contains(saved.startContainer))
    ? saved
    : (() => {
        const r = document.createRange();
        r.selectNodeContents(editableEl);
        r.collapse(false);
        return r;
      })();

  sel.removeAllRanges();
  sel.addRange(range);
}



function getEditableText(editableEl) {
  let out = "";
  editableEl.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
    } else if (node.tagName === "IMG" && node.dataset.emoteFile) {
      out += `${window.location.origin}/avatars/${node.dataset.emoteFile}`;
    } else if (node.tagName === "BR") {
      out += "\n";
    } else {
      out += node.textContent || "";
    }
  });
  return out;
}

function openNewForumPostModal(channelId) {
  document.getElementById("newForumPostModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "newForumPostModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:20000;";
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:24px 28px; width:420px;">
      <h3 style="margin:0 0 14px; color:#fff;">New Post</h3>
      <input id="forumTitleInput" placeholder="Title" maxlength="100" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;background:#40444b;border:none;border-radius:8px;color:#fff;">
     <div id="forumBodyInput" contenteditable="true" data-placeholder="What's on your mind?" style="width:100%;box-sizing:border-box;padding:10px;min-height:100px;max-height:240px;overflow-y:auto;background:#40444b;border-radius:8px;color:#fff;outline:none;"></div>

      <div id="forumAttachPreview" style="display:none; margin-top:10px; position:relative; width:fit-content;">
        <img id="forumAttachPreviewImg" style="max-width:120px; max-height:120px; border-radius:6px; display:block;">
        <button id="forumAttachRemove" style="position:absolute; top:-6px; right:-6px; background:#e11d1d; border:none; color:#fff; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:12px; line-height:1;">✕</button>
      </div>

      <div class="input-wrapper" style="padding:0; background:transparent; border-top:none; gap:8px; margin-top:12px;">
        <button id="forumAttachImgBtn" type="button" title="Attach image">✚</button>
        <button id="forumEmoteBtn" type="button" class="input-icon-btn" title="Emote Menu" style="font-size: 21px; padding: 0 8px;">☹</button>
        <input type="file" id="forumImageInput" accept="image/*,video/*,audio/*,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json" style="display:none;">
        <span id="forumUploadStatus" style="font-size:12px; color:#72767d; margin-left:auto;"></span>
      </div>

      <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end;">
        <button id="cancelForumPost" style="background:#40444b;border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;">Cancel</button>
        <button id="submitForumPost" style="background:#FF0000;border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;">Post</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

   const forumBodyInputEl = modal.querySelector("#forumBodyInput");
  forumBodyInputEl.addEventListener("keyup", () => saveForumSelection(forumBodyInputEl));
  forumBodyInputEl.addEventListener("mouseup", () => saveForumSelection(forumBodyInputEl));

  let attachedImageUrl = null;

  const preview = modal.querySelector("#forumAttachPreview");
  const previewImg = modal.querySelector("#forumAttachPreviewImg");
  const uploadStatus = modal.querySelector("#forumUploadStatus");
  const fileInput = modal.querySelector("#forumImageInput");

  modal.querySelector("#forumAttachImgBtn").onclick = () => fileInput.click();

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadStatus.textContent = "Uploading...";

    const formData = new FormData();
    formData.append("image", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload-image", true);
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        uploadStatus.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
      }
    };
    xhr.onload = () => {
      uploadStatus.textContent = "";
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        attachedImageUrl = window.location.origin + data.url;
        if (file.type.startsWith("image/")) {
          previewImg.src = attachedImageUrl;
          preview.style.display = "block";
        } else {
          preview.style.display = "none";
          showToast(`${file.name} attached`);
        }
      } else {
        showToast("❌ Upload failed");
      }
    };
    xhr.onerror = () => {
      uploadStatus.textContent = "";
      showToast("❌ Upload error");
    };
    xhr.send(formData);
    fileInput.value = "";
  });

  modal.querySelector("#forumAttachRemove").onclick = () => {
    attachedImageUrl = null;
    preview.style.display = "none";
  };

modal.querySelector("#forumEmoteBtn").onclick = (e) => {
  e.stopPropagation();
  openForumEmotePicker(modal.querySelector("#forumEmoteBtn"), (filename) => {
    insertEmoteImageIntoEditable(modal.querySelector("#forumBodyInput"), filename);
  });
};

  modal.querySelector("#cancelForumPost").onclick = () => modal.remove();
modal.querySelector("#submitForumPost").onclick = () => {
  const title = modal.querySelector("#forumTitleInput").value.trim();
  let body = getEditableText(modal.querySelector("#forumBodyInput")).trim();
  if (!title || (!body && !attachedImageUrl)) return;

  if (attachedImageUrl) {
    body = body ? `${body}\n${attachedImageUrl}` : attachedImageUrl;
  }

  socket.emit("createForumPost", { channel: channelId, title, body });
  modal.remove();
};
}

function openForumEmotePicker(anchorBtn, onSelect) {
  document.getElementById("forumEmotePickerPopup")?.remove();

  const popup = document.createElement("div");
  popup.id = "forumEmotePickerPopup";
  popup.style.cssText = `
    position: fixed;
    background: #111214;
    border: 1px solid #3a3c42;
    border-radius: 8px;
    padding: 8px;
    z-index: 30003;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    max-width: 280px;
    max-height: 240px;
    overflow-y: auto;
  `;

  const rect = anchorBtn.getBoundingClientRect();
  popup.style.left = rect.left + "px";
  popup.style.bottom = (window.innerHeight - rect.top + 8) + "px";

  if (pepeList.length === 0) {
    popup.innerHTML = `<div style="grid-column:1/-1; color:#72767d; font-size:12px; padding:8px;">No emotes available</div>`;
  } else {
    pepeList.forEach(filename => {
      const item = document.createElement("div");
      item.style.cssText = `
        aspect-ratio:1; border-radius:6px; background:#1e1f22;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; transition:background 0.15s;
      `;
      item.onmouseover = () => item.style.background = "#2a2c31";
      item.onmouseout = () => item.style.background = "#1e1f22";
      item.innerHTML = `<img src="/avatars/${filename}" style="width:80%; height:80%; object-fit:contain; pointer-events:none;">`;
      item.onclick = () => {
        onSelect(filename);
        popup.remove();
      };
      popup.appendChild(item);
    });
  }

  document.body.appendChild(popup);

  const closeHandler = (e) => {
    if (!popup.contains(e.target) && e.target !== anchorBtn) {
      popup.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}



let currentForumPosts = [];
function openCreateChannelModal(type = "text") {
  document.getElementById("createChannelModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "createChannelModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:20000;";
  
  const typeLabel = type === "voice" ? "Voice" : type === "forum" ? "Forum" : "Text";
  
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:28px 32px; width:380px; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;">
      <h3 style="margin:0 0 6px; color:#fff; font-size:18px;">Create ${typeLabel} Channel</h3>
      <p style="margin:0 0 20px; color:#b9bbbe; font-size:13px;">Lowercase letters, numbers, hyphens and underscores only.</p>
      <input id="newChannelNameInput" type="text" placeholder="${type === "voice" ? "lounge" : type === "forum" ? "discussions" : "new-channel"}" maxlength="32"
        style="width:100%; padding:10px 14px; background:#40444b; border:1px solid #40444b; border-radius:8px; color:#fff; font-size:15px; box-sizing:border-box; outline:none; transition:border-color 0.2s;">
      
      ${type === "voice" ? `
      <label style="display:flex; align-items:center; gap:8px; margin-top:14px; color:#b9bbbe; font-size:13px; cursor:pointer;">
        <input id="newChannelEmbedCheckbox" type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:#FF0000;">
        Embed Voice Channel (opens the embedded Jitsi window instead of joining via voice controls)
      </label>` : ``}
      
      ${type === "forum" ? `
      <label style="display:flex; align-items:center; gap:8px; margin-top:14px; color:#b9bbbe; font-size:13px; cursor:pointer;">
        <input id="newChannelSlowModeCheckbox" type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:#FF0000;">
        Enable Slow Mode (rate limit posts)
      </label>` : ``}
      
      <p id="createChannelError" style="color:#ff3333; font-size:13px; min-height:18px; margin:8px 0 0;"></p>
      <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
        <button id="cancelCreateChannel" style="background:#40444b; border:none; color:#fff; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:14px;">Cancel</button>
        <button id="confirmCreateChannel" style="background:#FF0000; border:none; color:#fff; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">Create</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  const input = modal.querySelector("#newChannelNameInput");
  const embedCheckbox = modal.querySelector("#newChannelEmbedCheckbox");
  const slowModeCheckbox = modal.querySelector("#newChannelSlowModeCheckbox");
  const errEl = modal.querySelector("#createChannelError");
  
  input.focus();
  input.addEventListener("focus", () => input.style.borderColor = "#FF0000");
  input.addEventListener("blur", () => input.style.borderColor = "#40444b");
  
const submit = () => {
    const name = input.value.trim();
    if (!name) { errEl.textContent = "Channel name cannot be empty."; return; }
    socket.emit("createChannel", { name, type });
  };
  
  modal.querySelector("#confirmCreateChannel").onclick = submit;
  modal.querySelector("#cancelCreateChannel").onclick = () => modal.remove();
  input.addEventListener("keydown", (e) => { 
    if (e.key === "Enter") submit(); 
    if (e.key === "Escape") modal.remove(); 
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  
  const onError = (data) => { 
    errEl.textContent = data.msg; 
    socket.off("channelError", onError); 
  };
  socket.on("channelError", onError);
}


function renderForumView(channelId) {
  messagesDiv.innerHTML = `
    <div id="forumView" style="padding: 16px; height: 100%; overflow-y: auto;">
      <button id="newForumPostBtn" style="
        background:#FF0000; border:none; color:#fff; padding:10px 16px;
        border-radius:8px; cursor:pointer; font-weight:600; margin-bottom:16px;
      ">+ New Post</button>
      <div id="forumPostList"></div>
    </div>
  `;
  document.getElementById("newForumPostBtn").onclick = () => openNewForumPostModal(channelId);
}




function openForumPost(post) {
  forumPostAuthors.set(post.id, post.userId);
  forumHoverSuppressedUntil = Date.now() + 500;
  window._currentForumPostId = post.id;

  const postMap = forumUnseenPosts.get(currentChannel);
  const hasUnseenInThisPost = postMap?.get(post.id)?.size > 0;
  markReadBtn.style.display = hasUnseenInThisPost ? 'block' : 'none';
  messagesDiv.innerHTML = `
    <div style="padding:12px; display:flex; align-items:center; gap:10px;">
      <button id="backToForumList" style="background:none;border:none;color:#b9bbbe;font-size:20px;cursor:pointer;">‹</button>
      <h3 style="color:#fff; margin:0;">${escapeHtml(post.title)}</h3>
    </div>
    <div id="forumPostBody" style="padding:0 12px 12px; color:#dcddde;"></div>
    <div id="forumThreadMessages" style="padding:0 12px;"></div>
    <div style="padding:12px;">
    <div id="forumReplyInput" contenteditable="true" data-placeholder="Reply..." style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.9);color:#fff;border:1px solid #3a3c42;border-radius:8px;padding:10px;min-height:60px;max-height:200px;overflow-y:auto;outline:none;"></div>

      <div id="forumReplyAttachPreview" style="display:none; margin-top:8px; position:relative; width:fit-content;">
        <img id="forumReplyAttachPreviewImg" style="max-width:120px; max-height:120px; border-radius:6px; display:block;">
        <button id="forumReplyAttachRemove" style="position:absolute; top:-6px; right:-6px; background:#e11d1d; border:none; color:#fff; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:12px; line-height:1;">✕</button>
      </div>

      <div class="input-wrapper" style="padding:0; background:transparent; border-top:none; gap:8px; margin-top:8px;">
        <button id="forumReplyAttachImgBtn" type="button" class="input-icon-btn" title="Attach image">✚</button>
        <button id="forumReplyEmoteBtn" type="button" class="input-icon-btn" title="Emote Menu" style="font-size: 21px; padding: 0 8px;">☹</button>
        <input type="file" id="forumReplyImageInput" accept="image/*,video/*,audio/*,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json" style="display:none;">
        <span id="forumReplyUploadStatus" style="font-size:12px; color:#72767d; margin-left:auto;"></span>
        <button id="forumReplySend" style="background:#FF0000; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  const bodyContainer = document.getElementById("forumPostBody");
  if (bodyContainer && post.body) {
    bodyContainer.appendChild(parseContent(post.body, post.lastActivity || Date.now()));
  }

  const forumReplyInputEl = document.getElementById("forumReplyInput");
  forumReplyInputEl.addEventListener("keyup", () => saveForumSelection(forumReplyInputEl));
  forumReplyInputEl.addEventListener("mouseup", () => saveForumSelection(forumReplyInputEl));

  document.getElementById("backToForumList").onclick = () => {
  window._currentForumPostId = null;
  markReadBtn.style.display = (unreadCounts.get(currentChannel) || 0) > 0 ? 'block' : 'none';
  renderForumView(currentChannel) || socket.emit("getForumPosts", { channel: currentChannel });
};

  let replyAttachedImageUrl = null;
  const replyPreview = document.getElementById("forumReplyAttachPreview");
  const replyPreviewImg = document.getElementById("forumReplyAttachPreviewImg");
  const replyUploadStatus = document.getElementById("forumReplyUploadStatus");
  const replyFileInput = document.getElementById("forumReplyImageInput");

  document.getElementById("forumReplyAttachImgBtn").onclick = () => replyFileInput.click();

  replyFileInput.addEventListener("change", () => {
  const file = replyFileInput.files[0];
  if (!file) return;

  replyUploadStatus.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("image", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-image", true);
  xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      replyUploadStatus.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
    }
  };
  xhr.onload = () => {
    replyUploadStatus.textContent = "";
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      replyAttachedImageUrl = window.location.origin + data.url;
      if (file.type.startsWith("image/")) {
        replyPreviewImg.src = replyAttachedImageUrl;
        replyPreview.style.display = "block";
      } else {
        replyPreview.style.display = "none";
        showToast(`${file.name} attached`);
      }
    } else {
      showToast("❌ Upload failed");
    }
  };
  xhr.onerror = () => {
    replyUploadStatus.textContent = "";
    showToast("❌ Upload error");
  };
  xhr.send(formData);
  replyFileInput.value = "";
});




  document.getElementById("forumReplyAttachRemove").onclick = () => {
    replyAttachedImageUrl = null;
    replyPreview.style.display = "none";
  };

document.getElementById("forumReplyEmoteBtn").onclick = (e) => {
  e.stopPropagation();
  openForumEmotePicker(document.getElementById("forumReplyEmoteBtn"), (filename) => {
    insertEmoteImageIntoEditable(document.getElementById("forumReplyInput"), filename);
  });
};

document.getElementById("forumReplySend").onclick = () => {
  const input = document.getElementById("forumReplyInput");
  let text = getEditableText(input).trim();
  if (!text && !replyAttachedImageUrl) return;

  if (replyAttachedImageUrl) {
    text = text ? `${text}\n${replyAttachedImageUrl}` : replyAttachedImageUrl;
  }

  socket.emit("forumReply", { postId: post.id, text });
  input.innerHTML = "";
  replyAttachedImageUrl = null;
  replyPreview.style.display = "none";
};

  socket.emit("joinForumPost", { postId: post.id });
  window._currentForumPostId = post.id;
}