#!/bin/bash
# Run this on the VM: bash patch-fix-portals-stories.sh
# Fixes: staff_portal/parent_portal render mismatch + adds stories nav + PortalEmulator

cd ~/childcare360-app
cp src/App.jsx src/App.jsx.bak2
echo "Backup: src/App.jsx.bak2"

# ── Fix 1: render block "staff" → "staff_portal" to match navGroups item id ──
sed -i 's/{activeTab === "staff" && <StaffPortalModule \/>}/{activeTab === "staff_portal" \&\& <StaffPortalModule \/>}/' src/App.jsx
echo "✓ Fixed staff render block"

# ── Fix 2: render block "parent" → "parent_portal" ──
sed -i 's/{activeTab === "parent" && <ParentPortalModule \/>}/{activeTab === "parent_portal" \&\& <ParentPortalModule \/>}/' src/App.jsx
echo "✓ Fixed parent render block"

# ── Fix 3: Add PortalEmulator state + import + overlay + wrap portal renders ──
# Check if PortalEmulator is already imported
if ! grep -q "PortalEmulator" src/App.jsx; then
  # Add import after last local module import
  sed -i '/^import StaffPortalModule/a import PortalEmulator from "./PortalEmulator.jsx";' src/App.jsx
  echo "✓ Added PortalEmulator import"
fi

# Add state variables after sidebarCollapsed useState
if ! grep -q "showPortalEmulator" src/App.jsx; then
  sed -i '/const \[sidebarCollapsed/i \  const [showPortalEmulator, setShowPortalEmulator] = useState(false);\n  const [portalEmulatorMode,  setPortalEmulatorMode]  = useState("parent");' src/App.jsx
  echo "✓ Added portal emulator state"
fi

# ── Fix 4: Wrap staff_portal render to launch PortalEmulator instead ──
sed -i 's/{activeTab === "staff_portal" && <StaffPortalModule \/>}/{activeTab === "staff_portal" \&\& <PortalEmulator mode="staff" onClose={() => setActiveTab("dashboard")} \/>}/' src/App.jsx
sed -i 's/{activeTab === "parent_portal" && <ParentPortalModule \/>}/{activeTab === "parent_portal" \&\& <PortalEmulator mode="parent" onClose={() => setActiveTab("dashboard")} \/>}/' src/App.jsx
echo "✓ Portal renders now use PortalEmulator with child/educator selector"

# ── Fix 5: Add "stories" to validTabs ──
sed -i 's/"medication_register","learning_journey","incidents"\]/"medication_register","learning_journey","incidents","stories"\]/' src/App.jsx
echo "✓ stories added to validTabs"

# ── Fix 6: Add WeeklyStoryModule import ──
if ! grep -q "WeeklyStoryModule" src/App.jsx; then
  sed -i '/^import StaffPortalModule/a import WeeklyStoryModule from "./WeeklyStoryModule.jsx";' src/App.jsx
  echo "✓ WeeklyStoryModule import added"
fi

# ── Fix 7: Add stories render block after the waitlist line ──
if ! grep -q '"stories"' src/App.jsx; then
  sed -i '/{activeTab === "waitlist" && <WaitlistModule/a\          {activeTab === "stories" && <WeeklyStoryModule />}' src/App.jsx
  echo "✓ WeeklyStoryModule render block added"
fi

# ── Fix 8: Add stories to navGroups ──
# Find the wellbeing nav item and add stories after it
# The navGroups use: { id: "wellbeing", label: "Staff Wellbeing", icon: "dashboard" }
if ! grep -q '"stories"' src/App.jsx; then
  sed -i '/{ id: "wellbeing",.*label:.*"Staff Wellbeing"/a\        { id: "stories",   label: "✨ Weekly Stories",   icon: "star" },' src/App.jsx
  echo "✓ Stories nav item added to navGroups"
fi

echo ""
echo "All patches applied. Building..."
npx vite build && echo "✅ Build successful" || echo "❌ Build failed — check errors above"
