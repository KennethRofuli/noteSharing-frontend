import { useRef, useState } from 'react';
import API from '../api/api';
import { toast } from 'react-toastify';

export default function UploadForm({ onUploaded }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);

  const allowedExtensions = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip"];
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const getToken = () => localStorage.getItem('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (fileError) { toast.error('Invalid file'); return; }
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('courseCode', courseCode);
      formData.append('instructor', instructor);
      if (file) formData.append('file', file);

      const res = await API.post('/notes/upload', formData, {
        headers: { Authorization: `Bearer ${getToken()}` } // remove explicit multipart Content-Type
      });
      const newNote = res.data;
      onUploaded && onUploaded(newNote);

      setTitle(''); setDescription(''); setCourseCode(''); setInstructor('');
      setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Upload successful');
    } catch (err) {
      console.error('Upload error', err.response?.data || err.message || err);
      const serverMsg = err.response?.data?.message || err.message || 'Upload failed';
      if (serverMsg.toLowerCase().includes('file too large')) {
        setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
      }
      toast.error(serverMsg);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="upload-form">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required />
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" required />
      <input value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="Course Code" required />
      <input value={instructor} onChange={e => setInstructor(e.target.value)} placeholder="Instructor" required />
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const f = e.target.files[0];
          if (!f) { setFile(null); setFileError(''); return; }
          const ext = '.' + f.name.split('.').pop().toLowerCase();
          if (!allowedExtensions.includes(ext)) {
            toast.error(`Invalid file. Allowed: ${allowedExtensions.join(', ')}`);
            setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          if (f.size > MAX_FILE_BYTES) {
            toast.error(`File too large. Max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
            setFile(null);
            setFileError(`File too large. Max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          setFile(f); setFileError('');
        }}
        required
      />
      <button type="submit" disabled={!file || !!fileError}>Upload Note</button>
    </form>
  );
}