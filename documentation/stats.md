# Statistics Documentation

## Overview

The statistics system tracks comprehensive basketball performance metrics for individual players and games. Statistics are accumulated from game events and stored at both the game level and player career level.

---

## Statistics Categories

### Scoring Statistics

**Points (PTS)**
- Total points scored
- Calculation: (2PM × 2) + (3PM × 3) + (FTM × 1)
- Primary indicator of offensive contribution

**Field Goals (FG)**
- `FGA`: Field goal attempts (all 2PT and 3PT shots)
- `FGM`: Field goals made
- `FG%`: Field goal percentage = (FGM / FGA) × 100
- Measures overall shooting efficiency

**Three-Pointers (3P)**
- `3PA`: Three-point attempts
- `3PM`: Three-pointers made
- `3P%`: Three-point percentage = (3PM / 3PA) × 100
- Tracks long-range shooting ability

**Four-Pointers (4P) - Report Display**
- Game report now shows per-player 4PT made/attempted.
- Values are derived from event stream (`event.type === 'shot'` and `event.points === 4`).
- This is currently a report-level derived metric and may not exist as a native backend summary field in `game_stats_summary`.

**Two-Pointers (2P)**
- `2PA`: Two-point attempts
- `2PM`: Two-pointers made  
- `2P%`: Two-point percentage = (2PM / 2PA) × 100
- Measures close and mid-range shooting

**Free Throws (FT)**
- `FTA`: Free throw attempts
- `FTM`: Free throws made
- `FT%`: Free throw percentage = (FTM / FTA) × 100
- Indicates consistency from the line

### Rebounding Statistics

**Total Rebounds (REB)**
- Combined offensive and defensive rebounds
- Sum of OREB + DREB
- Measures control of possessions

**Offensive Rebounds (OREB)**
- Rebounds on offensive end
- Results in second-chance points
- High value statistic

**Defensive Rebounds (DREB)**
- Rebounds on defensive end
- Ends opponent's possession
- Most common rebound type

### Playmaking Statistics

**Assists (AST)**
- Passes that directly lead to made baskets
- Measures playmaking ability
- Tracked when pass results in immediate score

**Turnovers (TOV)**
- Lost possessions without shot attempt
- Includes bad passes, traveling, offensive fouls
- Lower is better

**Assist-to-Turnover Ratio (AST/TOV)**
- Calculated: AST / TOV
- Measures decision-making quality
- Higher ratio indicates better ball handling

### Defensive Statistics

**Steals (STL)**
- Possessions gained from opponent
- Deflections resulting in team recovery
- Indicates defensive awareness

**Blocks (BLK)**
- Shots rejected at the rim
- Defensive deterrent
- Measures rim protection

**Personal Fouls (PF)**
- Fouls committed by player
- Tracked for foul trouble
- Excessive fouls can limit playing time

### Advanced Statistics

**Plus/Minus (+/-)**
- Point differential while player is active
- Team score - Opponent score during player's time
- Positive indicates team outscored opponent
- Negative indicates team was outscored
- Measures overall impact on game

**Double-Double**
- Double digits in two statistical categories
- Common: Points + Rebounds, Points + Assists
- Any two categories (including rebounds, assists, steals, blocks)
- Indicates well-rounded performance

**Triple-Double**
- Double digits in three statistical categories
- Rare achievement
- Examples: Points + Rebounds + Assists
- Indicates elite all-around performance

---

## Statistics Storage

### Player Overall Statistics

Lifetime accumulated statistics stored in Player collection:

```javascript
overall_stats: {
  games_played: Number,
  wins: Number,
  losses: Number,
  total_minutes: Number,
  total_points: Number,
  total_fga: Number,
  total_fgm: Number,
  total_3pa: Number,
  total_3pm: Number,
  total_2pa: Number,
  total_2pm: Number,
  total_fta: Number,
  total_ftm: Number,
  total_rebounds: Number,
  total_oreb: Number,
  total_dreb: Number,
  total_assists: Number,
  total_turnovers: Number,
  total_steals: Number,
  total_blocks: Number,
  total_fouls: Number,
  total_plus_minus: Number,
  total_double_doubles: Number,
  total_triple_doubles: Number
}
```

### Game Statistics

Per-game statistics stored in Game collection's `game_stats_summary`:

```javascript
game_stats_summary: {
  [player_id]: {
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
}
```

---

## Statistics Calculation

### From Game Events

Statistics are derived from game events in real-time:

**Shot Events:**
```javascript
if (event.type === 'shot') {
  stats.fga += 1;
  if (event.made) {
    stats.fgm += 1;
    stats.pts += event.points;
    
    if (event.points === 3) {
      stats['3pa'] += 1;
      stats['3pm'] += 1;
    } else if (event.points === 2) {
      stats['2pa'] += 1;
      stats['2pm'] += 1;
    }
  } else {
    if (event.points === 3) stats['3pa'] += 1;
    else stats['2pa'] += 1;
  }
}
```

