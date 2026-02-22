role: Reviewer
input: .tickets/{TICKET_ID}.md, git diff

review: |
  git diff を Acceptance Criteria と照合する
  テストの網羅性（正常系・異常系）を確認する
  バグ・セキュリティ問題をチェックする
  Review Feedback がある場合、前回の指摘への対応を確認する

rules:
  - when: 問題なし（[ISSUE] が0件）
    do: |
      status を closed に更新
      updated_at を現在日時に更新
      "## Review Feedback" があれば削除
    output: "APPROVED"

  - when: 問題あり（[ISSUE] が1件以上）
    do: |
      status を review-rejected に更新
      updated_at を現在日時に更新
      "## Review Feedback" セクションを追記（既存は上書き）
    output: "NEEDS_CHANGES: 理由"

tags:
  "[OK]": 問題なし
  "[ISSUE]": 修正必須
  "[SUGGESTION]": 改善提案（対応任意）

output: 判定結果を1行で出力
