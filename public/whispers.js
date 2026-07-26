
let whisperConversations = new Map();
let activeWhisperKey = null;
let whispersModalOpen = false;

function convoKeyForDM(userId) { return userId; }
function convoKeyForGroup(groupId) { return `g:${groupId}`; }

const whispersLauncherBtn = document.createElement('button');
whispersLauncherBtn.id = 'whispersLauncherBtn';
whispersLauncherBtn.innerHTML = '💬';
whispersLauncherBtn.title = 'Whispers';
whispersLauncherBtn.style.cssText = `
  position: relative;
  background: #1a1a1c;
  color: #f8f2f2;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  transition: background 0.15s, transform 0.1s;
`;


whispersLauncherBtn.onmouseover = () => {
  whispersLauncherBtn.style.background = '#FF0000';
  whispersLauncherBtn.style.transform = 'translateY(-1px)';
};
whispersLauncherBtn.onmouseout = () => {
  whispersLauncherBtn.style.background = '#1a1a1c';
  whispersLauncherBtn.style.transform = 'translateY(0)';
};

const whispersLauncherBadge = document.createElement('span');
whispersLauncherBadge.id = 'whispersLauncherBadge';
whispersLauncherBtn.className = 'sidebar-icon-btn';
whispersLauncherBadge.style.cssText = `
  position: absolute; 
  top: -5px;         
  right: -5px;       
  background: #FF0000;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  border-radius: 10px;
  padding: 1px 6px;
  line-height: 1.4;
  min-width: 16px;   
  text-align: center;
  display: none;     
  pointer-events: none; 
  z-index: 10;
`;
whispersLauncherBtn.appendChild(whispersLauncherBadge);
whispersLauncherBtn.onclick = () => toggleWhispersModal();
const actionsContainer = document.querySelector(".sidebar-actions");
if (actionsContainer) {
  actionsContainer.appendChild(whispersLauncherBtn);
} else {

  document.body.appendChild(whispersLauncherBtn);
}

function updateWhispersLauncherBadge() {
  let total = 0;
  whisperConversations.forEach(c => total += (c.unread || 0));
  whispersLauncherBadge.style.display = total > 0 ? 'inline-block' : 'none';
  whispersLauncherBadge.textContent = total > 99 ? '99+' : String(total);
}


function updateWhisperInputVisibility() {
  const toolbar = document.getElementById('whisperToolbar');
  const inputRow = document.getElementById('whisperInputRow');
  const hasConvo = !!activeWhisperKey;
  if (toolbar) toolbar.style.display = hasConvo ? 'flex' : 'none';
  if (inputRow) inputRow.style.display = hasConvo ? 'flex' : 'none';
}


let whispersModal = null;
let whispersBox = null;

