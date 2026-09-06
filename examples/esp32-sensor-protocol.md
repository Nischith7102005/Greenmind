# ESP32 Sensor Protocol for GREENMIND

The ESP32 should print one compact JSON object per line over USB serial.

## Required fields

```json
{"temperature":28.4,"humidity":67,"soilMoisture":54,"pH":6.4}
```

| Field | Unit | Description |
|---|---:|---|
| `temperature` | °C | Ambient greenhouse air temperature. |
| `humidity` | % RH | Greenhouse relative humidity. |
| `soilMoisture` | % | Water content estimate from the soil moisture probe. |
| `pH` | pH | Soil/acidity reading from the pH probe. |

## Accepted aliases

The parser also accepts:

- temperature: `temp`, `t`
- humidity: `hum`, `h`
- soil moisture: `soil`, `sm`
- pH: `ph`, `soilPh`, `soilPH`

## Example Arduino-style loop

```cpp
void loop() {
  float temperature = readTemperatureC();
  float humidity = readHumidityPercent();
  float soilMoisture = readSoilMoisturePercent();
  float ph = readSoilPH();

  Serial.print("{\"temperature\":");
  Serial.print(temperature, 1);
  Serial.print(",\"humidity\":");
  Serial.print(humidity, 1);
  Serial.print(",\"soilMoisture\":");
  Serial.print(soilMoisture, 1);
  Serial.print(",\"pH\":");
  Serial.print(ph, 2);
  Serial.println("}");

  delay(1500);
}
```

For the current academic phase, the ESP32 should only send sensor readings. GREENMIND does not send actuator ON/OFF commands back in the terminal demo.
