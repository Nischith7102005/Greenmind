#!/usr/bin/env python3
"""
GREENMIND — 50% Milestone: Dynamic Threshold Technology (DTT)
=============================================================
Offline pipeline:  ESP32 (serial) -> Python DTT engine -> local Ollama LLM.
The LLM derives plant-specific thresholds ONCE per session/switch and explains
breaches; all per-cycle math is pure Python. Actuators fire only on approval.

DEMO SCRIPT (~8 min, works with no hardware — simulation has a built-in arc):
 1. Terminal A: `ollama serve`   Terminal B: `python greenmind.py`
 2. At "[SETUP] Enter plants": type  tomato
    -> LLM derives tomato thresholds, ASCII table prints.
 3. Watch [SENSOR] + status lines: all ✅ for the first ~1.5 minutes.
 4. Simulation arc kicks in: moisture drifts down, then temp climbs.
    Status flips 🟡 -> ⚠ and a [🚨 BREACH] alert fires with an LLM
    explanation. Approve with  Y  -> "MOTOR_1:ON" is sent (sim prints it).
    Try  N  on the next one, and  OVERRIDE FAN_1:ON  once to show control.
 5. KEY MOMENT — type:  /switch-plant orchid
    Same live readings, new tighter thresholds -> sensors that were ⚠ for
    tomato now show 🚨 CRITICAL for orchid. That is DTT in one command.
 6. Show /thresholds and /baseline; if running long enough (50 readings)
    an [ADAPT] line shows tolerance widening. Finish with /quit.

Commands: /switch-plant <plants> | /thresholds | /baseline | /manual <cmd> | /quit
Breach prompt answers: Y | N | OVERRIDE <CMD>     (e.g. OVERRIDE FAN_1:OFF)
"""

import sys
import time
import random
import threading
from collections import deque
from datetime import datetime

import serial          # pyserial
import ollama          # local Ollama client
from threshold_engine import ThresholdEngine, SENSORS, UNITS

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
SERIAL_PORT   = "COM3"            # override: python greenmind.py <port>
BAUD_RATE     = 115200
MODEL_NAME    = "ornith:latest"   # local model, served by `ollama serve`
WINDOW_SIZE   = 15                # rolling readings shown to the LLM
READ_INTERVAL = 5                 # seconds between readings
LLM_EVERY_N   = 3                 # conversational LLM query every 3rd reading
ALERT_COOLDOWN = 60               # seconds between alerts for the same sensor

GREEN, CYAN, YELLOW, RED, GRAY, RESET = (
    "\033[92m", "\033[96m", "\033[93m", "\033[91m", "\033[90m", "\033[0m")

# ----------------------------------------------------------------------
# Shared state
# ----------------------------------------------------------------------
engine = ThresholdEngine(MODEL_NAME)
readings = deque(maxlen=WINDOW_SIZE)   # (timestamp, dict)
chat_history = []                      # conversation memory for the LLM
state_lock = threading.Lock()
stop_event = threading.Event()
pending_breach = None                  # breach awaiting user approval
last_alert = {}                        # sensor -> time of last alert
total_readings = 0
ser_global = None                      # serial handle (None in simulation)


def system_prompt():
    """Base role prompt + the ACTIVE thresholds so the LLM can cite numbers."""
    t = engine.thresholds
    active = ", ".join(
        f"{s} {t[s]['min']}-{t[s]['max']}{UNITS[s]} (±{t[s]['tolerance']})"
        for s in SENSORS)
    return (
        "You are GREENMIND, an expert greenhouse AI assistant running entirely "
        "offline. You receive live sensor readings (temperature °C, humidity %, "
        "soil moisture %, soil pH). Interpret each batch in 1-2 sentences, "
        "notice trends, and ask short diagnostic questions when useful. "
        "2-4 sentences max, technical tone, never invent sensor values.\n"
        f"Active thresholds for {', '.join(engine.plants) or 'default profile'}: "
        f"{active}. Python handles all threshold checking — you only observe "
        "and explain.")


# ----------------------------------------------------------------------
# Serial connection / simulation fallback
# ----------------------------------------------------------------------
def connect_esp32(port):
    try:
        s = serial.Serial(port, BAUD_RATE, timeout=2)
        print(f"{GRAY}[SYSTEM] Port {port} opened. Waiting for handshake...{RESET}")
        deadline = time.time() + 10
        while time.time() < deadline:
            line = s.readline().decode(errors="ignore").strip()
            if "GREENMIND_ESP32_READY" in line:
                print(f"{GREEN}[SYSTEM] ESP32 connected on {port}.{RESET}")
                return s
        s.close()
    except (serial.SerialException, OSError):
        pass
    return None


def send_actuator(cmd):
    """Send an actuator command over serial (or simulate the ACK)."""
    if ser_global:
        ser_global.write((cmd + "\n").encode())
        print(f"{GREEN}[ACT]    Sent to ESP32: {cmd}{RESET}")
    else:
        print(f"{GREEN}[ACT]    (simulation) {cmd} -> ACK:{cmd}{RESET}")


