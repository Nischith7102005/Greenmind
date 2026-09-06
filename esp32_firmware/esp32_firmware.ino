/*
 * GREENMIND — ESP32 Firmware (50% Milestone: sensors + actuators)
 * ---------------------------------------------------------------
 * Every 5 s prints one sensor line:
 *     TEMP:27.4,HUM:64.2,MOIST:45.1,PH:6.5
 * Accepts actuator commands over Serial:
 *     FAN_1:ON / FAN_1:OFF / MOTOR_1:ON / MOTOR_1:OFF   -> replies ACK:<cmd>
 * Safety: if no serial data received for 60 s, all actuators turn OFF
 * and "SAFETY:ALL_OFF" is printed.
 *
 * Board: ESP32 DevKit | Baud: 115200
 * Wiring:
 *   Soil Moisture (analog)  -> GPIO 34
 *   pH Sensor     (analog)  -> GPIO 35
 *   DHT11 (temp + humidity) -> GPIO 4
 *   FAN_1   relay/driver    -> GPIO 25 (digital out)
 *   MOTOR_1 relay/driver    -> GPIO 26 (digital out)
 *
 * Library: "DHT sensor library" by Adafruit.
 */

#include <DHT.h>

// ---------------- Pins ----------------
#define MOISTURE_PIN 34
#define PH_PIN       35
#define DHT_PIN      4
#define DHT_TYPE     DHT11
#define FAN_1_PIN    25   // fan actuator
#define MOTOR_1_PIN  26   // irrigation motor actuator

// ---------------- Timing ----------------
const unsigned long READ_INTERVAL_MS = 5000;   // sensor line every 5 s
const unsigned long SAFETY_TIMEOUT_MS = 60000; // kill switch after 60 s silence

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastRead = 0;
unsigned long lastSerialRx = 0;
bool safetyTripped = false;
String rxBuffer = "";

float noise() { return random(-300, 301) / 1000.0; }  // +/- 0.3

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(FAN_1_PIN, OUTPUT);
  pinMode(MOTOR_1_PIN, OUTPUT);
  digitalWrite(FAN_1_PIN, LOW);    // actuators start OFF
  digitalWrite(MOTOR_1_PIN, LOW);
  randomSeed(analogRead(36));
  delay(1000);
  lastSerialRx = millis();
  Serial.println("GREENMIND_ESP32_READY");
}

// Parse and apply one actuator command line, e.g. "FAN_1:ON"
void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  int pin = -1;
  if (cmd.startsWith("FAN_1:"))   pin = FAN_1_PIN;
  if (cmd.startsWith("MOTOR_1:")) pin = MOTOR_1_PIN;

  if (pin != -1) {
    bool on = cmd.endsWith(":ON");
    bool off = cmd.endsWith(":OFF");
    if (on || off) {
      digitalWrite(pin, on ? HIGH : LOW);
      Serial.print("ACK:");
      Serial.println(cmd);                 // e.g. ACK:FAN_1:ON
      safetyTripped = false;               // fresh command re-arms actuators
      return;
    }
  }
  Serial.print("ERR:UNKNOWN_CMD:");
  Serial.println(cmd);
}

void loop() {
  // ---------- 1. Non-blocking serial command reader ----------
  while (Serial.available() > 0) {
    char c = Serial.read();
    lastSerialRx = millis();               // any byte resets the kill timer
    if (c == '\n' || c == '\r') {
      if (rxBuffer.length() > 0) handleCommand(rxBuffer);
      rxBuffer = "";
    } else if (rxBuffer.length() < 64) {
      rxBuffer += c;
    }
  }

  // ---------- 2. Safety kill switch (60 s of serial silence) ----------
  if (!safetyTripped && millis() - lastSerialRx > SAFETY_TIMEOUT_MS) {
    digitalWrite(FAN_1_PIN, LOW);
    digitalWrite(MOTOR_1_PIN, LOW);
    Serial.println("SAFETY:ALL_OFF");
    safetyTripped = true;                  // print once until next command
  }

  // ---------- 3. Sensor read + print every 5 s (non-blocking) ----------
  if (millis() - lastRead >= READ_INTERVAL_MS) {
    lastRead = millis();

    float temp = dht.readTemperature();    // °C
    float hum  = dht.readHumidity();       // %
    if (isnan(temp)) temp = 25.0;          // DHT11 sometimes returns NaN
    if (isnan(hum))  hum  = 60.0;

    // Moisture: raw 4095 = dry, 0 = wet -> 0..100 %
    float moisture = (4095 - analogRead(MOISTURE_PIN)) * (100.0 / 4095.0);
    // pH: raw 0..4095 -> 0..14
    float ph = analogRead(PH_PIN) * (14.0 / 4095.0);

    temp += noise(); hum += noise(); moisture += noise(); ph += noise();
    moisture = constrain(moisture, 0.0, 100.0);
    ph = constrain(ph, 0.0, 14.0);

    Serial.print("TEMP:");  Serial.print(temp, 1);
    Serial.print(",HUM:");  Serial.print(hum, 1);
    Serial.print(",MOIST:"); Serial.print(moisture, 1);
    Serial.print(",PH:");   Serial.println(ph, 1);
  }
}
