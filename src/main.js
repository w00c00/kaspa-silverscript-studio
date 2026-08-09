import "./styles.css";
import { clearProjectScopedTransactionState } from "./project-transaction-state.js";
import { availableLifecycleOperations, lifecycleInheritanceDistributionAvailable, lifecycleRenewalAvailable } from "./lifecycle-presentation.js";
import { detectBrowserLanguage } from "./locale.js";
import { kcc721MetadataDigest } from "./kcc721-metadata.js";
import { apiBaseForRuntime } from "./runtime-environment.js";
import { invoke } from "@tauri-apps/api/core";
import { open as openExternalUrl } from "@tauri-apps/plugin-shell";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const API_BASE = apiBaseForRuntime();
const IS_TAURI = Boolean(API_BASE);

const copy = {
  zh: {
    connectWallet: "连接钱包", localWorkspace: "本地工作区", projects: "契约项目", toolchain: "工具链",
    skillKnowledge: "SilverScript Skill", compiler: "本地编译器", defaultNetwork: "默认网络",
    localSafety: "源码和项目保存在本机。AI 密钥仅通过本机回环写入加密保险库，钱包私钥永不离开钱包。",
    savedLocal: "已保存到本机", design: "需求设计", source: "契约源码", compile: "编译审查", deploy: "签名上链", operationCenter: "操作中心", operationCenterHelp: "统一处理续签、多签、领取、退款和确认付款。导入操作包后会自动识别对应界面，但签名前仍必须核对程序哈希、交易承诺和全部输出。",
    describeContract: "描述你需要的契约", requirementsPlaceholder: "例如：双方各锁定 100 TKAS，胜负由双方签名确认；超时后任何一方可以退款……",
    aiProvider: "AI 接口", model: "模型", generate: "生成规范与契约", reviewCurrent: "审查当前源码",
    aiBoundary: "AI 只生成候选方案。必须经过本地编译、静态检查、交易预检和人工确认后才能签名。",
    generatedDesign: "生成结果", waitingInput: "等待需求", designEmpty: "输入自然语言需求，AI 将先生成状态机、不变量和威胁模型，再给出 SilverScript 源码。",
    applyCandidate: "采纳候选源码", discard: "放弃", normalizeWhitespace: "整理空白", analyze: "静态检查",
    constructorArgs: "构造参数", argsHelp: "使用 silverc 的表达式 JSON 数组格式。无构造参数时填写 []。",
    compilePinned: "使用固定编译器完整编译", artifact: "编译凭证", compileEmpty: "完整编译后，这里会显示 ABI、程序哈希和启发式安全检查结果。", compilerProfile: "编译器兼容档案", checkCompatibility: "检查破坏性变更", applySafeMigration: "应用安全迁移",
    experimentalWarning: "实验性软件", deployWarning: "默认仅使用 TN10。编译成功不代表安全；签名前请审查源码、构造参数、金额和完整交易。",
    fundCovenant: "为 Covenant 创建链上 UTXO", network: "网络", amount: "锁定金额", mainnetPhrase: "主网确认短语",
    walletNotConnected: "钱包未连接", walletHelp: "使用内置加密钱包在本机完成签名", buildDraft: "构建并预检签名草案",
    chainProgress: "上链进度", stepArtifact: "固定编译凭证", stepArtifactSub: "源码、构造参数、编译器哈希一致",
    stepDraft: "交易草案与静态预检", stepDraftSub: "检查预算、质量和手续费估算", stepSign: "钱包签名", stepSignSub: "私钥仅在本机解密并立即清除",
    stepEngine: "本地真实脚本引擎预检", stepEngineSub: "每个签名输入必须执行通过", stepBroadcast: "Kaspa 节点广播", stepBroadcastSub: "向自有节点或自动发现节点提交最终交易",
    templates: "功能模板", useTemplate: "使用模板", walletManager: "钱包中心", walletSecurity: "助记词使用 AES-256-GCM + scrypt 加密后保存在本机；钱包密码不会缓存，每笔签名都要重新确认。", savedWallet: "已保存钱包", walletName: "钱包名称", walletPassword: "钱包密码", paymentSecret: "BIP39 附加密码（可选）", importMnemonic: "BIP39 助记词", disconnect: "断开钱包", createOrImport: "创建 / 导入", unlock: "解锁连接", confirmSignature: "确认本地签名", cancel: "取消", signNow: "立即签名",
    settings: "应用设置", aiSettings: "AI 配置", walletSettings: "钱包与网络", security: "安全说明",
    aiVault: "AI 密钥保险库", aiVaultHelp: "API Key 使用 AES-256-GCM + scrypt 加密。主密码只用于本机解锁，不会被保存。",
    baseUrl: "接口地址", apiKey: "API Key", blankKeyHelp: "API Key 留空会保留原值；应用不会把已保存的 Key 返回到界面。", vaultPassword: "保险库主密码",
    lockVault: "立即锁定", unlockVault: "解锁保险库", saveAiConfig: "加密保存",
    walletPreferences: "钱包与节点偏好", walletPreferencesHelp: "保存默认钱包、网络和可选的自有 Kaspa 节点地址；不保存钱包密码、助记词或 BIP39 附加密码。",
    directNodeTitle: "Kaspa 节点直连", directNodeHelp: "填写自己的 wRPC 地址即可脱离公共网站运行；留空时使用 Kaspa 公共节点发现。Kascov 只用于首选可视化，不参与签名或广播。", tn10RpcUrl: "TN10 wRPC 地址（可选）", mainnetRpcUrl: "Mainnet wRPC 地址（可选）", localPreflightPolicy: "本地预检为硬性门槛", localPreflightPolicyHelp: "每笔交易先由内置的 Kascov 同源 Kaspa 脚本引擎离线执行。Kascov 在线时追加首选报告；不可用时不阻断操作。",
    defaultWallet: "默认本地钱包", vaultAutoLock: "AI 保险库自动锁定", signPolicy: "每笔交易重新授权", signPolicyHelp: "本地钱包密码不缓存；每次签名前必须重新输入并核对交易。", manageWallets: "创建 / 导入钱包", savePreferences: "保存偏好",
    securityLocalTitle: "本机加密", securityLocalText: "AI Key 与钱包助记词分别加密，文件权限限制为当前用户；二者不写入项目、日志或浏览器存储。",
    securityAiTitle: "AI 无签名权", securityAiText: "AI 只能生成候选源码和交易计划，不能解锁钱包、签名或授权资产转移。",
    securityNetworkTitle: "主网失效关闭", securityNetworkText: "主网默认禁用；即使启用，也必须通过金额上限、确认短语、完整编译、预检和逐笔签名。",
    securityLimitTitle: "威胁边界", securityLimitText: "加密可防止明文泄露，但无法抵御已控制当前系统账户的恶意软件。高价值主网资金应使用硬件或隔离签名器。",
    connectExisting: "连接已有钱包", createOrImportWallet: "创建或导入钱包", createNew: "创建新钱包", importExisting: "导入助记词",
    newWalletPassword: "设置钱包密码", confirmWalletPassword: "再次输入密码", passwordMinimum: "钱包密码至少 10 位。", passwordHint: "至少 10 位，建议使用 14 位以上且与其他账户不同的密码。此密码无法找回。", createWallet: "创建并加密钱包", importWallet: "加密导入钱包",
    checkingBalance: "正在查询余额…", refresh: "刷新", copyAddress: "复制地址", receive: "接收", send: "发送", receiveKas: "接收 KAS", receiveHelp: "确认发送方选择相同网络。复制下面的完整地址，到账后点击刷新余额。", sendKas: "发送 KAS",
    recipientAddress: "收款地址", sendAmount: "发送金额", mainnetSendPhrase: "主网确认短语", reviewTransfer: "预览交易和手续费", confirmAndSend: "确认签名并发送",
    backupMnemonic: "立即备份助记词", backupWarning: "这是恢复钱包的唯一凭证，只显示这一次。请离线抄写，不要截图、上传云盘或发送给任何人。", passphraseBackupWarning: "你设置了 BIP39 附加密码。恢复钱包时必须同时拥有助记词和附加密码，请分别离线备份。", shownOnce: "仅显示一次", backupConfirmed: "我已经按顺序离线备份，并理解丢失后无法恢复", finishBackup: "完成备份",
    noProjectHelp: "当前没有打开的工作。选择下方模板直接创建，或点击左侧 ＋ 新建空白工作。", templateIntro: "优先使用已经完整编译验证的模板。点击只会选择并预览，不会创建新工作，也不会调用 AI。", selectTemplate: "选择并预览", viewExample: "查看用例示范", newFromTemplate: "从模板新建工作", applyTemplate: "应用到当前工作", templateParameters: "填写模板信息", templateParametersHint: "参数在本地确定性转换，不会调用 AI", templateParameterBoundary: "钱包字段用于生成契约授权公钥；锁定金额同步到上链步骤。模板不会保存私钥或秘密原文。", useConnectedWallet: "使用当前钱包", describeCustomContract: "自定义契约（AI）", customAiHelp: "只有现有模板无法覆盖需求时才使用 AI。AI 生成的是候选方案，不会替代固定模板。", confirmTemplateApply: "确认应用模板", templateReplaceWarning: "当前源码、构造参数和未上链的编译凭证将被模板内容替换；已经广播的链上交易不受影响。", confirmApply: "确认应用", deleteProject: "删除工作", deleteProjectWarning: "此操作只删除本地工作文件且无法撤销；已经广播的链上交易不会被删除。", confirmDelete: "确认删除", exampleRoles: "参与角色", exampleSteps: "操作步骤", exampleResult: "链上结果", understood: "知道了",
    externalCovenantTitle: "操作包识别、审查与签名", externalCovenantHelp: "导入后会识别续期、多签、领取、退款或付款界面。业务标签只用于辅助理解；真正的授权依据仍是完整交易、UTXO、redeem program、ABI、入口、参数和全部输出。", externalPackage: "交易包 JSON", inspectPackage: "识别并只读审查", importInvitation: "导入操作包", signPackage: "签署匹配槽位", externalConfirmation: "外部签名确认短语", externalConfirmationHelp: "签名前请完整输入：SIGN REVIEWED EXTERNAL COVENANT", externalReviewEmpty: "先粘贴或导入完整操作包。应用会核对 P2SH、covenant ID、输入输出、手续费、ABI 参数和签名槽位。", signedPackage: "最新操作包", copySignedPackage: "复制最新包", broadcastConfirmation: "广播确认短语", broadcastPackage: "预检并广播完整交易", signingInvitationTitle: "异地签名邀请", signingInvitationHelp: "把同一个最新邀请包按顺序发送给签名人。每个人在自己的设备导入、核对交易承诺、签名，再把更新后的包传给下一位。", transactionCommitment: "交易承诺", copyInvitation: "复制邀请", downloadInvitation: "下载邀请文件", shareInvitation: "系统分享", sequentialSigningWarning: "必须传递最新的部分签名包，不能让两个人分别签署两个初始副本。签名前请通过另一条可信渠道比对交易承诺。",
    lifecycleTitle: "导出或异地处理操作包", lifecycleHelp: "只有需要交给其他电脑或多位签名人时，才在这里构建可携带操作包。本机继承合约续期请直接使用上方“签到续期”。", operation: "操作", operationFee: "显式手续费", operationDestination: "释放到钱包", claimSecretHex: "秘密原文（十六进制）", merkleProofHex: "Merkle 证明（十六进制）", revealPayloadHex: "Reveal Payload（十六进制）", revealSaltHex: "32-byte Salt（十六进制）", multisigSigners: "选择本次参与的两个签名钱包", multisigInviteHint: "构建后下载邀请文件，按顺序发送给这两位签名人；每个人都在自己的设备签名。", buildOperationPackage: "构建可导出的操作包", lifecycleDestinationRequired: "请填写释放到钱包的地址", lifecycleDestinationWrongNetwork: "释放地址必须属于当前项目网络", lifecycleDestinationInvalid: "释放地址必须是有效的 P2PK 钱包地址", multisigDeployGuideTitle: "多签邀请要在部署完成后生成", multisigBeforeDeploy: "这里的“构建草案”只负责由出资钱包创建多签 Covenant UTXO，不需要三位成员共同签名。完成签名和广播后，下面会出现“三选二释放”；在那里选择两位成员并构建操作，下载邀请文件。", multisigAfterDeploy: "多签 Covenant 已部署。请在下方“三选二释放”中选择两位签名钱包、填写目标地址，然后点击“构建操作交易包”；下载按钮会立即出现在旁边。", contractSchedule: "合约到期与活动状态", refreshLifecycle: "刷新链上状态", recognizedOperation: "已识别操作", renewNow: "签到续期", inheritNow: "触发继承分配", inheritanceMatureHelp: "等待期已经成熟。任何人都可以准备分配交易；继承地址和比例由链上契约固定，广播前请核对每笔金额。", walletRequired: "此操作需要钱包，请先连接钱包"
  },
  en: {
    connectWallet: "Connect wallet", localWorkspace: "Local workspace", projects: "Contract projects", toolchain: "Toolchain",
    skillKnowledge: "SilverScript Skill", compiler: "Local compiler", defaultNetwork: "Default network",
    localSafety: "Source and projects stay local. AI keys only cross the local loopback into the encrypted vault, and wallet keys never leave the wallet.",
    savedLocal: "Saved locally", design: "Design", source: "Contract source", compile: "Compile & review", deploy: "Sign & deploy", operationCenter: "Operation Center", operationCenterHelp: "Handle renewals, multisig, claims, refunds and payment confirmations in one place. Imported packages select the matching interface automatically, but you must still verify the program hash, commitment and every output.",
    describeContract: "Describe the contract you need", requirementsPlaceholder: "Example: both parties lock 100 TKAS; a mutually signed result releases the pot, with a timeout refund path…",
    aiProvider: "AI provider", model: "Model", generate: "Generate spec & contract", reviewCurrent: "Review current source",
    aiBoundary: "AI produces a candidate only. Local compilation, static checks, transaction preflight and human confirmation are required before signing.",
    generatedDesign: "Generated design", waitingInput: "Waiting for intent", designEmpty: "Describe the intent in plain language. AI will design the state machine, invariants and threat model before producing SilverScript source.",
    applyCandidate: "Apply candidate source", discard: "Discard", normalizeWhitespace: "Normalize whitespace", analyze: "Static analysis",
    constructorArgs: "Constructor arguments", argsHelp: "Use silverc expression JSON array format. Enter [] when the contract has no constructor parameters.",
    compilePinned: "Compile with pinned toolchain", artifact: "Build evidence", compileEmpty: "A full build will show the ABI, program hashes and heuristic security findings here.", compilerProfile: "Compiler compatibility profile", checkCompatibility: "Check breaking changes", applySafeMigration: "Apply safe migration",
    experimentalWarning: "Experimental software", deployWarning: "TN10 is the default. A successful build is not a security proof; review source, arguments, amount and the full transaction before signing.",
    fundCovenant: "Create the covenant UTXO", network: "Network", amount: "Locked amount", mainnetPhrase: "Mainnet confirmation phrase",
    walletNotConnected: "Wallet not connected", walletHelp: "Sign locally with the encrypted Studio wallet", buildDraft: "Build and preflight signing draft",
    chainProgress: "On-chain progress", stepArtifact: "Pinned build evidence", stepArtifactSub: "Source, arguments and compiler hashes match",
    stepDraft: "Draft and static preflight", stepDraftSub: "Check budgets, masses and fee estimate", stepSign: "Wallet signature", stepSignSub: "Keys are decrypted locally and immediately cleared",
    stepEngine: "Local real-engine preflight", stepEngineSub: "Every signed input must execute successfully", stepBroadcast: "Kaspa node broadcast", stepBroadcastSub: "Submit to a self-hosted or discovered node",
    templates: "Function templates", useTemplate: "Use template", walletManager: "Wallet Center", walletSecurity: "The mnemonic is encrypted locally with AES-256-GCM + scrypt. Wallet passwords are never cached, and every signature requires fresh confirmation.", savedWallet: "Saved wallet", walletName: "Wallet name", walletPassword: "Wallet password", paymentSecret: "BIP39 passphrase (optional)", importMnemonic: "BIP39 mnemonic", disconnect: "Disconnect wallet", createOrImport: "Create / import", unlock: "Unlock & connect", confirmSignature: "Confirm local signature", cancel: "Cancel", signNow: "Sign now",
    settings: "Application settings", aiSettings: "AI configuration", walletSettings: "Wallet & network", security: "Security",
    aiVault: "AI key vault", aiVaultHelp: "API keys are encrypted with AES-256-GCM + scrypt. The vault password only unlocks this device and is never stored.",
    baseUrl: "Base URL", apiKey: "API key", blankKeyHelp: "Leave the API key blank to keep its current value. Saved keys are never returned to the UI.", vaultPassword: "Vault password",
    lockVault: "Lock now", unlockVault: "Unlock vault", saveAiConfig: "Encrypt & save",
    walletPreferences: "Wallet & node preferences", walletPreferencesHelp: "Stores the default wallet, network and optional self-hosted Kaspa node URLs—never wallet passwords, mnemonics or BIP39 passphrases.",
    directNodeTitle: "Direct Kaspa node access", directNodeHelp: "Enter your own wRPC endpoint to operate without public websites. Leave it blank to use Kaspa public-node discovery. Kascov remains the preferred visual layer and never signs or broadcasts.", tn10RpcUrl: "TN10 wRPC URL (optional)", mainnetRpcUrl: "Mainnet wRPC URL (optional)", localPreflightPolicy: "Local preflight is mandatory", localPreflightPolicyHelp: "Every transaction first runs offline through the bundled Kascov-derived Kaspa script engine. Kascov adds the preferred report when reachable; its absence never blocks operation.",
    defaultWallet: "Default local wallet", vaultAutoLock: "AI vault auto-lock", signPolicy: "Authorize every transaction", signPolicyHelp: "Local wallet passwords are never cached. Re-enter the password and review the transaction before every signature.", manageWallets: "Create / import wallet", savePreferences: "Save preferences",
    securityLocalTitle: "Local encryption", securityLocalText: "AI keys and wallet mnemonics use separate encrypted stores with current-user file permissions. Neither is written to projects, logs or browser storage.",
    securityAiTitle: "AI cannot sign", securityAiText: "AI can propose source and transaction plans but cannot unlock wallets, sign transactions or authorize asset transfers.",
    securityNetworkTitle: "Fail-closed mainnet", securityNetworkText: "Mainnet is disabled by default. When enabled, amount limits, a confirmation phrase, full compilation, preflight and per-transaction signing still apply.",
    securityLimitTitle: "Threat boundary", securityLimitText: "Encryption prevents plaintext exposure but cannot defeat malware controlling the current OS account. Use a hardware or isolated signer for high-value mainnet funds.",
    connectExisting: "Connect an existing wallet", createOrImportWallet: "Create or import wallet", createNew: "Create new", importExisting: "Import mnemonic",
    newWalletPassword: "Set wallet password", confirmWalletPassword: "Confirm password", passwordMinimum: "Wallet passwords require at least 10 characters.", passwordHint: "Minimum 10 characters; use 14+ unique characters when possible. This password cannot be recovered.", createWallet: "Create encrypted wallet", importWallet: "Import encrypted wallet",
    checkingBalance: "Checking balance…", refresh: "Refresh", copyAddress: "Copy address", receive: "Receive", send: "Send", receiveKas: "Receive KAS", receiveHelp: "Make sure the sender uses the same network. Copy the full address below and refresh after payment.", sendKas: "Send KAS",
    recipientAddress: "Recipient address", sendAmount: "Amount", mainnetSendPhrase: "Mainnet confirmation phrase", reviewTransfer: "Review transaction & fee", confirmAndSend: "Confirm, sign & send",
    backupMnemonic: "Back up your mnemonic now", backupWarning: "This is the only wallet recovery credential and it is shown once. Write it down offline—never screenshot, upload or send it to anyone.", passphraseBackupWarning: "You set a BIP39 passphrase. Recovery requires both the mnemonic and passphrase; back them up separately offline.", shownOnce: "Shown once", backupConfirmed: "I recorded every word in order offline and understand that loss is unrecoverable", finishBackup: "Finish backup",
    noProjectHelp: "No work is open. Create directly from a template below, or click ＋ in the sidebar for a blank work.", templateIntro: "Start with a fully compiled template whenever possible. Clicking only selects and previews it—it creates no work and never calls AI.", selectTemplate: "Select & preview", viewExample: "View use-case example", newFromTemplate: "New work from template", applyTemplate: "Apply to current work", templateParameters: "Configure template", templateParametersHint: "Parameters are converted deterministically without AI", templateParameterBoundary: "Wallet fields generate covenant authorization keys, and the locked amount is copied to deployment. Templates never store private keys or secret preimages.", useConnectedWallet: "Use connected wallet", describeCustomContract: "Custom contract (AI)", customAiHelp: "Use AI only when the available templates cannot cover the requirement. AI produces a candidate; it does not replace deterministic templates.", confirmTemplateApply: "Confirm template application", templateReplaceWarning: "The current source, constructor arguments and unbroadcast build evidence will be replaced. Transactions already broadcast on-chain are unaffected.", confirmApply: "Apply template", deleteProject: "Delete work", deleteProjectWarning: "This permanently deletes only the local work file. Transactions already broadcast on-chain cannot be deleted.", confirmDelete: "Delete work", exampleRoles: "Participants", exampleSteps: "Walkthrough", exampleResult: "On-chain result", understood: "Got it",
    externalCovenantTitle: "Recognize, review & sign operation packages", externalCovenantHelp: "Imported packages are classified as renewal, multisig, claim, refund or payment. The label is only a review aid; authorization still comes from the complete transaction, UTXOs, redeem program, ABI, entrypoint, arguments and every output.", externalPackage: "Operation package JSON", inspectPackage: "Recognize & inspect", importInvitation: "Import operation package", signPackage: "Sign matching slots", externalConfirmation: "External signing phrase", externalConfirmationHelp: "Before signing, enter exactly: SIGN REVIEWED EXTERNAL COVENANT", externalReviewEmpty: "Paste or import a complete operation package. Studio verifies P2SH, covenant ID, inputs, outputs, fee, ABI arguments and signature slots.", signedPackage: "Latest operation package", copySignedPackage: "Copy latest package", broadcastConfirmation: "Broadcast confirmation phrase", broadcastPackage: "Preflight & broadcast complete transaction", signingInvitationTitle: "Remote signing invitation", signingInvitationHelp: "Send the same latest invitation package sequentially. Each signer imports it on their own device, verifies the commitment, signs, and passes the updated package onward.", transactionCommitment: "Transaction commitment", copyInvitation: "Copy invitation", downloadInvitation: "Download invitation", shareInvitation: "System share", sequentialSigningWarning: "Always pass the latest partially signed package. Never have two people sign separate initial copies. Compare the transaction commitment over another trusted channel before signing.",
    lifecycleTitle: "Export or remotely process operation packages", lifecycleHelp: "Build a portable package here only when another computer or multiple signers need it. For a local inheritance renewal, use Check in & renew above.", operation: "Operation", operationFee: "Explicit fee", operationDestination: "Release destination", claimSecretHex: "Secret preimage (hex)", merkleProofHex: "Merkle proof (hex)", revealPayloadHex: "Reveal payload (hex)", revealSaltHex: "32-byte salt (hex)", multisigSigners: "Select the two participating signer wallets", multisigInviteHint: "After building, download the invitation and send the same latest file sequentially. Each person signs on their own device.", buildOperationPackage: "Build exportable operation package", lifecycleDestinationRequired: "Enter the wallet address that will receive the released funds", lifecycleDestinationWrongNetwork: "The release destination must belong to the current project network", lifecycleDestinationInvalid: "The release destination must be a valid P2PK wallet address", multisigDeployGuideTitle: "Multisig invitations are created after deployment", multisigBeforeDeploy: "Build draft here only lets the funding wallet create the multisig covenant UTXO; the three members do not sign this funding transaction. After signing and broadcasting it, use Two-of-three spend below, select two members, build the operation, and download the invitation.", multisigAfterDeploy: "The multisig covenant is deployed. In Two-of-three spend below, select two signer wallets, enter the destination, then build the operation; the download button will appear beside it.", contractSchedule: "Contract maturity & activity", refreshLifecycle: "Refresh on-chain status", recognizedOperation: "Recognized operation", renewNow: "Check in & renew", inheritNow: "Trigger inheritance distribution", inheritanceMatureHelp: "The inactivity period has matured. Anyone can prepare the distribution transaction; recipient addresses and shares are fixed by the on-chain covenant. Review every amount before broadcast.", walletRequired: "This action requires a wallet. Connect a wallet first."
  }
};

