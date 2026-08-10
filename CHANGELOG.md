# Changelog

## 0.2.8 — 2026-08-10

- Updated the default SHA-256-pinned official SilverScript compiler to `6f9e078b1d8b5389212755183b592704de99fea5`; retained `cb34aa5` for Studio 0.2.7 reproducibility and `2a3961c` for older projects.
- Added breaking-change findings for explicit scalar byte/integer conversions: runtime integers use checked `as byte`, while scalar bytes require an explicit `signed()` or `unsigned()` interpretation.
- Added canonical v1 covenant descriptors to generated lifecycle and atomic `.ssinvite` packages, binding CAIP-2 network, program hash, covenant ID, ABI, state layout, and authorization principals. Legacy packages remain readable with a visible warning.
- Added a complete TN10 Experimental Groth16 proof-release template with deterministic parameters, exact fixed-recipient value conservation, bounded fees, an operation builder, local preflight, bilingual UX, and mainnet fail-closed policy.
- Added a pinned Kaspa x402 alpha interoperability profile and explicit admission gates instead of exposing its pre-current-syntax escrow as a deployable template.
- Recompiled every built-in template against `6f9e078` and expanded regression coverage for compiler migration, descriptor tampering, CAIP-2 aliases, Groth16 package construction, and legacy-package compatibility.

## 0.2.8 — 2026-08-10（中文）

- 默认官方 SilverScript 编译器升级并固定到 `6f9e078b1d8b5389212755183b592704de99fea5`；保留 `cb34aa5` 复现 Studio 0.2.7 项目，并保留 `2a3961c` 复现更早项目。
- 增加标量 byte/int 显式转换的破坏性变更提示：运行时整数使用带检查的 `as byte`，标量 byte 转整数必须明确选择 `signed()` 或 `unsigned()`。
- 新生成的生命周期与原子 `.ssinvite` 操作包加入 canonical v1 Covenant Descriptor，绑定 CAIP-2 网络、程序哈希、Covenant ID、ABI、状态布局和授权主体；旧包仍可读取，但会醒目标出缺少描述符。
- 增加完整的 TN10 Experimental Groth16 证明释放模板，包含确定性参数、固定收款方精确价值守恒、手续费上限、操作构建器、本地预检、中英双语界面和主网失效关闭策略。
- 增加固定提交的 Kaspa x402 alpha 互操作档案与正式模板准入条件，没有把仍使用旧语法的上游托管合约直接伪装成可部署模板。
- 使用 `6f9e078` 重新编译全部内置模板，并扩展编译迁移、描述符篡改、CAIP-2 别名、Groth16 操作包和旧包兼容回归测试。

## 0.2.7 — 2026-08-09

- Raised Studio's conservative covenant-cell default and minimum to 0.5 KAS/TKAS, preventing storage-mass rejection when funding a small covenant from a large faucet or mining UTXO.
- Made genesis deployment choose the lowest suitable UTXO, calculate the exact candidate mass, and return structured diagnostics before signing when no candidate is standard.
- Fixed Toccata v1 covenant and P2PK co-spend inputs to commit only `computeBudget`; non-zero legacy `sigOpCount` fields are now excluded because current nodes reject that mixed encoding.
- Moved lifecycle fee calculation after full redeem-program and argument assembly, consumes the pinned script engine's fee/mass report, and reserves the final CheckSig execution cost before collecting signatures.
- Kept phrase-free TN10 inheritance renewal fail-closed: only the exact current same-covenant continuation is accepted, with a dynamic fee capped at 0.02 TKAS.
- Added regression coverage for large-faucet-UTXO deployment, engine-driven fee adjustment, signed execution reserve, Toccata v1 input encoding, and the renewal fee safety cap.
- Completed live TN10 end-to-end verification for wallet transfer, covenant genesis, mature multi-inheritor distribution, and owner-signed check-in continuation; all final transactions passed the bundled engine and Kascov before node acceptance.
- Vendored the audited MIT-licensed Kascov preflight source snapshot and its lockfile after the upstream repository removed the pinned commit; clean macOS, Windows, and Linux builds no longer depend on that upstream source remaining online. The lockfile also applies minimal fixes for `RUSTSEC-2026-0204` and `RUSTSEC-2026-0220`.

## 0.2.7 — 2026-08-09（中文）

- Studio 的保守 Covenant Cell 默认值与最低值统一提高到 0.5 KAS/TKAS，避免从水龙头或挖矿大额 UTXO 拆出过小契约输出时被存储质量规则拒绝。
- 部署构建器会优先选择金额最小的合适 UTXO、逐笔计算真实质量；若没有标准交易候选，会在签名前返回结构化诊断。
- 修复 Toccata v1 契约输入与 P2PK 共同授权输入：只提交 `computeBudget`，不再混入当前节点会拒绝的旧版非零 `sigOpCount`。
- 生命周期手续费改为在 redeem program 与全部参数完整装配后计算，读取固定脚本引擎的费用／质量报告，并在收集签名前预留真实 CheckSig 执行费用。
- TN10 免短语继承签到继续保持失效关闭：只允许当前项目、当前 UTXO、同 covenant ID 的唯一延续输出，动态手续费上限为 0.02 TKAS。
- 增加大额水龙头 UTXO 部署、引擎动态费率、签名执行预留、Toccata v1 字段编码及续期费用上限的回归测试。
- 已在真实 TN10 完成钱包转账、契约创世、多继承人成熟分配、拥有者签名签到延续的端到端验证；最终交易均先通过内置引擎和 Kascov，再由节点接受。
- 在上游仓库删除原固定提交后，将已审计的 MIT 许可 Kascov 预检源码快照与锁文件直接纳入仓库；macOS、Windows、Linux 的干净构建不再依赖该上游源码持续在线，并以最小升级修复 `RUSTSEC-2026-0204` 与 `RUSTSEC-2026-0220`。

