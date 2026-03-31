#!/bin/bash
cd ~/childcare360-app
echo "=== Server log ==="
cat childcare360.log
echo ""
echo "=== Is server running? ==="
lsof -i:3003 2>/dev/null || echo "Nothing on port 3003"
