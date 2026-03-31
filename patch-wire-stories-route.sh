#!/bin/bash
cd ~/childcare360-app

# Check if already wired
if grep -q "weekly-stories\|weeklyStories" server/index.js; then
  echo "Stories route already mounted in server/index.js"
  exit 0
fi

cp server/index.js server/index.js.bak2

# Find last import line and add after it
LAST_IMPORT=$(grep -n "^import " server/index.js | tail -1 | cut -d: -f1)
sed -i "${LAST_IMPORT}a import weeklyStoriesRouter from './weekly-stories.js';" server/index.js

# Find last app.use('/api/ line and add after it
LAST_MOUNT=$(grep -n "app\.use('/api/" server/index.js | tail -1 | cut -d: -f1)
sed -i "${LAST_MOUNT}a app.use('/api/stories', weeklyStoriesRouter);" server/index.js

echo "✓ /api/stories route mounted"
grep -n "weeklyStories\|weekly-stories" server/index.js
