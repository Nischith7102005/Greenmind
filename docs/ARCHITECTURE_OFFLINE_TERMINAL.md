# GREENMIND Offline Terminal Architecture

## Components

```text
ESP32 or simulator
   │ JSON lines over USB serial / manual paste / simulation
   ▼
Terminal app session
   │ location + plants + rolling sensor history
   ▼
Dynamic Threshold Engine
   │ plant profiles + rolling baseline + anomaly checks
   ▼
Offline GreenMind assistant
   │ optional local Ollama model ornith:latest + deterministic fallback
   │ technical explanation + owner-approved recommendations
   ▼
Actuator boundary
   │ stopped in this phase: no physical command is sent
```

## Files added for this phase

| File | Purpose |
|---|---|
| `terminal/greenmind-terminal.mjs` | Clone-and-run offline terminal version of GREENMIND. |
| `src/services/dynamicThreshold.ts` | Reusable React-side Dynamic Threshold Technology engine. |
| `docs/DYNAMIC_THRESHOLD_TECHNOLOGY.md` | Research explanation of the implemented technology. |
| `docs/LECTURER_DEMO_GUIDE.md` | Step-by-step demo script for review. |
| `examples/esp32-sensor-protocol.md` | JSON serial protocol expected from ESP32 firmware. |

## Offline guarantee

The terminal demo does not call cloud APIs. It has no database server and no subscription dependency. It runs with Node.js only plus an optional local Ollama process.

Default Ollama target:

```text
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=ornith:latest
```

Run `ollama serve` in another terminal tab before starting GREENMIND if you want model-generated wording. If Ollama is unavailable, GREENMIND uses the bundled deterministic Dynamic Threshold fallback. `npm install` is still needed because this repository also contains the React app dependencies, but the terminal itself uses only Node built-ins.

## Session model

Each terminal launch creates one greenhouse session. The session stores:

- location label,
- plant list,
- latest 500 sensor readings,
- rolling 60-sample threshold window,
- current threshold state and recommendations.

The React application retains its existing chat-session UX and now includes the same dynamic threshold engine for offline fallback reasoning.

## Actuator status

This phase intentionally implements only the decision boundary:

- fan recommendation for high temperature or humidity,
- motor irrigation recommendation for low soil moisture,
- pH/nutrient correction recommendation for out-of-band pH,
- kill-switch recommendation for impossible readings.

No GPIO, relay, serial `ON/OFF`, or motor command is emitted by the terminal demo.
