# Game Tracker Documentation

## Overview
The game tracker (`game.html` + `gameScript.js`) provides real-time basketball game logging with visual court representation, action history, and comprehensive statistics tracking.

## Core Features

### 1. Action History System
Every game event is logged with detailed information and displayed in action cards under each player.

**Features:**
- **Timestamps**: Each action shows game time in MM:SS format
- **Action Types**: Shots (2PT, 3PT, FT), fouls, timeouts
- **Interactive Elements**:
  - **Notes**: Add custom text descriptions to any action (button displays pencil icon)
  - **Highlight**: Mark important actions for post-game review (toggles between star outline and filled star)
  - **Delete**: Remove incorrectly logged actions (button displays X symbol)

**Action Entry Structure:**
```javascript
{
  id: timestamp,
  label: "3PT Made" | "2PT Missed" | "FT Made" | "Foul",
  type: "3pt" | "2pt" | "ft" | "foul",
  timeLabel: "12:45",
  gameSeconds: 765,
  highlighted: false,
  note: ""
}
```

**Implementation Location:**
- State: `state.actionHistory.A[]` and `state.actionHistory.B[]`
- Functions: `addActionEntry()`, `renderActionLog()`, `escapeHtml()`
- UI: `.action-item` elements with `.action-item__content` and `.action-item__note`

---

### 2. Basketball Court Zones

Visual and detection zones for accurate shot tracking.

#### Zone Types

**2PT Rectangular Zone:**
- Position: 38% to 62% from top, 86% width centered
- Priority: Checked first in detection logic
- Visual: Hidden (`display: none`) but detection active

**2PT Semicircle Zone:**
- Position: 38% from top with custom curve shape
- Customizable via CSS variables and clip-path
- Uses 9 polygon points for precise curve fitting
- Visual: Hidden but detection active

**3PT Zone:**
- Position: Everything outside 2PT zones
- Fallback zone in detection logic

#### Customization Variables
```css
--semicircle-top: 38%;
--semicircle-left: 50%;
--semicircle-width: 86%;
--semicircle-height: 29%;
--semicircle-border-width: 2px;
--semicircle-opacity: 0.15;
--clip-p1 through --clip-p9: Polygon points
```

#### Detection Logic
- `inferShotTypeFromClick(evt)`: Detects zone from mouse click event
- `inferShotTypeFromPos(pos)`: Detects zone from percentage coordinates
- Priority: 2PT Rectangle → 2PT Semicircle → 3PT (fallback)

---

### 3. Shot Markers

Visual indicators placed on the court for all shots and fouls (except free throws).

**Shot Markers:**
- Display player initials
- Color-coded by team and result (made/missed)
- Positioned at exact click/cursor location
- Removed when action is undone
- Created via `addShotMarker()`

**Foul Markers:**
- Display warning symbol (⚠) to visually distinguish fouls from shots
- Orange border with team-specific glow
- Positioned at exact cursor location
- Removed when action is undone
- Created via `addFoulMarker()`

**Free Throw Handling:**
- **No court markers** (FTs not tracked on court)
- Still logged in action history
- Still updates score
- Can be logged without cursor position

---

### 4. Undo Functionality

Complete rollback of the last action with full state restoration.

**What Gets Undone:**
1. Score/statistics (via `state.history`)
2. Court markers (shot/foul markers removed from DOM)
3. Action log entry (removed from `state.actionHistory`)
4. UI updates (score, stats, action cards)

**Implementation:**
- Function: `undoLast()`
- Triggered: Ctrl+Z or Undo button
- References: Markers stored in `state.history[].marker`
- Cleanup: `marker.remove()` + array splice

---

### 5. Hotkey System

Keyboard shortcuts for rapid game logging.

#### Shot Hotkeys

| Key | Action | Cursor Required | Zone Detection |
|-----|--------|----------------|----------------|
| M | Shot Made | Yes | Auto-detect 2PT/3PT |
| X | Shot Missed | Yes | Auto-detect 2PT/3PT |
| 2 | 2PT Made | Yes | Forced 2PT |
| Shift+2 | 2PT Missed | Yes | Forced 2PT |
| 3 | 3PT Made | Yes | Forced 3PT |
| Shift+3 | 3PT Missed | Yes | Forced 3PT |
| F | FT Made | No | N/A |
| Shift+F | FT Missed | No | N/A |

#### Other Hotkeys

| Key | Action | Cursor Required |
|-----|--------|----------------|
| A | Foul on Team A | Yes |
| B | Foul on Team B | Yes |
| Tab | Switch Active Player | No |
| P | Pause/Resume | No |
| Ctrl+Z | Undo Last Action | No |

