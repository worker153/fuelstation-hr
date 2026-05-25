# workersforce

A multi-company HR management platform built for Nigerian fuel station owners.

## Features
- **Worker Registration** — full profile with passport photo, role, branch, contact
- **Worker Verification** — NIN, Voter's Card, Driver's License, National ID, International Passport
- **House Verification** — Google Maps pin, coordinates, address, house photos
- **Guarantor Management** — 2 guarantors per worker with ID docs, signatures, map location
- **Digital Signatures** — draw on canvas or upload image
- **Camera Capture** — live camera or file upload for all photos
- **Auto Verification Status** — Pending / Partially Verified / Fully Verified

## Tech Stack
- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **File Storage:** Cloudinary
- **Maps:** Google Maps API

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