function buildWhispersModal() {
  if (whispersModal) return;

  whispersModal = document.createElement('div');
  whispersModal.id = 'whispersModal';
  whispersModal.style.cssText = `position: fixed; inset: 0; z-index: 20500; pointer-events: none; display: none;`;

  whispersBox = document.createElement('div');
  whispersBox.id = 'whispersBox';
  whispersBox.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(760px, 92vw); height: min(540px, 82vh);
    min-width: 460px; min-height: 340px;
    background: rgba(0, 0, 0, 0.875); border-radius: 12px; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    border: 1px solid #3a3c42;
    pointer-events: auto;
  `;
  whispersBox.addEventListener('mousedown', () => {
    whispersBox.style.zIndex = String(20600 + Date.now() % 1000);
  });

  const header = document.createElement('div');
header.style.cssText = `
  display:flex; align-items:center; justify-content:space-between;
  padding: 10px 14px; border-bottom: 1px solid #3a3c42; flex-shrink:0;
  cursor: move; user-select: none; background: rgba(0, 0, 0, 0.875);
`;
  const headerTitle = document.createElement('span');
  headerTitle.textContent = '💬 Whispers';
  headerTitle.style.cssText = 'color:#fff; font-weight:700; font-size:14px;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none; border:none; color:#72767d; font-size:18px; cursor:pointer;';
  closeBtn.onclick = () => closeWhispersModal();
  header.appendChild(headerTitle);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1; display:flex; min-height:0;';
  const listPane = document.createElement('div');
  listPane.id = 'whisperListPane';
listPane.style.cssText = `
  width: 230px; flex-shrink:0; border-right: 1px solid #3a3c42;
  display:flex; flex-direction:column; background: rgba(0, 0, 0, 0.875);
`;

  const newGroupBtn = document.createElement('button');
  newGroupBtn.textContent = '＋ New Group';
  newGroupBtn.style.cssText = `
  margin: 8px; padding: 7px 10px; background: rgba(0, 0, 0, 0.6); border:1px solid #3a3c42;
  border-radius:6px; color:#b9bbbe; font-size:12px; cursor:pointer; transition: background 0.15s, color 0.15s;
`;
newGroupBtn.onmouseover = () => { newGroupBtn.style.background = '#FF0000'; newGroupBtn.style.color = '#fff'; };
newGroupBtn.onmouseout = () => { newGroupBtn.style.background = 'rgba(0, 0, 0, 0.6)'; newGroupBtn.style.color = '#b9bbbe'; };
  newGroupBtn.onclick = () => openNewGroupModal();
  listPane.appendChild(newGroupBtn);

  const listScroll = document.createElement('div');
  listScroll.id = 'whisperConvoList';
  listScroll.style.cssText = 'flex:1; overflow-y:auto; padding:0 6px 6px;';
  listPane.appendChild(listScroll);
  const threadPane = document.createElement('div');
  threadPane.id = 'whisperThreadPane';
  threadPane.style.cssText = 'flex:1; display:flex; flex-direction:column; min-width:0;';

  const threadHeader = document.createElement('div');
  threadHeader.id = 'whisperThreadHeader';
  threadHeader.style.cssText = `
    padding:10px 14px; border-bottom:1px solid #3a3c42; flex-shrink:0;
    display:flex; align-items:center; gap:8px; color:#b9bbbe; font-size:13px;
  `;
  threadHeader.textContent = 'Select a conversation';

  const threadMessages = document.createElement('div');
  threadMessages.id = 'whisperThreadMessages';
  threadMessages.style.cssText = 'flex:1; overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:8px;';

  const threadInputWrap = document.createElement('div');
  threadInputWrap.style.cssText = 'padding:8px 10px; border-top:1px solid #3a3c42; flex-shrink:0; display:flex; flex-direction:column; gap:6px;';


const toolbar = document.createElement('div');
toolbar.id = 'whisperToolbar';
toolbar.style.cssText = 'display:none; gap:4px;';

function toolbarBtn(icon, title) {
  const btn = document.createElement('button');
  btn.textContent = icon;
  btn.title = title;
  btn.type = 'button';
  btn.className = 'input-icon-btn';
  btn.style.cssText = `
    font-size: 21px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 8px;
    color: #b9bbbe;
    transition: color 0.15s;
  `;
  btn.onmouseover = () => btn.style.color = '#FF0000';
  btn.onmouseout = () => btn.style.color = '#b9bbbe';
  return btn;
}

const whisperEmojiBtn = toolbarBtn('☠', 'Emoji');
const whisperEmoteBtn = toolbarBtn('☹', 'Emotes');
const whisperGifBtn = toolbarBtn('〠', 'GIF');

toolbar.appendChild(whisperEmojiBtn);
toolbar.appendChild(whisperEmoteBtn);
toolbar.appendChild(whisperGifBtn);

const inputRow = document.createElement('div');
inputRow.id = 'whisperInputRow';
inputRow.style.cssText = 'display:none; gap:8px;';

const threadInput = document.createElement('input');
threadInput.id = 'whisperThreadInput';
threadInput.type = 'text';
threadInput.placeholder = 'Select a conversation.....';
threadInput.disabled = true;
threadInput.style.cssText = `
  flex:1; box-sizing:border-box; padding:8px 10px; background:#1e1f22;
  border:1px solid #3a3c42; border-radius:6px; color:#fff; font-size:13px; outline:none;
`;
threadInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && threadInput.value.trim() && activeWhisperKey) {
    sendWhisper(activeWhisperKey, threadInput.value.trim());
    threadInput.value = '';
  }
});

const sendBtn = document.createElement('button');
sendBtn.textContent = 'Send';
sendBtn.style.cssText = `
  background:#FF0000; border:none; color:#fff; padding:8px 14px;
  border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; flex-shrink:0;
`;
sendBtn.onclick = () => {
  if (threadInput.value.trim() && activeWhisperKey) {
    sendWhisper(activeWhisperKey, threadInput.value.trim());
    threadInput.value = '';
  }
};

inputRow.appendChild(threadInput);
inputRow.appendChild(sendBtn);
threadInputWrap.appendChild(toolbar);
threadInputWrap.appendChild(inputRow);






  threadPane.appendChild(threadHeader);
  threadPane.appendChild(threadMessages);
  threadPane.appendChild(threadInputWrap);

  body.appendChild(listPane);
  body.appendChild(threadPane);

  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `
    position: absolute; bottom: 0; right: 0;
    width: 18px; height: 18px; cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, #4a4d54 50%);
    border-bottom-right-radius: 12px;
    z-index: 5;
  `;

  whispersBox.appendChild(header);
  whispersBox.appendChild(body);
  whispersBox.appendChild(resizeHandle);
  whispersModal.appendChild(whispersBox);
  document.body.appendChild(whispersModal);

  makeDraggableAndResizable(whispersBox, header, resizeHandle);
  wireWhisperEmojiPicker(whisperEmojiBtn, threadInput);
  wireWhisperEmotePicker(whisperEmoteBtn);
  wireWhisperGifPicker(whisperGifBtn);
}


function getLastReadTime(key) {
  try { return parseInt(localStorage.getItem(`whisper_read_${key}`) || '0', 10); }
  catch { return 0; }
}
function setLastReadTime(key, time) {
  try { localStorage.setItem(`whisper_read_${key}`, String(time)); }
  catch {}
}


function markWhisperConvoRead(key) {
  const convo = whisperConversations.get(key);
  if (!convo) return;
  const last = convo.messages[convo.messages.length - 1];
  if (last) setLastReadTime(key, last.time);
  convo.unread = 0;
}

function toggleWhispersModal() {
  buildWhispersModal();
  updateWhisperInputVisibility();
  if (whispersModalOpen) {
    closeWhispersModal();
  } else {
    whispersModal.style.display = 'block';
    whispersModalOpen = true;
    renderWhisperConvoList();
    renderWhisperThread(activeWhisperKey); 
  }
}

function closeWhispersModal() {
  if (whispersModal) whispersModal.style.display = 'none';
  whispersModalOpen = false;
}


function getOrCreateWhisperConvo(key, meta = {}) {
  if (!whisperConversations.has(key)) {
    whisperConversations.set(key, {
      key,
      isGroup: !!meta.isGroup,
      userId: meta.isGroup ? undefined : (meta.userId ?? key),
      groupId: meta.isGroup ? meta.groupId : undefined,
      name: meta.name || meta.username || 'Unknown',
      avatar: meta.avatar || '/avatars/default1.png',
      usernameColor: meta.usernameColor || 'username-cyan',
      members: meta.members || null,
      messages: [],
      unread: 0
    });
  } else {
    const convo = whisperConversations.get(key);
    if (meta.name) convo.name = meta.name;
    if (meta.avatar) convo.avatar = meta.avatar;
    if (meta.usernameColor) convo.usernameColor = meta.usernameColor;
    if (meta.members) convo.members = meta.members;
  }
  return whisperConversations.get(key);
}

function openWhisperWith(userData) {
  if (!userData || !userData.id) return;
  getOrCreateWhisperConvo(userData.id, {
    isGroup: false,
    userId: userData.id,
    name: userData.username,
    avatar: userData.avatar,
    usernameColor: userData.usernameColor
  });
  buildWhispersModal();
  whispersModal.style.display = 'block';
  whispersModalOpen = true;
  setActiveWhisperConvo(userData.id);
}

function setActiveWhisperConvo(key) {
  activeWhisperKey = key;
  const convo = whisperConversations.get(key);
  if (convo) markWhisperConvoRead(key);  
  updateWhispersLauncherBadge();
  renderWhisperConvoList();
  renderWhisperThread(key);
  updateWhisperInputVisibility();
}

async function sendWhisper(key, text) {
  if (!socket || !socket.connected || !text) return;
  const convo = whisperConversations.get(key);
  if (!convo) return;

  let messageText = text;
  let isEncrypted = false;
  let encPayload = null;
  if (activeEncryptionKey) {
    encPayload = await encryptText(text);
    isEncrypted = true;
    messageText = "[Encrypted message]";
  }

  socket.emit('whisperSend', convo.isGroup
    ? { groupId: convo.groupId, text: messageText, encrypted: isEncrypted, encPayload }
    : { to: convo.userId, text: messageText, encrypted: isEncrypted, encPayload });
}


function openNewGroupModal() {
  document.getElementById('whisperGroupModal')?.remove();

  const others = (typeof currentUsers !== 'undefined' ? currentUsers : [])
    .filter(u => u && u.id && u.id !== user.id);

  const modal = document.createElement('div');
  modal.id = 'whisperGroupModal';
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.75);
    display:flex; align-items:center; justify-content:center; z-index:20700;
  `;

  modal.innerHTML = `
    <div id="whisperGroupCard" style="
      background: rgba(0, 0, 0, 0.9); border-radius:14px; width:380px; max-height:78vh;
      display:flex; flex-direction:column; overflow:hidden;
      box-shadow:0 24px 70px rgba(0,0,0,0.65); border:1px solid #3a3c42;
    ">
      <div style="padding:20px 22px 14px; border-bottom:1px solid #3a3c42; flex-shrink:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <h3 style="margin:0; color:#fff; font-size:17px; display:flex; align-items:center; gap:8px;">
            <span style="font-size:19px;">👥</span> New Group
          </h3>
          <button id="whisperGroupClose" style="
            background:none; border:none; color:#72767d; font-size:20px;
            cursor:pointer; line-height:1; padding:2px; transition:color 0.15s;
          ">✕</button>
        </div>

        <input id="whisperGroupName" type="text" placeholder="Group name" maxlength="40"
          style="
            width:100%; box-sizing:border-box; padding:10px 12px;
            background:#1e1f22; border:1px solid #3a3c42; border-radius:8px;
            color:#fff; font-size:14px; outline:none; transition:border-color 0.15s;
            margin-bottom:10px;
          ">

        <input id="whisperGroupMemberSearch" type="text" placeholder="Search members..."
          style="
            width:100%; box-sizing:border-box; padding:8px 12px;
            background:#1e1f22; border:1px solid #3a3c42; border-radius:8px;
            color:#fff; font-size:13px; outline:none; transition:border-color 0.15s;
          ">
      </div>

      <div style="
        padding:10px 22px 4px; display:flex; align-items:center; justify-content:space-between;
        flex-shrink:0;
      ">
        <span style="font-size:11px; color:#72767d; text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">
          Members
        </span>
        <span id="whisperGroupSelectedCount" style="
          font-size:11px; color:#FF0000; font-weight:700;
          background:rgba(255,0,0,0.12); border:1px solid rgba(255,0,0,0.35);
          padding:2px 9px; border-radius:10px;
        ">0 selected</span>
      </div>

      <div id="whisperGroupMemberList" class="dark-scrollbar" style="
        flex:1; overflow-y:auto; padding:8px 14px 14px; min-height:120px;
      "></div>

      <div id="whisperGroupError" style="
        color:#ff5555; font-size:12px; min-height:16px; padding:0 22px;
      "></div>

      <div style="
        display:flex; gap:10px; justify-content:flex-end;
        padding:16px 22px; border-top:1px solid #3a3c42; flex-shrink:0; background: rgba(0, 0, 0, 0.7);
      ">
        <button id="whisperGroupCancel" style="
          background:#1e1f22; border:1px solid #3a3c42; color:#b9bbbe; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.15s;
        ">Cancel</button>
        <button id="whisperGroupCreate" style="
          background:#FF0000; border:none; color:#fff; padding:9px 20px;
          border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;
          transition:background 0.15s; box-shadow:0 2px 10px rgba(255,0,0,0.3);
        ">Create Group</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  if (!document.getElementById("darkScrollbarStyle")) {
    const style = document.createElement("style");
    style.id = "darkScrollbarStyle";
    style.textContent = `
      .dark-scrollbar { scrollbar-width: thin; scrollbar-color: #3a3c42 #1e1f22; }
      .dark-scrollbar::-webkit-scrollbar { width: 8px; }
      .dark-scrollbar::-webkit-scrollbar-track { background: #1e1f22; border-radius: 8px; }
      .dark-scrollbar::-webkit-scrollbar-thumb { background: #3a3c42; border-radius: 8px; border: 2px solid #1e1f22; }
      .dark-scrollbar::-webkit-scrollbar-thumb:hover { background: #4a4d54; }
    `;
    document.head.appendChild(style);
  }

  const nameInput = modal.querySelector('#whisperGroupName');
  const memberSearch = modal.querySelector('#whisperGroupMemberSearch');
  const memberList = modal.querySelector('#whisperGroupMemberList');
  const selectedCountEl = modal.querySelector('#whisperGroupSelectedCount');
  const errEl = modal.querySelector('#whisperGroupError');
  const closeBtn = modal.querySelector('#whisperGroupClose');
  const cancelBtn = modal.querySelector('#whisperGroupCancel');
  const createBtn = modal.querySelector('#whisperGroupCreate');

  [nameInput, memberSearch].forEach(inp => {
    inp.onfocus = () => inp.style.borderColor = '#FF0000';
    inp.onblur = () => inp.style.borderColor = '#3a3c42';
  });

  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  cancelBtn.onmouseover = () => { cancelBtn.style.background = '#26282c'; cancelBtn.style.color = '#fff'; };
  cancelBtn.onmouseout = () => { cancelBtn.style.background = '#1e1f22'; cancelBtn.style.color = '#b9bbbe'; };
  createBtn.onmouseover = () => createBtn.style.background = '#cc0000';
  createBtn.onmouseout = () => createBtn.style.background = '#FF0000';

  const selected = new Set();

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selected.size} selected`;
    selectedCountEl.style.color = selected.size > 0 ? '#fff' : '#FF0000';
    selectedCountEl.style.background = selected.size > 0 ? 'rgba(255,0,0,0.85)' : 'rgba(255,0,0,0.12)';
    selectedCountEl.style.borderColor = selected.size > 0 ? '#FF0000' : 'rgba(255,0,0,0.35)';
  }

  function buildMemberRow(u) {
    const row = document.createElement('div');
    row.dataset.username = u.username.toLowerCase();
    row.style.cssText = `
      display:flex; align-items:center; gap:10px; padding:8px 10px;
      cursor:pointer; border-radius:8px; margin-bottom:3px;
      border:1px solid transparent; transition:background 0.12s, border-color 0.12s;
      user-select:none;
    `;

    const isSelected = () => selected.has(u.id);

    const applyRowState = () => {
      if (isSelected()) {
        row.style.background = 'rgba(255,0,0,0.12)';
        row.style.borderColor = 'rgba(255,0,0,0.4)';
      } else {
        row.style.background = 'transparent';
        row.style.borderColor = 'transparent';
      }
    };

    row.onmouseover = () => { if (!isSelected()) row.style.background = 'rgba(255,255,255,0.05)'; };
    row.onmouseout = () => { if (!isSelected()) row.style.background = 'transparent'; };

    const checkWrap = document.createElement('div');
    checkWrap.style.cssText = `
      width:18px; height:18px; border-radius:5px; flex-shrink:0;
      border:2px solid #4a4d54; display:flex; align-items:center; justify-content:center;
      transition:all 0.15s; background:#1e1f22;
    `;
    const checkMark = document.createElement('span');
    checkMark.textContent = '✓';
    checkMark.style.cssText = `
      color:#fff; font-size:12px; font-weight:900; line-height:1;
      opacity:0; transform:scale(0.5); transition:all 0.15s;
    `;
    checkWrap.appendChild(checkMark);

    function refreshCheckVisual() {
      if (isSelected()) {
        checkWrap.style.background = '#FF0000';
        checkWrap.style.borderColor = '#FF0000';
        checkMark.style.opacity = '1';
        checkMark.style.transform = 'scale(1)';
      } else {
        checkWrap.style.background = '#1e1f22';
        checkWrap.style.borderColor = '#4a4d54';
        checkMark.style.opacity = '0';
        checkMark.style.transform = 'scale(0.5)';
      }
    }

    row.onclick = () => {
      if (isSelected()) selected.delete(u.id);
      else selected.add(u.id);
      refreshCheckVisual();
      applyRowState();
      updateSelectedCount();
    };

    const img = document.createElement('img');
    img.src = sanitizeAvatar(u.avatar);
    img.style.cssText = 'width:32px; height:32px; border-radius:50%; flex-shrink:0; object-fit:cover;';

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:1px;';

    const nameSpan = document.createElement('span');
    nameSpan.className = `username-wrapper ${u.usernameColor || 'username-cyan'}`;
    nameSpan.style.cssText = 'font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    nameSpan.textContent = u.username;

    const statusSpan = document.createElement('span');
    const status = u.status || 'online';
    statusSpan.style.cssText = `font-size:11px; color:${status === 'online' ? '#23a559' : '#72767d'};`;
    statusSpan.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    textCol.appendChild(nameSpan);
    textCol.appendChild(statusSpan);

    row.appendChild(checkWrap);
    row.appendChild(img);
    row.appendChild(textCol);

    return row;
  }

  if (others.length === 0) {
    memberList.innerHTML = `
      <div style="color:#72767d; font-size:13px; text-align:center; padding:30px 10px;">
        No other users online right now.
      </div>`;
  } else {
    others.forEach(u => memberList.appendChild(buildMemberRow(u)));
  }

  memberSearch.oninput = () => {
    const q = memberSearch.value.trim().toLowerCase();
    memberList.querySelectorAll('[data-username]').forEach(row => {
      row.style.display = row.dataset.username.includes(q) ? 'flex' : 'none';
    });
  };

  updateSelectedCount();

  const closeModal = () => modal.remove();
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
  });

  createBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (selected.size < 2) {
      errEl.textContent = 'Pick at least 2 other members.';
      return;
    }
    socket.emit('whisperGroupCreate', { name, memberIds: [...selected] });
    closeModal();
  };

  nameInput.focus();
}

