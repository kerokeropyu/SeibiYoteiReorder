# ファイル構成と処理の詳細

このドキュメントは、コードを初めて読む人・将来の自分がメンテナンスできるよう、  
各ファイルの役割と処理の流れを詳しく解説したものです。

---

## 1. Electron の基本構造（前提知識）

Electron アプリは「2種類のプロセス」で動いています。この概念を最初に理解しておくと、  
各ファイルの役割が把握しやすくなります。

```
┌─────────────────────────────────────────────────────────┐
│  メインプロセス (main.js)                                │
│  ・Node.js として動く（ファイル読み書き・DB接続・OS操作）  │
│  ・ウィンドウの生成・管理を担当                          │
│  ・DBへのアクセスはここで行う                            │
└────────────────────┬────────────────────────────────────┘
                     │ IPC通信（Inter-Process Communication）
                     │ ← メッセージのやり取り →
┌────────────────────┴────────────────────────────────────┐
│  レンダラープロセス (renderer.js + index.html)           │
│  ・ブラウザとして動く（画面表示・ユーザー操作）           │
│  ・セキュリティ上、直接 Node.js の機能は使えない          │
│  ・preload.js 経由で安全に main と通信する               │
└─────────────────────────────────────────────────────────┘
```

**なぜこの構造か？**  
ブラウザ（レンダラー）に直接 DB 接続などの権限を与えると、  
Web ページの悪意あるスクリプトが PC を操作できてしまうため、  
セキュリティ上の理由でプロセスを分離しています。

---

## 2. ファイル一覧と役割

```
main.js            アプリの起動・ウィンドウ管理（メインプロセス）
preload.js         2つのプロセスをつなぐ橋（セキュリティの壁）
index.html         画面のHTML骨格
renderer.js        画面の動き・DnDロジック（レンダラープロセス）
styles.css         デザイン・見た目
src/
  db.js            Oracle DB への接続処理
  queries.js       SQL文の定義（テーブル名はダミー）
  ipcHandlers.js   IPC通信のサーバー側処理
  logger.js        ログ出力の設定
test.js            DB接続テスト用スクリプト（Electron不要）
```

---

## 3. 各ファイルの詳細

---

### `main.js` ― アプリの起点

**プロセス:** メインプロセス  
**役割:** アプリ全体の起動・ウィンドウ生成・IPC ハンドラの登録

#### 処理の流れ

```
1. dotenv で .env を読み込む（DB接続情報をメモリに展開）
2. logger / ipcHandlers を require で読み込む
3. app.whenReady() でアプリ準備完了を待つ
4. registerIpcHandlers() でDB操作のIPC受け口を登録
5. createWindow() でブラウザウィンドウを生成
```

#### ポイント：.env の読み込み先

```javascript
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')  // exe配布版
  : path.resolve(__dirname, '.env');           // 開発版（プロジェクト直下）
```

`app.isPackaged` が `true` のときは exe としてビルドされた状態。  
この場合、.env は exe 横の `resources/.env` を参照します。

#### ポイント：ウィンドウのセキュリティ設定

```javascript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'), // 橋渡しスクリプトを指定
  contextIsolation: true,   // レンダラーとメインを完全分離（セキュリティ）
  nodeIntegration: false,   // レンダラーで直接 Node.js を禁止（セキュリティ）
}
```

`contextIsolation: true` + `nodeIntegration: false` が現代 Electron の  
セキュリティのベストプラクティスです。

---

### `preload.js` ― 2プロセス間の橋

**プロセス:** メインプロセスとレンダラープロセスの境界  
**役割:** レンダラーが安全に呼べる関数だけを公開する「窓口」

#### 処理の流れ

```
contextBridge.exposeInMainWorld() で renderer.js から呼べる関数を登録
  → window.dbAPI.getBranches()    : 支店一覧の取得
  → window.dbAPI.getEmployees()   : 社員一覧の取得
  → window.dbAPI.saveOrder()      : SEQ保存
  → window.appAPI.quit()          : アプリ終了
```

#### IPC の仕組み

