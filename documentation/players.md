# Player Management

## Overview

The Player Management system allows administrators to create, update, and manage basketball player profiles. Each player has biographical information, physical attributes, and lifetime statistics that accumulate across all games played.

---

## Player Profile

### Basic Information

**Name**
- Full name of the player
- Required field for identification
- Displayed on player cards, game trackers, and statistics pages

**Instagram Handle**
- Optional social media identifier
- Used for player verification and social linking
- Displayed on profile pages

**Biography**
- Short description or player background
- Default: "Player at TheNextChapter!"
- Editable to include player highlights, achievements, or personal information

**Profile Image**
- URL to player's profile picture
- Default placeholder image provided if not specified
- Stored path: `../public/images/default_image.png`

### Physical Attributes

**Height**
- Input Format: Separate fields for feet and inches
- Storage Format: Total inches (integer)
- Display Format: Feet'Inches" (e.g., 6'2")
- Conversion: (feet × 12) + inches = total inches
- Example: 6 feet 2 inches → 74 inches stored

**Weight**
- Measured in pounds (lbs)
- Optional numeric field
- Used for player profiles and statistics display

**Location Information**
- Hometown: Free-text field for city and state
- City: Separate city field
- State: Separate state field
- Used for geographical player organization

**Date of Birth**
- Optional date field
- Used for age calculation and player demographics
- Stored as Date object in database

---

## Statistics Tracking

### Overall Statistics

Player statistics accumulate across all games and are stored in the `overall_stats` object:

**Game Record**
- `games_played`: Total number of games participated in
- `wins`: Number of games won
- `losses`: Number of games lost
- Win percentage: Calculated on frontend as (wins / games_played × 100)

**Scoring Statistics**
- `total_points`: Cumulative points scored across all games
- `total_minutes`: Total playing time in minutes

**Field Goals**
- `total_fga`: Total field goal attempts (2PT + 3PT combined)
- `total_fgm`: Total field goals made (2PT + 3PT combined)
- Field goal percentage: Calculated as (fgm / fga × 100)

**Three-Point Shooting**
- `total_3pa`: Three-point attempts
- `total_3pm`: Three-pointers made
- Three-point percentage: Calculated as (3pm / 3pa × 100)

**Two-Point Shooting**
- `total_2pa`: Two-point attempts
- `total_2pm`: Two-pointers made
- Two-point percentage: Calculated as (2pm / 2pa × 100)

**Free Throws**
- `total_fta`: Free throw attempts
- `total_ftm`: Free throws made
- Free throw percentage: Calculated as (ftm / fta × 100)

**Other Statistics**
- `total_rebounds`: Combined offensive and defensive rebounds
- `total_oreb`: Offensive rebounds
- `total_dreb`: Defensive rebounds
- `total_assists`: Assists
- `total_turnovers`: Turnovers
- `total_steals`: Steals
- `total_blocks`: Blocks
- `total_fouls`: Personal fouls committed
- `total_plus_minus`: Plus/minus differential

**Achievements**
- `total_double_doubles`: Games with double digits in two statistical categories
- `total_triple_doubles`: Games with double digits in three statistical categories

---

## Shot Chart Data

### All-Time Shot Data

Each player stores a lifetime collection of shot attempts with the following structure:

```javascript
{
  x: Number,              // X-coordinate percentage (0-100)
  y: Number,              // Y-coordinate percentage (0-100)
  made: Boolean,          // true if shot was successful
  points: Number,         // 1 (FT), 2 (2PT), or 3 (3PT)
  game_id: ObjectId,      // Reference to the game
  timestamp: Date         // When shot was taken
}
```

**Uses:**
- Generate heat maps showing shooting tendencies
- Analyze shooting percentage by court zone
- Track shooting improvement over time
- Compare shooting patterns between players
- Visualize shooting efficiency across different areas

---

## Player Management Interface

### Search and Filter

**Search Functionality**
- Search by player name or Instagram handle
- Real-time search with debouncing (prevents excessive API calls)
- Case-insensitive partial matching
- Results display in card grid format

**Display Options**
- Grid layout with player cards
- Shows profile image, name, and key statistics
- Click card to view detailed player profile
- Edit and delete options for administrators

