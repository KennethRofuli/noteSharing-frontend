import { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import './styles/Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/auth/login', { email, password });
      const token = res.data.token;

      if (!token) throw new Error('No token returned');

      localStorage.setItem('token', token);

      // Redirect to dashboard on successful login
      navigate('/dashboard');
    } catch (err) {
      console.error('[Login] error', err.response?.data || err.message);

      // Check for unverified email
      if (err.response?.data?.message === 'Please verify your email first') {
        setMessage('Please verify your email before logging in.');
      } else {
        setMessage(err.response?.data?.message || 'Login failed');
      }
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Login</h2>
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          required 
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
          required 
        />
        <button type="submit">Login</button>
        <div className="message">{message}</div>
        <p>
          Don't have an account? <a href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}
