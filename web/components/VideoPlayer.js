import { getToken } from '../lib/api';

export default function VideoPlayer({ chunkId, onClose }) {
  // We need to pass auth token - use a proxy approach via fetch + blob
  // since video src can't easily pass Bearer token
  const token = getToken();
  const streamUrl = `/api/recordings/${chunkId}/stream`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div style={{ maxWidth: 920, width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <video
          controls
          autoPlay
          src={streamUrl}
          style={{ width: '100%', borderRadius: 8 }}
          onError={(e) => {
            // If direct src fails, try with fetch + blob
            fetch(streamUrl, { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => r.blob())
              .then((blob) => {
                e.target.src = URL.createObjectURL(blob);
              });
          }}
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
