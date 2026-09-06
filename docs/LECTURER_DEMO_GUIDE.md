# GREENMIND Lecturer Demo Guide

## Goal of the demo

Show that GREENMIND can be cloned on a new machine and run as an offline terminal application that simulates the complete greenhouse intelligence pipeline up to, but not including, actuator control.

The demo proves:

- chat/session-based greenhouse context,
- four-sensor ESP32-style telemetry,
- plant-specific dynamic threshold calculation,
- rolling baseline adaptation,
- advisory fan/motor recommendations,
- software safety/kill-switch behaviour for impossible sensor values,
- no internet or cloud dependency.

## Quick start on any system

Prerequisite: Node.js 18 or newer.

```bash
git clone <repo-url>
cd Greenmind
npm install
npm run terminal
```

The terminal will ask for:

1. greenhouse/session location,
2. plants in the session.

Use examples like:

```text
Greenhouse/session location: Lab polyhouse 1
Plants in this session: tomatoes, peppers
```

The app then starts generating realistic offline sensor readings every 1.5 seconds.

If you want the chat answers to come from your installed Ollama model, open another terminal first and run:

```bash
ollama serve
```

GREENMIND automatically targets:

```text
http://localhost:11434
model: ornith:latest
```

This is still local/offline. No internet API is used. If Ollama is not running, the terminal falls back to the bundled Dynamic Threshold reasoning engine so the demo still works.

## Commands during the demo

```text
greenmind> Show dynamic thresholds
greenmind> Is my soil moisture too low for tomatoes?
greenmind> Should I recommend the fan?
greenmind> plants orchids
greenmind> paste {"temperature":32,"humidity":74,"soilMoisture":41,"pH":6.1}
greenmind> paste {"temperature":999,"humidity":74,"soilMoisture":41,"pH":6.1}
greenmind> quit
```

## What to point out to lecturers

### 1. Observation phase

For the first 8 readings, GREENMIND displays an observation phase. This shows that the system is not instantly applying a static hardcoded threshold. It begins from botanical knowledge and waits for a greenhouse-specific baseline.

### 2. Active dynamic threshold phase

After enough readings, the terminal switches to active mode. The threshold band for each sensor is shown with:

- lower boundary,
- upper boundary,
- tolerance buffer,
- rolling average,
- trend,
- status.

### 3. Same reading, different plant meaning

Run:

```text
greenmind> plants tomatoes
greenmind> paste {"temperature":32,"humidity":68,"soilMoisture":60,"pH":6.4}
```

Then run:

```text
greenmind> plants orchids
greenmind> paste {"temperature":32,"humidity":68,"soilMoisture":60,"pH":6.4}
```

The same 32°C temperature becomes more urgent for orchids than tomatoes because the plant context changed. This demonstrates plant-aware thresholds.

### 4. Human authority over actuators

When a threshold is crossed, GREENMIND says things like fan ventilation or Motor 1 irrigation may be recommended. Emphasize that this is not automatic. The owner must approve, and this phase sends no command.

### 5. Safety layer

Paste an impossible value:

```text
greenmind> paste {"temperature":999,"humidity":67,"soilMoisture":54,"pH":6.4}
```

GREENMIND activates the demo kill-switch state. This shows how anomaly handling prevents bad sensor data from producing dangerous actuator decisions.

## Manual ESP32-style input mode

If you want to paste every reading manually instead of using the simulator:

```bash
npm run terminal:manual
```

Then paste JSON lines directly at the prompt.

## Best-effort serial file mode

On Linux/macOS you can try reading JSON lines from a serial device file:

```bash
npm run terminal -- --serial /dev/ttyUSB0
```

This mode does not configure baud rate by itself. For a polished hardware demo, configure the device externally or use the existing browser Web Serial path. The terminal implementation avoids native serial dependencies so cloning and running remains simple on any system.

## Research paper positioning

Use the phrase:

> Dynamic Threshold Technology replaces manually configured threshold rules with AI-inferred, plant-aware, per-session threshold bands that adapt to observed greenhouse behaviour while keeping actuator authority with the owner.