socket.on('whisperGroupCreated', (group) => {
  const key = convoKeyForGroup(group.groupId);
  const convo = getOrCreateWhisperConvo(key, {
    isGroup: true,
    groupId: group.groupId,
    name: group.name,
    members: group.members
  });

  if (Array.isArray(group.messages)) {
    convo.messages = group.messages.map(m => ({ ...m, outgoing: m.from === user.id }));
  }

  updateWhispersLauncherBadge();
  if (whispersModalOpen) renderWhisperConvoList();
  showToast(`Added to group "${group.name}"`);
});


socket.on('whisperGroupUpdated', (data) => {
  const key = convoKeyForGroup(data.groupId);
  const convo = whisperConversations.get(key);
  if (!convo) return;

  convo.members = data.members;
  if (data.name) convo.name = data.name;

  if (data.addedUserIds) {
    showToast(`${data.addedBy} added ${data.addedUserIds.length} member(s) to "${convo.name}"`);
  } else if (data.leftUsername) {
    showToast(`${data.leftUsername} left "${convo.name}"`);
  }

  if (whispersModalOpen) {
    renderWhisperConvoList();
    if (activeWhisperKey === key) renderWhisperThread(key);
  }
});

socket.on('whisperGroupLeft', (data) => {
  const key = convoKeyForGroup(data.groupId);
  whisperConversations.delete(key);
  if (activeWhisperKey === key) activeWhisperKey = null;
  updateWhispersLauncherBadge();
  if (whispersModalOpen) {
    renderWhisperConvoList();
    renderWhisperThread(activeWhisperKey);
  }
});




socket.on('whisperMessage', (data) => {
  const isGroup = !!data.groupId;
  const key = isGroup ? convoKeyForGroup(data.groupId) : (data.from === user.id ? data.to : data.from);
  const isIncoming = data.from !== user.id;

  const convo = getOrCreateWhisperConvo(key, isGroup
    ? { isGroup: true, groupId: data.groupId }
    : {
        isGroup: false,
        userId: key,
        name: isIncoming ? data.fromUsername : undefined,
        avatar: isIncoming ? data.fromAvatar : undefined,
        usernameColor: isIncoming ? data.fromUsernameColor : undefined
      });

  const alreadyHave = convo.messages.some(m =>
    (data.id && m.id === data.id) ||
    (!data.id && m.text === data.text && m.time === data.time && m.from === data.from)
  );
  if (!alreadyHave) {
    convo.messages.push({ ...data, outgoing: data.from === user.id });
  }

  if (isIncoming) {
    const isViewingThisConvo = whispersModalOpen && activeWhisperKey === key;

    if (!isViewingThisConvo) {
      convo.unread = (convo.unread || 0) + 1;

      if (notifSettings?.browser && Notification.permission === 'granted') {
        sendNotification(
          isGroup ? `${data.fromUsername} in ${convo.name}` : `Whisper from ${data.fromUsername}`,
          data.text?.substring(0, 100) || 'New whisper',
          { icon: sanitizeAvatar(data.fromAvatar), tag: `whisper-${key}`, requireInteraction: false }
        );
      }

      if (notifSettings?.sound) {
        const audio = new Audio('/avatars/message-new-email.oga');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      }

      showWhisperNotificationBanner(data, key, convo);
    }
     else {
      setLastReadTime(key, data.time); 
    }
  }

  updateWhispersLauncherBadge();
  renderWhisperConvoList();
  if (whispersModalOpen && activeWhisperKey === key) {
    renderWhisperThread(key);
  }
});


socket.on('whisperHistory', (data) => {
  (data?.conversations || []).forEach(c => {
    const isGroup = c.type === 'group';
    const key = isGroup ? convoKeyForGroup(c.groupId) : c.userId;
    const convo = getOrCreateWhisperConvo(key, isGroup
      ? { isGroup: true, groupId: c.groupId, name: c.name, members: c.members }
      : { isGroup: false, userId: c.userId, name: c.username, avatar: c.avatar, usernameColor: c.usernameColor });

    convo.messages = (c.messages || []).map(m => ({ ...m, outgoing: m.from === user.id }));

    const lastRead = getLastReadTime(key);
    convo.unread = convo.messages.filter(m => !m.outgoing && m.time > lastRead).length;
  });
  updateWhispersLauncherBadge();
  if (whispersModalOpen) renderWhisperConvoList();
});


