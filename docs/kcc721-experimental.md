# TN10 Experimental KCC721 pack

## 中文

Studio 内置的 KCC721 包改编自 `KaspaHUB21/KCC721` v0.2 社区草案，保留 MIT 许可证，包含四个固定源码：Collection Controller、Blind Mint Ticket、NFT Cell 和 Migration Controller。

本包只允许 `tn10`，风险等级为 `high-experimental`。普通单 Covenant 部署路径被明确禁用，因为 Collection/Ticket/NFT 创世需要专用的多合约 builder 正确计算模板片段、模板哈希、Covenant ID 和 output binding。当前完成的是：

- 四份源码在官方 `silverc@cb34aa5` 下完整编译。
- 模板使用三步配置向导，不再要求用户手填元数据摘要。名称、描述、图片 URI、外部链接和属性会先规范化为确定性 JSON，再由前后端分别计算并核对 SHA-256。
- “新集合”明确标记为编译预览，内部使用不可部署的全零哨兵；只有“导入已有 TN10 集合”模式接受从真实创世输出核验的 Collection Covenant ID。
- NFT 所有者变更绑定独立 P2PK co-spend 输入。
- 原子 builder 支持 2–32 个不同 Covenant ID 的批量交易。
- Artifact 导出的 `State` 字段布局约束操作包 witness 编码；两枚 NFT 的共享 P2PK 原子转移已通过本地脚本引擎逐输入执行。
- 外部操作包会核验 P2SH、Covenant ID、手续费、全部输出和 P2PK 授权输入。

当前没有完成、因此禁止的事项：

- 不得称为 KCC 正式标准或主网 NFT 标准。
- 不得从普通“部署”按钮单独创建 NFT、Ticket 或 Controller。
- 不得在没有专用 genesis/mint builder、真实 TN10 链上回放、破坏性测试和独立审查时使用主网。
- `validateOutputStateWithTemplate` 只验证目标状态模板；专用 builder 还必须验证新输出的 Covenant identity 与预期 genesis 绑定。

### 向导填写方式

1. 填写 NFT 名称、描述、图片 URI、外部链接和可选属性。界面显示的摘要由本机自动计算；不用复制或手工修改。
2. 新集合请选择“新集合 · 编译预览”。此模式只生成可复现编译工作，Collection ID 会显示为“待创世交易生成”，不能上链。
3. 只有已经拥有真实 TN10 Collection Controller 创世输出时，才选择“导入已有 TN10 集合”，并填写从该输出核验得到的 32-byte Covenant ID。交易 ID、地址和随机哈希都不是 Collection ID。
4. Token ID 必须在该 Collection 内唯一；初始所有者应使用当前连接的 TN10 P2PK 钱包。NFT Cell 金额不是铸造价格或销售价格。

## English

The bundled KCC721 pack is adapted from the community `KaspaHUB21/KCC721` v0.2 draft under its MIT license. It contains four pinned sources: Collection Controller, Blind Mint Ticket, NFT Cell, and Migration Controller.

The pack is restricted to `tn10` and marked `high-experimental`. Ordinary single-covenant deployment is explicitly blocked because Collection/Ticket/NFT genesis requires a dedicated multi-contract builder to calculate template segments, template hashes, covenant IDs, and output bindings correctly. The current implementation provides:

- Full compilation of all four sources with official `silverc@cb34aa5`.
- A three-step setup wizard that no longer asks users to type a metadata digest. Name, description, image URI, external URL, and attributes are canonicalized into deterministic JSON, then SHA-256 is independently recomputed by the client and server.
- A clearly labeled new-collection compile preview with a non-deployable internal all-zero sentinel. Only the existing-TN10-collection path accepts a Collection covenant ID verified from a real genesis output.
- NFT ownership transitions bound to a separate P2PK co-spend input.
- Atomic transactions across 2–32 distinct covenant IDs.
- Artifact-derived `State` field layouts constrain portable witness encoding; a two-NFT transfer with one shared P2PK authorization passes local script-engine execution for every input.
- Portable-package verification of P2SH, covenant IDs, explicit fee, every output, and the P2PK authorization input.

Not completed and therefore prohibited:

- Do not describe this as a finalized KCC or mainnet NFT standard.
- Do not deploy an NFT, Ticket, or Controller through the ordinary standalone deployment button.
- Do not use mainnet without a dedicated genesis/mint builder, real TN10 lineage replay, destructive testing, and independent review.
- `validateOutputStateWithTemplate` validates a target state template; the dedicated builder must additionally verify the new output covenant identity and expected genesis binding.

### Using the wizard

1. Enter the NFT name, description, image URI, external URL, and optional attributes. Studio computes the displayed digest locally; do not copy or edit it manually.
2. For a new collection, select **New collection · compile preview**. It creates a reproducible compilation workspace only, displays the Collection ID as pending genesis, and cannot deploy.
3. Select **Import existing TN10 collection** only when a real Collection Controller genesis output already exists. Paste the 32-byte covenant ID verified from that output. A transaction ID, address, or invented hash is not a Collection ID.
4. The Token ID must be unique in that Collection. Use the connected TN10 P2PK wallet as the initial owner. NFT cell value is not the mint price or sale price.
