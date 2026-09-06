#!/usr/bin/env python3
"""
GREENMIND — Dynamic Threshold Technology (DTT) engine.

The LLM is asked ONCE (per session / plant switch) to derive plant-specific
safe ranges. All per-cycle comparison, status classification and baseline
math happen here in plain Python — never in the LLM.
"""

import json
import re
import time
from collections import deque

import ollama

# Sensor definitions: engine name -> key used in the reading dicts
SENSORS = ["temp", "humidity", "moisture", "ph"]
KEYS = {"temp": "TEMP", "humidity": "HUM", "moisture": "MOIST", "ph": "PH"}
UNITS = {"temp": "°C", "humidity": "%", "moisture": "%", "ph": ""}
SHORT = {"temp": "temp", "humidity": "hum", "moisture": "moist", "ph": "ph"}
EMOJI = {"OK": "✅", "TOLERANCE": "🟡", "WARNING": "⚠", "CRITICAL": "🚨"}
SEVERITY = {"OK": 0, "TOLERANCE": 1, "WARNING": 2, "CRITICAL": 3}

# Hardcoded safe defaults — used only if the LLM fails twice
DEFAULTS = {
    "temp":     {"min": 18.0, "max": 30.0, "tolerance": 2.0, "actuator": "FAN_1"},
    "humidity": {"min": 50.0, "max": 75.0, "tolerance": 5.0, "actuator": "FAN_1"},
    "moisture": {"min": 40.0, "max": 70.0, "tolerance": 5.0, "actuator": "MOTOR_1"},
    "ph":       {"min": 5.8,  "max": 7.0,  "tolerance": 0.3, "actuator": "NONE"},
}

# How much the rolling average must drift from session start to adapt
DRIFT_LIMITS = {"temp": 2.0, "humidity": 5.0, "moisture": 5.0, "ph": 0.3}

CYAN, YELLOW, GRAY, RESET = "\033[96m", "\033[93m", "\033[90m", "\033[0m"


