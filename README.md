googlehome-lgtv
====

google-homeが音声インターフェースとなって、LG製(WebOS)のテレビコントロールを可能とします

## Requirement
googlehome-lgtv requires the following to run:

  * [Node.js][node] 8.0+
  * [npm][npm] (normally comes with Node.js)
  * [firebase-admin]

## Usage

事前に以下サービスへの登録が必要となります。
- (必須)IFTTT
  - google homeと連携し、firebase(webhook)経由で **googlehome-lgtv** を呼ぶ出します
- (任意)firebase
  - 更新時の通知を利用して、**googlehome-lgtv** の機能を呼び出すために使用します

各サービスのフローは以下の通りです。
- ###### googlehomeからテレビへのコントロール
  - [googlehome] -> [ifttt] -> [firebase] -> **[googlehome-lgtv]** -> [テレビ]

##### appconfig.jsonの作成
サービスを起動するには以下の情報が必要となります。
- firebase
  - サービスアカウントで発行する秘密鍵
  - DatabaseのURL
- LGテレビ
  - WebSocketで通信するURL
  - MACアドレス

上記情報を含んだ **appconfig.json** をルートに配置してください。
appconfig.json
```json
{
  "FIREBASE_SERVICEACCOUNT_PRIVATEKEY": "○○○○○○○○○.json",
  "FIREBASE_DATABASE_URL": "https://○○○○○○○○○.firebaseio.com/",
  "TV_URL": "ws://192.168.0.1:3000",
  "TV_MAC": "XX:XX:XX:XX:XX"
}
```

詳細のサービス連携の使用方法は以下を参照してください。

https://qiita.com/nk-tamago/items/37d1a4eee3b695f45197
