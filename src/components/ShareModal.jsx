import { useEffect, useState } from 'react';
import API from '../api/api';

export default function ShareModal({ shareNoteId, onClose, onShared }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [error, setError] = useState('');

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

  const handleShare = async (userToShare) => {
    try {
      console.log('Sharing note with user:', userToShare);
      
      // Make sure we have valid data
      if (!userToShare || !userToShare.email) {
        setError('Invalid user data');
        return;
      }
      
      // Make sure we have a valid note ID
      if (!shareNoteId) {
        setError('Invalid note ID');
        return;
      }
      
      // Make sure token exists and is valid
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication required');
        return;
      }
      
      // Add more detailed logging
      console.log('Sending share request to:', `/notes/share/${shareNoteId}`);
      console.log('With email:', userToShare.email);
      
      const response = await API.post(
        `/notes/share/${shareNoteId}`, 
        { email: userToShare.email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('Share response:', response.data);
      
      // Show success message
      onShared(userToShare);
      onClose();
    } catch (error) {
      console.error('Share error:', error);
      
      // Extract the most useful error message
      let errorMessage = 'Failed to share note';
      
      if (error.response) {
        // The server responded with an error status
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
        console.log('Error response data:', error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage = 'No response from server';
      }
      
      setError(errorMessage);
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
        {error && <div className="error-message">{error}</div>}
        <div style={{ marginTop: 10 }}>
          <button onClick={() => handleShare(selectedUser)} disabled={!selectedUser}>Share</button>
          <button onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}