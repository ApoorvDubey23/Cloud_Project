import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface VehicleLocation {
  vehicleId: string;
  lat: number;
  lng: number;
  speed?: number;
  ts: number;
  status?: 'accepted' | 'pending' | 'inactive';
}

interface VehicleMapProps {
  vehicles: VehicleLocation[];
  onVehicleClick?: (vehicleId: string) => void;
  center?: [number, number];
}

export const VehicleMap = ({ vehicles, onVehicleClick, center = [28.6139, 77.2090] }: VehicleMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(center, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const currentMarkers = markersRef.current;

    // Update or create markers for each vehicle
    vehicles.forEach((vehicle) => {
      const existingMarker = currentMarkers.get(vehicle.vehicleId);
      
      if (existingMarker) {
        // Update position with smooth animation
        existingMarker.setLatLng([vehicle.lat, vehicle.lng]);
        existingMarker.setPopupContent(`
          <div class="p-2">
            <strong>Vehicle ${vehicle.vehicleId}</strong><br/>
            Speed: ${vehicle.speed || 0} km/h<br/>
            Status: ${vehicle.status || 'accepted'}
          </div>
        `);
      } else {
        // Create new marker
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="relative">
              <div class="w-8 h-8 rounded-full ${
                vehicle.status === 'pending' ? 'bg-warning' : 'bg-accent'
              } border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker([vehicle.lat, vehicle.lng], { icon })
          .addTo(map)
          .bindPopup(`
          <div class="p-2">
            <strong>Vehicle ${vehicle.vehicleId}</strong><br/>
            Speed: ${vehicle.speed || 0} km/h<br/>
            Status: ${vehicle.status || 'accepted'}
          </div>
          `);

        if (onVehicleClick) {
          marker.on('click', () => onVehicleClick(vehicle.vehicleId));
        }

        currentMarkers.set(vehicle.vehicleId, marker);
      }
    });

    // Remove markers for vehicles that are no longer in the list
    const currentVehicleIds = new Set(vehicles.map(v => v.vehicleId));
    currentMarkers.forEach((marker, vehicleId) => {
      if (!currentVehicleIds.has(vehicleId)) {
        marker.remove();
        currentMarkers.delete(vehicleId);
      }
    });

    // Auto-fit bounds if there are vehicles
    if (vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map(v => [v.lat, v.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [vehicles, onVehicleClick]);

  return <div ref={mapContainerRef} className="w-full h-full rounded-lg" />;
};
