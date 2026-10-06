import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.join(root, '.next', 'standalone')
const target = path.join(root, 'desktop-dist', 'next')
if (!fs.existsSync(path.join(source, 'server.js'))) throw new Error('请先运行 npm run build')
fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })
// electron-builder omits directories named node_modules inside extraResources.
fs.renameSync(path.join(target, 'node_modules'), path.join(target, 'runtime_libs'))
fs.cpSync(path.join(root, '.next', 'static'), path.join(target, '.next', 'static'), { recursive: true })
fs.cpSync(path.join(root, 'public'), path.join(target, 'public'), { recursive: true })
for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) {
  fs.copyFileSync(path.join(root, name), path.join(target, 'public', name))
}
fs.cpSync(path.join(root, 'licenses'), path.join(target, 'public', 'licenses'), { recursive: true })
console.log(`桌面程序文件已准备好：${target}`)
