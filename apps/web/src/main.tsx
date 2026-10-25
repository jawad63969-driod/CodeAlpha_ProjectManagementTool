import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App.jsx';
import { AuthProvider } from './shared/auth/AuthContext.jsx';
import { SocketProvider } from './shared/realtime/SocketContext.jsx';
import { ToastProvider } from './shared/ui/Toast.jsx';
import { ApiError } from './shared/api/client.js';
import './shared/styles/tokens.css';
import './shared/styles/base.css';
import './shared/styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Socket events keep the cache fresh, so background polling is waste.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry something the server has already judged.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <App />
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
