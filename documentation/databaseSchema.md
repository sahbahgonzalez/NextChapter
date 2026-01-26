# Database Schema

MongoDB database schemas for NextChapter using Mongoose ODM.

## Database

**Name:** `nextChapterDb`

**Connection:** MongoDB Atlas (configured via `MONGODB_URI` in `.env`)

---

## Collections

### Users Collection

Stores admin user accounts for authentication.

**Collection Name:** `users`

**Schema:**
```javascript
{
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    hashed_password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['admin'],
        default: 'admin'
    },
    createdAt: Date,    // Auto-generated
    updatedAt: Date     // Auto-generated
}
```

**Indexes:**
- `email` - Unique index

**Notes:**
- Passwords are hashed using bcryptjs before storage
- Currently only supports 'admin' role

---

### Players Collection

Stores player profiles with biographical info and cumulative statistics.

**Collection Name:** `players`

**Schema:**
```javascript
{
    created_by: {
        type: ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        trim: true
    },
    instagram_handle: {
        type: String,
        trim: true
    },
    profile_image_url: {
        type: String,
        trim: true,
        default: '../public/images/default_image.png'
    },
    bio: {
        type: String,
        trim: true,
        default: 'Player at TheNextChapter!'
    },
    height_inches: Number,
    weight_lbs: Number,
    hometown: {
        type: String,
        trim: true
    },
    date_of_birth: Date,
    city: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    overall_stats: {
        games_played: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        total_minutes: { type: Number, default: 0 },
        total_points: { type: Number, default: 0 },
        total_fga: { type: Number, default: 0 },
        total_fgm: { type: Number, default: 0 },
        total_3pa: { type: Number, default: 0 },
        total_3pm: { type: Number, default: 0 },
        total_2pa: { type: Number, default: 0 },
        total_2pm: { type: Number, default: 0 },
        total_fta: { type: Number, default: 0 },
        total_ftm: { type: Number, default: 0 },
        total_rebounds: { type: Number, default: 0 },
        total_oreb: { type: Number, default: 0 },
        total_dreb: { type: Number, default: 0 },
        total_assists: { type: Number, default: 0 },
        total_turnovers: { type: Number, default: 0 },
        total_steals: { type: Number, default: 0 },
        total_blocks: { type: Number, default: 0 },
        total_fouls: { type: Number, default: 0 },
        total_plus_minus: { type: Number, default: 0 },
        total_double_doubles: { type: Number, default: 0 },
        total_triple_doubles: { type: Number, default: 0 }
    },
    all_time_shot_data: [shotSchema],   // See sub-schema below
    createdAt: Date,    // Auto-generated
    updatedAt: Date     // Auto-generated
}
```

#### Shot Sub-Schema

Individual shots stored in `all_time_shot_data` array:

```javascript
{
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    made: { type: Boolean, required: true },
    points: { type: Number, required: true, enum: [1, 2, 3] },
    game_id: { type: ObjectId, ref: 'Game', required: true },
    timestamp: { type: Date, required: true }
}
```

**Point Values:**
- `1` = Free throw
- `2` = 2-point field goal
- `3` = 3-point field goal

**Notes:**
- Percentages (FG%, 3P%, FT%, Win%) are calculated on the frontend
- Shot coordinates are stored for heat map visualization

---

### Games Collection

Stores game records including events and per-player statistics.

**Collection Name:** `games`

**Schema:**
```javascript
{
    created_by: {
        type: ObjectId,
        ref: 'User',
        required: true
    },
    game_type: {
        type: String,
        required: true,
        enum: ['1v1', '2v2', '3v3', '5v5']
    },
    status: {
        type: String,
        required: true,
        enum: ['in_progress', 'finished', 'canceled'],
        default: 'in_progress'
    },
    all_player_ids: [{
        type: ObjectId,
        ref: 'Player',
        required: true
    }],
    teams: {
        team_a: [{ type: ObjectId, ref: 'Player', required: true }],
        team_b: [{ type: ObjectId, ref: 'Player', required: true }]
    },
    score_to_win: Number,
    final_score: {
        team_a: { type: Number, default: 0 },
        team_b: { type: Number, default: 0 }
    },
    winner: {
        type: String,
        enum: ['team_a', 'team_b', null],
        default: null
    },
    live_stats_applied: {
        type: Boolean,
        default: false
    },
    events: [eventSchema],              // See sub-schema below
    game_stats_summary: {
        type: Map,
        of: playerGameStatsSchema       // See sub-schema below
    },
    createdAt: Date,    // Auto-generated
    updatedAt: Date     // Auto-generated
}
```

#### Event Sub-Schema

Individual game events stored in the `events` array:

```javascript
{
    type: {
        type: String,
        required: true,
        enum: ['shot', 'rebound', 'turnover', 'steal', 'block', 'foul', 'free_throw']
    },
    player_id: { type: ObjectId, ref: 'Player', required: true },
    team: { type: String, required: true, enum: ['team_a', 'team_b'] },
    timestamp: { type: Date, required: true, default: Date.now },
    // Conditional fields based on event type:
    location: {         // For shots
        x: Number,
        y: Number
    },
    made: Boolean,      // For shots and free throws
    points: { type: Number, enum: [1, 2, 3] },  // For shots and free throws
    rebound_type: { type: String, enum: ['offensive', 'defensive'] },
    turnover_type: String
}
```

#### Player Game Stats Sub-Schema

Per-player statistics for a single game (stored in `game_stats_summary` Map):

```javascript
{
    pts: { type: Number, default: 0 },
    fga: { type: Number, default: 0 },
    fgm: { type: Number, default: 0 },
    '3pa': { type: Number, default: 0 },
    '3pm': { type: Number, default: 0 },
    fta: { type: Number, default: 0 },
    ftm: { type: Number, default: 0 },
    reb: { type: Number, default: 0 },
    oreb: { type: Number, default: 0 },
    dreb: { type: Number, default: 0 },
    ast: { type: Number, default: 0 },
    tov: { type: Number, default: 0 },
    stl: { type: Number, default: 0 },
    blk: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    plus_minus: { type: Number, default: 0 },
    is_double_double: { type: Boolean, default: false },
    is_triple_double: { type: Boolean, default: false }
}
```

**Stat Abbreviations:**
| Abbreviation | Meaning |
|--------------|---------|
| pts | Points |
| fga | Field Goals Attempted |
| fgm | Field Goals Made |
| 3pa | 3-Pointers Attempted |
| 3pm | 3-Pointers Made |
| fta | Free Throws Attempted |
| ftm | Free Throws Made |
| reb | Total Rebounds |
| oreb | Offensive Rebounds |
| dreb | Defensive Rebounds |
| ast | Assists |
| tov | Turnovers |
| stl | Steals |
| blk | Blocks |
| pf | Personal Fouls |

---

## Relationships

```
User (1) ----creates----> (N) Player
User (1) ----creates----> (N) Game
Player (N) <--plays_in--> (N) Game
```

- A **User** can create multiple **Players** and **Games**
- A **Player** can participate in multiple **Games**
- A **Game** contains multiple **Players** (on teams)

---

## Data Flow

1. **Game Creation:** Admin creates a game with team rosters
2. **Event Logging:** During gameplay, events (shots, rebounds, etc.) are logged
3. **Game Finalization:** When game ends:
   - `status` changes to 'finished'
   - `winner` is determined
   - `game_stats_summary` is calculated from events
   - Player `overall_stats` are updated
   - Shot data is copied to player's `all_time_shot_data`
