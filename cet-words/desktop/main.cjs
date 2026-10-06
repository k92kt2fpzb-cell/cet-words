const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')

const PORT = 3107 // Fixed origin keeps IndexedDB progress across launches.
const URL = `http://127.0.0.1:${PORT}`
let server

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

function ensureFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.once('error', reject)
    listener.listen(PORT, '127.0.0.1', () => listener.close(resolve))
  })
}

async function startServer() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'next')
    : path.join(__dirname, '..', 'desktop-dist', 'next')
  if (!fs.existsSync(path.join(root, 'server.js'))) throw new Error('缺少程序文件，请重新安装。')
  await ensureFreePort()
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env, ELECTRON_RUN_AS_NODE: '1', CET_DESKTOP: '1',
      PORT: String(PORT), HOSTNAME: '127.0.0.1',
      NODE_PATH: path.join(root, 'runtime_libs'),
    },
    stdio: 'ignore',
  })
  let spawnError
  server.on('error', error => { spawnError = error })
  for (let i = 0; i < 80; i++) {
    if (spawnError) throw spawnError
    if (server.exitCode !== null) throw new Error('本地服务启动失败。')
    try {
      const response = await fetch(URL, { signal: AbortSignal.timeout(500) })
      if (response.ok) return
    } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('本地服务启动超时。')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 840, minWidth: 800, minHeight: 600,
    title: 'CET Words',
    icon: path.join(__dirname, '..', 'cet-words.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(URL)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(URL + '/') && url !== URL) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })
  win.loadURL(URL)
}

if (gotLock) app.whenReady().then(async () => {
  try { await startServer(); createWindow() }
  catch (error) {
    dialog.showErrorBox('CET Words 无法启动', `${error.message}\n\n请关闭占用 ${PORT} 端口的程序后重试。`)
    app.quit()
  }
})

app.on('before-quit', () => { if (server && server.exitCode === null) server.kill() })
app.on('window-all-closed', () => app.quit())