```
renderer.js                preload.js               main.js / ipcHandlers.js
    |                          |                            |
    | window.dbAPI.getBranches()                           |
    |------------------------->|                            |
    |         ipcRenderer.invoke('get-branches')           |
    |                          |--------------------------->|
    |                          |     ipcMain.handle('get-branches', ...)
    |                          |       → DBを検索して結果を返す
    |                          |<---------------------------|
    |<-------------------------|                            |
    | { success: true, data: [...] }
```

`ipcRenderer.invoke()` は Promise を返す非同期通信です。  
renderer.js では `await window.dbAPI.getBranches()` のように使います。

#### なぜ preload が必要か

レンダラーに直接 `require('electron')` を許すと、  
`ipcRenderer` を通じて任意の IPC チャンネルを呼べてしまいます。  
preload.js で「呼んでいいチャンネル」だけを絞って公開することで安全にしています。

---

### `index.html` ― 画面のHTML骨格

**プロセス:** レンダラープロセス  
**役割:** UI の HTML 構造定義。ロジックは持たず、構造のみ記述。

#### 画面構成

```
#header
  ├── h1 タイトル
  └── #branch-area （支店セレクト＋再読み込みボタン）
#message-area （エラー・成功メッセージ表示欄）
#employee-container
  ├── #placeholder-text （支店未選択時のメッセージ）
  └── #employee-list （社員カードが横並びで入る）
#footer
  ├── #status-text （「○名」「読み込み中...」等）
  └── #footer-buttons
       ├── #save-btn
       └── #quit-btn
```

#### CSP（Content Security Policy）設定

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'" />
```

`'self'` のみ許可 = 同じフォルダ内のファイルのみ読み込み可能。  
外部 CDN や `<script>` タグ内のインラインスクリプトは全てブロックされます。  
これにより XSS 攻撃を防いでいます。

---

### `renderer.js` ― 画面のロジック全体

**プロセス:** レンダラープロセス  
**役割:** UI 操作・ドラッグ＆ドロップ・API 呼び出し・画面の状態管理

#### 状態変数

| 変数 | 型 | 内容 |
|------|----|------|
| `currentShitenCd` | string | 現在選択中の支店コード |
| `originalEmployees` | 配列 | DB から読んだ元データ `[{shainCd, shainNm, seq}]` |
| `currentOrder` | 配列 | 現在の表示順（DnD で入れ替わる） |
| `movedSet` | Set | 移動済み社員の shainCd の集合 |
| `dragSrcIndex` | number | ドラッグ開始時のカードのインデックス |

`originalEmployees` は保存時の「元のSEQ」参照に使うため、DnD で変更しません。  
`currentOrder` だけが DnD によって並び替えられます。

#### 処理の流れ（起動時）

```
loadBranches()
  → window.dbAPI.getBranches() を呼ぶ
  → 成功: <select> に <option> を追加
  → 失敗: エラーメッセージ表示
```

#### 処理の流れ（支店選択時）

```
branchSelect の change イベント
  → currentShitenCd を更新
  → loadEmployees(shitenCd)
      → window.dbAPI.getEmployees() を呼ぶ
      → originalEmployees と currentOrder に結果をセット
      → movedSet をリセット（新しい支店なので移動記録をクリア）
      → renderList() で画面に描画
```

#### ドラッグ＆ドロップの処理

```
dragstart
  ├── movedSet.size >= 1 なら preventDefault() で即キャンセル（1人制限）
  └── dragSrcIndex = ドラッグ元のインデックスを記録

dragover（ドラッグ中にカードの上を通過）
  └── マウス位置がカードの左半分 → drop-left スタイル（左挿入の予告）
      マウス位置がカードの右半分 → drop-right スタイル（右挿入の予告）

drop
  ├── ドラッグ元を currentOrder から取り出す（splice）
  ├── 挿入位置を計算（左右判定 + インデックスずれを補正）
  ├── currentOrder に挿入（splice）
  ├── movedSet に shainCd を追加
  └── renderList() で再描画
