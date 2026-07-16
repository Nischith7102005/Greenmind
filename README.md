# GreenMind — Setup & Run Guide

## Prerequisites

- **Node.js** v18 or later — [download here](https://nodejs.org/)
- A terminal / command prompt

---

## Quick Start

```bash
# 1. Open a terminal in the project folder
cd greenmind

# 2. Install all dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173`).

---

## What You'll See

| Section | What It Shows |
|---------|---------------|
| **Hero** | "GreenMind" title with parallax greenhouse images scrolling at different speeds |
| **Sticky Cards** | 4 cards that stack/unstack as you scroll — Smart Sensing, AI Insights, Predictive Guard, AI Companion |
| **How It Works** | 3 steps: Connect → Monitor → Optimize |
| **Outro** | "Grow Smarter, Not Harder" with a call-to-action |
| **Footer** | Product links, legal pages, contact info |

---

## Authentication (Get Started Button)

Clicking **"Get Started"** opens a sign-in page powered by **Firebase Auth** (email + password).

### Already Working

- Firebase is configured with the project credentials — no extra setup needed
- Users can **sign up** with email & password
- Users can **sign in** if they already have an account
- Sessions persist across page refreshes

### Enable Email/Password Auth in Firebase

If sign-in doesn't work, you may need to enable the auth provider:

1. Go to [Firebase Console](https://console.firebase.google.com/project/greenmind-4e51e)
2. Click **Authentication** in the left sidebar
3. Click **Sign-in method** tab
4. Click **Email/Password**
5. Toggle **Enable** → click **Save**

That's it. No additional config needed.

---

## Build for Production

```bash
# Creates an optimized single-file build in dist/
npm run build

# Preview the production build locally
npm run preview
```

The production build outputs a single `dist/index.html` with all JS/CSS inlined.

---

## Deploy to Firebase Hosting

```bash
# 1. Install Firebase CLI (one-time)
npm install -g firebase-tools

# 2. Log in to your Firebase account
firebase login

# 3. Initialize hosting in the project folder
firebase init hosting
#   - Select project: greenmind-4e51e
#   - Public directory: dist
#   - Single-page app: Yes
#   - Don't overwrite dist/index.html

# 4. Build the project
npm run build

# 5. Deploy
firebase deploy --only hosting
```

Your app will be live at: `https://greenmind-4e51e.web.app`

---

## Project Structure

```
├── index.html                  ← Entry HTML, Google Fonts
├── package.json                ← Dependencies: firebase, gsap, lenis, react
├── tsconfig.json               ← TypeScript config
├── vite.config.ts              ← Vite + Tailwind + SingleFile plugin
│
├── public/
│   └── images/
│       ├── card-sensing.jpg        ← Card 1 image
│       ├── hero-distant.jpg        ← Parallax layer 1 (far)
│       ├── hero-greenhouse.jpg     ← Parallax layer 2 (mid)
│       ├── hero-foreground.jpg     ← Parallax layer 3 (near)
│       ├── outro-field.jpg         ← Card 4 image
│       └── section-wide.jpg        ← Outro background
│
└── src/
    ├── main.tsx               ← React entry point
    ├── App.tsx                ← Main app: Firebase auth + landing page
    ├── firebase.ts            ← Firebase config & auth setup
    ├── index.css              ← All custom styles
    ├── vite-env.d.ts          ← Vite type declarations
    │
    └── components/
        └── SignIn.tsx          ← Firebase email/password auth UI
```

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| Vite 7 | Build tool & dev server |
| Tailwind CSS 4 | Utility-first CSS |
| GSAP + ScrollTrigger | Scroll animations & sticky cards |
| Lenis | Smooth scrolling |
| Firebase Auth | User authentication (email/password) |

---

## Troubleshooting

### Page is blank
- Make sure you ran `npm install` before `npm run dev`
- Check the browser console (F12) for errors

### Images not loading
- Images are in `public/images/` — make sure that folder exists
- 2 cards use external Pexels URLs which require internet; the rest are local files

### "Get Started" doesn't open sign-in page
- Open browser console (F12) — if you see Firebase errors, ensure Email/Password auth is enabled in Firebase Console (see above)

### Build fails
- Delete `node_modules` and `dist`, then:
  ```bash
  rm -rf node_modules dist
  npm install
  npm run build
  ```