class SensorSimulator:
    """Demo arc: normal -> moisture drops -> temp rises -> breach territory.
    Tuned so tomato shows WARNING while orchid shows CRITICAL on the same data."""

    def __init__(self):
        self.start = time.time()

    def read(self):
        el = time.time() - self.start
        # moisture: steady 52% for 90 s, then drifts to ~40% by 4 min
        m_drift = min(max(el - 90, 0) / 150.0, 1.0) * 12.0
        # temp: steady 26°C for 3 min, then climbs to ~31°C by 6 min
        t_drift = min(max(el - 180, 0) / 180.0, 1.0) * 5.0
        return {
            "TEMP":  round(26.0 + t_drift + random.uniform(-0.3, 0.3), 1),
            "HUM":   round(65.0 - t_drift * 1.5 + random.uniform(-0.5, 0.5), 1),
            "MOIST": round(52.0 - m_drift + random.uniform(-0.4, 0.4), 1),
            "PH":    round(6.45 + random.uniform(-0.15, 0.15), 1),
        }


def parse_line(line):
    """'TEMP:27.4,HUM:64.2,MOIST:45.1,PH:6.5' -> dict, else None."""
    if line.startswith(("ACK:", "SAFETY:")):       # actuator echoes from ESP32
        print(f"{GRAY}[ESP32]  {line}{RESET}")
        return None
    try:
        parts = dict(p.split(":") for p in line.strip().split(","))
        return {k: float(parts[k]) for k in ("TEMP", "HUM", "MOIST", "PH")}
    except (ValueError, KeyError):
        return None


# ----------------------------------------------------------------------
# LLM helpers (observation + breach explanation only — no math)
# ----------------------------------------------------------------------
def build_context_block():
    with state_lock:
        lines = [f"[{ts}] T:{r['TEMP']} H:{r['HUM']} M:{r['MOIST']} pH:{r['PH']}"
                 for ts, r in readings]
    return f"Recent readings (last {len(lines)}):\n" + "\n".join(lines)


def ask_llm(user_content, remember=True):
    with state_lock:
        messages = ([{"role": "system", "content": system_prompt()}]
                    + chat_history + [{"role": "user", "content": user_content}])
    try:
        r = ollama.chat(model=MODEL_NAME, messages=messages, stream=False)
        reply = r["message"]["content"].strip()
    except Exception as e:
        print(f"{RED}[ERROR]  Cannot reach Ollama ({e}). Run 'ollama serve' "
              f"in another terminal (model: {MODEL_NAME}).{RESET}")
        return None
    if remember:
        with state_lock:
            chat_history.append({"role": "user", "content": user_content})
            chat_history.append({"role": "assistant", "content": reply})
            if len(chat_history) > 20:
                del chat_history[:2]
    return reply


def handle_breach(breach, data):
    """Alert + LLM explanation + approval prompt for one WARNING/CRITICAL breach."""
    global pending_breach
    b = breach
    print(f"{RED}[🚨 BREACH] {b['sensor']} = {b['value']}{UNITS[b['sensor']]} "
          f"{b['direction']} (band {b['min']}-{b['max']} ±{b['tolerance']}) "
          f"status={b['status']}{RESET}")
    reply = ask_llm(
        f"THRESHOLD BREACH: {b['sensor']} reads {b['value']}{UNITS[b['sensor']]}, "
        f"{b['direction']} of the safe band {b['min']}-{b['max']} for "
        f"{', '.join(engine.plants)}. In 2-3 short sentences: why this matters "
        f"for these plants, and confirm whether activating {b['actuator']} is "
        f"the right corrective action.", remember=False)
    if reply:
        print(f"{CYAN}[AI]     {reply}{RESET}")
    cmd = engine.get_actuator_command(b)
    if cmd:
        with state_lock:
            pending_breach = b
        print(f"{YELLOW}[ACTION] Approve actuator action '{cmd}'? "
              f"[Y/N/OVERRIDE <CMD>]{RESET}")
    else:
        print(f"{GRAY}[ACTION] No actuator mapped for {b['sensor']} "
              f"(manual correction needed).{RESET}")