## 0.2.6 — 2026-08-09

- Updated the default SHA-256-pinned official SilverScript compiler to `cb34aa5e6a598f9e461c4ad7014279ba89251d8d`; the `2a3961c` legacy profile remains available for reproducibility.
- Added compatibility findings and compiler-backed regression tests for duplicate function names, entry parameters that shadow contract fields, and non-numeric ordered comparisons; documented the new `g16.verify` Groth16 builtin.
- Recompiled every built-in template with realistic constructor arguments against the new compiler and retained TN10-only, fail-closed deployment policy for experimental templates and KCC721.
- Fixed a false-positive `SS002` warning for same-input `scriptPubKey` continuation checks.
- Fixed stale toolchain commit text, stale “no work open” state, and non-localized template project names; applying a template now preserves the user's project name.
- Improved wallet onboarding after the one-time recovery backup by selecting the new wallet and explicitly focusing the password-to-connect step without retaining the password.
- Updated vulnerable transitive `postcss` and `nanoid` versions; `npm audit` now reports zero known vulnerabilities.
- Updated the official GitHub Actions used by the desktop release pipeline to their current Node 24-based majors.

## 0.2.6 — 2026-08-09（中文）

- 默认官方 SilverScript 编译器升级并固定到 `cb34aa5e6a598f9e461c4ad7014279ba89251d8d`，继续保留 `2a3961c` 旧版复现档案；所有二进制均校验 SHA-256。
- 增加重复函数名、入口参数遮蔽契约字段、非数值有序比较的兼容性提示与编译器回归测试，并记录新的 `g16.verify` Groth16 内建函数。
- 使用真实构造参数和新编译器重新完整编译全部内置模板；实验模板与 KCC721 继续仅限 TN10，并保持部署失效关闭。
- 修复同一输入 `scriptPubKey` 延续检查被错误报告为 `SS002` 的误报。
- 修复工具链提交号陈旧、已打开项目仍显示“没有打开的工作”、模板项目名称未本地化；应用模板时不再覆盖用户自定义项目名。
- 改进一次性助记词备份后的钱包引导：自动选中新钱包并聚焦重新输入密码连接，同时不保留钱包密码。
- 更新存在安全公告的间接依赖 `postcss` 与 `nanoid`；`npm audit` 现为零已知漏洞。
- 将桌面发布流水线使用的 GitHub 官方 Actions 升级到当前基于 Node 24 的主版本。

## 0.2.5 — 2026-08-07

- Added the minimum macOS Hardened Runtime JIT entitlement required by the bundled Node/V8 sidecar, fixing immediate `SIGTRAP` termination and local-service startup failure on Apple Silicon.
- Added a native macOS post-package smoke test that executes V8 code from the signed sidecar and requires both `/api/health` and `/api/templates` to succeed.

## 0.2.5 — 2026-08-07（中文）

- 为内置 Node/V8 sidecar 增加 macOS Hardened Runtime 所需的最小 JIT entitlement，修复 Apple Silicon 上立即触发 `SIGTRAP`、本地服务无法启动的问题。
- 增加 macOS 原生打包后冒烟测试：使用已签名 sidecar 执行 V8 代码，并强制验证 `/api/health` 与 `/api/templates`。

## 0.2.4 — 2026-08-07

- Normalized Windows verbatim resource paths before launching the bundled Node runtime, preventing the local API from exiting with `EISDIR` and restoring templates and node access.
- Added persistent desktop backend diagnostics and automatic recovery when the bundled local service cannot be reached.
- Added WebView2 private-network preflight support for the local loopback API.
- Kept the desktop UI available when sidecar launch fails and reports the exact `backend.log` path instead of a generic `Failed to fetch` message.
- Added a native Windows post-package smoke test that launches the real Tauri executable and requires both `/api/health` and `/api/templates` to succeed.

## 0.2.4 — 2026-08-07（中文）

- 启动内置 Node 运行时前规范化 Windows verbatim 资源路径，避免本地 API 因 `EISDIR` 退出，恢复模板和节点访问。
- 增加桌面后端永久诊断日志，以及内置本地服务不可达时的自动恢复。
- 增加 Windows WebView2 访问本机回环 API 所需的私有网络预检响应。
- sidecar 启动失败时仍保留桌面界面，并显示准确的 `backend.log` 路径，不再只提示 `Failed to fetch`。
- 增加 Windows 原生打包后冒烟测试：启动真实 Tauri 程序，并强制验证 `/api/health` 与 `/api/templates`。

## 0.2.3 — 2026-08-07

- Fixed Windows desktop runtime detection for Tauri's `http://tauri.localhost` and `https://tauri.localhost` WebView origins.
- Restored Windows requests to the bundled loopback service, fixing empty template lists and unresponsive wallet creation.
- Added regression coverage for Windows, macOS/Linux-style Tauri origins, injected Tauri globals, and normal browser mode.

## 0.2.3 — 2026-08-07（中文）

- 修复 Windows Tauri WebView 使用 `http://tauri.localhost` 或 `https://tauri.localhost` 时的桌面运行环境识别。
- 恢复 Windows 客户端对内置回环服务的请求，修复模板列表为空和创建钱包无反应的问题。
- 增加 Windows、macOS/Linux 风格 Tauri 地址、Tauri 注入标记及普通浏览器模式的回归测试。

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
