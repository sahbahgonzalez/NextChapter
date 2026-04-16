# NextChapter

A frontend basketball shot logging and player analytics application. Track player performance, log shots in real-time, view live shot charts, and generate game reports.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Usage](#usage)
- [Pages](#pages)
- [API Endpoints](#api-endpoints)
- [Documentation](#documentation)

## Features

- **Player Management**: Create, update, and manage player profiles
- **Real-Time Game Tracking**: Log complete games with multiple players and teams using an interactive basketball court
- **Shot Logging**: Record shot attempts (2PT, 3PT, 4PT, FT) with coordinates and court zone detection
- **Live Shot Chart**: Visual shot chart overlay on the court with make/miss indicators per player
- **Action History**: Full action log per team with timestamps, notes, highlights, and targeted undo/delete
- **Foul Tracking**: Log committed and received fouls between players
- **Stats Panel**: Toggle between individual player stats and team totals per side
- **Game Reports**: Auto-generated post-game reports with per-player stats and shot breakdowns
- **PDF Export**: Download game reports as PDFs from the end-game modal or the report page
- **Player Statistics**: View overall stats, shooting percentages, and performance metrics
- **User Authentication**: Secure login with JWT tokens
- **Responsive Design**: Works on desktop and mobile devices
- **Search Functionality**: Search and filter players by name or Instagram handle

## Tech Stack

### Frontend
- **HTML5** with responsive design
- **Vanilla JavaScript** (no framework dependencies)
- **Fetch API** for HTTP requests
- **html2pdf.js** for PDF generation
- **SVG** basketball court with interactive zone detection

### Backend (Hosted separately)
- **Node.js** with Express.js
- **MongoDB Atlas** for database
- **JWT** for authentication
- Repo: [the-next-chapter-backend](https://github.com/Fedmichard/the-next-chapter-backend)

## Project Structure

```
NextChapter/
├── frontend/
│   ├── index.html                  # Home / player search page
│   ├── game.html                   # Live game tracker
│   ├── game-report.html            # Post-game report page
│   ├── game-report-template.html   # PDF report template
│   ├── games.html                  # Games list page
│   ├── live-shot-chart.html        # Live shot chart overlay
│   ├── player.html                 # Player management page
│   ├── player-stats.html           # Player statistics page
│   ├── css/
│   │   └── shared.css              # Global styles
│   ├── js/
│   │   ├── gameScript.js           # Game tracker logic
│   │   ├── game-report.js          # Game report logic
│   │   ├── games.js                # Games list logic
│   │   ├── live-shot-chart.js      # Live shot chart logic
│   │   ├── player.js               # Player page logic
│   │   └── player-stats.js         # Player stats logic
│   ├── utils/
│   │   ├── api.js                  # API client wrapper
│   │   └── app.js                  # Frontend utilities
│   └── assets/
│       ├── basketballcourt.svg     # Interactive court SVG
│       ├── default-court-image.svg # Fallback court image
│       ├── tnc.png                 # App logo
│       └── tnclogo.svg             # App logo SVG
├── documentation/                  # Project documentation
└── README.md                       # This file
```

## Usage

Open `frontend/index.html` in a browser or serve the `frontend/` directory with any static file server. The app connects to the configured backend API.

### Quick Start with a local server

```bash
# Using Python
python -m http.server 8080 --directory frontend

# Using Node.js (npx)
npx serve frontend
```

Then navigate to `http://localhost:8080`.

## Pages

### Home (`index.html`)
Search and browse players. Entry point for the app.

### Game Tracker (`game.html`)
Real-time game logging with:
- Interactive basketball court with zone-based shot detection (2PT, 3PT, 4PT paint)
- Dual team panels with active player selection
- Action log per team (shots, fouls, timeouts, team switches)
- Hotkeys for quick shot entry
- Stats toggle between player view and team totals
- Undo (global) and targeted delete per action row
- End-game modal with PDF download

### Live Shot Chart (`live-shot-chart.html`)
Visual overlay of all shots taken during a game, per player, on the court SVG.

### Game Report (`game-report.html`)
Post-game summary with per-player stats, shot breakdowns, and PDF export support (`?autodownload=1` triggers automatic download).

### Games List (`games.html`)
Browse all logged games with scores and statuses.

### Player Stats (`player-stats.html`)
Career and per-game statistics for individual players.

## API Endpoints

### Authentication
- `POST /user/login` - User login
- `POST /user/register` - User registration

### Players
- `GET /player` - Get all players or search players
- `GET /player/:id` - Get player by ID
- `GET /player/:id/games` - Get player's recent games
- `POST /player` - Create new player (admin only)
- `PATCH /player/:id` - Update player (admin only)
- `DELETE /player/:id` - Delete player (admin only)

### Games
- `GET /game` - Get all games
- `GET /game/:id` - Get game by ID
- `POST /game` - Create new game (admin only)
- `PATCH /game/:id` - Update game (admin only)
- `DELETE /game/:id` - Delete game (admin only)

## Documentation

Detailed documentation lives in the `documentation/` folder:

| File | Description |
|------|-------------|
| `gameTracker.md` | Game tracker features, court zones, action history, hotkeys |
| `games.md` | Games list page behavior |
| `stats.md` | Stats tracking and calculations |
| `apiEndpoints.md` | Full API reference |
| `updates.md` | Changelog and feature history |

## Authors

- Daniel Arriaga (Team Lead)
- Lazaro Loureiro
- Gloria Mayo
- Fedmichard Francois

---

**Last Updated**: April 2026