```

#### 挿入位置のインデックス補正

```javascript
// dragSrcIndex より後ろのカードにドロップした場合、
// splice で取り出した後インデックスが1つずれるため補正が必要
let insertAt = dragSrcIndex < targetIndex ? targetIndex - 1 : targetIndex;
if (insertAfter) insertAt += 1;  // カードの右半分にドロップ
```

#### 保存時の SEQ 計算ロジック

```
movedSet に含まれる社員だけをループ
  → 先頭（index=0）に移動した場合:
       新SEQ = max(1, 元の先頭社員のSEQ - 1)
  → それ以外:
       新SEQ = 左隣社員の「元のSEQ」(originalEmployees から取得) + 1

→ window.dbAPI.saveOrder() に [{shainCd, newSeq}, ...] を渡す
→ 成功: loadEmployees() で再読み込み（movedSet リセット・ロック解除）
→ 失敗: エラーメッセージ表示、保存ボタン再活性
```

**なぜ「元のSEQ」を使うか**  
「隣の社員が移動済みの場合でも、DB の値（元のSEQ）を基準にする」という  
ユーザー要件のため。これにより更新は移動した社員のみで、他は触らない。

---

### `styles.css` ― デザイン・スタイル

**役割:** 全 UI 要素の見た目定義。ロジックは持たない。

#### レイアウト構造

```
body（height: 100vh, overflow: hidden）
└── #app（flex column, height: 100%）
     ├── #header（flex-shrink: 0 → 縮まない）
     ├── #message-area（flex-shrink: 0 → 縮まない）
     ├── #employee-container（flex: 1 → 残りを全部使う）
     │    └── #employee-list（flex row, nowrap → 横スクロール）
     └── #footer（flex-shrink: 0 → 縮まない）
```

`flex: 1` を employee-container に与えることで、  
ヘッダー・フッターの高さに関わらず、社員カードエリアが残りスペースを占有します。

#### 主な CSS クラス（renderer.js が動的に付与）

| クラス | 付与タイミング | 効果 |
|--------|--------------|------|
| `.dragging` | ドラッグ中の元カード | 半透明化 |
| `.modified` | 移動済みの社員カード | オレンジ枠（未保存を示す）|
| `.locked` | 1人移動後の他のカード | グレーアウト・操作不可を示す |
| `.drop-left` | ドラッグオーバー時（左半分）| 左に赤い縁 |
| `.drop-right` | ドラッグオーバー時（右半分）| 右に赤い縁 |

---

### `src/db.js` ― DB 接続モジュール

**プロセス:** メインプロセス（src/ 以下は全てメインプロセスから require される）  
**役割:** Oracle への接続処理を一元管理する

#### 処理の詳細

```javascript
// thin モード = Oracle Instant Client (クライアントソフト) 不要
// oracledb.initOracleClient() を呼ばない = thin モードで動作
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// → クエリ結果が { SHAIN_CD: '001', SHAIN_NM: '山田' } 形式になる
//   （デフォルトは配列形式 ['001', '山田']）
```

#### `getConnection()` 関数

```
.env から接続情報を取得
  → DB_USER / DB_PASSWORD / DB_HOST / DB_PORT / DB_SERVICE
  → いずれか欠けていたら Error を throw（早期に問題を検出）
oracledb.getConnection() で接続を確立して返す
```

接続は呼び出し元（ipcHandlers.js）で使い終わったら `conn.close()` する責任があります。

#### `executeQuery()` 関数

```
getConnection() で接続を取得
conn.execute(sql, params, options) でクエリを実行
finally ブロックで必ず conn.close() を呼ぶ
  （成功でもエラーでも接続を閉じてリソースを解放する）
