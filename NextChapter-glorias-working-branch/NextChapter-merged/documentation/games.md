# Games Documentation

## Overview

The Games system manages basketball game records, tracks live game events, and stores final statistics. Games can be in various states (in progress, finished, canceled) and support multiple game formats (1v1, 2v2, 3v3, 5v5).

---

## Game Structure

### Game Types

**1v1 Games**
- One player per team
- Standard format for individual matchups
- Quick game sessions


### Game Status

**In Progress**
- Game currently being played
- Live stat tracking active
- Events can be added
- Score updates in real-time

**Finished**
- Game has concluded
- Final score recorded
- Winner determined
- Statistics finalized and applied to player records

**Canceled**
- Game was started but not completed
- Statistics not applied to player records
- Kept for record-keeping purposes
- Can be queried but marked as invalid

---

## Game Creation

### Initial Setup

**Required Information**
- Game type 1v1
- Players for each team (Team A and Team B)
- Score to win (optional, defaults based on game type)

**Team Assignment**
- Team A: First team's player(s)
- Team B: Second team's player(s)
- Each team must have correct number of players for game type
- Player IDs stored as references to Player collection

**Creator Tracking**
- Each game linked to administrator who created it
- `created_by` field stores User ObjectId
- Used for access control and audit trail

### API Endpoint

```
POST /game
```

**Request Body:**
```json
{
  "game_type": "1v1",
  "teams": {
    "team_a": ["player_id_1"],
    "team_b": ["player_id_2"]
  },
  "score_to_win": 50
}
```

**Response:**
```json
{
  "_id": "game_id",
  "status": "in_progress",
  "final_score": {
    "team_a": 0,
    "team_b": 0
  }
}
```

---

## Game Events

### Event Types

**Shot Event**
- Records field goal attempts (2PT or 3PT)
- Includes court location coordinates
- Tracks made/missed status
- Stores point value (2 or 3)

**Free Throw Event**
- Records free throw attempts
- No location data (always from free throw line)
- Tracks made/missed status
- Point value always 1

**Foul Event**
- Records personal fouls
- Includes location on court where foul occurred
- Stored with player and team information

**Rebound Event** (future implementation)
- Tracks offensive and defensive rebounds
- Links to missed shot event

**Turnover Event** (future implementation)
- Records turnovers with optional type classification

**Steal Event** (future implementation)
- Links stealing player to turnover event

**Block Event** (future implementation)
- Records blocked shots with blocker information

### Event Schema

```javascript
{
  type: String,           // 'shot', 'free_throw', 'foul', etc.
  player_id: ObjectId,    // Reference to Player
  team: String,           // 'team_a' or 'team_b'
  timestamp: Date,        // When event occurred
  location: {             // Optional, for court-based events
    x: Number,            // Percentage (0-100)
    y: Number             // Percentage (0-100)
  },
  made: Boolean,          // For shots/free throws
  points: Number,         // 1, 2, or 3 for scoring events
  rebound_type: String,   // 'offensive' or 'defensive'
  turnover_type: String   // Classification of turnover
}
```

### Adding Events

**API Endpoint:**
```
POST /game/:id/event
```

**Shot Event Example:**
```json
{
  "type": "shot",
  "player_id": "player_id",
  "team": "team_a",
  "location": {
    "x": 45.5,
    "y": 38.2
  },
  "made": true,
  "points": 3
}
```

**Free Throw Example:**
```json
{
  "type": "free_throw",
  "player_id": "player_id",
  "team": "team_a",
  "made": true,
  "points": 1
}
```

**Foul Example:**
```json
{
  "type": "foul",
  "player_id": "player_id",
  "team": "team_b",
  "location": {
    "x": 52.3,
    "y": 61.7
  }
}
```

---

## Game Finalization

### Finishing a Game

**When to Finalize:**
- One team reaches the target score
- Predetermined time limit reached
- Game naturally concludes

**Process:**
1. Stop recording events
2. Calculate final statistics for each player
3. Determine winner based on final score
4. Apply statistics to player lifetime records
5. Mark game status as 'finished'

**API Endpoint:**
```
PATCH /game/:id/finish
```

**Request Body:**
```json
{
  "final_score": {
    "team_a": 50,
    "team_b": 47
  },
  "winner": "team_a"
}
```

### Statistics Application

**Per-Player Summary (`game_stats_summary`)**
- Calculated from all events in the game
- Stored as Map with player ID as key
- Includes all standard basketball statistics

**Statistics Updated:**
- Points, field goals (made/attempted)
- Three-pointers (made/attempted)
- Two-pointers (made/attempted)
- Free throws (made/attempted)
- Rebounds (offensive/defensive/total)
- Assists, turnovers, steals, blocks
- Personal fouls
- Plus/minus differential

