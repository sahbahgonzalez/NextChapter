# API Endpoints

Complete reference for all NextChapter API endpoints.

## Base URL

```
http://localhost:3000
```

---

## Authentication

### Login

Authenticate a user and receive a JWT token.

**Endpoint:** `POST /user/login`

**Request Body:**
```json
{
    "email": "admin@example.com",
    "password": "your_password"
}
```

**Response (200):**
```json
{
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "_id": "64abc123...",
        "email": "admin@example.com",
        "role": "admin"
    }
}
```

**Errors:**
- `400` - Missing email or password
- `401` - Invalid credentials

---

## Players

### Get All Players / Search Players

Retrieve all players or search by name/Instagram handle.

**Endpoint:** `GET /player`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search term for name or Instagram handle |
| `limit` | number | Maximum number of results to return |

**Examples:**
```
GET /player
GET /player?search=john
GET /player?limit=10
```

**Response (200):**
```json
[
    {
        "_id": "64abc123...",
        "name": "John Doe",
        "instagram_handle": "johndoe",
        "height_inches": 72,
        "weight_lbs": 185,
        "hometown": "Miami, FL",
        "overall_stats": {
            "games_played": 10,
            "wins": 7,
            "losses": 3,
            "total_points": 150
        }
    }
]
```

---

### Get Player by ID

Retrieve a specific player's details.

**Endpoint:** `GET /player/:id`

**Response (200):**
```json
{
    "_id": "64abc123...",
    "name": "John Doe",
    "instagram_handle": "johndoe",
    "profile_image_url": "../public/images/default_image.png",
    "bio": "Player at TheNextChapter!",
    "height_inches": 72,
    "weight_lbs": 185,
    "hometown": "Miami, FL",
    "overall_stats": { ... },
    "all_time_shot_data": [ ... ],
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-20T15:30:00.000Z"
}
```

**Errors:**
- `404` - Player not found

---

### Get Player's Recent Games

Retrieve games that a player has participated in.

**Endpoint:** `GET /player/:id/games`

**Response (200):**
```json
[
    {
        "_id": "64game123...",
        "game_type": "1v1",
        "status": "finished",
        "final_score": {
            "team_a": 11,
            "team_b": 7
        },
        "winner": "team_a",
        "createdAt": "2024-01-18T14:00:00.000Z"
    }
]
```

---

### Get Player Shot Chart

Retrieve all shot data for a player's shot chart visualization.

**Endpoint:** `GET /player/:id/shot-chart`

**Response (200):**
```json
{
    "playerId": "64abc123...",
    "shots": [
        {
            "x": 275,
            "y": 150,
            "made": true,
            "points": 2,
            "game_id": "64game123...",
            "timestamp": "2024-01-18T14:30:00.000Z"
        }
    ]
}
```

---

### Create Player (Admin Only)

Create a new player profile.

**Endpoint:** `POST /player`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
    "name": "John Doe",
    "instagram_handle": "johndoe",
    "height_inches": 72,
    "weight_lbs": 185,
    "hometown": "Miami, FL",
    "bio": "Rising star from Miami"
}
```

**Response (201):**
```json
{
    "message": "Player created successfully",
    "player": { ... }
}
```

**Errors:**
- `401` - Not authorized (no token)
- `403` - Forbidden (not admin)

---

### Update Player (Admin Only)

Update an existing player's details.

**Endpoint:** `PATCH /player/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:** (any fields to update)
```json
{
    "height_inches": 73,
    "weight_lbs": 190
}
```

**Response (200):**
```json
{
    "message": "Player updated successfully",
    "player": { ... }
}
```

**Errors:**
- `401` - Not authorized
- `403` - Forbidden (not admin)
- `404` - Player not found

---

### Delete Player (Admin Only)

Delete a player profile.

**Endpoint:** `DELETE /player/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
    "message": "Player deleted successfully"
}
```

**Errors:**
- `401` - Not authorized
- `403` - Forbidden (not admin)
- `404` - Player not found

---

## Games

### Get All Games

Retrieve all games.

**Endpoint:** `GET /game`

**Response (200):**
```json
[
    {
        "_id": "64game123...",
        "game_type": "1v1",
        "status": "finished",
        "teams": {
            "team_a": ["64player1..."],
            "team_b": ["64player2..."]
        },
        "final_score": {
            "team_a": 11,
            "team_b": 7
        },
        "winner": "team_a",
        "createdAt": "2024-01-18T14:00:00.000Z"
    }
]
```

---

### Get Game by ID

Retrieve a specific game with full details.

**Endpoint:** `GET /game/:id`

**Response (200):**
```json
{
    "_id": "64game123...",
    "game_type": "1v1",
    "status": "finished",
    "all_player_ids": ["64player1...", "64player2..."],
    "teams": {
        "team_a": ["64player1..."],
        "team_b": ["64player2..."]
    },
    "score_to_win": 11,
    "final_score": {
        "team_a": 11,
        "team_b": 7
    },
    "winner": "team_a",
    "events": [ ... ],
    "game_stats_summary": { ... },
    "createdAt": "2024-01-18T14:00:00.000Z"
}
```

**Errors:**
- `404` - Game not found

---

### Create Game (Admin Only)

Start a new game.

**Endpoint:** `POST /game`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
    "game_type": "1v1",
    "teams": {
        "team_a": ["64player1..."],
        "team_b": ["64player2..."]
    },
    "score_to_win": 11
}
```

**Response (201):**
```json
{
    "message": "Game created successfully",
    "game": { ... }
}
```

---

### Add Game Event (Admin Only)

Record an event during a game (shot, rebound, etc.).

**Endpoint:** `POST /game/:id/event`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body (Shot):**
```json
{
    "type": "shot",
    "player_id": "64player1...",
    "team": "team_a",
    "location": { "x": 275, "y": 150 },
    "made": true,
    "points": 2
}
```

**Request Body (Rebound):**
```json
{
    "type": "rebound",
    "player_id": "64player1...",
    "team": "team_a",
    "rebound_type": "offensive"
}
```

**Event Types:**
- `shot` - Requires `location`, `made`, `points`
- `rebound` - Requires `rebound_type` (offensive/defensive)
- `turnover` - Optional `turnover_type`
- `steal`
- `block`
- `foul`
- `free_throw` - Requires `made`, `points`

**Response (200):**
```json
{
    "message": "Event added successfully",
    "game": { ... }
}
```

---

### Finalize Game (Admin Only)

End a game and calculate final stats.

**Endpoint:** `PATCH /game/:id/finish`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
    "message": "Game finalized successfully",
    "game": {
        "status": "finished",
        "winner": "team_a",
        "final_score": {
            "team_a": 11,
            "team_b": 7
        }
    }
}
```

---

### Cancel Game (Admin Only)

Cancel a game in progress.

**Endpoint:** `PATCH /game/:id/cancel`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
    "message": "Game canceled successfully",
    "game": {
        "status": "canceled"
    }
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
    "message": "Error description here"
}
```

**Common HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |
