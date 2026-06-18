# 🃏 Carded Backend — Express.js + PostgreSQL (Neon) + Vercel

Backend API for the Carded app using Express, PostgreSQL on Neon, JWT auth, email support, and account deletion requests.

---

## 📁 Structure

```
src/
├── index.js             # App entry, middleware, routing
├── db/
│   ├── pool.js          # PostgreSQL connection pool
│   ├── schema.sql       # Neon schema for users/cards/collected
│   └── migrate.js       # CLI migration runner
├── middleware/
│   └── auth.js          # JWT auth middleware
├── routes/
│   ├── auth.js          # /auth/* endpoints
│   ├── cards.js         # /cards/* endpoints
│   ├── collected.js     # /collected/* endpoints
│   └── deleteAccount.js # /delete-account form + email request
└── utils/
    └── mailer.js        # SMTP mailer helper

.env.example              # env vars for local dev
package.json              # scripts, dependencies
vercel.json               # Vercel config
```

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and update the values before running locally.

Required:
```
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-your-endpoint.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=your_long_random_secret
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_gmail_app_password
```

Optional:
```
NODE_ENV=production
BASE_URL=https://your-app.vercel.app
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

---

## 🗄️ Step 1 — Initialize Database

Run the Neon schema once in the Neon SQL editor, or locally via CLI:

```bash
npm install
cp .env.example .env
# update DATABASE_URL and other env values
node src/db/migrate.js
```

---

## 🚀 Step 2 — Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Then visit:

- `http://localhost:3000/health`
- `http://localhost:3000/api-docs`
- `http://localhost:3000/delete-account`

---

## 🔌 API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | /health | ❌ | Health check |
| GET | /delete-account | ❌ | Account deletion request form |
| POST | /delete-account | ❌ | Submit account deletion request |
| POST | /auth/register | ❌ | Register |
| POST | /auth/login | ❌ | Login |
| GET | /auth/me | ✅ | Get current profile |
| PUT | /auth/password | ✅ | Change password |
| POST | /auth/forgot-password | ❌ | Request password reset |
| GET | /cards | ✅ | List my cards |
| POST | /cards | ✅ | Create a card (max 5) |
| GET | /cards/:id | ✅ | Get card details |
| PUT | /cards/:id | ✅ | Update card |
| DELETE | /cards/:id | ✅ | Delete card |
| GET | /collected | ✅ | List collected cards |
| POST | /collected | ✅ | Save scanned card |
| GET | /collected/:id | ✅ | Get collected card |
| PUT | /collected/:id | ✅ | Update tags/remarks |
| DELETE | /collected/:id | ✅ | Delete collected card |

---

## 📄 API Reference

### Auth

| Method | Route | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/auth/register` | ❌ | `fullName, email, phone, password` | Register new user |
| POST | `/auth/login` | ❌ | `emailOrPhone, password` | Login |
| GET | `/auth/me` | ✅ | — | Get current user profile |
| PUT | `/auth/password` | ✅ | `currentPassword, newPassword` | Change password |
| POST | `/auth/forgot-password` | ❌ | `emailOrPhone` | Request password reset |

### Delete Account

| Method | Route | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/delete-account` | ❌ | — | Show deletion request form |
| POST | `/delete-account` | ❌ | `email, confirm, reason?` | Send deletion request email to admin |

### My Cards

| Method | Route | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/cards` | ✅ | — | Get all my cards |
| POST | `/cards` | ✅ | Card fields | Create new card |
| GET | `/cards/:id` | ✅ | — | Get card by id |
| PUT | `/cards/:id` | ✅ | Card fields (partial ok) | Update card |
| DELETE | `/cards/:id` | ✅ | — | Delete card |

### Collected Cards

| Method | Route | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/collected` | ✅ | — | Get all collected cards |
| POST | `/collected` | ✅ | Card fields | Save scanned card |
| GET | `/collected/:id` | ✅ | — | Get single collected card |
| PUT | `/collected/:id` | ✅ | `category?, leadType?, remarks?` | Update tags/notes |
| DELETE | `/collected/:id` | ✅ | — | Delete collected card |

### Auth header format

```
Authorization: Bearer <jwt_token>
```

---

## 🚀 Deploy to Vercel

```bash
npm i -g vercel
vercel
vercel --prod
```

In Vercel dashboard, set the following environment variables:

```
DATABASE_URL
JWT_SECRET
SMTP_USER
SMTP_PASS
NODE_ENV=production
```

---

## 🧪 Quick Local Tests

Health:
```bash
curl http://localhost:3000/health
```

Register:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"John Doe","email":"john@test.com","phone":"9876543210","password":"test123"}'
```

---

## 📝 Notes

- Email sending is handled in `src/utils/mailer.js` via SMTP.
- Account deletion requests are submitted through `/delete-account` and emailed to `ADMIN_EMAIL`.
- The app uses PostgreSQL via `src/db/pool.js` and schema in `src/db/schema.sql`.
- Swagger docs are available at `/api-docs`.
