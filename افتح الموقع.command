#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
URL="http://127.0.0.1:5180/"

if curl -sf -o /dev/null --max-time 2 "$URL"; then
  open "$URL"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "قيفانتا" message "ثبّت Node.js من nodejs.org ثم افتح هذا الملف مرة ثانية."'
  exit 1
fi

if [ ! -d node_modules/vite ]; then
  echo "تثبيت المكتبات لأول مرة..."
  npm install || {
    osascript -e 'display alert "قيفانتا" message "تثبيت المكتبات ما اكتمل. تأكد من الإنترنت وحاول مرة ثانية."'
    exit 1
  }
fi

(
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null --max-time 1 "$URL"; then
      open "$URL"
      exit 0
    fi
    sleep 0.4
  done
  osascript -e 'display alert "قيفانتا" message "الخادم ما اشتغل. اترك نافذة الأوامر مفتوحة واقرأ الرسالة فيها."'
) &

echo "جاري تشغيل قيفانتا..."
echo "لا تقفل هذه النافذة. الموقع: $URL"
exec npm run dev
