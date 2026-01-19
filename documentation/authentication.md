# Authentication

JWT-based authentication system for NextChapter.

## Overview

NextChapter uses JSON Web Tokens (JWT) for secure authentication. Admin users log in with email/password credentials and receive a token that must be included in subsequent requests to protected endpoints.

---

## Authentication Flow

```
1. User submits email + password to POST /user/login
                    |
                    v
2. Server validates credentials against hashed password in database
                    |
                    v
3. If valid, server generates JWT token containing user ID
                    |
                    v
4. Token is returned to client and stored (localStorage)
                    |
                    v
5. Client includes token in Authorization header for protected requests
                    |
                    v
6. Server validates token and allows/denies access
```

---

## Login

### Endpoint

```
POST /user/login
```

### Request

```json
{
    "email": "admin@example.com",
    "password": "your_password"
}
```

### Response (Success)

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

### Response (Failure)

```json
{
    "message": "Invalid credentials"
}
```

---

## Token Structure

JWT tokens contain the following payload:

```json
{
    "userId": "64abc123...",
    "iat": 1705432800,
    "exp": 1705519200
}
```

| Field | Description |
|-------|-------------|
| `userId` | MongoDB ObjectId of the authenticated user |
| `iat` | Issued At - Unix timestamp when token was created |
| `exp` | Expiration - Unix timestamp when token expires |

---

## Using Protected Endpoints

### Authorization Header

Include the JWT token in the `Authorization` header using the Bearer scheme:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example Request

```javascript
fetch('/player', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
        name: 'John Doe',
        instagram_handle: 'johndoe'
    })
});
```

---

## Middleware

### protect

Verifies the JWT token and attaches the user to the request object.

**Location:** `backend/middleware/auth.js`

**Behavior:**
1. Extracts token from `Authorization` header (Bearer scheme)
2. Verifies token signature using `JWT_SECRET`
3. Fetches user from database by `userId` in token payload
4. Attaches user object to `req.user`
5. Proceeds to next middleware or returns 401 error

**Error Responses:**
- `401` - "Not authorized, no token" (no token provided)
- `401` - "Not authorized, token failed" (invalid/expired token)
- `401` - "Not authorized, user not found" (user deleted but token valid)

### restrictTo

Restricts access to users with specific roles. Must be used after `protect` middleware.

**Location:** `backend/middleware/auth.js`

**Usage:**
```javascript
router.post('/', protect, restrictTo('admin'), controller.createPlayer);
```

**Behavior:**
1. Checks `req.user.role` (populated by `protect` middleware)
2. Allows request if user has required role
3. Returns 403 Forbidden if role doesn't match

**Error Response:**
- `403` - "Forbidden: You do not have permission to perform this action"

---

## Protected vs Public Endpoints

### Public Endpoints (No Token Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/user/login` | User login |
| GET | `/player` | Search/list players |
| GET | `/player/:id` | Get player details |
| GET | `/player/:id/games` | Get player's games |
| GET | `/player/:id/shot-chart` | Get player shot data |
| GET | `/game` | List all games |
| GET | `/game/:id` | Get game details |

### Protected Endpoints (Admin Token Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/player` | Create player |
| PATCH | `/player/:id` | Update player |
| DELETE | `/player/:id` | Delete player |
| POST | `/game` | Create game |
| POST | `/game/:id/event` | Add game event |
| PATCH | `/game/:id/finish` | Finalize game |
| PATCH | `/game/:id/cancel` | Cancel game |

---

## Frontend Implementation

### Storing the Token

```javascript
// After successful login
localStorage.setItem('token', response.token);
```

### Retrieving the Token

```javascript
const token = localStorage.getItem('token');
```

### Logging Out

```javascript
localStorage.removeItem('token');
window.location.href = '/login.html';
```

### API Client Methods

The frontend `apiClient` (`frontend/utils/api.js`) handles token management:

```javascript
// Get stored token
apiClient.getToken()

// Set token after login
apiClient.setToken(token)

// Clear token on logout
apiClient.logout()

// Automatically includes token in protected requests
apiClient.createPlayer(playerData)
```

---

## Password Security

Passwords are hashed using bcryptjs before storage:

```javascript
const bcrypt = require('bcryptjs');
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);
```

**Hash Verification:**
```javascript
const isMatch = await bcrypt.compare(inputPassword, storedHashedPassword);
```

---

## Environment Configuration

Required environment variable in `.env`:

```
JWT_SECRET=your_super_secret_key_here
```

**Security Notes:**
- Use a strong, random string for `JWT_SECRET`
- Never commit `.env` to version control
- Rotate the secret periodically in production

---

## Roles

Currently supported roles:

| Role | Permissions |
|------|-------------|
| `admin` | Full access to all CRUD operations |

Future roles could include:
- `viewer` - Read-only access
- `scorer` - Can log game events but not create/delete entities