```

SELECT 系のシンプルなクエリはこちらを使います。  
UPDATE のようにトランザクション管理が必要な場合は、  
ipcHandlers.js 側で `getConnection()` を直接使い、commit/rollback を制御します。

---

### `src/queries.js` ― SQL 文の定義

**役割:** アプリ内で使う全 SQL を一か所にまとめた定数ファイル

#### ★ デプロイ前に変更が必要

ファイル冒頭のコメントに書かれているダミーのテーブル名を実際のものに変更してください。

| ダミー名 | 実際のテーブル名 |
|----------|-----------------|
| `MST_BRANCH` | `mst_shiten` など |
| `MST_EMPLOYEE` | `mst_shain` など |
| `MST_BRANCH_EMP` | `mst_shiten_shain` など |

変更後、`src/ipcHandlers.js` のカラム名マッピングも確認してください。

#### `BRANCH_SELECT`

支店セレクトボックス用。`kaisha_cd` と `seq > 0` で絞り込み。

#### `EMPLOYEE_SELECT`

支店を指定して社員を取得。  
LEFT JOIN の ON 句に `seq > 0` と有効期限チェックを入れることで、  
「その支店に所属していない」または「期限切れ」の社員は JOIN が NULL になり、  
WHERE の `shiten_cd = :shitenCd` で除外されます。

```sql
-- LEFT JOIN の ON 句で絞り込む理由:
-- WHERE に書くと LEFT JOIN が INNER JOIN と同じ動作になってしまうため。
-- ON 句に書けば、条件を満たさない行は NULL JOIN となり WHERE で除去できる。
```

#### `EMPLOYEE_SEQ_UPDATE`

社員1人分の SEQ を更新する UPDATE 文。  
移動した社員の数だけ、ipcHandlers.js からループで呼ばれます。

---

### `src/ipcHandlers.js` ― IPC の受け口（サーバー側）

**プロセス:** メインプロセス  
**役割:** renderer.js からの IPC リクエストを受け取り、DB 処理を実行して結果を返す

#### 登録されている IPC チャンネル

| チャンネル名 | 処理内容 |
|-------------|---------|
| `get-branches` | 支店一覧を SELECT して返す |
| `get-employees` | 指定支店の社員一覧を SELECT して返す |
| `save-order` | 移動した社員の SEQ を UPDATE（トランザクション） |
| `quit-app` | アプリを終了する |

#### データの正規化（Oracle → renderer）

Oracle は列名を大文字で返します（`SHAIN_CD`, `SHAIN_NM` 等）。  
ipcHandlers.js でキャメルケースに変換してから renderer に送ることで、  
renderer.js 側のコードを書きやすくしています。

```javascript
// Oracle が返す形式               → renderer に渡す形式
{ SHAIN_CD: '001', SHAIN_NM: '山田', SEQ: 1 }
          ↓ map()
{ shainCd: '001', shainNm: '山田', seq: 1 }
```

テーブル名やカラム名を変更した場合は、この map の部分も合わせて修正します。

#### `save-order` のトランザクション

```
getConnection() で接続を1つ取得
ループ: updates の社員1人ずつ execute(EMPLOYEE_SEQ_UPDATE, ...)
全員成功: conn.commit() でまとめて確定
途中で失敗: conn.rollback() で全件取り消し
              → renderer に { success: false, error: ... } を返す