#### Zone Contradiction Warnings

When using forced shot type hotkeys (2 or 3), the system validates the actual zone:
- Compares intended shot type vs. detected zone
- Shows confirmation dialog if mismatch
- Example: "You're logging a 3PT but cursor is in 2PT zone. Continue logging anyway?"
- Prevents accidental misclassification

**Implementation:**
- Function: `checkZoneContradiction(intendedShot, actualZone)`
- Returns warning message if contradiction exists
- User can confirm or cancel

---

### 6. Cursor Position Validation

Ensures data integrity by requiring cursor to be over court for position-based actions.

**Validation Rules:**
- **Required for**: All shots (2PT, 3PT) and fouls
- **Exemption**: Free throws can be logged without cursor position
- **Error message**: "Cannot log [shot/foul] off court image. Hover cursor over the court first."

**How It Works:**
1. `mousemove` event tracks cursor position over court
2. `lastCursorPos` stores `{xPct, yPct}` coordinates
3. `mouseleave` clears `lastCursorPos` when cursor exits court
4. All hotkeys check `if (!lastCursorPos)` before logging
5. Free throws have special exemption

**Implementation:**
- Variable: `lastCursorPos = null`
- Updated: `courtImg.addEventListener('mousemove')`
- Cleared: `courtImg.addEventListener('mouseleave')`
- Validated: In each hotkey handler and `incrementFoul()`

---

### 7. UI Layout

**Full-Page Game View:**
- Main content: 100% width, `calc(100vh - var(--header-height))` height
- Removes unnecessary padding and margins
- Maximizes space for court and player cards

**Player Cards:**
- Width: 20% (increased from 16.67%)
- Better visibility for action history
- Team colors and active indicators

**Action Log Styling:**
- Separated from stats with top border
- Margin-top: 2rem for clear distinction
- Notes: Left border, darker text, better padding
- Highlighted actions: Gold star (⭐) indicator

---

## Technical Implementation

### State Management

```javascript
state = {
  active: 'A',
  A: { twoPM, twoPA, threePM, threePA, ftM, ftA, fouls },
  B: { twoPM, twoPA, threePM, threePA, ftM, ftA, fouls },
  history: [{ kind, team, shotType, result, marker }],
  actionHistory: {
    A: [{ id, label, type, timeLabel, gameSeconds, highlighted, note }],
    B: [{ id, label, type, timeLabel, gameSeconds, highlighted, note }]
  }
}
```

### Key Functions

**Shot Management:**
- `applyShot(teamKey, shotType, result, markerEl, pos)` - Records shot and updates state
- `addShotMarker(teamKey, shotType, result, pos)` - Creates visual marker on court
- `inferShotTypeFromClick(evt)` - Detects zone from click event
- `inferShotTypeFromPos(pos)` - Detects zone from coordinates

**Foul Management:**
- `incrementFoul(teamKey)` - Records foul with validation
- `addFoulMarker(teamKey, pos)` - Creates foul marker at cursor position
- `logFoulToHistory(teamKey, pos)` - Logs foul with marker and action entry

**Action History:**
- `addActionEntry(teamKey, entry)` - Adds to action history array
- `renderActionLog(teamKey)` - Renders all actions for team
- `formatGameTime(seconds)` - Converts to MM:SS format
- `escapeHtml(text)` - Sanitizes user input for notes

**Undo System:**
- `undoLast()` - Removes last action from all state, removes markers, updates UI

**Validation:**
- `checkZoneContradiction(intendedShot, actualZone)` - Validates hotkey matches zone
- Cursor position checks in all relevant hotkey handlers

---

## File Structure

**Frontend Files:**
- [game.html](../frontend/game.html) - Game tracker UI
- [js/gameScript.js](../frontend/js/gameScript.js) - Game logic and state management
- [css/shared.css](../frontend/css/shared.css) - Styling including zone definitions

**Related Documentation:**
- [API Endpoints](apiEndpoints.md) - Backend API integration
- [Database Schema](databaseSchema.md) - Game event storage
- [Updates](updates.md) - Recent changes and improvements

---

## Recent Enhancements (January 2026)

See [updates.md](updates.md) for detailed changelog of recent improvements including:
- Action history system with notes and highlights
- Zone customization with CSS variables and clip-path
- Undo functionality with complete state restoration
- Cursor position validation for data integrity
- Zone contradiction warnings for hotkeys
- Foul markers at precise cursor positions
- Free throw handling without court markers