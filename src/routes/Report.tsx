import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '@core/auth';
import { GeolocationError, getCurrentCoords } from '@core/adapters/geolocation';
import { formatPriceCents } from '@core/geo';
import { supabase } from '@core/supabase';
import type { Octane } from '@core/types';

import './Report.css';

type ParsedPrice = { octane: Octane; price_cents: number };

type ReportResponse = {
  report_id: string;
  parsed_prices: ParsedPrice[];
};

type ScreenState = 'idle' | 'uploading' | 'result' | 'error';

export function Report() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get('stationId') ?? undefined;
  const stationLabel = searchParams.get('stationLabel') ?? undefined;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPrice[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state for a new submission
    setErrorMsg(null);
    setIsPermissionError(false);
    setParsed(null);

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setScreenState('uploading');

    try {
      // Get location
      let latitude: number;
      let longitude: number;
      try {
        const coords = await getCurrentCoords();
        latitude = coords.latitude;
        longitude = coords.longitude;
      } catch (locErr) {
        if (locErr instanceof GeolocationError && locErr.reason === 'denied') {
          setIsPermissionError(true);
          throw new Error(
            'Location permission denied — needed to attach price to a station',
            { cause: locErr },
          );
        }
        throw locErr;
      }

      // Upload to Supabase Storage
      const path = `crowd/${session?.user?.id ?? 'anon'}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('reports').upload(path, file, {
        contentType: file.type || 'image/jpeg',
      });
      if (upErr) throw upErr;

      // Invoke edge function
      const { data, error: fnErr } = await supabase.functions.invoke<ReportResponse>('report', {
        body: {
          photo_path: path,
          latitude,
          longitude,
          ...(stationId ? { station_id: stationId } : {}),
        },
      });
      if (fnErr) throw fnErr;

      setParsed(data?.parsed_prices ?? []);
      setScreenState('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setScreenState('error');
    } finally {
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerPicker = () => {
    fileInputRef.current?.click();
  };

  const uploading = screenState === 'uploading';
  const hasPhoto = previewUrl !== null;

  return (
    <div className="rp-screen">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="rp-file-input"
        onChange={handleFileChange}
        disabled={uploading}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="rp-brand-rule" aria-hidden="true" />
      <p className="rp-kicker">CITIZEN · CONTRIBUTOR</p>
      <h1 className="rp-title">Report a price</h1>
      <p className="rp-subtitle">
        snap the price sign. we&apos;ll read the four octane numbers and file
        them with your fellow drivers.
      </p>

      {/* Station context pill */}
      {stationLabel ? (
        <div className="rp-station-pill">
          <span className="rp-station-pill-text">FOR · {stationLabel.toUpperCase()}</span>
        </div>
      ) : null}

      {/* Photo preview */}
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Price sign preview"
          className="rp-preview"
        />
      ) : null}

      {/* Uploading spinner */}
      {uploading ? (
        <div className="rp-spinner-wrap" aria-label="Uploading…" role="status">
          <span className="rp-spinner" />
          <span className="rp-spinner-label">Uploading &amp; reading prices…</span>
        </div>
      ) : null}

      {/* Parsed prices result */}
      {screenState === 'result' && parsed !== null ? (
        <div className="rp-parsed-block">
          <p className="rp-parsed-header">DETECTED PRICES</p>
          {parsed.length === 0 ? (
            <p className="rp-muted">
              couldn&apos;t read any prices. try a clearer photo.
            </p>
          ) : (
            <ul className="rp-parsed-list">
              {parsed.map((p) => (
                <li key={p.octane} className="rp-parsed-row">
                  <span className="rp-parsed-octane">{p.octane}</span>
                  <span className="rp-parsed-price">{formatPriceCents(p.price_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Error block */}
      {errorMsg ? (
        <div className="rp-message-block" role="alert">
          <p className="rp-error">{errorMsg}</p>
          {isPermissionError ? (
            <p className="rp-permission-hint">
              Allow location access in your browser settings and try again.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* CTA button */}
      <button
        type="button"
        className="rp-btn"
        onClick={triggerPicker}
        disabled={uploading}
      >
        <Camera size={16} className="rp-btn-icon" aria-hidden="true" />
        <span>{hasPhoto ? 'PICK ANOTHER' : 'PICK A PHOTO'}</span>
      </button>
    </div>
  );
}
