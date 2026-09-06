import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDevice } from '../context/DeviceContext';
import { streamChat, checkAIConnection, EMBEDDED_AI_CONFIG } from '../services/ai';
import { calculateDynamicThresholds, normalizePlantNames, PLANT_PROFILES } from '../services/dynamicThreshold';
import {
  getSessions, getCurrentSessionId, setCurrentSessionId,
  createSession, updateSessionMessages, deleteSession,
  getSessionMessages, type ChatSession,
} from '../services/sessions';
import type { ChatMessage, AIChatMessage, AppPage, ChatMode } from '../types';

interface DashboardProps {
  mode: ChatMode;
  onNavigate: (page: AppPage, mode?: ChatMode) => void;
}

const WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hello! I'm GreenMind, your offline greenhouse companion. Tell me the plants in this session, then I'll derive plant-aware dynamic thresholds from the ESP32/demo telemetry. For this review phase I only recommend fan/motor actions — no actuator command is sent.",
  timestamp: Date.now(),
};

export function Dashboard({ mode, onNavigate }: DashboardProps) {
  const { deviceState, disconnect, connectSimulation } = useDevice();
  const [aiConnected, setAiConnected] = useState(false);
  const [showSessions, setShowSessions] = useState(true);

  // Session management
  const [sessions, setSessions] = useState<ChatSession[]>(getSessions);
  const [currentSessionId, setCurrentSessionIdState] = useState<string>(() => {
    const existing = getCurrentSessionId();
    if (existing && getSessions().some(s => s.id === existing)) return existing;
    const s = createSession();
    setSessions(getSessions());
    return s.id;
  });

  const loadMessages = (): ChatMessage[] => {
    const msgs = getSessionMessages(currentSessionId);
    if (msgs.length > 0) return msgs;
    return [{ ...WELCOME_MSG, timestamp: Date.now() }];
  };

  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const currentPlants = useMemo(() => {
    const text = messages.map(m => m.content).join(' ').toLowerCase();
    const matched = PLANT_PROFILES.map(p => p.name).filter(name => text.includes(name));
    return normalizePlantNames(matched.length ? matched : ['tomato']);
  }, [messages]);
  const thresholdState = useMemo(
    () => calculateDynamicThresholds(deviceState.history, currentPlants),
    [deviceState.history, currentPlants]
  );

  const [attachedFile, setAttachedFile] = useState<{
    name: string; content: string; type: string; size: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Switch session
  const switchSession = useCallback((id: string) => {
    // Save current session state first
    if (messages.length > 1) {
      updateSessionMessages(currentSessionId, messages);
    }
    setCurrentSessionId(id);
    setCurrentSessionIdState(id);
    const msgs = getSessionMessages(id);
    setMessages(msgs.length > 0 ? msgs : [{ ...WELCOME_MSG, timestamp: Date.now() }]);
    setInputValue('');
  }, [currentSessionId, messages]);

  // New session
  const newSession = useCallback(() => {
    if (messages.length > 1) {
      updateSessionMessages(currentSessionId, messages);
    }
    const s = createSession();
    setSessions(getSessions());
    setCurrentSessionIdState(s.id);
    setMessages([{ ...WELCOME_MSG, timestamp: Date.now() }]);
    setInputValue('');
  }, [currentSessionId, messages]);

  // Delete session
  const handleDeleteSession = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    const remaining = getSessions();
    setSessions(remaining);
    if (currentSessionId === id) {
      if (remaining.length > 0) {
        switchSession(remaining[0].id);
      } else {
        const s = createSession();
        setSessions(getSessions());
        setCurrentSessionIdState(s.id);
        setMessages([{ ...WELCOME_MSG, timestamp: Date.now() }]);
      }
    }
  }, [currentSessionId, switchSession]);

  // Check AI connectivity
  useEffect(() => {
    const check = async () => {
      const ok = await checkAIConnection();
      setAiConnected(ok);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Restore only the mode represented by the URL. A serial connection cannot be
  // reopened without a user gesture, but its chat route still remains intact.
  useEffect(() => {
    if (mode === 'simulated') {
      if (!deviceState.connected || deviceState.mode !== 'simulated') {
        connectSimulation();
      }
    } else if (deviceState.mode === 'simulated') {
      disconnect();
    }
    // Connection state changes are intentionally excluded: this effect responds
    // to route changes, while the device context owns connection lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, connectSimulation, disconnect]);

  // Persist messages to session
  useEffect(() => {
    if (messages.length > 1) {
      updateSessionMessages(currentSessionId, messages.slice(-50));
    }
  }, [messages, currentSessionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleDisconnect = () => {
    disconnect();
    onNavigate('connect');
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setAttachedFile({
        name: file.name, type: file.type, size: file.size,
        content: text || `[Binary/Unsupported File format: ${file.name}]`,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() && !attachedFile) return;

    const currentSensor = deviceState.sensorData;
    const userMsgId = `user-${Date.now()}`;
    const userMsgContent = textToSend.trim();

    const userMessage: ChatMessage = {
      id: userMsgId, role: 'user',
      content: attachedFile
        ? `📎 Attached: ${attachedFile.name}\n\n${userMsgContent}`
        : userMsgContent,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    let contentWithContext = userMsgContent;
    if (attachedFile) {
      contentWithContext = `[Uploaded File Context]\nFilename: ${attachedFile.name}\nFile size: ${attachedFile.size} bytes\nContent:\n${attachedFile.content}\n\n[User Message]\n${userMsgContent}`;
    }

    const chatHistory = messages
      .filter(m => m.id !== 'welcome' && m.role !== 'system')
      .slice(-15)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const apiMessages: AIChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: contentWithContext }
    ];

    setAttachedFile(null);

    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantMsgId, role: 'assistant', content: '',
      timestamp: Date.now(), streaming: true,
    }]);

    let fullResponseText = '';

    await streamChat(
      EMBEDDED_AI_CONFIG,
      apiMessages,
      currentSensor,
      deviceState,
      (chunk) => {
        fullResponseText += chunk;
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: fullResponseText } : m)
        );
      },
      () => {
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m)
        );
        setIsLoading(false);
      },
      (errorMsg) => {
        setMessages(prev => [
          ...prev.filter(m => m.id !== assistantMsgId),
          { id: `err-${Date.now()}`, role: 'system',
            content: `Error: ${errorMsg}. Local fallback should keep GreenMind usable offline; please retry.`,
            timestamp: Date.now(),
          }
        ]);
        setIsLoading(false);
      }
    );
  };

  return (
    <div className="dash-layout">
      {/* SESSIONS SIDEBAR */}
      <div className={`sessions-sidebar ${showSessions ? 'open' : 'closed'}`}>
        <div className="sessions-header">
          <button className="sessions-new-btn" onClick={newSession}>+ New Chat</button>
        </div>
        <div className="sessions-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`sessions-item ${s.id === currentSessionId ? 'active' : ''}`}
              onClick={() => switchSession(s.id)}
            >
              <span className="sessions-item-name">{s.name}</span>
              <button
                className="sessions-item-delete"
                onClick={(e) => handleDeleteSession(s.id, e)}
                title="Delete"
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* TOGGLE SESSIONS BUTTON */}
      <button
        className="sessions-toggle"
        onClick={() => setShowSessions(!showSessions)}
        title={showSessions ? 'Hide sessions' : 'Show sessions'}
      >
        {showSessions ? '◀' : '▶'}
      </button>

      {/* TELEMETRY SIDEBAR */}
      <div className="dash-sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-wrapper">
            <h2 className="logo-text">GreenMind</h2>
          </div>
          <span className="version-tag">v1.0.0</span>
        </div>

        <div className="widget-section">
          <div className="section-label">Offline Reasoning</div>
          <div className="connection-info">
            <div className="connection-status">
              <span className="status-text" style={{ color: aiConnected ? '#52b788' : '#e05050' }}>
                {aiConnected ? 'Local engine ready' : 'Starting local engine'}
              </span>
            </div>
            <div className="port-details">Device: {deviceState.port || 'None'}</div>
          </div>
        </div>

        <div className="widget-section telemetry-hud">
          <div className="section-label">Live Telemetry</div>
          {deviceState.sensorData ? (
            <div className="telemetry-grid">
              <div className="telemetry-item">
                <span className="item-label">Temperature</span>
                <span className="item-value">{deviceState.sensorData.temperature.toFixed(1)} <span className="unit">°C</span></span>
                <div className="visual-bar" style={{ '--progress': `${(deviceState.sensorData.temperature / 50) * 100}%` } as React.CSSProperties} />
              </div>
              <div className="telemetry-item">
                <span className="item-label">Humidity</span>
                <span className="item-value">{deviceState.sensorData.humidity.toFixed(0)} <span className="unit">%</span></span>
                <div className="visual-bar" style={{ '--progress': `${deviceState.sensorData.humidity}%` } as React.CSSProperties} />
              </div>
              <div className="telemetry-item">
                <span className="item-label">Soil Moisture</span>
                <span className="item-value">{deviceState.sensorData.soilMoisture.toFixed(0)} <span className="unit">%</span></span>
                <div className="visual-bar" style={{ '--progress': `${deviceState.sensorData.soilMoisture}%` } as React.CSSProperties} />
              </div>
              <div className="telemetry-item">
                <span className="item-label">Soil pH</span>
                <span className="item-value">{(deviceState.sensorData.pH ?? 7).toFixed(2)} <span className="unit">pH</span></span>
                <div className="visual-bar" style={{ '--progress': `${Math.min(100, ((deviceState.sensorData.pH ?? 7) / 14) * 100)}%` } as React.CSSProperties} />
              </div>
            </div>
          ) : (
            <div className="telemetry-empty">
              <div className="skeleton-line short" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <p>Waiting for sensor stream...</p>
            </div>
          )}
        </div>

        <div className="widget-section threshold-hud">
          <div className="section-label">Dynamic Threshold Technology</div>
          <div className="threshold-summary">{thresholdState.summary}</div>
          <div className="threshold-list">
            {thresholdState.assessments.map((item) => {
              const band = thresholdState.thresholds[item.key];
              return (
                <div key={item.key} className={`threshold-row status-${item.status}`}>
                  <span>{item.label}</span>
                  <strong>{band.min}–{band.max}{item.unit}</strong>
                </div>
              );
            })}
          </div>
          <div className="threshold-note">Actuator phase disabled: recommendations only.</div>
        </div>

        <div className="sidebar-footer">
          <button className="btn-secondary nav-change-device" onClick={handleDisconnect}>
            Change Device Mode
          </button>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div className="dash-chat-container">
        <div className="chat-topbar glass-panel" />

        <div className="chat-feed-wrapper">
          <div className="chat-feed">
            {messages.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                <div className="msg-bubble">
                  {message.role === 'user' && <span className="msg-sender">You</span>}
                  {message.role === 'assistant' && <span className="msg-sender">GreenMind</span>}
                  {message.role === 'system' && <span className="msg-sender">System Notification</span>}
                  <div className="msg-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.streaming && (
                    <div className="streaming-cursor-container">
                      <span className="streaming-dot" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="chat-message assistant skeleton">
                <div className="msg-bubble">
                  <span className="msg-sender">GreenMind thinking...</span>
                  <div className="skeleton-chat">
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="chat-footer">
          {messages.length === 1 && (
            <div className="suggested-prompts-container">
              {["Set this session for tomatoes", "Show dynamic thresholds", "Is my soil moisture too low for tomatoes?", "Should I recommend the fan?", "Explain the observation phase", "Interpret my current sensor data"].map((prompt, i) => (
                <button key={i} className="suggested-chip"
                  onClick={() => !isLoading && handleSend(prompt)}
                  disabled={isLoading}>{prompt}</button>
              ))}
            </div>
          )}
          {attachedFile && (
            <div className="file-preview-banner">
              <span className="file-preview-icon">📎</span>
              <span className="file-preview-name">{attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              <button className="file-preview-remove" onClick={() => setAttachedFile(null)}>✕</button>
            </div>
          )}
          <div className="input-panel glass-panel">
            <button className="attach-btn" onClick={handleFileUploadClick} title="Attach file">
              <svg className="attach-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0l-3.536 3.536m3.536-3.536L15 12M9 9l3.536-3.536m0 0L16.07 9m-3.536-3.536L12 9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.003 9.003 0 008.361-5.636M12 21a9.003 9.003 0 01-8.361-5.636m16.722 0A9 9 0 0012 3a9 9 0 00-8.361 5.636m16.722 0H3.639" />
              </svg>
            </button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <input type="text" className="chat-input" value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask GreenMind anything about your greenhouse..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputValue); }}
              disabled={isLoading}
            />
            <button className="send-btn" onClick={() => handleSend(inputValue)}
              disabled={isLoading || (!inputValue.trim() && !attachedFile)}>
              <svg className="send-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
