#!/bin/bash
cd ~/childcare360-app

echo "=== Disk check ==="
df -h .
echo ""
echo "=== data/ dir info ==="
ls -la data/ 2>/dev/null || echo "data/ missing"
stat data/ 2>/dev/null
echo ""
echo "=== Filesystem type ==="
stat -f -c %T data/ 2>/dev/null || df -T data/ 2>/dev/null

echo ""
echo "=== Testing SQLite write in /tmp ==="
node -e "
const Database = require('better-sqlite3');
try {
  const db = new Database('/tmp/test.db');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.close();
  console.log('✓ /tmp write works');
  require('fs').unlinkSync('/tmp/test.db');
} catch(e) { console.log('✗ /tmp failed:', e.message); }
" 2>/dev/null || node --input-type=module << 'JS'
import Database from 'better-sqlite3';
import fs from 'fs';
try {
  const db = new Database('/tmp/test.db');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.close();
  console.log('✓ /tmp write works');
  fs.unlinkSync('/tmp/test.db');
} catch(e) { console.log('✗ /tmp failed:', e.message); }
JS

echo ""
echo "=== Testing SQLite write in ~/childcare360-app/data ==="
node --input-type=module << 'JS'
import Database from 'better-sqlite3';
import fs from 'fs';
try {
  const db = new Database('/root/childcare360-app/data/test.db');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.close();
  console.log('✓ data/ write works');
  fs.unlinkSync('/root/childcare360-app/data/test.db');
} catch(e) { console.log('✗ data/ failed:', e.message); }
JS
