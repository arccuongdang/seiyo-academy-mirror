#!/usr/bin/env bash
set -euo pipefail

# ==========
# Config bạn có thể chỉnh
# ==========
BRANCH="main"
MSG="chore: publish 251013_v3 – sync origin+mirror & deploy vercel"
TAG="v251013_v3"

# ==========
# Kiểm tra repo & branch
# ==========
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Không ở trong git repo."; exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$BRANCH" ]; then
  echo "ℹ️  Đang ở branch '$current_branch' → checkout '$BRANCH'"
  git checkout "$BRANCH"
fi

# ==========
# Kiểm tra remote
# ==========
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ Chưa có remote 'origin'."; exit 1
fi
if ! git remote get-url mirror >/dev/null 2>&1; then
  echo "❌ Chưa có remote 'mirror'. Hãy thêm:"
  echo "   git remote add mirror https://github.com/arccuongdang/seiyo-academy-mirror.git"
  exit 1
fi

echo "🔗 origin: $(git remote get-url origin)"
echo "🔗 mirror: $(git remote get-url mirror)"

# ==========
# Pull cập nhật mới nhất trước khi commit (tránh diverge)
# ==========
echo "⬇️  Pull latest from origin/$BRANCH"
git pull --rebase origin "$BRANCH"

# ==========
# Add + Commit + Tag
# ==========
echo "➕ Stage toàn bộ thay đổi"
git add -A

if ! git diff --cached --quiet; then
  echo "📝 Commit: $MSG"
  git commit -m "$MSG"
else
  echo "ℹ️  Không có thay đổi để commit (working tree sạch)."
fi

# Tạo tag (idempotent): nếu đã tồn tại thì bỏ qua
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "🏷️  Tag '$TAG' đã tồn tại — bỏ qua tạo tag."
else
  echo "🏷️  Tạo tag '$TAG'"
  git tag "$TAG"
fi

# ==========
# Push lên origin + mirror
# ==========
echo "🚀 Push lên origin ($BRANCH + tags)"
git push origin "$BRANCH" --follow-tags

echo "🚀 Push lên mirror ($BRANCH + tags)"
git push mirror "$BRANCH" --follow-tags

# ==========
# Build local (optional)
# ==========
echo "🧪 Kiểm tra build local (npm run build)"
if [ -f package.json ]; then
  npm run build || { echo "❌ Build lỗi. Dừng trước khi deploy Vercel."; exit 1; }
else
  echo "⚠️  Không thấy package.json — bỏ qua bước build local."
fi

# ==========
# Deploy Vercel (production)
# YÊU CẦU: đã login `vercel login` và link dự án `vercel link`
# ==========
if command -v vercel >/dev/null 2>&1; then
  echo "🌐 Deploy Vercel (prod)…"
  vercel --prod --confirm
  echo "✅ Deploy Vercel xong."
else
  echo "⚠️  Không tìm thấy CLI 'vercel'. Cài bằng:"
  echo "   npm i -g vercel"
  echo "   vercel login"
  echo "   vercel link"
  echo "Rồi chạy lại: ./publish.sh"
fi

echo "🎉 Hoàn tất."
