(function () {
  'use strict';

  // Résolution interne du canvas = format A4 paysage (ratio 297:210) pour un export PDF net.
  const CANVAS_W = 2000;
  const CANVAS_H = Math.round(CANVAS_W * 210 / 297); // 1414

  const ACCENT = '#c0522d';
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 3.5;

  // Poignée de rotation (le "point" au bout du petit trait au-dessus de l'objet sélectionné).
  const ROTATE_HANDLE_GAP = CANVAS_W * 0.035;
  const ROTATE_HANDLE_VISUAL_R = CANVAS_W * 0.014;
  const ROTATE_HANDLE_HIT_R = CANVAS_W * 0.05;

  // Grille des tuiles de chemin (auto-tuilage façon route de city-builder).
  const PATH_CELL = CANVAS_W * 0.05;

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
  const pathToolRow = document.getElementById('pathToolRow');
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

  const btnResetView = document.getElementById('btnResetView');

  const contextMenu = document.getElementById('contextMenu');
  const ctxDuplicate = document.getElementById('ctxDuplicate');
  const ctxDelete = document.getElementById('ctxDelete');

  baseCanvas.width = CANVAS_W;
  baseCanvas.height = CANVAS_H;
  overlayCanvas.width = CANVAS_W;
  overlayCanvas.height = CANVAS_H;

  // ---------- View zoom & pan (pincer pour zoomer sur mobile) ----------
  const canvasArea = canvasWrap.parentElement;
  let view = { scale: 1, tx: 0, ty: 0 };

  function applyView() {
    canvasWrap.style.transform = (view.scale === 1 && view.tx === 0 && view.ty === 0)
      ? ''
      : `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    const isDefault = Math.abs(view.scale - 1) < 0.01 && Math.abs(view.tx) < 0.5 && Math.abs(view.ty) < 0.5;
    btnResetView.hidden = isDefault;
  }
  function clampPan() {
    const baseW = canvasWrap.offsetWidth;
    const baseH = canvasWrap.offsetHeight;
    const maxTx = Math.max(0, (baseW * view.scale - canvasArea.clientWidth) / 2);
    const maxTy = Math.max(0, (baseH * view.scale - canvasArea.clientHeight) / 2);
    view.tx = clamp(view.tx, -maxTx, maxTx);
    view.ty = clamp(view.ty, -maxTy, maxTy);
  }
  function resetView() {
    view = { scale: 1, tx: 0, ty: 0 };
    applyView();
  }
  btnResetView.addEventListener('click', resetView);

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
  // past[past.length - 1] correspond toujours à l'état courant (chaque action
  // pousse son propre résultat) : annuler retire ce dernier étage et restaure
  // celui d'avant, plutôt que de re-restaurer l'état courant sans rien changer.
  function undo() {
    if (past.length < 2) return;
    future.push(past.pop());
    restore(past[past.length - 1]);
    updateHistoryButtons();
  }
  function redo() {
    if (!future.length) return;
    const snap = future.pop();
    past.push(snap);
    restore(snap);
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    btnUndo.disabled = past.length < 2;
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
  CATEGORIES.forEach((cat) => cat.items.forEach((it) => getImage(it.file)));

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

  function toCanvasPointFromClient(clientX, clientY) {
    const rect = canvasWrap.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }
  function toCanvasPoint(e) {
    return toCanvasPointFromClient(e.clientX, e.clientY);
  }
  // Convertit une distance en pixels écran réels vers des unités canvas, pour des seuils
  // de tolérance tactile qui restent cohérents quel que soit le zoom ou la taille d'écran.
  function pxToCanvasUnits(px) {
    const rect = canvasWrap.getBoundingClientRect();
    return rect.width > 0 ? px * (CANVAS_W / rect.width) : px;
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

  // L'objet le plus « devant » (z le plus haut) qui contient p, dans l'ordre visuel réel —
  // pas dans l'ordre d'insertion dans le tableau, qui ne bouge pas quand on avance/recule
  // un objet via "Mettre devant"/"Mettre derrière".
  function topmostHitItem(p) {
    let best = null;
    for (const it of state.items) {
      if (hitTest(it, p) && (!best || it.z > best.z)) best = it;
    }
    return best;
  }

  function rotateHandlePos(it) {
    const { h } = itemBoxSize(it);
    const localY = -(h / 2 + 14 + ROTATE_HANDLE_GAP);
    return {
      x: it.x - localY * Math.sin(it.rotation),
      y: it.y + localY * Math.cos(it.rotation),
    };
  }
  function hitRotateHandle(it, p) {
    const hp = rotateHandlePos(it);
    return Math.hypot(p.x - hp.x, p.y - hp.y) <= ROTATE_HANDLE_HIT_R;
  }

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

  function drawPathPreview(cells) {
    if (cells.length < 2) return;
    overlayCtx.save();
    overlayCtx.globalAlpha = 0.85;
    for (const tile of computePathTiles(cells)) {
      const img = getImage(`assets/tiles/${tile.tileId}.png`);
      if (!img.complete || !img.naturalWidth) continue;
      const center = cellCenter(tile.col, tile.row);
      overlayCtx.save();
      overlayCtx.translate(center.x, center.y);
      overlayCtx.rotate((tile.rotationDeg * Math.PI) / 180);
      overlayCtx.drawImage(img, -PATH_CELL / 2, -PATH_CELL / 2, PATH_CELL, PATH_CELL);
      overlayCtx.restore();
    }
    overlayCtx.restore();
  }

  function drawOverlay() {
    overlayCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (gesture && gesture.type === 'draw-path') drawPathPreview(gesture.cells);
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

    // Poignée de rotation : un petit trait qui part du haut de la sélection, terminé par un point.
    const topY = -(h / 2 + 14);
    const handleY = topY - ROTATE_HANDLE_GAP;
    overlayCtx.setLineDash([]);
    overlayCtx.lineWidth = 5;
    overlayCtx.beginPath();
    overlayCtx.moveTo(0, topY);
    overlayCtx.lineTo(0, handleY);
    overlayCtx.stroke();

    overlayCtx.beginPath();
    overlayCtx.arc(0, handleY, ROTATE_HANDLE_VISUAL_R, 0, Math.PI * 2);
    overlayCtx.fillStyle = ACCENT;
    overlayCtx.fill();
    overlayCtx.lineWidth = 5;
    overlayCtx.strokeStyle = '#fff8ea';
    overlayCtx.stroke();

    overlayCtx.restore();
  }

  function redraw() {
    drawBase();
    drawOverlay();
  }

  // ---------- Selection / toolbar ----------
  // lastSelectTime sert à repérer une sélection "fraîche" et probablement accidentelle
  // (le premier doigt d'un pincement mal synchronisé qui atterrit sur un objet). Une
  // sélection issue d'une action délibérée (dupliquer un objet) est en revanche marquée
  // comme telle d'emblée via markSelectionDeliberate, pour qu'un pincement immédiat dessus
  // reste bien interprété comme un redimensionnement voulu.
  let lastSelectTime = 0;
  function selectItem(id) {
    if (id !== selectedId) lastSelectTime = Date.now();
    selectedId = id;
    armedStamp = null;
    updatePaletteArmedUI();
    updateSelectionUI();
    redraw();
  }
  function markSelectionDeliberate() { lastSelectTime = 0; }
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
  function duplicateSelected() {
    const it = findItem(selectedId);
    if (!it) return;
    const copy = JSON.parse(JSON.stringify(it));
    copy.id = genId();
    copy.x = clamp(it.x + CANVAS_W * 0.03, 0, CANVAS_W);
    copy.y = clamp(it.y + CANVAS_W * 0.03, 0, CANVAS_H);
    copy.z = nextZ();
    if (copy.kind === 'image') lastImageW = copy.w;
    else lastTextFontSize = copy.fontSize;
    state.items.push(copy);
    selectItem(copy.id);
    markSelectionDeliberate();
    pushHistory();
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
      lastTextFontSize = it.fontSize;
    } else {
      const nw = clamp(it.w * factor, CANVAS_W * 0.03, CANVAS_W * 0.9);
      const ratio = it.h / it.w;
      it.w = nw;
      it.h = nw * ratio;
      lastImageW = it.w;
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
  // Un nouvel objet reprend par défaut la taille du précédent objet posé,
  // pour éviter de repartir d'une taille minuscule à chaque fois.
  let lastImageW = null;
  let lastTextFontSize = null;

  function createImageItem(stamp, p) {
    const img = getImage(stamp.file);
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    const w = clamp(lastImageW != null ? lastImageW : CANVAS_W * 0.14, CANVAS_W * 0.03, CANVAS_W * 0.9);
    lastImageW = w;
    return { id: genId(), kind: 'image', src: stamp.file, x: p.x, y: p.y, w, h: w * ratio, rotation: 0, z: nextZ() };
  }

  // ---------- Auto-tuilage des chemins ----------
  // Les tuiles pathStraight/pathCorner/pathEnd/pathSplit/pathCrossing connectent,
  // à rotation 0, respectivement {N,S} / {N,E} / {N} / {N,S,E} / {N,E,S,W}.
  // On choisit la tuile + rotation qui reproduisent l'ensemble de connexions voulu.
  const DIR_ORDER = ['N', 'E', 'S', 'W'];
  function rotateDirs(dirs, steps) {
    return dirs.map((d) => DIR_ORDER[(DIR_ORDER.indexOf(d) + steps) % 4]);
  }
  function dirSetKey(dirs) { return [...dirs].sort().join(''); }
  // Bases à rotation 0, une par nombre de connexions (1 à 4).
  const PATH_TILE_BASES = [
    null,
    { base: ['N'], tileId: 'pathEnd' },
    { base: ['N', 'S'], tileId: 'pathStraight' },
    { base: ['N', 'S', 'E'], tileId: 'pathSplit' },
    { base: ['N', 'E', 'S', 'W'], tileId: 'pathCrossing' },
  ];
  const PATH_CORNER_BASE = { base: ['N', 'E'], tileId: 'pathCorner' };
  function dirsToTile(dirs) {
    if (dirs.length === 0) return null;
    const key = dirSetKey(dirs);
    const candidates = dirs.length === 2 ? [PATH_TILE_BASES[2], PATH_CORNER_BASE] : [PATH_TILE_BASES[dirs.length]];
    for (const { base, tileId } of candidates) {
      for (let steps = 0; steps < 4; steps++) {
        if (dirSetKey(rotateDirs(base, steps)) === key) return { tileId, rotationDeg: steps * 90 };
      }
    }
    return null;
  }
  function pointToCell(p) {
    return { col: Math.round(p.x / PATH_CELL), row: Math.round(p.y / PATH_CELL) };
  }
  function cellCenter(col, row) {
    return { x: col * PATH_CELL, y: row * PATH_CELL };
  }
  // Ajoute à `cells` une marche orthogonale (sans diagonale) du dernier point jusqu'à `cell`,
  // pour que deux cases consécutives soient toujours voisines (utile même si le doigt saute des cases).
  function walkCellsTo(cells, cell) {
    let { col, row } = cells[cells.length - 1];
    while (col !== cell.col || row !== cell.row) {
      if (col !== cell.col) col += Math.sign(cell.col - col);
      else row += Math.sign(cell.row - row);
      cells.push({ col, row });
    }
  }
  // Déduit, pour chaque case unique de `cells`, la tuile+rotation à partir de ses voisins
  // qui appartiennent eux aussi au tracé (les connexions ne dépendent que de la grille, pas de l'ordre).
  function computePathTiles(cells) {
    const set = new Set(cells.map((c) => `${c.col},${c.row}`));
    const seen = new Set();
    const tiles = [];
    for (const c of cells) {
      const key = `${c.col},${c.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dirs = [];
      if (set.has(`${c.col},${c.row - 1}`)) dirs.push('N');
      if (set.has(`${c.col + 1},${c.row}`)) dirs.push('E');
      if (set.has(`${c.col},${c.row + 1}`)) dirs.push('S');
      if (set.has(`${c.col - 1},${c.row}`)) dirs.push('W');
      const mapped = dirsToTile(dirs);
      if (!mapped) continue;
      tiles.push({ col: c.col, row: c.row, tileId: mapped.tileId, rotationDeg: mapped.rotationDeg });
    }
    return tiles;
  }
  function createPathTileItem(tile) {
    const center = cellCenter(tile.col, tile.row);
    return {
      id: genId(), kind: 'image', src: `assets/tiles/${tile.tileId}.png`,
      x: center.x, y: center.y, w: PATH_CELL, h: PATH_CELL,
      rotation: (tile.rotationDeg * Math.PI) / 180, z: nextZ(),
    };
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
    const fontSize = clamp(lastTextFontSize != null ? lastTextFontSize : CANVAS_W * 0.04, CANVAS_W * 0.015, CANVAS_W * 0.14);
    lastTextFontSize = fontSize;
    const item = {
      id: genId(), kind: 'text', text, x: p.x, y: p.y,
      fontSize, rotation: 0, color: '#3b2a1a', z: nextZ(),
    };
    state.items.push(item);
    pushHistory();
    redraw();
  }

  async function editTextItem(it) {
    const text = await askText(it.text);
    if (!text) return;
    it.text = text;
    pushHistory();
    redraw();
  }

  // ---------- Menu contextuel (appui long sur un objet posé) ----------
  const LONG_PRESS_MS = 500;
  let longPressTimer = null;

  function clearLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  function startLongPress(id, clientX, clientY) {
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (gesture && gesture.type === 'drag-item' && gesture.id === id && !gesture.moved) {
        gesture = null;
        openContextMenu(clientX, clientY);
      }
    }, LONG_PRESS_MS);
  }
  function openContextMenu(clientX, clientY) {
    contextMenu.hidden = false;
    const margin = 8;
    const mw = contextMenu.offsetWidth;
    const mh = contextMenu.offsetHeight;
    const left = clamp(clientX - mw / 2, margin, window.innerWidth - mw - margin);
    const top = clamp(clientY - mh - 16, margin, window.innerHeight - mh - margin);
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
  }
  function closeContextMenu() {
    contextMenu.hidden = true;
  }
  ctxDuplicate.addEventListener('click', () => { duplicateSelected(); closeContextMenu(); });
  ctxDelete.addEventListener('click', () => { deleteSelected(); closeContextMenu(); });
  document.addEventListener('pointerdown', (e) => {
    if (!contextMenu.hidden && !contextMenu.contains(e.target)) closeContextMenu();
  });

  // ---------- Pointer interaction on canvas (souris + doigts) ----------
  // pointers : suit chaque doigt/pointeur actif, en coordonnées écran (clientX/Y).
  const pointers = new Map();
  let gesture = null;

  function startSinglePointerGesture(e) {
    clearLongPress();
    const p = toCanvasPoint(e);

    if (selectedId) {
      const it = findItem(selectedId);
      if (it && hitRotateHandle(it, p)) {
        gesture = {
          type: 'rotate-item', pointerId: e.pointerId, id: it.id,
          startAngle: Math.atan2(p.y - it.y, p.x - it.x),
          startRotation: it.rotation, moved: false,
        };
        return;
      }
    }

    const hit = topmostHitItem(p);
    if (hit) {
      selectItem(hit.id);
      gesture = { type: 'drag-item', pointerId: e.pointerId, id: hit.id, startPx: p, startCx: hit.x, startCy: hit.y, moved: false };
      startLongPress(hit.id, e.clientX, e.clientY);
      return;
    }

    if (armedStamp) {
      if (armedStamp.kind === 'text') {
        placeTextAt(p);
        gesture = null;
      } else if (armedStamp.kind === 'path') {
        gesture = { type: 'draw-path', pointerId: e.pointerId, cells: [pointToCell(p)] };
      } else {
        // Poser un objet le valide directement : pas de sélection ni de menu d'édition,
        // et l'outil reste actif pour enchaîner d'autres poses du même objet.
        const item = createImageItem(armedStamp, p);
        state.items.push(item);
        pushHistory();
        redraw();
        gesture = null;
      }
      return;
    }

    // Zone vide : simple appui = désélection ; glisser = déplacer la vue si elle est zoomée.
    gesture = {
      type: 'pan-view', pointerId: e.pointerId,
      startClientX: e.clientX, startClientY: e.clientY,
      tx0: view.tx, ty0: view.ty, moved: false,
    };
  }

  // Deux doigts posés parfaitement en même temps n'existent pas : l'un touche toujours
  // la carte une fraction de seconde avant l'autre. S'il atterrit sur un objet, celui-ci
  // se sélectionne, et le pincement serait alors interprété à tort comme un redimensionnement
  // de cet objet plutôt qu'un zoom de la carte. On ignore donc une sélection trop récente,
  // en la traitant comme accidentelle plutôt que comme un choix délibéré de l'utilisateur.
  const PINCH_ACCIDENTAL_SELECT_MS = 350;

  function startTwoPointerGesture() {
    clearLongPress();
    const ids = [...pointers.keys()];
    const a = pointers.get(ids[0]);
    const b = pointers.get(ids[1]);

    const selectionIsDeliberate = selectedId && (Date.now() - lastSelectTime) > PINCH_ACCIDENTAL_SELECT_MS;
    if (selectedId && !selectionIsDeliberate) deselect();

    if (selectionIsDeliberate) {
      const it = findItem(selectedId);
      if (it) {
        const ca = toCanvasPointFromClient(a.x, a.y);
        const cb = toCanvasPointFromClient(b.x, b.y);
        gesture = {
          type: 'pinch-item', ids, id: it.id,
          startDist: Math.hypot(cb.x - ca.x, cb.y - ca.y),
          startAngle: Math.atan2(cb.y - ca.y, cb.x - ca.x),
          startW: it.w, startH: it.h, startFontSize: it.fontSize,
          startRotation: it.rotation, isText: it.kind === 'text', moved: false,
        };
        return;
      }
    }

    const rect = canvasWrap.getBoundingClientRect();
    const baseW = canvasWrap.offsetWidth;
    const baseH = canvasWrap.offsetHeight;
    const originX = baseW / 2, originY = baseH / 2;
    const s0 = view.scale, tx0 = view.tx, ty0 = view.ty;
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    gesture = {
      type: 'pinch-view', ids,
      startDist: Math.hypot(b.x - a.x, b.y - a.y),
      startScale: s0,
      layoutX: rect.left - tx0 - originX * (1 - s0),
      layoutY: rect.top - ty0 - originY * (1 - s0),
      originX, originY,
      Lx: (midX - rect.left) / s0,
      Ly: (midY - rect.top) / s0,
    };
  }

  canvasWrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvasWrap.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché : sans gravité */ }

    if (pointers.size === 1) {
      startSinglePointerGesture(e);
    } else if (pointers.size === 2) {
      startTwoPointerGesture();
    }
  });

  canvasWrap.addEventListener('dblclick', (e) => {
    const p = toCanvasPoint(e);
    const hit = topmostHitItem(p);
    if (hit && hit.kind === 'text') editTextItem(hit);
  });

  canvasWrap.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;

    if (gesture.type === 'drag-item' && gesture.pointerId === e.pointerId) {
      const p = toCanvasPoint(e);
      const it = findItem(gesture.id);
      if (!it) return;
      const dx = p.x - gesture.startPx.x;
      const dy = p.y - gesture.startPx.y;
      it.x = clamp(gesture.startCx + dx, 0, CANVAS_W);
      it.y = clamp(gesture.startCy + dy, 0, CANVAS_H);
      // Seuil en pixels écran réels (pas en unités canvas) : un doigt qui tremble
      // légèrement pendant un appui long ne doit pas annuler le menu contextuel.
      const moveThreshold = pxToCanvasUnits(10);
      if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) gesture.moved = true;
      redraw();

    } else if (gesture.type === 'rotate-item' && gesture.pointerId === e.pointerId) {
      const p = toCanvasPoint(e);
      const it = findItem(gesture.id);
      if (!it) return;
      const angle = Math.atan2(p.y - it.y, p.x - it.x);
      it.rotation = gesture.startRotation + (angle - gesture.startAngle);
      gesture.moved = true;
      redraw();

    } else if (gesture.type === 'pinch-item') {
      const it = findItem(gesture.id);
      const a = pointers.get(gesture.ids[0]);
      const b = pointers.get(gesture.ids[1]);
      if (!it || !a || !b) return;
      const ca = toCanvasPointFromClient(a.x, a.y);
      const cb = toCanvasPointFromClient(b.x, b.y);
      const dist = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const angle = Math.atan2(cb.y - ca.y, cb.x - ca.x);
      const factor = gesture.startDist > 0 ? dist / gesture.startDist : 1;
      it.rotation = gesture.startRotation + (angle - gesture.startAngle);
      if (gesture.isText) {
        it.fontSize = clamp(gesture.startFontSize * factor, CANVAS_W * 0.015, CANVAS_W * 0.14);
        lastTextFontSize = it.fontSize;
      } else {
        const nw = clamp(gesture.startW * factor, CANVAS_W * 0.03, CANVAS_W * 0.9);
        const ratio = gesture.startH / gesture.startW;
        it.w = nw;
        it.h = nw * ratio;
        lastImageW = it.w;
      }
      gesture.moved = true;
      redraw();

    } else if (gesture.type === 'pinch-view') {
      const a = pointers.get(gesture.ids[0]);
      const b = pointers.get(gesture.ids[1]);
      if (!a || !b) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const factor = gesture.startDist > 0 ? dist / gesture.startDist : 1;
      const newScale = clamp(gesture.startScale * factor, MIN_SCALE, MAX_SCALE);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      view.scale = newScale;
      view.tx = midX - gesture.Lx * newScale - gesture.layoutX - gesture.originX * (1 - newScale);
      view.ty = midY - gesture.Ly * newScale - gesture.layoutY - gesture.originY * (1 - newScale);
      clampPan();
      applyView();

    } else if (gesture.type === 'draw-path' && gesture.pointerId === e.pointerId) {
      const p = toCanvasPoint(e);
      walkCellsTo(gesture.cells, pointToCell(p));
      redraw();

    } else if (gesture.type === 'pan-view' && gesture.pointerId === e.pointerId) {
      const dx = e.clientX - gesture.startClientX;
      const dy = e.clientY - gesture.startClientY;
      const prevTx = view.tx, prevTy = view.ty;
      view.tx = gesture.tx0 + dx;
      view.ty = gesture.ty0 + dy;
      clampPan();
      if (view.tx !== prevTx || view.ty !== prevTy) {
        gesture.moved = true;
        applyView();
      }
    }
  });

  function finishGesture(g) {
    if (!g) return;
    if (g.type === 'drag-item' || g.type === 'rotate-item' || g.type === 'pinch-item') {
      if (g.moved) pushHistory();
    } else if (g.type === 'pan-view' && !g.moved) {
      deselect();
    } else if (g.type === 'draw-path' && g.cells.length > 1) {
      for (const tile of computePathTiles(g.cells)) {
        state.items.push(createPathTileItem(tile));
      }
      deselect();
      pushHistory();
    }
  }

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    clearLongPress();
    if (gesture && (gesture.pointerId === e.pointerId || (gesture.ids && gesture.ids.includes(e.pointerId)))) {
      const g = gesture;
      gesture = null; // avant finishGesture, pour que le redraw final n'affiche plus l'aperçu
      finishGesture(g);
    }
  }
  canvasWrap.addEventListener('pointerup', endPointer);
  canvasWrap.addEventListener('pointercancel', endPointer);

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

  function renderPathTool() {
    pathToolRow.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'item-btn text-tool';
    btn.innerHTML = '<span style="font-size:1.4rem">🧭</span><span>Tracer un chemin au doigt</span>';
    btn.addEventListener('click', () => armStamp({ kind: 'path' }, btn));
    pathToolRow.appendChild(btn);
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
    showHint(
      stamp.kind === 'text' ? '✏️ Touche la carte pour écrire (plusieurs fois possible)'
        : stamp.kind === 'path' ? '🧭 Glisse le doigt sur la carte pour tracer un chemin'
        : '👉 Touche la carte pour poser l\'objet (plusieurs fois possible)'
    );
    closePaletteOnMobile();
  }
  function sameStamp(a, b) {
    if (a.kind !== b.kind) return false;
    return a.kind === 'image' ? a.file === b.file : true;
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
      closeContextMenu();
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
    renderPathTool();
    renderTabs();
    renderItemsGrid();
    updateSelectionUI();
    updateHistoryButtons();
    applyView();
    redraw();
    pushHistory();
  }
  init();
})();
