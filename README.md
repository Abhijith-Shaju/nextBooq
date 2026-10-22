# nextBooq ☕

> **Next-generation multi-tenant table reservation & floor management platform for independent cafés.**

[![Live Demo](https://img.shields.io/badge/Live_Site-nextbooq.in-4F46E5?style=for-the-badge&logo=vercel&logoColor=white)](https://www.nextbooq.in)
[![API Status](https://img.shields.io/badge/API-api.nextbooq.in-10B981?style=for-the-badge&logo=fastapi&logoColor=white)](https://api.nextbooq.in)
[![Next.js 15](https://img.shields.io/badge/Next.js-15_(App_Router)-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Backend-Express_5-gray?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB_8.0_Replica_Set-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](#license)

---

## 🔗 Live Application Links

- **🌐 Live Production Website:** [https://www.nextbooq.in](https://www.nextbooq.in)
- **⚡ Backend API Endpoint:** [https://api.nextbooq.in](https://api.nextbooq.in)
- **🏪 Example Café Booking Page:** [https://www.nextbooq.in/black-shores](https://www.nextbooq.in/black-shores)
- **🔒 Legal & Terms:** [https://www.nextbooq.in/legal/terms](https://www.nextbooq.in/legal/terms)

---

## 📖 Overview

**nextBooq** replaces erratic phone reservations and paper logbooks with an automated, self-serve booking and floor management experience designed specifically for independent cafés in India.

Unlike conventional calendar-booking widgets, nextBooq enforces a **strict reservation lifecycle** with **real-time slot locking and deposit holding**:
1. Diners choose date, party size, and slot with zero ghost availability.
2. A table combination is temporarily locked in a **`HOLD` state with a real-time countdown**.
3. Customers confirm via a small, refundable INR deposit processed securely through **Razorpay**.
4. The reservation transitions to **`CONFIRMED`**, pushing live seat allocations to café staff in real time via **WebSockets**.

---

## ✨ Key Features

### 1. 🍽️ Customer Booking Experience (`/{tenant}`)
- **Tenant-Scoped Branding**: Dynamic server-side resolution of café profile (`/{tenant}`), injecting café-specific color palettes and branding via CSS variables.
- **Smart Capacity & Merging Engine**: Automatically calculates whether party sizes fit single tables or require table merges (combining up to 3 compatible tables).
- **Time-Boxed Hold Countdown**: Locks inventory during checkout to eliminate double-booking while ensuring abandoned sessions immediately release tables.
- **Quick Authentication**: Seamless, inline phone/email verification without heavyweight redirects.
- **Razorpay Checkout**: Seamless payment modal integrated with café-specific Razorpay accounts.
- **Self-Service Bookings**: Diners can view confirmation passes, download calendar invites, and cancel within the café's allowed window.

### 2. 📋 Café Staff & Host Stand (`/{tenant}/dashboard`)
- **Live Floor Manifest**: Real-time reservation feed with one-click actions (`Check-in`, `Seat`, `Complete`, `Mark No-Show`).
- **Interactive Table Management**: Add, retire, rearrange, and configure merge relationships across indoor and outdoor sections.
- **Operating Hours & Policies**: Configure slot intervals, party size caps, turn times, lead times, deposit amounts, and cancellation refund grace periods.
- **Instant Synchronization**: Powered by Socket.IO to keep front-of-house staff updated simultaneously across devices.

### 3. 🏢 Multi-Tenant Architecture & Platform Administration
- **Granular RBAC**: Dedicated roles (`owner`, `manager`, `host`, `staff`) with explicit permission enforcement on every API route.
- **Credential Isolation**: Each café connects its own Razorpay credentials, encrypted at rest with AES-256 before storage.
- **Superadmin Console (`/admin`)**: Global control plane for approving onboarding applications and managing organization subscriptions.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | **Next.js 15** (App Router, Turbopack), **React 19**, **TypeScript** |
| **UI & Styling** | **Tailwind CSS v4**, **shadcn/ui**, **Radix UI**, **Lucide Icons**, **Framer Motion** |
| **State Management** | **TanStack React Query v5** (server state), **Zustand** (checkout & booking workflow) |
| **Backend API** | **Node.js**, **Express 5**, **CommonJS** |
| **Database** | **MongoDB 8.0** with **Replica Set** (enabling multi-document ACID transactions) |
| **Realtime** | **Socket.IO** (live seating updates, manifest syncing) |
| **Payments** | **Razorpay** (Orders API, Webhooks, Signature Verification) |
| **Authentication** | **JWT** in secure, `HttpOnly` cross-subdomain cookies (`.nextbooq.in`) |
| **Email** | **Resend** (transactional notifications and booking confirmations) |
| **Testing** | **Vitest**, **Testing Library** (frontend), **Jest**, **Supertest** (backend) |

---

## 📁 Repository Structure

```text
nextBooq/
├── frontend/                     # Next.js 15 web application
│   ├── src/app/                  # App Router routes & layouts
│   │   ├── (public)/             # Marketing, pricing, and auth pages
│   │   ├── [tenant]/             # Tenant booking portal & checkout
│   │   └── admin/                # Platform superadmin control panel
│   ├── src/components/           # Reusable UI & shadcn components
│   ├── src/hooks/api/            # TanStack React Query hooks & Axios instance
│   ├── src/store/                # Zustand global booking store
│   └── src/lib/                  # Utilities, theme resolvers, date-fns helpers
├── backend/                      # Express 5 REST API server
│   ├── src/controllers/          # HTTP request handlers
│   ├── src/models/               # Mongoose schemas (Cafe, Reservation, Table, User)
│   ├── src/routes/               # Route definitions & RBAC middleware
│   ├── src/services/             # Business logic (Hold, Allocation, Payments, Email)
│   ├── scripts/                  # Database seeding & administrative scripts
│   └── tests/                    # Unit, integration, and lifecycle test suites
├── docs/                         # Architecture, backups, and local dev guides
├── legal/                        # DPDP Act compliant policies (Terms, Privacy, Refunds)
├── compose.yaml                  # Local MongoDB single-node replica set
└── README.md                     # Project documentation
```

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker & Docker Compose](https://www.docker.com/) (for MongoDB replica set with transaction support)
- [Git](https://git-scm.com/)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Abhijith-Shaju/nextBooq.git
cd nextBooq
```

---

### Step 2: Start the MongoDB Replica Set

Multi-document transactions are required for reliable reservation allocations:

```bash
# Start MongoDB container
docker compose up -d mongodb

# Initialize the single-node replica set (run once on first setup)
docker compose exec mongodb mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"

# Verify status (should report PRIMARY)
docker compose exec mongodb mongosh --quiet --eval "rs.status().members.map(({name,stateStr}) => ({name,stateStr}))"
```

---

### Step 3: Backend Setup

```bash
cd backend
npm install

# Create environment configuration
cp .env.example .env
```

Configure your `backend/.env`:
```dotenv
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/nextbooq?replicaSet=rs0&directConnection=true
JWT_SECRET=your_minimum_32_character_jwt_secret_key_here
ENCRYPTION_KEY=your_32_byte_hex_encryption_key_here
CORS_ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

> **Tip:** Generate a 32-byte encryption key with:  
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Seed initial sample data (optional):
```bash
npm run seed
```

Start the backend server:
```bash
npm run dev
```
API will be live at `http://localhost:5000`.

---

### Step 4: Frontend Setup

Open a new terminal window:

```bash
cd frontend
npm install

# Create environment configuration
cp .env.example .env.local
```

Configure your `frontend/.env.local`:
```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_key_id
```

Start the frontend development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running Tests

### Frontend (Vitest)
```bash
cd frontend
npm run test
```

### Backend (Jest & Supertest)
```bash
cd backend
npm test
```

---

## 🚢 Production Deployment

- **Frontend**: Deployed on edge infrastructure pointing to custom domain `https://www.nextbooq.in`.
- **Backend API**: Running on AWS EC2 via PM2 process manager at `https://api.nextbooq.in` with automated deployment via GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).
- **Session Authentication**: The session cookie (`nb_session`) is scoped to `.nextbooq.in`, allowing seamless authentication sharing across both frontend (`www`) and backend API (`api`) origins.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
