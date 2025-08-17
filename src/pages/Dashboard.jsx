import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/api';
import './styles/Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [currentUserName, setCurrentUserName] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');

  // Sharing states
  const [shareNoteId, setShareNoteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const getToken = () => localStorage.getItem('token');
  const [currentUserId, setCurrentUserId] = useState(null);

  // helper: parse JWT (handles base64url)
  const parseJwt = (t) => {
    try {
      const base64Url = t.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  // Redirect if not logged in
  useEffect(() => {
    const t = getToken();
    if (!t) { navigate('/login'); return; }
    const payload = parseJwt(t);
    const id = payload?.id || payload?._id || payload?.userId || payload?.sub || null;
    if (id) setCurrentUserId(id.toString());

    if (payload?.name || payload?.email) {
      setCurrentUserName(payload?.name || payload?.email);
      fetchNotes(t);
    } else {
      // fetch profile from backend if token doesn't include name
      const fetchProfile = async () => {
        try {
          const res = await API.get('/auth/me', { headers: { Authorization: `Bearer ${t}` } });
          setCurrentUserName(res.data.name || res.data.email || null);
        } catch (err) {
          console.error('fetchProfile', err);
        } finally {
          fetchNotes(t);
        }
      };
      fetchProfile();
    }
  }, []);

  const fetchNotes = async (tokenParam) => {
    const t = tokenParam || getToken();
    try {
      const res = await API.get('/notes', {
        headers: { Authorization: `Bearer ${t}` }
      });
      setNotes(res.data);
      setFilteredNotes(res.data);
    } catch (err) {
      console.error(err);
      navigate('/login');
    }
  };

  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('courseCode', courseCode);
      formData.append('instructor', instructor);
      if (file) formData.append('file', file);

      const res = await API.post('/notes/upload', formData, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      // add the new note to UI so user can add another without refresh
      const newNote = res.data;
      setNotes(prev => [newNote, ...prev]);
      setFilteredNotes(prev => [newNote, ...prev]);

      // clear form so next upload works
      setTitle('');
      setDescription('');
      setCourseCode('');
      setInstructor('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setMessage('Upload successful');
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || 'Upload failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await API.delete(`/notes/delete/${noteId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setNotes(prev => prev.filter(n => n._id !== noteId));
      setFilteredNotes(prev => prev.filter(n => n._id !== noteId));
    } catch (err) {
      console.error(err);
      alert('Failed to delete note.');
    }
  };

  // NEW: download protected file via API (includes JWT)
  const handleDownload = async (note) => {
    try {
      const filename = note.fileUrl.split('/').pop();
      const res = await API.get(`/notes/download/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Download failed');
    }
  };

  // 🔹 Search users as you type
  useEffect(() => {
    const fetchUsers = async () => {
      if (searchTerm.trim().length < 1) {
        setSearchResults([]);
        return;
      }
      try {
        const res = await API.get(`/users/search?q=${searchTerm}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setSearchResults(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    const delay = setTimeout(fetchUsers, 300); // debounce
    return () => clearTimeout(delay);
  }, [searchTerm]);

  // 🔹 Share note
  const handleShare = async () => {
    if (!selectedUser) return;
    try {
      await API.post(`/notes/share/${shareNoteId}`,
        { userEmail: selectedUser.email },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      alert(`Note shared with ${selectedUser.email}`);
      setShareNoteId(null);
      setSearchTerm('');
      setSearchResults([]);
      setSelectedUser(null);
    } catch (err) {
      console.error(err);
      alert('Failed to share note.');
    }
  };

  const courseCounts = notes.reduce((acc, note) => {
    acc[note.courseCode] = (acc[note.courseCode] || 0) + 1;
    return acc;
  }, {});

  const handleCourseClick = (course) => {
    setSelectedCourse(course);
    setFilteredNotes(course === 'all' ? notes : notes.filter(n => n.courseCode === course));
  };

  // 🔹 Helper: check ownership
  const isOwned = (note) => {
    if (!note || !note.uploadedBy || !currentUserId) return false;
    const uploaderId = note.uploadedBy._id ? note.uploadedBy._id.toString() : note.uploadedBy.toString();
    return uploaderId === currentUserId.toString();
  };

  // 🔹 Helper: check if note is shared with current user
  const isSharedWithMe = (note) => {
    if (!note || !note.sharedWith || !currentUserId) return false;
    return note.sharedWith.some(sw => {
      const sid = sw?._id ? sw._id.toString() : (sw?.toString ? sw.toString() : '');
      return sid === currentUserId.toString();
    });
  };

  // try to determine who shared this note to the current user
  const getSharerName = (note) => {
    if (!note) return null;

    // 1) If sharedWith contains metadata for this recipient, prefer a sharedBy/name field
    const entry = Array.isArray(note.sharedWith)
      ? note.sharedWith.find(sw => {
          const sid = sw?._id ? sw._id.toString() : (sw?.toString ? sw.toString() : '');
          // some backends store recipient id, some store object; try common keys
          return sid === currentUserId?.toString() || sw?.user?._id === currentUserId?.toString() || sw?.recipientId === currentUserId?.toString();
        })
      : null;

    if (entry) {
      // common shapes: entry.sharedByName, entry.sharedBy (object or id), entry.byName, entry.sharerName
      const name = entry.sharedByName || entry.byName || entry.sharerName || entry.sharedBy?.name || entry.sharedBy;
      if (name) return typeof name === 'object' ? (name.name || name.email) : name;
    }

    // 2) Fallback to uploader info (often the person who shared)
    const uploader = note.uploadedBy;
    if (uploader) {
      return uploader.name || uploader.email || (uploader._id ? uploader._id.toString() : uploader.toString());
    }

    return null;
  };

  // derive visible notes based on selected course, then partition
  const visibleNotes = (selectedCourse && selectedCourse !== 'all')
    ? notes.filter(n => n.courseCode === selectedCourse)
    : notes;

  const myNotes = visibleNotes.filter(isOwned);
  const sharedNotes = visibleNotes.filter(n => !isOwned(n) && isSharedWithMe(n));

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <h3>Courses</h3>
        <ul>
          <li
            className={!selectedCourse || selectedCourse === 'all' ? 'active' : ''}
            onClick={() => handleCourseClick('all')}
          >
            All Courses ({notes.length})
          </li>
          {Object.entries(courseCounts).map(([course, count]) => (
            <li
              key={course}
              className={selectedCourse === course ? 'active' : ''}
              onClick={() => handleCourseClick(course)}
            >
              {course} ({count})
            </li>
          ))}
        </ul>
      </div>

      <div className="content">
        <div className="dashboard-header">
          <h2>{currentUserName && <div className="user-greeting">Hello, {currentUserName}</div>}</h2>          
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>

        <form onSubmit={handleUpload} className="upload-form">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" required />
          <input value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="Course Code" required />
          <input value={instructor} onChange={e => setInstructor(e.target.value)} placeholder="Instructor" required />
          <input type="file" onChange={e => setFile(e.target.files[0])} ref={fileInputRef} required />
          <button type="submit">Upload Note</button>
        </form>
        <div>{message}</div>

        <div className="notes-columns">
          <div className="notes-column">
            <h3>My Notes ({myNotes.length})</h3>
            <div className="notes-grid-column">
              {myNotes.map(note => (
                <div className="note-card" key={note._id}>
                  <p className="course-code">{note.courseCode}</p>
                  <h4>{note.title}</h4>
                  <p>{note.description}</p>
                  <p><strong>Prof:</strong> {note.instructor}</p>
                  <div className="card-actions">
                    <button className="btn" onClick={() => setShareNoteId(note._id)}>Share</button>
                    <button className="btn" onClick={() => handleDownload(note)}>Download</button>
                    <button className="btn delete-btn" onClick={() => handleDelete(note._id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="notes-column">
            <h3>Shared With Me ({sharedNotes.length})</h3>
            <div className="notes-grid-column">
              {sharedNotes.map(note => {
                const sharer = getSharerName(note);
                return (
                  <div className="note-card" key={note._id}>
                    {sharer && <p><strong>Shared by:</strong> {sharer}</p>}
                    <p className="course-code">{note.courseCode}</p>
                    <h4>{note.title}</h4>
                    <p>{note.description}</p>                    
                    <p><strong>Prof:</strong> {note.instructor}</p>
                    <div className="card-actions">
                      <button className="btn" onClick={() => handleDownload(note)}>Download</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SHARE MODAL */}
      {shareNoteId && (
        <div className="modal">
          <div className="modal-content">
            <h3>Share Note</h3>
            <input
              type="text"
              placeholder="Search user by email..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedUser(null);
              }}
            />
            {searchResults.length > 0 && (
              <ul className="search-results">
                {searchResults.map(user => (
                  <li
                    key={user._id}
                    onClick={() => {
                      setSelectedUser(user);
                      setSearchTerm(user.email);
                      setSearchResults([]);
                    }}
                  >
                    {user.email}
                  </li>
                ))}
              </ul>
            )}
            <button onClick={handleShare} disabled={!selectedUser}>Share</button>
            <button onClick={() => setShareNoteId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
