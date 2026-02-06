# Project Updates & Changelog

## January 2026 - Game Tracker Enhancements

### 1. Action History System
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`, `frontend/game.html`, `frontend/css/shared.css`

**Changes:**
- Implemented comprehensive action logging system under each player's card
- Each action displays with timestamp in MM:SS format (game time)
- Actions include detailed descriptions: "3PT Made", "2PT Missed", "FT Made", "Foul"
- Added three interactive buttons per action:
  - **Add Note**: Prompt for custom text elaboration (pencil icon)
  - **Highlight**: Toggle star icon for important plays
  - **Delete**: Remove action with confirmation dialog (X icon)

**Implementation Details:**
```javascript
// State structure
state.actionHistory = {
  A: [{ id, label, type, timeLabel, gameSeconds, highlighted, note }],
  B: [{ id, label, type, timeLabel, gameSeconds, highlighted, note }]
}

// Key functions
addActionEntry(teamKey, entry)
renderActionLog(teamKey)
escapeHtml(text) // XSS prevention for notes
formatGameTime(seconds) // MM:SS conversion
```

**UI Improvements:**
- Action cards with clean border and padding
- Notes displayed with left border and darker text
- Highlighted actions show filled star icon instead of star outline
- Proper spacing and visual hierarchy
- Responsive layout with good contrast

---

### 2. Zone Detection & Customization
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`, `frontend/game.html`, `frontend/css/shared.css`

**Phase 1: Zone Accuracy**
- Fixed 2PT zone detection to match visual representation exactly
- Updated detection logic to check rectangular 2PT zone (38-62% height, 86% width)
- Added semicircle detection at 38% from top
- Ensured 2PT zones take priority over 3PT in detection hierarchy

**Phase 2: Semicircle Customization**
- Added CSS variables for all semicircle parameters:
  ```css
  --semicircle-top: 38%;
  --semicircle-left: 50%;
  --semicircle-width: 86%;
  --semicircle-height: 29%;
  --semicircle-border-width: 2px;
  --semicircle-opacity: 0.15;
  ```

**Phase 3: Advanced Shape Control**
- Implemented clip-path polygon with 9 customizable points
- Variables: `--clip-p1` through `--clip-p9`
- Allows precise curve adjustments to match actual court lines
- Each point can be moved independently for perfect fit

**Phase 4: Zone Hiding**
- Set all zone overlays to `display: none`
- Detection logic still fully functional
- Clean court view without visual guides
- Zones remain for internal shot type determination

**Detection Functions:**
```javascript
inferShotTypeFromClick(evt) // From mouse click event
inferShotTypeFromPos(pos)   // From {xPct, yPct} coordinates
```

---

### 3. Shot & Foul Markers
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`, `frontend/css/shared.css`

**Shot Markers:**
- Display player initials on court at exact click location
- Color-coded by team and result (made = solid, missed = outlined)
- Positioned using percentage coordinates for responsive scaling
- Team A: Blue theme, Team B: Red theme
- Hover effects with scale transform

**Foul Markers:**
- Display warning symbol (⚠) at exact cursor position to distinguish fouls from shots
- Orange border (3px) with team-specific box-shadow glow
- 20px circular markers with hover scale effect
- Position calculated from `lastCursorPos` at time of foul
- Unique visual identifier separate from shot markers

**Marker Creation:**
```javascript
addShotMarker(teamKey, shotType, result, pos)
addFoulMarker(teamKey, pos)
```

**Marker Removal:**
- Stored in `state.history[].marker` reference
- Automatically removed on undo via `marker.remove()`
- DOM cleanup ensures no orphaned elements

**Free Throw Exception:**
- Free throws do NOT create court markers
- Still logged in action history
- Still update score normally
- Allows logging without cursor position requirement

---

### 4. Undo Functionality
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`

**Complete State Restoration:**
- Removes last entry from `state.history`
- Restores score/statistics (shots, fouls)
- Removes visual marker from court (shot or foul)
- Removes action from `state.actionHistory`
- Updates all UI elements (score, stats, action log)

**Implementation:**
```javascript
undoLast() {
  const last = state.history.pop();
  if (last.kind === 'shot') {
    // Restore shot stats
    if (last.marker) last.marker.remove();
  }
  if (last.kind === 'foul') {
    // Restore foul count
    if (last.marker) last.marker.remove();
  }
  // Remove from action history
  state.actionHistory[last.team] = 
    state.actionHistory[last.team].filter(a => a.id !== last.actionId);
  renderActionLog(last.team);
  updateUI();
}
```

**Trigger Methods:**
- Keyboard: Ctrl+Z
- Button: Undo button in UI
- Works for all action types: shots, fouls, timeouts

---

