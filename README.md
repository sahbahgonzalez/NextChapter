# NextChapter

A full-stack basketball shot logging and player analytics application. Track player performance, log shots, and analyze game statistics in real-time.

<<<<<<< HEAD
## 📋 Table of Contents
=======
## Table of Contents
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Database](#database)
- [Development](#development)

<<<<<<< HEAD
## ✨ Features
=======
## Features
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

- **Player Management**: Create, update, and manage player profiles
- **Shot Logging**: Record shot attempts with coordinates, points, and game details
- **Game Tracking**: Log complete games with multiple players and teams
- **Player Statistics**: View overall stats, shooting percentages, and performance metrics
- **User Authentication**: Secure login with JWT tokens
- **Responsive Design**: Works on desktop and mobile devices
- **Search Functionality**: Search and filter players by name or Instagram handle

<<<<<<< HEAD
## 🛠 Tech Stack
=======
## Tech Stack
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### Backend
- **Node.js** with Express.js
- **MongoDB Atlas** for database
- **Mongoose** for ODM
- **JWT** for authentication
- **bcryptjs** for password hashing
- **CORS** enabled for frontend communication

### Frontend
- **HTML5** with responsive design
- **Vanilla JavaScript** (no framework dependencies)
- **Fetch API** for HTTP requests

<<<<<<< HEAD
## 📁 Project Structure
=======
## Project Structure
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

```
NextChapter/
├── backend/
│   ├── app.js                 # Express server entry point
│   ├── package.json           # Node dependencies
│   ├── .env                   # Environment variables
│   ├── middleware/
│   │   └── auth.js            # JWT authentication middleware
│   ├── routes/
│   │   ├── game.js            # Game endpoints
│   │   ├── player.js          # Player endpoints
│   │   └── user.js            # User authentication endpoints
│   ├── tables/
│   │   ├── game/
│   │   │   ├── model.js       # Game schema
│   │   │   └── controller.js  # Game logic
│   │   ├── player/
│   │   │   ├── model.js       # Player schema
│   │   │   └── controller.js  # Player logic
│   │   └── user/
│   │       ├── model.js       # User schema
│   │       └── controller.js  # User logic
│   ├── migrations/
│   │   └── migrate_players.js # Database migrations
<<<<<<< HEAD
│   ├── utils/
│   │   └── hashPassword.js    # Password hashing utility
│   └── public/
│       └── images/            # Static images
├── frontend/
│   ├── index.html             # Main application page
│   ├── game.html              # Game view page
│   ├── gameScript.js          # Game logic
│   ├── styles.css             # Global styles
│   ├── utils/
│   │   ├── api.js             # API client wrapper
│   │   └── app.js             # Frontend utilities
│   └── public/                # Static assets
└── README.md                  # This file
```

## 🚀 Installation
=======
│   └── utils/
│       └── hashPassword.js    # Password hashing utility
├── frontend/
│   ├── index.html             # Main application page
│   ├── game.html              # Game tracker page
│   ├── games.html             # Games list page
│   ├── player.html            # Player management page
│   ├── player-stats.html      # Player statistics page
│   ├── css/
│   │   └── shared.css         # Global styles
│   ├── js/
│   │   ├── gameScript.js      # Game tracker logic
│   │   ├── games.js           # Games page logic
│   │   ├── player.js          # Player page logic
│   │   └── player-stats.js    # Player stats logic
│   ├── utils/
│   │   ├── api.js             # API client wrapper
│   │   └── app.js             # Frontend utilities
│   └── assets/                # Static assets (images, SVGs)
├── documentation/             # Project documentation
└── README.md                  # This file
```

## Installation
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account
- npm or yarn

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/NextChapter.git
   cd NextChapter
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the `backend` directory with:
   ```
   PORT=3000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0
   JWT_SECRET=your_jwt_secret_key
   ```

4. **Start the backend server**
   ```bash
   npm start        # Production
   npm run dev      # Development with nodemon
   ```

5. **Open the frontend**
   - Navigate to `http://localhost:3000` in your browser
   - The frontend files are served automatically by Express

<<<<<<< HEAD
## ⚙️ Configuration
=======
## Configuration
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### MongoDB Connection
Update the `MONGODB_URI` in your `.env` file with your MongoDB Atlas connection string. Format:
```
mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0
```

**Note**: Make sure your IP address is whitelisted in MongoDB Atlas Network Access settings.

### JWT Secret
Change the `JWT_SECRET` to a secure random string for production use.

### Database Name
The application uses the `nextChapterDb` database by default.

<<<<<<< HEAD
## 💻 Usage
=======
## Usage
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### Running the Application

**Development Mode** (with hot reload):
```bash
cd backend
npm run dev
```

**Production Mode**:
```bash
cd backend
npm start
```

### Testing Database Connection
```bash
cd backend
node test-connection.js
```

### Running Migrations
```bash
cd backend
npm run migrate:players
```

<<<<<<< HEAD
## 🔌 API Endpoints
=======
## API Endpoints
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

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

<<<<<<< HEAD
## 🗄️ Database
=======
## Database
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### Collections

**Users**
- Stores user accounts with hashed passwords
- JWT authentication tokens generated on login

**Players**
- Player profiles with basic info (name, height, weight, hometown)
- Instagram handle and profile image
- Shot statistics and performance metrics

**Games**
- Game records with teams, scores, and status
- References to all participating players
- Shot data for performance tracking

<<<<<<< HEAD
## 🔧 Development
=======
## Development
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98

### Adding New Features

1. Create a new controller in `backend/tables/{entity}/controller.js`
2. Define the schema in `backend/tables/{entity}/model.js`
3. Add routes in `backend/routes/{entity}.js`
4. Update the frontend API client in `frontend/utils/api.js`

### Common Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start backend server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run migrate:players` | Run database migrations |
| `node test-connection.js` | Test MongoDB connection |

### Troubleshooting

**MongoDB Connection Failed**
- Verify your `.env` file has the correct `MONGODB_URI`
- Check that your IP is whitelisted in MongoDB Atlas
- Ensure the cluster is not paused
- Verify username and password are correct

**Port Already in Use**
- Change the `PORT` in `.env` file
- Or kill the process using port 3000

**CORS Errors**
- Ensure the frontend is served from the same origin as the API
- Check that CORS is properly enabled in `app.js`

<<<<<<< HEAD
## 📝 License

ISC

## 👤 Author

Lazaro Loureiro

---

**Last Updated**: January 2026
=======
## License

ISC

## Authors

- Lazaro Loureiro
- Daniel Arriaga-Franco

---

**Last Updated**: January 2026
>>>>>>> 24e3e91f6f8cfa0c569c59b1611bf2c232feaf98
