# Code Structure

```
NextChapter/
├── backend/
│   ├── app.js                      # Express server entry point
│   ├── package.json                # Node dependencies
│   ├── package-lock.json           # Dependency lock file
│   ├── .env                        # Environment variables (not tracked)
│   ├── .gitignore                  # Git ignore rules
│   │
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication middleware
│   │
│   ├── routes/
│   │   ├── game.js                 # Game API endpoints
│   │   ├── player.js               # Player API endpoints
│   │   └── user.js                 # User authentication endpoints
│   │
│   ├── tables/
│   │   ├── game/
│   │   │   ├── model.js            # Game Mongoose schema
│   │   │   └── controller.js       # Game business logic
│   │   ├── player/
│   │   │   ├── model.js            # Player Mongoose schema
│   │   │   └── controller.js       # Player business logic
│   │   └── user/
│   │       ├── model.js            # User Mongoose schema
│   │       └── controller.js       # User business logic
│   │
│   ├── migrations/
│   │   └── migrate_players.js      # Database migration scripts
│   │
│   └── utils/
│       └── hashPassword.js         # Password hashing utility
│
├── frontend/
│   ├── index.html                  # Home page with stats table
│   ├── game.html                   # Game tracker/logging page
│   ├── games.html                  # Games list page
│   ├── player.html                 # Player management page
│   ├── player-stats.html           # Individual player stats page
│   ├── game-report.html            # Game report page
│   ├── game-report-template.html   # Game report template
│   │
│   ├── css/
│   │   └── shared.css              # Global stylesheet for all pages
│   │
│   ├── js/
│   │   ├── gameScript.js           # Game tracker functionality
│   │   ├── games.js                # Games list page logic
│   │   ├── player.js               # Player management logic
│   │   ├── player-stats.js         # Player stats page logic
│   │   ├── game-report.js          # Game report logic
│   │   └── game-report-template.js # Game report template logic
│   │
│   ├── utils/
│   │   ├── api.js                  # API client wrapper
│   │   └── app.js                  # Main app logic (stats table, etc.)
│   │
│   └── assets/
│       ├── basketballcourt.svg     # Basketball court graphic
│       ├── tnclogo.svg             # The Next Chapter logo (SVG)
│       └── tnc.png                 # The Next Chapter logo (PNG)
│
├── documentation/
│   ├── codeStructure.md            # This file - project structure
│   ├── homePage.md                 # Home page documentation
│   ├── stats.md                    # Stats feature documentation
│   ├── players.md                  # Players feature documentation
│   ├── games.md                    # Games feature documentation
│   ├── gameTracker.md              # Game tracker documentation
│   └── updates.md                  # Project updates/changelog
│
└── README.md                       # Project overview and setup guide
```

## Directory Overview

### Backend (`/backend`)
Node.js/Express server with MongoDB integration.

- **app.js**: Main server configuration, middleware setup, and route mounting
- **middleware/**: Authentication and authorization middleware
- **routes/**: API endpoint definitions
- **tables/**: Database models and controllers organized by entity
- **migrations/**: Database migration scripts
- **utils/**: Utility functions

### Frontend (`/frontend`)
Vanilla HTML/CSS/JavaScript frontend.

- **HTML files**: Individual pages for different features
- **css/**: Centralized stylesheet (`shared.css`)
- **js/**: Page-specific JavaScript modules
- **utils/**: Shared utilities (API client, main app logic)
- **assets/**: Images, logos, and SVG graphics

### Documentation (`/documentation`)
Project documentation in Markdown format.
