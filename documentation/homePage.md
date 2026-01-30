# Home Page Documentation

## Overview

The home page (`index.html`) serves as the main landing page and statistics dashboard for the NextChapter basketball statistics platform. It displays an overview of all players with their career statistics in a sortable table format.

---

## Page Structure

### Header Navigation

**Logo**
- TheNextChapter logo (SVG format)
- Serves as home link
- Prominent branding element

**Navigation Links**
- **Players**: Navigate to player management page
- **Games**: View all recorded games
- **Log Game**: Access game tracker (admin only)
- **Sign In**: Display login modal (when not authenticated)
- **Sign Out**: Logout and return to home (when authenticated)

**Authentication State**
- Links visibility controlled by authentication status
- "Log Game" only visible when admin is logged in
- Token stored in localStorage
- Auto-refresh on login/logout

### Main Content Area

**Stats Table**
- Primary content of home page
- Displays all players with career statistics
- Sortable by any column
- Responsive design for various screen sizes

---

## Statistics Table

### Columns Displayed

**Player**
- Player name
- Links to individual player stats page
- Primary identifier

**GP (Games Played)**
- Total number of games
- Numeric sort

**W (Wins)**
- Number of games won
- Numeric sort

**L (Losses)**
- Number of games lost
- Numeric sort

**W% (Win Percentage)**
- Calculated: (Wins / Games Played) × 100
- Formatted to one decimal place
- Example: "65.4%"
- Descending sort by default

**PTS (Points)**
- Total career points scored
- Default sort column (descending)
- Primary performance metric

**FG% (Field Goal Percentage)**
- Made / Attempted field goals
- Includes both 2PT and 3PT shots
- Formatted: "XX.X%"
- Shows "0.0%" if no attempts

**3P% (Three-Point Percentage)**
- Made / Attempted three-pointers
- Formatted: "XX.X%"
- Shows "0.0%" if no attempts

**FT% (Free Throw Percentage)**
- Made / Attempted free throws
- Formatted: "XX.X%"
- Shows "0.0%" if no attempts

### Table Features

**Sortable Columns**
- Click any column header to sort
- Initial click: Ascending order
- Second click: Descending order
- Visual indicator shows current sort
- Maintains data relationships

**Data Loading**
- Fetches from API on page load
- Shows loading state during fetch
- Error handling for failed requests
- Empty state if no players exist

**Responsive Design**
- Table scrolls horizontally on small screens
- Maintains readability across devices
- Touch-friendly for mobile users

---

## Authentication System

### Login Modal

**Trigger:**
- Click "Sign In" navigation link
- Overlay modal appears
- Focus on email input

**Form Fields:**
- Email address (required)
- Password (required)
- Submit button
- Cancel button

**Validation:**
- Both fields must be filled
- Email validated on backend
- Password verified against hash

**Success Flow:**
1. User enters credentials
2. Submit button clicked or Enter key pressed
3. API request to POST /user/login
4. JWT token received
5. Token stored in localStorage
6. Page refreshes to update navigation
7. Admin features become accessible

**Error Handling:**
- Invalid credentials: Alert with error message
- Network errors: Alert with connection issue
- Form validation: Alert to complete fields

### Authentication State

**When Logged In:**
- "Sign In" link hidden
- "Sign Out" link visible
- "Log Game" link visible
- Can create/edit players
- Can create/manage games
- Can access all admin features

**When Logged Out:**
- "Sign In" link visible
- "Sign Out" link hidden
- "Log Game" link hidden
- View-only access to statistics
- Cannot create or edit data

---

## Data Loading

### Initial Page Load

**Process:**
1. DOM content loaded event fires
2. Check authentication state
3. Setup navigation visibility
4. Fetch all players from API
5. Sort by total points (descending)
6. Populate statistics table
7. Attach event listeners

**API Call:**
```javascript
GET /player
```

**Response Processing:**
- Store players in local array
- Calculate percentages
- Sort by points
- Generate table rows
- Insert into DOM

### Statistics Calculation

**Win Percentage:**
```javascript
const winPct = player.overall_stats.games_played > 0 ?
  (player.overall_stats.wins / player.overall_stats.games_played * 100).toFixed(1) :
  '0.0';
```

**Field Goal Percentage:**
```javascript
const fgPct = player.overall_stats.total_fga > 0 ?
  (player.overall_stats.total_fgm / player.overall_stats.total_fga * 100).toFixed(1) :
  '0.0';
```