class ThresholdEngine:
    def __init__(self, model="ornith:latest"):
        self.model = model
        self.plants = []
        self.thresholds = {s: dict(DEFAULTS[s]) for s in SENSORS}
        self.base_tol = {s: DEFAULTS[s]["tolerance"] for s in SENSORS}
        self.windows = {s: deque(maxlen=50) for s in SENSORS}  # last 50 per sensor
        self.session_avg = {}   # baseline captured from the first 10 readings
        self.count = 0          # total readings fed to update_baseline()

    # ------------------------------------------------------------------
    # 1. Derive thresholds from the LLM (once per session / plant switch)
    # ------------------------------------------------------------------
    def derive_thresholds(self, plants):
        self.plants = [p.strip() for p in plants if p.strip()]
        prompt = (
            f"You are a greenhouse agronomy engine. Plants in this zone: "
            f"{', '.join(self.plants)}.\n"
            "Return ONLY a JSON object wrapped in ```json ``` markers, with this "
            "exact schema (numbers are examples):\n"
            '```json\n{"plants": ["tomato"], "thresholds": {\n'
            ' "temp":     {"min": 22.0, "max": 28.0, "tolerance": 2.0, "actuator": "FAN_1"},\n'
            ' "humidity": {"min": 60.0, "max": 70.0, "tolerance": 5.0, "actuator": "FAN_1"},\n'
            ' "moisture": {"min": 50.0, "max": 65.0, "tolerance": 5.0, "actuator": "MOTOR_1"},\n'
            ' "ph":       {"min": 6.0,  "max": 6.8,  "tolerance": 0.3, "actuator": "NONE"}}}\n```\n'
            "Rules: temp in °C, humidity in %, soil moisture in %, ph 0-14. "
            "Actuator MUST be FAN_1 for temp/humidity, MOTOR_1 for moisture, NONE for ph. "
            "If multiple plants are listed, use the OVERLAPPING safe range that suits "
            "ALL of them. Output the JSON only — no prose."
        )
        for attempt in (1, 2):  # retry once on malformed output
            raw = self._ask_llm(prompt)
            parsed = self._parse(raw) if raw else None
            if parsed:
                self.thresholds = parsed
                self.base_tol = {s: parsed[s]["tolerance"] for s in SENSORS}
                print(f"{GRAY}[DTT] Thresholds derived by LLM for: "
                      f"{', '.join(self.plants)}{RESET}")
                self.print_table()
                return self.thresholds
            print(f"{YELLOW}[DTT] LLM returned unusable JSON "
                  f"(attempt {attempt}/2).{RESET}")
        print(f"{YELLOW}[DTT] Falling back to hardcoded safe defaults.{RESET}")
        self.thresholds = {s: dict(DEFAULTS[s]) for s in SENSORS}
        self.base_tol = {s: DEFAULTS[s]["tolerance"] for s in SENSORS}
        self.print_table()
        return self.thresholds

    def _ask_llm(self, prompt):
        try:
            r = ollama.chat(model=self.model, stream=False,
                            messages=[{"role": "user", "content": prompt}])
            return r["message"]["content"]
        except Exception as e:
            print(f"{YELLOW}[DTT] Ollama unavailable: {e}{RESET}")
            return None

    def _parse(self, text):
        """Extract the ```json ...``` block and validate it. None on failure."""
        m = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
        blob = m.group(1) if m else None
        if not blob:  # fallback: widest {...} span in the reply
            m = re.search(r"\{.*\}", text, re.DOTALL)
            blob = m.group(0) if m else None
        if not blob:
            return None
        try:
            data = json.loads(blob)
            th = data["thresholds"]
            out = {}
            for s in SENSORS:
                t = th[s]
                out[s] = {"min": float(t["min"]), "max": float(t["max"]),
                          "tolerance": abs(float(t["tolerance"])),
                          "actuator": str(t.get("actuator", DEFAULTS[s]["actuator"])).upper()}
                if out[s]["min"] >= out[s]["max"] or out[s]["tolerance"] <= 0:
                    return None
            return out
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return None

    def print_table(self):
        """Formatted ASCII table of the active thresholds."""
        print(f"{CYAN}+----------+---------+---------+-----------+----------+")
        print("| sensor   |     min |     max | tolerance | actuator |")
        print("+----------+---------+---------+-----------+----------+")
        for s in SENSORS:
            t = self.thresholds[s]
            print(f"| {s:<8} | {t['min']:>7.1f} | {t['max']:>7.1f} "
                  f"| {t['tolerance']:>9.1f} | {t['actuator']:<8} |")
        print(f"+----------+---------+---------+-----------+----------+{RESET}")

    # ------------------------------------------------------------------
    # 2. Check live readings — pure Python, no LLM
    # ------------------------------------------------------------------
    def _classify(self, sensor, value):
        """Return (status, direction). direction is '', BELOW_MIN or ABOVE_MAX."""
        t = self.thresholds[sensor]
        if t["min"] <= value <= t["max"]:
            return "OK", ""
        direction = "BELOW_MIN" if value < t["min"] else "ABOVE_MAX"
        dev = (t["min"] - value) if value < t["min"] else (value - t["max"])
        if dev <= t["tolerance"]:
            return "TOLERANCE", direction
        if dev <= 2 * t["tolerance"]:
            return "WARNING", direction
        return "CRITICAL", direction

    def check_readings(self, readings):
        """Return a breach dict for every sensor that is not OK."""
        breaches = []
        for s in SENSORS:
            v = readings.get(KEYS[s])
            if v is None:
                continue
            status, direction = self._classify(s, v)
            if status == "OK":
                continue
            t = self.thresholds[s]
            breaches.append({
                "sensor": s, "value": v, "min": t["min"], "max": t["max"],
                "tolerance": t["tolerance"], "status": status,
                "severity": SEVERITY[status], "direction": direction,
                "actuator": t["actuator"],
                "action": "ON",  # actuator runs to correct the breach
            })
        return breaches

    # ------------------------------------------------------------------
    # 3. Status line formatter
    # ------------------------------------------------------------------
    def get_status_line(self, readings):
        parts = []
        for s in SENSORS:
            v = readings.get(KEYS[s])
            if v is None:
                continue
            status, direction = self._classify(s, v)
            tag = f" {direction}" if direction and status != "OK" else ""
            parts.append(f"{SHORT[s]} {EMOJI[status]} {v}{tag}")
        return " | ".join(parts)

    # ------------------------------------------------------------------
    # 4. Rolling baseline adaptation — the "dynamic" in DTT
    # ------------------------------------------------------------------
    def update_baseline(self, readings):
        """Feed one reading. Every 50 readings, widen tolerances if the
        environment has genuinely drifted since session start."""
        for s in SENSORS:
            v = readings.get(KEYS[s])
            if v is not None:
                self.windows[s].append(v)
        self.count += 1
        if self.count == 10:  # capture the session-start baseline
            self.session_avg = {s: sum(self.windows[s]) / len(self.windows[s])
                                for s in SENSORS if self.windows[s]}
        if self.count % 50 != 0 or not self.session_avg:
            return
        for s in SENSORS:
            if not self.windows[s]:
                continue
            avg = sum(self.windows[s]) / len(self.windows[s])
            drift = abs(avg - self.session_avg.get(s, avg))
            if drift <= DRIFT_LIMITS[s]:
                continue
            t = self.thresholds[s]
            old = t["tolerance"]
            new = min(round(old * 1.25, 2), self.base_tol[s] * 2)  # cap at 2x
            if new <= old:
                continue
            t["tolerance"] = new
            print(f"{YELLOW}[ADAPT] {s} avg drifted {drift:+.1f}{UNITS[s]} since "
                  f"session start. Tolerance {old} -> {new}. Effective band now "
                  f"{t['min'] - new:.1f} .. {t['max'] + new:.1f}{UNITS[s]}.{RESET}")

    def baseline_stats(self):
        """Human-readable rolling baseline summary for the /baseline command."""
        lines = [f"readings fed: {self.count}"]
        for s in SENSORS:
            w = self.windows[s]
            if not w:
                continue
            avg = sum(w) / len(w)
            start = self.session_avg.get(s)
            drift = f"{avg - start:+.2f}" if start is not None else "n/a"
            lines.append(f"{s:<8} window={len(w):>2}  avg={avg:6.2f}  "
                         f"min={min(w):6.2f}  max={max(w):6.2f}  "
                         f"drift_from_start={drift}  tol={self.thresholds[s]['tolerance']}")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # 5. Actuator command generation
    # ------------------------------------------------------------------
    def get_actuator_command(self, breach):
        """Serial command like 'FAN_1:ON'. None when no actuator is mapped."""
        if breach["actuator"] in ("NONE", ""):
            return None
        return f"{breach['actuator']}:{breach['action']}"
