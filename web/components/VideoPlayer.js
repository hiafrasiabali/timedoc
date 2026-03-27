import { getToken } from '../lib/api';

export default function VideoPlayer({ chunkId, onClose }) {
  const token = getToken();
  const videoUrl = `/api/recordings/${chunkId}/stream?token=${encodeURIComponent(token)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div style={{ maxWidth: 920, width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <video
          controls
          autoPlay
          src={videoUrl}
          style={{ width: '100%', borderRadius: 8 }}
        />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="btn" style={{ background: '#fff' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
