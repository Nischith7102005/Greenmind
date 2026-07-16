import type { SensorData } from '../types';

/* ═══ WEB SERIAL API ═══ */
export async function requestSerialPort(): Promise<SerialPort | null> {
  if (!navigator.serial) return null;
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    return port;
  } catch { return null; }
}

export async function readSerialLoop(
  port: SerialPort,
  onReading: (data: string) => void,
  onError: () => void,
): Promise<() => void> {
  let active = true;
  const decoder = new TextDecoderStream();
  port.readable?.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();

  const loop = async () => {
    let buf = '';
    try {
      while (active) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) onReading(trimmed);
        }
      }
    } catch { if (active) onError(); }
  };

  loop();
  return () => { active = false; reader.cancel().catch(() => {}); };
}

export function parseSensorJson(raw: string): SensorData | null {
  try {
    const obj = JSON.parse(raw);
    return {
      temperature: Number(obj.temperature ?? obj.temp ?? obj.t) || 0,
      humidity: Number(obj.humidity ?? obj.hum ?? obj.h) || 0,
      soilMoisture: Number(obj.soilMoisture ?? obj.soil ?? obj.sm) || 0,
      light: Number(obj.light ?? obj.lux ?? obj.l) || 0,
      co2: Number(obj.co2 ?? obj.carbon ?? obj.c) || 0,
      timestamp: Date.now(),
    };
  } catch { return null; }
}

/* ═══ SIMULATED DEVICE ═══ */
const BASE: Omit<SensorData, 'timestamp'> = {
  temperature: 28.5,
  humidity: 72,
  soilMoisture: 48,
  light: 850,
  co2: 420,
};

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

export function generateSimReading(prev: SensorData | null): SensorData {
  const p = prev || { ...BASE, timestamp: 0 };
  const hour = new Date().getHours();
  // Day/night cycle for light and temperature
  const dayFactor = Math.sin((hour - 6) * Math.PI / 12);
  const tempBase = 25 + dayFactor * 6;
  const lightBase = Math.max(0, dayFactor * 1200);

  return {
    temperature: clamp(p.temperature + (tempBase - p.temperature) * 0.1 + (Math.random() - 0.5) * 0.8, 18, 42),
    humidity: clamp(p.humidity + (Math.random() - 0.5) * 3 - dayFactor * 0.5, 40, 95),
    soilMoisture: clamp(p.soilMoisture + (Math.random() - 0.5) * 2 - 0.15, 20, 80),
    light: clamp(p.light + (lightBase - p.light) * 0.15 + (Math.random() - 0.5) * 60, 0, 2000),
    co2: clamp(p.co2 + (Math.random() - 0.5) * 20 + (dayFactor < 0 ? 8 : -5), 250, 1200),
    timestamp: Date.now(),
  };
}