**Free Throw Events:**
```javascript
if (event.type === 'free_throw') {
  stats.fta += 1;
  if (event.made) {
    stats.ftm += 1;
    stats.pts += 1;
  }
}
```

**Foul Events:**
```javascript
if (event.type === 'foul') {
  stats.pf += 1;
}
```

### Percentage Calculations

**Field Goal Percentage:**
```javascript
const fg_pct = stats.fga > 0 ? (stats.fgm / stats.fga * 100).toFixed(1) : '0.0';
```

**Three-Point Percentage:**
```javascript
const three_pct = stats['3pa'] > 0 ? (stats['3pm'] / stats['3pa'] * 100).toFixed(1) : '0.0';
```

**Two-Point Percentage:**
```javascript
const two_pct = stats['2pa'] > 0 ? (stats['2pm'] / stats['2pa'] * 100).toFixed(1) : '0.0';
```

**Free Throw Percentage:**
```javascript
const ft_pct = stats.fta > 0 ? (stats.ftm / stats.fta * 100).toFixed(1) : '0.0';
```

**Win Percentage:**
```javascript
const win_pct = stats.games_played > 0 ? 
  (stats.wins / stats.games_played * 100).toFixed(1) : '0.0';
```

### Double-Double Detection

```javascript
function isDoubleDouble(stats) {
  const categories = [
    stats.pts >= 10,
    stats.reb >= 10,
    stats.ast >= 10,
    stats.stl >= 10,
    stats.blk >= 10
  ];
  
  const doubleDigitCount = categories.filter(Boolean).length;
  return doubleDigitCount >= 2;
}
```

### Triple-Double Detection

```javascript
function isTripleDouble(stats) {
  const categories = [
    stats.pts >= 10,
    stats.reb >= 10,
    stats.ast >= 10,
    stats.stl >= 10,
    stats.blk >= 10
  ];
  
  const doubleDigitCount = categories.filter(Boolean).length;
  return doubleDigitCount >= 3;
}
```

---

## Statistics Display

### Home Page Stats Table

**Display Format:**
- Sortable table with all players
- Shows key statistics: Games, Wins, Losses, Win%, Points, FG%, 3P%, FT%
- Click column headers to sort
- Percentages formatted to one decimal place

**Default Sort:**
- By total points (descending)
- Shows top scorers first

### Player Stats Page

**Individual Player View:**
- Complete career statistics
- All statistical categories
- Calculated percentages
- Recent game history
- Shot chart visualization

### Game Report

**Per-Game Statistics:**
- Shows both teams' player statistics
- Side-by-side comparison
- Winner highlighted
- Final score prominent
- Event timeline

---

## Statistics Updates

### Real-Time Updates

**During Game:**
- Statistics update immediately with each event
- Local state updated in frontend
- Events sent to backend API
- Scores recalculated after each action

**After Game Finalization:**
- Game statistics calculated from all events
- Player overall statistics updated
- Win/loss records updated
- Shot data appended to career shot chart

### Undo Functionality

**Statistics Rollback:**
When action is undone:
1. Remove event from game events array
2. Recalculate affected statistics
3. Update score display
4. Remove visual marker from court
5. Update action history log

---

## Statistics API

### Get Player Statistics

**Endpoint:**
```
GET /player/:id
```

**Response includes:**
- All overall_stats fields
- Win percentage (calculated)
- Shooting percentages (calculated)
- Recent games list

### Get Game Statistics

**Endpoint:**
```
GET /game/:id
```

**Response includes:**
- Per-player game statistics
- Team totals
- Winner information
- All game events for analysis

### Get Shot Chart Data

**Endpoint:**
```
GET /player/:id/shot-chart
```

**Response:**
Array of all career shots with coordinates and results

**Use Cases:**
- Generate heat maps
- Analyze shooting zones
- Track shooting improvement
- Compare shooting patterns

---

## Frontend Implementation

### Statistics Display Components

**Stats Table (index.html)**
- Fetches all players with statistics
- Sortable columns
- Formatted percentages
- Responsive design

**Player Stats Page (player-stats.html)**
- Detailed individual statistics
- Career totals and averages
- Shot chart visualization
- Game history

**Game Report (game-report.html)**
- Final game statistics
- Team comparison
- Event timeline
- Box score format

### Key Functions

**formatPercentage(made, attempted)**
- Returns: "XX.X%" or "0.0%" if no attempts
- Used for all shooting percentages

**calculateWinPercentage(wins, games)**
- Returns: "XX.X%" or "0.0%" if no games
- Displayed in player tables

**sortByColumn(column)**
- Sorts statistics table
- Handles numeric and string comparisons
- Updates UI sort indicators

---

## Related Documentation

- [Players](players.md) - Player management and profiles
- [Games](games.md) - Game management and events
- [Database Schema](databaseSchema.md) - Data storage structure
- [API Endpoints](apiEndpoints.md) - Statistics API reference