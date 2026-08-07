# Changelog

## 0.2.1 — 2026-08-07

- Added native Windows x64 and Linux x86_64 desktop build and release pipelines alongside macOS Apple Silicon.
- Replaced Bash-only helper builds with portable Node.js scripts and added Windows `.exe` runtime wiring for `silverc` and `kascov-preflight`.
- Removed the installed application's Python dependency by porting heuristic contract triage to built-in JavaScript.
- Added target-OS tests, native helper verification, platform packages, and SHA-256 release manifests.

## 0.2.1 — 2026-08-07（中文）

- 在 macOS Apple Silicon 之外增加 Windows x64 与 Linux x86_64 原生桌面构建和发布流程。
- 将仅支持 Bash 的辅助工具构建改为跨平台 Node.js 脚本，并补齐 Windows 下 `silverc` 与 `kascov-preflight` 的 `.exe` 运行时路径。
- 将轻量契约扫描移植到内置 JavaScript，移除安装后应用对 Python 的依赖。
- 增加目标操作系统测试、原生辅助工具验证、平台安装包和 SHA-256 发布清单。

## 0.2.0 — 2026-08-06

- Upgraded the default pinned official SilverScript compiler to `4b0e1cd69739934f92c3ac4df1bb13d912418b2b`; retained `2a3961c` as a SHA-256-pinned legacy reproducibility profile.
- Added compiler breaking-change detection, typed constructor-array adaptation, and conservative source migration.
- Added replaceable, independently verified `CovenantStateSource` providers.
- Added isolated P2PK co-spend wallet authorization and a 2–32 input atomic multi-covenant builder.
- Added TN10 Experimental Merkle one-time claim and Commit/Reveal templates with deterministic operation builders.
- Added a four-contract TN10 Experimental KCC721 research pack; standalone and mainnet deployment remain blocked.
- Replaced raw KCC721 identity/digest inputs with a bilingual three-step wizard, deterministic local metadata hashing, an explicit non-deployable new-collection preview, and strict existing-collection ID validation.
- Added bilingual UI and documentation for the new compiler, proof, signing, and atomic-operation workflows.
- Expanded adversarial tests to cover compiler migration, false state candidates, P2PK input isolation, atomic binding, valid local script-engine execution, invalid Merkle/reveal witnesses, all four KCC721 builds, and a real two-NFT atomic transfer with a shared P2PK authorization.

## 0.2.0 — 2026-08-06（中文）

- 默认官方 SilverScript 编译器升级并固定到 `4b0e1cd69739934f92c3ac4df1bb13d912418b2b`；保留 SHA-256 固定的 `2a3961c` 旧版复现档案。
- 增加编译器破坏性变更检测、带类型的构造数组适配和保守源码迁移。
- 增加可替换且会独立复核候选 UTXO 的 `CovenantStateSource`。
- 增加只签指定输入的 P2PK co-spend 钱包授权和 2–32 输入原子多 Covenant builder。
- 增加 TN10 Experimental Merkle 一次性领取与 Commit/Reveal 模板及确定性操作构建器。
- 增加四合约 TN10 Experimental KCC721 研究包；普通单合约部署和主网部署仍保持禁用。
- KCC721 原始身份/摘要输入改为中英双语三步向导：元数据在本地确定性计算摘要，新集合明确为不可部署预览，已有集合 ID 执行严格校验。
- 新增功能均补齐中英文界面和文档。
- 对抗测试新增编译迁移、错误状态候选、P2PK 输入隔离、原子绑定、有效本地脚本引擎执行、无效 Merkle/Reveal witness、四份 KCC721 完整编译，以及两枚 NFT 共用一个 P2PK 授权的真实原子转移。
