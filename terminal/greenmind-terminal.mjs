#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const MAX_HISTORY = 500;
const OBSERVATION_SAMPLES = 8;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'ornith:latest';


const PLANTS = {
  tomato: { temperature: [22, 28], humidity: [60, 70], soilMoisture: [55, 75], pH: [6.0, 6.8] },
  pepper: { temperature: [21, 29], humidity: [55, 70], soilMoisture: [50, 70], pH: [6.0, 6.8] },
  orchid: { temperature: [18, 26], humidity: [65, 85], soilMoisture: [35, 55], pH: [5.5, 6.5] },
  lettuce: { temperature: [15, 22], humidity: [50, 70], soilMoisture: [60, 80], pH: [6.0, 7.0] },
  cucumber: { temperature: [24, 30], humidity: [60, 80], soilMoisture: [60, 80], pH: [5.8, 6.8] },
};

const DEFAULT = { temperature: [20, 28], humidity: [55, 75], soilMoisture: [45, 75], pH: [5.8, 7.0] };
const META = {
  temperature: ['Temperature', '°C', [-10, 60], 'Fan ventilation recommendation'],
  humidity: ['Humidity', '%', [0, 100], 'Fan ventilation recommendation'],
  soilMoisture: ['Soil Moisture', '%', [0, 100], 'Motor irrigation recommendation'],
  pH: ['Soil pH', 'pH', [0, 14], 'pH/nutrient correction recommendation'],
};
const SENSOR_KEYS = ['temperature', 'humidity', 'soilMoisture', 'pH'];

const colors = {
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m'
};

