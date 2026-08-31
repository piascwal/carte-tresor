(function () {
  'use strict';

  // Résolution interne du canvas = format A4 paysage (ratio 297:210) pour un export PDF net.
  const CANVAS_W = 2000;
  const CANVAS_H = Math.round(CANVAS_W * 210 / 297); // 1414

  const ACCENT = '#c0522d';
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 3.5;

  // ---------- DOM ----------
  const canvasWrap = document.getElementById('canvasWrap');
  const baseCanvas = document.getElementById('baseCanvas');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const baseCtx = baseCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  const titleInput = document.getElementById('titleInput');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnClear = document.getElementById('btnClear');
  const btnPng = document.getElementById('btnPng');
  const btnPdf = document.getElementById('btnPdf');

  const palette = document.getElementById('palette');
  const paletteBackdrop = document.getElementById('paletteBackdrop');
  const paletteToggle = document.getElementById('paletteToggle');
  const paletteClose = document.getElementById('paletteClose');
  const paperThumbs = document.getElementById('paperThumbs');
  const textToolRow = document.getElementById('textToolRow');
  const categoryTabs = document.getElementById('categoryTabs');
  const itemsGrid = document.getElementById('itemsGrid');
  const hint = document.getElementById('hint');

  const textModalBackdrop = document.getElementById('textModalBackdrop');
  const textModalInput = document.getElementById('textModalInput');
  const textModalOk = document.getElementById('textModalOk');
  const textModalCancel = document.getElementById('textModalCancel');

  const selectionToolbar = document.getElementById('selectionToolbar');
  const btnRotateMinus = document.getElementById('btnRotateMinus');
  const btnRotatePlus = document.getElementById('btnRotatePlus');
  const btnShrink = document.getElementById('btnShrink');
  const btnGrow = document.getElementById('btnGrow');
  const btnFront = document.getElementById('btnFront');
  const btnBack = document.getElementById('btnBack');
  const btnDeleteItem = document.getElementById('btnDeleteItem');
  const btnDeselect = document.getElementById('btnDeselect');

  baseCanvas.width = CANVAS_W;
  baseCanvas.height = CANVAS_H;
  overlayCanvas.width = CANVAS_W;
  overlayCanvas.height = CANVAS_H;

  // ---------- State ----------
  let state = {
    paper: PAPERS[0].file,
    items: [],
  };
  let selectedId = null;
  let armedStamp = null; // { kind:'image', file, label } | { kind:'text' }
  let zCounter = 1;
  let idCounter = 1;

  const past = [];
  const future = [];

  function snapshot() {
    return JSON.stringify({ title: titleInput.value, state });
  }
  function pushHistory() {
    past.push(snapshot());
    if (past.length > 60) past.shift();
    future.length = 0;
    updateHistoryButtons();
  }
  function restore(snapText) {
    const data = JSON.parse(snapText);
    titleInput.value = data.title;
    state = data.state;
    selectedId = null;
    updateSelectionUI();
    redraw();
  }
  function undo() {
    if (!past.length) return;
    future.push(snapshot());
    restore(past.pop());
    updateHistoryButtons();
  }
  function redo() {
    if (!future.length) return;
    past.push(snapshot());
    restore(future.pop());
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    btnUndo.disabled = past.length === 0;
    btnRedo.disabled = future.length === 0;
  }

  // ---------- Image cache ----------
  const imageCache = new Map();
  function getImage(src) {
    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      img.onload = () => redraw();
      imageCache.set(src, img);
    }
    return img;
  }
  PAPERS.forEach((p) => getImage(p.file));

  // ---------- Helpers ----------
  function genId() { return 'it' + (idCounter++); }
  function nextZ() { return zCounter++; }
  function showHint(text, ms) {
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(showHint._t);
    if (ms) showHint._t = setTimeout(() => { hint.hidden = true; }, ms);
  }
  function clearHint() { hint.hidden = true; }

  function toCanvasPoint(e) {
    const rect = canvasWrap.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function itemBoxSize(it) {
    if (it.kind === 'text') {
      overlayCtx.font = `${it.fontSize}px 'Pirata One', cursive`;
      const w = overlayCtx.measureText(it.text).width + it.fontSize * 0.5;
      const h = it.fontSize * 1.3;
      return { w, h };
    }
    return { w: it.w, h: it.h };
  }

  function hitTest(it, p) {
    const { w, h } = itemBoxSize(it);
    const dx = p.x - it.x, dy = p.y - it.y;
    const cos = Math.cos(-it.rotation), sin = Math.sin(-it.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2;
  }

  function findItem(id) { return state.items.find((i) => i.id === id); }

  // ---------- Drawing ----------
  function drawBase() {
    baseCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const paperImg = getImage(state.paper);
    if (paperImg.complete && paperImg.naturalWidth) {
      baseCtx.drawImage(paperImg, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      baseCtx.fillStyle = '#f2e2bd';
      baseCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    const sorted = [...state.items].sort((a, b) => a.z - b.z);
    for (const it of sorted) {
      baseCtx.save();
      baseCtx.translate(it.x, it.y);
      baseCtx.rotate(it.rotation);
      if (it.kind === 'image') {
        const img = getImage(it.src);
        if (img.complete && img.naturalWidth) {
          baseCtx.drawImage(img, -it.w / 2, -it.h / 2, it.w, it.h);
        }
      } else if (it.kind === 'text') {
        baseCtx.font = `${it.fontSize}px 'Pirata One', cursive`;
        baseCtx.fillStyle = it.color;
        baseCtx.textAlign = 'center';
        baseCtx.textBaseline = 'middle';
        baseCtx.fillText(it.text, 0, 0);
      }
      baseCtx.restore();
    }
  }

  function drawOverlay() {
    overlayCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const it = selectedId && findItem(selectedId);
    if (!it) return;
    const { w, h } = itemBoxSize(it);
    overlayCtx.save();
    overlayCtx.translate(it.x, it.y);
    overlayCtx.rotate(it.rotation);
    overlayCtx.strokeStyle = ACCENT;
    overlayCtx.lineWidth = 7;
    overlayCtx.setLineDash([22, 14]);
    overlayCtx.strokeRect(-w / 2 - 14, -h / 2 - 14, w + 28, h + 28);
    overlayCtx.restore();
  }

  function redraw() {
    drawBase();
    drawOverlay();
  }

  // ---------- Selection / toolbar ----------
  function selectItem(id) {
    selectedId = id;
    armedStamp = null;
    updatePaletteArmedUI();
    updateSelectionUI();
    redraw();
  }
  function deselect() {
    selectedId = null;
    updateSelectionUI();
    redraw();
  }
  function updateSelectionUI() {
    selectionToolbar.hidden = !selectedId;
  }

  function deleteSelected() {
    if (!selectedId) return;
    state.items = state.items.filter((i) => i.id !== selectedId);
    selectedId = null;
    updateSelectionUI();
    pushHistory();
    redraw();
  }
  function bringFront() {
    const it = findItem(selectedId);
    if (!it) return;
    it.z = nextZ();
    pushHistory();
    redraw();
  }
  function sendBack() {
    const it = findItem(selectedId);
    if (!it) return;
    const minZ = Math.min(0, ...state.items.map((i) => i.z));
    it.z = minZ - 1;
    pushHistory();
    redraw();
  }
  function scaleSelected(factor) {
    const it = findItem(selectedId);
    if (!it) return;
    if (it.kind === 'text') {
      it.fontSize = clamp(it.fontSize * factor, CANVAS_W * 0.015, CANVAS_W * 0.14);
    } else {
      const nw = clamp(it.w * factor, CANVAS_W * 0.03, CANVAS_W * 0.9);
      const ratio = it.h / it.w;
      it.w = nw;
      it.h = nw * ratio;
    }
    pushHistory();
    redraw();
  }
  function rotateSelected(deg) {
    const it = findItem(selectedId);
    if (!it) return;
    it.rotation += (deg * Math.PI) / 180;
    pushHistory();
    redraw();
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------- Stamp placement ----------
  function createImageItem(stamp, p) {
    const img = getImage(stamp.file);
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    const w = CANVAS_W * 0.14;
    return { id: genId(), kind: 'image', src: stamp.file, x: p.x, y: p.y, w, h: w * ratio, rotation: 0, z: nextZ() };
  }

  // ---------- Text modal (replaces window.prompt, which some embedded/PWA contexts block) ----------
  let textModalResolve = null;
  function askText(defaultValue) {
    return new Promise((resolve) => {
      textModalResolve = resolve;
      textModalInput.value = defaultValue || '';
      textModalBackdrop.hidden = false;
      textModalInput.focus();
      textModalInput.select();
    });
  }
  function closeTextModal(result) {
    textModalBackdrop.hidden = true;
    if (textModalResolve) { textModalResolve(result); textModalResolve = null; }
  }
  textModalOk.addEventListener('click', () => closeTextModal(textModalInput.value.trim() || null));
  textModalCancel.addEventListener('click', () => closeTextModal(null));
  textModalBackdrop.addEventListener('click', (e) => { if (e.target === textModalBackdrop) closeTextModal(null); });
  textModalInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeTextModal(textModalInput.value.trim() || null); }
    if (e.key === 'Escape') closeTextModal(null);
  });

  async function placeTextAt(p) {
    const text = await askText('Trésor caché ici !');
    if (!text) return;
    const item = {
      id: genId(), kind: 'text', text, x: p.x, y: p.y,
      fontSize: CANVAS_W * 0.04, rotation: 0, color: '#3b2a1a', z: nextZ(),
    };
    state.items.push(item);
    selectItem(item.id);
    pushHistory();
  }

  async function editTextItem(it) {
    const text = await askText(it.text);
    if (!text) return;
    it.text = text;
    pushHistory();
    redraw();
  }

  // ---------- Pointer interaction on canvas ----------
  let dragState = null;

  canvasWrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = toCanvasPoint(e);
    let hit = null;
    for (let i = state.items.length - 1; i >= 0; i--) {
      if (hitTest(state.items[i], p)) { hit = state.items[i]; break; }
    }
    if (hit) {
      selectItem(hit.id);
      canvasWrap.setPointerCapture(e.pointerId);
      dragState = { pointerId: e.pointerId, id: hit.id, startPx: p, startCx: hit.x, startCy: hit.y, moved: false };
      return;
    }
    if (armedStamp) {
      if (armedStamp.kind === 'text') {
        placeTextAt(p);
      } else {
        const item = createImageItem(armedStamp, p);
        state.items.push(item);
        selectItem(item.id);
        pushHistory();
      }
      return;
    }
    deselect();
  });

  canvasWrap.addEventListener('dblclick', (e) => {
    const p = toCanvasPoint(e);
    for (let i = state.items.length - 1; i >= 0; i--) {
      if (state.items[i].kind === 'text' && hitTest(state.items[i], p)) {
        editTextItem(state.items[i]);
        break;
      }
    }
  });

  canvasWrap.addEventListener('pointermove', (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const p = toCanvasPoint(e);
    const it = findItem(dragState.id);
    if (!it) return;
    const dx = p.x - dragState.startPx.x;
    const dy = p.y - dragState.startPx.y;
    it.x = clamp(dragState.startCx + dx, 0, CANVAS_W);
    it.y = clamp(dragState.startCy + dy, 0, CANVAS_H);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
    redraw();
  });

  function endDrag(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    if (dragState.moved) pushHistory();
    dragState = null;
  }
  canvasWrap.addEventListener('pointerup', endDrag);
  canvasWrap.addEventListener('pointercancel', endDrag);

  // ---------- Palette rendering ----------
  function renderPaperThumbs() {
    paperThumbs.innerHTML = '';
    PAPERS.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'paper-thumb' + (state.paper === p.file ? ' active' : '');
      btn.style.backgroundImage = `url(${p.file})`;
      btn.title = p.label;
      btn.setAttribute('aria-label', p.label);
      btn.addEventListener('click', () => {
        state.paper = p.file;
        pushHistory();
        renderPaperThumbs();
        redraw();
      });
      paperThumbs.appendChild(btn);
    });
  }

  function renderTextTool() {
    textToolRow.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'item-btn text-tool';
    btn.innerHTML = '<span style="font-size:1.4rem">✏️</span><span>Ajouter du texte</span>';
    btn.addEventListener('click', () => armStamp({ kind: 'text' }, btn));
    textToolRow.appendChild(btn);
  }

  let activeTabId = CATEGORIES[0].id;
  function renderTabs() {
    categoryTabs.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (cat.id === activeTabId ? ' active' : '');
      btn.textContent = `${cat.icon} ${cat.label}`;
      btn.addEventListener('click', () => {
        activeTabId = cat.id;
        renderTabs();
        renderItemsGrid();
      });
      categoryTabs.appendChild(btn);
    });
  }

  let armedBtnEl = null;
  function armStamp(stamp, btnEl) {
    if (armedStamp && armedBtnEl === btnEl && sameStamp(armedStamp, stamp)) {
      armedStamp = null;
      updatePaletteArmedUI();
      clearHint();
      return;
    }
    armedStamp = stamp;
    armedBtnEl = btnEl;
    deselect();
    updatePaletteArmedUI();
    showHint(stamp.kind === 'text' ? '✏️ Touche la carte pour écrire' : '👉 Touche la carte pour placer l\'objet');
    closePaletteOnMobile();
  }
  function sameStamp(a, b) {
    if (a.kind !== b.kind) return false;
    return a.kind === 'text' ? true : a.file === b.file;
  }
  function updatePaletteArmedUI() {
    document.querySelectorAll('.item-btn').forEach((el) => el.classList.remove('armed'));
    if (armedStamp && armedBtnEl) armedBtnEl.classList.add('armed');
    if (!armedStamp) clearHint();
  }

  function renderItemsGrid() {
    itemsGrid.innerHTML = '';
    const cat = CATEGORIES.find((c) => c.id === activeTabId);
    cat.items.forEach((it) => {
      const btn = document.createElement('button');
      btn.className = 'item-btn';
      const img = document.createElement('img');
      img.src = it.file;
      img.alt = it.label;
      img.loading = 'lazy';
      const span = document.createElement('span');
      span.textContent = it.label;
      btn.appendChild(img);
      btn.appendChild(span);
      btn.addEventListener('click', () => armStamp({ kind: 'image', file: it.file, label: it.label }, btn));
      itemsGrid.appendChild(btn);
    });
  }

  // ---------- Palette open/close (mobile drawer) ----------
  function openPalette() {
    palette.classList.add('open');
    paletteBackdrop.classList.add('open');
  }
  function closePalette() {
    palette.classList.remove('open');
    paletteBackdrop.classList.remove('open');
  }
  function closePaletteOnMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) closePalette();
  }
  paletteToggle.addEventListener('click', openPalette);
  paletteClose.addEventListener('click', closePalette);
  paletteBackdrop.addEventListener('click', closePalette);

  // ---------- Top bar actions ----------
  titleInput.addEventListener('change', () => pushHistory());
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnClear.addEventListener('click', () => {
    if (!state.items.length) return;
    if (window.confirm('Effacer tous les objets de la carte ?')) {
      state.items = [];
      deselect();
      pushHistory();
      redraw();
    }
  });

  btnRotateMinus.addEventListener('click', () => rotateSelected(-15));
  btnRotatePlus.addEventListener('click', () => rotateSelected(15));
  btnShrink.addEventListener('click', () => scaleSelected(0.85));
  btnGrow.addEventListener('click', () => scaleSelected(1.18));
  btnFront.addEventListener('click', bringFront);
  btnBack.addEventListener('click', sendBack);
  btnDeleteItem.addEventListener('click', deleteSelected);
  btnDeselect.addEventListener('click', deselect);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId && document.activeElement !== titleInput) { e.preventDefault(); deleteSelected(); }
    } else if (e.key === 'Escape') {
      deselect();
      armedStamp = null;
      updatePaletteArmedUI();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
  });

  // ---------- Export ----------
  function fileSafeTitle() {
    return (titleInput.value || 'carte-au-tresor').trim().replace(/[^a-z0-9\-_ ]/gi, '').replace(/\s+/g, '-') || 'carte-au-tresor';
  }

  function withCleanSelection(fn) {
    const had = selectedId;
    selectedId = null;
    drawOverlay();
    fn();
    selectedId = had;
    drawOverlay();
  }

  btnPng.addEventListener('click', () => {
    withCleanSelection(() => {
      baseCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileSafeTitle()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
    });
  });

  btnPdf.addEventListener('click', () => {
    withCleanSelection(() => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const imgData = baseCanvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      doc.save(`${fileSafeTitle()}.pdf`);
    });
  });

  // ---------- Init ----------
  function init() {
    renderPaperThumbs();
    renderTextTool();
    renderTabs();
    renderItemsGrid();
    updateSelectionUI();
    updateHistoryButtons();
    redraw();
    pushHistory();
  }
  init();
})();
