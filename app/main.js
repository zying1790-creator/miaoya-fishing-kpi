const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let layoutState = {
  minimized: false,
  panelOpen: false,
  petX: 0,
  petY: 0,
  petW: 236,
  petH: 268
};

const PET_W = 236;
const PET_H = 268;
const PET_MIN_W = 220;
const PET_MIN_H = 54;
const PANEL_W = 236;
const PANEL_H = 260;
const GAP = 10;
const EDGE = 8;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getWorkAreaForPoint(x, y) {
  const display = screen.getDisplayNearestPoint({ x, y });
  return display.workArea;
}

function bringToFront() {
  if (!mainWindow) return;
  try {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.moveTop();
  } catch (e) {}
}

function getPetScreenBounds() {
  const b = mainWindow.getBounds();
  return {
    x: b.x + layoutState.petX,
    y: b.y + layoutState.petY,
    width: layoutState.petW,
    height: layoutState.petH
  };
}

function setWindowToPetOnly({ minimized = layoutState.minimized } = {}) {
  if (!mainWindow) return null;

  const pet = getPetScreenBounds();
  const w = minimized ? PET_MIN_W : PET_W;
  const h = minimized ? PET_MIN_H : PET_H;
  const work = getWorkAreaForPoint(pet.x, pet.y);

  const x = clamp(pet.x, work.x + EDGE, work.x + work.width - w - EDGE);
  const y = clamp(pet.y, work.y + EDGE, work.y + work.height - h - EDGE);

  layoutState = {
    minimized,
    panelOpen: false,
    petX: 0,
    petY: 0,
    petW: w,
    petH: h
  };

  mainWindow.setBounds({ x, y, width: w, height: h }, false);
  bringToFront();
  return { petX: 0, petY: 0, panelX: 0, panelY: 0, side: 'none', width: w, height: h };
}