### Creating Players

**Form Fields**
- Name (required)
- Instagram Handle (optional)
- Biography (optional, has default)
- Height - Feet input (0-8)
- Height - Inches input (0-11)
- Weight in pounds (optional)
- Hometown (optional)
- Date of Birth (optional)

**Validation**
- Name must not be empty
- Height feet limited to reasonable range (0-8)
- Height inches must be 0-11
- Weight must be positive number if provided

**Process**
1. Administrator fills out player creation form
2. Height converts from feet/inches to total inches
3. Data sent to API via POST /player
4. New player created with default statistics (all zeros)
5. Player assigned to logged-in administrator via `created_by` field

### Updating Players

**Editable Fields**
- All biographical information
- Physical attributes
- Biography text

**Protected Fields**
- Player ID (immutable)
- Creator reference (immutable)
- Statistics (updated only through game events)
- Shot chart data (updated only through game events)

**Process**
1. Click edit button on player card
2. Form populates with existing player data
3. Height displays as separate feet and inches values
4. Make desired changes
5. Submit updates via PATCH /player/:id
6. Changes reflected immediately in player list

### Deleting Players

**Considerations**
- Deletion is permanent and cannot be undone
- May affect game records that reference this player
- Confirmation dialog required before deletion

**Process**
1. Click delete button on player card
2. Confirmation dialog appears
3. If confirmed, DELETE /player/:id request sent
4. Player removed from database
5. Player list refreshes

---

## API Integration

### Player Endpoints

**Create Player**
- Endpoint: `POST /player`
- Authentication: Required (admin only)
- Request body includes all player fields
- Returns: Created player object with generated ID

**Get All Players / Search**
- Endpoint: `GET /player?search={term}`
- Authentication: Public access
- Query parameter `search` for filtering
- Returns: Array of player objects

**Get Player by ID**
- Endpoint: `GET /player/:id`
- Authentication: Public access
- Returns: Single player object with all statistics

**Update Player**
- Endpoint: `PATCH /player/:id`
- Authentication: Required (admin only)
- Request body includes fields to update
- Returns: Updated player object

**Delete Player**
- Endpoint: `DELETE /player/:id`
- Authentication: Required (admin only)
- Returns: Success message

**Get Player Games**
- Endpoint: `GET /player/:id/games`
- Authentication: Public access
- Returns: Recent games for player

**Get Shot Chart**
- Endpoint: `GET /player/:id/shot-chart`
- Authentication: Public access
- Returns: All shot data for visualization

---

## Database Schema

### Player Collection

```javascript
{
  _id: ObjectId,
  created_by: ObjectId (ref: User),
  name: String,
  instagram_handle: String,
  profile_image_url: String,
  bio: String,
  height_inches: Number,
  weight_lbs: Number,
  hometown: String,
  date_of_birth: Date,
  city: String,
  state: String,
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
  },
  all_time_shot_data: [{
    x: Number,
    y: Number,
    made: Boolean,
    points: Number,
    game_id: ObjectId,
    timestamp: Date
  }],
  createdAt: Date (auto-generated),
  updatedAt: Date (auto-generated)
}
```

---

## Frontend Implementation

### Files

**HTML**
- `player.html` - Player management interface

**JavaScript**
- `player.js` - Player CRUD operations and search functionality

**CSS**
- `shared.css` - Styling for player cards and forms

### Key Functions

**formatHeight(totalInches)**
- Converts stored inches to display format
- Returns: "Feet'Inches"" (e.g., "6'2"")
- Handles null/undefined values gracefully

**loadPlayers()**
- Fetches all players from API
- Populates player grid
- Handles errors and empty states

**handlePlayerFormSubmit()**
- Processes form data
- Converts feet/inches to total inches
- Creates or updates player via API
- Refreshes player list on success

**searchPlayers(term)**
- Debounced search function
- Filters players by name or Instagram handle
- Updates display with matching results

---

## Related Documentation

- [Database Schema](databaseSchema.md) - Detailed schema specifications
- [API Endpoints](apiEndpoints.md) - Complete API reference
- [Game Tracker](gameTracker.md) - How players are used in games
- [Statistics](stats.md) - Statistics calculation and display