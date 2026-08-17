import type { AppPage, ChatMode } from './types';

export type AppRoute =
  | { page: Exclude<AppPage, 'dashboard'> }
  | { page: 'dashboard'; mode: ChatMode };

const ROUTE_PATHS: Record<Exclude<AppPage, 'dashboard'>, string> = {
  landing: '/',
  auth: '/auth',
  connect: '/mode',
};

export function routeFromLocation(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';

  switch (path) {
    case '/auth':
    case '/signin':
      return { page: 'auth' };
    case '/mode':
    case '/connect':
      return { page: 'connect' };
    case '/chat/serial':
      return { page: 'dashboard', mode: 'serial' };
    case '/chat/simulated':
      return { page: 'dashboard', mode: 'simulated' };
    case '/dashboard': {
      const savedMode = localStorage.getItem('gm_device_mode');
      return {
        page: 'dashboard',
        mode: savedMode === 'serial' ? 'serial' : 'simulated',
      };
    }
    default:
      return { page: 'landing' };
  }
}

export function pathForRoute(route: AppRoute): string {
  if (route.page === 'dashboard') return `/chat/${route.mode}`;
  return ROUTE_PATHS[route.page];
}
