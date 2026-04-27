# 整備予定 担当者順序変更ツール

整備予定スケジュール画面の担当者表示順（SEQ）をドラッグ＆ドロップで変更するデスクトップアプリです。

---

## ファイル構成

```
SeibiYoteiReorder/
├── main.js              # Electron メインプロセス
├── preload.js           # コンテキストブリッジ
├── index.html           # UI
├── renderer.js          # レンダラープロセス（UI ロジック）
├── styles.css           # スタイル
├── test.js              # DB 接続テスト（node test.js で実行）
├── .env                 # DB 接続情報（Git 管理外・要作成）
├── .env.example         # .env のテンプレート
└── src/
    ├── db.js            # DB 接続モジュール
    ├── queries.js       # SQL クエリ定義（★テーブル名はダミー）
    ├── logger.js        # Winston ロガー
    └── ipcHandlers.js   # IPC ハンドラ
```

---

## セットアップ（開発環境）

### 1. Node.js インストール

Node.js 20.x 以上を推奨します。

### 2. パッケージインストール

```bash
npm install
```

### 3. .env ファイルを作成

`.env.example` をコピーして `.env` を作成し、実際の DB 接続情報を入力します。

```bash
copy .env.example .env
```

`.env` の内容：

```
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your_db_host
DB_PORT=1521
DB_SERVICE=your_service_name
KAISHA_CD=2
```

### 4. クエリのテーブル名を実際のものに変更

`src/queries.js` を開き、ダミーのテーブル名を実際のテーブル名に変更します。

```
MST_BRANCH     → 実際のテーブル名
MST_EMPLOYEE   → 実際のテーブル名
MST_BRANCH_EMP → 実際のテーブル名
```

変更後は `src/ipcHandlers.js` のカラム名マッピングも確認・修正してください。

### 5. DB 接続テスト

```bash
npm run test-db
# または
node test.js
```

`✔ 接続成功` と表示されれば OK です。

### 6. アプリ起動

```bash
npm start
```

---

## 使い方

1. 起動すると支店セレクトボックスが表示されます
2. 支店を選択すると、SEQ 順に担当者が左から右に表示されます
3. 担当者カードをドラッグして並び替えます
   - カードの左半分にドロップ → その前に挿入
   - カードの右半分にドロップ → その後に挿入
   - オレンジ枠のカードは「未保存の移動あり」を示します
4. **保存** ボタンを押すと DB の SEQ が更新されます
5. **終了** ボタンでアプリを終了します

### SEQ 更新ロジック

保存時、移動した担当者のみ SEQ を更新します（移動していない担当者の SEQ は変更しません）。

- 移動後の位置が先頭の場合：`新SEQ = 元の先頭担当者のSEQ - 1`（最小値: 1）
- それ以外：`新SEQ = 左隣担当者の元のSEQ + 1`

---

## exe 化（配布用）

### ビルド

```bash
npm run build
```

`dist/` フォルダにインストーラー（NSIS）が生成されます。

### 配布時の設定

ビルド前に `.env` に本番の DB 接続情報を設定してください。  
ビルドすると `.env` は `resources/.env` として exe と同梱されます。

> **注意:** `.env` にはパスワードが含まれます。exe の配布先・保管場所に注意してください。

---

## ログ

| 環境 | ログ出力先 |
|------|-----------|
| 開発時 | コンソール + `logs/combined.log` / `logs/error.log` |
| exe 実行時 | `%APPDATA%\整備予定担当者順序変更\logs\` |

ログファイルはローテーションされます（最大 10MB × 5 世代）。

---

## 動作要件

| 項目 | 要件 |
|------|------|
| OS | Windows 10 / 11 (64bit) |
| Node.js | 20.x 以上（開発時のみ） |
| Oracle DB | 12.1 以上 |
| Oracle Client | 不要（thin モード動作） |

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| 支店が表示されない | `.env` の接続情報を確認。`node test.js` で接続テスト |
| `NJS-515` エラー | DB_HOST / DB_PORT / DB_SERVICE を確認 |
| `ORA-01017` エラー | DB_USER / DB_PASSWORD を確認 |
| 社員が表示されない | `src/queries.js` のテーブル名・カラム名を確認 |
| ログを確認したい | `%APPDATA%\整備予定担当者順序変更\logs\combined.log` を参照 |
