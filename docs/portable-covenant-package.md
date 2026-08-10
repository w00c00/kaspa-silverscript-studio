# Portable Covenant Signing Package / 可携带 Covenant 签名包

Kaspa SilverScript Studio can review and sign a covenant transaction created by another
application when that application exports a complete version-1 package.

Kaspa SilverScript Studio 可以审查并签署其他应用创建的 Covenant 交易，但对方必须导出完整的
version-1 交易包。

```json
{
  "version": 1,
  "network": "tn10",
  "networkCaip2": "kaspa:testnet-10",
  "transactionSafeJson": "{...Kaspa Transaction Safe JSON...}",
  "covenantInput": {
    "index": 0,
    "covenantId": "32-byte hex",
    "programHex": "compiled redeem program",
    "programSha256": "optional provenance hash",
    "abi": [
      {
        "name": "spend",
        "inputs": [{ "name": "signature", "type_name": "sig" }]
      }
    ],
    "entrypoint": "spend",
    "arguments": [
      {
        "kind": "signature",
        "publicKey": "32-byte x-only public key"
      }
    ],
    "descriptor": {
      "schema": "kaspa-covenant-descriptor",
      "version": 1,
      "profileId": "producer/template/v1",
      "network": "kaspa:testnet-10",
      "programSha256": "32-byte hex",
      "covenantId": "32-byte hex",
      "abi": { "encoding": "silverscript-json-abi/v1", "sha256": "32-byte hex" },
      "state": { "encoding": "silverscript-state-layout/v1", "sha256": "32-byte hex" },
      "controlPrincipals": [],
      "authorizationPrincipals": []
    },
    "descriptorSha256": "canonical descriptor SHA-256"
  },
  "provenance": {
    "kind": "producer-defined",
    "sourceSha256": "optional source hash",
    "compilerCommit": "optional pinned compiler commit"
  }
}
```

Supported ABI argument types are `sig`, `pubkey`, `int`, `bool`, `byte[]`, and
`byte[N]`. A signature argument is a slot. Different local clients can import the
same package and fill different slots before the final client exports or broadcasts
the complete transaction.

当前支持 `sig`、`pubkey`、`int`、`bool`、`byte[]` 和 `byte[N]` 参数。`sig`
参数代表签名槽；多个本地客户端可以依次导入同一个包并填充自己的签名槽。

New Studio packages include a canonical version-1 descriptor. It binds the CAIP-2
network, program, covenant ID, ABI, state layout, and recognized principal profiles.
Unknown principal profiles fail closed. Older packages without a descriptor remain
readable but are visibly marked as legacy and require stronger independent review.

Studio 新生成的包包含 canonical v1 描述符，绑定 CAIP-2 网络、程序、Covenant ID、ABI、
状态布局和已识别的主体类型。未知主体 profile 会失效关闭。没有描述符的旧包仍可读取，
但会明确标成旧版，并要求更严格的独立核对。

## Why covenant ID alone is insufficient / 为什么只有 covenant ID 不够

A covenant ID identifies a covenant domain, but it does not describe the transaction
the wallet is authorizing. Safe signing also needs the exact transaction, every input
UTXO, outputs and values, redeem program, ABI selector, entrypoint arguments, and the
public key assigned to each signature slot.

Covenant ID 只能标识 Covenant 域，不能说明钱包正在授权哪笔交易。安全签名还需要完整
交易、每个输入 UTXO、输出和金额、redeem program、ABI 选择器、入口参数以及每个签名槽
对应的公钥。

The application verifies that `programHex` hashes to the target P2SH input, that the
declared covenant ID equals the UTXO covenant ID, that input values cover outputs,
and that the fee is at most 0.1 KAS/TKAS. It then builds the signature script and runs
the complete transaction through the bundled pinned Kaspa script engine before it can
be broadcast. Kascov adds a preferred visual report when reachable, but is optional.

应用会核对 `programHex` 与目标 P2SH 输入、声明的 covenant ID 与 UTXO、输入输出金额和
0.1 KAS/TKAS 本地手续费上限；完成签名脚本后，还必须通过内置固定版本的 Kaspa
脚本引擎才能广播。Kascov 在线时提供首选可视化报告，但不是运行依赖。

The supplied ABI is metadata and cannot prove what opaque bytecode does. For unknown
programs, compare source, compiler commit, constructor arguments, and program hash with
an independently trusted artifact before signing.

外部 ABI 只是元数据，不能证明不透明字节码的真实行为。签署未知程序前，必须从独立可信
来源核对源码、编译器提交、构造参数和 program hash。
