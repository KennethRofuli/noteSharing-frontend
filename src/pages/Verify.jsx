import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/api';

export default function Verify() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ loading: true, message: null, ok: false });
  const didRequestRef = useRef(false); // guard against double-call (StrictMode)

  useEffect(() => {
    if (didRequestRef.current) return;
    didRequestRef.current = true;

    const verify = async () => {
      if (!token) {
        setStatus({ loading: false, message: 'Invalid verification link', ok: false });
        setTimeout(() => navigate('/login'), 2000);
        return;
      }
      try {
        const res = await API.get(`/auth/verify/${token}`);
        setStatus({ loading: false, message: res.data?.message || 'Email verified', ok: true });
        setTimeout(() => navigate('/login'), 2000);
      } catch (err) {
        const msg = err.response?.data?.message || 'Verification failed';
        setStatus({ loading: false, message: msg, ok: false });
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    verify();
  }, [token, navigate]);

  if (status.loading) return <div>Verifying...</div>;
  return (
    <div style={{ padding: 20 }}>
      <h3>{status.ok ? 'Email verified' : 'Verification result'}</h3>
      <p>{status.message}</p>
      <p>Redirecting to login...</p>
    </div>
  );
}