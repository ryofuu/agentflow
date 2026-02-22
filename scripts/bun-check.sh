#!/bin/bash

# 色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 標準入力からJSONを読み、file_pathを抽出
FILE=$(jq -r '.tool_input.file_path | select(endswith(".ts") or endswith(".tsx"))')

# 対象ファイルがなければ終了
if [ -z "$FILE" ]; then
  exit 0
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📁 対象ファイル: ${YELLOW}$FILE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Lint チェック
echo ""
echo -e "${BLUE}🔍 Lint チェック中...${NC}"
if bun lint "$FILE" 2>&1; then
  echo -e "${GREEN}✓ Lint OK${NC}"
else
  echo -e "${RED}✗ Lint エラー${NC}"
  exit 1
fi

# 型チェック
echo ""
echo -e "${BLUE}🔍 型チェック中...${NC}"
if bun typecheck 2>&1; then
  echo -e "${GREEN}✓ 型チェック OK${NC}"
else
  echo -e "${RED}✗ 型エラー${NC}"
  exit 1
fi

# テスト
echo ""
echo -e "${BLUE}🧪 テスト実行中...${NC}"
if bun test 2>&1; then
  echo -e "${GREEN}✓ テスト OK${NC}"
else
  echo -e "${RED}✗ テスト失敗${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ すべてのチェックが完了しました${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
