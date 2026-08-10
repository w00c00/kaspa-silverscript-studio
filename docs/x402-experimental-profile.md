# Kaspa x402 TN10 experimental profile / Kaspa x402 TN10 实验档案

Studio tracks the public Kaspa x402 alpha at source commit
`7cae0eeea174f4ed077c96f376af69a38d18eddb`. This is an interoperability
profile, not a mainnet-readiness claim and not an authorization source.

Studio 跟踪公开的 Kaspa x402 alpha 源码提交
`7cae0eeea174f4ed077c96f376af69a38d18eddb`。这是互操作档案，不代表主网成熟，
也不能作为资金授权来源。

## Network identifiers / 网络标识

- Studio internal: `tn10`
- Kaspa native: `testnet-10`
- proposed CAIP-2: `kaspa:testnet-10`

New Studio operation packages carry both the internal network and the CAIP-2
identifier. The CAIP registration remains a proposal, so import accepts the
aliases but canonical signing and transaction review still use the selected
Kaspa node network.

新操作包同时携带 Studio 内部网络和 CAIP-2 标识。CAIP 注册仍是提案，因此导入可以识别
这些别名，但签名和交易审查仍以实际选择的 Kaspa 节点网络为准。

## Safe Studio mapping / Studio 安全映射

| x402 concept | Studio representation |
|---|---|
| payment requirements | read-only request metadata; never wallet authority |
| exact payment | ordinary reviewed wallet-transfer draft |
| batch escrow deposit | compiled covenant deployment with exact artifact evidence |
| voucher | domain-separated off-chain message signature bound to network, script and active outpoint |
| claim/refund | versioned `.ssinvite` operation package and local engine preflight |
| settlement evidence | node txid plus optional Kascov visualization |

Every future executable x402 template must pin the upstream source and compiler,
port the source to current `entry`, `checkMsgSig`, `outpointTxId`, and explicit
scalar byte conversions, reproduce the published vectors, and include claim,
continuation, refund, replay, wrong-network, wrong-outpoint, value-conservation,
and fee-boundary tests. Until those gates pass, Studio does not present the
upstream alpha escrow as a deployable built-in template.

未来任何可执行 x402 模板都必须固定上游源码和编译器，迁移到当前 `entry`、
`checkMsgSig`、`outpointTxId` 与显式标量 byte 转换，复现公开测试向量，并覆盖领取、
延续、退款、重放、错误网络、错误 outpoint、价值守恒和手续费边界测试。在这些门槛完成前，
Studio 不会把上游 alpha 托管合约伪装成可直接部署的成熟内置模板。

Primary source: <https://github.com/elldeeone/kaspa-x402/tree/7cae0eeea174f4ed077c96f376af69a38d18eddb>