**Player Overall Stats Update:**
When `live_stats_applied` is set to true:
- Game stats added to player's `overall_stats`
- Win/loss added to player record
- Games played incremented
- Shot data appended to `all_time_shot_data`

---

## Game Cancellation

### Canceling a Game

**Reasons for Cancellation:**
- Game started by mistake
- Players unable to continue
- Technical issues requiring reset
- Rule violations requiring void

**API Endpoint:**
```
PATCH /game/:id/cancel
```

**Effect:**
- Game status set to 'canceled'
- Statistics NOT applied to player records
- Game remains in database for records
- Can be queried but marked as invalid

**Important:**
- Cannot be reversed once canceled
- Stats remain in game document but don't affect player totals
- Useful for maintaining data integrity

---

## Game Retrieval

### Get All Games

**Endpoint:**
```
GET /game
```

**Query Parameters:**
- None required
- Returns all games in database

**Response:**
Array of game objects with basic information

### Get Game by ID

**Endpoint:**
```
GET /game/:id
```

**Response:**
Complete game object including:
- All events
- Player assignments
- Current/final scores
- Game statistics summary
- Timestamps

**Use Cases:**
- Load game for continued play
- View game details and statistics
- Generate game reports
- Analyze game events

---

## Game Tracker Interface

### Live Game Interface

**Components:**
- Basketball court visualization
- Team score displays
- Player assignment buttons
- Game timer
- Action controls (shots, fouls, timeouts)
- Action history log
- Undo functionality

**Features:**
- Real-time score updates
- Visual shot markers on court
- Keyboard shortcuts for rapid entry
- Pause/resume functionality
- Timeout tracking

### Court Interaction

**Click-Based Entry:**
- Left-click: Record made shot at location
- Right-click: Record missed shot at location
- Automatic zone detection (2PT/3PT)

**Keyboard Shortcuts:**
- M: Made shot (auto-detect zone)
- X: Missed shot (auto-detect zone)
- 2/Shift+2: Two-pointer made/missed
- 3/Shift+3: Three-pointer made/missed
- F/Shift+F: Free throw made/missed
- A/B: Foul on Team A/B
- Tab: Switch active player
- P: Pause/Resume
- Ctrl+Z: Undo last action

### Action History

**Logged Information:**
- Time of action (game clock)
- Action type and result
- Player who performed action
- Optional notes for context
- Highlight flag for important plays

**Actions:**
- Add notes to any entry
- Highlight important plays
- Delete incorrect entries
- Undo recent actions

---

## Database Schema

### Game Collection

```javascript
{
  _id: ObjectId,
  created_by: ObjectId (ref: User),
  game_type: String,        // '1v1', '2v2', '3v3', '5v5'
  status: String,           // 'in_progress', 'finished', 'canceled'
  all_player_ids: [ObjectId],
  teams: {
    team_a: [ObjectId],
    team_b: [ObjectId]
  },
  score_to_win: Number,
  final_score: {
    team_a: Number,
    team_b: Number
  },
  winner: String,           // 'team_a', 'team_b', or null
  live_stats_applied: Boolean,
  events: [{
    type: String,
    player_id: ObjectId,
    team: String,
    timestamp: Date,
    location: { x: Number, y: Number },
    made: Boolean,
    points: Number,
    rebound_type: String,
    turnover_type: String
  }],
  game_stats_summary: Map of {
    player_id: {
      pts: Number,
      fga: Number,
      fgm: Number,
      '3pa': Number,
      '3pm': Number,
      fta: Number,
      ftm: Number,
      reb: Number,
      oreb: Number,
      dreb: Number,
      ast: Number,
      tov: Number,
      stl: Number,
      blk: Number,
      pf: Number,
      plus_minus: Number,
      is_double_double: Boolean,
      is_triple_double: Boolean
    }
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## Frontend Implementation

### Files

**HTML**
- `game.html` - Game tracker interface
- `games.html` - Game list view
- `game-report.html` - Detailed game report

**JavaScript**
- `gameScript.js` - Game tracker logic and event handling
- `games.js` - Game list functionality
- `game-report.js` - Game report generation

**CSS**
- `shared.css` - Styling for all game-related pages

### Key Functions

**createGame()**
- Initializes new game via API
- Sets up game context
- Prepares UI for live tracking

**addGameEvent()**
- Sends event to API
- Updates local state
- Adds visual markers
- Updates scores

**finalizeGame()**
- Calculates final statistics
- Determines winner
- Applies stats to players
- Updates game status

**loadGameData()**
- Fetches existing game from API
- Restores game state
- Reconstructs court markers
- Populates UI

---

## Related Documentation

- [Game Tracker](gameTracker.md) - Detailed tracker interface documentation
- [Players](players.md) - Player management
- [API Endpoints](apiEndpoints.md) - Complete API reference
- [Database Schema](databaseSchema.md) - Schema specifications