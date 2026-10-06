# CET Words · 四六级智能词汇学习与记忆管理系统

按 `CET_Words_Product_Plan.md` 实现的四六级背单词软件（V1 全部功能 + 依赖现有词库数据的 V2 项）。

## 功能

- **今日**：考试倒计时、当前词单、今日任务（待复习 / 今日新词 / 顽固词）、今日进度、连续学习天数、掌握统计、落后追赶建议、冲刺模式提示；**每天都会同时安排新词和复习**（没有到期卡片时自动挑记忆最弱的词做“巩固复习”）；**每日学习时间真正参与排课**（复习按每张 12 秒先扣除，剩余预算折算新词数量，超出显示“受时间预算限制”）。
- **学习/复习**：三选一即可，不再手动评分 —— 认识 / 模糊 / 不认识，分别对应 FSRS 的 Good / Hard / Again，系统据此决定这个单词之后的出现频率。选完**直接展开全部内容**（释义、英释、例句、记忆方法、词根词缀、常见搭配、同义反义、真题语境、AI 助手），看完点「下一个单词」即可。**选“模糊/不认识”的词会在今天的队列里反复出现，直到你选“认识”为止**；**每背完 N 个词（默认 8，可改/可关）自动弹出一次阶段复习**，把刚背的词一起过一遍，想不起来的可一键重新排队。
- **词单（学习范围）**：四级/六级各自可选 —— 考纲全量 / 高频重点 / 考前急救 / 真题词 / 熟词僻义专项，词单随时可换、进度不丢。
- **六级考纲包含四级词汇**：六级默认按「四级 + 六级」备考（合计 4770 词，因为六级考试会用到四级词），
  也可以在设置里关掉，只学六级新增的 580 个词（适合四级刚考完、想短期冲六级的同学）。
- **写作 · 翻译表达库**（独立页签）：从真题语料里提取 —— 写作 220 条高分句型 + 8 类高分句式模板、
  翻译 160 条常用句式，可搜索、可一键复制，完全离线、不消耗 AI 额度；还支持**按主题让 AI 生成表达包**
  （如“环境保护”“人工智能”）和**从网页提取**（贴一个网址，服务端抓取正文后由 AI 提炼成 15 条表达）。
- **新词数量两种模式**：自定义每天多少个，或**考前背完**（按考试日期自动倒推每天需要学多少，并可设置提前几天完成第一轮）。
- **复习排期**：Review First，到期复习 / 巩固复习 / 遗忘词 / 顽固词 / 熟词僻义 / 真题高频统一排期；**冲刺模式按 30/20/20/15/10 配额组卷**（高频词 / 错词 / 遗忘词 / 真题词 / 熟词僻义）并显示配额实际命中。
- **单词本**：全部 / 未学习 / 学习中 / 已掌握 / 收藏 / 错词 / 顽固词 / 熟词僻义 / 高频词 / 真题词，支持中英文搜索、单词详情、FSRS 记忆数据、手动加入“熟词僻义专项”。
- **AI 助手**：AI 助记（词根拆解 / 联想记忆 / 易混词 / 一句话记忆）、AI 例句（按你填的专业或兴趣生成）、AI 解释（对单词自由提问），DeepSeek 流式输出，结果本地缓存。
- **数据**：今日 / 本周 / 累计学习、掌握分布、连续学习、学习曲线（7 天 / 30 天 / 全部）、预计记忆保持率、熟词僻义掌握率、未来 7 天复习量、学习日历。
- **设置**：四级 / 六级、词单、考试日期、新词数量（自定义 / 考前背完）、每日学习时间、阶段小结频率、周末加强模式、AI 助手（自己的 Key / 模型 / 接口地址 / 专业背景 / 自动助记 / 测试连接）、数据导出与重置。

## AI 助手（DeepSeek）

四种能力：**AI 助记**、**AI 例句**（结合设置里的专业/兴趣背景）、**AI 解释**（自由提问，例如“为什么 issue 还有发行的意思”）、
**AI 表达**（写作/翻译表达包按主题生成；或给一个网页地址，抓取正文后提炼表达）。

