# GREENMIND

## Overview

GREENMIND is a fully offline desktop application that connects to an ESP32 microcontroller via USB to monitor and manage greenhouse environments using AI. The system reads raw sensor data from the hardware, feeds it into a locally running large language model, and provides real-time, plant-specific insights and actuator recommendations — all without any internet connection, cloud services, or subscription fees. The application is free to use, while the accompanying hardware kit is sold as a one-time purchase.

## What Makes It Unique

The core novelty of GREENMIND is not the chatbot interface itself, but the complete pipeline it establishes: raw hardware sensor readings flowing directly into an AI system that interprets them in the context of specific plants and growing conditions, and then uses that understanding to dynamically control physical actuators. This entire loop — from sensing to reasoning to acting — runs completely offline on the user's local machine, which distinguishes it from existing greenhouse management solutions that rely on cloud-based dashboards and static, manually configured rules.

## Hardware Setup

The hardware component is built around an ESP32 microcontroller connected to the user's PC via a USB serial connection. The ESP32 is wired to four sensors:

- **Soil Moisture Sensor** — measures the water content in the growing medium
- **pH Sensor** — monitors the acidity or alkalinity of the soil
- **Humidity Sensor** — tracks the relative humidity inside the greenhouse
- **Temperature Sensor** — records the ambient air temperature

In addition to sensors, the ESP32 also controls output actuators. For the current demonstration scope, these include fans and motors, which can be triggered to regulate temperature, ventilation, and irrigation. The USB serial connection serves as a two-way communication channel: sensor data flows from the ESP32 to the desktop app, and actuator commands flow from the app back to the ESP32.

## Software Architecture

GREENMIND is a desktop application that runs entirely on the user's local machine. There is no cloud backend, no remote database, and no API calls to external services. All data processing, storage, and AI inference happen locally.

The application uses a chat-session-based architecture. Each chat session represents a single greenhouse or growing area. When a user opens a new session, they specify the location and the types of plants being grown there. The live sensor data from the ESP32 is then associated with that session, and the AI processes it within that specific context. This means a user managing multiple greenhouses can maintain separate sessions, each with its own plant profiles, sensor readings, and threshold configurations, without any cross-contamination of data.

The AI engine is a locally hosted large language model. The system is model-agnostic, meaning it can run on any suitable local LLM framework such as Ollama, llama.cpp, or GPT4All, depending on the user's hardware capabilities. Since the application runs on a desktop computer rather than a mobile device, it has access to significantly more computational power, allowing it to run more capable models entirely offline.

## Dynamic Threshold Technology

The central research contribution of GREENMIND is its Dynamic Threshold Technology. Traditional greenhouse automation systems rely on hardcoded, static thresholds — for example, a rule that says "if temperature exceeds 35°C, turn on the fan." These thresholds are manually set by the user or the installer and do not adapt to different plant species, seasonal changes, or evolving microclimates within the greenhouse.

GREENMIND eliminates this limitation by leveraging the LLM's existing botanical knowledge. When a user specifies the plants growing in a particular greenhouse, the AI cross-references the live sensor data against its understanding of the optimal growing conditions for those species. Over time, as data is collected and averaged within each chat session, the AI dynamically calculates and adjusts the ideal thresholds for each sensor. It determines not only what the threshold values should be but also which actuators should respond when those thresholds are crossed and how aggressively they should act.

For example, if a session is configured for tomatoes, the AI knows that tomatoes thrive at 22–28°C with 60–70% humidity and a soil pH of 6.0–6.8. If the temperature sensor starts reading 32°C, the AI recognizes this as outside the optimal range for tomatoes specifically and recommends activating the fans. In a different session configured for orchids, the same 32°C reading might trigger a more urgent response with different actuator combinations, because orchids have different tolerances. The thresholds are never hardcoded — they emerge from the interaction between the live data and the AI's knowledge base, and they adapt continuously.

## Actuator Control and User Authority

While the AI handles the analysis and threshold calculation, the actual triggering of actuators remains under the manual control of the greenhouse owner. When the AI detects that a threshold has been crossed, it recommends a specific action through the chat interface — for instance, "Soil moisture has dropped to 18%, which is below the optimal range for your peppers. Recommend activating Motor 1 for irrigation." The owner then decides whether to approve or ignore the recommendation.

This manual control model exists because actuator operation carries real costs — electricity, water usage, equipment wear — and the greenhouse owner is the one managing those expenses. The AI advises, but the human decides. Additionally, the owner retains full override capability at all times. They can manually trigger any actuator regardless of what the AI recommends, or they can suppress an AI-suggested action. The system is designed to give the owner complete authority over their greenhouse environment, with the AI serving as an intelligent assistant rather than an autonomous controller.

## Target Audience

GREENMIND is designed specifically for greenhouse owners, not open-field farmers. Greenhouse owners typically operate controlled environments with existing infrastructure for sensors and actuators, and they possess the technical literacy to understand sensor readings, threshold values, and automation logic. The AI can therefore communicate in precise, technical language — discussing soil EC levels, pH ranges, and humidity differentials — without needing to simplify its output. This is a deliberate design choice that distinguishes GREENMIND from farmer-facing agricultural tools that prioritize simplicity over granularity.

## Safety and Error Handling

The system includes a safety layer managed by the AI, which continuously monitors sensor readings for anomalies or impossible values that might indicate hardware malfunction. In the event of a critical error — such as a sensor returning erratic data that could trigger an actuator unnecessarily — a kill-switch mechanism shuts down all actuator outputs and logs the error. The system can then report the bug to the development team or a service center for diagnosis. For the current demonstration scope, this safety layer is implemented as a functional prototype rather than a production-grade failsafe.

## Academic Context

GREENMIND is developed as an academic proof of concept intended for demonstration to lecturers and evaluation as a research project. The live demonstration involves connecting the ESP32 to a laptop via USB, showing real-time sensor data flowing into the application, interacting with the AI chatbot about plant health and environmental conditions, and triggering physical actuators based on the AI's dynamic threshold analysis. The accompanying research paper focuses on the Dynamic Threshold Technology as its primary contribution, positioning it as a novel approach to greenhouse automation that replaces manual calibration with AI-driven, plant-aware, self-adjusting threshold management running entirely on edge hardware without cloud dependency.

---

## Setup & Run Guide

### Prerequisites

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
