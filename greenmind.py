#!/usr/bin/env python3
"""
GREENMIND — 25% Milestone
=========================
Fully offline hardware-to-LLM conversation loop.

  ESP32 (USB serial)  --->  rolling context window  --->  local Ollama LLM
                                                          (ornith:latest)

- No UI. Terminal only.
- No cloud. 100% local (Ollama on localhost:11434).
- No threshold logic. The LLM only OBSERVES, INTERPRETS and ASKS QUESTIONS.

Usage:
    python greenmind.py            # uses default port (COM3)
    python greenmind.py COM5       # custom port (Windows)
    python greenmind.py /dev/ttyUSB0   # custom port (Linux/Mac)

If no ESP32 is found on the port, the script automatically switches to
SIMULATION MODE so the demo always works — even without hardware.
"""

import sys
import time
import random
import threading
from collections import deque
from datetime import datetime

import serial          # pyserial
import ollama          # local Ollama client

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
SERIAL_PORT   = "COM3"            # default; override with: python greenmind.py <port>
BAUD_RATE     = 115200
MODEL_NAME    = "ornith:latest"   # local model already installed in Ollama
WINDOW_SIZE   = 15                # keep the last 15 readings for trend context
READ_INTERVAL = 5                 # seconds between sensor readings
LLM_EVERY_N   = 3                 # query the LLM every 3rd reading (~15 s)

# ANSI colors for clean terminal output
GREEN  = "\033[92m"
CYAN   = "\033[96m"
YELLOW = "\033[93m"
RED    = "\033[91m"
GRAY   = "\033[90m"
RESET  = "\033[0m"

SYSTEM_PROMPT = (
    "You are GREENMIND, an expert greenhouse AI assistant running entirely "
    "offline on the user's local machine. You receive live sensor readings "
    "from a greenhouse (temperature in °C, humidity in %, soil moisture in %, "
    "and soil pH). Your job is to:\n"
    "1. Acknowledge and interpret each batch of readings in 1-2 sentences.\n"
    "2. Notice TRENDS over time (rising temp, dropping moisture, etc.) and "
    "comment on them.\n"
    "3. Ask the user SHORT diagnostic questions when you need more context "
    "(e.g. 'What plants are you growing?' or 'Is your ventilation manual or "
    "automatic?').\n"
    "4. Keep responses concise — 2-4 sentences max per cycle. No fluff.\n"
    "5. Use technical language appropriate for a greenhouse owner.\n"
    "Never make up sensor values. Only discuss the data you are given."
)

# ----------------------------------------------------------------------
# Shared state (protected by a lock where needed)
# ----------------------------------------------------------------------
readings = deque(maxlen=WINDOW_SIZE)   # rolling window of (timestamp, dict)
chat_history = []                      # conversation memory for the LLM
state_lock = threading.Lock()
stop_event = threading.Event()
total_readings = 0


# ----------------------------------------------------------------------
# Serial connection / simulation fallback
# ----------------------------------------------------------------------
def connect_esp32(port):
    """Try to open the serial port and wait for the ESP32 handshake.
    Returns the open serial object, or None if no ESP32 is available."""
    try:
        ser = serial.Serial(port, BAUD_RATE, timeout=2)
        print(f"{GRAY}[SYSTEM] Port {port} opened. Waiting for ESP32 handshake...{RESET}")
        deadline = time.time() + 10  # wait up to 10 s for the ready message
        while time.time() < deadline:
            line = ser.readline().decode(errors="ignore").strip()
            if "GREENMIND_ESP32_READY" in line:
                print(f"{GREEN}[SYSTEM] ESP32 connected on {port}.{RESET}")
                return ser
        ser.close()
        print(f"{YELLOW}[SYSTEM] Port {port} open but no GREENMIND handshake received.{RESET}")
    except (serial.SerialException, OSError):
        pass
    return None


class SensorSimulator:
    """Generates realistic greenhouse readings that slowly drift over time.
    Temp rises ~26 -> ~30°C over 5 min, humidity drops as temp rises,
    moisture slowly drops, pH stays stable around 6.3-6.6."""

    def __init__(self):
        self.start = time.time()

    def read(self):
        elapsed = time.time() - self.start
        drift = min(elapsed / 300.0, 1.0)  # 0 -> 1 over 5 minutes

        temp = 26.0 + 4.0 * drift + random.uniform(-0.3, 0.3)
        hum = 65.0 - 8.0 * drift + random.uniform(-0.5, 0.5)
        moist = 50.0 - 10.0 * drift + random.uniform(-0.4, 0.4)
        ph = 6.45 + random.uniform(-0.15, 0.15)

        return {
            "TEMP": round(temp, 1),
            "HUM": round(hum, 1),
            "MOIST": round(moist, 1),
            "PH": round(ph, 1),
        }


def parse_line(line):
    """Parse 'TEMP:27.4,HUM:64.2,MOIST:45.1,PH:6.5' into a dict, or None."""
    try:
        parts = dict(p.split(":") for p in line.strip().split(","))
        return {
            "TEMP": float(parts["TEMP"]),
            "HUM": float(parts["HUM"]),
            "MOIST": float(parts["MOIST"]),
            "PH": float(parts["PH"]),
        }
    except (ValueError, KeyError):
        return None


