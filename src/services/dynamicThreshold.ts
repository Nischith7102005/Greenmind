import type { SensorData } from '../types';

export type SensorKey = 'temperature' | 'humidity' | 'soilMoisture' | 'pH';

export interface Range {
  min: number;
  max: number;
}

export interface PlantProfile {
  name: string;
  ideal: Record<SensorKey, Range>;
  notes: string;
}

export interface ThresholdBand extends Range {
  buffer: number;
  observedAverage: number | null;
  trend: 'rising' | 'falling' | 'stable' | 'insufficient-data';
  source: string;
}

export interface SensorAssessment {
  key: SensorKey;
  label: string;
  unit: string;
  value: number;
  status: 'optimal' | 'low-warning' | 'high-warning' | 'critical-low' | 'critical-high' | 'anomaly';
  explanation: string;
  recommendation?: string;
}

export interface DynamicThresholdState {
  phase: 'observation' | 'active';
  sampleCount: number;
  plants: string[];
  thresholds: Record<SensorKey, ThresholdBand>;
  assessments: SensorAssessment[];
  safety: {
    killSwitch: boolean;
    anomalies: string[];
  };
  summary: string;
}

const SENSOR_META: Record<SensorKey, { label: string; unit: string; impossible: Range; demoActuator: string }> = {
  temperature: { label: 'Temperature', unit: '°C', impossible: { min: -10, max: 60 }, demoActuator: 'Fan ventilation recommendation' },
  humidity: { label: 'Humidity', unit: '%', impossible: { min: 0, max: 100 }, demoActuator: 'Fan ventilation recommendation' },
  soilMoisture: { label: 'Soil Moisture', unit: '%', impossible: { min: 0, max: 100 }, demoActuator: 'Motor irrigation recommendation' },
  pH: { label: 'Soil pH', unit: 'pH', impossible: { min: 0, max: 14 }, demoActuator: 'Nutrient/pH correction recommendation' },
};

export const PLANT_PROFILES: PlantProfile[] = [
  {
    name: 'tomato',
    ideal: {
      temperature: { min: 22, max: 28 },
      humidity: { min: 60, max: 70 },
      soilMoisture: { min: 55, max: 75 },
      pH: { min: 6.0, max: 6.8 },
    },
    notes: 'Tomatoes prefer warm, moderately humid conditions with evenly moist soil and slightly acidic pH.',
  },
  {
    name: 'pepper',
    ideal: {
      temperature: { min: 21, max: 29 },
      humidity: { min: 55, max: 70 },
      soilMoisture: { min: 50, max: 70 },
      pH: { min: 6.0, max: 6.8 },
    },
    notes: 'Peppers tolerate warmth but are sensitive to persistent water stress and large humidity swings.',
  },
  {
    name: 'orchid',
    ideal: {
      temperature: { min: 18, max: 26 },
      humidity: { min: 65, max: 85 },
      soilMoisture: { min: 35, max: 55 },
      pH: { min: 5.5, max: 6.5 },
    },
    notes: 'Orchids need higher humidity, careful airflow, and lower media moisture than vegetable crops.',
  },
  {
    name: 'lettuce',
    ideal: {
      temperature: { min: 15, max: 22 },
      humidity: { min: 50, max: 70 },
      soilMoisture: { min: 60, max: 80 },
      pH: { min: 6.0, max: 7.0 },
    },
    notes: 'Lettuce prefers cooler temperatures and consistent moisture to prevent bolting and leaf bitterness.',
  },
  {
    name: 'cucumber',
    ideal: {
      temperature: { min: 24, max: 30 },
      humidity: { min: 60, max: 80 },
      soilMoisture: { min: 60, max: 80 },
      pH: { min: 5.8, max: 6.8 },
    },
    notes: 'Cucumbers respond well to warm, humid greenhouse conditions and high but not saturated soil moisture.',
  },
];