function renderWhisperConvoList() {
  const list = document.getElementById('whisperConvoList');
  if (!list) return;
  list.innerHTML = '';

  const convos = [...whisperConversations.values()].sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.time || 0;
    const bLast = b.messages[b.messages.length - 1]?.time || 0;
    return bLast - aLast;
  });

  if (convos.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#72767d; font-size:12px; padding:12px 8px; text-align:center;';
    empty.textContent = 'No whispers yet.';
    list.appendChild(empty);
    return;
  }

  convos.forEach(convo => {
    const row = document.createElement('div');
    row.style.cssText = `
      display:flex; align-items:center; gap:8px; padding:8px; border-radius:8px;
      cursor:pointer; margin-bottom:2px; transition:background 0.12s;
      background: ${convo.key === activeWhisperKey ? 'rgba(255,0,0,0.15)' : 'transparent'};
      border-left: 3px solid ${convo.key === activeWhisperKey ? '#FF0000' : 'transparent'};
    `;
    row.onmouseover = () => { if (convo.key !== activeWhisperKey) row.style.background = 'rgba(255,255,255,0.05)'; };
    row.onmouseout = () => { if (convo.key !== activeWhisperKey) row.style.background = 'transparent'; };
    row.onclick = () => setActiveWhisperConvo(convo.key);

    let avatarEl;
    if (convo.isGroup) {
      avatarEl = document.createElement('div');
      avatarEl.style.cssText = `
        width:32px; height:32px; border-radius:50%; flex-shrink:0;
        background:#2b2d31; display:flex; align-items:center; justify-content:center;
        font-size:15px; color:#b9bbbe;
      `;
      avatarEl.textContent = '👥';
    } else {
      avatarEl = document.createElement('img');
      avatarEl.src = sanitizeAvatar(convo.avatar);
      avatarEl.style.cssText = 'width:32px; height:32px; border-radius:50%; flex-shrink:0;';
    }

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:1px;';

    const nameSpan = document.createElement('span');
    if (!convo.isGroup) nameSpan.className = `username-wrapper ${convo.usernameColor || 'username-cyan'}`;
    nameSpan.style.cssText = 'font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    nameSpan.textContent = convo.name;
    const lastMsg = convo.messages[convo.messages.length - 1];
    const preview = document.createElement('span');
    preview.style.cssText = 'font-size:11px; color:#72767d; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    const prefix = lastMsg ? (lastMsg.outgoing ? 'You: ' : (convo.isGroup ? `${lastMsg.fromUsername}: ` : '')) : '';

    if (!lastMsg) {
      preview.textContent = 'No messages yet';
    } else if (lastMsg.encrypted && lastMsg.encPayload) {
      preview.textContent = prefix + '🔒 Encrypted message';
    } else {
      preview.textContent = prefix + (lastMsg.text || '');
    }

    textCol.appendChild(nameSpan);
    textCol.appendChild(preview);

    row.appendChild(avatarEl);
    row.appendChild(textCol);

    if (convo.unread > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = `background:#FF0000; color:#fff; font-size:10px; font-weight:800; border-radius:10px; padding:2px 6px; flex-shrink:0;`;
      badge.textContent = convo.unread > 99 ? '99+' : String(convo.unread);
      row.appendChild(badge);
    }

    list.appendChild(row);
  });
}



