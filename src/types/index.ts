/* ═══ SENSOR / DEVICE ═══ */
export interface SensorData {
  temperature: number;   // °C
  humidity: number;      // %
  soilMoisture: number;  // %
  light: number;         // lux
  co2: number;           // ppm
  timestamp: number;     // Date.now()
}

export type DeviceMode = 'disconnected' | 'serial' | 'simulated';

export interface DeviceState {
  mode: DeviceMode;
  connected: boolean;
  port: string | null;   // Serial port info or 'simulated'
  sensorData: SensorData | null;
  history: SensorData[];  // last 500 readings
  error: string | null;
}

/* ═══ CHAT ═══ */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sensorSnapshot?: SensorData | null;
  streaming?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

/* ═══ AI ═══ */
export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
}

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/* ═══ APP ROUTING ═══ */
export type AppPage = 'landing' | 'auth' | 'connect' | 'dashboard';

/* ═══ SUGGESTED PROMPTS ═══ */
export const SUGGESTED_PROMPTS = [
  "What's causing my temperature spikes?",
  "How can I reduce humidity in my polyhouse?",
  "Is my soil moisture too low for tomatoes?",
  "Predict pest risk this week",
  "Optimize my ventilation schedule",
  "What do these sensor readings mean?",
];
