export default function NoteCard({ note, isOwned, onShare, onDownload, onDelete, sharer }) {
  return (
    <div className="note-card" key={note._id}>
      {sharer && <p><strong>Shared by:</strong> {sharer}</p>}
      <p className="course-code">{note.courseCode}</p>
      <h4>{note.title}</h4>
      <p>{note.description}</p>
      <p><strong>Prof:</strong> {note.instructor}</p>
      <div className="card-actions">
        {isOwned ? <button className="btn" onClick={() => onShare(note._id)}>Share</button> : null}
        <button className="btn" onClick={() => onDownload(note)}>Download</button>
        {isOwned ? <button className="btn delete-btn" onClick={() => onDelete(note._id)}>Delete</button> : null}
      </div>
    </div>
  );
}