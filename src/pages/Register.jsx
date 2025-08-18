import { useState, useEffect, useRef } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import './styles/Auth.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (showSuccess) {
      // auto-close after 4 seconds (between 3-5s as requested)
      timerRef.current = setTimeout(() => {
        setShowSuccess(false);
        navigate('/login');
      }, 400000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showSuccess, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // client-side password match validation
    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password
      };

      const res = await API.post('/auth/register', payload);
      console.log('[Register] response', res.status, res.data);

      // if server returned a token, keep it — but do NOT redirect immediately
      const token = res.data?.token;
      if (token) {
        localStorage.setItem('token', token);
      }

      // always show success modal and clear form
      setShowSuccess(true);
      setMessage('');
      setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    } catch (err) {
      console.error('[Register] error', err.response?.data || err.message);

      let msg = 'Registration failed';
      const resp = err.response;

      if (resp && resp.data) {
        const d = resp.data;

        // Detect Mongo duplicate-key error (E11000) or common duplicate messages
        const isDuplicateEmail =
          d?.code === 11000 ||
          d?.errorResponse?.code === 11000 ||
          (d?.keyPattern && d?.keyPattern.email) ||
          (d?.keyValue && d?.keyValue.email) ||
          (typeof d === 'string' && /duplicate key|E11000/i.test(d)) ||
          (d?.message && /duplicate key|E11000|already exists|duplicate/i.test(d.message));

        if (isDuplicateEmail) {
          msg = 'Email address already in use';
        } else if (typeof d === 'string') {
          msg = d;
        } else if (d.message) {
          msg = d.message;
        } else if (d.error) {
          msg = d.error;
        } else if (Array.isArray(d.errors) && d.errors.length) {
          msg = d.errors.map(e => (e.msg || e.message || e)).join(', ');
        } else {
          msg = `Registration failed (${resp.status})`;
        }
      } else if (resp && resp.status === 409) {
        msg = 'User already exists';
      } else if (err.message) {
        msg = err.message;
      }

      setMessage(msg);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Register</h2>
        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Retype Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <button type="submit">Register</button>

        <div className="message" aria-live="polite">{message}</div>

        <p>
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>

      {/* Success modal (no buttons) */}
      {showSuccess && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reg-success-title">
          <div className="modal">
            <div className="modal-content">
              <h3 id="reg-success-title">Registration successful</h3>              
              <p>Please check your email for a verification link. You will be redirected to login shortly.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