function openAddMembersModal(groupId) {
  const key = convoKeyForGroup(groupId);
  const convo = whisperConversations.get(key);
  if (!convo) return;

  document.getElementById('whisperAddMembersModal')?.remove();

  const currentMemberIds = new Set((convo.members || []).map(m => m.userId));
  const others = (typeof currentUsers !== 'undefined' ? currentUsers : [])
    .filter(u => u && u.id && u.id !== user.id && !currentMemberIds.has(u.id));

  const modal = document.createElement('div');
  modal.id = 'whisperAddMembersModal';
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.75);
    display:flex; align-items:center; justify-content:center; z-index:20900;
  `;

  modal.innerHTML = `
    <div style="
      background:#2b2d31; border-radius:14px; width:380px; max-height:78vh;
      display:flex; flex-direction:column; overflow:hidden;
      box-shadow:0 24px 70px rgba(0,0,0,0.65); border:1px solid #3a3c42;
    ">
      <div style="padding:20px 22px 14px; border-bottom:1px solid #3a3c42; flex-shrink:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <h3 style="margin:0; color:#fff; font-size:17px; display:flex; align-items:center; gap:8px;">
            <span style="font-size:19px;">➕</span> Add to "${convo.name}"
          </h3>
          <button id="whisperAddClose" style="
            background:none; border:none; color:#72767d; font-size:20px;
            cursor:pointer; line-height:1; padding:2px; transition:color 0.15s;
          ">✕</button>
        </div>
        <input id="whisperAddSearch" type="text" placeholder="Search members..."
          style="
            width:100%; box-sizing:border-box; padding:8px 12px;
            background:#1e1f22; border:1px solid #3a3c42; border-radius:8px;
            color:#fff; font-size:13px; outline:none; transition:border-color 0.15s;
          ">
      </div>

      <div style="
        padding:10px 22px 4px; display:flex; align-items:center; justify-content:space-between;
        flex-shrink:0;
      ">
        <span style="font-size:11px; color:#72767d; text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">
          Add Members
        </span>
        <span id="whisperAddSelectedCount" style="
          font-size:11px; color:#FF0000; font-weight:700;
          background:rgba(255,0,0,0.12); border:1px solid rgba(255,0,0,0.35);
          padding:2px 9px; border-radius:10px;
        ">0 selected</span>
      </div>

      <div id="whisperAddMemberList" class="dark-scrollbar" style="
        flex:1; overflow-y:auto; padding:8px 14px 14px; min-height:120px;
      "></div>

      <div id="whisperAddError" style="color:#ff5555; font-size:12px; min-height:16px; padding:0 22px;"></div>

      <div style="
        display:flex; gap:10px; justify-content:flex-end;
        padding:16px 22px; border-top:1px solid #3a3c42; flex-shrink:0; background:#26282c;
      ">
        <button id="whisperAddCancel" style="
          background:#1e1f22; border:1px solid #3a3c42; color:#b9bbbe; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.15s;
        ">Cancel</button>
        <button id="whisperAddConfirm" style="
          background:#FF0000; border:none; color:#fff; padding:9px 20px;
          border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;
          transition:background 0.15s; box-shadow:0 2px 10px rgba(255,0,0,0.3);
        ">Add</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const searchInput = modal.querySelector('#whisperAddSearch');
  const memberList = modal.querySelector('#whisperAddMemberList');
  const selectedCountEl = modal.querySelector('#whisperAddSelectedCount');
  const errEl = modal.querySelector('#whisperAddError');
  const closeBtn = modal.querySelector('#whisperAddClose');
  const cancelBtn = modal.querySelector('#whisperAddCancel');
  const confirmBtn = modal.querySelector('#whisperAddConfirm');

  searchInput.onfocus = () => searchInput.style.borderColor = '#FF0000';
  searchInput.onblur = () => searchInput.style.borderColor = '#3a3c42';
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  cancelBtn.onmouseover = () => { cancelBtn.style.background = '#26282c'; cancelBtn.style.color = '#fff'; };
  cancelBtn.onmouseout = () => { cancelBtn.style.background = '#1e1f22'; cancelBtn.style.color = '#b9bbbe'; };
  confirmBtn.onmouseover = () => confirmBtn.style.background = '#cc0000';
  confirmBtn.onmouseout = () => confirmBtn.style.background = '#FF0000';

  const selected = new Set();

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selected.size} selected`;
    selectedCountEl.style.color = selected.size > 0 ? '#fff' : '#FF0000';
    selectedCountEl.style.background = selected.size > 0 ? 'rgba(255,0,0,0.85)' : 'rgba(255,0,0,0.12)';
    selectedCountEl.style.borderColor = selected.size > 0 ? '#FF0000' : 'rgba(255,0,0,0.35)';
  }

  function buildRow(u) {
    const row = document.createElement('div');
    row.dataset.username = u.username.toLowerCase();
    row.style.cssText = `
      display:flex; align-items:center; gap:10px; padding:8px 10px;
      cursor:pointer; border-radius:8px; margin-bottom:3px;
      border:1px solid transparent; transition:background 0.12s, border-color 0.12s;
      user-select:none;
    `;

    const isSelected = () => selected.has(u.id);
    const applyRowState = () => {
      row.style.background = isSelected() ? 'rgba(255,0,0,0.12)' : 'transparent';
      row.style.borderColor = isSelected() ? 'rgba(255,0,0,0.4)' : 'transparent';
    };
    row.onmouseover = () => { if (!isSelected()) row.style.background = 'rgba(255,255,255,0.05)'; };
    row.onmouseout = () => { if (!isSelected()) row.style.background = 'transparent'; };

    const checkWrap = document.createElement('div');
    checkWrap.style.cssText = `
      width:18px; height:18px; border-radius:5px; flex-shrink:0;
      border:2px solid #4a4d54; display:flex; align-items:center; justify-content:center;
      transition:all 0.15s; background:#1e1f22;
    `;
    const checkMark = document.createElement('span');
    checkMark.textContent = '✓';
    checkMark.style.cssText = `
      color:#fff; font-size:12px; font-weight:900; line-height:1;
      opacity:0; transform:scale(0.5); transition:all 0.15s;
    `;
    checkWrap.appendChild(checkMark);

    function refreshCheckVisual() {
      checkWrap.style.background = isSelected() ? '#FF0000' : '#1e1f22';
      checkWrap.style.borderColor = isSelected() ? '#FF0000' : '#4a4d54';
      checkMark.style.opacity = isSelected() ? '1' : '0';
      checkMark.style.transform = isSelected() ? 'scale(1)' : 'scale(0.5)';
    }

    row.onclick = () => {
      if (isSelected()) selected.delete(u.id); else selected.add(u.id);
      refreshCheckVisual();
      applyRowState();
      updateSelectedCount();
    };

    const img = document.createElement('img');
    img.src = sanitizeAvatar(u.avatar);
    img.style.cssText = 'width:32px; height:32px; border-radius:50%; flex-shrink:0; object-fit:cover;';

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:1px;';

    const nameSpan = document.createElement('span');
    nameSpan.className = `username-wrapper ${u.usernameColor || 'username-cyan'}`;
    nameSpan.style.cssText = 'font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    nameSpan.textContent = u.username;

    const statusSpan = document.createElement('span');
    const status = u.status || 'online';
    statusSpan.style.cssText = `font-size:11px; color:${status === 'online' ? '#23a559' : '#72767d'};`;
    statusSpan.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    textCol.appendChild(nameSpan);
    textCol.appendChild(statusSpan);

    row.appendChild(checkWrap);
    row.appendChild(img);
    row.appendChild(textCol);
    return row;
  }

  if (others.length === 0) {
    memberList.innerHTML = `<div style="color:#72767d; font-size:13px; text-align:center; padding:30px 10px;">Everyone online is already in this group.</div>`;
  } else {
    others.forEach(u => memberList.appendChild(buildRow(u)));
  }

  searchInput.oninput = () => {
    const q = searchInput.value.trim().toLowerCase();
    memberList.querySelectorAll('[data-username]').forEach(row => {
      row.style.display = row.dataset.username.includes(q) ? 'flex' : 'none';
    });
  };

  updateSelectedCount();

  const closeModal = () => modal.remove();
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
  });

  confirmBtn.onclick = () => {
    if (selected.size === 0) {
      errEl.textContent = 'Pick at least 1 member to add.';
      return;
    }
    socket.emit('whisperGroupAddMembers', { groupId, memberIds: [...selected] });
    closeModal();
  };

  searchInput.focus();
}


function leaveWhisperGroup(groupId) {
  const key = convoKeyForGroup(groupId);
  const convo = whisperConversations.get(key);
  if (!convo) return;

  showConfirmModal(
    `You'll stop receiving messages from "${convo.name}" and won't see it in your list anymore.`,
    () => {
      socket.emit('whisperGroupLeave', { groupId });
    },
    { title: `Leave "${convo.name}"?`, confirmLabel: 'Leave Group' }
  );
}


function renderWhisperThread(key) {
  const convo = whisperConversations.get(key);
  const header = document.getElementById('whisperThreadHeader');
  const messagesWrap = document.getElementById('whisperThreadMessages');
  const input = document.getElementById('whisperThreadInput');
  if (!header || !messagesWrap || !input) return;

if (!convo) {
    header.textContent = 'Select a conversation';
    messagesWrap.innerHTML = '';
    messagesWrap.style.cssText = `
      flex:1; overflow-y:auto; padding:10px 14px;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:10px;
    `;

    const bigEmoji = document.createElement('div');
    bigEmoji.textContent = '💬';
    bigEmoji.style.cssText = 'font-size:72px; opacity:0.5; line-height:1;';

    const label = document.createElement('div');
    label.textContent = 'Select a conversation to start whispering';
    label.style.cssText = 'color:#72767d; font-size:13px;';

    messagesWrap.appendChild(bigEmoji);
    messagesWrap.appendChild(label);

    input.disabled = true;
    return;
}


messagesWrap.style.cssText = 'flex:1; overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:8px;';

  header.innerHTML = '';
  if (convo.isGroup) {
    const icon = document.createElement('span');
    icon.textContent = '👥';
    icon.style.fontSize = '16px';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-weight:700; font-size:13px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
    nameSpan.textContent = `${convo.name} · ${(convo.members || []).length} members`;

    const addBtn = document.createElement('button');
    addBtn.textContent = '➕';
    addBtn.title = 'Add members';
    addBtn.style.cssText = `
      background:none; border:none; color:#b9bbbe; font-size:14px; cursor:pointer;
      padding:4px 6px; border-radius:6px; transition:background 0.15s, color 0.15s; flex-shrink:0;
    `;
    addBtn.onmouseover = () => { addBtn.style.background = 'rgba(255,255,255,0.08)'; addBtn.style.color = '#fff'; };
    addBtn.onmouseout = () => { addBtn.style.background = 'transparent'; addBtn.style.color = '#b9bbbe'; };
    addBtn.onclick = () => openAddMembersModal(convo.groupId);

    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = '❌';
    leaveBtn.title = 'Leave group';
    leaveBtn.style.cssText = `
      background:none; border:none; color:#b9bbbe; font-size:14px; cursor:pointer;
      padding:4px 6px; border-radius:6px; transition:background 0.15s, color 0.15s; flex-shrink:0;
    `;
    leaveBtn.onmouseover = () => { leaveBtn.style.background = 'rgba(255,0,0,0.15)'; leaveBtn.style.color = '#ff5555'; };
    leaveBtn.onmouseout = () => { leaveBtn.style.background = 'transparent'; leaveBtn.style.color = '#b9bbbe'; };
    leaveBtn.onclick = () => leaveWhisperGroup(convo.groupId);

    header.appendChild(icon);
    header.appendChild(nameSpan);
    header.appendChild(addBtn);
    header.appendChild(leaveBtn);
  } else {
    const img = document.createElement('img');
    img.src = sanitizeAvatar(convo.avatar);
    img.style.cssText = 'width:22px; height:22px; border-radius:50%; flex-shrink:0;';
    const nameSpan = document.createElement('span');
    nameSpan.className = `username-wrapper ${convo.usernameColor || 'username-cyan'}`;
    nameSpan.style.cssText = 'font-weight:700; font-size:13px;';
    nameSpan.textContent = convo.name;
    header.appendChild(img);
    header.appendChild(nameSpan);
  }

  messagesWrap.innerHTML = '';
  convo.messages.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = `display:flex; flex-direction:column; align-items:${m.outgoing ? 'flex-end' : 'flex-start'};`;

    if (m.outgoing) {
      const youLabel = document.createElement('span');
      youLabel.style.cssText = 'font-size:11px; font-weight:700; color:#72767d; margin-bottom:2px;';
      youLabel.textContent = 'You';
      row.appendChild(youLabel);
    } else if (convo.isGroup) {
      const senderLabel = document.createElement('span');
      senderLabel.style.cssText = `font-size:11px; font-weight:700; color:${colorClassToHex?.[m.fromUsernameColor] || '#00f2ff'}; margin-bottom:2px;`;
      senderLabel.textContent = m.fromUsername;
      row.appendChild(senderLabel);
    }

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      max-width:75%; padding:7px 10px; border-radius:10px; font-size:13px; line-height:1.4;
      background: rgba(0, 0, 0, 0.6);
      color: #fff; word-break: break-word;
    `;
    if (m.encrypted && m.encPayload) {
      bubble.textContent = activeEncryptionKey ? "🔓 Decrypting..." : "🔒 Encrypted (enter this messages password in settings)";
      decryptText(m.encPayload).then(plain => {
        bubble.innerHTML = '';
        if (plain !== null) {
          bubble.appendChild(parseContent(plain));
        } else {
          bubble.textContent = "🔒 Wrong password for this message";
        }
      });
      row.appendChild(bubble);
    } else {
      const looksLikeUrl = /^https?:\/\/\S+$/i.test((m.text || '').trim());

      if (looksLikeUrl) {
        const img = document.createElement('img');
        img.src = m.text.trim();
        img.loading = 'lazy';
        img.style.cssText = 'max-width:220px; max-height:220px; border-radius:8px; display:block; cursor:pointer;';
        img.onclick = () => window.open(m.text, '_blank');

        img.onerror = () => {
          img.remove();
          bubble.style.padding = '7px 10px';
          bubble.style.background = '#2b2d31';
          bubble.appendChild(parseContent(m.text || ''));
        };

        bubble.style.padding = '4px';
        bubble.style.background = 'transparent';
        bubble.appendChild(img);
      } else {
        bubble.appendChild(parseContent(m.text || ''));
      }
      row.appendChild(bubble);
    }

    const timeSpan = document.createElement('span');
    timeSpan.style.cssText = 'font-size:10px; color:#72767d; margin-top:2px;';
    timeSpan.textContent = formatTime(m.time);

    row.appendChild(timeSpan);
    messagesWrap.appendChild(row);
  });
  messagesWrap.scrollTop = messagesWrap.scrollHeight;

  input.disabled = false;
  input.placeholder = convo.isGroup ? `Message ${convo.name}...` : `Whisper to ${convo.name}...`;
}