const state = {
  language: detectBrowserLanguage(),
  token: "",
  config: null,
  settings: null,
  projects: [],
  templates: [],
  wallets: [],
  project: null,
  candidate: null,
  wallet: null,
  walletMode: "create",
  transferDraft: null,
  balanceTimer: null,
  draft: null,
  saveTimer: null,
  selectedTemplateId: "",
  pendingTemplateId: "",
  pendingTemplateParameters: null,
  templateValues: {},
  externalPackage: null,
  externalReview: null,
  lifecycleOperations: [],
  lifecycleSummary: null,
  localOperationProjectId: "",
  lifecycleInviteProjectId: "",
  pendingDeleteProjectId: "",
  pendingSourceMigration: null,
  pendingCreatedWalletId: ""
};

function tr(key) { return copy[state.language]?.[key] || copy.zh[key] || key; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function short(value, left = 9, right = 7) { const text = String(value || ""); return text.length > left + right + 3 ? `${text.slice(0, left)}…${text.slice(-right)}` : text; }

async function rawApi(path, options = {}) {
  const { backendRetry: _backendRetry, ...fetchOptions } = options;
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (options.body) headers["content-type"] = "application/json";
  if (!["GET", "HEAD"].includes(options.method || "GET")) headers["x-studio-token"] = state.token;
  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function desktopBackendDiagnostics() {
  if (!IS_TAURI) return null;
  try { return await invoke("backend_diagnostics"); } catch { return null; }
}

function backendUnavailableError(error, diagnostics) {
  const logPath = diagnostics?.logPath ? ` ${diagnostics.logPath}` : "";
  const detail = diagnostics?.logTail?.split("\n").filter(Boolean).slice(-1)[0] || error?.message || "Failed to fetch";
  return new Error(state.language === "zh"
    ? `本地服务启动失败：${detail}。诊断日志：${logPath || "应用数据目录/backend.log"}`
    : `The local service failed to start: ${detail}. Diagnostic log:${logPath || " app data/backend.log"}`);
}

async function waitForApi(attempt = 0, restarted = false) {
  try { return await rawApi("/api/session"); } catch (error) {
    if (!API_BASE) throw error;
    if (attempt >= 39) {
      if (IS_TAURI && !restarted) {
        try {
          await invoke("restart_backend");
          return waitForApi(0, true);
        } catch {}
      }
      throw backendUnavailableError(error, await desktopBackendDiagnostics());
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    return waitForApi(attempt + 1, restarted);
  }
}

let backendRecovery = null;

async function recoverDesktopBackend() {
  if (!IS_TAURI) throw new Error("Desktop backend recovery is unavailable in browser mode");
  backendRecovery ||= (async () => {
    await invoke("restart_backend");
    const session = await waitForApi(0, true);
    state.token = session.token;
    return session;
  })().finally(() => { backendRecovery = null; });
  return backendRecovery;
}

async function api(path, options = {}) {
  try {
    return await rawApi(path, options);
  } catch (error) {
    if (!IS_TAURI || options.backendRetry || !(error instanceof TypeError)) throw error;
    try {
      await recoverDesktopBackend();
      return await rawApi(path, { ...options, backendRetry: true });
    } catch (recoveryError) {
      throw backendUnavailableError(recoveryError, await desktopBackendDiagnostics());
    }
  }
}

function toast(message, kind = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 4200);
}

function applyLanguage() {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  document.title = "Kaspa SilverScript Studio";
  $$('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = tr(el.dataset.i18nPlaceholder); });
  $("#language-toggle").textContent = state.language === "zh" ? "EN" : "中文";
  $("#language-toggle").title = state.language === "zh" ? "Switch to English" : "切换到中文";
  $("#language-toggle").setAttribute("aria-label", $("#language-toggle").title);
  renderProjectList();
  renderTemplates();
  renderTemplatePreview();
  if (state.config && state.settings) configureProviders();
  renderWallet();
  renderExternalCovenantReview(state.externalReview);
  renderLifecycleOperations();
  renderLifecycleSummary();
  renderMultisigDeploymentGuide();
  renderLifecycleInvitationActions();
  renderSettings();
  if (!state.project && !$("#no-project-banner").hidden) {
    $("#project-name").value = state.language === "zh" ? "未选择工作" : "No work selected";
    $("#save-label").textContent = state.language === "zh" ? "没有打开的工作" : "No work open";
  }
  if (state.candidate) renderCandidate(state.candidate);
  if (state.project?.artifact?.analysis) renderFindings(state.project.artifact.analysis);
}

function selectTab(name) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
}

function sourceStats() {
  const source = $("#source-editor").value;
  $("#source-stats").textContent = `${source.split("\n").length} lines · ${new Blob([source]).size} bytes`;
}

function projectPayload() {
  let constructorArgs = [];
  try { constructorArgs = JSON.parse($("#constructor-args").value || "[]"); } catch {}
  return {
    name: $("#project-name").value,
    network: $("#deploy-network").value,
    requirements: $("#requirements").value,
    source: $("#source-editor").value,
    constructorArgs,
    compilerProfileId: $("#compiler-profile").value || state.config?.compiler?.defaultProfileId || "latest-cb34aa5",
    templateParameters: state.project?.templateParameters || {},
    deployAmount: $("#deploy-amount").value,
    specification: state.project?.specification || null,
    transactionPlans: state.project?.transactionPlans || [],
    review: state.project?.review || null,
    artifact: state.project?.artifact || null,
    deployment: state.project?.deployment || null
  };
}

function scheduleSave() {
  if (!state.project) return;
  $("#save-label").textContent = state.language === "zh" ? "正在保存…" : "Saving…";
  $("#save-dot").classList.add("saving");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveProject, 500);
}

async function saveProject() {
  if (!state.project) return;
  try {
    const { project } = await api(`/api/projects/${state.project.id}`, { method: "PUT", body: JSON.stringify(projectPayload()) });
    state.project = project;
    $("#save-label").textContent = tr("savedLocal");
    $("#save-dot").classList.remove("saving");
    await loadProjects(false);
  } catch (error) { toast(error.message, "bad"); }
}

function resetProjectScopedTransactionWorkspace() {
  clearProjectScopedTransactionState(state);
  state.lifecycleSummary = null;
  state.localOperationProjectId = "";
  $("#lifecycle-overview-card").hidden = true;
  $("#lifecycle-card").hidden = true;
  $("#lifecycle-status").textContent = "READY";
  $("#lifecycle-operation").innerHTML = "";
  $("#lifecycle-destination").value = "";
  $("#lifecycle-secret").value = "";
  $("#lifecycle-proof").value = "";
  $("#lifecycle-payload").value = "";
  $("#lifecycle-salt").value = "";
  $("#lifecycle-signer-options").innerHTML = "";
  $("#external-covenant-package").value = "";
  $("#external-covenant-confirmation").value = "";
  $("#external-broadcast-confirmation").value = "";
  $("#external-package-file").value = "";
  $("#external-signed-package").value = "";
  $("#external-signed-row").hidden = true;
  $("#external-copy-signed").hidden = true;
  $("#external-covenant-status").textContent = "IDLE";
  $("#operation-detection").hidden = true;
  renderExternalCovenantReview(null);
}

function loadProjectIntoUi(project) {
  resetProjectScopedTransactionWorkspace();
  state.project = project;
  state.draft = null;
  $("#project-name").disabled = false;
  $("#no-project-banner").hidden = true;
  $("#save-label").textContent = tr("savedLocal");
  $("#save-dot").classList.remove("saving");
  $("#project-name").value = project.name || "Untitled Covenant";
  $("#requirements").value = project.requirements || "";
  $("#source-editor").value = project.source || "";
  $("#constructor-args").value = JSON.stringify(project.constructorArgs || [], null, 2);
  $("#compiler-profile").value = project.compilerProfileId || project.artifact?.compiler?.id || project.review?.compilerProfileId || state.config?.compiler?.defaultProfileId || "latest-cb34aa5";
  renderCompilerProfileHelp();
  $("#deploy-amount").value = project.deployAmount || "0.05";
  $("#deploy-network").value = project.network || "tn10";
  updateNetworkControls();
  sourceStats();
  renderArtifact(project.artifact);
  renderDeployment(project.deployment);
  renderMultisigDeploymentGuide();
  renderLifecycleInvitationActions();
  loadLifecycleOperations(project);
  loadLifecycleStatus(project);
  renderProjectList();
  renderTemplatePreview();
}

function showNoProject() {
  clearTimeout(state.saveTimer);
  state.project = null;
  state.draft = null;
  state.candidate = null;
  resetProjectScopedTransactionWorkspace();
  $("#project-name").value = state.language === "zh" ? "未选择工作" : "No work selected";
  $("#project-name").disabled = true;
  $("#requirements").value = "";
  $("#source-editor").value = "";
  $("#constructor-args").value = "[]";
  $("#deploy-amount").value = "0.05";
  $("#no-project-banner").hidden = false;
  $("#save-label").textContent = state.language === "zh" ? "没有打开的工作" : "No work open";
  $("#save-dot").classList.remove("saving");
  $("#ai-result").hidden = true;
  $("#ai-actions").hidden = true;
  $("#ai-empty").hidden = false;
  renderArtifact(null);
  renderDeployment(null);
  sourceStats();
  renderProjectList();
  renderTemplatePreview();
  selectTab("design");
}

async function loadProjects(openFirst = true) {
  const payload = await api("/api/projects");
  state.projects = payload.projects || [];
  renderProjectList();
  if (openFirst && !state.project) {
    if (state.projects.length) await openProject(state.projects[0].id);
    else showNoProject();
  }
}

function renderProjectList() {
  const list = $("#project-list");
  if (!list) return;
  const deleteLabel = state.language === "zh" ? "删除工作" : "Delete work";
  list.innerHTML = state.projects.map((project) => `<div class="project-row"><button class="project-item ${project.id === state.project?.id ? "active" : ""}" data-project="${esc(project.id)}"><span>${esc((project.name || "Untitled").slice(0, 1).toUpperCase())}</span><div><strong>${esc(project.name || "Untitled")}</strong><small>${esc(project.network === "mainnet" ? "MAINNET" : "TN10")} · ${esc(new Date(project.updatedAt).toLocaleDateString())}</small></div></button><button type="button" class="project-delete" data-delete-project="${esc(project.id)}" title="${deleteLabel}" aria-label="${deleteLabel}">×</button></div>`).join("");
  $$('[data-project]').forEach((button) => button.addEventListener("click", () => openProject(button.dataset.project)));
  $$('[data-delete-project]').forEach((button) => button.addEventListener("click", () => openDeleteProjectDialog(button.dataset.deleteProject)));
}

async function createProject(templateId = "", parameters = null) {
  const name = state.language === "zh" ? "新的 Covenant" : "New Covenant";
  const endpoint = templateId ? `/api/templates/${encodeURIComponent(templateId)}/projects` : "/api/projects";
  const { project } = await api(endpoint, { method: "POST", body: JSON.stringify(templateId ? { network: $("#deploy-network").value, parameters, language: state.language } : { name }) });
  await loadProjects(false);
  loadProjectIntoUi(project);
  selectTab(templateId ? "source" : "design");
}

async function loadTemplates() {
  const payload = await api("/api/templates");
  state.templates = payload.templates || [];
  renderTemplates();
}

function renderTemplates() {
  const grid = $("#template-grid");
  if (!grid) return;
  grid.innerHTML = state.templates.map((template) => `<article class="template-card ${template.id === state.selectedTemplateId ? "selected" : ""}">
    <button type="button" class="template-card-main" data-template-select="${esc(template.id)}"><span>${esc(template.category)}</span><strong>${esc(state.language === "zh" ? template.titleZh : template.titleEn)}</strong><p>${esc(state.language === "zh" ? template.descriptionZh : template.descriptionEn)}</p><b>${tr("selectTemplate")} →</b></button>
    <button type="button" class="template-example-button" data-template-example="${esc(template.id)}">${tr("viewExample")}</button>
  </article>`).join("");
  $$('[data-template-select]').forEach((button) => button.addEventListener("click", () => selectTemplate(button.dataset.templateSelect)));
  $$('[data-template-example]').forEach((button) => button.addEventListener("click", () => {
    selectTemplate(button.dataset.templateExample);
    openTemplateExample();
  }));
}

function selectedTemplate() {
  return state.templates.find((template) => template.id === state.selectedTemplateId) || null;
}

function selectTemplate(id) {
  state.selectedTemplateId = id;
  initializeTemplateValues(selectedTemplate());
  renderTemplates();
  renderTemplatePreview();
}

function localDateTimeValue(date) {
  const value = new Date(date);
  const pad = (number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function initializeTemplateValues(template) {
  if (!template) return {};
  const values = state.templateValues[template.id] ||= {};
  for (const field of template.parameters || []) {
    if (values[field.id] !== undefined && values[field.id] !== "") continue;
    if (field.type === "heirs") values[field.id] = [{ address: "", shareBps: 5000 }, { address: "", shareBps: 5000 }];
    else if (field.type === "duration") values[field.id] = { value: String(field.defaultValue || 1), unit: field.defaultUnit || "days" };
    else if (field.type === "kcc721Metadata") values[field.id] = structuredClone(field.default || { name: "", description: "", image: "", externalUrl: "", attributes: [] });
    else if (field.default !== undefined) values[field.id] = String(field.default);
    else if (field.defaultOffsetSeconds) values[field.id] = localDateTimeValue(Date.now() + Number(field.defaultOffsetSeconds) * 1000);
    else if (field.type === "address" && field.useConnectedWallet && state.wallet?.network === $("#deploy-network").value) values[field.id] = state.wallet.address;
    else values[field.id] = "";
  }
  return values;
}

function templateFieldInput(field, value) {
  const language = state.language;
  const placeholder = String(language === "zh" ? field.placeholderZh || "" : field.placeholderEn || "")
    .replace(/^kaspatest:/, $("#deploy-network").value === "mainnet" ? "kaspa:" : "kaspatest:");
  const common = `data-template-parameter="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${field.required === false ? "" : "required"}`;
  if (field.type === "amount") return `<input ${common} inputmode="decimal" min="${esc(field.minimum || "0")}" pattern="^(0|[1-9]\\d*)(\\.\\d{1,8})?$" />`;
  if (field.type === "datetime") return `<input ${common} type="datetime-local" step="1" />`;
  if (field.type === "sha256") return `<input ${common} inputmode="text" maxlength="66" pattern="^(0x)?[0-9a-fA-F]{64}$" autocomplete="off" spellcheck="false" />`;
  if (field.type === "choice") return `<select ${common}>${(field.options || []).map((option) => `<option value="${esc(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${esc(language === "zh" ? option.labelZh : option.labelEn)}</option>`).join("")}</select>`;
  if (field.type === "kcc721CollectionId") return `<input ${common} inputmode="text" maxlength="66" pattern="^(0x)?[0-9a-fA-F]{64}$" autocomplete="off" spellcheck="false" />`;
  if (field.type === "integer") return `<input ${common} type="number" min="${esc(field.minimum ?? Number.MIN_SAFE_INTEGER)}" max="${esc(field.maximum ?? Number.MAX_SAFE_INTEGER)}" step="1" />`;
  return `<input ${common} inputmode="text" autocomplete="off" spellcheck="false" />`;
}

async function updateKcc721Digest(template) {
  const output = $("[data-kcc721-digest]");
  if (!output) return;
  const metadata = state.templateValues[template.id]?.metadata;
  try {
    const { digest } = await kcc721MetadataDigest(metadata);
    output.textContent = digest;
    output.classList.remove("bad");
  } catch (error) {
    output.textContent = state.language === "zh" ? `元数据未完成：${error.message}` : `Metadata incomplete: ${error.message}`;
    output.classList.add("bad");
  }
}

function renderTemplateParameterFields(template) {
  const values = initializeTemplateValues(template);
  const fields = template.parameters || [];
  $("#template-parameter-form").hidden = !fields.length;
  const renderedFields = new Map(fields.map((field) => {
    const label = state.language === "zh" ? field.labelZh : field.labelEn;
    const help = state.language === "zh" ? field.helpZh : field.helpEn;
    if (field.type === "kcc721Metadata") {
      const metadata = values[field.id] || {};
      const attributes = JSON.stringify(metadata.attributes || [], null, 2);
      return [field.id, `<div class="template-field kcc721-metadata-field">
        <span>${esc(label || field.id)}</span>
        <div class="kcc721-metadata-grid">
          <label><b>${state.language === "zh" ? "名称" : "Name"}</b><input data-kcc721-metadata="name" value="${esc(metadata.name || "")}" maxlength="120" required /></label>
          <label><b>${state.language === "zh" ? "图片 URI" : "Image URI"}</b><input data-kcc721-metadata="image" value="${esc(metadata.image || "")}" maxlength="2048" placeholder="ipfs://... / https://..." /></label>
          <label class="wide"><b>${state.language === "zh" ? "描述" : "Description"}</b><textarea data-kcc721-metadata="description" maxlength="2000">${esc(metadata.description || "")}</textarea></label>
          <label class="wide"><b>${state.language === "zh" ? "外部链接（可选）" : "External URL (optional)"}</b><input data-kcc721-metadata="externalUrl" value="${esc(metadata.externalUrl || "")}" maxlength="2048" placeholder="https://..." /></label>
          <label class="wide"><b>${state.language === "zh" ? "属性 JSON 数组（可选）" : "Attributes JSON array (optional)"}</b><textarea data-kcc721-attributes spellcheck="false">${esc(attributes)}</textarea></label>
        </div>
        <small>${esc(help || "")}</small>
        <div class="kcc721-digest"><b>SHA-256</b><code data-kcc721-digest>${state.language === "zh" ? "正在本地计算…" : "Computing locally…"}</code></div>
      </div>`];
    }
    if (field.type === "heirs") {
      const rows = Array.isArray(values[field.id]) ? values[field.id] : [];
      const rowHtml = rows.map((item, index) => `<div class="heir-row">
        <b>${state.language === "zh" ? `继承人 ${index + 1}` : `Inheritor ${index + 1}`}</b>
        <input data-heir-address="${index}" value="${esc(item.address || "")}" placeholder="${$("#deploy-network").value === "mainnet" ? "kaspa:" : "kaspatest:"}..." required autocomplete="off" spellcheck="false" />
        <div class="heir-share"><input data-heir-share="${index}" value="${esc(Number(item.shareBps || 0) / 100)}" type="number" min="0.01" max="99.99" step="0.01" required /><span>%</span></div>
        <button type="button" class="icon-button danger" data-remove-heir="${index}" ${rows.length <= Number(field.minimum || 2) ? "disabled" : ""} aria-label="Remove">×</button>
      </div>`).join("");
      return [field.id, `<div class="template-field template-heirs" data-heirs-field="${esc(field.id)}"><div class="heir-heading"><span>${esc(label || field.id)}</span><button type="button" class="outline-button small" data-add-heir ${rows.length >= Number(field.maximum || 5) ? "disabled" : ""}>${state.language === "zh" ? "+ 添加继承人" : "+ Add inheritor"}</button></div><div class="heir-list">${rowHtml}</div><small>${esc(help || "")}</small><strong class="heir-total" data-heir-total></strong></div>`];
    }
    if (field.type === "duration") {
      const duration = typeof values[field.id] === "object" && values[field.id] ? values[field.id] : { value: String(values[field.id] || field.defaultValue || 1), unit: "days" };
      const units = [
        ["minutes", state.language === "zh" ? "分钟" : "Minutes"],
        ["hours", state.language === "zh" ? "小时" : "Hours"],
        ["days", state.language === "zh" ? "天" : "Days"],
        ["weeks", state.language === "zh" ? "周" : "Weeks"]
      ];
      return [field.id, `<label class="template-field"><span>${esc(label || field.id)}</span><div class="duration-input"><input data-template-duration-value="${esc(field.id)}" value="${esc(duration.value)}" type="number" min="1" step="1" required /><select data-template-duration-unit="${esc(field.id)}">${units.map(([unit, text]) => `<option value="${unit}" ${duration.unit === unit ? "selected" : ""}>${text}</option>`).join("")}</select></div><small>${esc(help || "")}</small></label>`];
    }
    const addon = field.type === "address"
      ? `<button type="button" class="outline-button small" data-template-wallet-field="${esc(field.id)}">${tr("useConnectedWallet")}</button>`
      : field.type === "amount" ? `<b class="template-field-unit">${$("#deploy-network").value === "mainnet" ? "KAS" : "TKAS"}</b>` : "";
    const quickOffsets = field.type === "datetime" && Array.isArray(field.quickOffsets)
      ? field.quickOffsets.filter((seconds) => $("#deploy-network").value !== "mainnet" || Number(seconds) >= 3600)
      : [];
    const quickButtons = quickOffsets.length ? `<div class="time-presets">${quickOffsets.map((seconds) => {
      const amount = Number(seconds);
      const text = amount < 3600 ? `+${amount / 60}${state.language === "zh" ? "分钟" : "m"}` : amount < 86400 ? `+${amount / 3600}${state.language === "zh" ? "小时" : "h"}` : `+${amount / 86400}${state.language === "zh" ? "天" : "d"}`;
      return `<button type="button" class="outline-button small" data-time-offset="${amount}" data-time-field="${esc(field.id)}">${text}${amount === 60 ? ` · ${state.language === "zh" ? "TN10 测试" : "TN10 test"}` : ""}</button>`;
    }).join("")}</div>` : "";
    if (field.type === "kcc721CollectionId" && values.collectionMode === "preview") {
      return [field.id, `<div class="template-field kcc721-pending-id"><span>${esc(label || field.id)}</span><strong>${state.language === "zh" ? "待 Collection 创世交易生成" : "Generated by the Collection genesis transaction"}</strong><small>${esc(help || "")}</small></div>`];
    }
    return [field.id, `<label class="template-field"><span>${esc(label || field.id)}</span><div class="template-field-input">${templateFieldInput(field, values[field.id] || "")}${addon}</div>${quickButtons}<small>${esc(help || "")}</small></label>`];
  }));
  if (template.parameterLayout === "steps" && Array.isArray(template.parameterSteps)) {
    $("#template-parameter-fields").innerHTML = template.parameterSteps.map((step) => {
      const title = state.language === "zh" ? step.titleZh : step.titleEn;
      const help = state.language === "zh" ? step.helpZh : step.helpEn;
      const content = fields.filter((field) => field.step === step.id).map((field) => renderedFields.get(field.id) || "").join("");
      return `<section class="template-parameter-step"><header><b>${String(step.number || "").padStart(2, "0")}</b><div><strong>${esc(title || step.id)}</strong><small>${esc(help || "")}</small></div></header><div class="template-step-fields">${content}</div></section>`;
    }).join("");
  } else {
    $("#template-parameter-fields").innerHTML = fields.map((field) => renderedFields.get(field.id) || "").join("");
  }
  $$('[data-template-parameter]').forEach((input) => input.addEventListener("input", () => {
    state.templateValues[template.id][input.dataset.templateParameter] = input.value;
    if (input.dataset.templateParameter === "collectionMode") renderTemplateParameterFields(template);
  }));
  $$('[data-kcc721-metadata]').forEach((input) => input.addEventListener("input", () => {
    state.templateValues[template.id].metadata[input.dataset.kcc721Metadata] = input.value;
    updateKcc721Digest(template);
  }));
  $("[data-kcc721-attributes]")?.addEventListener("input", (event) => {
    const source = event.currentTarget.value.trim();
    try {
      state.templateValues[template.id].metadata.attributes = source ? JSON.parse(source) : [];
      event.currentTarget.setCustomValidity("");
    } catch {
      event.currentTarget.setCustomValidity(state.language === "zh" ? "请输入有效的 JSON 数组" : "Enter a valid JSON array");
    }
    updateKcc721Digest(template);
  });
  $$('[data-template-duration-value], [data-template-duration-unit]').forEach((input) => input.addEventListener("input", () => {
    const id = input.dataset.templateDurationValue || input.dataset.templateDurationUnit;
    state.templateValues[template.id][id] = {
      value: $(`[data-template-duration-value="${id}"]`)?.value || "",
      unit: $(`[data-template-duration-unit="${id}"]`)?.value || "days"
    };
  }));
  $$("[data-time-offset]").forEach((button) => button.addEventListener("click", () => {
    const input = $(`[data-template-parameter="${button.dataset.timeField}"]`);
    if (!input) return;
    input.value = localDateTimeValue(Date.now() + Number(button.dataset.timeOffset) * 1000);
    state.templateValues[template.id][button.dataset.timeField] = input.value;
  }));
  const heirField = fields.find((field) => field.type === "heirs");
  if (heirField) {
    const list = state.templateValues[template.id][heirField.id];
    const updateTotal = () => {
      const total = list.reduce((sum, item) => sum + Number(item.shareBps || 0), 0) / 100;
      const label = $("[data-heir-total]");
      if (label) {
        label.textContent = `${state.language === "zh" ? "总计" : "Total"}: ${total.toFixed(2)}%`;
        label.classList.toggle("bad", Math.round(total * 100) !== 10000);
      }
    };
    $$('[data-heir-address]').forEach((input) => input.addEventListener("input", () => { list[Number(input.dataset.heirAddress)].address = input.value; }));
    $$('[data-heir-share]').forEach((input) => input.addEventListener("input", () => {
      list[Number(input.dataset.heirShare)].shareBps = Math.round(Number(input.value || 0) * 100);
      updateTotal();
    }));
    $("[data-add-heir]")?.addEventListener("click", () => {
      if (list.length >= Number(heirField.maximum || 5)) return;
      const count = list.length + 1;
      const share = Math.floor(10000 / count);
      list.forEach((item) => { item.shareBps = share; });
      list.push({ address: "", shareBps: 10000 - share * (count - 1) });
      renderTemplateParameterFields(template);
    });
    $$('[data-remove-heir]').forEach((button) => button.addEventListener("click", () => {
      if (list.length <= Number(heirField.minimum || 2)) return;
      list.splice(Number(button.dataset.removeHeir), 1);
      const share = Math.floor(10000 / list.length);
      list.forEach((item, index) => { item.shareBps = index === list.length - 1 ? 10000 - share * (list.length - 1) : share; });
      renderTemplateParameterFields(template);
    }));
    updateTotal();
  }
  $$('[data-template-wallet-field]').forEach((button) => button.addEventListener("click", () => {
    if (!state.wallet) {
      toast(tr("walletRequired"), "warn");
      return openWalletManager();
    }
    if (state.wallet.network !== $("#deploy-network").value) return toast(state.language === "zh" ? "当前钱包网络与模板网络不一致" : "The connected wallet is on a different network", "warn");
    const input = $(`[data-template-parameter="${button.dataset.templateWalletField}"]`);
    if (!input) return;
    input.value = state.wallet.address;
    state.templateValues[template.id][button.dataset.templateWalletField] = state.wallet.address;
  }));
  updateKcc721Digest(template);
}

function configuredTemplateParameters() {
  const template = selectedTemplate();
  if (!template) return null;
  const form = $("#template-parameter-form");
  if (!form.reportValidity()) return null;
  const values = {};
  $$('[data-template-parameter]').forEach((input) => { values[input.dataset.templateParameter] = input.value.trim(); });
  const metadataField = (template.parameters || []).find((field) => field.type === "kcc721Metadata");
  if (metadataField) values[metadataField.id] = structuredClone(state.templateValues[template.id][metadataField.id]);
  $$("[data-template-duration-value]").forEach((input) => {
    const id = input.dataset.templateDurationValue;
    values[id] = { value: input.value.trim(), unit: $(`[data-template-duration-unit="${id}"]`)?.value || "days" };
  });
  const heirField = (template.parameters || []).find((field) => field.type === "heirs");
  if (heirField) values[heirField.id] = (state.templateValues[template.id][heirField.id] || []).map((item) => ({ address: String(item.address || "").trim(), shareBps: Number(item.shareBps) }));
  state.templateValues[template.id] = { ...values };
  return values;
}

function renderTemplatePreview() {
  const preview = $("#template-preview");
  if (!preview) return;
  const template = selectedTemplate();
  preview.hidden = !template;
  if (!template) return;
  $("#template-preview-category").textContent = template.category || "TEMPLATE";
  $("#template-preview-title").textContent = state.language === "zh" ? template.titleZh : template.titleEn;
  $("#template-preview-description").textContent = state.language === "zh" ? template.descriptionZh : template.descriptionEn;
  const meta = [
    state.language === "zh" ? "固定版本完整编译" : "Pinned full build",
    `${template.constructorArgs?.length || 0} ${state.language === "zh" ? "个构造参数" : "constructor args"}`,
    `${template.transactionPlans?.length || 0} ${state.language === "zh" ? "个交易计划" : "transaction plans"}`,
    `${template.invariants?.length || 0} ${state.language === "zh" ? "条不变量" : "invariants"}`
  ];
  $("#template-preview-meta").innerHTML = meta.map((item) => `<span>${esc(item)}</span>`).join("");
  renderTemplateParameterFields(template);
  $("#template-apply").hidden = !state.project;
  $("#template-apply").textContent = tr("applyTemplate");
}

function openTemplateExample() {
  const template = selectedTemplate();
  const example = template?.example;
  if (!example) return toast(state.language === "zh" ? "当前模板暂时没有用例示范" : "This template has no use-case example yet", "warn");
  const suffix = state.language === "zh" ? "Zh" : "En";
  const list = (key) => Array.isArray(example[`${key}${suffix}`]) ? example[`${key}${suffix}`] : [];
  $("#template-example-title").textContent = example[`title${suffix}`] || (state.language === "zh" ? template.titleZh : template.titleEn);
  $("#template-example-scenario").textContent = example[`scenario${suffix}`] || "";
  $("#template-example-roles").innerHTML = list("roles").map((item) => `<li>${esc(item)}</li>`).join("");
  $("#template-example-steps").innerHTML = list("steps").map((item) => `<li>${esc(item)}</li>`).join("");
  $("#template-example-result").textContent = example[`result${suffix}`] || "";
  $("#template-example-caution").textContent = example[`caution${suffix}`] || "";
  $("#template-example-dialog").showModal();
}

async function createFromSelectedTemplate() {
  const template = selectedTemplate();
  if (!template) return;
  const parameters = configuredTemplateParameters();
  if (!parameters) return;
  await createProject(template.id, parameters);
  toast(state.language === "zh" ? `已从“${template.titleZh}”新建工作，未调用 AI` : `Created from “${template.titleEn}” without AI`, "good");
}

function requestTemplateApply() {
  const template = selectedTemplate();
  if (!template) return;
  const parameters = configuredTemplateParameters();
  if (!parameters) return;
  if (!state.project) return createFromSelectedTemplate();
  state.pendingTemplateId = template.id;
  state.pendingTemplateParameters = parameters;
  const templateName = state.language === "zh" ? template.titleZh : template.titleEn;
  $("#template-apply-message").textContent = state.language === "zh"
    ? `将“${templateName}”直接应用到当前工作“${state.project.name}”？此过程不会调用 AI。`
    : `Apply “${templateName}” directly to “${state.project.name}”? AI will not be called.`;
  $("#template-apply-dialog").showModal();
}

async function applyPendingTemplate() {
  const id = state.pendingTemplateId;
  const parameters = state.pendingTemplateParameters;
  state.pendingTemplateId = "";
  state.pendingTemplateParameters = null;
  if (!id || !parameters || !state.project) return;
  clearTimeout(state.saveTimer);
  const template = state.templates.find((item) => item.id === id);
  const { project } = await api(`/api/projects/${encodeURIComponent(state.project.id)}/template/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ network: $("#deploy-network").value, parameters, language: state.language })
  });
  loadProjectIntoUi(project);
  await loadProjects(false);
  selectTab("source");
  toast(state.language === "zh" ? `已直接应用“${template?.titleZh || id}”，未调用 AI` : `Applied “${template?.titleEn || id}” directly without AI`, "good");
}

function openDeleteProjectDialog(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  state.pendingDeleteProjectId = id;
  $("#project-delete-message").textContent = state.language === "zh"
    ? `确定删除本地工作“${project.name}”？`
    : `Delete the local work “${project.name}”?`;
  $("#project-delete-dialog").showModal();
}

async function deletePendingProject() {
  const id = state.pendingDeleteProjectId;
  state.pendingDeleteProjectId = "";
  if (!id) return;
  const deletingCurrent = state.project?.id === id;
  if (deletingCurrent) {
    clearTimeout(state.saveTimer);
    state.project = null;
  }
  await api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadProjects(false);
  if (deletingCurrent) {
    if (state.projects.length) await openProject(state.projects[0].id);
    else showNoProject();
  } else {
    renderProjectList();
  }
  toast(state.language === "zh" ? "本地工作已删除，链上交易不受影响" : "Local work deleted; on-chain transactions are unaffected", "good");
}

async function openProject(id) {
  const { project } = await api(`/api/projects/${id}`);
  loadProjectIntoUi(project);
}

function providerLabel(id) {
  return ({ openai: "OpenAI · Responses", anthropic: "Anthropic · Messages", gemini: "Google · Gemini", openrouter: "OpenRouter", ollama: "Ollama · Local", compatible: "OpenAI-compatible" })[id] || id;
}

function configureProviders() {
  const select = $("#provider");
  const providers = state.settings?.ai?.providers || state.config.providers;
  const previous = select.value;
  select.innerHTML = Object.values(providers).map((provider) => `<option value="${provider.id}">${providerLabel(provider.id)}${provider.configured ? "" : state.language === "zh" ? " · 未配置" : " · not configured"}</option>`).join("");
  const first = Object.values(providers).find((provider) => provider.stored) || Object.values(providers).find((provider) => provider.configured);
  if (providers[previous]) select.value = previous;
  else if (first) select.value = first.id;
  updateProviderModel();
}

function updateProviderModel() {
  const provider = (state.settings?.ai?.providers || state.config.providers)[$("#provider").value];
  if (provider) $("#model").value = provider.defaultModel || "";
}

function selectSettingsTab(name) {
  $$("[data-settings-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.settingsTab === name));
  $$("[data-settings-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.settingsPanel === name));
}

function providerForSettings() {
  return state.settings?.ai?.providers?.[$("#settings-provider").value];
}

function renderAiProviderEditor() {
  const provider = providerForSettings();
  if (!provider) return;
  $("#settings-model").value = provider.defaultModel || "";
  $("#settings-base-url").value = provider.baseUrl || "";
  const needsUrl = ["ollama", "compatible"].includes(provider.id);
  $("#settings-base-url-row").hidden = !needsUrl;
  $("#settings-api-key-row").hidden = provider.id === "ollama";
  $("#settings-api-key").value = "";
}

function renderSettings() {
  if (!state.settings) return;
  const ai = state.settings.ai;
  const status = $("#ai-vault-status");
  status.textContent = !ai.exists ? "NOT CREATED" : ai.locked ? "LOCKED" : "UNLOCKED";
  status.className = `result-status ${ai.exists && !ai.locked ? "good" : ai.exists ? "warn" : ""}`;
  const select = $("#settings-provider");
  const previous = select.value;
  select.innerHTML = Object.values(ai.providers).map((provider) => `<option value="${provider.id}">${providerLabel(provider.id)} · ${provider.stored ? (ai.locked ? "VAULT / LOCKED" : "VAULT") : provider.source === "environment" ? "ENV" : "NEW"}</option>`).join("");
  if (ai.providers[previous]) select.value = previous;
  renderAiProviderEditor();

  $("#settings-network").value = state.settings.settings.defaultNetwork;
  $("#default-network-state").textContent = state.settings.settings.defaultNetwork === "mainnet" ? "MAINNET" : "TN10";
  $("#settings-network option[value='mainnet']").disabled = !state.config.allowMainnet;
  $("#settings-auto-lock").value = String(state.settings.settings.aiAutoLockMinutes);
  $("#settings-tn10-rpc").value = state.settings.settings.tn10RpcUrl || "";
  $("#settings-mainnet-rpc").value = state.settings.settings.mainnetRpcUrl || "";
  const walletSelect = $("#settings-wallet");
  walletSelect.innerHTML = `<option value="">${state.language === "zh" ? "不指定" : "No default"}</option>${state.wallets.map((wallet) => `<option value="${esc(wallet.id)}">${esc(wallet.title)} · ${esc(short(wallet.publicKey, 8, 6))}</option>`).join("")}`;
  walletSelect.value = state.settings.settings.defaultWalletId || "";
}

async function loadSettings() {
  state.settings = await api("/api/settings");
  configureProviders();
  renderSettings();
}

async function openSettings() {
  await loadWallets();
  await loadSettings();
  $("#settings-vault-password").value = "";
  $("#settings-api-key").value = "";
  $("#settings-dialog").showModal();
}

async function unlockAiVault() {
  try {
    const payload = await api("/api/settings/ai/unlock", { method: "POST", body: JSON.stringify({ vaultSecret: $("#settings-vault-password").value }) });
    state.settings.ai = payload.ai;
    $("#settings-vault-password").value = "";
    configureProviders();
    $("#provider").value = $("#settings-provider").value;
    updateProviderModel();
    renderSettings();
    toast(state.language === "zh" ? "AI 保险库已解锁" : "AI vault unlocked", "good");
  } catch (error) { toast(error.message, "bad"); }
}

async function lockAiVault() {
  try {
    const payload = await api("/api/settings/ai/lock", { method: "POST", body: "{}" });
    state.settings.ai = payload.ai;
    $("#settings-vault-password").value = "";
    $("#settings-api-key").value = "";
    configureProviders();
    renderSettings();
    toast(state.language === "zh" ? "AI 保险库已锁定" : "AI vault locked", "good");
  } catch (error) { toast(error.message, "bad"); }
}

async function saveAiSettings() {
  const button = $("#ai-settings-save");
  button.disabled = true;
  try {
    const payload = await api("/api/settings/ai/save", { method: "POST", body: JSON.stringify({
      providerId: $("#settings-provider").value,
      model: $("#settings-model").value,
      baseUrl: $("#settings-base-url").value,
      apiKey: $("#settings-api-key").value,
      vaultSecret: $("#settings-vault-password").value
    }) });
    state.settings.ai = payload.ai;
    $("#settings-api-key").value = "";
    $("#settings-vault-password").value = "";
    configureProviders();
    $("#provider").value = $("#settings-provider").value;
    updateProviderModel();
    renderSettings();
    toast(state.language === "zh" ? "AI 配置已加密保存并解锁" : "AI configuration encrypted, saved and unlocked", "good");
  } catch (error) { toast(error.message, "bad"); }
  finally { button.disabled = false; }
}

async function saveAppSettings() {
  try {
    const payload = await api("/api/settings", { method: "PUT", body: JSON.stringify({
      defaultNetwork: $("#settings-network").value,
      defaultWalletId: $("#settings-wallet").value,
      aiAutoLockMinutes: Number($("#settings-auto-lock").value),
      tn10RpcUrl: $("#settings-tn10-rpc").value,
      mainnetRpcUrl: $("#settings-mainnet-rpc").value
    }) });
    state.settings = payload;
    configureProviders();
    renderSettings();
    toast(state.language === "zh" ? "钱包与网络偏好已保存" : "Wallet and network preferences saved", "good");
  } catch (error) { toast(error.message, "bad"); }
}

function renderCandidate(candidate) {
  const spec = candidate.specification || {};
  const review = candidate.review || {};
  const plans = Array.isArray(candidate.transactionPlans) ? candidate.transactionPlans : [];
  $("#ai-empty").hidden = true;
  $("#ai-result").hidden = false;
  $("#ai-actions").hidden = false;
  $("#ai-status").textContent = "CANDIDATE";
  $("#ai-result").innerHTML = `
    <div class="spec-hero"><span>${esc(spec.network || "testnet-10")}</span><h4>${esc(spec.title || "SilverScript Covenant")}</h4><p>${esc(state.language === "zh" ? spec.summaryZh || spec.summaryEn : spec.summaryEn || spec.summaryZh)}</p></div>
    <div class="spec-columns">
      <div><strong>${state.language === "zh" ? "核心不变量" : "Core invariants"}</strong><ul>${(spec.invariants || []).slice(0, 6).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div><strong>${state.language === "zh" ? "未解决问题" : "Open questions"}</strong><ul>${(review.unresolvedQuestions || []).slice(0, 6).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>—</li>"}</ul></div>
    </div>
    <div class="transaction-plans">
      <strong>${state.language === "zh" ? "交易构建计划" : "Transaction build plans"}</strong>
      ${plans.length ? plans.slice(0, 8).map((plan) => `<div class="transaction-plan"><b>${esc(plan.transition || "transition")}</b><span>${esc((plan.inputs || []).length)} IN → ${esc((plan.outputs || []).length)} OUT</span><p>${esc((plan.conservationChecks || []).join(" · ") || (state.language === "zh" ? "等待资产守恒说明" : "Conservation checks pending"))}</p></div>`).join("") : `<p class="muted">${state.language === "zh" ? "AI 必须为每个状态迁移给出输入、输出、契约绑定和资产守恒计划。" : "AI must specify inputs, outputs, covenant bindings and conservation for every transition."}</p>`}
    </div>`;
}

async function runAi(mode) {
  const selectedProvider = state.settings?.ai?.providers?.[$("#provider").value];
  if (!selectedProvider?.configured) {
    selectSettingsTab("ai");
    await openSettings();
    return toast(state.language === "zh" ? "请先保存并解锁这个 AI 接口" : "Save and unlock this AI provider first", "warn");
  }
  const button = mode === "review" ? $("#review-contract") : $("#generate-contract");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = state.language === "zh" ? "AI 正在设计与检查…" : "AI is designing and checking…";
  $("#ai-status").textContent = "WORKING";
  try {
    if (!state.project) await createProject();
    const payload = await api(`/api/ai/${mode === "review" ? "review" : "generate"}`, {
      method: "POST",
      body: JSON.stringify({
        provider: $("#provider").value,
        model: $("#model").value,
        language: state.language,
        requirements: $("#requirements").value,
        currentSource: $("#source-editor").value
      })
    });
    state.candidate = payload.result;
    renderCandidate(payload.result);
  } catch (error) {
    $("#ai-status").textContent = "FAILED";
    toast(error.message, "bad");
    if (error.status === 423) {
      selectSettingsTab("ai");
      await openSettings();
    }
  } finally { button.disabled = false; button.textContent = original; }
}

function applyCandidate() {
  if (!state.candidate || !state.project) return;
  $("#source-editor").value = state.candidate.source;
  $("#constructor-args").value = JSON.stringify(state.candidate.constructorArgs || [], null, 2);
  state.project.specification = state.candidate.specification;
  state.project.transactionPlans = state.candidate.transactionPlans || [];
  state.project.review = state.candidate.review;
  state.project.artifact = null;
  sourceStats();
  renderArtifact(null);
  scheduleSave();
  selectTab("source");
  toast(state.language === "zh" ? "候选源码已采纳，请继续审查和编译" : "Candidate applied. Review and compile it next.", "good");
}

async function analyzeSource() {
  try {
    const { analysis } = await api("/api/contracts/analyze", { method: "POST", body: JSON.stringify({ source: $("#source-editor").value }) });
    renderFindings(analysis);
    selectTab("compile");
    toast(analysis.findingCount ? `${analysis.findingCount} findings` : (state.language === "zh" ? "未发现已知静态模式问题" : "No known static pattern findings"), analysis.findingCount ? "warn" : "good");
  } catch (error) { toast(error.message, "bad"); }
}

function renderFindings(analysis) {
  const el = $("#findings");
  if (!analysis) return;
  el.innerHTML = analysis.findingCount
    ? `<h4>${analysis.findingCount} heuristic findings</h4>${analysis.findings.map((finding) => `<div class="finding"><b>${esc(finding.code)}</b><span>line ${finding.line}</span><p>${esc(finding.message)}</p></div>`).join("")}`
    : `<div class="clean-result"><i>✓</i><div><strong>${state.language === "zh" ? "启发式检查未发现问题" : "No heuristic findings"}</strong><p>${state.language === "zh" ? "这不是安全证明，仍需完整编译和对抗性交易测试。" : "This is not a security proof. Full compilation and adversarial transaction tests are still required."}</p></div></div>`;
}

async function compileCurrent() {
  const button = $("#compile-contract");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = state.language === "zh" ? "正在运行 silverc…" : "Running silverc…";
  $("#compile-status").textContent = "BUILDING";
  try {
    const constructorArgs = JSON.parse($("#constructor-args").value || "[]");
    const { artifact } = await api("/api/contracts/compile", { method: "POST", body: JSON.stringify({
      source: $("#source-editor").value,
      constructorArgs,
      compilerProfileId: $("#compiler-profile").value,
      templateId: state.project?.review?.templateId || "",
      projectId: state.project?.id || ""
    }) });
    state.project.artifact = artifact;
    state.project.constructorArgs = constructorArgs;
    renderArtifact(artifact);
    await saveProject();
    markStep("artifact", true);
    const blocked = artifact.deploymentBlockedReasons?.length;
    toast(blocked ? (state.language === "zh" ? "编译通过；上链前必须替换模板示例参数" : "Build passed; replace template example arguments before deployment") : (state.language === "zh" ? "完整编译通过，凭证已保存" : "Full compilation passed and evidence was saved"), blocked ? "warn" : "good");
  } catch (error) {
    $("#compile-status").textContent = "FAILED";
    toast(error.message, "bad");
  } finally { button.disabled = false; button.innerHTML = original; }
}

function renderArtifact(artifact) {
  const blocked = artifact?.deploymentBlockedReasons?.length;
  $("#compile-status").textContent = artifact ? (blocked ? "BUILD · CONFIGURE" : "VERIFIED BUILD") : "NOT BUILT";
  $("#artifact-grid").innerHTML = [
    ["Source SHA-256", artifact?.sourceSha256], ["Program SHA-256", artifact?.programSha256],
    ["Compiler Profile", artifact?.compiler?.id], ["Compiler SHA-256", artifact?.compiler?.sha256], ["Upstream Commit", artifact?.compiler?.upstreamCommit || state.config?.compiler?.upstreamCommit || "—"]
  ].map(([label, value]) => `<div><span>${label}</span><code title="${esc(value || "")}">${esc(value ? short(value, 12, 10) : "—")}</code></div>`).join("");
  if (artifact?.analysis) {
    renderFindings(artifact.analysis);
    if (blocked) $("#findings").insertAdjacentHTML("afterbegin", `<div class="finding"><b>DEPLOYMENT BLOCKED</b><span>template safety</span><p>${esc(state.language === "zh" ? "必须替换所有模板示例公钥、哈希和超时参数后才能上链。" : "Replace all template example keys, hashes and timeout values before deployment.")}</p></div>`);
  }
  markStep("artifact", Boolean(artifact));
}

function renderCompilerProfiles() {
  const profiles = state.config?.compiler?.profiles || [];
  const select = $("#compiler-profile");
  select.innerHTML = profiles.map((profile) => `<option value="${esc(profile.id)}" ${profile.id === state.config.compiler.defaultProfileId ? "selected" : ""}>${esc(profile.label)} · ${profile.configured ? "PINNED" : "NOT INSTALLED"}</option>`).join("");
  renderCompilerProfileHelp();
}

function renderCompilerProfileHelp() {
  const profile = (state.config?.compiler?.profiles || []).find((item) => item.id === $("#compiler-profile")?.value);
  if (!profile) return;
  const policy = profile.networkPolicy === "tn10-only" ? "TN10 ONLY" : profile.networkPolicy;
  $("#compiler-profile-help").textContent = `${profile.status.toUpperCase()} · ${policy} · ${profile.upstreamCommit}`;
}

function renderCompatibility(report) {
  const element = $("#compatibility-findings");
  if (!report) { element.innerHTML = ""; return; }
  if (!report.findings.length) {
    element.innerHTML = `<div class="clean-result"><i>✓</i><div><strong>${state.language === "zh" ? "未检测到已知破坏性模式" : "No known breaking pattern detected"}</strong><p>${state.language === "zh" ? "仍必须执行真实编译和对抗测试。" : "A real build and adversarial tests are still required."}</p></div></div>`;
    return;
  }
  element.innerHTML = report.findings.map((finding) => `<div class="finding"><b>${esc(finding.severity.toUpperCase())}</b><span>${esc(finding.introducedBy || "profile")} ${finding.line ? `· line ${finding.line}` : ""}</span><p>${esc(state.language === "zh" ? finding.messageZh : finding.messageEn)}</p></div>`).join("");
}

async function checkCompilerCompatibility(includeMigration = false) {
  const payload = await api("/api/contracts/compatibility", { method: "POST", body: JSON.stringify({
    source: $("#source-editor").value,
    targetProfileId: $("#compiler-profile").value,
    includeMigration
  }) });
  renderCompatibility(payload.report);
  state.pendingSourceMigration = payload.migration || null;
  $("#migrate-source").hidden = !payload.migration?.applied?.length;
  return payload;
}

function applySafeSourceMigration() {
  const migration = state.pendingSourceMigration;
  if (!migration?.applied?.length) return;
  $("#source-editor").value = migration.source;
  state.pendingSourceMigration = null;
  $("#migrate-source").hidden = true;
  sourceStats();
  if (state.project) state.project.artifact = null;
  renderArtifact(null);
  scheduleSave();
  renderCompatibility(migration.report);
  toast(state.language === "zh" ? "已应用无歧义语法迁移，请重新编译并人工审查" : "Applied unambiguous syntax migration; rebuild and review it", "warn");
}

function updateNetworkControls() {
  const mainnet = $("#deploy-network").value === "mainnet";
  $("#mainnet-confirmation").hidden = !mainnet;
  $("#deploy-symbol").textContent = mainnet ? "KAS" : "TKAS";
}

async function refreshNode() {
  $("#node-label").textContent = "CONNECTING…";
  $("#node-dot").className = "status-dot busy";
  try {
    const status = await api(`/api/node/status?network=${encodeURIComponent($("#deploy-network").value)}`);
    const access = status.discoveredBy === "custom-rpc" ? "DIRECT" : "DISCOVERED";
    $("#node-label").textContent = `${status.network === "mainnet" ? "MAINNET" : "TN10"} · ${status.synced ? "SYNCED" : "CONNECTED"} · ${access} · ${status.latencyMs}MS`;
    $("#node-dot").className = "status-dot online";
  } catch (error) {
    $("#node-label").textContent = `${$("#deploy-network").value === "mainnet" ? "MAINNET" : "TN10"} · OFFLINE`;
    $("#node-dot").className = "status-dot";
    toast(error.message, "bad");
  }
}

function clearWalletSecrets() {
  ["wallet-password", "wallet-payment-secret", "wallet-create-password", "wallet-confirm-password", "wallet-create-payment-secret", "wallet-mnemonic", "wallet-transfer-password", "wallet-transfer-payment-secret"].forEach((id) => {
    const input = $(`#${id}`);
    if (input) input.value = "";
  });
}

function selectWalletMode(mode) {
  state.walletMode = mode === "import" ? "import" : "create";
  $$('[data-wallet-mode]').forEach((button) => button.classList.toggle("active", button.dataset.walletMode === state.walletMode));
  $("#wallet-import-row").hidden = state.walletMode !== "import";
  $("#wallet-create").textContent = state.walletMode === "import" ? tr("importWallet") : tr("createWallet");
}

function selectWalletAction(action) {
  $$('[data-wallet-action]').forEach((button) => button.classList.toggle("active", button.dataset.walletAction === action));
  $$('[data-wallet-action-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.walletActionPanel === action));
}

function renderWalletManager() {
  const connected = Boolean(state.wallet);
  $("#wallet-disconnected-view").hidden = connected;
  $("#wallet-connected-view").hidden = !connected;
  if (!connected) { selectWalletMode(state.walletMode); return; }
  const network = state.wallet.network || $("#deploy-network").value;
  const symbol = network === "mainnet" ? "KAS" : "TKAS";
  $("#wallet-account-network").textContent = `${network === "mainnet" ? "MAINNET" : "TN10"} · ${state.wallet.provider}`;
  $("#wallet-account-address").textContent = state.wallet.address;
  $("#wallet-receive-address").textContent = state.wallet.address;
  $("#wallet-send-symbol").textContent = symbol;
  $("#wallet-send-mainnet-row").hidden = network !== "mainnet";
  if (state.wallet.balance) {
    $("#wallet-balance").textContent = `${state.wallet.balance.balanceKas} ${state.wallet.balance.symbol}`;
    $("#wallet-balance-state").textContent = state.language === "zh" ? `更新于 ${new Date(state.wallet.balance.checkedAt).toLocaleTimeString()}` : `Updated ${new Date(state.wallet.balance.checkedAt).toLocaleTimeString()}`;
  } else {
    $("#wallet-balance").textContent = `— ${symbol}`;
    $("#wallet-balance-state").textContent = tr("checkingBalance");
  }
}

async function loadWallets() {
  const payload = await api("/api/wallets");
  state.wallets = payload.wallets || [];
  $("#wallet-select").innerHTML = state.wallets.length
    ? state.wallets.map((wallet) => `<option value="${esc(wallet.id)}">${esc(wallet.title)} · ${esc(short(wallet.publicKey, 8, 6))}</option>`).join("")
    : `<option value="">${state.language === "zh" ? "暂无本地钱包" : "No local wallets"}</option>`;
  const preferred = state.settings?.settings?.defaultWalletId;
  if (preferred && state.wallets.some((wallet) => wallet.id === preferred)) $("#wallet-select").value = preferred;
  if (state.settings) renderSettings();
}

async function openWalletManager() {
  await loadWallets();
  clearWalletSecrets();
  resetTransferDraft();
  renderWalletManager();
  $("#wallet-dialog").showModal();
  if (state.wallet) refreshWalletBalance(true);
}

async function requireConnectedWallet() {
  if (state.wallet?.kind === "local") return true;
  toast(tr("walletRequired"), "warn");
  await openWalletManager();
  return false;
}

function showRecoveryPhrase(phrase, paymentSecretProtected = false) {
  $("#recovery-phrase").textContent = phrase;
  $("#recovery-passphrase-warning").hidden = !paymentSecretProtected;
  $("#recovery-confirm").checked = false;
  $("#recovery-done").disabled = true;
  $("#recovery-dialog").showModal();
}

async function createLocalWallet() {
  const password = $("#wallet-create-password").value;
  const confirmation = $("#wallet-confirm-password").value;
  const mnemonic = $("#wallet-mnemonic").value.trim();
  if (password.length < 10) return toast(state.language === "zh" ? "钱包密码至少需要 10 位" : "Wallet password must contain at least 10 characters", "warn");
  if (password !== confirmation) return toast(state.language === "zh" ? "两次输入的钱包密码不一致" : "Wallet passwords do not match", "warn");
  if (state.walletMode === "import" && !mnemonic) return toast(state.language === "zh" ? "请输入要导入的 BIP39 助记词" : "Enter the BIP39 mnemonic to import", "warn");
  const button = $("#wallet-create");
  button.disabled = true;
  try {
    const result = await api("/api/wallets", { method: "POST", body: JSON.stringify({
      title: $("#wallet-title").value,
      walletSecret: password,
      paymentSecret: $("#wallet-create-payment-secret").value,
      mnemonic: state.walletMode === "import" ? mnemonic : ""
    }) });
    clearWalletSecrets();
    await loadWallets();
    $("#wallet-select").value = result.wallet.id;
    if (result.recoveryPhrase) {
      state.pendingCreatedWalletId = result.wallet.id;
      showRecoveryPhrase(result.recoveryPhrase, result.wallet.paymentSecretProtected);
    }
    else toast(state.language === "zh" ? "钱包已加密导入，请在上方输入密码连接" : "Wallet imported. Enter its password above to connect", "good");
  } catch (error) { toast(error.message, "bad"); }
  finally { button.disabled = false; }
}

async function unlockLocalWallet() {
  const walletId = $("#wallet-select").value;
  if (!walletId) return toast(state.language === "zh" ? "请先创建或导入钱包" : "Create or import a wallet first", "warn");
  if ($("#wallet-password").value.length < 10) return toast(state.language === "zh" ? "钱包密码至少需要 10 位" : "Wallet password must contain at least 10 characters", "warn");
  try {
    const { wallet } = await api(`/api/wallets/${encodeURIComponent(walletId)}/unlock`, { method: "POST", body: JSON.stringify({
      walletSecret: $("#wallet-password").value,
      paymentSecret: $("#wallet-payment-secret").value,
      network: $("#deploy-network").value
    }) });
    state.wallet = { ...wallet, walletId: wallet.id, kind: "local" };
    clearWalletSecrets();
    renderWallet();
    await refreshWalletBalance();
  } catch (error) { toast(error.message, "bad"); }
}

function disconnectWallet() {
  clearTimeout(state.balanceTimer);
  state.balanceTimer = null;
  state.wallet = null;
  state.transferDraft = null;
  clearWalletSecrets();
  renderWallet();
}

async function refreshWalletBalance(silent = false) {
  if (!state.wallet) return;
  clearTimeout(state.balanceTimer);
  try {
    const payload = await api(`/api/wallets/balance?network=${encodeURIComponent(state.wallet.network)}&address=${encodeURIComponent(state.wallet.address)}`);
    if (!state.wallet || payload.balance.address !== state.wallet.address) return;
    state.wallet.balance = payload.balance;
    renderWallet();
  } catch (error) {
    if (!silent) toast(error.message, "bad");
    if (state.wallet) $("#wallet-balance-state").textContent = state.language === "zh" ? "余额查询失败，点击刷新重试" : "Balance unavailable; refresh to retry";
  } finally {
    if (state.wallet) state.balanceTimer = setTimeout(() => refreshWalletBalance(true), 30_000);
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value));
  } catch {
    const input = document.createElement("textarea");
    input.value = String(value); input.style.position = "fixed"; input.style.opacity = "0";
    document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
  }
  toast(state.language === "zh" ? "地址已复制" : "Address copied", "good");
}

function resetTransferDraft() {
  state.transferDraft = null;
  $("#wallet-transfer-preview").hidden = true;
  $("#wallet-transfer-result").hidden = true;
  $("#wallet-transfer-password").value = "";
  $("#wallet-transfer-payment-secret").value = "";
}

async function buildWalletTransfer() {
  if (!state.wallet) return;
  const button = $("#wallet-build-transfer");
  button.disabled = true;
  try {
    const { draft } = await api("/api/wallets/transfer/draft", { method: "POST", body: JSON.stringify({
      network: state.wallet.network,
      address: state.wallet.address,
      recipient: $("#wallet-send-recipient").value,
      amountKas: $("#wallet-send-amount").value,
      mainnetConfirmation: $("#wallet-send-mainnet-phrase").value
    }) });
    state.transferDraft = draft;
    $("#wallet-transfer-summary").className = "transfer-summary";
    $("#wallet-transfer-summary").innerHTML = `
      <div><span>${state.language === "zh" ? "收款地址" : "Recipient"}</span><code>${esc(draft.recipient)}</code></div>
      <div><span>${state.language === "zh" ? "发送金额" : "Amount"}</span><strong>${esc(draft.amountKas)} ${esc(draft.symbol)}</strong></div>
      <div><span>${state.language === "zh" ? "网络手续费" : "Network fee"}</span><strong>${esc(draft.feeKas)} ${esc(draft.symbol)}</strong></div>
      <div><span>${state.language === "zh" ? "交易承诺" : "Commitment"}</span><code>${esc(short(draft.commitment, 14, 12))}</code></div>`;
    $("#wallet-transfer-password-row").hidden = false;
    $("#wallet-transfer-payment-row").hidden = false;
    $("#wallet-transfer-preview").hidden = false;
    $("#wallet-transfer-result").hidden = true;
  } catch (error) { toast(error.message, "bad"); }
  finally { button.disabled = false; }
}

async function confirmWalletTransfer() {
  const draft = state.transferDraft;
  if (!draft || !state.wallet) return;
  const button = $("#wallet-confirm-transfer");
  button.disabled = true;
  try {
    const payload = await api("/api/wallets/transfer/send", { method: "POST", body: JSON.stringify({
      draftId: draft.id,
      walletId: state.wallet.walletId,
      walletSecret: $("#wallet-transfer-password").value,
      paymentSecret: $("#wallet-transfer-payment-secret").value
    }) });
    const result = payload.result;
    clearWalletSecrets();
    state.transferDraft = null;
    $("#wallet-transfer-preview").hidden = true;
    $("#wallet-transfer-result").hidden = false;
    $("#wallet-transfer-result").innerHTML = `<strong>${state.language === "zh" ? "交易已广播" : "Transaction broadcast"}</strong><span>${esc(result.amountKas)} ${state.wallet.network === "mainnet" ? "KAS" : "TKAS"} → ${esc(short(result.recipient, 15, 12))}</span><br><a href="${esc(result.kascovTransactionUrl)}" target="_blank" rel="noopener">Kascov transaction ↗</a>`;
    $("#wallet-send-recipient").value = "";
    $("#wallet-send-amount").value = "";
    $("#wallet-send-mainnet-phrase").value = "";
    await refreshWalletBalance(true);
  } catch (error) { toast(error.message, "bad"); }
  finally { button.disabled = false; }
}

function requestSigningSecret() {
  return new Promise((resolve, reject) => {
    const dialog = $("#secret-dialog");
    $("#secret-wallet-label").textContent = `${state.wallet.title || "Studio Wallet"} · ${short(state.wallet.address, 14, 10)}`;
    $("#sign-wallet-password").value = "";
    $("#sign-payment-secret").value = "";
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      const confirmed = dialog.returnValue === "confirm";
      const values = { walletSecret: $("#sign-wallet-password").value, paymentSecret: $("#sign-payment-secret").value };
      $("#sign-wallet-password").value = "";
      $("#sign-payment-secret").value = "";
      if (confirmed) resolve(values); else reject(new Error(state.language === "zh" ? "已取消签名" : "Signature cancelled"));
    };
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    setTimeout(() => $("#sign-wallet-password").focus(), 0);
  });
}

function renderWallet() {
  const button = $("#wallet-button");
  const card = $("#wallet-card");
  if (!state.wallet) {
    button.textContent = tr("connectWallet");
    card.innerHTML = `<span class="wallet-icon">◇</span><div><strong>${tr("walletNotConnected")}</strong><small>${tr("walletHelp")}</small></div>`;
    renderWalletManager();
    renderExternalCovenantReview(state.externalReview);
    return;
  }
  button.textContent = short(state.wallet.address, 8, 5);
  const balance = state.wallet.balance ? `${state.wallet.balance.balanceKas} ${state.wallet.balance.symbol}` : state.wallet.provider;
  card.innerHTML = `<span class="wallet-icon connected">◆</span><div><strong>${esc(short(state.wallet.address, 14, 10))}</strong><small>${esc(balance)} · ${esc(state.wallet.provider)}</small></div>`;
  renderWalletManager();
  renderExternalCovenantReview(state.externalReview);
  renderLifecycleDestinationDefault();
}

function markStep(name, done, label = "") {
  const item = $(`[data-step="${name}"]`);
  if (!item) return;
  item.classList.toggle("done", done);
  item.querySelector(":scope > b").textContent = label || (done ? "✓" : "—");
}

function preflightBadge(preflight) {
  if (!preflight) return "—";
  return preflight.provider === "kascov" ? "PASS · LOCAL + KASCOV" : "PASS · LOCAL";
}

async function buildAndBroadcast() {
  if (!state.project?.artifact) return toast(state.language === "zh" ? "请先完成固定编译" : "Complete the pinned build first", "warn");
  if (!(await requireConnectedWallet())) return;
  const button = $("#build-draft");
  button.disabled = true;
  try {
    const constructorArgs = JSON.parse($("#constructor-args").value || "[]");
    button.textContent = state.language === "zh" ? "正在构建并预检…" : "Building and preflighting…";
    $("#deploy-status").textContent = "BUILDING";
    const { draft } = await api("/api/deploy/draft", { method: "POST", body: JSON.stringify({
      projectId: state.project.id,
      network: $("#deploy-network").value,
      amountKas: $("#deploy-amount").value,
      address: state.wallet.address,
      publicKey: state.wallet.publicKey,
      artifact: state.project.artifact,
      source: $("#source-editor").value,
      constructorArgs,
      mainnetConfirmation: $("#mainnet-phrase").value
    }) });
    state.draft = draft;
    markStep("draft", true, preflightBadge(draft.preflight));
    $("#deploy-status").textContent = "AWAITING SIGNATURE";
    button.textContent = state.language === "zh" ? "等待本地钱包授权…" : "Awaiting local wallet authorization…";
    const secrets = await requestSigningSecret();
    const signed = await api("/api/deploy/sign", { method: "POST", body: JSON.stringify({ draftId: draft.id, walletId: state.wallet.walletId, ...secrets }) });
    const signedTransactionSafeJson = signed.signedTransactionSafeJson;
    if (!signedTransactionSafeJson) throw new Error("Wallet returned no signed transaction");
    markStep("sign", true);
    $("#deploy-status").textContent = "ENGINE PREFLIGHT";
    button.textContent = state.language === "zh" ? "脚本引擎预检与广播…" : "Engine preflight and broadcast…";
    const { result } = await api("/api/deploy/broadcast", { method: "POST", body: JSON.stringify({ draftId: draft.id, signedTransactionSafeJson }) });
    markStep("engine", true, "PASS");
    markStep("broadcast", true, "TX");
    $("#deploy-status").textContent = "BROADCAST";
    state.project.deployment = result;
    renderDeployment(result);
    await saveProject();
    loadLifecycleOperations(state.project);
    loadLifecycleStatus(state.project);
    pollEvidence(result);
  } catch (error) {
    $("#deploy-status").textContent = "FAILED";
    toast(error.message, "bad");
  } finally { button.disabled = false; button.textContent = tr("buildDraft"); }
}

function renderDeployment(result) {
  const el = $("#deployment-result");
  renderMultisigDeploymentGuide();
  if (!result?.txid) { el.hidden = true; return; }
  el.hidden = false;
  const engine = preflightBadge(result.preflight);
  el.innerHTML = `<span class="eyebrow">TRANSACTION · ${esc(engine)}</span><strong>${esc(short(result.txid, 14, 12))}</strong><p id="index-state">${state.language === "zh" ? "Kaspa 节点已接受广播；正在查询可选的 Kascov 可视化索引…" : "Accepted by the Kaspa node; checking optional Kascov visual indexing…"}</p><div><a href="${esc(result.kascovTransactionUrl)}" target="_blank" rel="noopener">Kascov transaction ↗</a><a href="${esc(result.kascovCovenantUrl)}" target="_blank" rel="noopener">Covenant page ↗</a></div>`;
  ["artifact", "draft", "sign", "engine", "broadcast"].forEach((step) => markStep(step, true));
  $("#deploy-status").textContent = "BROADCAST";
}

function renderMultisigDeploymentGuide() {
  const guide = $("#multisig-deploy-guide");
  const isMultisig = state.project?.review?.templateId === "two-of-three";
  guide.hidden = !isMultisig;
  if (!isMultisig) return;
  $("#multisig-deploy-guide-text").textContent = tr(state.project?.deployment?.txid ? "multisigAfterDeploy" : "multisigBeforeDeploy");
}

async function pollEvidence(result, attempts = 0) {
  if (!result?.txid || attempts > 20) return;
  try {
    const status = await api(`/api/transactions/${result.network}/${result.txid}`);
    if (status.indexed) {
      const el = $("#index-state");
      if (el) el.textContent = state.language === "zh" ? "Kascov 已索引链上 Covenant 证据" : "Kascov indexed the on-chain covenant evidence";
      $("#deploy-status").textContent = "INDEXED";
      return;
    }
    if (status.kascovAvailable === false) {
      const el = $("#index-state");
      if (el) el.textContent = state.language === "zh"
        ? "交易已由 Kaspa 节点广播；Kascov 当前不可用，不影响链上结果"
        : "Broadcast through the Kaspa node; Kascov is unavailable and does not affect the on-chain result";
      return;
    }
  } catch {}
  setTimeout(() => pollEvidence(result, attempts + 1), 5000);
}

function selectedLifecycleOperation() {
  return state.lifecycleOperations.find((operation) => operation.id === $("#lifecycle-operation").value) || null;
}

function renderLifecycleDestinationDefault() {
  const input = $("#lifecycle-destination");
  if (!input || input.value.trim() || !selectedLifecycleOperation()?.destination) return;
  if (state.wallet?.network === state.project?.network && state.wallet.address) input.value = state.wallet.address;
}

function renderLifecycleOperations() {
  const card = $("#lifecycle-card");
  if (!card || !state.project?.deployment?.txid || !state.lifecycleOperations.length) {
    if (card) card.hidden = true;
    renderLifecycleInvitationActions();
    return;
  }
  const select = $("#lifecycle-operation");
  const previous = select.value;
  const availableOperations = availableLifecycleOperations(state.lifecycleOperations, state.lifecycleSummary);
  if (!availableOperations.length) {
    card.hidden = true;
    select.innerHTML = "";
    renderLifecycleInvitationActions();
    return;
  }
  card.hidden = false;
  select.innerHTML = availableOperations.map((operation) => `<option value="${esc(operation.id)}">${esc(state.language === "zh" ? operation.titleZh : operation.titleEn)}</option>`).join("");
  if (availableOperations.some((operation) => operation.id === previous)) select.value = previous;
  const operation = selectedLifecycleOperation();
  $("#lifecycle-destination-row").hidden = !operation?.destination;
  renderLifecycleDestinationDefault();
  $("#lifecycle-secret-row").hidden = !operation?.secret;
  $("#lifecycle-proof-row").hidden = !operation?.proof;
  $("#lifecycle-payload-row").hidden = !operation?.payload;
  $("#lifecycle-salt-row").hidden = !operation?.salt;
  $("#lifecycle-signers-row").hidden = !operation?.signers;
  $("#lifecycle-signer-options").innerHTML = operation?.signers
    ? (operation.availableSigners || []).map((address, index) => `<label class="signer-option"><input type="checkbox" data-lifecycle-signer value="${esc(address)}" ${index < 2 ? "checked" : ""} /><span>${state.language === "zh" ? `签名钱包 ${index + 1}` : `Signer wallet ${index + 1}`}<code title="${esc(address)}">${esc(short(address, 18, 12))}</code></span></label>`).join("")
    : "";
  $$("[data-lifecycle-signer]").forEach((input) => input.addEventListener("change", () => {
    if ($$("[data-lifecycle-signer]:checked").length <= 2) return;
    input.checked = false;
    toast(state.language === "zh" ? "三选二多签每次请选择两位签名人" : "Select exactly two signers for a two-of-three spend", "warn");
  }));
  $("#lifecycle-fee-symbol").textContent = state.project.network === "mainnet" ? "KAS" : "TKAS";
  renderLifecycleInvitationActions();
}

function renderLifecycleInvitationActions() {
  const ready = Boolean(
    state.project
    && state.lifecycleInviteProjectId === state.project.id
    && selectedLifecycleOperation()?.signers
    && (state.externalReview?.signatureSlots || []).length >= 2
    && state.externalPackage
  );
  $("#lifecycle-download-invitation").hidden = !ready;
  $("#lifecycle-copy-invitation").hidden = !ready;
}

async function loadLifecycleOperations(project = state.project) {
  state.lifecycleOperations = [];
  if (!project?.deployment?.txid) return renderLifecycleOperations();
  try {
    const payload = await api(`/api/projects/${encodeURIComponent(project.id)}/operations`);
    if (state.project?.id !== project.id) return;
    state.lifecycleOperations = payload.operations || [];
  } catch {}
  renderLifecycleOperations();
}

function durationLabel(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "—";
  const value = Number(seconds);
  if (value >= 86400 && value % 86400 === 0) return `${value / 86400}${state.language === "zh" ? " 天" : " days"}`;
  if (value >= 3600 && value % 3600 === 0) return `${value / 3600}${state.language === "zh" ? " 小时" : " hours"}`;
  if (value >= 60 && value % 60 === 0) return `${value / 60}${state.language === "zh" ? " 分钟" : " minutes"}`;
  return `${value}${state.language === "zh" ? " 秒" : " seconds"}`;
}

function renderLifecycleSummary() {
  const card = $("#lifecycle-overview-card");
  const summary = state.lifecycleSummary;
  card.hidden = !summary?.deployed;
  const renewButton = $("#lifecycle-renew-now");
  renewButton.hidden = !lifecycleRenewalAvailable(summary, state.project?.review?.templateId);
  renewButton.disabled = false;
  renewButton.textContent = tr("renewNow");
  const inheritButton = $("#lifecycle-inherit-now");
  const inheritanceAvailable = lifecycleInheritanceDistributionAvailable(summary, state.project?.review?.templateId);
  inheritButton.hidden = !inheritanceAvailable;
  inheritButton.disabled = false;
  inheritButton.textContent = tr("inheritNow");
  $("#lifecycle-inheritance-help").hidden = !inheritanceAvailable;
  if (card.hidden) return;
  const schedule = summary.schedule;
  const statusText = summary.unspent
    ? (schedule?.mature ? (state.language === "zh" ? "已成熟" : "MATURE") : (state.language === "zh" ? "活动中" : "ACTIVE"))
    : (state.language === "zh" ? "已花费" : "SPENT");
  $("#lifecycle-overview-status").textContent = statusText;
  const items = [
    [state.language === "zh" ? "当前 Covenant UTXO" : "Current covenant UTXO", summary.activeOutpoint?.transactionId ? `${short(summary.activeOutpoint.transactionId, 12, 10)}:${summary.activeOutpoint.index}` : "—"],
    ["Covenant ID", short(summary.covenantId, 12, 10)],
    [state.language === "zh" ? "锁定余额" : "Locked balance", summary.valueKas ? `${summary.valueKas} ${summary.network === "mainnet" ? "KAS" : "TKAS"}` : "—"],
    [state.language === "zh" ? "当前 DAA" : "Virtual DAA", summary.virtualDaaScore || "—"]
  ];
  if (schedule) {
    items.push(
      [state.language === "zh" ? "到期目标 DAA" : "Maturity target DAA", schedule.targetDaaScore],
      [state.language === "zh" ? "剩余 DAA" : "Remaining DAA", schedule.remainingDaa],
      [state.language === "zh" ? "配置等待时间" : "Configured wait", durationLabel(schedule.configuredSeconds)],
      [state.language === "zh" ? "链上实际等待（约）" : "Actual on-chain wait (approx.)", durationLabel(schedule.approximateActualSeconds)]
    );
  }
  $("#lifecycle-overview-grid").innerHTML = items.map(([label, value]) => `<div><span>${esc(label)}</span><code title="${esc(value)}">${esc(value)}</code></div>`).join("");
  const warning = $("#lifecycle-overview-warning");
  warning.hidden = !schedule?.mismatch;
  if (schedule?.mismatch) {
    warning.textContent = state.language === "zh"
      ? `注意：这是旧版参数编码的已部署合约。界面配置为 ${durationLabel(schedule.configuredSeconds)}，但链上 ${schedule.periodDaa} DAA 按约 ${schedule.daaPerSecond} DAA/秒计算，实际约为 ${durationLabel(schedule.approximateActualSeconds)}。${schedule.mature ? "合约已经成熟，续期入口已关闭，可以触发继承分配。" : "已部署脚本不可修改。"}`
      : `Warning: this deployed contract uses legacy parameter encoding. The UI was configured for ${durationLabel(schedule.configuredSeconds)}, but ${schedule.periodDaa} on-chain DAA at roughly ${schedule.daaPerSecond} DAA/s is about ${durationLabel(schedule.approximateActualSeconds)}. ${schedule.mature ? "The contract has matured; renewal is closed and inheritance distribution is now available." : "The deployed script is immutable."}`;
  }
}

async function loadLifecycleStatus(project = state.project) {
  state.lifecycleSummary = null;
  renderLifecycleSummary();
  if (!project?.deployment?.txid) return;
  $("#lifecycle-overview-card").hidden = false;
  $("#lifecycle-overview-status").textContent = "LOADING";
  try {
    const payload = await api(`/api/projects/${encodeURIComponent(project.id)}/lifecycle-status`);
    if (state.project?.id !== project.id) return;
    state.lifecycleSummary = payload.status;
  } catch (error) {
    if (state.project?.id !== project.id) return;
    $("#lifecycle-overview-status").textContent = "ERROR";
    return toast(error.message, "bad");
  }
  renderLifecycleSummary();
  renderLifecycleOperations();
}

async function buildLifecycleOperation() {
  const operation = selectedLifecycleOperation();
  if (!state.project || !operation) return;
  const destinationAddress = $("#lifecycle-destination").value.trim();
  if (operation.destination && !destinationAddress) return toast(tr("lifecycleDestinationRequired"), "warn");
  if (operation.destination && !destinationAddress.toLowerCase().startsWith(`${state.project.network === "mainnet" ? "kaspa" : "kaspatest"}:`)) {
    return toast(tr("lifecycleDestinationWrongNetwork"), "warn");
  }
  const button = $("#lifecycle-build");
  button.disabled = true;
  $("#lifecycle-status").textContent = "BUILDING";
  try {
    const signerAddresses = $$("[data-lifecycle-signer]:checked").map((input) => input.value);
    const payload = await api(`/api/projects/${encodeURIComponent(state.project.id)}/operations/build`, { method: "POST", body: JSON.stringify({
      operationId: operation.id,
      feeKas: $("#lifecycle-fee").value,
      destinationAddress,
      secretHex: $("#lifecycle-secret").value,
      proofHex: $("#lifecycle-proof").value,
      payloadHex: $("#lifecycle-payload").value,
      saltHex: $("#lifecycle-salt").value,
      signerAddresses
    }) });
    state.externalPackage = payload.package;
    state.externalReview = payload.review;
    state.localOperationProjectId = state.project.id;
    state.lifecycleInviteProjectId = operation.signers ? state.project.id : "";
    $("#external-covenant-package").value = JSON.stringify(payload.package, null, 2);
    $("#external-signed-package").value = JSON.stringify(payload.package, null, 2);
    $("#external-signed-row").hidden = false;
    $("#external-copy-signed").hidden = false;
    renderExternalCovenantReview(payload.review);
    renderLifecycleInvitationActions();
    $("#external-covenant-status").textContent = payload.review.complete ? "READY TO PREFLIGHT" : "AWAITING SIGNATURE";
    $("#lifecycle-status").textContent = "PACKAGE READY";
    if (operation.signers) {
      toast(state.language === "zh" ? "签名邀请已生成，请点击旁边的“下载邀请文件”" : "Signing invitation created; click Download invitation beside the build button", "good");
      $("#lifecycle-download-invitation").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      $("#external-covenant-package").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return payload;
  } catch (error) {
    $("#lifecycle-status").textContent = "FAILED";
    const message = error.payload?.code === "OPERATION_ADDRESS_REQUIRED"
      ? tr("lifecycleDestinationRequired")
      : error.payload?.code === "OPERATION_ADDRESS_WRONG_NETWORK"
        ? tr("lifecycleDestinationWrongNetwork")
        : error.payload?.code === "OPERATION_ADDRESS_INVALID"
          ? tr("lifecycleDestinationInvalid")
          : error.message;
    toast(message, "bad");
    return null;
  } finally { button.disabled = false; }
}

function isLocalRenewal() {
  return Boolean(
    state.project
    && state.localOperationProjectId === state.project.id
    && state.externalReview?.operation?.kind === "renewal"
    && state.externalReview?.operation?.continuation
    && state.externalReview?.entrypoint === "checkIn"
  );
}

async function renewCurrentContract() {
  if (!state.project || state.project.review?.templateId !== "inheritance-vault") return;
  if (!(await requireConnectedWallet())) return;
  const button = $("#lifecycle-renew-now");
  button.disabled = true;
  button.textContent = state.language === "zh" ? "正在准备续期…" : "Preparing renewal…";
  try {
    const operationSelect = $("#lifecycle-operation");
    if (![...operationSelect.options].some((option) => option.value === "checkIn")) throw new Error(state.language === "zh" ? "当前项目没有签到续期入口" : "This project has no check-in renewal operation");
    operationSelect.value = "checkIn";
    $("#lifecycle-fee").value = "0.01";
    renderLifecycleOperations();
    await buildLifecycleOperation();
    if (!isLocalRenewal()) throw new Error(state.language === "zh" ? "续期操作包未通过本地项目识别" : "The renewal package was not recognized as a local project operation");
    const signed = await signExternalCovenant({ localRenewal: true });
    if (!signed || !state.externalReview?.complete) return;
    await broadcastExternalCovenant({ localRenewal: true });
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    button.disabled = false;
    button.textContent = tr("renewNow");
  }
}

async function prepareMatureInheritance() {
  if (!lifecycleInheritanceDistributionAvailable(state.lifecycleSummary, state.project?.review?.templateId)) return;
  const button = $("#lifecycle-inherit-now");
  button.disabled = true;
  button.textContent = state.language === "zh" ? "正在准备分配…" : "Preparing distribution…";
  try {
    const operationSelect = $("#lifecycle-operation");
    if (![...operationSelect.options].some((option) => option.value === "inherit")) {
      throw new Error(state.language === "zh" ? "当前成熟合约没有继承分配入口" : "This mature covenant has no inheritance distribution operation");
    }
    operationSelect.value = "inherit";
    renderLifecycleOperations();
    const payload = await buildLifecycleOperation();
    if (!payload?.review?.complete || payload.review.entrypoint !== "inherit") {
      throw new Error(state.language === "zh" ? "继承分配交易没有通过本地操作识别" : "The inheritance transaction was not recognized as a complete local distribution");
    }
    $("#external-broadcast-confirmation").value = "";
    $("#external-covenant-review").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#external-broadcast-confirmation").focus({ preventScroll: true });
    toast(
      state.language === "zh"
        ? "分配交易已生成。请核对每位继承人的地址和金额，再输入广播确认短语。"
        : "Distribution prepared. Verify every inheritor address and amount, then enter the broadcast confirmation phrase.",
      "good"
    );
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    button.disabled = false;
    button.textContent = tr("inheritNow");
  }
}

function renderExternalCovenantReview(review) {
  const el = $("#external-covenant-review");
  const detection = $("#operation-detection");
  if (!review) {
    el.innerHTML = `<p class="muted">${tr("externalReviewEmpty")}</p>`;
    $("#external-covenant-sign").disabled = true;
    $("#external-covenant-broadcast").disabled = true;
    renderSigningInvitation(null);
    renderLifecycleInvitationActions();
    detection.hidden = true;
    $("#external-sign-confirmation-row").hidden = false;
    $("#external-broadcast-confirmation-row").hidden = false;
    $("#external-covenant-sign").textContent = tr("signPackage");
    $("#external-covenant-confirmation").placeholder = "SIGN REVIEWED EXTERNAL COVENANT";
    $("#external-confirmation-help").textContent = tr("externalConfirmationHelp");
    return;
  }
  const slots = review.signatureSlots || [];
  const p2pk = review.p2pkAuthorization || null;
  const outputs = (review.outputs || []).map((output) => `<li>#${output.index} · ${esc(output.valueKas)} ${review.network === "mainnet" ? "KAS" : "TKAS"} → ${esc(output.address ? short(output.address, 14, 10) : "non-address script")}${output.covenantId ? ` · cov ${esc(short(output.covenantId, 8, 7))}` : ""}</li>`).join("");
  el.innerHTML = `<div class="external-review-grid">
    <div><span>${state.language === "zh" ? "网络" : "Network"}</span><code>${esc(review.network)}</code></div>
    <div><span>${state.language === "zh" ? "入口" : "Entrypoint"}</span><code>${esc(review.entrypoint)}</code></div>
    <div><span>Covenant ID</span><code title="${esc(review.covenantId)}">${esc(short(review.covenantId, 12, 10))}</code></div>
    <div><span>Program SHA-256</span><code title="${esc(review.programSha256)}">${esc(short(review.programSha256, 12, 10))}</code></div>
    <div><span>${state.language === "zh" ? "输入／输出" : "Inputs / outputs"}</span><code>${review.inputCount} / ${review.outputCount}</code></div>
    <div><span>${state.language === "zh" ? "手续费" : "Fee"}</span><code>${esc(review.feeKas)} ${review.network === "mainnet" ? "KAS" : "TKAS"}</code></div>
    <div><span>${state.language === "zh" ? "签名槽" : "Signature slots"}</span><code>${slots.filter((slot) => slot.signed).length}/${slots.length}</code></div>
    ${p2pk ? `<div><span>P2PK co-spend</span><code>${p2pk.signed ? (state.language === "zh" ? "已签名" : "Signed") : (state.language === "zh" ? "等待拥有者" : "Awaiting owner")}</code></div>` : ""}
    <div><span>${state.language === "zh" ? "交易承诺" : "Commitment"}</span><code title="${esc(review.commitment)}">${esc(short(review.commitment, 12, 10))}</code></div>
  </div><ol class="external-outputs">${outputs}</ol><p class="external-warning">${esc(state.language === "zh" ? "ABI 是外部元数据，不能证明 redeem program 的真实语义；签名前必须从可信来源核对源码和 artifact。" : review.warning)}</p>`;
  const hasUnsignedSlot = slots.some((slot) => !slot.signed);
  const hasUnsignedP2pk = Boolean(p2pk && !p2pk.signed);
  const canSignSlot = Boolean(state.wallet?.kind === "local" && slots.some((slot) => !slot.signed && slot.publicKey === state.wallet.publicKey));
  const canSignP2pk = Boolean(state.wallet?.kind === "local" && hasUnsignedP2pk && p2pk.publicKey === state.wallet.publicKey && p2pk.address === state.wallet.address);
  const canSign = canSignSlot || canSignP2pk;
  const localRenewal = isLocalRenewal();
  $("#external-sign-confirmation-row").hidden = localRenewal;
  $("#external-broadcast-confirmation-row").hidden = localRenewal;
  const operation = review.operation || {};
  detection.hidden = false;
  $("#operation-detection-title").textContent = state.language === "zh" ? operation.titleZh : operation.titleEn;
  $("#operation-detection-description").textContent = state.language === "zh" ? operation.descriptionZh : operation.descriptionEn;
  $("#operation-detection-meta").innerHTML = [
    operation.kind || "external",
    operation.entrypoint || review.entrypoint,
    operation.continuation ? (state.language === "zh" ? "延续同一 Covenant" : "Same-covenant continuation") : (state.language === "zh" ? "终结/付款操作" : "Terminal/payment operation"),
    `${operation.signaturesSigned || 0}/${operation.signaturesRequired || 0} ${state.language === "zh" ? "签名" : "signatures"}`
  ].map((item) => `<span>${esc(item)}</span>`).join("");
  const signLabels = {
    renewal: ["签署续期", "Sign renewal"],
    multisig: ["签署我的多签槽位", "Sign my multisig slot"],
    payment: ["确认并签署付款", "Confirm & sign payment"],
    refund: ["确认并签署退款", "Confirm & sign refund"],
    "secret-claim": ["确认并签署领取", "Confirm & sign claim"],
    "owner-recovery": ["签署取回资产", "Sign asset recovery"]
  };
  const label = operation.kind === "p2pk-cospend" || (!hasUnsignedSlot && hasUnsignedP2pk)
    ? ["签署 P2PK 钱包授权", "Sign P2PK wallet authorization"]
    : signLabels[operation.kind] || [tr("signPackage"), tr("signPackage")];
  $("#external-covenant-sign").textContent = label[state.language === "zh" ? 0 : 1];
  const confirmationPhrase = !hasUnsignedSlot && hasUnsignedP2pk ? "SIGN REVIEWED P2PK CO-SPEND" : "SIGN REVIEWED EXTERNAL COVENANT";
  $("#external-covenant-confirmation").placeholder = confirmationPhrase;
  $("#external-confirmation-help").textContent = `${state.language === "zh" ? "签名前请完整输入：" : "Before signing, enter exactly: "}${confirmationPhrase}`;
  $("#external-covenant-sign").disabled = (!hasUnsignedSlot && !hasUnsignedP2pk) || Boolean(state.wallet && !canSign);
  $("#external-covenant-broadcast").disabled = !review.complete;
  renderSigningInvitation(review);
  renderLifecycleInvitationActions();
}

function renderSigningInvitation(review) {
  const panel = $("#signing-invitation");
  const slots = review?.signatureSlots || [];
  panel.hidden = slots.length < 2 || !state.externalPackage;
  if (panel.hidden) return;
  $("#invitation-commitment").textContent = review.commitment;
  $("#invitation-slots").innerHTML = slots.map((slot, index) => `<li class="${slot.signed ? "signed" : ""}">${state.language === "zh" ? `签名人 ${index + 1}` : `Signer ${index + 1}`} · <code title="${esc(slot.publicKey)}">${esc(short(slot.publicKey, 12, 10))}</code> · ${slot.signed ? (state.language === "zh" ? "已签名" : "Signed") : (state.language === "zh" ? "等待签名" : "Awaiting signature")}</li>`).join("");
}

function invitationJson() {
  if (!state.externalPackage) throw new Error(state.language === "zh" ? "请先构建或导入签名邀请" : "Build or import a signing invitation first");
  return JSON.stringify(state.externalPackage, null, 2);
}

function invitationFilename() {
  const commitment = state.externalReview?.commitment || "unsigned";
  return `silverscript-${String(commitment).slice(0, 12)}.ssinvite`;
}

async function downloadInvitation() {
  try {
    if (IS_TAURI) {
      const payload = await api("/api/external-covenants/export", { method: "POST", body: JSON.stringify({ package: state.externalPackage }) });
      toast(state.language === "zh" ? `邀请文件已保存：${payload.export.file}` : `Invitation saved: ${payload.export.file}`, "good");
      return;
    }
    const url = URL.createObjectURL(new Blob([invitationJson()], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = invitationFilename();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(state.language === "zh" ? "签名邀请文件已下载" : "Signing invitation downloaded", "good");
  } catch (error) { toast(error.message, "bad"); }
}

async function shareInvitation() {
  try {
    const file = new File([invitationJson()], invitationFilename(), { type: "application/json" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: state.language === "zh" ? "Kaspa SilverScript 多签邀请" : "Kaspa SilverScript multisig invitation",
        text: `${state.language === "zh" ? "请在 Kaspa SilverScript Studio 中导入并核对交易承诺：" : "Import in Kaspa SilverScript Studio and verify commitment: "}${state.externalReview?.commitment || ""}`,
        files: [file]
      });
    } else {
      await copyText(invitationJson());
      toast(state.language === "zh" ? "当前系统不支持文件分享，已复制邀请 JSON" : "System file sharing is unavailable; invitation JSON copied", "good");
    }
  } catch (error) {
    if (error?.name !== "AbortError") toast(error.message, "bad");
  }
}

async function importInvitationFile(file) {
  if (!file) return;
  if (file.size > 1_000_000) return toast(state.language === "zh" ? "邀请文件不能超过 1MB" : "Invitation files cannot exceed 1MB", "bad");
  $("#external-covenant-package").value = await file.text();
  await inspectExternalCovenant();
  if (state.externalReview) toast(state.language === "zh" ? "邀请已导入，请核对交易承诺和全部输出" : "Invitation imported; verify the commitment and every output", "good");
}

async function inspectExternalCovenant() {
  const button = $("#external-covenant-inspect");
  button.disabled = true;
  try {
    state.localOperationProjectId = "";
    const raw = $("#external-covenant-package").value.trim();
    if (!raw) throw new Error(state.language === "zh" ? "请先粘贴交易包 JSON" : "Paste a transaction package first");
    const payload = await api("/api/external-covenants/inspect", { method: "POST", body: JSON.stringify({ package: raw }) });
    state.externalPackage = payload.package;
    state.externalReview = payload.review;
    renderExternalCovenantReview(payload.review);
    $("#external-covenant-status").textContent = "REVIEWED";
    $("#external-signed-row").hidden = true;
    $("#external-copy-signed").hidden = true;
  } catch (error) {
    state.externalPackage = null;
    state.externalReview = null;
    renderExternalCovenantReview(null);
    $("#external-covenant-status").textContent = "REJECTED";
    toast(error.message, "bad");
  } finally { button.disabled = false; }
}

async function signExternalCovenant(options = {}) {
  if (!state.externalPackage || !state.externalReview) return false;
  if (!(await requireConnectedWallet())) return false;
  const matchingSlot = (state.externalReview.signatureSlots || []).some((slot) => !slot.signed && slot.publicKey === state.wallet.publicKey);
  const p2pk = state.externalReview.p2pkAuthorization;
  const matchingP2pk = Boolean(p2pk && !p2pk.signed && p2pk.publicKey === state.wallet.publicKey && p2pk.address === state.wallet.address);
  if (!matchingSlot && !matchingP2pk) {
    toast(state.language === "zh" ? "当前连接的钱包不是这个操作包的授权签名人" : "The connected wallet is not an authorized signer for this operation package", "warn");
    return false;
  }
  const localRenewal = options.localRenewal === true || isLocalRenewal();
  const confirmationInput = $("#external-covenant-confirmation");
  const confirmationPhrase = matchingSlot ? "SIGN REVIEWED EXTERNAL COVENANT" : "SIGN REVIEWED P2PK CO-SPEND";
  if (!localRenewal && confirmationInput.value.trim() !== confirmationPhrase) {
    confirmationInput.focus();
    toast(state.language === "zh"
      ? `请先完整输入签名确认短语：${confirmationPhrase}`
      : `Enter the complete signing phrase first: ${confirmationPhrase}`, "warn");
    return false;
  }
  const button = $("#external-covenant-sign");
  button.disabled = true;
  try {
    const secrets = await requestSigningSecret();
    const signedPayload = await api(matchingSlot ? "/api/external-covenants/sign" : "/api/external-covenants/sign-p2pk-cospend", { method: "POST", body: JSON.stringify({
      package: state.externalPackage,
      walletId: state.wallet.walletId,
      publicKey: state.wallet.publicKey,
      ...secrets,
      confirmation: confirmationPhrase,
      localRenewal,
      mainnetConfirmation: ""
    }) });
    const payload = matchingSlot ? signedPayload : await api("/api/external-covenants/inspect", {
      method: "POST",
      body: JSON.stringify({ package: signedPayload.package })
    });
    state.externalPackage = payload.package;
    state.externalReview = payload.review;
    renderExternalCovenantReview(payload.review);
    $("#external-covenant-package").value = JSON.stringify(payload.package, null, 2);
    $("#external-signed-package").value = JSON.stringify(payload.package, null, 2);
    $("#external-signed-row").hidden = false;
    $("#external-copy-signed").hidden = false;
    const remaining = (payload.review.signatureSlots || []).filter((slot) => !slot.signed).length + (payload.review.p2pkAuthorization && !payload.review.p2pkAuthorization.signed ? 1 : 0);
    $("#external-covenant-status").textContent = remaining ? "PARTIAL" : "READY TO PREFLIGHT";
    toast(remaining
      ? (state.language === "zh" ? `已签署，仍需 ${remaining} 个授权` : `Signed; ${remaining} authorization(s) remain`)
      : (state.language === "zh" ? "全部授权完成，可进行预检与广播" : "All authorizations are complete; ready for preflight and broadcast"));
    return true;
  } catch (error) {
    const cancelled = /已取消签名|signature cancelled/i.test(error.message);
    $("#external-covenant-status").textContent = cancelled ? "AWAITING SIGNATURE" : "FAILED";
    toast(error.message, cancelled ? "warn" : "bad");
    return false;
  } finally { renderExternalCovenantReview(state.externalReview); }
}

async function broadcastExternalCovenant(options = {}) {
  if (!state.externalPackage || !state.externalReview?.complete) return false;
  const localRenewal = options.localRenewal === true || isLocalRenewal();
  const button = $("#external-covenant-broadcast");
  button.disabled = true;
  try {
    const payload = await api("/api/external-covenants/broadcast", { method: "POST", body: JSON.stringify({
      package: state.externalPackage,
      confirmation: $("#external-broadcast-confirmation").value,
      localRenewal
    }) });
    $("#external-covenant-status").textContent = "BROADCAST";
    if (payload.project && state.project?.id === payload.project.id) {
      state.project = payload.project;
      await loadLifecycleOperations(state.project);
      await loadLifecycleStatus(state.project);
    }
    toast(state.language === "zh" ? `交易已广播：${short(payload.result.txid, 12, 10)}` : `Transaction broadcast: ${short(payload.result.txid, 12, 10)}`);
    $("#external-covenant-review").insertAdjacentHTML("beforeend", `<p><a href="${esc(payload.result.kascovTransactionUrl)}" target="_blank" rel="noopener">Kascov transaction ↗</a></p>`);
    return true;
  } catch (error) {
    $("#external-covenant-status").textContent = "FAILED";
    toast(error.message, "bad");
    return false;
  } finally { renderExternalCovenantReview(state.externalReview); }
}

function normalizeWhitespace() {
  const source = $("#source-editor").value.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  $("#source-editor").value = source;
  sourceStats();
  scheduleSave();
}

async function init() {
  applyLanguage();
  const session = await waitForApi();
  state.token = session.token;
  state.config = await api("/api/config");
  $("#skill-state").textContent = String(state.config.skill?.upstreamCommit || "—").slice(0, 7);
  renderCompilerProfiles();
  $("#compiler-state").textContent = state.config.compiler.configured ? "PINNED" : "SETUP REQUIRED";
  $("#compiler-state").className = state.config.compiler.configured ? "good" : "warn";
  $("#deploy-network option[value='mainnet']").disabled = !state.config.allowMainnet;
  await loadWallets();
  await loadSettings();
  const preferredNetwork = state.settings.settings.defaultNetwork;
  $("#deploy-network").value = preferredNetwork === "mainnet" && !state.config.allowMainnet ? "tn10" : preferredNetwork;
  updateNetworkControls();
  applyLanguage();
  await loadTemplates();
  await loadProjects();
  refreshNode();
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
$("#language-toggle").addEventListener("click", () => {
  state.language = state.language === "zh" ? "en" : "zh";
  try { localStorage.setItem("silverstudio-language", state.language); } catch {}
  applyLanguage();
});
$("#new-project").addEventListener("click", () => createProject());
$("#template-example").addEventListener("click", openTemplateExample);
$("#template-new-project").addEventListener("click", () => createFromSelectedTemplate().catch((error) => toast(error.message, "bad")));
$("#template-apply").addEventListener("click", requestTemplateApply);
$("#template-apply-dialog").addEventListener("close", () => {
  if ($("#template-apply-dialog").returnValue === "confirm") applyPendingTemplate().catch((error) => toast(error.message, "bad"));
  else {
    state.pendingTemplateId = "";
    state.pendingTemplateParameters = null;
  }
});
$("#project-delete-dialog").addEventListener("close", () => {
  if ($("#project-delete-dialog").returnValue === "confirm") deletePendingProject().catch((error) => toast(error.message, "bad"));
  else state.pendingDeleteProjectId = "";
});
$("#provider").addEventListener("change", updateProviderModel);
$("#generate-contract").addEventListener("click", () => runAi("generate"));
$("#review-contract").addEventListener("click", () => runAi("review"));
$("#apply-ai").addEventListener("click", applyCandidate);
$("#discard-ai").addEventListener("click", () => { state.candidate = null; $("#ai-result").hidden = true; $("#ai-actions").hidden = true; $("#ai-empty").hidden = false; $("#ai-status").textContent = tr("waitingInput"); });
$("#format-source").addEventListener("click", normalizeWhitespace);
$("#analyze-source").addEventListener("click", analyzeSource);
$("#compile-contract").addEventListener("click", compileCurrent);
$("#check-compatibility").addEventListener("click", () => checkCompilerCompatibility(true).catch((error) => toast(error.message, "bad")));
$("#migrate-source").addEventListener("click", applySafeSourceMigration);
$("#compiler-profile").addEventListener("change", () => {
  renderCompilerProfileHelp();
  if (state.project) state.project.artifact = null;
  renderArtifact(null);
  scheduleSave();
  checkCompilerCompatibility(false).catch((error) => toast(error.message, "bad"));
});
$("#refresh-node").addEventListener("click", refreshNode);
$("#settings-button").addEventListener("click", openSettings);
$$('[data-settings-tab]').forEach((tab) => tab.addEventListener("click", () => selectSettingsTab(tab.dataset.settingsTab)));
$("#settings-provider").addEventListener("change", renderAiProviderEditor);
$("#ai-vault-unlock").addEventListener("click", unlockAiVault);
$("#ai-vault-lock").addEventListener("click", lockAiVault);
$("#ai-settings-save").addEventListener("click", saveAiSettings);
$("#app-settings-save").addEventListener("click", saveAppSettings);
$("#open-wallet-manager").addEventListener("click", () => { $("#settings-dialog").close(); openWalletManager(); });
$("#wallet-button").addEventListener("click", openWalletManager);
$("#wallet-card").addEventListener("click", openWalletManager);
$("#wallet-create").addEventListener("click", createLocalWallet);
$("#wallet-unlock").addEventListener("click", unlockLocalWallet);
$("#wallet-disconnect").addEventListener("click", disconnectWallet);
$$('[data-wallet-mode]').forEach((button) => button.addEventListener("click", () => selectWalletMode(button.dataset.walletMode)));
$$('[data-wallet-action]').forEach((button) => button.addEventListener("click", () => selectWalletAction(button.dataset.walletAction)));
$("#wallet-refresh-balance").addEventListener("click", () => refreshWalletBalance());
$("#wallet-copy-address").addEventListener("click", () => state.wallet && copyText(state.wallet.address));
$("#wallet-copy-receive").addEventListener("click", () => state.wallet && copyText(state.wallet.address));
$("#wallet-build-transfer").addEventListener("click", buildWalletTransfer);
$("#wallet-confirm-transfer").addEventListener("click", confirmWalletTransfer);
[$("#wallet-send-recipient"), $("#wallet-send-amount"), $("#wallet-send-mainnet-phrase")].forEach((input) => input.addEventListener("input", resetTransferDraft));
$("#recovery-confirm").addEventListener("change", () => { $("#recovery-done").disabled = !$("#recovery-confirm").checked; });
$("#recovery-dialog").addEventListener("cancel", (event) => { if (!$("#recovery-confirm").checked) event.preventDefault(); });
$("#recovery-dialog").addEventListener("close", () => {
  $("#recovery-phrase").textContent = "";
  $("#recovery-passphrase-warning").hidden = true;
  $("#recovery-confirm").checked = false;
  $("#recovery-done").disabled = true;
  if (state.pendingCreatedWalletId) {
    $("#wallet-select").value = state.pendingCreatedWalletId;
    state.pendingCreatedWalletId = "";
    toast(state.language === "zh" ? "钱包已加密保存；请在上方重新输入密码并连接" : "Wallet encrypted and saved. Re-enter its password above to connect", "good");
    $("#wallet-password").focus();
  }
});
$("#wallet-dialog").addEventListener("close", clearWalletSecrets);
$("#build-draft").addEventListener("click", buildAndBroadcast);
$("#external-covenant-inspect").addEventListener("click", inspectExternalCovenant);
$("#external-covenant-sign").addEventListener("click", signExternalCovenant);
$("#external-covenant-broadcast").addEventListener("click", broadcastExternalCovenant);
$("#external-copy-signed").addEventListener("click", () => copyText($("#external-signed-package").value));
$("#external-copy-invitation").addEventListener("click", () => copyText(invitationJson()));
$("#external-download-invitation").addEventListener("click", downloadInvitation);
$("#external-share-invitation").addEventListener("click", shareInvitation);
$("#external-import-package").addEventListener("click", () => $("#external-package-file").click());
$("#external-package-file").addEventListener("change", (event) => {
  importInvitationFile(event.target.files?.[0]).catch((error) => toast(error.message, "bad"));
  event.target.value = "";
});
$("#lifecycle-operation").addEventListener("change", renderLifecycleOperations);
$("#lifecycle-build").addEventListener("click", buildLifecycleOperation);
$("#lifecycle-download-invitation").addEventListener("click", downloadInvitation);
$("#lifecycle-copy-invitation").addEventListener("click", () => copyText(invitationJson()));
$("#lifecycle-refresh").addEventListener("click", () => loadLifecycleStatus());
$("#lifecycle-renew-now").addEventListener("click", renewCurrentContract);
$("#lifecycle-inherit-now").addEventListener("click", prepareMatureInheritance);
$("#external-covenant-package").addEventListener("input", () => {
  state.externalPackage = null;
  state.externalReview = null;
  state.localOperationProjectId = "";
  state.lifecycleInviteProjectId = "";
  $("#external-covenant-status").textContent = "IDLE";
  renderExternalCovenantReview(null);
});
$("#deploy-network").addEventListener("change", () => { updateNetworkControls(); refreshNode(); scheduleSave(); if (state.wallet) { state.wallet = null; renderWallet(); } renderTemplatePreview(); });
[$("#project-name"), $("#requirements"), $("#source-editor"), $("#constructor-args"), $("#deploy-amount")].forEach((input) => input.addEventListener("input", () => {
  if (input === $("#source-editor")) sourceStats();
  if ((input === $("#source-editor") || input === $("#constructor-args")) && state.project) {
    state.project.artifact = null;
    renderArtifact(null);
  }
  scheduleSave();
}));

document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");
  if (!IS_TAURI || !link) return;
  let url;
  try { url = new URL(link.href); } catch { return; }
  if (!["http:", "https:"].includes(url.protocol)) return;
  event.preventDefault();
  openExternalUrl(url.href).catch((error) => toast(
    state.language === "zh" ? `无法打开默认浏览器：${error}` : `Could not open the default browser: ${error}`,
    "bad"
  ));
});

init().catch((error) => toast(error.message, "bad"));
