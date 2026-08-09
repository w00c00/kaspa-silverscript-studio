# Official baseline

## Verified snapshot

- Repository: <https://github.com/kaspanet/silverscript>
- Verified commit: `cb34aa5e6a598f9e461c4ad7014279ba89251d8d`
- Verified date: 2026-08-09
- Compiler/language status: experimental
- Official recommendation at this snapshot: use bytecode artifacts on
  testnet-10 until the first stable v1 release.

Always compare this snapshot with upstream before answering latest/current,
deployment, compatibility, or mainnet-readiness questions.

## Primary sources

- Project status and debugger:
  <https://github.com/kaspanet/silverscript/blob/cb34aa5e6a598f9e461c4ad7014279ba89251d8d/README.md>
- Language tutorial:
  <https://github.com/kaspanet/silverscript/blob/cb34aa5e6a598f9e461c4ad7014279ba89251d8d/docs/TUTORIAL.md>
- Covenant declaration semantics:
  <https://github.com/kaspanet/silverscript/blob/cb34aa5e6a598f9e461c4ad7014279ba89251d8d/docs/DECL.md>
- Built-ins and cross-template validation:
  <https://github.com/kaspanet/silverscript/blob/cb34aa5e6a598f9e461c4ad7014279ba89251d8d/silverscript-lang/std/builtins.sil>
- KCC20 book:
  <https://kaspanet.github.io/silverscript/kcc20-book/>
- Official application examples, including chess:
  <https://github.com/kaspanet/silverscript/tree/cb34aa5e6a598f9e461c4ad7014279ba89251d8d/silverscript-lang/tests/apps>

## Snapshot capabilities

- SilverScript compiles a CashScript-inspired language to Kaspa script.
- Covenant declaration annotations generate auth/covenant wrappers and state
  validation for verification and transition policies.
- The compiler supports 1:1, 1:N, and N:M state shapes, explicit termination for
  singleton transitions, structs, typed state, and cross-template state checks.
- The workspace includes a source-level debugger and records a compiler version
  in compiled artifacts.
- Commit `956868e` hardened template-hash handling and introduced a breaking
  change. Commit `9aa70b0` fixed lexical-scoping and inferred-array-scope bugs.
- Commit `26e3b9f` exposes `blake2bWithKey`, `blake3`, and
  `blake3WithKey` as compiler built-ins. Keyed Blake3 requires explicit
  `byte[]` data and an exactly 32-byte key; keyed Blake2b accepts keys up to
  64 bytes. Treat protocol domain-separation keys as exact consensus inputs.
- Commit `2ed2343` enforces exact type equality during static checking. Fixed
  and dynamic arrays are not interchangeable; use explicit casts only when the
  resulting size and protocol meaning are correct.
- Commit `2a3961c` hardens covenant leader contracts. A contract with any
  `binding = cov` declaration cannot mix in `binding = auth` declarations.
  Handwritten entrypoints require the explicit
  `#[covenant.allow(rule = manual_entrypoint_in_leader_contract)]`
  acknowledgment and must manually prove singleton, delegate, or complete
  leader-group semantics. The attribute adds no runtime checks.
- The current compiler uses `entry` for public entrypoints, `checkMsgSig` for
  arbitrary-message signatures, and `outpointTxId` for input outpoint hashes.
  The compiled JSON program field is `bytecode`, replacing the older `script`
  field. Constructor array expressions also carry explicit type metadata.
- `.reverse()` was removed and bitwise operations now require byte operands.
  Byte ordering and integer/byte casts therefore require manual review rather
  than blind source replacement.
- Commit `cb34aa5` rejects duplicate function names, entrypoint parameters that
  shadow contract fields, and non-numeric ordered comparisons. It also fixes
  fixed/dynamic array sizing and cast validation. Commit `5aa0886` adds the
  variable-input `g16.verify` Groth16 verifier built-in.

## Terminology discipline

Do not silently conflate KCC20, KRC20, and similarly named token protocols.
Identify the exact covenant implementation, template hash, and covenant ID used
by the target project.
