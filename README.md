# spendalyzer.

A personal finance app that connects to your bank accounts via Plaid, categorizes your transactions with AI, and surfaces spending insights through an interactive dashboard.

---

## Features

### Dashboard & Analytics
- **Overview** — spending summary with month-over-month comparison, monthly bar chart, category breakdown, and day-of-week spending patterns
- **Transactions** — searchable, filterable transaction list with inline category and note editing
- **Ledger** — full picture view including income, transfers, and duplicates with CSV export
- **Merchants** — spending by merchant with drill-down and display name overrides
- **Categories** — spending by category with drill-down and custom category mapping rules

### Planning & Tracking
- **Tracker** — goals, budget pacing, recurring subscriptions, and a financial health tab
- **Canvas** — drag-and-drop dashboard builder with metric, bar, line, pie, and Sankey chart widgets
- **Advisor** — AI chat powered by Claude with financial goal management and streaming responses

### Data & Sync
- Plaid integration for automatic transaction sync across multiple institutions
- Duplicate detection and transfer flagging
- AI-powered merchant name normalization (Voyage embeddings)
- Recurring transaction detection
- Proactive nudges (category spikes, price changes, missing recurring charges, large transactions)

### UX
- Dark/light theme
- Mobile-responsive layout with bottom navigation
- Global date range and account filters
- Email verification, password reset, and soft account deletion with grace period

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State / Data fetching | TanStack Query v5 |
| Charts | Recharts |
| Dashboard grid | react-grid-layout |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL (via psycopg2 connection pool) |
| Bank data | Plaid API |
| AI chat | Anthropic Claude API |
| Merchant normalization | Voyage AI embeddings |
| Email | Resend |
| Deployment | Render (backend), Vercel (frontend) |

---

## Project Structure

```
├── backend/              # FastAPI application
│   ├── main.py           # App setup, middleware, router registration
│   ├── dependencies.py   # Auth, filter helpers
│   ├── routers/          # One file per feature domain
│   │   ├── auth.py
│   │   ├── insights.py
│   │   ├── transactions.py
│   │   ├── ledger.py
│   │   ├── merchants.py
│   │   ├── categories.py
│   │   ├── accounts.py
│   │   ├── plaid.py
│   │   ├── sync.py
│   │   ├── settings.py
│   │   ├── workspace.py
│   │   ├── canvas.py
│   │   └── advisor.py
│   └── requirements.txt
├── core/                 # Domain logic (no HTTP)
│   ├── db.py             # All database access
│   ├── insights.py       # Analytics pipeline + per-user DataFrame cache
│   ├── categorize.py     # Category mapping
│   ├── dedup.py          # Duplicate and transfer detection
│   ├── embeddings.py     # Voyage AI merchant normalization
│   ├── analysis.py       # Nudge generation
│   └── crypto.py
├── services/
│   ├── pull.py           # Plaid sync pipeline
│   └── link.py           # Plaid Link token helpers
├── frontend/             # React + Vite SPA
│   ├── src/
│   │   ├── pages/        # One file per route
│   │   ├── components/   # Shared UI components
│   │   ├── context/      # Auth, Theme, Filter, Workspace providers
│   │   ├── lib/
│   │   │   ├── api.ts    # Typed API client (axios)
│   │   │   └── utils.ts
│   │   └── main.tsx
│   └── vite.config.ts
├── Dockerfile            # Backend container (used by Render)
└── requirements.txt      # Root-level deps (local dev / scripts)
```

---

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 18+
- A PostgreSQL database
- Plaid developer account (sandbox is free)
- Anthropic API key
- Voyage AI API key
- Resend account (for email)

### Backend

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start the API server
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`, so no CORS config is needed locally.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://user:password@host/dbname

# Auth
JWT_SECRET_KEY=your-secret-key
SECURE_COOKIES=false          # set to true in production (requires HTTPS)

# Plaid
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET_SANDBOX=your-sandbox-secret
PLAID_ENV=sandbox             # sandbox | development | production

# AI
ANTHROPIC_API_KEY=your-anthropic-key
VOYAGE_SECRET_KEY=your-voyage-key

# Email (Resend)
RESEND_API_KEY=your-resend-key
EMAIL_FROM=noreply@yourdomain.com

# URLs
FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:8000

# Optional
DELETION_GRACE_DAYS=30        # days before a deletion-requested account is purged
```

---

## Deployment

### Backend (Render)

1. Create a new **Web Service** pointed at this repo
2. Set **Root Directory** to `/` and **Dockerfile** path to `Dockerfile`
3. Add all environment variables from the table above
4. Render will build from the Dockerfile and run `uvicorn backend.main:app`

### Frontend (Vercel)

1. Create a new Vercel project pointed at this repo
2. Set **Root Directory** to `frontend`
3. Set `VITE_API_URL` to your Render backend URL (e.g. `https://your-app.onrender.com/api`)
4. Vercel will run `npm run build` and serve the `dist/` folder

---

## API Overview

All endpoints are prefixed with `/api`.

| Prefix | Description |
|---|---|
| `/api/auth` | Register, login, logout, JWT refresh, email verification, password reset |
| `/api/insights` | Summary stats, monthly/category/DOW breakdown, account list, health check, nudges |
| `/api/transactions` | List, create (manual), patch, delete, dismiss duplicate |
| `/api/ledger` | Full ledger with transfers/duplicates, CSV export |
| `/api/merchants` | Merchant list, drill-down, display name overrides, category overrides |
| `/api/categories` | Category list, drill-down, mapping rules, user-defined categories |
| `/api/accounts` | Connected account list |
| `/api/plaid` | Link token, public token exchange |
| `/api/sync` | Trigger Plaid sync |
| `/api/settings` | Profile, password, avatar, account deletion |
| `/api/workspace` | Budgets, custom groups, recurring transactions |
| `/api/canvas` | Saved dashboard canvases (CRUD) |
| `/api/advisor` | AI chat (streaming + non-streaming), goals, advice history, financial profile |
