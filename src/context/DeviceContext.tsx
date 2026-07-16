import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { SensorData, DeviceMode, DeviceState } from '../types';
import { requestSerialPort, readSerialLoop, parseSensorJson, generateSimReading } from '../services/device';

const MAX_HISTORY = 500;

interface DeviceContextType {
  deviceState: DeviceState;
  connectSerial: () => Promise<boolean>;
  connectSimulation: () => void;
  disconnect: () => void;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceState, setDeviceState] = useState<DeviceState>({
    mode: 'disconnected',
    connected: false,
    port: null,
    sensorData: null,
    history: [],
    error: null,
  });

  const serialCleanupRef = useRef<(() => void) | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const stateRef = useRef<DeviceState>(deviceState);

  // Keep stateRef up to date for telemetry loops to reference the latest sensor data
  useEffect(() => {
    stateRef.current = deviceState;
  }, [deviceState]);

  const disconnect = useCallback(() => {
    // Clean up serial connection
    if (serialCleanupRef.current) {
      serialCleanupRef.current();
      serialCleanupRef.current = null;
    }
    // Clean up simulation loop
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    setDeviceState({
      mode: 'disconnected',
      connected: false,
      port: null,
      sensorData: null,
      history: [],
      error: null,
    });
  }, []);

  const addReading = useCallback((reading: SensorData) => {
    setDeviceState((prev) => {
      const nextHistory = [...prev.history, reading];
      if (nextHistory.length > MAX_HISTORY) {
        nextHistory.shift();
      }
      return {
        ...prev,
        sensorData: reading,
        history: nextHistory,
      };
    });
  }, []);

  const connectSerial = useCallback(async () => {
    disconnect();
    
    const port = await requestSerialPort();
    if (!port) {
      setDeviceState((prev) => ({
        ...prev,
        error: 'Failed to access or open serial port. Make sure device is plugged in and permissions are granted.',
      }));
      return false;
    }

    setDeviceState({
      mode: 'serial',
      connected: true,
      port: 'Microcontroller (USB)',
      sensorData: null,
      history: [],
      error: null,
    });

    const cleanup = await readSerialLoop(
      port,
      (line) => {
        const reading = parseSensorJson(line);
        if (reading) {
          addReading(reading);
        }
      },
      () => {
        setDeviceState((prev) => ({
          ...prev,
          connected: false,
          error: 'Serial connection lost.',
        }));
      }
    );

    serialCleanupRef.current = cleanup;
    return true;
  }, [disconnect, addReading]);

  const connectSimulation = useCallback(() => {
    disconnect();

    setDeviceState({
      mode: 'simulated',
      connected: true,
      port: 'Simulated Greenhouse',
      sensorData: null,
      history: [],
      error: null,
    });

    // Run immediately once
    const firstReading = generateSimReading(null);
    addReading(firstReading);

    const intervalId = setInterval(() => {
      const prevData = stateRef.current.sensorData;
      const reading = generateSimReading(prevData);
      addReading(reading);
    }, 1500) as unknown as number;

    simIntervalRef.current = intervalId;
  }, [disconnect, addReading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serialCleanupRef.current) serialCleanupRef.current();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  return (
    <DeviceContext.Provider value={{ deviceState, connectSerial, connectSimulation, disconnect }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}