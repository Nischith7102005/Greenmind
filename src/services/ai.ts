import type { AIConfig, AIChatMessage, SensorData, DeviceState } from '../types';

export const EMBEDDED_AI_CONFIG: AIConfig = {
  apiKey: '',
  baseUrl: 'http://10.221.129.77:1234',
  model: 'llama-3.2-8x3b-moe-dark-champion-instruct-uncensored-abliterated-18.4b',
  systemPrompt: '',
};

const DEFAULT_SYSTEM_PROMPT = `You are GreenMind, an expert AI greenhouse assistant built for Indian farmers. You help users interpret environmental data, diagnose plant problems, recommend actions, and optimize growing conditions.

Guidelines:
- Be concise, practical, and actionable
- Reference specific sensor values when giving advice
- Consider Indian climate zones, crops, and practices
- Warn about potential problems before they escalate
- If uncertain, say so and suggest consulting a local agricultural expert
- Use metric units (°C, %, ppm, lux)
- Format responses with markdown for readability`;

function buildContextMessage(sensor: SensorData | null, device: DeviceState): string {
  if (!sensor) return 'Sensor data: Not available (device not connected)';
  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const last10 = device.history.slice(-10);
  const last100 = device.history.slice(-100);
  return `Current sensor readings:
- Temperature: ${sensor.temperature.toFixed(1)}°C
- Humidity: ${sensor.humidity.toFixed(0)}%
- Soil Moisture: ${sensor.soilMoisture.toFixed(0)}%
- Light: ${sensor.light.toFixed(0)} lux
- CO₂: ${sensor.co2.toFixed(0)} ppm
- Device: ${device.connected ? `Connected (${device.port})` : 'Disconnected'}
- Readings captured: ${device.history.length}
${last100.length > 1 ? `- Last 100 avg temp: ${avg(last100.map(s => s.temperature)).toFixed(1)}°C, humidity: ${avg(last100.map(s => s.humidity)).toFixed(0)}%` : ''}
${last10.length > 1 ? `- Recent trend: temp ${last10[0].temperature.toFixed(1)}°C → ${sensor.temperature.toFixed(1)}°C` : ''}`;
}

export async function streamChat(
  config: AIConfig,
  messages: AIChatMessage[],
  sensor: SensorData | null,
  device: DeviceState,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const contextMsg: AIChatMessage = {
    role: 'system',
    content: `${config.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\n${buildContextMessage(sensor, device)}`,
  };

  const payload = {
    model: config.model,
    messages: [contextMsg, ...messages],
    stream: true,
  };

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'GreenMind',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      onError(`API error ${res.status}: ${body.slice(0, 200)}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError('No response stream'); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { onDone(); return; }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch { /* skip malformed chunks */ }
      }
    }
    onDone();
  } catch (err: any) {
    onError(err?.message || 'Network error');
  }
}

export async function checkAIConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${EMBEDDED_AI_CONFIG.baseUrl}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
