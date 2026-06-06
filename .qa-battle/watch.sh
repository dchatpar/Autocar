#!/bin/bash
# Battle-QA watch loop
# Re-runs critical checks every 5 minutes and appends to battle-qa-report.md

WORKSPACE="/workspace"
SNAPSHOT="/workspace/.qa-battle/snapshot-latest.txt"
REPORT="/workspace/battle-qa-report.md"
LOG="/workspace/.qa-battle/watch.log"

cd "$WORKSPACE" || exit 1

# Take a new snapshot
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.prisma" -o -name "*.css" -o -name "*.json" -o -name "*.md" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" \
  -not -path "*/.git/*" -not -path "*/.pnpm-store/*" \
  -printf "%T@ %p\n" 2>/dev/null | sort -n > "$SNAPSHOT"

# Detect changes from previous
if [ -f "/workspace/.qa-battle/snapshot-prev.txt" ]; then
  CHANGED=$(diff "/workspace/.qa-battle/snapshot-prev.txt" "$SNAPSHOT" 2>/dev/null | head -50)
  if [ -n "$CHANGED" ]; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Files changed:" >> "$LOG"
    echo "$CHANGED" >> "$LOG"
    echo "---" >> "$LOG"
  else
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] No changes" >> "$LOG"
  fi
fi
cp "$SNAPSHOT" "/workspace/.qa-battle/snapshot-prev.txt"

# Re-run prisma validate
if [ -f "$WORKSPACE/packages/db/prisma/schema.prisma" ]; then
  cd "$WORKSPACE/packages/db" && timeout 25 npx prisma validate >> "$LOG" 2>&1
  echo "---" >> "$LOG"
fi

# Re-run TypeScript check
if [ -f "$WORKSPACE/apps/web/tsconfig.json" ]; then
  cd "$WORKSPACE/apps/web" && timeout 25 npx tsc --noEmit >> "$LOG" 2>&1
  echo "--- ts EXIT $? ---" >> "$LOG"
fi
