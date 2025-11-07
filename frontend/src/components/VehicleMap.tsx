import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default marker icons if needed (common in CRA/Vite)
import 'leaflet/dist/leaflet.css';

// Optional: adjust icon paths if markers don’t show
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type Vehicle = {
  vehicleId: string;
  lat: number;
  lng: number;
  speed?: number;
  ts?: number; // epoch ms
};

type View = { center: [number, number]; zoom: number };

export function VehicleMap({
  vehicles,
  view,
  onViewChange,
}: {
  vehicles: Vehicle[];
  view: View | null;
  onViewChange?: (v: View) => void;
}) {
  // stable defaults; do NOT change them on every render
  const defaultCenter: [number, number] = view?.center ?? [20.5937, 78.9629]; // India as fallback
  const defaultZoom = view?.zoom ?? 5;

  // IMPORTANT: do NOT set a changing `key` on MapContainer; remounting resets the view
  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      style={{ height: '100%', width: '100%' }}
      // prefer not to pass "bounds" or frequently changing center/zoom props after mount
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <KeepView initialView={view} onViewChange={onViewChange} />

      {vehicles.map((v) => (
        <Marker key={v.vehicleId} position={[v.lat, v.lng]}>
          <Popup>
            <div className="space-y-1">
              <div><strong>{v.vehicleId}</strong></div>
              <div>Lat: {v.lat.toFixed(6)}, Lng: {v.lng.toFixed(6)}</div>
              {v.speed != null && <div>Speed: {v.speed} km/h</div>}
              {v.ts != null && (
                <div>Updated: {new Date(v.ts).toLocaleString()}</div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/**
 * Applies the initial view ONCE, then records user pan/zoom via onViewChange.
 * Does NOT auto-fit on vehicle updates—so the map never "snaps back".
 */
function KeepView({
  initialView,
  onViewChange,
}: {
  initialView: View | null;
  onViewChange?: (v: View) => void;
}) {
  const map = useMap();
  const didApplyInitial = useRef(false);

  // Apply an initial view only once (first time we have one).
  useEffect(() => {
    if (!didApplyInitial.current && initialView) {
      map.setView(initialView.center, initialView.zoom, { animate: false });
      didApplyInitial.current = true;
    }
  }, [map, initialView]);

  // As the user pans/zooms, bubble view state up so the parent remembers it.
  useEffect(() => {
    if (!onViewChange) return;
    const handler = () => {
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onViewChange]);

  return null;
}
