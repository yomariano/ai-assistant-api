# AI Assistant API

Backend API for the AI Voice Assistant SaaS, built with Node.js, Express, and Supabase.

## Features

- User authentication (register, login, JWT)
- User profile management
- AI-powered phone calls via VAPI
- Save calls for reuse
- Schedule calls for later
- Call history

## Prerequisites

- Node.js 18+
- Supabase account
- VAPI account

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd ai-assistant-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# VAPI
VAPI_API_KEY=your-vapi-api-key
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id
VAPI_ASSISTANT_ID=your-vapi-assistant-id

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3001
```

### 3. Set up Supabase database

1. Go to your Supabase project
2. Open SQL Editor
3. Run the SQL from `supabase/schema.sql`

### 4. Run the server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/refresh` | Refresh JWT token |

### User Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/profile` | Get profile |
| PUT | `/api/users/profile` | Update profile |
| GET | `/api/users/stats` | Get user statistics |

### Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/calls` | Create a new call |
| GET | `/api/calls/:id/status` | Get call status |

### Saved Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/saved-calls` | List saved calls |
| POST | `/api/saved-calls` | Create saved call |
| GET | `/api/saved-calls/:id` | Get saved call |
| PUT | `/api/saved-calls/:id` | Update saved call |
| DELETE | `/api/saved-calls/:id` | Delete saved call |
| POST | `/api/saved-calls/:id/use` | Mark as used |

### Scheduled Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduled-calls` | List scheduled calls |
| POST | `/api/scheduled-calls` | Schedule a call |
| GET | `/api/scheduled-calls/:id` | Get scheduled call |
| PUT | `/api/scheduled-calls/:id` | Update scheduled call |
| DELETE | `/api/scheduled-calls/:id` | Cancel scheduled call |

### Call History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/history` | Get call history |
| GET | `/api/history/:id` | Get specific call |

## Deployment

### Railway / Render / Fly.io

1. Connect your GitHub repo
2. Set environment variables
3. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## License

MIT
