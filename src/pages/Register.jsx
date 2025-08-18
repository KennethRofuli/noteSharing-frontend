import { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import './styles/Auth.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password
      };

      const res = await API.post('/auth/register', payload);
      console.log('[Register] response', res.status, res.data);

      const token = res.data?.token;
      if (token) {
        localStorage.setItem('token', token);
        // navigate and force a reload so Dashboard reads fresh token
        window.location.href = '/login';
        return;
      }

      // fallback: show server message
      setMessage(res.data?.message || 'Registration successful. Check your email to verify.');
      setName(''); setEmail(''); setPassword('');
    } catch (err) {
      console.error('[Register] error', err.response?.data || err.message);
      setMessage(err.response?.data?.message || 'Registration failed');
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
        <button type="submit">Register</button>

        <div className="message">{message}</div>

        <p>
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>
    </div>
  );
}
