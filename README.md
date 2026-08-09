# Kaspa SilverScript Studio

本地优先、中英双语的 Kaspa SilverScript 契约开发、编译、签名与操作桌面工作台。

A local-first bilingual desktop workbench for designing, compiling, signing, and operating Kaspa SilverScript covenants.

[中文](#中文说明) · [English](#english)

> [!WARNING]
> SilverScript 仍处于实验阶段。成功编译、静态检查和交易预检都不等于安全审计。默认使用 TN10；未经完整对抗性测试和独立审查，请勿使用真实主网资金。
>
> SilverScript remains experimental. Successful compilation, static checks, and transaction preflight are not a security audit. Use TN10 by default and do not risk real mainnet funds without full adversarial testing and independent review.

---

## 中文说明

### 项目定位

Kaspa SilverScript Studio 将契约的整个本地工作流集中到一个桌面应用中：

1. 从确定性模板创建契约，或让 AI 生成候选规范和源码。
2. 使用固定版本的官方 `silverc` 完整编译 `.sil`。
3. 同时审查源码、构造参数、ABI、程序哈希和交易构建计划。
4. 使用内置加密钱包逐笔授权签名。
5. 在本机运行固定版本的 Kaspa 脚本引擎预检。
6. 直接连接 Kaspa wRPC 节点查询、签名并广播。
7. 在部署后处理领取、退款、续期、多签释放和继承分配。

AI 只负责生成候选方案和辅助审查，不能解锁钱包、签名交易或授权资产转移。模板、编译器、交易构建器和链上 Covenant 才是确定性执行边界。

### 主要功能

- Tauri 2 桌面应用，面向 macOS、Windows 和 Linux。
- 中英文界面；首次启动自动读取系统语言，并在系统语言既非中文也非英文时使用时区辅助判断。
- 用户手动切换语言后，本机选择优先于自动识别。
- 本地项目工作区，可创建、切换和删除未使用的工作。
- 双编译器兼容档案：默认固定 `kaspanet/silverscript@cb34aa5e6a598f9e461c4ad7014279ba89251d8d`，并保留 `2a3961c` 旧版用于复现；两者都校验二进制 SHA-256。
- 内置破坏性变更扫描与安全迁移，识别 `entry`、`checkMsgSig`、`outpointTxId`、artifact `bytecode` 等升级差异；无法安全自动迁移的 `.reverse()` 和位运算会要求人工审查。
- 固定 Kascov 来源提交构建的本地交易预检引擎。
- 支持 OpenAI、Anthropic、Gemini、OpenRouter、Ollama 和 OpenAI-compatible 接口。
- AI API Key 使用 scrypt 派生密钥和 AES-256-GCM 加密保存在本机。
- 内置钱包支持创建、导入、余额、收款、发送、断开和逐笔签名。
- 钱包助记词使用 AES-256-GCM + scrypt 加密，创建时只显示一次。
- 支持 BIP39 附加密码；钱包密码和附加密码不会保存为普通偏好设置。
- 支持 TN10 和 mainnet 自建 wRPC 节点，留空时使用公共节点发现。
- 支持 `.ssinvite` 可携带操作包、跨设备顺序签名和外部 Covenant 交易包审查。
- 可替换 `CovenantStateSource` 会在原生 Covenant RPC、outpoint RPC 与 P2SH 地址索引之间回退，并重新验证 outpoint、Covenant ID、脚本和金额。
- 通用 P2PK co-spend 授权只签指定普通钱包输入，并锁定整笔交易承诺；原子构建器支持 2–32 个不同 Covenant 输入。
- Kascov 是首选可视化和第二份报告来源，但不是签名、预检或广播的运行依赖。

### 内置模板

| 模板 | 主要入口 | 典型用途 |
|---|---|---|
| 单签金库 | 所有者释放 | 由指定钱包控制的 Covenant 资金 |
| 超时退款 | 对手方领取、超时退款 | 托管、游戏押金、条件付款 |
| 三选二多签 | 两位成员共同释放 | 团队金库、异地共同签署 |
| 哈希锁退款 | 秘密领取、超时退款 | 原子交付、跨客户端秘密交换 |
| 多继承人签到金库 | 所有者签到、所有者取回、到期分配 | 多继承人资产安排和定期续期 |
| Merkle 一次性领取（TN10 Experimental） | Merkle 证明领取、超时退款 | 白名单领取和一次性票据 |
| Commit / Reveal（TN10 Experimental） | Reveal 领取、超时退款 | 域隔离承诺和密封交付 |
| KCC721 四契约包（TN10 Experimental） | Collection、Ticket、NFT、Migration | Covenant 原生 NFT 研究；禁止普通单合约部署 |

每个模板都包含：

- 中英文参数表单和用例示范。
- 确定性构造参数编码。
- 完整编译验证。
- 按入口划分的 transaction plan。
- 对应的部署后反向操作构建器。

模板中的示例公钥、哈希和时间参数不能直接用于部署。未替换全部示例值时，后端会拒绝构建上链草案。

### 运行要求

- Node.js 22 或更高版本。
- Rust 和 Cargo，建议使用稳定版工具链。
- Git。
- 用于构建原生桌面包的系统工具：
  - macOS：Xcode Command Line Tools。
  - Windows：Visual Studio 2022 Build Tools 的 “Desktop development with C++”、Windows SDK 和 WebView2。
  - Linux：Tauri 2 对应发行版要求的 WebKitGTK 和系统开发包。

### 获取源码

```bash
git clone https://github.com/w00c00/kaspa-silverscript-studio.git
cd kaspa-silverscript-studio
npm ci
```

首次运行需要在当前系统构建固定版本的两个原生工具。以下命令由 Node.js 驱动，可直接用于 macOS、Windows 和 Linux：

Kascov 预检引擎使用仓库内置的 MIT 许可源码快照和 Cargo 锁文件构建，不依赖 Kascov 网站或其历史 Git 提交继续在线。

```bash
npm run setup:silverc
npm run setup:kascov-preflight
```

然后执行完整验证：

```bash
npm run verify
```

### 浏览器开发模式

复制本地环境配置：

```bash
cp .env.example .env.local
```

启动前后端开发服务：

```bash
npm run dev
```

或者使用已经构建的前端：

```bash
npm start
```

打开 <http://127.0.0.1:4310>。

后端只应监听本机回环地址。不要把 Studio 的本地 API 直接暴露到公网。

### 桌面开发与打包

启动 Tauri 开发模式：

```bash
npm run desktop:dev
```

为当前系统构建桌面安装包：

```bash
npm run desktop:build
```

构建会打包：

- 前端静态资源。
- 本地 Node.js sidecar。
- 固定版本 `silverc`。
- 固定版本本地预检引擎。
- Kaspa WASM、契约模板、知识库和第三方许可证。

原生安装包必须在对应系统上构建和测试，macOS、Windows 和 Linux 的二进制不能互相替代。发布流程在原生 GitHub Runner 上分别生成 macOS Apple Silicon DMG、Windows x64 NSIS/MSI，以及 Linux x86_64 DEB/AppImage，并附带 SHA-256 校验文件。macOS 包必须使用已签名 sidecar 通过 V8、健康接口和模板接口测试；Windows 包必须通过安装资源启动、健康接口和模板接口测试。

公开包目前没有商业代码签名：macOS 使用 ad-hoc 签名且未公证，Windows 未进行 Authenticode 签名，Linux 未进行发行版签名。首次启动可能出现系统安全提示；请只从本仓库 Release 下载并核对 SHA-256。

### 自动语言识别

首次启动且用户尚未手动选择语言时：

1. 系统首选语言为中文时使用中文。
2. 系统首选语言为英文时使用英文。
3. 系统语言为其他语言时，中国大陆、香港、澳门和台湾时区使用中文。
4. 其他情况使用英文。

顶部语言按钮可以随时切换。手动选择保存在本机，并在以后启动时优先使用。

### AI 配置

在应用设置中选择服务商、模型和接口地址，输入 API Key，并设置至少 10 位的保险库主密码。

- API Key 只写入本机加密保险库。
- 保险库主密码不会保存。
- 已保存的 API Key 不会返回给前端界面。
- 自动锁定后，解密后的 Key 会从运行时状态移除。
- 自定义远程接口必须使用 HTTPS；只有本机回环地址允许 HTTP。

也可以使用环境变量进行开发或无人值守迁移：

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

GEMINI_API_KEY=
GEMINI_MODEL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=
```

### 钱包与签名

内置钱包提供：

- 创建钱包并强制确认一次性助记词备份。
- 导入 BIP39 助记词和可选附加密码。
- 复制完整地址、显示收款信息和查询节点余额。
- 发送前显示收款地址、金额、显式手续费和交易承诺。
- 每笔签名重新输入密码。
- 签名后核对交易没有偏离用户批准的草案。
- 广播前执行本地脚本引擎预检。

本地加密不能抵御已经控制当前系统账户的恶意软件。高价值资金应使用独立、硬件或隔离签名器。

### 多设备与外部签名

多签或异地签名时，必须顺序传递同一个最新 `.ssinvite` 文件：

1. 第一位签名人导入并检查完整交易。
2. 核对网络、Covenant ID、程序哈希、交易承诺、手续费和全部输出。
3. 完成自己的签名槽位。
4. 将更新后的部分签名包发送给下一位签名人。

不能让多位签名人分别签署两个初始副本。建议通过另一条可信通信渠道比对交易承诺。

仅有 Covenant ID 或 cov hash 不足以签名。外部操作包必须携带待签交易、UTXO、redeem program、ABI、入口、参数、输出和签名槽信息。详见 [可携带 Covenant 操作包](docs/portable-covenant-package.md)。

编译器升级、状态查询与原子授权接口见 [Studio 0.2 架构说明](docs/studio-0.2-architecture.md)。KCC721 包的来源、边界和禁止事项见 [TN10 Experimental KCC721](docs/kcc721-experimental.md)。

### 网络

| Studio | Kaspa network ID | 地址前缀 | Kascov |
|---|---|---|---|
| `tn10` | `testnet-10` | `kaspatest:` | `testnet-10` |
| `mainnet` | `mainnet` | `kaspa:` | `mainnet` |

余额、UTXO、Covenant 定位和交易广播都通过所选 Kaspa 节点完成，不依赖区块浏览器。

主网默认 fail-closed。即使设置 `ALLOW_MAINNET=true`，仍受 `MAINNET_MAX_DEPLOY_KAS` 限制，并要求在界面输入 `DEPLOY REAL KAS`。这些保护措施不能替代审计。

### 独立运行与 Kascov

核心契约操作不依赖任何网站：

- 本地编译使用固定官方 `silverc`。
- 本地预检使用打包的 Kaspa 脚本引擎。
- 查询和广播直接连接 Kaspa wRPC 节点。
- Kascov 不可用时仍保留 txid，并可继续完成节点广播。

Kascov 仍是推荐的可视化查看和补充报告入口，但不会改变签名内容，也没有钱包授权能力。

### 验证

```bash
npm run check
npm test
npm run build
```

`npm run verify` 会依次执行以上检查。测试覆盖模板完整编译、AI 保险库、本地钱包、网络隔离、交易构建、可携带签名包、部署后操作和 Kascov 离线时的真实签名脚本执行。

### 安全边界

- AI 输出始终是候选方案，不能授权资产。
- AST 解析不算成功编译，必须执行固定编译器完整构建。
- 编译成功、本地预检和 Kascov 报告都不是正式审计。
- 修改源码或构造参数会使旧编译凭证失效。
- 签名前必须检查金额、手续费、网络、Covenant 身份和全部输出。
- 本地预检二进制缺失或 SHA-256 不匹配时，交易操作 fail closed。
- 主网代码在独立审查前应视为实验性代码。

---

## English

### What it is

Kaspa SilverScript Studio brings the complete local covenant workflow into one desktop application:

1. Start from a deterministic template or ask AI for a candidate specification and source.
2. Fully compile `.sil` with a pinned official `silverc`.
3. Review source, constructor arguments, ABI, program hashes, and transaction plans together.
4. Authorize each signature with the encrypted local wallet.
5. Run every transaction through a pinned local Kaspa script-engine preflight.
6. Query and broadcast directly through a Kaspa wRPC node.
7. Operate deployed covenants through claim, refund, renewal, multisig, and inheritance paths.

AI is limited to candidate generation and review assistance. It cannot unlock wallets, sign transactions, or authorize asset transfers. Templates, compiler artifacts, transaction builders, and the on-chain covenant remain the deterministic execution boundary.

### Highlights

- Tauri 2 desktop application for macOS, Windows, and Linux.
- Chinese and English UI with automatic system-language detection and time-zone fallback.
- A manual language choice always overrides future automatic detection.
- Local project workspace with explicit create, switch, and delete actions.
- Dual compiler profiles: the default is pinned to `kaspanet/silverscript@cb34aa5e6a598f9e461c4ad7014279ba89251d8d`, while `2a3961c` remains available for reproducible legacy builds; both binaries are SHA-256 verified.
- Built-in breaking-change detection and safe migration for `entry`, `checkMsgSig`, `outpointTxId`, and artifact `bytecode`; removed `.reverse()` and bitwise typing changes require manual review.
- Pinned Kascov-derived local transaction preflight engine.
- OpenAI, Anthropic, Gemini, OpenRouter, Ollama, and OpenAI-compatible providers.
- AES-256-GCM encrypted AI key vault with a scrypt-derived key.
- Encrypted local wallet with create, import, balance, receive, send, disconnect, and per-transaction signing.
- One-time mnemonic display and optional BIP39 passphrase support.
- Direct TN10 and mainnet self-hosted wRPC endpoints with public-node discovery fallback.
- Portable `.ssinvite` operation packages, sequential cross-device signing, and external covenant-package review.
- Replaceable `CovenantStateSource` fallback across native covenant RPC, outpoint RPC, and P2SH address indexing, with independent outpoint, covenant ID, script, and value verification.
- Generic isolated P2PK co-spend authorization plus an atomic builder for 2–32 distinct covenant inputs.
- Kascov is the preferred visual and secondary-report layer, not a signing, preflight, or broadcast dependency.

### Built-in templates

| Template | Main paths | Typical use |
|---|---|---|
| Owner vault | Owner release | Funds controlled by one covenant-authorized wallet |
| Timeout refund | Counterparty claim, timeout refund | Escrow, game deposits, conditional payment |
| Two-of-three multisig | Any authorized pair releases | Team treasury and remote co-signing |
| Hashlock refund | Secret claim, timeout refund | Atomic delivery and cross-client secret exchange |
| Multi-inheritor check-in vault | Owner check-in, owner recovery, mature distribution | Inheritance planning with periodic renewal |
| Merkle one-time claim (TN10 Experimental) | Merkle proof claim, timeout refund | Allowlists and single-use tickets |
| Commit / reveal (TN10 Experimental) | Reveal claim, timeout refund | Domain-separated commitments and sealed delivery |
| Four-contract KCC721 pack (TN10 Experimental) | Collection, Ticket, NFT, Migration | Covenant-native NFT research; standalone deployment is blocked |

Every template includes bilingual parameter forms and examples, deterministic constructor encoding, full compile verification, per-entrypoint transaction plans, and matching post-deployment builders.

Example public keys, hashes, and time values are not deployment values. The backend refuses to build an on-chain draft until all required examples are replaced.

### Requirements

- Node.js 22 or later.
- Rust and Cargo, preferably the stable toolchain.
- Git.
- Platform build dependencies:
  - macOS: Xcode Command Line Tools.
  - Windows: Visual Studio 2022 Build Tools with “Desktop development with C++,” Windows SDK, and WebView2.
  - Linux: the WebKitGTK and system development packages required by Tauri 2 for the target distribution.

### Install from source

```bash
git clone https://github.com/w00c00/kaspa-silverscript-studio.git
cd kaspa-silverscript-studio
npm ci
```

Build the two pinned native tools for the current platform. These Node.js-driven commands run directly on macOS, Windows, and Linux:

The Kascov preflight helper builds from the committed MIT-licensed source snapshot and Cargo lockfile, so it does not depend on the Kascov website or a historical upstream Git commit remaining online.

```bash
npm run setup:silverc
npm run setup:kascov-preflight
```

Run the complete verification suite:

```bash
npm run verify
```

### Browser development

```bash
cp .env.example .env.local
npm run dev
```

For the built frontend:

```bash
npm start
```

Open <http://127.0.0.1:4310>.

The backend is intended for the local loopback interface only. Do not expose the Studio API directly to the public internet.

### Desktop development and packaging

```bash
npm run desktop:dev
npm run desktop:build
```

The desktop bundle contains the frontend, local Node.js sidecar, pinned `silverc`, pinned local preflight engine, Kaspa WASM, templates, knowledge resources, and third-party license notices.

Native installers must be built and tested on their target operating systems; macOS, Windows, and Linux binaries are not interchangeable. The release pipeline produces a macOS Apple Silicon DMG, Windows x64 NSIS/MSI packages, and Linux x86_64 DEB/AppImage packages on native GitHub Runners, with SHA-256 checksum files. The macOS package must pass signed-sidecar V8, health-endpoint, and template-endpoint tests; the Windows package must pass packaged-resource startup, health-endpoint, and template-endpoint tests.

The public packages are not commercially code-signed: macOS is ad-hoc signed and not notarized, Windows is not Authenticode-signed, and Linux is not distribution-signed. The operating system may show a warning on first launch. Download only from this repository's Releases and verify the SHA-256 checksum.

### Automatic language selection

When no manual preference exists:

1. A Chinese primary system language selects Chinese.
2. An English primary system language selects English.
3. For other system languages, mainland China, Hong Kong, Macau, and Taiwan time zones select Chinese.
4. All other cases select English.

The language button switches at any time. A manual choice is saved locally and takes priority on later launches.

### AI configuration

Configure the provider, model, endpoint, API key, and a vault password of at least 10 characters inside the application.

- API keys are stored only in the local encrypted vault.
- The vault password is never stored.
- Saved API keys are never returned to the frontend.
- Auto-lock removes decrypted keys from runtime state.
- Custom remote endpoints require HTTPS; HTTP is limited to loopback hosts.

Environment variables remain available for development and unattended migration:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

GEMINI_API_KEY=
GEMINI_MODEL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=
```

### Wallet and signing

The built-in wallet supports:

- Wallet creation with a mandatory one-time mnemonic acknowledgement.
- BIP39 mnemonic import and optional passphrase.
- Full address copy, receive details, and node-RPC balance.
- Transfer review with recipient, amount, explicit fee, and transaction commitment.
- Fresh password entry for every signature.
- Post-signature verification that the approved draft was not changed.
- Local script-engine preflight before broadcast.

Local encryption cannot protect against malware that already controls the current operating-system account. Use a hardware or isolated signer for high-value funds.

### Multi-device and external signing

For multisig and remote signing, pass the same latest `.ssinvite` package sequentially:

1. The first signer imports and reviews the complete transaction.
2. They verify the network, covenant ID, program hash, commitment, fee, and every output.
3. They fill their authorized signature slot.
4. They pass the updated partial package to the next signer.

Never have multiple signers sign separate initial copies. Compare the transaction commitment over a second trusted channel.

A covenant ID or cov hash alone is not a signing request. An external package must include the exact transaction, UTXOs, redeem program, ABI, entrypoint, arguments, outputs, and signature slots. See [Portable covenant packages](docs/portable-covenant-package.md).

See [Studio 0.2 architecture](docs/studio-0.2-architecture.md) for compiler upgrades, state sources, P2PK authorization, and atomic transaction APIs. See [TN10 Experimental KCC721](docs/kcc721-experimental.md) for provenance, boundaries, and prohibited release claims.

### Networks

| Studio | Kaspa network ID | Address prefix | Kascov |
|---|---|---|---|
| `tn10` | `testnet-10` | `kaspatest:` | `testnet-10` |
| `mainnet` | `mainnet` | `kaspa:` | `mainnet` |

Balance, UTXO discovery, covenant lookup, and broadcast use the selected Kaspa node without requiring a block explorer.

Mainnet is fail-closed. Even with `ALLOW_MAINNET=true`, `MAINNET_MAX_DEPLOY_KAS` remains enforced and the UI requires `DEPLOY REAL KAS`. These controls do not replace an audit.

### Independent operation and Kascov

Core covenant operation does not depend on any website:

- Compilation uses the pinned official `silverc`.
- Preflight uses the bundled Kaspa script engine.
- Queries and broadcasts connect directly to Kaspa wRPC.
- If Kascov is unavailable, Studio preserves the txid and can still complete node broadcast.

Kascov remains the recommended visual inspection and supplementary-report layer. It cannot modify signing content or authorize the wallet.

### Verification

```bash
npm run check
npm test
npm run build
```

`npm run verify` runs all three. Tests cover full template compilation, the AI vault, encrypted wallets, network isolation, transaction builders, portable signing packages, post-deployment operations, and real signed-input execution while Kascov is offline.

### Security boundaries

- AI output is always a candidate and never authorizes assets.
- AST parsing is not compilation; a pinned full build is mandatory.
- Compilation, local preflight, and Kascov reports are not formal audits.
- Source or constructor changes invalidate previous build evidence.
- Review amount, fee, network, covenant identity, and every output before signing.
- Transaction operation fails closed if the local preflight binary is absent or its SHA-256 does not match.
- Treat mainnet code as experimental until it completes independent review.

## License

Kaspa SilverScript Studio is released under the [MIT License](LICENSE).

The bundled local preflight engine reuses Kascov under MIT and rusty-kaspa under ISC. Corresponding license texts are included in `third_party`.