### 5. Hotkey System Enhancements
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`

**Zone Contradiction Warnings:**
- Added validation when using forced shot type hotkeys (2 or 3)
- Compares intended shot type vs. actual cursor zone
- Shows confirmation dialog if mismatch detected
- Example warning: "You're logging a 3PT but cursor is in 2PT zone. Continue logging anyway?"
- Prevents accidental shot type errors
- User can confirm to override or cancel

**Implementation:**
```javascript
checkZoneContradiction(intendedShot, actualZone) {
  if (intendedShot !== actualZone) {
    return `Warning: You're logging a ${intendedShot.toUpperCase()} but cursor is in ${actualZone.toUpperCase()} zone.`;
  }
  return null;
}
```

**Updated Hotkey List:**
| Key | Action | Validation |
|-----|--------|-----------|
| M | Shot Made (auto) | Cursor + Zone detect |
| X | Shot Missed (auto) | Cursor + Zone detect |
| 2 | 2PT Made | Cursor + Zone check |
| Shift+2 | 2PT Missed | Cursor + Zone check |
| 3 | 3PT Made | Cursor + Zone check |
| Shift+3 | 3PT Missed | Cursor + Zone check |
| F | FT Made | No cursor required |
| Shift+F | FT Missed | No cursor required |
| A | Foul Team A | Cursor required |
| B | Foul Team B | Cursor required |

---

### 6. Cursor Position Validation
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`

**Data Integrity Enforcement:**
- Prevents logging shots/fouls without cursor over court
- Ensures all position-based markers have accurate coordinates
- Clear error messages guide users
- Free throws explicitly exempted (no position needed)

**Validation System:**
```javascript
// Cursor tracking
let lastCursorPos = null;

courtImg.addEventListener('mousemove', (evt) => {
  lastCursorPos = {
    xPct: ((evt.clientX - rect.left) / rect.width) * 100,
    yPct: ((evt.clientY - rect.top) / rect.height) * 100
  };
});

courtImg.addEventListener('mouseleave', () => {
  lastCursorPos = null;
});

// Validation in hotkeys
if (!lastCursorPos) {
  alert('Cannot log shot off court image. Hover cursor over the court first.');
  return;
}
```

**Actions Requiring Cursor:**
- All shot hotkeys (M, X, 2, 3) - cursor required
- All foul buttons (A, B) - cursor required  
- Free throws (F) - exempted from cursor requirement

**Error Messages:**
- Shots: "Cannot log shot off court image. Hover cursor over the court first."
- Fouls: "Cannot log foul off court image. Hover cursor over the court first."

---

### 7. Layout Improvements
**Date**: January 30, 2026  
**Files Modified**: `frontend/game.html`, `frontend/css/shared.css`

**Full-Page Game Layout:**
- Changed `#main-content` to full width (100%)
- Height: `calc(100vh - var(--header-height))`
- Removed unnecessary margins and padding
- Maximizes usable space for court and stats

**Player Card Enhancement:**
- Increased `.col-2` width from 16.67% to 20%
- Better visibility for action history
- Larger clickable areas for action buttons
- Improved readability of stats and actions

**Action Log Styling:**
- Added `.player-actions` section with top border separator
- Margin-top: 2rem for clear visual separation from stats
- Padding-top: 1.5rem for breathing room
- Border-top: 2px solid for clear delineation

**Note Visibility:**
- Font size: 12px (was too small)
- Color: #333 (darker for better contrast)
- Left border: 3px solid (visual indicator)
- Background: Slightly darker shade
- Better padding and line-height

---

### 8. Free Throw Handling
**Date**: January 30, 2026  
**Files Modified**: `frontend/js/gameScript.js`

**Simplified Free Throw Logic:**
- Free throws no longer create markers on court
- Always call `applyShot()` with `null` marker and position
- Still logged in action history with "FT Made" / "FT Missed" labels
- Still updates score (ftM, ftA stats)
- Can be logged from anywhere (no cursor position requirement)

**Rationale:**
- Free throws are always taken from the same location (free throw line)
- No need to track position on court visually
- Simplifies user workflow
- Reduces visual clutter on court
- Maintains all necessary statistics and history

**Implementation:**
```javascript
// F hotkey - simplified
if (key === 'f') {
  const shotType = 'ft';
  const result = isShift ? 'missed' : 'made';
  controller.applyShot(controller.getActiveTeam(), shotType, result, null, null);
  return;
}
```

---

## Technical Improvements

### Code Quality
- Added input sanitization with `escapeHtml()` for XSS prevention
- Improved state management with cleaner data structures
- Better separation of concerns (markers, actions, stats)
- Consistent error handling and user feedback

### Performance
- Efficient DOM manipulation with document fragments
- Event delegation for action button handlers
- Minimal reflows with batched UI updates
- Optimized zone detection algorithms

### User Experience
- Clear visual feedback for all interactions
- Helpful error messages with specific guidance
- Confirmation dialogs for destructive actions
- Responsive design maintains functionality at all sizes
- Keyboard shortcuts for rapid data entry
- Undo capability for error correction

---

## Future Considerations

**Potential Enhancements:**
- Export action history to PDF/CSV
- Filter/search actions by type or time range
- Statistics breakdown by quarter/half
- Heat map visualization of shot locations
- Shot percentage by zone
- Comparison with historical player averages
- Real-time shot chart updates
- Multi-game action history analysis

---

## Related Documentation

- [Game Tracker Guide](gameTracker.md) - Complete feature documentation
- [Code Structure](codeStructure.md) - File organization
- [API Endpoints](apiEndpoints.md) - Backend integration
- [Database Schema](databaseSchema.md) - Data persistence