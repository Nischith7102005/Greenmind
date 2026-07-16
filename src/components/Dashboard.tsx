import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDevice } from '../context/DeviceContext';
import { streamChat } from '../services/ai';
import type { ChatMessage, AIConfig, AIChatMessage, SensorData } from '../types';

interface DashboardProps {
  onNavigate: (page: 'landing' | 'auth' | 'connect' | 'dashboard') => void;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  apiKey: localStorage.getItem('gm_ai_api_key') || '',
  baseUrl: localStorage.getItem('gm_ai_base_url') || 'https://api.openai.com/v1',
  model: localStorage.getItem('gm_ai_model') || 'llama-3.2-8x3b-moe-dark-champion-instruct-uncensored-abliterated-18.4b',
  systemPrompt: localStorage.getItem('gm_ai_system_prompt') || '',
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const { deviceState, disconnect } = useDevice();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm GreenMind, your offline greenhouse companion. I'm connected to your telemetry feed and ready to assist you. Ask me about your crops, current environmental conditions, or optimal actions.",
      timestamp: Date.now(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // File Upload State
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
    type: string;
    size: number;
  } | null>(null);

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);

  // References for scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persist settings changes
  const updateConfig = (key: keyof AIConfig, val: string) => {
    const next = { ...aiConfig, [key]: val };
    setAiConfig(next);
    localStorage.setItem(`gm_ai_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`, val);
  };

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
        name: file.name,
        type: file.type,
        size: file.size,
        content: text || `[Binary/Unsupported File format: ${file.name}]`,
      });
    };
    
    // Read as text
    reader.readAsText(file);
    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() && !attachedFile) return;

    // Check configuration
    if (!aiConfig.apiKey) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: '⚠ API Key is missing. Please click the Settings gear icon in the top right to configure your AI Provider.',
          timestamp: Date.now(),
        }
      ]);
      return;
    }

    const currentSensor = deviceState.sensorData;
    const userMsgId = `user-${Date.now()}`;
    const userMsgContent = textToSend.trim();

    // Construct the UI message
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: attachedFile 
        ? `📎 Attached: ${attachedFile.name}\n\n${userMsgContent}` 
        : userMsgContent,
      timestamp: Date.now(),
      sensorSnapshot: currentSensor,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Context formatting with file upload if present
    let contentWithContext = userMsgContent;
    if (attachedFile) {
      contentWithContext = `[Uploaded File Context]\nFilename: ${attachedFile.name}\nFile size: ${attachedFile.size} bytes\nContent:\n${attachedFile.content}\n\n[User Message]\n${userMsgContent}`;
    }

    // Prepare message array for the API call
    // Limit history to last 15 messages for token efficiency
    const chatHistory = messages
      .filter(m => m.id !== 'welcome' && m.role !== 'system')
      .slice(-15)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const apiMessages: AIChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: contentWithContext }
    ];

    // Clear attached file immediately
    setAttachedFile(null);

    // Prep streaming assistant message in state
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      }
    ]);

    let fullResponseText = '';

    await streamChat(
      aiConfig,
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
          {
            id: `err-${Date.now()}`,
            role: 'system',
            content: `Error generating response: ${errorMsg}. Please verify API Key and Base URL configuration.`,
            timestamp: Date.now(),
          }
        ]);
        setIsLoading(false);
      }
    );
  };

  const handleSuggestedPromptClick = (prompt: string) => {
    if (isLoading) return;
    handleSend(prompt);
  };

  const SUGGESTED_PROMPTS = [
    "What's causing my temperature spikes?",
    "How can I reduce humidity in my polyhouse?",
    "Is my soil moisture too low for tomatoes?",
    "Predict pest risk this week",
    "Optimize my ventilation schedule",
    "Interpret my current sensor data",
  ];

  return (
    <div className="dash-layout">
      {/* FLOATING TELEMETRY SIDEBAR/WIDGET */}
      <div className="dash-sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-wrapper">
            <span className="logo-dot" />
            <h2 className="logo-text">GreenMind</h2>
          </div>
          <span className="version-tag">v1.0.0</span>
        </div>

        {/* Device Status */}
        <div className="widget-section">
          <div className="section-label">Device Connection</div>
          <div className="connection-info">
            <div className="connection-status">
              <span className={`status-indicator ${deviceState.connected ? 'active' : 'inactive'}`} />
              <span className="status-text">{deviceState.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="port-details">{deviceState.port || 'None'}</div>
          </div>
        </div>

        {/* Live Telemetry HUD */}
        <div className="widget-section telemetry-hud">
          <div className="section-label">Live Telemetry</div>
          
          {deviceState.sensorData ? (
            <div className="telemetry-grid">
              {/* Temperature */}
              <div className="telemetry-item">
                <span className="item-label">Temperature</span>
                <span className="item-value">{deviceState.sensorData.temperature.toFixed(1)} <span className="unit">°C</span></span>
                <div className="visual-bar" style={{ '--progress': `${(deviceState.sensorData.temperature / 50) * 100}%` } as React.CSSProperties} />
              </div>

              {/* Humidity */}
              <div className="telemetry-item">
                <span className="item-label">Humidity</span>
                <span className="item-value">{deviceState.sensorData.humidity.toFixed(0)} <span className="unit">%</span></span>
                <div className="visual-bar" style={{ '--progress': `${deviceState.sensorData.humidity}%` } as React.CSSProperties} />
              </div>

              {/* Soil Moisture */}
              <div className="telemetry-item">
                <span className="item-label">Soil Moisture</span>
                <span className="item-value">{deviceState.sensorData.soilMoisture.toFixed(0)} <span className="unit">%</span></span>
                <div className="visual-bar" style={{ '--progress': `${deviceState.sensorData.soilMoisture}%` } as React.CSSProperties} />
              </div>

              {/* Light */}
              <div className="telemetry-item">
                <span className="item-label">Light Intensity</span>
                <span className="item-value">{deviceState.sensorData.light.toFixed(0)} <span className="unit">lux</span></span>
                <div className="visual-bar" style={{ '--progress': `${Math.min(100, (deviceState.sensorData.light / 2000) * 100)}%` } as React.CSSProperties} />
              </div>

              {/* CO2 */}
              <div className="telemetry-item">
                <span className="item-label">CO₂ Level</span>
                <span className="item-value">{deviceState.sensorData.co2.toFixed(0)} <span className="unit">ppm</span></span>
                <div className="visual-bar" style={{ '--progress': `${Math.min(100, (deviceState.sensorData.co2 / 1500) * 100)}%` } as React.CSSProperties} />
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

        {/* Quick actions for Device Navigation */}
        <div className="sidebar-footer">
          <button className="btn-secondary nav-change-device" onClick={handleDisconnect}>
            Change Device Mode
          </button>
        </div>
      </div>

      {/* MAIN AI CHAT WORKSPACE */}
      <div className="dash-chat-container">
        {/* Floating Topbar */}
        <div className="chat-topbar glass-panel">
          <div className="topbar-left">
            <span className="active-model-badge">Model: {aiConfig.model}</span>
          </div>
          <div className="topbar-right">
            <button className="settings-toggle-btn" onClick={() => setShowSettings(!showSettings)}>
              <svg className={`settings-icon ${showSettings ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* FLOATING SETTINGS MODAL */}
        {showSettings && (
          <div className="settings-modal glass-panel">
            <div className="settings-modal-header">
              <h3>AI Provider Configuration</h3>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-field">
                <label>API KEY</label>
                <input 
                  type="password" 
                  value={aiConfig.apiKey} 
                  onChange={(e) => updateConfig('apiKey', e.target.value)} 
                  placeholder="Paste your API key here" 
                />
              </div>
              <div className="settings-field">
                <label>BASE URL</label>
                <input 
                  type="text" 
                  value={aiConfig.baseUrl} 
                  onChange={(e) => updateConfig('baseUrl', e.target.value)} 
                  placeholder="https://api.openai.com/v1" 
                />
              </div>
              <div className="settings-field">
                <label>MODEL NAME</label>
                <input 
                  type="text" 
                  value={aiConfig.model} 
                  onChange={(e) => updateConfig('model', e.target.value)} 
                  placeholder="llama-3.2-8x3b-moe-dark-champion-instruct-uncensored-abliterated-18.4b" 
                />
              </div>
              <div className="settings-field">
                <label>SYSTEM PROMPT</label>
                <textarea 
                  value={aiConfig.systemPrompt} 
                  onChange={(e) => updateConfig('systemPrompt', e.target.value)} 
                  placeholder="Default GreenMind expert instructions are active when empty..."
                  rows={4}
                />
              </div>
              <p className="settings-disclaimer">Values are stored securely inside your local browser storage.</p>
            </div>
          </div>
        )}

        {/* Chat Feed */}
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

                  {/* Attachment metadata badge */}
                  {message.sensorSnapshot && (
                    <div className="sensor-snapshot-badge">
                      📊 Sensors at query: {message.sensorSnapshot.temperature.toFixed(1)}°C | {message.sensorSnapshot.humidity.toFixed(0)}%
                    </div>
                  )}

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

        {/* Chat Footer / Input area */}
        <div className="chat-footer">
          {/* Suggested Prompts */}
          {messages.length === 1 && (
            <div className="suggested-prompts-container">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button 
                  key={i} 
                  className="suggested-chip"
                  onClick={() => handleSuggestedPromptClick(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Attached file status banner */}
          {attachedFile && (
            <div className="file-preview-banner">
              <span className="file-preview-icon">📎</span>
              <span className="file-preview-name">{attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              <button className="file-preview-remove" onClick={() => setAttachedFile(null)}>✕</button>
            </div>
          )}

          {/* Input Panel */}
          <div className="input-panel glass-panel">
            <button className="attach-btn" onClick={handleFileUploadClick} title="Attach file to context">
              <svg className="attach-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0l-3.536 3.536m3.536-3.536L15 12M9 9l3.536-3.536m0 0L16.07 9m-3.536-3.536L12 9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.003 9.003 0 008.361-5.636M12 21a9.003 9.003 0 01-8.361-5.636m16.722 0A9 9 0 0012 3a9 9 0 00-8.361 5.636m16.722 0H3.639" />
              </svg>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />

            <input 
              type="text" 
              className="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask GreenMind anything about your greenhouse..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSend(inputValue);
                }
              }}
              disabled={isLoading}
            />

            <button 
              className="send-btn" 
              onClick={() => handleSend(inputValue)}
              disabled={isLoading || (!inputValue.trim() && !attachedFile)}
            >
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
