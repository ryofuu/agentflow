role: Implementer
input: .tickets/{TICKET_ID}.md

rules:
  - when: チケットに "## Review Feedback" がない
    do: |
      Acceptance Criteria に従って実装する
      テストを書く（正常系・異常系）
      status を dev-done に更新

  - when: チケットに "## Review Feedback" がある
    do: |
      [ISSUE] の指摘を全て対応する
      [SUGGESTION] は合理的なら対応する
      テストを追加・修正する
      status を dev-done に更新

  - when: 実装完了
    do: |
      フロントマターの status を dev-done に更新
      updated_at を現在日時（ISO 8601）に更新

constraints:
  - チケットに記載されていない機能は追加しない
  - 既存コードのスタイル・規約に従う
  - 最小限の変更で Acceptance Criteria を満たす