**每个用户填自己的 Key**：设置 → AI 助手 → 填 API Key（只保存在本机浏览器，不会上传），可选 deepseek-chat /
deepseek-reasoner，可点“测试连接”验证。**不填 Key 就完全不会调用 DeepSeek**：AI 区域会提示需要先填 Key，
其他所有功能（背单词、复习、词单、统计）都不受影响。项目里不预置任何密钥。

可选：想在新词卡片上自动生成助记，在设置里打开“学新词时自动生成 AI 助记”（默认关闭，会按词消耗你自己的额度）。

链路：浏览器 → 本机 `/api/ai`（Next Route Handler 代理，避免浏览器直连的 CORS 与密钥暴露问题）→ DeepSeek `/chat/completions`（流式 SSE）。
结果按「单词 + 任务 + 模型」缓存在本地 `ai` 表，同一个单词不会重复消耗额度，需要时可点“重新生成”。

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

**桌面安装版（推荐）**：运行 `release-desktop/CET Words Setup <版本>.exe` 安装。桌面 **CET Words** 图标
直接启动独立程序窗口，无浏览器地址栏；关闭窗口时本地服务一同退出，重复双击会聚焦已有窗口。
也可以使用同目录的 `CET Words <版本>.exe` 免安装运行。

旧版使用 Edge 保存的学习记录与桌面版分开存放。需要迁移时，先在旧版的「设置 → 导出学习数据」
保存 JSON，再在桌面版「设置 → 导入学习数据」选择文件。导入会覆盖桌面版现有进度和设置。

生成桌面安装包：

```powershell
npm run desktop:package
```

桌面程序在后台使用本机 3107 端口；如果该端口被占用，会提示关闭占用的程序。

**旧版 Edge 快捷方式**：`pwsh -File scripts/create-shortcuts.ps1` 可创建旧方式的图标，
它会覆盖桌面安装版的同名快捷方式；需要旧版时可直接双击项目里的 `CET Words.vbs`。

- 重新生成图标：`pwsh -File scripts/make-icon.ps1`
- 旧版学习数据保存在打开它的那个浏览器里
- 旧版脚本日志：`%TEMP%\cet-words-launcher.log`、`%TEMP%\cet-words-server.log`

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

## 分享给朋友（免安装版）

```bash
node scripts/make-package.mjs        # 生成 dist/CET-Words-<版本>-win64.zip（含 Node 运行时）
```

对方解压后双击「安装到桌面.cmd」即可，不需要安装任何环境。安装包内置**自动更新**：
启动时读取程序目录的 `update-config.txt`，如果配置了更新源（`update.json` 的直链地址），
有新版本会只下载约 7 MB 的应用负载并自动替换，朋友不用重新接收安装包。

发布新版本：

```bash
# 1) 改大 package.json 里的 version
# 2) 生成完整包 + 更新包 + 更新清单
node scripts/make-package.mjs
# 3) 上传 dist/update/ 里的两个文件到你的更新源（ssh / 对象存储 / 手动三种方式）
node scripts/deploy-update.mjs       # 见 deploy.config.example.json
```

`dist/发布更新说明.txt` 里有逐步说明。更新校验使用 sha256，下载后校验不通过会自动放弃并继续用旧版本。

## 许可证与致谢

- 本项目代码：**MIT License**，见 [LICENSE](./LICENSE)。
- 词库与真题例句数据：来自 **KyleBing/english-vocabulary**（**BSD 3-Clause**，
  Copyright (c) 2022-2026, KyleBing）。本项目与其作者**没有隶属或背书关系**，
  仅按 BSD 3-Clause 条款在保留版权与许可声明的前提下使用其数据。
- 第三方组件与 Node.js 运行时的许可证清单：[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

分发源码或安装包时请一并保留 `LICENSE`、`THIRD-PARTY-NOTICES.md` 与 `licenses/` 目录。