# ----------------------------------------------------------------------
# Thread 1 — sensor loop
# ----------------------------------------------------------------------
def sensor_loop(sim):
    global total_readings
    count = 0
    while not stop_event.is_set():
        if ser_global:
            raw = ser_global.readline().decode(errors="ignore").strip()
            data = parse_line(raw) if raw else None
            if data is None:
                continue
        else:
            data = sim.read()

        ts = datetime.now().strftime("%H:%M:%S")
        with state_lock:
            readings.append((ts, data))
            total_readings += 1
        count += 1

        print(f"{GREEN}[SENSOR] temp:{data['TEMP']} | hum:{data['HUM']} | "
              f"moist:{data['MOIST']} | ph:{data['PH']}{RESET}")
        print(f"[STATUS] {engine.get_status_line(data)}")

        # (b) alert on WARNING/CRITICAL — one at a time, with per-sensor cooldown
        if pending_breach is None:
            for b in engine.check_readings(data):
                if b["severity"] >= 2 and \
                        time.time() - last_alert.get(b["sensor"], 0) > ALERT_COOLDOWN:
                    last_alert[b["sensor"]] = time.time()
                    handle_breach(b, data)
                    break

        # (c) rolling baseline adaptation (prints [ADAPT] on drift, every 50)
        engine.update_baseline(data)

        # periodic conversational observation (unchanged from 25%)
        if count % LLM_EVERY_N == 0 and pending_breach is None:
            reply = ask_llm(build_context_block() +
                            "\n\nInterpret the latest readings, note trends, "
                            "ask a short question if useful.")
            if reply:
                print(f"{CYAN}[AI]     {reply}{RESET}")

        if not ser_global:
            stop_event.wait(READ_INTERVAL)


# ----------------------------------------------------------------------
# Thread 2 — user input: breach approvals, slash commands, chat answers
# ----------------------------------------------------------------------
def input_loop():
    global pending_breach
    while not stop_event.is_set():
        try:
            text = input().strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not text:
            continue
        up = text.upper()

        # ---- pending breach approval takes priority ----
        if pending_breach is not None:
            b, cmd = pending_breach, engine.get_actuator_command(pending_breach)
            if up == "Y":
                send_actuator(cmd)
            elif up == "N":
                print(f"{GRAY}[ACTION] Rejected by user. No command sent.{RESET}")
            elif up.startswith("OVERRIDE"):
                custom = text.split(None, 1)[1].upper() if " " in text else ""
                if custom:
                    send_actuator(custom)
                else:
                    print(f"{YELLOW}[ACTION] Usage: OVERRIDE FAN_1:ON{RESET}")
                    continue
            else:
                print(f"{YELLOW}[ACTION] Answer Y, N or OVERRIDE <CMD>.{RESET}")
                continue
            with state_lock:
                pending_breach = None
            continue

        # ---- runtime slash commands ----
        if up.startswith("/SWITCH-PLANT"):
            plants = text.split(None, 1)[1] if " " in text else ""
            if not plants:
                print(f"{YELLOW}[SYSTEM] Usage: /switch-plant orchid,fern{RESET}")
                continue
            print(f"{GRAY}[DTT] Recalculating thresholds for: {plants}{RESET}")
            engine.derive_thresholds(plants.split(","))
        elif up == "/THRESHOLDS":
            engine.print_table()
        elif up == "/BASELINE":
            print(f"{GRAY}{engine.baseline_stats()}{RESET}")
        elif up.startswith("/MANUAL"):
            cmd = text.split(None, 1)[1].upper() if " " in text else ""
            send_actuator(cmd) if cmd else print(
                f"{YELLOW}[SYSTEM] Usage: /manual FAN_1:OFF{RESET}")
        elif up == "/QUIT":
            stop_event.set()
            break
        else:  # plain text -> chat answer for the LLM's next call
            with state_lock:
                chat_history.append({"role": "user",
                                     "content": f"(User says) {text}"})
            print(f"{YELLOW}[YOU]    {text}{RESET}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    global ser_global
    port = sys.argv[1] if len(sys.argv) > 1 else SERIAL_PORT
    print(f"{GRAY}{'=' * 62}{RESET}")
    print(f"{GREEN} GREENMIND — Dynamic Threshold Technology (50% milestone){RESET}")
    print(f"{GRAY} Model: {MODEL_NAME} | Port: {port} | /quit or Ctrl+C to exit{RESET}")
    print(f"{GRAY}{'=' * 62}{RESET}")

    ser_global = connect_esp32(port)
    if ser_global is None:
        print(f"{YELLOW}[SYSTEM] No ESP32 detected on {port}. "
              f"Starting SIMULATION MODE.{RESET}")

    # ---- session setup: plants -> LLM-derived thresholds ----
    try:
        plants = input("[SETUP] Enter plants for this session (comma-separated): ")
    except (EOFError, KeyboardInterrupt):
        plants = ""
    engine.derive_thresholds((plants or "tomato").split(","))

    print(f"{GRAY}[SYSTEM] Commands: /switch-plant <plants> /thresholds "
          f"/baseline /manual <cmd> /quit{RESET}\n")

    t1 = threading.Thread(target=sensor_loop, args=(SensorSimulator(),), daemon=True)
    t2 = threading.Thread(target=input_loop, daemon=True)
    t1.start(); t2.start()

    try:
        while not stop_event.is_set() and t1.is_alive():
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass

    stop_event.set()
    if ser_global:
        ser_global.close()
        print(f"\n{GRAY}[SYSTEM] Serial port closed.{RESET}")
    print(f"\n{GRAY}[SYSTEM] Shutting down. Collected {total_readings} "
          f"sensor readings this session. Goodbye.{RESET}")


if __name__ == "__main__":
    main()
