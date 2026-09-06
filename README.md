# GREENMIND — Offline Greenhouse AI

GREENMIND is an offline desktop/terminal application for greenhouse monitoring and plant-aware decision support. It connects to ESP32-style telemetry over USB serial, reads raw sensor data, and reasons locally about greenhouse conditions. The current review branch focuses on implementing **Dynamic Threshold Technology** up to the actuator decision boundary: GREENMIND can recommend fan or motor actions, but it does **not** physically trigger actuators in this phase.

## Project overview

GREENMIND is designed for greenhouse owners who need technical, local, no-cloud greenhouse intelligence. Each session represents one greenhouse or growing area. The owner specifies the location and plants being grown, then live sensor readings are associated with that session. The AI/threshold engine interprets the readings in plant context and produces real-time recommendations.

Implemented demo sensors:

- soil moisture sensor,
- pH sensor,
- humidity sensor,
- temperature sensor.

The ESP32 protocol is intentionally simple: hardware reads sensors and streams JSON lines; intelligence stays in the desktop application.

## Dynamic Threshold Technology

Traditional greenhouse systems use fixed rules like:

```text
if temperature > 35°C, turn on fan
```

GREENMIND replaces this with adaptive threshold bands derived from:

1. plant types assigned to the current session,
2. live ESP32/simulated sensor readings,
3. botanical knowledge embedded locally in the app or supplied by a local LLM.

The app starts in an observation phase, builds a rolling baseline of greenhouse behaviour, and then gently adjusts sensor bands for that specific session. When readings cross a band, GREENMIND explains why the condition matters for the selected plants and recommends an owner-approved response.

Actuator control status for this phase:

- fan recommendation: implemented as advisory text only,
- motor irrigation recommendation: implemented as advisory text only,
- physical ON/OFF serial commands: intentionally not implemented yet,
- safety/kill-switch state for impossible values: implemented as prototype logic.

See [`docs/DYNAMIC_THRESHOLD_TECHNOLOGY.md`](docs/DYNAMIC_THRESHOLD_TECHNOLOGY.md) for the research explanation.

## Terminal demo quick start

Prerequisite: Node.js 18 or newer.

```bash
git clone <repo-url>
cd Greenmind
npm install
npm run terminal
```

Manual JSON-input mode:

```bash
npm run terminal:manual
```

Expected ESP32 JSON line:

```json
{"temperature":28.4,"humidity":67,"soilMoisture":54,"pH":6.4}
```

Useful terminal commands:

```text
greenmind> Show dynamic thresholds
greenmind> Is my soil moisture too low for tomatoes?
greenmind> Should I recommend the fan?
greenmind> plants orchids
greenmind> paste {"temperature":32,"humidity":74,"soilMoisture":41,"pH":6.1}
greenmind> paste {"temperature":999,"humidity":74,"soilMoisture":41,"pH":6.1}
greenmind> quit
```

Best-effort serial file mode on Linux/macOS:

```bash
npm run terminal -- --serial /dev/ttyUSB0
```

For portability, the terminal demo avoids native serial dependencies. The serial mode reads JSON lines from a device file but does not configure baud rate by itself.

## Local Ollama model

Your installed model is supported by default:

```text
ornith:latest
```

Run this in another terminal tab:

```bash
ollama serve
```

Then run GREENMIND:

```bash
npm run terminal
```

The terminal app calls only the local Ollama server at `http://localhost:11434`; it does not use internet APIs. If Ollama is not running, it automatically falls back to the bundled offline Dynamic Threshold reasoning engine.

Optional overrides:

```bash
OLLAMA_MODEL=ornith:latest npm run terminal
OLLAMA_URL=http://localhost:11434 npm run terminal
```

## React app

The existing Vite/React app is still present and now includes the same offline dynamic threshold engine for local fallback reasoning. To run it:

```bash
npm run dev
```

To build it:

```bash
npm run build
```

## Important files

| File | Purpose |
|---|---|
| `terminal/greenmind-terminal.mjs` | Clone-and-run offline terminal version for lecturer review. |
| `src/services/dynamicThreshold.ts` | Dynamic Threshold Technology implementation used by the React app. |
| `src/services/ai.ts` | Local-only chat reasoning: optional Ollama on localhost, deterministic offline fallback. |
| `src/services/device.ts` | ESP32 JSON parsing and greenhouse simulator. |
| `docs/DYNAMIC_THRESHOLD_TECHNOLOGY.md` | Research/technology write-up. |
| `docs/LECTURER_DEMO_GUIDE.md` | Demo script for review. |
| `docs/ARCHITECTURE_OFFLINE_TERMINAL.md` | Offline terminal architecture. |
| `examples/esp32-sensor-protocol.md` | ESP32 JSON protocol notes. |

## Offline position

The terminal review demo has no cloud backend, remote database, subscription service, or external AI API. All threshold calculation and assistant-style explanation run locally. Optional local LLM frameworks such as Ollama can be connected through `localhost`, but they are not required for the demo to work.

## Academic positioning

GREENMIND is an academic proof of concept for offline, edge-based greenhouse automation. The research paper should focus on Dynamic Threshold Technology: a shift from manually engineered thresholds to AI-inferred, plant-aware, adaptive threshold bands generated per greenhouse, per plant type, and per session while keeping actuator authority with the owner.
