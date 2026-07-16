import { useState } from 'react';
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '../firebase';

export function SignIn({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Firebase is not configured.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (step === 'signUp') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(step === 'signUp' ? 'Could not create account. Please try again.' : 'Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-container">
        <button className="auth-back" onClick={onBack}>← Back</button>
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Green<span className="accent">Mind</span></h1>
            <p className="auth-subtitle">
              {step === 'signIn' ? 'Sign in to your greenhouse' : 'Create your account'}
            </p>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="email">Email</label>
              <input id="email" type="email" className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="password">Password</label>
              <input id="password" type="password" className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={step === 'signIn' ? 'current-password' : 'new-password'} minLength={6} />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Please wait...' : step === 'signIn' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div className="auth-switch">
            <span>{step === 'signIn' ? "Don't have an account?" : 'Already have an account?'}</span>
            <button className="auth-switch-btn" onClick={() => { setStep(step === 'signIn' ? 'signUp' : 'signIn'); setError(''); }}>
              {step === 'signIn' ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
