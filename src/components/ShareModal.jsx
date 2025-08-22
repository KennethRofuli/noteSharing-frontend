import { useEffect, useState } from 'react';
import API from '../api/api';

export default function ShareModal({ shareNoteId, onClose, onShared }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await API.get(`/users/search?q=${encodeURIComponent(searchTerm)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setSearchResults(res.data || []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleShare = async () => {
    if (!selectedUser) return;
    try {
      await API.post(`/notes/share/${shareNoteId}`, { userEmail: selectedUser.email }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      onShared && onShared(selectedUser);
      onClose();
    } catch (err) {
      console.error('share', err);
      onClose();
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>Share Note</h3>
        <input
          type="text"
          placeholder="Search user by email..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setSelectedUser(null); }}
        />
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map(user => (
              <li key={user._id} onClick={() => { setSelectedUser(user); setSearchTerm(user.email); setSearchResults([]); }}>
                {user.email}
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 10 }}>
          <button onClick={handleShare} disabled={!selectedUser}>Share</button>
          <button onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}