function showWhisperNotificationBanner(data, key, convo) {
  const banner = document.createElement('div');
  banner.classList.add('banner-notification', 'stacked-notification', 'timer-5s');
  const topOffset = typeof getStackOffset === 'function' ? getStackOffset() : 20;

  banner.style.cssText = `
    position: fixed; top: ${topOffset}px; right: 20px;
    background: #111214; border: 1px solid #3a3c42; border-left: 4px solid #FF0000;
    color: white; padding: 14px 16px; border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7); z-index: 10001; cursor: pointer; width: 320px;
    animation: bannerSlideIn 0.3s ease-out;
    display: flex; flex-direction: column; gap: 10px; overflow: hidden;
  `;

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';

  const avatar = document.createElement('img');
  avatar.src = sanitizeAvatar(data.fromAvatar);
  avatar.style.cssText = `width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid ${colorClassToHex?.[data.fromUsernameColor] || '#00f2ff'};`;

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

  const name = document.createElement('span');
  name.className = `username-wrapper ${data.fromUsernameColor || 'username-cyan'}`;
  name.setAttribute('data-text', data.fromUsername || 'Unknown');
  name.textContent = data.fromUsername || 'Unknown';
  name.style.cssText = 'font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;';
  nameRow.appendChild(name);

  const tagBadge = document.createElement('span');
  tagBadge.textContent = convo?.isGroup ? `👥 ${convo.name}` : '💬 Whisper';
  tagBadge.style.cssText = `background: #FF0000; color: white; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; flex-shrink: 0;`;
  nameRow.appendChild(tagBadge);

  const body = document.createElement('div');
  body.textContent = (data.text || 'New whisper').substring(0, 80);
  body.style.cssText = 'font-size:13px; color:#b9bbbe; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

  nameCol.appendChild(nameRow);
  nameCol.appendChild(body);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `background: none; border: none; color: #72767d; font-size: 14px; cursor: pointer; padding: 0; flex-shrink: 0; align-self: flex-start; transition: color 0.15s;`;
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  closeBtn.onclick = (e) => { e.stopPropagation(); banner.remove(); };

  topRow.appendChild(avatar);
  topRow.appendChild(nameCol);
  topRow.appendChild(closeBtn);

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Reply';
  openBtn.style.cssText = `background: #FF0000; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; align-self: flex-end;`;
  openBtn.onmouseover = () => openBtn.style.background = '#cc0000';
  openBtn.onmouseout = () => openBtn.style.background = '#FF0000';
  const openThread = (e) => {
    if (e) e.stopPropagation();
    buildWhispersModal();
    whispersModal.style.display = 'block';
    whispersModalOpen = true;
    setActiveWhisperConvo(key);
    banner.remove();
  };
  openBtn.onclick = openThread;

  banner.appendChild(topRow);
  banner.appendChild(openBtn);
  banner.onclick = openThread;

  document.body.appendChild(banner);

  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(20px)';
      setTimeout(() => banner.remove(), 400);
    }
  }, 5000);
}



   function showWhisperEmojiCategoriesView() {
  whisperEmojiViewMode = "categories";
  whisperEmojiActiveCategory = null;
  const backBtn = document.getElementById("whisperEmojiBackBtn");
  const grid = document.getElementById("whisperEmojiGrid");
  const categoryGrid = document.getElementById("whisperEmojiCategoryGrid");
  const footer = document.getElementById("whisperEmojiFooter");
  if (backBtn) backBtn.style.display = "none";
  if (grid) grid.style.display = "none";
  if (categoryGrid) categoryGrid.style.display = "grid";
  if (footer) footer.style.display = "none";
}

function closeWhisperPopovers(except) {
  ['whisperEmojiPopover', 'whisperEmotePopover', 'whisperGifPopover'].forEach(id => {
    if (id === except) return;
    document.getElementById(id)?.remove();
  });
}


