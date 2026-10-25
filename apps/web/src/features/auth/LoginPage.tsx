import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { ApiError } from '../../shared/api/client.js';
import { Button, ErrorNote, Field } from '../../shared/ui/misc.jsx';
import { AuthLayout } from './AuthLayout.jsx';

export const LoginPage = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(form.email, form.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your boards, tasks and conversations."
      footer={<>New to TaskForge? <Link to="/register">Create an account</Link></>}
    >
      <form className="stack" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Email" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Your password"
          />
        </Field>
        <Button type="submit" variant="primary" block loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <div className="auth__divider">or</div>

        {/* The demo shortcut is a secondary action, so it no longer carries the
            same visual weight as the real one. */}
        <Button
          variant="ghost"
          block
          size="sm"
          icon="users"
          onClick={() => setForm({ email: 'ayesha@northwind.test', password: 'Password123!' })}
        >
          Fill in the demo account
        </Button>
        <div className="demo-hint">
          Demo workspace <strong>Northwind Labs</strong> — sign in as <code>ayesha@northwind.test</code> (owner) or{' '}
          <code>hina@northwind.test</code> (viewer, read-only) with the password <code>Password123!</code>
        </div>
      </form>
    </AuthLayout>
  );
};
