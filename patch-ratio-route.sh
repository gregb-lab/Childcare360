#!/bin/bash
cd ~/childcare360-app

# Update package.json version
sed -i 's/"version": ".*"/"version": "2.6.0"/' package.json

# Wire ratio-report into server/index.js
if grep -q "ratio-report\|ratioReport" server/index.js; then
  echo "✓ Ratio report route already mounted"
else
  cp server/index.js server/index.js.bak3
  LAST_IMPORT=$(grep -n "^import " server/index.js | tail -1 | cut -d: -f1)
  sed -i "${LAST_IMPORT}a import ratioReportRouter from './ratio-report.js';" server/index.js
  LAST_MOUNT=$(grep -n "app\.use('/api/" server/index.js | tail -1 | cut -d: -f1)
  sed -i "${LAST_MOUNT}a app.use('/api/ratio-report', ratioReportRouter);" server/index.js
  echo "✓ /api/ratio-report route mounted"
  grep -n "ratioReport\|ratio-report" server/index.js
fi
