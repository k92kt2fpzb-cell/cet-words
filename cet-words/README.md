# CET Words · 四六级智能词汇学习与记忆管理系统

按 `CET_Words_Product_Plan.md` 实现的四六级背单词软件（V1 全部功能 + 依赖现有词库数据的 V2 项）。

## 功能

- **今日**：考试倒计时、今日任务（待复习 / 今日新词 / 顽固词）、今日进度、连续学习天数、掌握统计、落后追赶建议、冲刺模式提示。
- **学习**：按考试权重排序的新词队列，四阶段流程 —— 主动回忆（认识 / 模糊 / 不认识）→ 展示释义例句 → 记忆辅助（记忆法 / 词根词缀 / 常见搭配 / 真题语境）→ FSRS 四档评分（Again / Hard / Good / Easy，带预计间隔）。
- **复习**：Review First，到期复习 / 遗忘词 / 顽固词 / 熟词僻义 / 真题高频统一排期；学习中的卡片会在同一组内再次出现。
- **单词本**：全部 / 未学习 / 学习中 / 已掌握 / 收藏 / 错词 / 顽固词 / 熟词僻义 / 高频词 / 真题词，支持中英文搜索、单词详情与 FSRS 记忆数据。
- **数据**：今日 / 本周 / 累计学习、掌握分布、连续学习、学习曲线（7 天 / 30 天 / 全部）、预计记忆保持率、熟词僻义掌握率、未来 7 天复习量、学习日历。
- **设置**：四级 / 六级、考试日期、每日新词数、每日学习时间、周末加强模式、数据导出与重置。

## 技术栈

- Next.js（App Router）+ TypeScript + Tailwind CSS
- IndexedDB（Dexie）本地保存词库与学习进度，无需后端
- ts-fsrs（FSRS）间隔重复调度

## 开发

```bash
npm install
npm run dev     # http://localhost:3100
npm run build
```

> 本机 Node/npm 装在 `C:\Users\Lenovo\.cache\nodejs-lts`，命令前先执行
> `$env:PATH='C:/Users/Lenovo/.cache/nodejs-lts;'+$env:PATH`。

## 打开软件（日常使用）

**桌面图标（推荐）**：桌面和开始菜单里的 **CET Words** 图标（由 `pwsh -File scripts/create-shortcuts.ps1` 创建）
双击即用：本地服务没在运行会自动在后台启动，然后用 **Edge** 的独立应用窗口打开
（`--app` 模式：没有地址栏和标签页，任务栏上是独立图标，和普通桌面软件一样）；
重复双击不会重复启动服务。可以右键固定到任务栏或开始屏幕。

- 重新生成图标：`pwsh -File scripts/make-icon.ps1`
- 想换浏览器：改 `CET Words.vbs` 里 `FindBrowser` 的候选顺序（默认 Edge → Chrome）
- 学习数据保存在打开它的那个浏览器里，请固定用桌面图标打开
- 日志：`%TEMP%\cet-words-launcher.log`、`%TEMP%\cet-words-server.log`

**备用方式**：双击项目根目录的 **`启动 CET Words.cmd`**：它会启动服务并自动打开浏览器
（`http://localhost:3100`），关闭那个黑窗口即退出程序。首次运行若缺少构建产物会自动构建。

也可以手动启动：

```powershell
cd 'E:\ChatGPT-Projects\cet word\cet-words'
$env:PATH='C:/Users/Lenovo/.cache/nodejs-lts;'+$env:PATH
npm run dev        # 开发模式（改代码即时生效）
# 或
npm run build; npm start   # 生产模式（更快）
```

## 验证

```bash
node scripts/smoke-test.mjs
```

用无头 Chrome（CDP）真实跑一遍完整链路，共 33 项断言：首次导入词库 → 今日页计划 →
学习四阶段与 FSRS 评分 → 学习步卡片同组重现 → 复习队列与次日排期 → 单词本分类/搜索/详情 →
数据页统计 → 设置持久化 → 冲刺模式。脚本会按需自行启动 `next start`，截图输出到
`%TEMP%\cet-shots`。

## 词库

词库来源：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)（四级 4901 行 + 六级 1228 行，合并去重后 4770 个单词）。

```bash
# 原始 JSONL 放到 data-src/cet4.raw.jsonl 与 data-src/cet6.raw.jsonl
node scripts/build-wordbank.mjs   # 生成 public/data/wordbank.json
```

构建脚本把音标、释义、例句、短语、同义词、词根词缀、真题例句（含年份与题型）归一化，并按
`真题出现次数 → 熟词僻义 → 词库顺序` 计算新词学习优先级。