const DEFAULT_PROFILE: PlantProfile = {
  name: 'greenhouse crop',
  ideal: {
    temperature: { min: 20, max: 28 },
    humidity: { min: 55, max: 75 },
    soilMoisture: { min: 45, max: 75 },
    pH: { min: 5.8, max: 7.0 },
  },
  notes: 'Generic protected-cultivation profile used until the owner specifies plants for the session.',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getValue(reading: SensorData, key: SensorKey): number {
  return key === 'pH' ? reading.pH : reading[key];
}

export function normalizePlantNames(plants: string[]): string[] {
  const known = PLANT_PROFILES.map(p => p.name);
  const normalized = plants
    .flatMap(p => p.split(/[,+/&]|\band\b/i))
    .map(p => p.trim().toLowerCase())
    .filter(Boolean)
    .map(p => known.find(k => p.includes(k) || k.includes(p)) || p);
  return [...new Set(normalized)].slice(0, 6);
}

function profilesFor(plants: string[]): PlantProfile[] {
  const normalized = normalizePlantNames(plants);
  const matched = normalized
    .map(name => PLANT_PROFILES.find(p => p.name === name))
    .filter(Boolean) as PlantProfile[];
  return matched.length > 0 ? matched : [DEFAULT_PROFILE];
}

function botanicalBand(profiles: PlantProfile[], key: SensorKey): Range {
  const mins = profiles.map(p => p.ideal[key].min);
  const maxes = profiles.map(p => p.ideal[key].max);
  const intersection = { min: Math.max(...mins), max: Math.min(...maxes) };
  if (intersection.min < intersection.max) return intersection;

  // If mixed plants have no exact overlap, use the shared average band instead of hardcoding one crop.
  return {
    min: mins.reduce((a, b) => a + b, 0) / mins.length,
    max: maxes.reduce((a, b) => a + b, 0) / maxes.length,
  };
}

function trend(values: number[]): ThresholdBand['trend'] {
  if (values.length < 6) return 'insufficient-data';
  const half = Math.floor(values.length / 2);
  const first = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondValues = values.slice(half);
  const second = secondValues.reduce((a, b) => a + b, 0) / secondValues.length;
  const delta = second - first;
  if (Math.abs(delta) < 0.4) return 'stable';
  return delta > 0 ? 'rising' : 'falling';
}

export function calculateDynamicThresholds(history: SensorData[], plants: string[]): DynamicThresholdState {
  const recent = history.slice(-60);
  const profiles = profilesFor(plants);
  const activePlants = normalizePlantNames(plants).length > 0 ? normalizePlantNames(plants) : profiles.map(p => p.name);
  const sampleCount = recent.length;
  const phase: DynamicThresholdState['phase'] = sampleCount < 8 ? 'observation' : 'active';
  const thresholds = {} as Record<SensorKey, ThresholdBand>;
  const assessments: SensorAssessment[] = [];
  const anomalies: string[] = [];
  const current = recent[recent.length - 1] || null;

  (['temperature', 'humidity', 'soilMoisture', 'pH'] as SensorKey[]).forEach((key) => {
    const plantRange = botanicalBand(profiles, key);
    const values = recent.map(r => getValue(r, key)).filter(Number.isFinite);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const min = values.length ? Math.min(...values) : plantRange.min;
    const max = values.length ? Math.max(...values) : plantRange.max;
    const observedSpread = Math.max(0.5, max - min);
    const buffer = key === 'pH' ? 0.2 : Math.min(key === 'temperature' ? 2.5 : 8, Math.max(key === 'temperature' ? 1 : 4, observedSpread * 0.18));

    // Dynamic Threshold Technology: fuse plant knowledge with the greenhouse baseline.
    // During observation we stay close to botanical bands; after enough samples, we gently
    // adapt around the observed baseline while keeping the result biologically safe.
    const baselineInfluence = phase === 'active' && avg !== null ? 0.28 : 0.08;
    const plantMid = (plantRange.min + plantRange.max) / 2;
    const shiftedMid = avg === null ? plantMid : plantMid * (1 - baselineInfluence) + avg * baselineInfluence;
    const width = (plantRange.max - plantRange.min) / 2;
    const lower = shiftedMid - width;
    const upper = shiftedMid + width;

    thresholds[key] = {
      min: round(clamp(lower, plantRange.min - buffer, plantRange.max), key === 'pH' ? 2 : 1),
      max: round(clamp(upper, plantRange.min, plantRange.max + buffer), key === 'pH' ? 2 : 1),
      buffer: round(buffer, key === 'pH' ? 2 : 1),
      observedAverage: avg === null ? null : round(avg, key === 'pH' ? 2 : 1),
      trend: trend(values),
      source: `${profiles.map(p => p.name).join(', ')} plant profile + ${sampleCount}-sample rolling greenhouse baseline`,
    };
  });

  if (current) {
    (['temperature', 'humidity', 'soilMoisture', 'pH'] as SensorKey[]).forEach((key) => {
      const value = getValue(current, key);
      const meta = SENSOR_META[key];
      const band = thresholds[key];
      let status: SensorAssessment['status'] = 'optimal';
      let explanation = `${meta.label} is inside the dynamic threshold band for ${activePlants.join(', ')}.`;
      let recommendation: string | undefined;

      if (value < meta.impossible.min || value > meta.impossible.max || Number.isNaN(value)) {
        status = 'anomaly';
        explanation = `${meta.label} reading ${value}${meta.unit} is outside the physically valid sensor range.`;
        recommendation = 'Demo safety layer: engage software kill-switch and do not send actuator commands.';
        anomalies.push(explanation);
      } else if (value < band.min - band.buffer) {
        status = 'critical-low';
        explanation = `${meta.label} is critically below the lower boundary (${band.min}${meta.unit}) plus tolerance buffer.`;
        recommendation = key === 'soilMoisture'
          ? 'Recommend owner approval for Motor 1 irrigation in a future actuator build; no command is sent in this phase.'
          : 'Recommend owner inspection/correction; no actuator command is sent in this phase.';
      } else if (value > band.max + band.buffer) {
        status = 'critical-high';
        explanation = `${meta.label} is critically above the upper boundary (${band.max}${meta.unit}) plus tolerance buffer.`;
        recommendation = key === 'temperature' || key === 'humidity'
          ? 'Recommend owner approval for fan ventilation in a future actuator build; no command is sent in this phase.'
          : 'Recommend owner inspection/correction; no actuator command is sent in this phase.';
      } else if (value < band.min) {
        status = 'low-warning';
        explanation = `${meta.label} has crossed below the dynamic lower boundary of ${band.min}${meta.unit}.`;
        recommendation = `${meta.demoActuator}; awaiting manual owner approval in later actuator phase.`;
      } else if (value > band.max) {
        status = 'high-warning';
        explanation = `${meta.label} has crossed above the dynamic upper boundary of ${band.max}${meta.unit}.`;
        recommendation = `${meta.demoActuator}; awaiting manual owner approval in later actuator phase.`;
      }

      assessments.push({ key, label: meta.label, unit: meta.unit, value: round(value, key === 'pH' ? 2 : 1), status, explanation, recommendation });
    });
  }

  const outOfBand = assessments.filter(a => a.status !== 'optimal' && a.status !== 'anomaly');
  const summary = anomalies.length
    ? `Safety anomaly detected. Software kill-switch active for demonstration; all actuator outputs remain disabled.`
    : phase === 'observation'
      ? `Observation phase: collected ${sampleCount}/8 readings. Threshold bands are initialized from plant knowledge and will adapt as the rolling baseline grows.`
      : outOfBand.length
        ? `${outOfBand.length} sensor(s) outside dynamic threshold bands. Recommendations are advisory only; actuators are not triggered in this phase.`
        : `All monitored sensors are inside plant-aware dynamic threshold bands for ${activePlants.join(', ')}.`;

  return {
    phase,
    sampleCount,
    plants: activePlants,
    thresholds,
    assessments,
    safety: { killSwitch: anomalies.length > 0, anomalies },
    summary,
  };
}

export function formatThresholdReport(state: DynamicThresholdState): string {
  const lines = [
    `Dynamic Threshold Technology report`,
    `Phase: ${state.phase} (${state.sampleCount} rolling samples)`,
    `Plants: ${state.plants.join(', ')}`,
    `Summary: ${state.summary}`,
    '',
    '| Sensor | Current | Dynamic band | Avg | Trend | Status |',
    '|---|---:|---:|---:|---|---|',
  ];

  for (const assessment of state.assessments) {
    const band = state.thresholds[assessment.key];
    lines.push(`| ${assessment.label} | ${assessment.value}${assessment.unit} | ${band.min}-${band.max}${assessment.unit} ±${band.buffer} | ${band.observedAverage ?? 'n/a'} | ${band.trend} | ${assessment.status} |`);
  }

  const recommendations = state.assessments.filter(a => a.recommendation);
  if (recommendations.length) {
    lines.push('', 'Recommendations for owner approval (no actuator command sent):');
    recommendations.forEach(a => lines.push(`- ${a.label}: ${a.recommendation}`));
  }

  return lines.join('\n');
}
