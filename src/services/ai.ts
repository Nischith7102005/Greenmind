import type { AIChatMessage, SensorData, DeviceState } from '../types';
import { calculateDynamicThresholds, formatThresholdReport, normalizePlantNames, PLANT_PROFILES } from './dynamicThreshold';

export const EMBEDDED_AI_CONFIG = {
  apiKey: '',
  baseUrl: import.meta.env.VITE_LOCAL_LLM_URL || 'http://localhost:11434',
  model: import.meta.env.VITE_LOCAL_LLM_MODEL || 'ornith:latest',
};

const SYSTEM_PROMPT = `You are GreenMind AI, an offline greenhouse management assistant.

Architecture rules:
- The app is fully offline and local-first.
- Sensor data comes from an ESP32 over USB serial or from the built-in simulator.
- Reasoning should use plant-specific context and Dynamic Threshold Technology.
- Actuators are not physically controlled in this phase. Recommend fan/motor actions only as owner-approved demo recommendations. Never claim a command was sent.

Focus on greenhouse owners. Use precise technical language. Explain how sensor readings compare to plant-aware dynamic threshold bands. If readings are anomalous, activate the software safety/kill-switch recommendation and tell the owner not to trigger any actuator.`;

function buildSensorBlock(sensor: SensorData | null): string {
  if (!sensor) return 'Not available (device not connected)';
  return `Temperature: ${sensor.temperature.toFixed(1)}°C
Humidity: ${sensor.humidity.toFixed(0)}%
Soil Moisture: ${sensor.soilMoisture.toFixed(0)}%
Soil pH: ${(sensor.pH ?? 7).toFixed(2)}`;
}

function inferPlants(messages: AIChatMessage[]): string[] {
  const allText = messages.map(m => m.content).join(' ').toLowerCase();
  const names = PLANT_PROFILES.map(p => p.name).filter(name => allText.includes(name));
  return normalizePlantNames(names.length ? names : ['tomato']);
}

function fallbackAnswer(messages: AIChatMessage[], sensor: SensorData | null, device: DeviceState): string {
  const plants = inferPlants(messages);
  const history = device.history.length ? device.history : (sensor ? [sensor] : []);
  const state = calculateDynamicThresholds(history, plants);
  const lastQuestion = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  const report = formatThresholdReport(state);

  const contextLine = sensor
    ? `I am reading your ESP32/demo telemetry locally: ${buildSensorBlock(sensor).replace(/\n/g, ', ')}.`
    : 'No live telemetry is available yet, so this is a plant-profile-only answer.';

  return `${contextLine}

${report}

Answer to your question:
${lastQuestion ? `You asked: "${lastQuestion.slice(0, 220)}"\n` : ''}Based on the current ${state.phase} phase, GreenMind is deriving thresholds from two inputs: botanical ranges for ${state.plants.join(', ')} and the rolling behaviour of this greenhouse session. This is the Dynamic Threshold Technology prototype: thresholds are not hardcoded; they adapt per session as more readings arrive.

For this review phase, actuator integration intentionally stops at recommendation generation. If a fan or motor is mentioned above, treat it as an owner approval prompt only — no physical actuator command is sent.`;
}

async function tryOllamaChat(messages: AIChatMessage[], sensor: SensorData | null, device: DeviceState): Promise<string | null> {
  const plants = inferPlants(messages);
  const thresholdReport = formatThresholdReport(calculateDynamicThresholds(device.history.length ? device.history : (sensor ? [sensor] : []), plants));
  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.slice(-12),
    {
      role: 'user',
      content: `Latest sensor data:\n${buildSensorBlock(sensor)}\n\n${thresholdReport}\n\nUse this local dynamic-threshold report to answer. Remember: no actuator commands are sent in this phase.`,
    },
  ];

  try {
    const response = await fetch(`${EMBEDDED_AI_CONFIG.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDED_AI_CONFIG.model, messages: apiMessages, stream: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json?.message?.content || null;
  } catch {
    return null;
  }
}

export async function streamChat(
  _config: { apiKey?: string; baseUrl?: string; model?: string; systemPrompt?: string },
  messages: AIChatMessage[],
  sensor: SensorData | null,
  device: DeviceState,
  onChunk: (text: string) => void,
  onDone: () => void,
  _onError: (err: string) => void,
) {
  const localModelAnswer = await tryOllamaChat(messages, sensor, device);
  const answer = localModelAnswer || fallbackAnswer(messages, sensor, device);

  // Preserve the old streaming UX while staying fully offline.
  const chunks = answer.match(/.{1,90}(\s|$)/g) || [answer];
  for (const chunk of chunks) {
    onChunk(chunk);
    await new Promise(resolve => setTimeout(resolve, 18));
  }
  onDone();
}

export async function checkAIConnection(): Promise<boolean> {
  // The app is always usable offline because the local deterministic Dynamic Threshold
  // engine is bundled. Return true so chat is not blocked when Ollama is not installed.
  return true;
}

export async function checkLocalLLMConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${EMBEDDED_AI_CONFIG.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
