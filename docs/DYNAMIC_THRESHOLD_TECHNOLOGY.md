# GREENMIND Dynamic Threshold Technology

## Lecturer-facing summary

Dynamic Threshold Technology is GREENMIND's research contribution. Instead of programming fixed actuator rules such as `if temperature > 35°C, turn on fan`, GREENMIND derives a safe operating band for each sensor from:

1. the plants assigned to the current greenhouse chat/session,
2. the live ESP32 sensor stream, and
3. botanical knowledge stored locally in the application or supplied by a local LLM.

For this phase, the actuator layer is intentionally disabled. The software reaches the recommendation boundary only: it can say what fan or motor action should be considered, but it does not send an ON/OFF command to hardware.

## Implemented sensors

The current research/demo scope matches the requested hardware setup:

- temperature in °C,
- relative humidity in %,
- soil moisture in %,
- soil pH.

The ESP32 is expected to send one JSON object per line over USB serial:

```json
{"temperature":28.4,"humidity":67,"soilMoisture":54,"pH":6.4}
```

Aliases also accepted by the app include `temp`, `hum`, `soil`, `sm`, `ph`, and `soilPh`.

## Implemented algorithm

The implementation lives in:

- `src/services/dynamicThreshold.ts` for the React app,
- `terminal/greenmind-terminal.mjs` for the terminal demonstration.

The algorithm performs these steps:

1. **Session plant context** — normalize plant names such as tomato, pepper, orchid, lettuce, and cucumber.
2. **Botanical range lookup** — load ideal ranges for each plant and sensor.
3. **Multi-plant fusion** — if multiple plants are listed, use the overlapping safe range. If no overlap exists, use the averaged shared band.
4. **Observation phase** — for the first 8 readings, start mostly from botanical knowledge while collecting greenhouse baseline behaviour.
5. **Rolling baseline phase** — after observation, use the latest 60 readings to calculate observed average, spread, and trend.
6. **Threshold adaptation** — gently shift the botanical band toward the observed greenhouse baseline, with tolerance buffers so the system does not overreact to noise.
7. **Assessment** — classify each live reading as optimal, warning, critical, or anomaly.
8. **Safety layer** — impossible readings activate a software kill-switch state and suppress actuator recommendations.
9. **Recommendation layer** — if a threshold is crossed, recommend owner-approved fan or motor action without sending a command.

## Why this is novel

Traditional greenhouse automation treats thresholds as engineered constants. GREENMIND treats thresholds as contextual conclusions. A 32°C reading is not judged the same for every crop; it is compared against the current session's plant configuration and the real behaviour of that greenhouse.

That supports the research claim: **AI-inferred, plant-aware, session-specific, adaptive threshold management can run offline on edge hardware without a cloud dashboard or subscription model.**

## Current limitations

- The terminal demo automatically tries the local Ollama model `ornith:latest` at `http://localhost:11434` when `ollama serve` is running.
- If Ollama is not available, the deterministic bundled threshold engine remains the offline fallback.
- Physical actuator control is not implemented in this phase by design.
- The safety layer is a prototype suitable for academic demonstration, not a production-certified failsafe.
