import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react';
import { login, register } from '../lib/auth.js';
import { useAuthStore } from '../store/authStore.js';

/** Carte de connexion / inscription (affichée à l'accueil quand on n'est pas connecté). */
export function AuthPanel(): JSX.Element {
  const setUser = useAuthStore((s) => s.setUser);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ login: '', email: '', pseudo: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user =
        mode === 'login'
          ? await login({ login: form.login, password: form.password })
          : await register({ email: form.email, pseudo: form.pseudo, password: form.password });
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="mb-4 flex gap-1 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        <button
          onClick={() => setMode('login')}
          className={`flex-1 rounded-md px-3 py-1.5 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          Se connecter
        </button>
        <button
          onClick={() => setMode('register')}
          className={`flex-1 rounded-md px-3 py-1.5 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          Créer un compte
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'login' ? (
          <Field
            placeholder="Email ou pseudo"
            value={form.login}
            onChange={set('login')}
            autoFocus
          />
        ) : (
          <>
            <Field
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
              autoFocus
            />
            <Field placeholder="Pseudo (3-20 car.)" value={form.pseudo} onChange={set('pseudo')} />
          </>
        )}
        <Field
          placeholder={mode === 'register' ? 'Mot de passe (8 car. min.)' : 'Mot de passe'}
          type="password"
          value={form.password}
          onChange={set('password')}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  );
}

function Field(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-accent"
    />
  );
}
