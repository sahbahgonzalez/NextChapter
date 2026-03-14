# Game Tracker Documentation

## Overview
The game tracker (`game.html` + `gameScript.js`) provides real-time basketball game logging with visual court representation, action history, and comprehensive statistics tracking.

## Core Features

### 1. Action History System
Every game event is logged with detailed information and displayed in action cards under each player.

### 1.1 Stats Panel Scope (Player vs Team)

Each side stat panel can now display either individual active-player stats or full team totals.

**Behavior:**
- Default mode is **Player** on both sides.
- Per-side selector options:
  - `Player`: active player's individual stats
  - `Team`: team aggregate stats
- Scope label is shown in each side panel to indicate the current view.
- Center game score display remains team-based and is not affected by this toggle.
- Team aggregate view sums stat output from all tracked players on the team (not just currently active player).

**Features:**
- **Timestamps**: Each action shows game time in MM:SS format
- **Action Types**: Shots (2PT, 3PT, 4PT, FT), fouls, timeouts
- **Control Actions**: Team switch, teammate swap, pause/resume, and timeout calls are tracked in action history
- **Interactive Elements**:
  - **Notes**: Add custom text descriptions to any action (button displays pencil icon)
  - **Highlight**: Mark important actions for post-game review (toggles between star outline and filled star)
  - **Delete**: Performs a targeted undo for that specific action (button displays X symbol)

**Action Entry Structure:**
```javascript
{
  id: timestamp,
  label: "4PT Made" | "3PT Made" | "2PT Missed" | "FT Made" | "[Player Name] Foul" | "Switched Active Team (Tab)",
  type: "4pt" | "3pt" | "2pt" | "ft" | "foul",
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

#### Current Temporary Runtime Setting
- Warning header (`#startError`) is hidden in the game UI.
- Auto 2PT/3PT detection is commented out in active shot logging paths.
- "Auto" shot buttons/hotkeys currently record as `2pt` until detection is re-enabled.
- Zone contradiction warning prompts are currently disabled.

---

### 3. Shot Markers

Visual indicators placed on the court for all shots and fouls (except free throws).

**Shot Markers:**
- Display player initials
- Made shots use fixed per-player colors (Green/Blue/Pink/Orange)
- Missed shots remain red (reserved miss color)
- Positioned at exact click/cursor location
- Removed when action is undone
- Created via `addShotMarker()`

**Foul Markers:**
- Yellow marker style reserved for fouls (red remains reserved for missed shots)
- Role-based foul shapes:
  - Triangle = player who committed the foul
  - Square = player who got fouled
- Logging a foul creates both markers at the same cursor location (committer + fouled player)
- Both markers are removed when the foul action is undone
- Created via `addFoulMarker(teamKey, pos, role)`

**Tag-Team Visibility Rules:**
- Only the active team's markers are shown.
- In tag-team mode + Player view, only the currently active teammate's markers are shown.
- In Team view, all markers for the active team are shown.
- Action log and latest-shot panel are filtered to the active individual player.
- Action panels are not forcibly hidden just because a team is inactive.

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
- Triggered: U hotkey or Undo button
- References: Markers stored in `state.history[].marker`
- Cleanup: `marker.remove()` + array splice
- Undo does not create a separate "Undo Last Event" action log entry.

### 4.1 Action Row Delete = Targeted Undo

Deleting an action from the Actions table now undoes that exact action instead of only removing the row.

**What the delete button now does:**
1. Finds the linked history change using `actionId`
2. Reverts only that change's stats (shot or foul)
3. Removes that change's marker from the court
4. Removes only that action row from `state.actionHistory`
5. Refreshes UI totals and cards

**Implementation:**
- Functions: `undoActionById()`, `revertHistoryChange()`, `removeActionEntryById()`
- Event handlers: `data-action="delete"` click handlers for Team A and Team B action logs

**Important note:**
- Runtime-created actions are fully reversible by delete (stats + marker + row).
- Legacy/preloaded rows that do not have a linked runtime history entry will still remove only the row.

---

### 5. Hotkey System

Keyboard shortcuts for rapid game logging.

#### Shot Hotkeys

| Key | Action | Cursor Required | Zone Detection |
|-----|--------|----------------|----------------|
| M | Shot Made | Yes | Temporarily forced 2PT |
| X | Shot Missed | Yes | Temporarily forced 2PT |
| 4 | 4PT Made | Yes | Forced 4PT |
| Shift+4 | 4PT Missed | Yes | Forced 4PT |
| 2 | 2PT Made | Yes | Forced 2PT |
| Shift+2 | 2PT Missed | Yes | Forced 2PT |
| 3 | 3PT Made | Yes | Forced 3PT |
| Shift+3 | 3PT Missed | Yes | Forced 3PT |
| F | FT Made | No | N/A |
| Shift+F | FT Missed | No | N/A |

