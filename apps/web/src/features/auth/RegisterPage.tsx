import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { ApiError } from '../../shared/api/client.js';
import { Button, ErrorNote, Field } from '../../shared/ui/misc.jsx';
import { AuthLayout } from './AuthLayout.jsx';

export const RegisterPage = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      await signUp({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(form.organizationName.trim() ? { organizationName: form.organizationName.trim() } : {}),
      });
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fieldErrors());
        setError(caught.details?.length ? '' : caught.message);
      } else {
        setError('Could not create your account');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="You get an organisation of your own, and you own it."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form className="stack" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Full name" htmlFor="reg-name" error={fields['name']}>
          <input id="reg-name" required minLength={2} value={form.name} placeholder="Ali Raza"
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="reg-email" error={fields['email']}>
          <input id="reg-email" type="email" required autoComplete="email" value={form.email}
                 placeholder="you@company.com"
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Workspace name" htmlFor="reg-org" hint="Optional — defaults to your name.">
          <input id="reg-org" value={form.organizationName} placeholder="Northwind Labs"
                 onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="reg-password" error={fields['password']}
               hint="At least 10 characters, including a digit.">
          <input id="reg-password" type="password" required minLength={10} autoComplete="new-password"
                 value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" variant="primary" block loading={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
};
