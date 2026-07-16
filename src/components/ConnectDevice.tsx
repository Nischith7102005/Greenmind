import { useState } from 'react';
import { useDevice } from '../context/DeviceContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface ConnectDeviceProps {
  onBack: () => void;
  onNavigate: (page: 'landing' | 'auth' | 'connect' | 'dashboard') => void;
}

export function ConnectDevice({ onBack, onNavigate }: ConnectDeviceProps) {
  const { deviceState, connectSerial, connectSimulation } = useDevice();
  const [isConnecting, setIsConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSerialConnect = async () => {
    setIsConnecting(true);
    setLocalError(null);
    try {
      const success = await connectSerial();
      if (success) {
        onNavigate('dashboard');
      } else {
        setLocalError('Could not establish connection. Please check USB connection and try again.');
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to connect.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSimulate = () => {
    connectSimulation();
    onNavigate('dashboard');
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
      onNavigate('landing');
    }
  };

  const hasWebSerial = typeof navigator !== 'undefined' && !!navigator.serial;

  return (
    <div className="connect-page">
      <div className="connect-bg" />
      
      {/* Floating Header */}
      <div className="connect-nav">
        <button className="nav-back-btn" onClick={onBack}>
          ← Back to Home
        </button>
        <button className="nav-signout-btn" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <div className="connect-container">
        <div className="connect-header">
          <h1 className="connect-title">Connect <span className="accent">Device</span></h1>
          <p className="connect-subtitle">Link your greenhouse sensors to start receiving AI-powered recommendations.</p>
        </div>

        {(localError || deviceState.error) && (
          <div className="connect-error-alert">
            <span className="error-icon">⚠</span>
            <p>{localError || deviceState.error}</p>
          </div>
        )}

        <div className="connect-grid">
          {/* Card 1: Web Serial USB Connection */}
          <div className={`connect-card ${!hasWebSerial ? 'disabled' : ''}`}>
            <div className="card-badge">RECOMMENDED</div>
            <div className="card-icon-wrapper">
              <div className={`pulse-circle ${isConnecting ? 'animating' : ''}`} />
              <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <h3>Microcontroller (USB)</h3>
            <p>Connect any compatible Arduino, ESP32, or Raspberry Pi Pico running GreenMind firmware via Web Serial API.</p>
            
            {hasWebSerial ? (
              <button 
                className="btn-primary connect-btn" 
                onClick={handleSerialConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <span className="spinner" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Detect Device <span className="arrow">→</span>
                  </>
                )}
              </button>
            ) : (
              <div className="unsupported-tag">
                Web Serial not supported in this browser. Use Chrome, Edge, or Opera.
              </div>
            )}
          </div>

          {/* Card 2: Simulated Device */}
          <div className="connect-card simulation-card">
            <div className="card-badge sim">DEVELOPMENT</div>
            <div className="card-icon-wrapper">
              <div className="glow-circle" />
              <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            </div>
            <h3>Simulated Device</h3>
            <p>Bypass physical hardware. Generate realistic greenhouse data (temperature, humidity, light, CO₂) dynamically for testing.</p>
            <button className="btn-secondary connect-btn" onClick={handleSimulate}>
              Continue with Simulated Device
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
