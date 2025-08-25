import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/api';
import './styles/Dashboard.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import socket from '../socket';

// components
import ChatWidget from '../components/ChatWidget';
import UploadForm from '../components/UploadForm';
import Sidebar from '../components/Sidebar';
import ShareModal from '../components/ShareModal';
import ConfirmModal from '../components/ConfirmModal';
import NoteCard from '../components/NoteCard';

export default function Dashboard() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [currentUserName, setCurrentUserName] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [message, setMessage] = useState('');
  const [shareNoteId, setShareNoteId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const getToken = () => localStorage.getItem('token');
  const [currentUserId, setCurrentUserId] = useState(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotes = async (tokenParam) => {
    const t = tokenParam || getToken();
    try {
      const res = await API.get('/notes', { headers: { Authorization: `Bearer ${t}` } });
      setNotes(res.data || []);
    } catch (err) {
      console.error(err);
      navigate('/login');
    }
  };

  // Socket.IO registration
  useEffect(() => {
  if (currentUserId) {
    socket.emit('register', currentUserId);
    console.log('[SOCKET] emitted register for user', currentUserId);
  }
  }, [currentUserId]);

  // socket events that impact notes or notify user
  useEffect(() => {
    socket.on('note-shared', () => {
      fetchNotes();
      toast.info('A note was shared with you!');
    });
    socket.on('note-deleted', () => {
      fetchNotes();
      toast.error('A note shared with you was deleted.');
    });
    return () => {
      socket.off('note-shared');
      socket.off('note-deleted');
    };
  }, []);

  const handleUploadAdded = (newNote) => {
    setNotes(prev => [newNote, ...prev]);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleDelete = (noteId) => setConfirmDeleteId(noteId);

  const handleDeleteConfirmed = async () => {
    const noteId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await API.delete(`/notes/delete/${noteId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setNotes(prev => prev.filter(n => n._id !== noteId));
      toast.error('Note deleted');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to delete note.');
    }
  };

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

  const courseCounts = notes.reduce((acc, note) => {
    acc[note.courseCode] = (acc[note.courseCode] || 0) + 1;
    return acc;
  }, {});

  const handleCourseClick = (course) => {
    setSelectedCourse(course);
  };

  const isOwned = (note) => {
    if (!note || !note.uploadedBy || !currentUserId) return false;
    const uploaderId = note.uploadedBy._id ? note.uploadedBy._id.toString() : note.uploadedBy.toString();
    return uploaderId === currentUserId.toString();
  };

  const isSharedWithMe = (note) => {
    if (!note || !note.sharedWith || !currentUserId) return false;
    return note.sharedWith.some(sw => {
      if (sw && sw.recipient) return sw.recipient.toString() === currentUserId.toString();
      const sid = sw?._id ? sw._id.toString() : (sw?.toString ? sw.toString() : '');
      return sid === currentUserId.toString();
    });
  };

  const getSharerName = (note) => {
    if (!note) return null;
    const entry = Array.isArray(note.sharedWith)
      ? note.sharedWith.find(sw => {
          const sid = sw?._id ? sw._id.toString() : (sw?.toString ? sw.toString() : '');
          return sid === currentUserId?.toString() || sw?.user?._id === currentUserId?.toString() || sw?.recipientId === currentUserId?.toString();
        })
      : null;
    if (entry) {
      const name = entry.sharedByName || entry.byName || entry.sharerName || entry.sharedBy?.name || entry.sharedBy;
      if (name) return typeof name === 'object' ? (name.name || name.email) : name;
    }
    const uploader = note.uploadedBy;
    if (uploader) return uploader.name || uploader.email || (uploader._id ? uploader._id.toString() : uploader.toString());
    return null;
  };

  // derive visible notes
  const visibleNotes = (selectedCourse && selectedCourse !== 'all')
    ? notes.filter(n => n.courseCode === selectedCourse)
    : notes;

  const myNotes = visibleNotes.filter(isOwned);
  const sharedNotes = visibleNotes.filter(n => !isOwned(n) && isSharedWithMe(n));

  return (
    <>
      <ToastContainer position="top-center" autoClose={2250} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable />
      <div className="dashboard-container">
        <Sidebar notesCount={notes.length} courseCounts={courseCounts} selectedCourse={selectedCourse} onCourseClick={handleCourseClick} />

        <div className="content">
          <div className="dashboard-header">
            <h2>{currentUserName && <div className="user-greeting">Hello, {currentUserName}</div>}</h2>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>

          <UploadForm onUploaded={handleUploadAdded} />
          <div>{message}</div>

          <div className="notes-columns">
            <div className="notes-column">
              <h3>My Notes ({myNotes.length})</h3>
              <div className="notes-grid-column">
                {myNotes.map(note => (
                  <NoteCard
                    key={note._id}
                    note={note}
                    isOwned={true}
                    onShare={(id) => setShareNoteId(id)}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>

            <div className="notes-column">
              <h3>Shared With Me ({sharedNotes.length})</h3>
              <div className="notes-grid-column">
                {sharedNotes.map(note => (
                  <NoteCard
                    key={note._id}
                    note={note}
                    isOwned={false}
                    onDownload={handleDownload}
                    sharer={getSharerName(note)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {shareNoteId && (
          <ShareModal
            shareNoteId={shareNoteId}
            onClose={() => setShareNoteId(null)}
            onShared={(user) => toast.success(`Note shared with ${user.email}`)}
          />
        )}

        {confirmDeleteId && (
          <ConfirmModal
            message="Are you sure you want to delete this note?"
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )}

        <ChatWidget currentUserId={currentUserId} />
      </div>
    </>
  );
}
