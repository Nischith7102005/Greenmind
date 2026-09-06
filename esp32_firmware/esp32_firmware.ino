/*
 * GREENMIND — ESP32 Firmware (25% Milestone)
 * -------------------------------------------
 * Reads 4 greenhouse sensors every 5 seconds and prints ONE line
 * to Serial in this exact format:
 *
 *     TEMP:27.4,HUM:64.2,MOIST:45.1,PH:6.5
 *
 * Board      : ESP32 DevKit
 * Baud rate  : 115200
 *
 * Wiring:
 *   Soil Moisture (analog)  -> GPIO 34
 *   pH Sensor     (analog)  -> GPIO 35
 *   DHT11 (temp + humidity) -> GPIO 4  (digital)
 *
 * Library required: "DHT sensor library" by Adafruit
 * (Install via Arduino IDE: Tools -> Manage Libraries -> search "DHT")
 */

#include <DHT.h>

// ---------------- Pin configuration ----------------
#define MOISTURE_PIN 34   // analog input (ADC1)
#define PH_PIN       35   // analog input (ADC1)
#define DHT_PIN      4    // digital pin shared by temp + humidity (DHT11)
#define DHT_TYPE     DHT11

// ---------------- Timing ----------------
const unsigned long READ_INTERVAL_MS = 5000;  // one reading every 5 seconds

DHT dht(DHT_PIN, DHT_TYPE);

// Small random fluctuation (+/- 0.3) to simulate real sensor noise
float noise() {
  // random(-300, 301) gives -300..300 -> divide by 1000 -> -0.3..0.3
  return random(-300, 301) / 1000.0;
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  // Seed the RNG from a floating analog pin so noise differs per boot
  randomSeed(analogRead(36));

  delay(1000);  // let sensors settle

  // Startup handshake — the Python side waits for this line
  Serial.println("GREENMIND_ESP32_READY");
}

void loop() {
  // ---------- Temperature + Humidity (DHT11) ----------
  float temp = dht.readTemperature();  // °C
  float hum  = dht.readHumidity();     // %

  // DHT11 occasionally returns NaN — fall back to sane defaults
  if (isnan(temp)) temp = 25.0;
  if (isnan(hum))  hum  = 60.0;

  // ---------- Soil Moisture (analog, GPIO 34) ----------
  // Raw 4095 = bone dry, raw 0 = fully wet  ->  map 4095..0 to 0..100 %
  int moistRaw = analogRead(MOISTURE_PIN);
  float moisture = (4095 - moistRaw) * (100.0 / 4095.0);

  // ---------- pH (analog, GPIO 35) ----------
  // Map raw 0..4095 to pH 0..14
  int phRaw = analogRead(PH_PIN);
  float ph = phRaw * (14.0 / 4095.0);

  // ---------- Add small noise to every channel ----------
  temp     += noise();
  hum      += noise();
  moisture += noise();
  ph       += noise();

  // Clamp to physical ranges
  moisture = constrain(moisture, 0.0, 100.0);
  ph       = constrain(ph, 0.0, 14.0);

  // ---------- Print the single CSV line ----------
  // Exact format: TEMP:27.4,HUM:64.2,MOIST:45.1,PH:6.5
  Serial.print("TEMP:");
  Serial.print(temp, 1);
  Serial.print(",HUM:");
  Serial.print(hum, 1);
  Serial.print(",MOIST:");
  Serial.print(moisture, 1);
  Serial.print(",PH:");
  Serial.println(ph, 1);

  delay(READ_INTERVAL_MS);
}
