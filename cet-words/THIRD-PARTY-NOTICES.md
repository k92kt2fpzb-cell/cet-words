# 第三方资源与许可证（Third-Party Notices）

本项目（CET Words 程序代码、界面、调度与复习逻辑）采用 **MIT License**，见 [LICENSE](./LICENSE)。
程序里用到的词库数据与第三方组件如下，分发（源码或安装包）时请一并保留本文件。

---

## 1. 词库与真题例句数据

- 来源项目：**KyleBing/english-vocabulary** — https://github.com/KyleBing/english-vocabulary
- 许可证：**BSD 3-Clause License**
- 版权：Copyright (c) 2022-2026, KyleBing
- 许可证全文：[licenses/english-vocabulary-LICENSE.txt](./licenses/english-vocabulary-LICENSE.txt)

使用范围：本项目的四六级词表（单词、音标、释义、例句、短语、同义词、词根词缀）与真题例句语料，
均由该项目的数据文件（四级/六级 JSONL）转换而来，转换脚本见 `scripts/build-wordbank.mjs`、
`scripts/build-expressions.mjs`。

**声明**：本项目与 KyleBing/english-vocabulary 项目及其作者**没有隶属、合作或背书关系**
（BSD 3-Clause 明确要求不得使用版权人名义为衍生作品背书）。原始数据的版权归其作者所有；
本项目仅按 BSD 3-Clause 的条款在保留上述版权与许可声明的前提下使用。

## 2. 运行时与第三方组件

安装包（免安装版）内含 Node.js 运行时，另附其许可证：`node/LICENSE`。

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| Next.js | 16.3.8 | MIT |
| React / React DOM | 19.3.0 | MIT |
| ts-fsrs | 5.4.2 | MIT |
| Tailwind CSS | 4.3.3 | MIT |
| Dexie / dexie-react-hooks | 4.4.6 / 4.4.0 | Apache-2.0 |
| lucide-react | 1.51.0 | ISC |
| Node.js（随安装包分发） | 24.21.0 | MIT |

各组件版权归其各自作者所有，均以原许可证分发，未做修改（Node.js 与各 npm 包按原样打包）。
源码仓库通过 `package.json` 声明依赖，不在仓库内二次分发这些组件的源码。

## 3. AI 服务

AI 功能（助记 / 例句 / 解释 / 表达包）由使用者**自行提供 DeepSeek API Key** 调用
https://api.deepseek.com 的接口，本项目不包含、不转发、不存储任何第三方账号或密钥。
相关输出内容由模型实时生成，仅供学习参考。

## 4. 学习数据

使用者的学习进度、收藏、AI 缓存与表达库都只保存在本机浏览器（IndexedDB）里，
本项目不上传、不收集任何用户数据。