function renderWhisperEmojiCategoryGrid(input) {
  const categoryGrid = document.getElementById("whisperEmojiCategoryGrid");
  if (!categoryGrid) return;
  const source = typeof emojiList !== 'undefined' ? emojiList : [];
  const groups = [...new Set(source.map(e => e.group))];
  const icons = typeof EMOJI_CATEGORY_ICONS !== 'undefined' ? EMOJI_CATEGORY_ICONS : {};

  categoryGrid.innerHTML = "";
  groups.forEach(group => {
    const tile = document.createElement("div");
    tile.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      height: 44px; padding: 0 10px; border-radius: 8px;
      background: #1e1f22; cursor: pointer; transition: background 0.12s;
    `;
    tile.onmouseover = () => tile.style.background = "#2a2c31";
    tile.onmouseout = () => tile.style.background = "#1e1f22";

    const icon = document.createElement("span");
    icon.textContent = icons[group] || "🔹";
    icon.style.fontSize = "18px";

    const label = document.createElement("span");
    label.textContent = group;
    label.style.cssText = "color:#e6e6e7; font-size:11.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

    tile.appendChild(icon);
    tile.appendChild(label);
    tile.onclick = (e) => {
      e.stopPropagation();
      whisperEmojiActiveCategory = group;
      whisperEmojiViewMode = "results";
      document.getElementById("whisperEmojiCategoryGrid").style.display = "none";
      document.getElementById("whisperEmojiGrid").style.display = "grid";
      document.getElementById("whisperEmojiBackBtn").style.display = "block";
      whisperEmojiPickerState.page = 0;
      renderWhisperEmojiGrid("", input);
    };
    categoryGrid.appendChild(tile);
  });
}


function renderWhisperEmojiGrid(query, input) {
  const grid = document.getElementById("whisperEmojiGrid");
  const pageLabel = document.getElementById("whisperEmojiPageLabel");
  const footer = document.getElementById("whisperEmojiFooter");
  if (!grid) return;

  const source = typeof emojiList !== 'undefined' ? emojiList : [];
  let base = source;
  if (whisperEmojiActiveCategory && !query) {
    base = source.filter(e => e.group === whisperEmojiActiveCategory);
  }

  whisperEmojiPickerState.filtered = query
    ? source.filter(e => e.name.toLowerCase().includes(query))
    : base;

  const totalPages = Math.max(1, Math.ceil(whisperEmojiPickerState.filtered.length / WHISPER_EMOJIS_PER_PAGE));
  if (whisperEmojiPickerState.page >= totalPages) whisperEmojiPickerState.page = totalPages - 1;
  if (whisperEmojiPickerState.page < 0) whisperEmojiPickerState.page = 0;

  const start = whisperEmojiPickerState.page * WHISPER_EMOJIS_PER_PAGE;
  const pageItems = whisperEmojiPickerState.filtered.slice(start, start + WHISPER_EMOJIS_PER_PAGE);

  grid.innerHTML = "";

  if (pageItems.length === 0) {
    grid.style.display = "block";
    grid.innerHTML = `<div style="color:#72767d; font-size:12px; text-align:center; padding:20px 0;">No emojis found</div>`;
  } else {
    grid.style.display = "grid";
    pageItems.forEach(({ emoji, name }) => {
      const item = document.createElement("div");
      item.style.cssText = `
        position: relative; aspect-ratio: 1; border-radius: 6px;
        background: #1e1f22; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.15s, transform 0.1s; font-size: 20px;
      `;
      item.onmouseover = () => { item.style.background = "#2a2c31"; item.style.transform = "scale(1.1)"; };
      item.onmouseout = () => { item.style.background = "#1e1f22"; item.style.transform = "scale(1)"; };
      item.title = name;
      item.textContent = emoji;

      item.onclick = () => {
        input.value += emoji;
        input.focus();
        item.style.background = "#FF0000";
        setTimeout(() => item.style.background = "#1e1f22", 150);
      };

      grid.appendChild(item);
    });
  }

  pageLabel.textContent = `${whisperEmojiPickerState.page + 1}/${totalPages} (${whisperEmojiPickerState.filtered.length})`;
  footer.style.display = whisperEmojiPickerState.filtered.length > WHISPER_EMOJIS_PER_PAGE ? "flex" : "none";
}

function positionPopoverNear(popover, btn) {
  const rect = btn.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.left = rect.left + 'px';
  popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  popover.style.zIndex = '20800';
}

function wireWhisperEmojiPicker(btn, input) {
  btn.onclick = async (e) => {
    e.stopPropagation();
    const existing = document.getElementById('whisperEmojiPopover');
    if (existing) { existing.remove(); return; }
    closeWhisperPopovers();

    if (typeof loadEmojiData === 'function') await loadEmojiData();

    const popover = document.createElement("div");
    popover.id = "whisperEmojiPopover";
    popover.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 311px;
      max-height: 395px;
      background: #111214;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      overflow: hidden;
      z-index: 20800;
    `;

    const header = document.createElement("div");
    header.style.cssText = `padding: 8px; flex-shrink: 0; display:flex; gap:4px;`;

    const backBtn = document.createElement("button");
    backBtn.id = "whisperEmojiBackBtn";
    backBtn.innerHTML = "‹";
    backBtn.style.cssText = `
      background: none; border: none; color: #b9bbbe;
      font-size: 20px; cursor: pointer; padding: 0 4px;
      display: none; flex-shrink: 0; line-height: 1;
    `;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search emojis...";
    searchInput.style.cssText = `
      flex:1; box-sizing: border-box; padding: 7px 10px;
      background: #1e1f22; border-radius: 6px;
      color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
    `;
    searchInput.onfocus = () => searchInput.style.borderColor = "#FF0000";
    searchInput.onblur = () => searchInput.style.borderColor = "#3a3c42";

    backBtn.onclick = (ev) => {
      ev.stopPropagation();
      searchInput.value = "";
      showWhisperEmojiCategoriesView();
    };

    header.appendChild(backBtn);
    header.appendChild(searchInput);

    const gridWrap = document.createElement("div");
    gridWrap.id = "whisperEmojiGridWrap";
    gridWrap.style.cssText = `flex: 1; overflow-y: auto; padding: 8px;`;

    const categoryGrid = document.createElement("div");
    categoryGrid.id = "whisperEmojiCategoryGrid";
    categoryGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    `;

    const grid = document.createElement("div");
    grid.id = "whisperEmojiGrid";
    grid.style.cssText = `
      display: none;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    `;

    gridWrap.appendChild(categoryGrid);
    gridWrap.appendChild(grid);

    const footer = document.createElement("div");
    footer.id = "whisperEmojiFooter";
    footer.style.cssText = `
      display: none; align-items: center; justify-content: space-between;
      padding: 6px 10px; flex-shrink: 0;
    `;

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹ Prev";
    prevBtn.style.cssText = whisperPageBtnStyle();
    prevBtn.onclick = () => {
      if (whisperEmojiPickerState.page > 0) {
        whisperEmojiPickerState.page--;
        renderWhisperEmojiGrid(searchInput.value.trim().toLowerCase(), input);
      }
    };

    const pageLabel = document.createElement("span");
    pageLabel.id = "whisperEmojiPageLabel";
    pageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ›";
    nextBtn.style.cssText = whisperPageBtnStyle();
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(whisperEmojiPickerState.filtered.length / WHISPER_EMOJIS_PER_PAGE);
      if (whisperEmojiPickerState.page < totalPages - 1) {
        whisperEmojiPickerState.page++;
        renderWhisperEmojiGrid(searchInput.value.trim().toLowerCase(), input);
      }
    };

    footer.appendChild(prevBtn);
    footer.appendChild(pageLabel);
    footer.appendChild(nextBtn);

    popover.appendChild(header);
    popover.appendChild(gridWrap);
    popover.appendChild(footer);
    document.body.appendChild(popover);
    positionPopoverNear(popover, btn);

    searchInput.oninput = () => {
      whisperEmojiPickerState.page = 0;
      const q = searchInput.value.trim();
      if (q === "") {
        showWhisperEmojiCategoriesView();
      } else {
        whisperEmojiViewMode = "results";
        categoryGrid.style.display = "none";
        grid.style.display = "grid";
        backBtn.style.display = "block";
        renderWhisperEmojiGrid(q.toLowerCase(), input);
      }
    };

    renderWhisperEmojiCategoryGrid(input);
    showWhisperEmojiCategoriesView();
    searchInput.focus();

    setTimeout(() => {
      document.addEventListener('click', function outside(ev) {
        if (!popover.contains(ev.target) && ev.target !== btn) {
          popover.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 0);
  };
}

const WHISPER_EMOTES_PER_PAGE = 20;
let whisperEmotePickerState = { page: 0, filtered: [] };

const WHISPER_EMOJIS_PER_PAGE = 40;
let whisperEmojiPickerState = { page: 0, filtered: [] };
let whisperEmojiViewMode = "categories";
let whisperEmojiActiveCategory = null;

const WHISPER_GIFS_PER_PAGE = 36;
let whisperGifPickerState = { page: 0, allResults: [] };
let whisperGifViewMode = "categories";
let whisperActiveGifCategory = "trending";
const whisperCategoryThumbCache = new Map();
let whisperCategoryThumbsLoaded = false;

function whisperPageBtnStyle() {
  return `
    background: #1e1f22; border: 0px solid #3a3c42; color: #b9bbbe;
    font-size: 11px; padding: 4px 8px; border-radius: 6px;
    cursor: pointer; transition: background 0.15s, color 0.15s;
  `;
}


function renderWhisperEmoteGrid(query) {
  const grid = document.getElementById("whisperEmoteGrid");
  const pageLabel = document.getElementById("whisperEmotePageLabel");
  const footer = document.getElementById("whisperEmoteFooter");
  if (!grid) return;

  const list = typeof pepeList !== 'undefined' ? pepeList : [];
  whisperEmotePickerState.filtered = query
    ? list.filter(f => f.toLowerCase().includes(query))
    : list;

  const totalPages = Math.max(1, Math.ceil(whisperEmotePickerState.filtered.length / WHISPER_EMOTES_PER_PAGE));
  if (whisperEmotePickerState.page >= totalPages) whisperEmotePickerState.page = totalPages - 1;
  if (whisperEmotePickerState.page < 0) whisperEmotePickerState.page = 0;

  const start = whisperEmotePickerState.page * WHISPER_EMOTES_PER_PAGE;
  const pageItems = whisperEmotePickerState.filtered.slice(start, start + WHISPER_EMOTES_PER_PAGE);

  grid.innerHTML = "";

  if (pageItems.length === 0) {
    grid.style.display = "block";
    grid.innerHTML = `<div style="color:#72767d; font-size:12px; text-align:center; padding:20px 0;">No emotes found</div>`;
  } else {
    grid.style.display = "grid";
    pageItems.forEach(filename => {
      const item = document.createElement("div");
      item.style.cssText = `
        position: relative; aspect-ratio: 1; border-radius: 6px;
        background: #1e1f22; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.15s, transform 0.1s;
      `;
      item.onmouseover = () => { item.style.background = "#2a2c31"; item.style.transform = "scale(1.06)"; };
      item.onmouseout = () => { item.style.background = "#1e1f22"; item.style.transform = "scale(1)"; };
      item.title = filename;

      const img = document.createElement("img");
      img.src = `/avatars/${filename}`;
      img.style.cssText = "width:78%; height:78%; object-fit:contain; pointer-events:none;";
      item.appendChild(img);

      item.onclick = () => {
        if (!activeWhisperKey) { showToast('Select a conversation first'); return; }
        sendWhisper(activeWhisperKey, `${window.location.origin}/avatars/${filename}`);
        document.getElementById('whisperEmotePopover')?.remove();
      };

      grid.appendChild(item);
    });
  }

  pageLabel.textContent = `${whisperEmotePickerState.page + 1}/${totalPages} (${whisperEmotePickerState.filtered.length})`;
  footer.style.display = whisperEmotePickerState.filtered.length > WHISPER_EMOTES_PER_PAGE ? "flex" : "none";
}


function wireWhisperEmotePicker(btn) {
  btn.onclick = (e) => {
    e.stopPropagation();
    const existing = document.getElementById('whisperEmotePopover');
    if (existing) { existing.remove(); return; }
    closeWhisperPopovers();

    const popover = document.createElement("div");
    popover.id = "whisperEmotePopover";
    popover.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 324px;
      max-height: 395px;
      background: #111214;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      overflow: hidden;
      z-index: 20800;
    `;

    const header = document.createElement("div");
    header.style.cssText = `padding: 8px; flex-shrink: 0;`;
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search emotes...";
    searchInput.style.cssText = `
      width: 100%; box-sizing: border-box; padding: 7px 10px;
      background: #1e1f22; border-radius: 6px;
      color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
    `;
    searchInput.onfocus = () => searchInput.style.borderColor = "#FF0000";
    searchInput.onblur = () => searchInput.style.borderColor = "#3a3c42";
    searchInput.oninput = () => {
      whisperEmotePickerState.page = 0;
      renderWhisperEmoteGrid(searchInput.value.trim().toLowerCase());
    };
    header.appendChild(searchInput);

    const gridWrap = document.createElement("div");
    gridWrap.id = "whisperEmoteGridWrap";
    gridWrap.style.cssText = `flex: 1; overflow-y: auto; padding: 8px;`;

    const grid = document.createElement("div");
    grid.id = "whisperEmoteGrid";
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    `;
    gridWrap.appendChild(grid);

    const footer = document.createElement("div");
    footer.id = "whisperEmoteFooter";
    footer.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px; flex-shrink: 0;
    `;

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹ Prev";
    prevBtn.style.cssText = whisperPageBtnStyle();
    prevBtn.onclick = () => {
      if (whisperEmotePickerState.page > 0) {
        whisperEmotePickerState.page--;
        renderWhisperEmoteGrid(searchInput.value.trim().toLowerCase());
      }
    };

    const pageLabel = document.createElement("span");
    pageLabel.id = "whisperEmotePageLabel";
    pageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ›";
    nextBtn.style.cssText = whisperPageBtnStyle();
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(whisperEmotePickerState.filtered.length / WHISPER_EMOTES_PER_PAGE);
      if (whisperEmotePickerState.page < totalPages - 1) {
        whisperEmotePickerState.page++;
        renderWhisperEmoteGrid(searchInput.value.trim().toLowerCase());
      }
    };

    footer.appendChild(prevBtn);
    footer.appendChild(pageLabel);
    footer.appendChild(nextBtn);

    popover.appendChild(header);
    popover.appendChild(gridWrap);
    popover.appendChild(footer);
    document.body.appendChild(popover);
    positionPopoverNear(popover, btn);

    renderWhisperEmoteGrid("");
    searchInput.focus();

    setTimeout(() => {
      document.addEventListener('click', function outside(ev) {
        if (!popover.contains(ev.target) && ev.target !== btn) {
          popover.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 0);
  };
}


async function loadWhisperCategoryThumbnails(categoryRow) {
  if (whisperCategoryThumbsLoaded) return;
  const cats = typeof GIF_CATEGORIES !== 'undefined' ? GIF_CATEGORIES : [];
  const allCats = [{ label: "Trending", query: "trending" }, ...cats];

  allCats.forEach(async (cat) => {
    try {
      const cacheKey = cat.query === "trending" ? "__trending__" : cat.query;
      let results = typeof gifCache !== 'undefined' ? gifCache.get(cacheKey) : null;

      if (!results) {
        const url = cat.query === "trending"
          ? `/api/gifs/trending?limit=100`
          : `/api/gifs/search?q=${encodeURIComponent(cat.query)}&limit=100`;
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();
        results = data.data;
        if (typeof gifCache !== 'undefined') gifCache.set(cacheKey, results);
      }

      const first = results?.[0];
      const thumb = first?.images?.fixed_height_small?.url || first?.images?.original?.url;
      if (!thumb) return;
      whisperCategoryThumbCache.set(cat.query, thumb);
    } catch (err) {
      console.warn(`Whisper thumbnail fetch failed for "${cat.query}":`, err);
    }
  });

  whisperCategoryThumbsLoaded = true;
}

function wireWhisperGifPicker(btn) {
  let gifSearchTimeout = null;

  btn.onclick = (e) => {
    e.stopPropagation();
    const existing = document.getElementById('whisperGifPopover');
    if (existing) { existing.remove(); return; }
    closeWhisperPopovers();

    const popover = document.createElement("div");
    popover.id = "whisperGifPopover";
    popover.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 340px;
      max-height: 420px;
      background: #111214;
      border: 1px solid #3a3c42;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      overflow: hidden;
      z-index: 20800;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 10px; border-bottom: 1px solid #3a3c42; flex-shrink: 0;
    `;

    const backBtn = document.createElement("button");
    backBtn.innerHTML = "‹";
    backBtn.style.cssText = `
      background: none; border: none; color: #b9bbbe;
      font-size: 20px; cursor: pointer; padding: 0 4px;
      display: none; flex-shrink: 0; line-height: 1;
    `;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search GIFs...";
    searchInput.style.cssText = `
      flex: 1; box-sizing: border-box; padding: 7px 10px;
      background: #1e1f22; border: 1px solid #3a3c42; border-radius: 6px;
      color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
    `;
    searchInput.onfocus = () => searchInput.style.borderColor = "#FF0000";
    searchInput.onblur = () => searchInput.style.borderColor = "#3a3c42";

    header.appendChild(backBtn);
    header.appendChild(searchInput);

    const categoryRow = document.createElement("div");
    categoryRow.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px;
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
    `;

    const gridWrap = document.createElement("div");
    gridWrap.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px; display: none;
      grid-template-columns: repeat(4, 70px); grid-auto-rows: 70px;
      gap: 6px; justify-content: center; align-content: start;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: none; align-items: center; justify-content: space-between;
      padding: 6px 10px; border-top: 1px solid #3a3c42; flex-shrink: 0;
    `;
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹ Prev";
    prevBtn.style.cssText = whisperPageBtnStyle();
    const pageLabel = document.createElement("span");
    pageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ›";
    nextBtn.style.cssText = whisperPageBtnStyle();
    footer.appendChild(prevBtn);
    footer.appendChild(pageLabel);
    footer.appendChild(nextBtn);

    popover.appendChild(header);
    popover.appendChild(categoryRow);
    popover.appendChild(gridWrap);
    popover.appendChild(footer);
    document.body.appendChild(popover);
    positionPopoverNear(popover, btn);

    function showResultsView() {
      whisperGifViewMode = "results";
      categoryRow.style.display = "none";
      gridWrap.style.display = "grid";
    }
    function showCategoriesView() {
      whisperGifViewMode = "categories";
      categoryRow.style.display = "grid";
      gridWrap.style.display = "none";
      footer.style.display = "none";
      renderCategoryGrid();
    }

    function renderCategoryGrid() {
      categoryRow.innerHTML = "";
      const cats = typeof GIF_CATEGORIES !== 'undefined' ? GIF_CATEGORIES : [];
      const allTiles = [{ label: "🔥 Trending", query: "trending" }, ...cats];

      allTiles.forEach(cat => {
        const thumb = whisperCategoryThumbCache.get(cat.query);
        const tile = document.createElement("div");
        tile.style.cssText = `
          position: relative; height: 70px; border-radius: 8px; overflow: hidden;
          cursor: pointer; background: ${thumb ? `url('${thumb}') center/cover` : "#1e1f22"};
          transition: transform 0.12s;
        `;
        tile.onmouseover = () => tile.style.transform = "scale(1.03)";
        tile.onmouseout = () => tile.style.transform = "scale(1)";

        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.1));
          display: flex; align-items: flex-end; padding: 6px 8px;
        `;
        const label = document.createElement("span");
        label.textContent = cat.label;
        label.style.cssText = "color:#fff; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; text-shadow: 0 1px 3px rgba(0,0,0,0.8);";
        overlay.appendChild(label);
        tile.appendChild(overlay);

        tile.onclick = (ev) => {
          ev.stopPropagation();
          whisperActiveGifCategory = cat.query;
          showResultsView();
          backBtn.style.display = "block";
          searchInput.value = cat.query === "trending" ? "" : cat.query;
          if (cat.query === "trending") loadTrending(); else doSearch(cat.query);
        };

        categoryRow.appendChild(tile);
      });

      loadWhisperCategoryThumbnails(categoryRow);
    }

    function renderGifs(list) {
      whisperGifPickerState.allResults = list || [];
      whisperGifPickerState.page = 0;
      renderPage();
    }

    function renderPage() {
      const gifs = whisperGifPickerState.allResults;
      gridWrap.innerHTML = "";

      if (!gifs || gifs.length === 0) {
        gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">No GIFs found</div>';
        footer.style.display = "none";
        return;
      }

      const totalPages = Math.max(1, Math.ceil(gifs.length / WHISPER_GIFS_PER_PAGE));
      if (whisperGifPickerState.page >= totalPages) whisperGifPickerState.page = totalPages - 1;
      if (whisperGifPickerState.page < 0) whisperGifPickerState.page = 0;

      const start = whisperGifPickerState.page * WHISPER_GIFS_PER_PAGE;
      const pageItems = gifs.slice(start, start + WHISPER_GIFS_PER_PAGE);

      pageItems.forEach(gif => {
        const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.original?.url;
        const fullUrl = gif.images?.original?.url;
        if (!previewUrl || !fullUrl) return;

        const item = document.createElement("div");
        item.style.cssText = `
          position: relative; width: 70px; height: 70px; border-radius: 6px;
          background: #1e1f22; overflow: hidden; cursor: pointer;
          transition: transform 0.1s, outline 0.15s; outline: 2px solid transparent; box-sizing: border-box;
        `;
        item.onmouseover = () => { item.style.transform = "scale(1.06)"; item.style.outline = "2px solid #FF0000"; };
        item.onmouseout = () => { item.style.transform = "scale(1)"; item.style.outline = "2px solid transparent"; };

        const img = document.createElement("img");
        img.src = previewUrl;
        img.loading = "lazy";
        img.style.cssText = "width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;";
        item.appendChild(img);

        item.onclick = () => {
          if (!activeWhisperKey) { showToast('Select a conversation first'); return; }
          sendWhisper(activeWhisperKey, fullUrl);
          popover.remove();
        };

        gridWrap.appendChild(item);
      });

      pageLabel.textContent = `${whisperGifPickerState.page + 1}/${totalPages} (${gifs.length})`;
      footer.style.display = gifs.length > WHISPER_GIFS_PER_PAGE ? "flex" : "none";
    }

    prevBtn.onclick = () => { if (whisperGifPickerState.page > 0) { whisperGifPickerState.page--; renderPage(); } };
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(whisperGifPickerState.allResults.length / WHISPER_GIFS_PER_PAGE);
      if (whisperGifPickerState.page < totalPages - 1) { whisperGifPickerState.page++; renderPage(); }
    };

    async function loadTrending() {
      const cacheKey = "__trending__";
      if (typeof gifCache !== 'undefined' && gifCache.has(cacheKey)) {
        renderGifs(gifCache.get(cacheKey));
        return;
      }
      gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Loading trending GIFs...</div>';
      try {
        const res = await fetch(`/api/gifs/trending?limit=40`);
        const data = await res.json();
        if (typeof gifCache !== 'undefined') gifCache.set(cacheKey, data.data);
        renderGifs(data.data);
      } catch {
        gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Failed to load trending GIFs.</div>';
      }
    }

    async function doSearch(query) {
      if (typeof gifCache !== 'undefined' && gifCache.has(query)) {
        renderGifs(gifCache.get(query));
        return;
      }
      gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Searching...</div>';
      try {
        const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}&limit=100`);
        const data = await res.json();
        if (typeof gifCache !== 'undefined') gifCache.set(query, data.data);
        renderGifs(data.data);
      } catch {
        gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Search failed. Try again.</div>';
      }
    }

    backBtn.onclick = (ev) => {
      ev.stopPropagation();
      searchInput.value = "";
      backBtn.style.display = "none";
      showCategoriesView();
    };

    searchInput.oninput = () => {
      clearTimeout(gifSearchTimeout);
      const q = searchInput.value.trim();
      if (q.length === 0) {
        backBtn.style.display = "none";
        showCategoriesView();
        return;
      }
      backBtn.style.display = "block";
      showResultsView();
      gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Waiting for you to finish typing...</div>';
      gifSearchTimeout = setTimeout(() => {
        if (q.length >= 3) doSearch(q);
        else gridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Type at least 3 characters...</div>';
      }, 600);
    };

    showCategoriesView();
    searchInput.focus();

    setTimeout(() => {
      document.addEventListener('click', function outside(ev) {
        if (!popover.contains(ev.target) && ev.target !== btn) {
          popover.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 0);
  };
}


function startDM() {
  if (!currentProfileUser) return;
  openWhisperWith(currentProfileUser);
  hideProfilePopup();
}