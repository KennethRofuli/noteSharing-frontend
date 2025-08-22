import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/api';
import './styles/Dashboard.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { io } from 'socket.io-client';
import messageIcon from '../assets/envelope.jpg';

const socket = io('http://localhost:3000'); // adjust port if needed

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
  const [fileError, setFileError] = useState('');
  // keep in sync with backend allowed list
  const allowedExtensions = [
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip"
  ];
  // client-side max file size (must match backend): 20 MB
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const [message, setMessage] = useState('');

  // Sharing states
  const [shareNoteId, setShareNoteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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
    // client-side guard: block submit if file is invalid
    if (fileError) {
      setMessage(`invalid file allowed files are ${allowedExtensions.map(x => `"${x}"`).join(', ')}`);
      return;
    }
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

      // success toast
      toast.success('Upload successful');
    } catch (err) {
      console.error(err);
      const serverMsg = err.response?.data?.message || err.message || 'Upload failed';
      // if backend reports disallowed type, mirror to fileError as well
      if (serverMsg.toLowerCase().includes('file type not allowed') || serverMsg.toLowerCase().includes('allowed extension')) {
        setFileError(serverMsg);
      }
      // show toast for file-too-large or other server messages
      if (serverMsg.toLowerCase().includes('file too large') || serverMsg.toLowerCase().includes('max size')) {
        toast.error(serverMsg);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setFileError(serverMsg);
      } else {
        toast.error(serverMsg);
      }
      setMessage(serverMsg);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleDelete = (noteId) => {
    // open modal instead of window.confirm
    setConfirmDeleteId(noteId);
  };

  const handleDeleteConfirmed = async () => {
    const noteId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await API.delete(`/notes/delete/${noteId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setNotes(prev => prev.filter(n => n._id !== noteId));
      setFilteredNotes(prev => prev.filter(n => n._id !== noteId));
      toast.error('Note deleted');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to delete note.');
    }
  };

  const handleCancelDelete = () => setConfirmDeleteId(null);

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
      toast.error(err.response?.data?.message || 'Download failed');
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
      toast.success(`Note shared with ${selectedUser.email}`);
      setShareNoteId(null);
      setSearchTerm('');
      setSearchResults([]);
      setSelectedUser(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to share note.');
    }
  };

  useEffect(() => {
    if (!currentUserId) return;
    const register = () => {
      if (socket && socket.connected) {
        socket.emit('register', String(currentUserId));
        console.log('[SOCKET][CLIENT] register', currentUserId);
      }
    };
    // initial register and re-register after reconnects
    register();
    socket.on('connect', register);
    socket.on('reconnect', register);
    return () => {
      socket.off('connect', register);
      socket.off('reconnect', register);
    };
  }, [currentUserId]);

  // Listen for note-shared event
  useEffect(() => {
    socket.on('note-shared', (data) => {
      fetchNotes();
      toast.info('A note was shared with you!');
    });

    // Listen for note-deleted event
    socket.on('note-deleted', (data) => {
      fetchNotes();
      toast.error('A note shared with you was deleted.');
    });

    return () => {
      socket.off('note-shared');
      socket.off('note-deleted');
    };
  }, []);

  // --- Chat states ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]); // chronological: oldest -> newest
  const [chatSearch, setChatSearch] = useState('');
  const [chatUsers, setChatUsers] = useState([]);
  const [chatRecipient, setChatRecipient] = useState(null);

  // pagination state for chat history
  const PAGE_SIZE = 20;
  const [chatPage, setChatPage] = useState(0); // 0 = latest page
  const [chatHasMore, setChatHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // ref for the scrollable chat messages container
  const chatScrollRef = useRef(null);

  // helper to scroll chat to bottom
  const scrollChatToBottom = (behavior = 'auto') => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  // Fetch verified users for chat (debounced search)
  useEffect(() => {
    if (!chatOpen) return;
    const fetchUsers = async () => {
      try {
        const q = chatSearch.trim();
        const url = q.length > 0
          ? `/users/search?q=${encodeURIComponent(q)}`
          : '/users/verified';
        const res = await API.get(url, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setChatUsers(res.data);
      } catch (err) {
        setChatUsers([]);
      }
    };
    const delay = setTimeout(fetchUsers, 300);
    return () => clearTimeout(delay);
  }, [chatSearch, chatOpen]);

  // Listen for incoming chat messages
  useEffect(() => {
    socket.on('chat-message', (msg) => {
      // append newest message at the end (chronological order)
      setChatMessages(prev => {
        // if message belongs to current open conversation, append
        if (!chatRecipient) return prev;
        const belongs = (msg.from === currentUserId && msg.to === chatRecipient._id) ||
                        (msg.from === chatRecipient._id && msg.to === currentUserId);
        if (!belongs) return prev;
        return [...prev, msg];
      });
    });
    return () => socket.off('chat-message');
  }, [chatRecipient, currentUserId]);

  // auto-scroll to bottom when new messages arrive at end
  useEffect(() => {
    // if user is currently at bottom or chat was just opened, keep pinned to bottom
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 100;
    if (nearBottom) scrollChatToBottom('smooth');
  }, [chatMessages]);

  // also keep view pinned to bottom while typing
  useEffect(() => {
    if (!chatOpen || !chatRecipient) return;
    const el = chatScrollRef.current;
    if (!el) return;
    // keep pinned only if near bottom
    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 100;
    if (nearBottom) scrollChatToBottom('auto');
  }, [chatInput, chatOpen, chatRecipient]);

  // Fetch chat history paginated: newest PAGE_SIZE first (page=0)
  const fetchHistoryPage = async (recipientId, page = 0) => {
    if (!recipientId) return;
    // if loading older page already, skip
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const skip = page * PAGE_SIZE;
      // request with query params; backend may ignore but many libs support limit/skip
      const res = await API.get(`/chat/history/${recipientId}?limit=${PAGE_SIZE}&skip=${skip}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      let msgs = Array.isArray(res.data) ? res.data : [];
      // We expect backend returns newest-first when using skip/limit from latest.
      // Normalize to chronological (oldest -> newest) for UI.
      // If backend returns oldest-first already, reversing will be incorrect — but most APIs return newest-first for this pattern.
      // Guard: if the last item has timestamp smaller than first, assume newest-first and reverse.
      if (msgs.length > 1) {
        const firstTs = new Date(msgs[0].timestamp || msgs[0].createdAt || msgs[0].time || 0).getTime();
        const lastTs = new Date(msgs[msgs.length - 1].timestamp || msgs[msgs.length - 1].createdAt || msgs[msgs.length - 1].time || 0).getTime();
        if (firstTs > lastTs) {
          msgs = msgs.reverse();
        }
        // if firstTs <= lastTs already chronological, keep as-is
      }

      if (page === 0) {
        // initial load: replace and scroll to bottom after render
        setChatMessages(msgs);
        setChatPage(0);
        setChatHasMore(msgs.length === PAGE_SIZE);
        // allow DOM to paint then scroll
        setTimeout(() => scrollChatToBottom('auto'), 50);
      } else {
        // older pages: prepend items and keep scroll position stable
        const el = chatScrollRef.current;
        const prevScrollHeight = el ? el.scrollHeight : 0;
        setChatMessages(prev => {
          // avoid duplicates by filtering existing ids
          const existingIds = new Set(prev.map(m => m._id || `${m.from}_${m.to}_${m.timestamp}`));
          const uniqueOlder = msgs.filter(m => !existingIds.has(m._id || `${m.from}_${m.to}_${m.timestamp}`));
          return [...uniqueOlder, ...prev];
        });
        setChatPage(page);
        setChatHasMore(msgs.length === PAGE_SIZE);
        // restore scroll position after DOM update
        setTimeout(() => {
          if (!el) return;
          const newScrollHeight = el.scrollHeight;
          // keep the viewport showing same content: shift scrollTop by difference
          el.scrollTop = newScrollHeight - prevScrollHeight + (el.scrollTop || 0);
        }, 50);
      }
    } catch (err) {
      console.error('fetchHistoryPage', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // When recipient changes, reset pagination and load latest page
  useEffect(() => {
    setChatMessages([]);
    setChatPage(0);
    setChatHasMore(true);
    setLoadingOlder(false);
    if (chatRecipient) {
      fetchHistoryPage(chatRecipient._id, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRecipient]);

  // scroll handler to detect when user reached top to load older messages
  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el || !chatRecipient || loadingOlder || !chatHasMore) return;
    // if scrolled near top
    if (el.scrollTop <= 60) {
      // load next older page (page + 1)
      fetchHistoryPage(chatRecipient._id, chatPage + 1);
    }
  };

  // Send chat message
  const sendChat = useCallback(() => {
    if (!chatInput.trim() || !chatRecipient) return;
    const msg = {
      to: chatRecipient._id,
      text: chatInput,
      from: currentUserId,
      timestamp: new Date().toISOString()
    };
    socket.emit('chat-message', msg);
    setChatMessages(prev => [...prev, { ...msg, self: true }]);
    setChatInput('');
  }, [chatInput, chatRecipient, currentUserId]);

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
      // Check for subdoc with recipient field
      if (sw && sw.recipient) {
        return sw.recipient.toString() === currentUserId.toString();
      }
      // Fallback for legacy: direct ObjectId
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
    <>
     {/* toast container (does not affect layout) */}
     <ToastContainer position="top-center" autoClose={2250} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable />
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
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files[0];
                if (!f) {
                  setFile(null);
                  setFileError('');
                  return;
                }
                const ext = '.' + f.name.split('.').pop().toLowerCase();
                if (!allowedExtensions.includes(ext)) {
                  // toast non-blocking notification (no layout shift)
                  toast.error(`Invalid file. Allowed files are: ${allowedExtensions.join(', ')}`);
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  return;
                }
                // client-side size check (20 MB)
                if (f.size > MAX_FILE_BYTES) {
                  toast.error(`File too large. Max size is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
                  setFile(null);
                  setFileError(`File too large. Max size is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  return;
                }
                setFile(f);
                setFileError('');
              }}
              ref={fileInputRef}
              required
            />
            <button type="submit" disabled={!file || !!fileError}>Upload Note</button>
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
              <button
                onClick={() => {
                  setShareNoteId(null);
                  setSearchTerm('');
                  setSearchResults([]);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* confirmation modal (simple) */}
        {confirmDeleteId && (
          <div className="confirm-modal" style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)', zIndex: 2000
          }}>
            <div style={{ background: '#fff', padding: 20, borderRadius: 6, minWidth: 300 }}>
              <p>Are you sure you want to delete this note?</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={handleCancelDelete}>Cancel</button>
                <button onClick={handleDeleteConfirmed} style={{ background: '#d9534f', color: '#fff' }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Widget */}
        <div className={`chat-widget${chatOpen ? ' open' : ' closed'}`}>
        {!chatOpen ? (
          <button
          className="chat-fab"
          onClick={() => setChatOpen(true)}
          aria-label="New message"
          title="New message"
          >
          <img src={messageIcon} alt="New message" />
        </button>
    ) : (
    <div className="chat-window">
      <div className="chat-header">
        <span>Chat</span>
        <button
          className="chat-close-btn"
          onClick={() => {
            setChatOpen(false);
            setChatRecipient(null);   // 🔹 reset recipient
            setChatMessages([]);      // 🔹 clear chat
            setChatSearch('');        // 🔹 clear search field
            setChatUsers([]);         // 🔹 clear user list
          }}
        >×</button>
      </div>

              <div className="chat-search-container">
                <input
                  className="chat-search-input"
                  placeholder="Search user by email..."
                  value={chatSearch}
                  onChange={e => {
                    setChatSearch(e.target.value);
                    setChatRecipient(null);
                  }}
                />
                <ul className="chat-user-list">
                  {chatUsers.length > 0 ? (
                    chatUsers.map(u => (
                      <li
                        key={u._id}
                        className={chatRecipient && chatRecipient._id === u._id ? 'selected' : ''}
                        onClick={() => {
                          setChatRecipient(u);
                          setChatSearch(u.email);
                          setChatUsers([]);
                        }}
                      >
                        {u.name ? `${u.name} (${u.email})` : u.email}
                      </li>
                    ))
                  ) : null}
                </ul>
              </div>
              <div
                className="chat-messages"
                ref={chatScrollRef}
                onScroll={handleChatScroll}
                style={{ overflowY: 'auto' }}
              >
                {chatRecipient ? (
                  chatMessages.length > 0 ? (
                    chatMessages
                      .filter(m =>
                        (m.from === currentUserId && m.to === chatRecipient._id) ||
                        (m.from === chatRecipient._id && m.to === currentUserId) ||
                        // support some shapes where 'to' or 'from' may be ids/strings
                        (m.to === currentUserId && m.from === chatRecipient._id) ||
                        (m.to === chatRecipient._id && m.from === currentUserId)
                      )
                      .map((m, i) => (
                        <div
                          key={m._id || `${i}-${m.timestamp}`}
                          className={`chat-message-row${(m.from === currentUserId || m.self) ? ' self' : ''}`}
                        >
                          <span className="chat-message-bubble">{m.text}</span>
                        </div>
                      ))
                  ) : (
                    <div style={{ color: '#888', fontSize: 14, padding: 12 }}>No messages yet — say hello</div>
                  )
                ) : (
                  <div style={{ color: '#888', fontSize: 14 }}>Select a user to chat</div>
                )}
                {loadingOlder && <div style={{ textAlign: 'center', padding: 8, color: '#666' }}>Loading...</div>}
              </div>
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                  disabled={!chatRecipient}
                />
                <button
                  className="chat-send-btn"
                  onClick={sendChat}
                  disabled={!chatInput.trim() || !chatRecipient}
                >Send</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
