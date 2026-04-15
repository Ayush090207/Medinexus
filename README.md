# Medinexus

A healthcare platform for patients, doctors, and hospital admins. Built with React + Vite (TypeScript) on the frontend, Express + TypeScript on the backend, and Supabase (PostgreSQL) for the database and auth.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, TypeScript, Node.js |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (reports, PDFs) |
| Email | Nodemailer (report upload notifications) |

---

## Features

### Patient

- **Sign up / Log in** — email and password via Supabase Auth
- **Discover hospitals** — browse hospitals and their available services
- **Book appointments** — soft-lock slot booking (3-minute hold) with race condition prevention; lock releases automatically on navigation away
- **My Appointments** — view upcoming and past appointments
- **Health Passport** — unified view of prescriptions, lab reports, and referrals across all hospitals
- **Access Grants** — view which doctors have access to records, grant access manually, and revoke at any time

### Doctor

- **Dashboard** — overview of today's activity
- **Appointments** — day-wise appointment list with patient details (name, age, blood group, allergies, contact); navigate between dates
- **Appointment status management** — move appointments through: Booked → Checked In → In Progress → Completed / No Show / Cancelled
- **Health Passport viewer** — view a patient's shared prescriptions and reports inline via a side sheet
- **Refer a patient** — refer a patient to another doctor directly from the appointment view; access grants are automatically copied to the receiving doctor
- **Referrals page** — view sent and received referrals; accept, decline, or mark as completed
- **Schedule** — view and manage appointment slots
- **Prescriptions** — view issued prescriptions
- **Auto slot generation** — slots seeded automatically on a rolling 31-day window

### Admin

- **Doctor roster** — view and manage doctors at the hospital
- **Service catalogue** — manage hospital services
- **Service appointments** — view and manage appointments for hospital services
- **Doctor slot management** — configure and manage appointment slots per doctor
- **Report upload** — upload patient lab/imaging reports; patient receives an email notification automatically

---

## Project Structure

```
medinexus/
├── client/          # React frontend
│   └── src/
│       ├── features/
│       │   ├── dashboard/
│       │   │   ├── admin/
│       │   │   ├── doctor/
│       │   │   └── patient/
│       │   └── shared/
│       └── services/  # API service layer
└── server/          # Express backend
    └── src/
        ├── controllers/
        ├── routes/
        ├── db/
        │   └── migrations/
        └── jobs/    # Background seeders
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the migrations applied

### Environment

**`server/.env`**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=          # postgres:// connection string for running migrations
JWT_SECRET=
EMAIL_USER=            # SMTP credentials for report notification emails
EMAIL_PASS=
```

**`client/.env`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:3000
```

### Run

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start backend (runs migrations on startup)
cd server && npm run dev

# Start frontend
cd client && npm run dev
```

Backend runs on port **3000**, frontend on port **5173**.
