# POST-CWF — 着手順

**書いた日 2026-09-18。着手は Crypto World's Fair 提出（2026-10-12）以降。**
それまでこのリポジトリには触らない。CWF の提出物は Confide であり、ここは別プロダクト。

事業側の文脈（相手方・起債規模・スキーム）は**このリポジトリの外**にある非公開フォルダで管理する。
公開リポジトリなので、以下には固有名と金額を書かない。

市場の現況（何が既にあり、何が止まっていて、何が本当に空いているか）は
非公開の作業メモ（このリポジトリの外）。設計の出典は
[`references/README.md`](references/README.md)。

---

## 0. 先に直す — README が嘘をついている

**着手順の1番より前。** README が載せている2つのプログラムIDは、**どちらもデプロイされていない**。
2026-09-18 に RPC で確認済み：

```
stablebond-core   3fnWkVPz51AJjYodQY5VCzteD5enRmkWBTsu3gPedaYs   devnet NULL / mainnet NULL
stablebond-yield  DLFUfzV4iqCzxmmXmCpR7qH6nhvPSLUekq7JCezV1LeE   devnet NULL / mainnet NULL
```

`declare_id!` のプレースホルダが、あたかも稼働中のアドレスのように README に並んでいる状態。
実質作業は 2026-03-06〜03-12 の1週間で、以降6か月止まっている（全14コミット）。

やること：
1. 現在のツールチェーンでビルドが通ることを確認（`cargo build-sbf`。Confide の経験では
   `--arch v3` 指定が要る。既定ターゲットはランタイムに蹴られる）
2. `anchor test` が通ることを確認（README は約35ケースと主張。**数える**）
3. devnet にデプロイし、README の ID を実IDに置き換える
4. デプロイ済みであることを機械的に確認するスクリプトを置く

**これが済むまで、下のどれも「動いている」と書けない。**

---

## 作るもの（優先順）

### 1. TSSO 検証プログラムの Solana 移植 — 小・差別化最大

`references/` の自社資産。Secure Root Key（手動・重要更新）と Derivative Chain Key
（閾値 δ ≤ ε 内の自動更新）、`assetId ‖ price ‖ timestamp ‖ seqNum ‖ prevSig ‖ prevHash`
の署名チェーンをオンチェーンで検証する。

**なぜ最優先か：**
- 小さく、自己完結し、テストで検証できる
- RedStone が共著者であり、かつ Solana に在る
- **受け皿がこのリポジトリに既にある** — `configure_reserve_attestor` /
  `submit_reserve_attestation` は現在「信頼された attestor authority が数値を出す」だけ。
  ここを TSSO の署名チェーン検証に置き換えると、信頼点が1つ減る
- TSSO の「値が動かなくても定期的に再署名して鮮度を保つ」機構は、既存の
  `attestation_max_staleness`（古くなると yield accrual が止まる）と**そのまま噛み合う**

注意：単一ソース NAV の検証であって、分散オラクルではない。そこが TSSO の主張点なので、
Pyth/Switchboard 経路（`configure_oracle`）とは**併存**させる。置き換えない。

### 2. 満期つき社債トークン — 中

Token-2022。Superstate 方式を踏襲する：**Default Account State（初期 Frozen）＋
Permanent Delegate ＋ Allowlist Program を Freeze Authority に**。Transfer Hook は使わない
（Superstate が実運用で使っていない。フックはDeFi統合のたびに検証コストを生む）。

**既存との関係：**
- `initialize_vault` は既に maturity を持つ。ただし**ボルト単位**であってトークン単位ではない
- pull-to-par は既に実装されている — 「discount bonds accrue positive yield; premium bonds
  amortize the premium against coupon rate」。**作り直さず、トークン側の経過利子と整合させる**
- 現在のコンプライアンス層は tier ベース（Bronze/Silver/Gold/Diamond）。これは残しつつ、
  適格性の判定を #3 に委譲できる形にする

### 3. SAS → allowlist ブリッジ — 小

**誰も配線していない唯一の穴。** Solana Attestation Service は mainnet で稼働中、Civic 等が
統合済みで、プリミティブは既にある。しかし「SAS の attestation を読んで発行体のポリシーを適用し、
Token-2022 のアカウントを Thaw する」という配線の実装例が公開されていない。

やること：attestation を検証し、条件を満たせば Thaw 命令を出すプログラム。
既存の tier（`@accredit/sdk` / `@complr/sdk` / `@stratum/core` で配線されている）を
attestation 由来に置き換えられるようにする。

小さいが、**#2 を単独の発行体ツールから「他人も使える層」に変えるのはここ**。

### 4. 3年限発行＋イールドカーブ — 小

オンチェーンの板から円建てカーブを構成する。視覚的な決め手であり、かつ
「DeFi に年限の概念がない」という主張を**自分で反証しないための**実装でもある
（Loopscale / Exponent / RateX が既に固定金利・固定期間をやっている。カーブを作るのは
年限を複数揃えることであって、年限概念を持ち込むことではない）。

フロントは既にある（`/bonds`, `/yield`）。カーブ表示はその延長。

### 5. Loopscale 形状のアダプタ — 中

**統合先は Kamino / Orca ではなく Loopscale。**

- Loopscale はオーダーブック型の**固定金利・固定期間**貸借。債券の年限と形が一致する
- 既に RWA が預入の約40%、かつ **EUR / GBP / BRL / MXN 建てステーブルコインに対応済み。
  JPY だけがない** → JPY 追加は新カテゴリではなく**増分**の依頼になる
- Kamino / Orca は AMM・無期限寄りで、満期のある債券とミスマッチ。
  ただし Kamino V2 の Modular Market Layer は**パーミッションド隔離マーケットを実運用している**
  （Superstate が `setProtocolAddressPermission` で Kamino プログラムを allowlist 登録）。
  第二候補としては生きている

最初はモックでよい。実統合は相手のあることなので、こちら側の形だけ先に決める。

---

## やらないこと

- **規格を書かない。** sRFC 00020 は2023年提案のまま停止、Solana Foundation の RFP も
  成果物なし。実装が先、規格化は後（EIP-4626 も ERC-3643 もそうだった）
- **Vault 標準を作り直さない。** Solana Vault Standard（`solanabr/solana-vault-standard`）が
  既に12バリアントを定義している。devnet・外部監査なし・採用ゼロなので**採用はしないが、
  再発明もしない**。合成性を問われたときに説明できるようにしておく
- **Transfer Hook に寄せない。** #2 参照
- **Kamino / Orca を第一統合先にしない。** #5 参照

## 着手前に潰す未確認点

1. **JPYSC がクローズドループである限り、Solana 上の円建て流動性は成立しない。**
   2026-06-24 稼働、Ethereum のみ、検証済み口座保有者のみ、外部ウォレット出金なし。
   **これはスキーム全体のクリティカルパスであり、技術ではなく発行スキームの問題。**
   ここが動かない前提なら #4 と #5 の意味が変わる
2. Loopscale がパーミッションド（Frozen-by-default）トークンを担保に取れるか。
   取れないなら #2 の設計が変わる
3. Kamino で allowlist 外の清算人がパーミッションド担保を実際に取れるのか。
   Superstate のドキュメントは**この論点に答えていない**
4. 既存の tier 設計（月額上限 USD 換算）と、attestation ベースの適格性が両立するか

## 順序の理由

0 → 1 → 3 → 2 → 4 → 5 でもよい。**#1 と #3 はどちらも小さく、#2 の前に済ませておくと
#2 の設計が決まる。**#2 を先に作ると、後から #1 / #3 に合わせて作り直すことになる。
