const STORAGE_KEY = 'gm_chat_sessions';
const CURRENT_KEY = 'gm_current_session';

export interface ChatSession {
  id: string;
  name: string;
  messages: any[];
  createdAt: number;
  updatedAt: number;
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function getSessions(): ChatSession[] {
  return loadSessions().sort((a, b) => b.updatedAt - a.createdAt);
}

export function getCurrentSessionId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentSessionId(id: string) {
  localStorage.setItem(CURRENT_KEY, id);
}

export function createSession(name?: string): ChatSession {
  const sessions = loadSessions();
  const session: ChatSession = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.push(session);
  saveSessions(sessions);
  setCurrentSessionId(session.id);
  return session;
}

export function updateSessionMessages(sessionId: string, messages: any[]) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return;
  sessions[idx].messages = messages;
  sessions[idx].updatedAt = Date.now();
  // Auto-name from first user message
  if (sessions[idx].name === 'New Chat' || sessions[idx].name.startsWith('Chat ')) {
    const firstUser = messages.find((m: any) => m.role === 'user');
    if (firstUser) {
      sessions[idx].name = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '...' : '');
    }
  }
  saveSessions(sessions);
}

export function deleteSession(sessionId: string) {
  let sessions = loadSessions();
  sessions = sessions.filter(s => s.id !== sessionId);
  saveSessions(sessions);
  if (getCurrentSessionId() === sessionId) {
    const remaining = sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    if (remaining.length > 0) {
      setCurrentSessionId(remaining[0].id);
    } else {
      localStorage.removeItem(CURRENT_KEY);
    }
  }
}

export function getSessionMessages(sessionId: string): any[] {
  const sessions = loadSessions();
  const session = sessions.find(s => s.id === sessionId);
  return session?.messages || [];
}
