# Studio 0.2 architecture / Studio 0.2 架构

## 中文

### 编译器兼容档案

`config/compiler-profiles.json` 是可提交的兼容性清单，`config/compiler.json` 是本机生成的二进制路径、构建时间和 SHA-256 清单。默认档案固定官方 SilverScript `cb34aa5e6a598f9e461c4ad7014279ba89251d8d`，旧版 `2a3961cadc76bb16a425042172ffe32481da89b5` 只用于复现已有项目。

升级检查会报告已知变化，并只自动替换无歧义的名称。`.reverse()` 删除、字节序、位运算类型和任何状态布局变化必须人工审查。迁移后仍必须使用真实构造参数完整编译并进行对抗性交易测试。

接口：

- `GET /api/compiler/profiles`
- `POST /api/contracts/compatibility`
- `POST /api/contracts/compile`，请求中携带 `compilerProfileId`

### CovenantStateSource

`CovenantStateSource` 将“寻找当前活跃 Covenant UTXO”和具体索引服务解耦。Provider 只负责返回候选项；Source 会独立验证 outpoint、Covenant ID、P2SH script 和正金额。一个 Provider 返回多个已验证候选时会 fail closed，避免悄悄选择错误 lineage。

Studio 当前依次尝试：节点原生 Covenant ID 查询（节点支持时）、outpoint 查询（节点支持时）、P2SH 地址 UTXO 查询。以后可以加入本地索引器或其他节点适配器，但不能绕过最终验证。

接口：`POST /api/covenants/resolve`。

### P2PK co-spend 授权

普通 P2PK 输入可作为 Covenant 状态转换的独立钱包授权。选择器采用“覆盖所需金额的最小已确认非 Coinbase UTXO”。授权组件验证网络、地址与 x-only 公钥、P2PK script、outpoint 和金额。

签名时只签元数据指定的 P2PK input。签名前后会比较忽略 signatureScript 的交易承诺，并确认其他 Covenant 输入没有被钱包修改。确认短语为 `SIGN REVIEWED P2PK CO-SPEND`。

接口：

- `POST /api/p2pk-cospend/select`
- `POST /api/p2pk-cospend/authorization`
- `POST /api/external-covenants/sign-p2pk-cospend`

### 原子多 Covenant builder

`buildAtomicCovenantPackage` 支持 2–32 个 Covenant 输入。它拒绝重复 outpoint、重复 Covenant ID、redeem program/P2SH 不匹配、跨网络地址、隐式手续费和超出 mass 限制的交易。每个 continuation output 必须通过 Covenant ID 映射到明确的输入索引。

构建结果仍是标准 `.ssinvite` 操作包，可在操作中心审查和逐步签名。接口：`POST /api/external-covenants/build-atomic`。

对于生成的 Covenant declaration 入口，操作包使用编译 artifact 中的 `stateFields` 顺序编码 `State` witness，不接受调用者自定义字段顺序或额外字段。

这些检查不能替代每个 Covenant 自身的状态守恒规则。Builder 只保证交易结构和绑定，不会从外部 ABI 元数据推导链上语义。

## English

### Compiler compatibility profiles

`config/compiler-profiles.json` is the committed compatibility catalog. The generated `config/compiler.json` records local binary paths, build times, and SHA-256 hashes. The default profile pins official SilverScript commit `cb34aa5e6a598f9e461c4ad7014279ba89251d8d`; `2a3961cadc76bb16a425042172ffe32481da89b5` is retained only for reproducible legacy builds.

Compatibility checks report known changes and automatically apply only unambiguous renames. Removed `.reverse()`, byte ordering, bitwise typing, and any state-layout change require manual review. Every migration still requires a full compile with realistic constructor arguments and adversarial transaction tests.

Endpoints:

- `GET /api/compiler/profiles`
- `POST /api/contracts/compatibility`
- `POST /api/contracts/compile` with `compilerProfileId`

### CovenantStateSource

`CovenantStateSource` separates active-covenant discovery from a particular index service. Providers return candidates; the source independently verifies the outpoint, covenant ID, P2SH script, and positive value. Multiple verified candidates from one provider fail closed instead of silently choosing a lineage.

Studio currently tries native covenant-ID RPC when available, outpoint RPC when available, then P2SH-address UTXO lookup. Local indexers can be added later, but they cannot bypass final verification.

Endpoint: `POST /api/covenants/resolve`.

### P2PK co-spend authorization

A plain P2PK input can independently authorize a covenant state transition. The selector chooses the smallest confirmed, non-coinbase UTXO that covers the required value. Authorization verifies network, address/x-only key ownership, P2PK script, outpoint, and amount.

Signing touches only the declared P2PK input. Studio compares the signature-independent transaction commitment and verifies that no covenant input was changed. The confirmation phrase is `SIGN REVIEWED P2PK CO-SPEND`.

Endpoints:

- `POST /api/p2pk-cospend/select`
- `POST /api/p2pk-cospend/authorization`
- `POST /api/external-covenants/sign-p2pk-cospend`

### Atomic multi-covenant builder

`buildAtomicCovenantPackage` supports 2–32 covenant inputs. It rejects duplicate outpoints, duplicate covenant IDs, redeem-program/P2SH mismatches, cross-network addresses, implicit fees, and transactions over the current mass limit. Each continuation output maps its covenant ID to an explicit source input index.

The result is a standard `.ssinvite` package for review and sequential authorization in the operation center. Endpoint: `POST /api/external-covenants/build-atomic`.

For generated covenant-declaration entrypoints, the package encodes `State` witnesses using the `stateFields` order exported by the compiled artifact; callers cannot substitute field order or add undeclared fields.

These checks do not replace state-conservation rules in each covenant. The builder guarantees transaction structure and bindings; it does not infer on-chain semantics from untrusted ABI metadata.
