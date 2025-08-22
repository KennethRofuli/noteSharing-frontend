export default function ConfirmModal({ message = 'Are you sure?', onConfirm, onCancel }) {
  return (
    <div className="confirm-modal" style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', zIndex: 2000
    }}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 6, minWidth: 300 }}>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} style={{ background: '#d9534f', color: '#fff' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}