finally: conn.close() で必ず接続を解放
```

複数人の更新を1つのトランザクションにまとめることで、  
「何件かだけ更新されて残りが失敗する」という中途半端な状態を防いでいます。

---

### `src/logger.js` ― ロガー設定

**役割:** アプリ全体で共通して使うログ出力の設定  
**使用ライブラリ:** [winston](https://github.com/winstonjs/winston)

#### ログの出力先

| 環境 | コンソール | ファイル |
|------|----------|---------|
| 開発時（npm start）| ✔ 出力 | `logs/combined.log` `logs/error.log` |
| exe 実行時 | - | `%APPDATA%\整備予定担当者順序変更\logs\` |

#### ログレベル

| レベル | 用途 |
|--------|------|
| `info` | 通常動作の記録（処理開始・完了・件数など） |
| `error` | エラー発生時（エラーメッセージ・スタックトレース） |

#### ログファイルのローテーション

- `combined.log`: 最大 10MB × 5 世代
- `error.log`: 最大 5MB × 3 世代

古いログは自動削除されるため手動整理は不要です。

#### Electron 環境の検出

```javascript
function getLogDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'logs'); // Electron 環境
    }
  } catch (_) {}
  return path.join(__dirname, '..', 'logs'); // 通常 Node.js（test.js 等）
}
```

`require('electron')` を try/catch で囲んでいる理由:  
`node test.js` のように通常の Node.js で実行した場合、  
`require('electron')` は文字列（electron の実行ファイルパス）を返すため、  
`app.getPath` が存在せず TypeError になります。  
catch することで test.js でも安全にインポートできます。

---

### `test.js` ― DB 接続テストスクリプト

**プロセス:** 通常の Node.js（Electron 不使用）  
**役割:** `npm start` せずに DB 接続だけを単独でテストする

#### 使い方

```bash
node test.js
```

#### 処理の流れ

```
.env を読み込む（プロジェクト直下）
環境変数の存在チェック（不足していれば終了）
oracledb.getConnection() で接続
SELECT SYSDATE FROM DUAL を実行（接続確認用の最小クエリ）
SYSDATE を表示して終了
```

`SELECT SYSDATE FROM DUAL` は Oracle 固有の「何も返さない最小クエリ」で、  
DB に接続さえできれば必ず成功します。接続確認の定番です。

---

## 4. データの流れ（全体シーケンス）

### 支店選択から社員表示まで

```
renderer.js                    ipcHandlers.js         db.js           Oracle DB
    |                               |                   |                |
    | window.dbAPI.getEmployees()   |                   |                |
    |------------------------------>|                   |                |
    |          ipcRenderer.invoke('get-employees', shitenCd)            |
    |                               | executeQuery()    |                |
    |                               |------------------>|                |
    |                               |        getConnection()            |
    |                               |                   |--------------->|
    |                               |                   |  接続確立      |
    |                               |                   |<---------------|
    |                               |        conn.execute(EMPLOYEE_SELECT)
    |                               |                   |--------------->|
    |                               |                   |   結果セット   |
    |                               |                   |<---------------|
    |                               |        conn.close()               |
    |                               |<------------------|                |
    |          rows を map() でキャメルケースに変換                      |
    |<------------------------------|                   |                |
    | { success: true, data: [...] }                    |                |
    renderList() で画面描画
```

### SEQ保存

```
renderer.js                    ipcHandlers.js         db.js           Oracle DB
    |                               |                   |                |
    | window.dbAPI.saveOrder(       |                   |                |
    |   shitenCd, updates)          |                   |                |
    |------------------------------>|                   |                |
    |                               | getConnection()   |                |
    |                               |------------------>|                |
    |                               |                   |--------------->|
    |                               |                   |  接続確立      |
    |                               |                   |<---------------|
    |                               |<------------------|                |
    |                               |                                    |
    |                               | (updates をループ)                 |
    |                               | conn.execute(EMPLOYEE_SEQ_UPDATE)  |
    |                               |----------------------------------->|
    |                               | conn.execute(...)  ← 必要な分だけ  |
    |                               |----------------------------------->|
    |                               | conn.commit()                      |
    |                               |----------------------------------->|
    |                               |  コミット完了                      |
    |                               |<-----------------------------------|
    |                               | conn.close()                       |
    |<------------------------------|                   |                |
    | { success: true }                                 |                |
    loadEmployees() で再読み込み
```

---

## 5. メンテナンス時のよくある変更箇所

### 支店コード（会社コード）を変えたい

`.env` の `KAISHA_CD` の値を変更します。コードは変更不要です。

### テーブル名・カラム名を変更したい

1. `src/queries.js` の SQL を修正
2. `src/ipcHandlers.js` の `map()` 部分のキー名を修正（Oracle の列名は大文字）

### 社員カードのデザインを変えたい

`styles.css` の `.employee-card` 関連クラスを編集します。

### ログレベルや保存先を変えたい

`src/logger.js` の `winston.createLogger()` の設定を変更します。

### 1人制限を解除して複数人移動を許可したい

`renderer.js` の以下の2箇所を変更します：

```javascript
// onDragStart の冒頭（この if を削除またはコメントアウト）
if (movedSet.size >= 1) {
  e.preventDefault();
  return;
}

// renderList の isLocked（常に false にする）
const isLocked = false; // movedSet.size >= 1; を変更
```

あわせて保存時の SEQ 計算が複数人対応になっているか確認してください。