**Three-Point Percentage:**
```javascript
const threePct = player.overall_stats.total_3pa > 0 ?
  (player.overall_stats.total_3pm / player.overall_stats.total_3pa * 100).toFixed(1) :
  '0.0';
```

**Free Throw Percentage:**
```javascript
const ftPct = player.overall_stats.total_fta > 0 ?
  (player.overall_stats.total_ftm / player.overall_stats.total_fta * 100).toFixed(1) :
  '0.0';
```

---

## User Interactions

### Sorting Table

**Click Column Header:**
- Sort table by that column
- Toggle between ascending/descending
- Update visual sort indicator
- Maintain other data relationships

**Sort Types:**
- Numeric: GP, W, L, W%, PTS, FG%, 3P%, FT%
- String: Player name (alphabetical)

### Viewing Player Details

**Click Player Name:**
- Navigate to player-stats.html?id=player_id
- Shows detailed player profile
- Displays career statistics
- Shows recent games
- Displays shot chart

### Navigation

**Click Navigation Links:**
- Players: View/manage player profiles
- Games: View all game records
- Log Game: Access game tracker (admin only)

---

## Frontend Implementation

### Files

**HTML**
- `index.html` - Home page structure and table

**JavaScript**
- `utils/app.js` - Main statistics table logic
- `utils/api.js` - API client for data fetching

**CSS**
- `css/shared.css` - Styling for entire application

### Key Functions

**loadPlayersStats()**
- Fetches all players from API
- Processes statistics
- Populates table
- Sets up sorting

**sortTable(column, type)**
- Sorts table by specified column
- Handles numeric and string sorts
- Updates UI indicators

**formatPercentage(made, attempted)**
- Calculates percentage
- Formats to one decimal
- Handles zero attempts case

**setupNavigation()**
- Checks authentication status
- Shows/hides appropriate links
- Attaches event listeners

**showLoginModal()**
- Displays login overlay
- Clears previous input
- Focuses email field
- Handles form submission

---

## API Integration

### Endpoints Used

**Get All Players:**
```
GET /player
```

Returns array of all players with complete statistics

**Login:**
```
POST /user/login
```

Authenticates user and returns JWT token

---

## Styling

### Visual Design

**Color Scheme**
- Primary: Basketball court colors
- Accent: Brand colors from logo
- Text: High contrast for readability
- Links: Distinct from regular text

**Layout**
- Centered content container
- Maximum width for readability
- Responsive padding and margins
- Clean table design

**Typography**
- Sans-serif font family
- Clear hierarchy (headers vs. data)
- Appropriate sizing for statistics
- Bold for emphasis

### Responsive Design

**Desktop (>768px)**
- Full table visible
- All columns displayed
- Optimal column widths
- Hover effects on rows

**Tablet (768px - 480px)**
- Horizontal scroll for table
- Maintain all columns
- Touch-friendly spacing
- Adjusted padding

**Mobile (<480px)**
- Horizontal scroll required
- Compact layout
- Touch-optimized buttons
- Stacked navigation if needed

---

## Error Handling

### Failed API Requests

**Network Errors:**
- Display user-friendly error message
- Provide retry option
- Log error to console for debugging

**Empty Data:**
- Show message: "No players found"
- Provide link to player management
- Explain how to add players (for admins)

### Authentication Failures

**Invalid Credentials:**
- Alert with clear error message
- Keep modal open for retry
- Clear password field
- Focus on password input

**Expired Token:**
- Automatically log out user
- Redirect to home page
- Show login modal
- Explain session expired

---

## Performance Considerations

### Data Loading

**Initial Load:**
- Single API request for all players
- Process data client-side
- No pagination needed for typical use
- Cache in memory during session

**Sorting:**
- Client-side sorting (no API calls)
- Fast for typical player counts
- Instant feedback to user
- No network latency

### Optimization

**Efficient DOM Updates:**
- Batch table row creation
- Use document fragments
- Minimize reflows
- Event delegation where possible

**Caching:**
- Store authentication token
- Cache player data during session
- Reduce redundant API calls

---

## Related Documentation

- [Players](players.md) - Player management system
- [Statistics](stats.md) - Statistics calculation details
- [API Endpoints](apiEndpoints.md) - API reference
- [Authentication](authentication.md) - Auth system details