#### Other Hotkeys

| Key | Action | Cursor Required |
|-----|--------|----------------|
| A | Log Team A foul (committer = Team A active player) | Yes |
| B | Log Team B foul (committer = Team B active player) | Yes |
| Tab | Switch Active Player | No |
| S | Swap Active Teammate (tag mode) | No |
| P | Pause/Resume | No |
| U | Undo Last Action | No |

#### Foul Attribution Flow

- Pressing Team A/Team B foul controls (or hotkeys `A` / `B`) immediately logs the foul for that team's active player.
- The opposing active player is represented as the fouled player in marker rendering.
- Action history labels keep fouling-player identity.

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
  A: { twoPM, twoPA, threePM, threePA, fourPM, fourPA, ftM, ftA, fouls },
  B: { twoPM, twoPA, threePM, threePA, fourPM, fourPA, ftM, ftA, fouls },
  playerStats: { [playerId]: { twoPM, twoPA, threePM, threePA, fourPM, fourPA, ftM, ftA, fouls } },
  teamPlayerIds: { A: [playerId...], B: [playerId...] },
  statsView: { A: 'player' | 'team', B: 'player' | 'team' },
  history: [{ kind, team, shotType, result, marker, secondaryMarker, actionId, playerId, pos, persisted }],
  actionHistory: {
    A: [{ id, teamKey, playerId, playerName, label, type, gameSeconds, timeLabel, highlighted, note, markerId }],
    B: [{ id, teamKey, playerId, playerName, label, type, gameSeconds, timeLabel, highlighted, note, markerId }]
  }
}
```

### Key Functions

**Shot Management:**
- `applyShot(teamKey, shotType, result, markerEl, pos)` - Records shot and updates state
- `addShotMarker(teamKey, shotType, result, pos)` - Creates visual marker on court
- `inferShotTypeFromClick(evt)` - Detects zone from click event
- `inferShotTypeFromPos(pos)` - Detects zone from coordinates
- `applyPlayerShotDelta(playerId, shotType, result, delta)` - Updates individual player stat totals

**Foul Management:**
- `incrementFoul(teamKey)` - Records foul with selected player/team identity
- `addFoulMarker(teamKey, pos, role)` - Creates role-specific foul marker at cursor position
- `logFoulToHistory(teamKey, pos)` - Logs committed foul marker and action entry
- `logFoulForTeam(teamKey)` - Direct Team A/Team B foul logging path for buttons/hotkeys
- `applyPlayerFoulDelta(playerId, delta)` - Updates individual player foul totals

**Stats Scope Rendering:**
- `computeTeamTotals(teamKey)` - Sums tracked player stat objects for team view
- `getDisplayStatsForTeam(teamKey)` - Resolves whether panel should show active player stats or computed team totals
- `updateUI()` - Renders side panels from selected scope while keeping center scoreboard on team totals

**Action History:**
- `addActionEntry(teamKey, entry)` - Adds to action history array
- `renderActionLog(teamKey)` - Renders all actions for team
- `formatGameTime(seconds)` - Converts to MM:SS format
- `escapeHtml(text)` - Sanitizes user input for notes
- `undoActionById(teamKey, actionId)` - Reverts one specific action by id
- `revertHistoryChange(change)` - Reverts stat and marker for one history item
- `removeActionEntryById(teamKey, actionId)` - Removes one action row safely

**Undo System:**
- `undoLast()` - Removes last action from all state, removes markers, updates UI

**Validation:**
- `checkZoneContradiction(intendedShot, actualZone)` - Validates hotkey matches zone
- Cursor position checks in all relevant hotkey handlers

**Backend Sync:**
- Live event sync can be toggled with `SYNC_LIVE_EVENTS_TO_BACKEND`.
- When disabled, events are buffered in `state.history` and flushed at End Game.
- Action-log UI events are local-only and are not posted as backend game events.
- Finalization sends explicit `final_score` and `winner`.
- If native 4PT backend event persistence is rejected, compatibility fallback persists equivalent total points (`3PT` + made `FT` for made 4PT).

**Live Recovery (Local Persistence):**
- Active game state is persisted under `tnc_live_game_state_active_v1`.
- Snapshot includes timer/runtime flags, team/player stats, action/shot history, and court marker metadata.
- Autosave triggers during active play and on page lifecycle events (`beforeunload`, `pagehide`, `offline`).
- On reload, tracker restores active session state (including markers and linked action metadata) when game ID matches.
- Snapshot is cleared when game is reset or finalized.

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