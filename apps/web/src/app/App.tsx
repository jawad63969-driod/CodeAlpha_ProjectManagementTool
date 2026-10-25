import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../shared/auth/AuthContext.jsx';
import { Spinner } from '../shared/ui/misc.jsx';
import { AppShell } from './AppShell.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { RegisterPage } from '../features/auth/RegisterPage.jsx';
import { ProjectsPage } from '../features/projects/ProjectsPage.jsx';
import { BoardPage } from '../features/board/BoardPage.jsx';
import { MyWorkPage } from '../features/mywork/MyWorkPage.jsx';
import { MembersPage } from '../features/org/MembersPage.jsx';

const Protected = ({ children }: { children: ReactNode }) => {
  const { session, booting } = useAuth();
  const location = useLocation();
  if (booting) return <Spinner full label="Restoring your session" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppShell>{children}</AppShell>;
};

const GuestOnly = ({ children }: { children: ReactNode }) => {
  const { session, booting } = useAuth();
  if (booting) return <Spinner full label="Loading" />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
    <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
    <Route path="/" element={<Protected><ProjectsPage /></Protected>} />
    <Route path="/my-work" element={<Protected><MyWorkPage /></Protected>} />
    <Route path="/members" element={<Protected><MembersPage /></Protected>} />
    <Route path="/projects/:projectId" element={<Protected><BoardPage /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