function computePanelLayout() {
  const pet = getPetScreenBounds();
  const petW = PET_W;
  const petH = PET_H;
  const panelW = PANEL_W;
  const panelH = PANEL_H;
  const work = getWorkAreaForPoint(pet.x + Math.round(petW / 2), pet.y + Math.round(petH / 2));

  const spaces = {
    right: (work.x + work.width) - (pet.x + petW),
    left: pet.x - work.x,
    bottom: (work.y + work.height) - (pet.y + petH),
    top: pet.y - work.y
  };

  const fits = {
    right: spaces.right >= panelW + GAP,
    left: spaces.left >= panelW + GAP,
    bottom: spaces.bottom >= panelH + GAP,
    top: spaces.top >= panelH + GAP
  };

  const petCenterX = pet.x + petW / 2;
  const petCenterY = pet.y + petH / 2;
  const relX = (petCenterX - work.x) / work.width;
  const relY = (petCenterY - work.y) / work.height;

  let side = null;

  // 边缘优先：靠上就往下弹，靠下就往上弹，靠右就往左弹，靠左就往右弹。
  // 这样桌宠本身不会被面板挤走，也不会出现面板盖住桌宠。
  if (relY < 0.30 && fits.bottom) side = 'bottom';
  else if (relY > 0.70 && fits.top) side = 'top';
  else if (relX > 0.62 && fits.left) side = 'left';
  else if (relX < 0.38 && fits.right) side = 'right';
  else if (fits.right) side = 'right';
  else if (fits.left) side = 'left';
  else if (fits.bottom) side = 'bottom';
  else if (fits.top) side = 'top';
  else {
    // 极端小屏兜底：选择剩余空间最大的方向。
    side = Object.entries(spaces).sort((a, b) => b[1] - a[1])[0][0];
  }

  let winX, winY, winW, winH, petX, petY, panelX, panelY;

  if (side === 'right') {
    winW = petW + GAP + panelW;
    winH = Math.max(petH, panelH);
    winX = pet.x;
    winY = Math.round(pet.y - (winH - petH) / 2);
    petX = 0;
    petY = pet.y - winY;
    panelX = petW + GAP;
    panelY = Math.round(petY + (petH - panelH) / 2);
  } else if (side === 'left') {
    winW = petW + GAP + panelW;
    winH = Math.max(petH, panelH);
    winX = pet.x - panelW - GAP;
    winY = Math.round(pet.y - (winH - petH) / 2);
    petX = panelW + GAP;
    petY = pet.y - winY;
    panelX = 0;
    panelY = Math.round(petY + (petH - panelH) / 2);
  } else if (side === 'bottom') {
    winW = Math.max(petW, panelW);
    winH = petH + GAP + panelH;
    winX = Math.round(pet.x - (winW - petW) / 2);
    winY = pet.y;
    petX = pet.x - winX;
    petY = 0;
    panelX = Math.round(petX + (petW - panelW) / 2);
    panelY = petH + GAP;
  } else {
    winW = Math.max(petW, panelW);
    winH = petH + GAP + panelH;
    winX = Math.round(pet.x - (winW - petW) / 2);
    winY = pet.y - panelH - GAP;
    petX = pet.x - winX;
    petY = panelH + GAP;
    panelX = Math.round(petX + (petW - panelW) / 2);
    panelY = 0;
  }

  // 只有在极端贴边 / 小屏时才整体回拉，正常情况下宠物保持原桌面位置。
  const clampedWinX = clamp(winX, work.x + EDGE, work.x + work.width - winW - EDGE);
  const clampedWinY = clamp(winY, work.y + EDGE, work.y + work.height - winH - EDGE);
  const dx = winX - clampedWinX;
  const dy = winY - clampedWinY;
  winX = clampedWinX;
  winY = clampedWinY;
  petX += dx;
  petY += dy;
  panelX += dx;
  panelY += dy;

  petX = clamp(Math.round(petX), 0, winW - petW);
  petY = clamp(Math.round(petY), 0, winH - petH);
  panelX = clamp(Math.round(panelX), 0, winW - panelW);
  panelY = clamp(Math.round(panelY), 0, winH - panelH);

  return {
    side,
    x: Math.round(winX),
    y: Math.round(winY),
    width: Math.round(winW),
    height: Math.round(winH),
    petX,
    petY,
    panelX,
    panelY,
    panelW,
    panelH,
    petW,
    petH
  };
}

function openPanelWindow() {
  if (!mainWindow) return null;

  // Opening a panel always restores the full pet body.
  layoutState.minimized = false;
  layoutState.petW = PET_W;
  layoutState.petH = PET_H;

  const layout = computePanelLayout();

  layoutState = {
    minimized: false,
    panelOpen: true,
    petX: layout.petX,
    petY: layout.petY,
    petW: PET_W,
    petH: PET_H
  };

  mainWindow.setBounds({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height
  }, false);

  bringToFront();
  return layout;
}

function closePanelWindow() {
  return setWindowToPetOnly({ minimized: false });
}

function setMinimizedMode(minimized) {
  return setWindowToPetOnly({ minimized: !!minimized });
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = PET_W;
  const height = PET_H;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
    title: '喵呀摸鱼KPI',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    bringToFront();
  });

  mainWindow.on('move', () => {
    // When user drags the native frameless window, keep the known local pet offset.
    bringToFront();
  });
  mainWindow.on('blur', bringToFront);
  mainWindow.on('focus', bringToFront);
  mainWindow.on('show', bringToFront);

  mainWindow.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: '重新载入', click: () => mainWindow && mainWindow.reload() },
      { type: 'separator' },
      { label: '退出喵呀摸鱼KPI', click: () => app.quit() }
    ]).popup({ window: mainWindow });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    bringToFront();
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:reload', () => mainWindow && mainWindow.reload());
  ipcMain.handle('app:setMinimized', (_event, minimized) => setMinimizedMode(!!minimized));
  ipcMain.handle('app:openPanel', () => openPanelWindow());
  ipcMain.handle('app:closePanel', () => closePanelWindow());
  ipcMain.handle('app:bringToFront', () => bringToFront());
}
