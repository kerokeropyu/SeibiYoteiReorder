'use strict';

// ---- DOM要素 ----
const branchSelect    = document.getElementById('branch-select');
const reloadBtn       = document.getElementById('reload-btn');
const employeeList    = document.getElementById('employee-list');
const placeholderText = document.getElementById('placeholder-text');
const saveBtn         = document.getElementById('save-btn');
const quitBtn         = document.getElementById('quit-btn');
const messageArea     = document.getElementById('message-area');
const statusText      = document.getElementById('status-text');

// ---- 状態 ----
let currentShitenCd   = null;
let originalEmployees = [];   // DBから読み込んだ元データ [{shainCd, shainNm, seq}]
let currentOrder      = [];   // 現在の表示順
let movedSet          = new Set(); // 移動された社員の shainCd

let dragSrcIndex      = null;

// ---- 初期化 ----
loadBranches();

// ---- 支店読み込み ----
async function loadBranches() {
  showMessage('');
  const result = await window.dbAPI.getBranches();
  if (!result.success) {
    showMessage('支店の取得に失敗しました: ' + result.error, 'error');
    return;
  }

  branchSelect.innerHTML = '<option value="">-- 支店を選択してください --</option>';
  for (const branch of result.data) {
    const opt = document.createElement('option');
    opt.value = branch.shitenCd;
    opt.textContent = branch.shitenNm;
    branchSelect.appendChild(opt);
  }
}

// ---- 社員読み込み ----
async function loadEmployees(shitenCd) {
  showMessage('');
  employeeList.innerHTML = '';
  placeholderText.style.display = 'none';
  statusText.textContent = '読み込み中...';
  saveBtn.disabled = true;

  const result = await window.dbAPI.getEmployees(shitenCd);
  if (!result.success) {
    showMessage('社員情報の取得に失敗しました: ' + result.error, 'error');
    statusText.textContent = '';
    return;
  }

  originalEmployees = result.data.map(r => ({
    shainCd: r.shainCd,
    shainNm: r.shainNm,
    seq:     r.seq,
  }));
  currentOrder = [...originalEmployees];
  movedSet     = new Set();

  statusText.textContent = `${originalEmployees.length}名`;
  renderList();
}

function clearEmployees() {
  currentShitenCd   = null;
  originalEmployees = [];
  currentOrder      = [];
  movedSet          = new Set();
  employeeList.innerHTML = '';
  placeholderText.style.display = 'block';
  saveBtn.disabled  = true;
  statusText.textContent = '';
}

// ---- 描画 ----
function renderList() {
  employeeList.innerHTML = '';

  const isLocked = movedSet.size >= 1;

  currentOrder.forEach((emp, index) => {
    const isMoved = movedSet.has(emp.shainCd);
    const classes = ['employee-card'];
    if (isMoved)   classes.push('modified');
    if (isLocked && !isMoved) classes.push('locked');

    const card = document.createElement('div');
    card.className = classes.join(' ');
    card.dataset.index = index;
    card.draggable = !isLocked;

    const seqLabel = document.createElement('div');
    seqLabel.className = 'seq-label';
    seqLabel.textContent = 'seq: ' + emp.seq;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'emp-name';
    nameDiv.textContent = emp.shainNm;

    card.appendChild(seqLabel);
    card.appendChild(nameDiv);

    card.addEventListener('dragstart',  onDragStart);
    card.addEventListener('dragend',    onDragEnd);
    card.addEventListener('dragover',   onDragOver);
    card.addEventListener('dragleave',  onDragLeave);
    card.addEventListener('drop',       onDrop);

    employeeList.appendChild(card);
  });
}

// ---- ドラッグ＆ドロップ ----
function onDragStart(e) {
  // 1回の読み込みにつき移動できる社員は1人まで
  if (movedSet.size >= 1) {
    e.preventDefault();
    return;
  }
  dragSrcIndex = parseInt(e.currentTarget.dataset.index, 10);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  clearDropStyles();
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDropStyles();

  const card = e.currentTarget;
  const rect  = card.getBoundingClientRect();
  const isLeft = e.clientX < rect.left + rect.width / 2;
  card.classList.add(isLeft ? 'drop-left' : 'drop-right');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drop-left', 'drop-right');
}

function onDrop(e) {
  e.preventDefault();
  const card        = e.currentTarget;
  const targetIndex = parseInt(card.dataset.index, 10);
  const rect        = card.getBoundingClientRect();
  const insertAfter = e.clientX >= rect.left + rect.width / 2;

  clearDropStyles();

  if (dragSrcIndex === null || dragSrcIndex === targetIndex) {
    dragSrcIndex = null;
    return;
  }

  const draggedEmp = currentOrder[dragSrcIndex];
  currentOrder.splice(dragSrcIndex, 1);

  // splice 後のインデックスを調整
  let insertAt = dragSrcIndex < targetIndex ? targetIndex - 1 : targetIndex;
  if (insertAfter) insertAt += 1;
  insertAt = Math.max(0, Math.min(insertAt, currentOrder.length));

  currentOrder.splice(insertAt, 0, draggedEmp);
  movedSet.add(draggedEmp.shainCd);
  saveBtn.disabled = false;
  dragSrcIndex = null;

  renderList();
}

function clearDropStyles() {
  document.querySelectorAll('.employee-card').forEach(c => {
    c.classList.remove('drop-left', 'drop-right');
  });
}

// ---- 保存 ----
async function saveOrder() {
  if (!currentShitenCd || movedSet.size === 0) return;

  const updates = [];
  for (let i = 0; i < currentOrder.length; i++) {
    const emp = currentOrder[i];
    if (!movedSet.has(emp.shainCd)) continue;

    let newSeq;
    if (i === 0) {
      // 先頭に移動した場合: 元の先頭社員のseq - 1（最小1）
      newSeq = Math.max(1, originalEmployees[0].seq - 1);
    } else {
      // 左隣社員の「元のseq」+ 1
      const leftEmp = currentOrder[i - 1];
      const leftOrig = originalEmployees.find(e => e.shainCd === leftEmp.shainCd);
      newSeq = leftOrig.seq + 1;
    }
    updates.push({ shainCd: emp.shainCd, newSeq });
  }

  saveBtn.disabled = true;
  statusText.textContent = '保存中...';

  const result = await window.dbAPI.saveOrder(currentShitenCd, updates);

  if (!result.success) {
    showMessage('保存に失敗しました: ' + result.error, 'error');
    saveBtn.disabled = false;
    statusText.textContent = `${originalEmployees.length}名`;
    return;
  }

  showMessage('保存しました。', 'success');
  await loadEmployees(currentShitenCd);
}

// ---- メッセージ表示 ----
function showMessage(msg, type) {
  messageArea.innerHTML = '';
  if (!msg) return;
  const span = document.createElement('span');
  span.className = type === 'error' ? 'msg-error' : 'msg-success';
  span.textContent = msg;
  messageArea.appendChild(span);
}

// ---- イベントリスナー ----
branchSelect.addEventListener('change', async () => {
  const shitenCd = branchSelect.value;
  if (!shitenCd) {
    clearEmployees();
    return;
  }
  currentShitenCd = shitenCd;
  await loadEmployees(shitenCd);
});

reloadBtn.addEventListener('click', async () => {
  showMessage('');
  if (currentShitenCd) {
    await loadEmployees(currentShitenCd);
  } else {
    await loadBranches();
  }
});

saveBtn.addEventListener('click', saveOrder);

quitBtn.addEventListener('click', () => {
  window.appAPI.quit();
});