# ----------------------------------------------------------------------
# LLM interaction
# ----------------------------------------------------------------------
def build_context_block():
    """Format the rolling window into a compact block the LLM can scan."""
    with state_lock:
        lines = [
            f"[{ts}] T:{r['TEMP']} H:{r['HUM']} M:{r['MOIST']} pH:{r['PH']}"
            for ts, r in readings
        ]
    return f"Recent readings (last {len(lines)}):\n" + "\n".join(lines)


def query_llm():
    """Send system prompt + conversation history + latest readings to Ollama."""
    context = build_context_block()

    with state_lock:
        # Keep conversation memory (LLM replies + user answers) so the model
        # remembers what it asked and what the user said.
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(chat_history)
        messages.append({
            "role": "user",
            "content": context + "\n\nInterpret the latest readings, note any "
                                 "trends, and ask a short question if useful."
        })

    try:
        # stream=False -> the whole response prints at once (simpler for demo)
        response = ollama.chat(model=MODEL_NAME, messages=messages, stream=False)
        reply = response["message"]["content"].strip()
    except Exception as e:
        print(f"{RED}[ERROR]  Cannot reach Ollama ({e}).\n"
              f"         Make sure it is running: open another terminal and "
              f"run 'ollama serve', then verify the model with "
              f"'ollama list' (expected: {MODEL_NAME}).{RESET}")
        return

    with state_lock:
        # Store a compact version of the exchange in memory
        chat_history.append({"role": "user", "content": context})
        chat_history.append({"role": "assistant", "content": reply})
        # Trim history so the prompt never grows unbounded
        if len(chat_history) > 20:
            del chat_history[:2]

    print(f"{CYAN}[AI]     {reply}{RESET}")


# ----------------------------------------------------------------------
# Thread 1 — sensor loop
# ----------------------------------------------------------------------
def sensor_loop(ser):
    """Reads a sensor line every 5 s (serial or simulated), stores it in the
    rolling window, and every 3rd reading triggers an LLM analysis."""
    global total_readings
    simulator = None if ser else SensorSimulator()
    count = 0

    while not stop_event.is_set():
        # ---- get one reading ----
        if ser:
            raw = ser.readline().decode(errors="ignore").strip()
            data = parse_line(raw) if raw else None
            if data is None:
                continue  # skip malformed / empty lines
        else:
            data = simulator.read()

        ts = datetime.now().strftime("%H:%M:%S")
        with state_lock:
            readings.append((ts, data))
            total_readings += 1
        count += 1

        print(f"{GREEN}[SENSOR] temp:{data['TEMP']} | hum:{data['HUM']} | "
              f"moist:{data['MOIST']} | ph:{data['PH']}{RESET}")

        # ---- every 3rd reading (~15 s) ask the LLM to interpret ----
        if count % LLM_EVERY_N == 0:
            query_llm()

        # In simulation mode we control the pacing ourselves;
        # with real hardware the ESP32 already sends every 5 s.
        if not ser:
            stop_event.wait(READ_INTERVAL)


# ----------------------------------------------------------------------
# Thread 2 — user input loop
# ----------------------------------------------------------------------
def input_loop():
    """Lets the user answer the LLM's questions. Answers are injected into
    the conversation history so the next LLM call remembers them."""
    while not stop_event.is_set():
        try:
            text = input()
        except (EOFError, KeyboardInterrupt):
            break
        text = text.strip()
        if not text:
            continue
        with state_lock:
            chat_history.append({"role": "user", "content": f"(User says) {text}"})
        print(f"{YELLOW}[YOU]    {text}{RESET}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    port = sys.argv[1] if len(sys.argv) > 1 else SERIAL_PORT

    print(f"{GRAY}{'=' * 60}{RESET}")
    print(f"{GREEN} GREENMIND — offline greenhouse AI (25% milestone){RESET}")
    print(f"{GRAY} Model: {MODEL_NAME} | Port: {port} | Ctrl+C to quit{RESET}")
    print(f"{GRAY}{'=' * 60}{RESET}")

    ser = connect_esp32(port)
    if ser is None:
        print(f"{YELLOW}[SYSTEM] No ESP32 detected on {port}. "
              f"Starting SIMULATION MODE.{RESET}")

    print(f"{GRAY}[SYSTEM] Type an answer any time the AI asks a question, "
          f"then press Enter.{RESET}\n")

    sensor_thread = threading.Thread(target=sensor_loop, args=(ser,), daemon=True)
    input_thread = threading.Thread(target=input_loop, daemon=True)
    sensor_thread.start()
    input_thread.start()

    try:
        while sensor_thread.is_alive():
            sensor_thread.join(timeout=0.5)
    except KeyboardInterrupt:
        pass  # graceful shutdown below

    # ---- graceful shutdown ----
    stop_event.set()
    if ser:
        ser.close()
        print(f"\n{GRAY}[SYSTEM] Serial port closed.{RESET}")
    print(f"\n{GRAY}[SYSTEM] Shutting down. "
          f"Collected {total_readings} sensor readings this session. "
          f"Goodbye.{RESET}")


if __name__ == "__main__":
    main()
