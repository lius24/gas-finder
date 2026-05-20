import { useParams } from 'react-router-dom';

import './Placeholder.css';

export function StationDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="placeholder">
      <p className="placeholder-eyebrow">Station</p>
      <h1 className="placeholder-title">Station detail — under construction</h1>
      <p className="placeholder-body">Station {id} — rebuilt on the new web stack in migration step 3.</p>
    </div>
  );
}