function c(text, color) { return `${colors[color] || ''}${text}${colors.reset}`; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function avg(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
function round(v, places = 1) { const f = 10 ** places; return Math.round(v * f) / f; }

function normalizePlants(text) {
  const lower = String(text || '').toLowerCase();
  const found = Object.keys(PLANTS).filter(name => lower.includes(name));
  return found.length ? found : ['tomato'];
}

function plantBand(plants, key) {
  const ranges = plants.map(p => PLANTS[p]?.[key] || DEFAULT[key]);
  const minIntersection = Math.max(...ranges.map(r => r[0]));
  const maxIntersection = Math.min(...ranges.map(r => r[1]));
  if (minIntersection < maxIntersection) return [minIntersection, maxIntersection];
  return [avg(ranges.map(r => r[0])), avg(ranges.map(r => r[1]))];
}

function trend(values) {
  if (values.length < 6) return 'insufficient-data';
  const half = Math.floor(values.length / 2);
  const delta = avg(values.slice(half)) - avg(values.slice(0, half));
  if (Math.abs(delta) < 0.4) return 'stable';
  return delta > 0 ? 'rising' : 'falling';
}

function dynamicThresholds(history, plants) {
  const recent = history.slice(-60);
  const phase = recent.length < OBSERVATION_SAMPLES ? 'observation' : 'active';
  const thresholds = {};
  const assessments = [];
  const anomalies = [];
  const current = recent.at(-1);

  for (const key of SENSOR_KEYS) {
    const [plantMin, plantMax] = plantBand(plants, key);
    const values = recent.map(r => Number(r[key])).filter(Number.isFinite);
    const observedAverage = values.length ? avg(values) : null;
    const observedSpread = values.length ? Math.max(0.5, Math.max(...values) - Math.min(...values)) : 1;
    const buffer = key === 'pH' ? 0.2 : Math.min(key === 'temperature' ? 2.5 : 8, Math.max(key === 'temperature' ? 1 : 4, observedSpread * 0.18));
    const influence = phase === 'active' && observedAverage !== null ? 0.28 : 0.08;
    const plantMid = (plantMin + plantMax) / 2;
    const shiftedMid = observedAverage === null ? plantMid : plantMid * (1 - influence) + observedAverage * influence;
    const width = (plantMax - plantMin) / 2;
    thresholds[key] = {
      min: round(clamp(shiftedMid - width, plantMin - buffer, plantMax), key === 'pH' ? 2 : 1),
      max: round(clamp(shiftedMid + width, plantMin, plantMax + buffer), key === 'pH' ? 2 : 1),
      buffer: round(buffer, key === 'pH' ? 2 : 1),
      observedAverage: observedAverage === null ? null : round(observedAverage, key === 'pH' ? 2 : 1),
      trend: trend(values),
    };
  }

  if (current) {
    for (const key of SENSOR_KEYS) {
      const [label, unit, impossible, demoActuator] = META[key];
      const value = Number(current[key]);
      const band = thresholds[key];
      let status = 'optimal';
      let recommendation = '';
      if (!Number.isFinite(value) || value < impossible[0] || value > impossible[1]) {
        status = 'anomaly';
        recommendation = 'SAFETY: software kill-switch. Do not approve actuator output.';
        anomalies.push(`${label} impossible value: ${value}${unit}`);
      } else if (value < band.min - band.buffer) {
        status = 'critical-low';
        recommendation = key === 'soilMoisture' ? 'Owner may approve Motor 1 irrigation in future actuator phase; no command sent now.' : 'Owner inspection/correction recommended; no command sent now.';
      } else if (value > band.max + band.buffer) {
        status = 'critical-high';
        recommendation = ['temperature', 'humidity'].includes(key) ? 'Owner may approve fan ventilation in future actuator phase; no command sent now.' : 'Owner inspection/correction recommended; no command sent now.';
      } else if (value < band.min) {
        status = 'low-warning';
        recommendation = `${demoActuator}; awaiting manual owner approval in later actuator phase.`;
      } else if (value > band.max) {
        status = 'high-warning';
        recommendation = `${demoActuator}; awaiting manual owner approval in later actuator phase.`;
      }
      assessments.push({ key, label, unit, value: round(value, key === 'pH' ? 2 : 1), status, recommendation });
    }
  }

  const summary = anomalies.length
    ? 'Safety anomaly detected. Demo kill-switch active; actuator outputs disabled.'
    : phase === 'observation'
      ? `Observation phase: ${recent.length}/${OBSERVATION_SAMPLES} readings. Bands start from plant knowledge and will adapt.`
      : assessments.some(a => a.status !== 'optimal')
        ? 'One or more readings crossed dynamic bands. Recommendations only; no actuator command sent.'
        : 'All sensors are within plant-aware dynamic threshold bands.';

  return { phase, sampleCount: recent.length, plants, thresholds, assessments, anomalies, summary };
}

function generateReading(previous, tick) {
  const p = previous || { temperature: 28.5, humidity: 72, soilMoisture: 48, pH: 6.4 };
  const dayFactor = Math.sin(((new Date().getHours() + tick / 8) - 6) * Math.PI / 12);
  const tempBase = 25 + dayFactor * 6;
  return {
    temperature: round(clamp(p.temperature + (tempBase - p.temperature) * 0.12 + (Math.random() - 0.5) * 0.9, 18, 42), 1),
    humidity: round(clamp(p.humidity + (Math.random() - 0.5) * 3 - dayFactor * 0.5, 40, 95), 1),
    soilMoisture: round(clamp(p.soilMoisture + (Math.random() - 0.5) * 2 - 0.2, 18, 82), 1),
    pH: round(clamp((p.pH ?? 6.4) + (Math.random() - 0.5) * 0.06, 4.5, 8.5), 2),
    timestamp: Date.now(),
  };
}

function parseReading(raw) {
  try {
    const obj = JSON.parse(raw);
    return {
      temperature: Number(obj.temperature ?? obj.temp ?? obj.t),
      humidity: Number(obj.humidity ?? obj.hum ?? obj.h),
      soilMoisture: Number(obj.soilMoisture ?? obj.soil ?? obj.sm),
      pH: Number(obj.pH ?? obj.ph ?? obj.soilPh ?? 7),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

function printReport(state, reading) {
  console.clear();
  console.log(c('GREENMIND — Offline Terminal Demo', 'bold'));
  console.log(c('Dynamic Threshold Technology prototype | No actuator commands are sent in this phase', 'dim'));
  console.log('');
  console.log(`${c('Plants:', 'cyan')} ${state.plants.join(', ')}    ${c('Phase:', 'cyan')} ${state.phase}    ${c('Samples:', 'cyan')} ${state.sampleCount}`);
  console.log(`${c('Latest:', 'cyan')} ${reading.temperature}°C | ${reading.humidity}% RH | ${reading.soilMoisture}% soil | pH ${reading.pH}`);
  console.log('');
  console.log(state.summary.includes('Safety') ? c(state.summary, 'red') : c(state.summary, state.summary.includes('crossed') ? 'yellow' : 'green'));
  console.log('');
  console.table(state.assessments.map(a => ({
    Sensor: a.label,
    Current: `${a.value}${a.unit}`,
    'Dynamic Band': `${state.thresholds[a.key].min}-${state.thresholds[a.key].max}${a.unit} ±${state.thresholds[a.key].buffer}`,
    Average: state.thresholds[a.key].observedAverage ?? 'n/a',
    Trend: state.thresholds[a.key].trend,
    Status: a.status,
  })));
  const recs = state.assessments.filter(a => a.recommendation);
  if (recs.length) {
    console.log(c('\nRecommendations requiring owner approval:', 'yellow'));
    for (const rec of recs) console.log(`- ${rec.label}: ${rec.recommendation}`);
  }
  console.log(c('\nCommands: ask <question> | plants <list> | paste <json> | quit', 'dim'));
}

function thresholdReportText(state) {
  const rows = state.assessments.map(a => {
    const b = state.thresholds[a.key];
    return `${a.label}: current ${a.value}${a.unit}, dynamic band ${b.min}-${b.max}${a.unit} ±${b.buffer}, avg ${b.observedAverage ?? 'n/a'}, trend ${b.trend}, status ${a.status}${a.recommendation ? `, recommendation: ${a.recommendation}` : ''}`;
  }).join('\n');
  return `Plants: ${state.plants.join(', ')}\nPhase: ${state.phase}\nSamples: ${state.sampleCount}\nSummary: ${state.summary}\n${rows}`;
}

async function tryOllamaAnswer(question, state) {
  const prompt = `You are GREENMIND, an offline greenhouse AI assistant running locally through Ollama.

Project rules:
- Use Dynamic Threshold Technology: plant-aware, per-session thresholds derived from plant profiles plus rolling sensor baselines.
- No cloud APIs, no internet dependency.
- Current phase stops before actuators. You may recommend fan/motor action, but must clearly state that no actuator command is sent and the owner must manually approve future actuator actions.
- If sensor anomaly/kill-switch appears, prioritize safety.
- Use concise technical language suitable for a greenhouse owner and lecturer demo.

Dynamic threshold state:
${thresholdReportText(state)}

User question: ${question}`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 }
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json?.response?.trim() || null;
  } catch {
    return null;
  }
}

function fallbackAnswer(question, state) {
  const critical = state.assessments.filter(a => a.status.includes('critical') || a.status === 'anomaly');
  const warnings = state.assessments.filter(a => a.status.includes('warning'));
  const lines = [];
  lines.push(`You asked: ${question}`);
  lines.push(`The local engine is using plant context (${state.plants.join(', ')}) plus the ${state.sampleCount}-sample rolling baseline to derive thresholds. This means the numbers are session-specific, not hardcoded rules.`);
  if (critical.length) {
    lines.push(`Critical attention: ${critical.map(a => `${a.label} is ${a.status}`).join('; ')}.`);
  } else if (warnings.length) {
    lines.push(`Advisory: ${warnings.map(a => `${a.label} is ${a.status}`).join('; ')}.`);
  } else {
    lines.push('All four demo sensors are currently inside their dynamic threshold bands. Continue observing for trend refinement.');
  }
  const recs = state.assessments.filter(a => a.recommendation);
  if (recs.length) lines.push(`Recommendation layer: ${recs.map(a => `${a.label}: ${a.recommendation}`).join(' ')}`);
  lines.push('Actuator layer: disabled for lecturer review; no fan/motor command has been sent.');
  return lines.join('\n');
}

async function answer(question, state) {
  console.log(c('\nGreenMind:', 'green'));
  const ollama = await tryOllamaAnswer(question, state);
  if (ollama) {
    console.log(c(`Using local Ollama model: ${OLLAMA_MODEL}`, 'dim'));
    console.log(ollama);
  } else {
    console.log(c(`Ollama not reachable at ${OLLAMA_URL} with model ${OLLAMA_MODEL}; using bundled offline threshold fallback.`, 'yellow'));
    console.log(fallbackAnswer(question, state));
  }
  console.log('');
}

function usage() {
  console.log(`Usage:
  npm run terminal                 Start simulated offline terminal demo
  npm run terminal -- --manual     Paste ESP32 JSON readings manually
  npm run terminal -- --serial /dev/ttyUSB0   Best-effort read JSON lines from a serial device file

Ollama:
  Default local model: ornith:latest
  Run in another terminal: ollama serve
  Optional override: OLLAMA_MODEL=your-model npm run terminal

Expected ESP32 JSON line:
  {"temperature":28.4,"humidity":67,"soilMoisture":54,"pH":6.4}
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return usage();
  const manual = args.includes('--manual');
  const serialIndex = args.indexOf('--serial');
  const serialPath = serialIndex >= 0 ? args[serialIndex + 1] : null;

  const rl = readline.createInterface({ input, output });
  const location = await rl.question('Greenhouse/session location: ');
  const plantText = await rl.question('Plants in this session (example: tomatoes, peppers): ');
  let plants = normalizePlants(plantText);
  const history = [];
  let tick = 0;

  console.log(`\nSession created for ${location || 'Demo Greenhouse'} with plants: ${plants.join(', ')}.`);
  console.log(`Ollama target: ${OLLAMA_URL} | model: ${OLLAMA_MODEL}`);
  console.log('Collecting sensor readings...\n');

  let last = null;
  const addReading = (reading) => {
    if (!reading) return;
    history.push(reading);
    while (history.length > MAX_HISTORY) history.shift();
    last = reading;
    printReport(dynamicThresholds(history, plants), reading);
  };

  if (serialPath) {
    console.log(c(`Reading JSON lines from ${serialPath}. If this fails, use --manual or simulated mode.`, 'dim'));
    const stream = fs.createReadStream(serialPath, { encoding: 'utf8' });
    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) addReading(parseReading(line.trim()));
    });
    stream.on('error', err => console.error(c(`Serial read error: ${err.message}`, 'red')));
  } else if (!manual) {
    addReading(generateReading(last, tick++));
    setInterval(() => addReading(generateReading(last, tick++)), 1500);
  }

  while (true) {
    const line = await rl.question('greenmind> ');
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (['quit', 'exit', 'q'].includes(trimmed.toLowerCase())) break;
    if (trimmed.toLowerCase().startsWith('plants ')) {
      plants = normalizePlants(trimmed.slice(7));
      if (last) printReport(dynamicThresholds(history, plants), last);
      continue;
    }
    if (trimmed.toLowerCase().startsWith('paste ')) {
      addReading(parseReading(trimmed.slice(6)));
      continue;
    }
    if (manual) {
      const reading = parseReading(trimmed);
      if (reading) { addReading(reading); continue; }
    }
    await answer(trimmed.replace(/^ask\s+/i, ''), dynamicThresholds(history, plants));
  }
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
