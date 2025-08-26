export default function NoteCard({ note, isOwned, onShare, onDownload, onDelete, sharer, onUnshare }) {
  return (
    <div className="note-card" key={note._id}>
      <div className="note-card-content">
        {sharer && <p><strong>Shared by:</strong> {sharer}</p>}
        <p className="course-code">{note.courseCode}</p>
        <h4>{note.title}</h4>
        <p>{note.description}</p>
        <p><strong>Prof:</strong> {note.instructor}</p>
      </div>
      <div className="card-actions">
        {isOwned ? <button className="btn action-btn" onClick={() => onShare(note._id)}>Share</button> : null}
        <button className="btn action-btn" onClick={() => onDownload(note)}>Download</button>
        {isOwned ? <button className="btn delete-btn" onClick={() => onDelete(note._id)}>Delete</button> : null}
        {!isOwned && onUnshare && (
          <button 
            className="btn delete-btn" 
            onClick={() => onUnshare(note._id)}
            title="Remove from my shared list"
          >
            Remove Note
          </button>
        )}
      </div>
    </div>
  );
}