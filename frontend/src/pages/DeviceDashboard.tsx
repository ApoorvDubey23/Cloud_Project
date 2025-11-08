import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, CheckCircle, XCircle, User, Play, Square } from 'lucide-react';
import { toast } from 'sonner';

interface PermissionRequest {
  userId: string;
  vehicleId: string;
  ts: number;
}

const DEFAULT_POS = { lat: 25.2620, lng: 82.9935 }; 
const TWO_SECONDS = 2000;

const DeviceDashboard = () => {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [acceptedUsers, setAcceptedUsers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const timerRef = useRef<number | null>(null);
  const lastPosRef = useRef<{lat:number; lng:number; ts:number} | null>(null);

  // ---- helpers: geolocate or random-walk fallback ----
  const getPosition = async (): Promise<{lat:number; lng:number}> => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 5_000,
            timeout: 7_000,
          });
        });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // fall through to random walk
      }
    }
    // random walk around last/ default
    const base = lastPosRef.current ?? { ...DEFAULT_POS, ts: Date.now() };
    const jitter = () => (Math.random() - 0.5) * 0.0008; // ~ up to ~90m step
    return { lat: base.lat + jitter(), lng: base.lng + jitter() };
  };

  const sendLocationOnce = async () => {
    if (!socket || !user) return;
    const now = Date.now();
    const { lat, lng } = await getPosition();

    // crude speed estimate if we have last position (haversine could be used; simple approx is fine)
    let speed = 0; // m/s
    if (lastPosRef.current) {
      const { lat: lat0, lng: lng0, ts: t0 } = lastPosRef.current;
      const dt = Math.max(1, (now - t0) / 1000); // seconds
      const toRad = (d:number)=>d*Math.PI/180;
      const R = 6371000; // Earth m
      const dLat = toRad(lat - lat0);
      const dLng = toRad(lng - lng0);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat0))*Math.cos(toRad(lat))*Math.sin(dLng/2)**2;
      const d = 2 * R * Math.asin(Math.sqrt(a)); // meters
      speed = d / dt; // m/s
    }

    const payload = {
      vehicleId: user.id,
      lat,
      lng,
      speed,
    };

    socket.emit('location:update', payload, (ack: any) => {
      if (!ack?.ok) {
        toast.error(ack?.error || 'Failed to send location');
      }
    });

    lastPosRef.current = { lat, lng, ts: now };
  };

  const startSending = () => {
    if (sending || !socket || !user) return;
    setSending(true);
    // kick one immediately
    sendLocationOnce();
    // then every 2 seconds
    timerRef.current = window.setInterval(sendLocationOnce, TWO_SECONDS);
    toast.success('Started sending location every 2s');
  };

  const stopSending = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setSending(false);
    toast.info('Stopped sending location');
  };

  // ---- socket listeners ----
  useEffect(() => {
    if (!socket || !user) return;

    const onReq = (data: PermissionRequest) => {
      setRequests((prev) => [...prev, data]);
      toast.info(`Permission request from User ${data.userId}`);
    };

    socket.on('permission:request', onReq);

    return () => {
      socket.off('permission:request', onReq); // fixed: correct event name
    };
  }, [socket, user]);

  // join/leave (optional if your auth already rooms devices; harmless otherwise)
  useEffect(() => {
    if (!socket || !user) return;
    socket.emit('vehicle:join', { vehicleId: user.id });
    return () => {
      socket.emit('vehicle:leave', { vehicleId: user.id });
    };
  }, [socket, user]);

  // fetch current permissions
  useEffect(() => {
    if (user) {
      fetch(`http://13.126.62.128/api/vehicle/${user.id}/permissions`)
        .then((res) => res.json())
        .then((data) => {
          setAcceptedUsers(data.accepted || []);
          const pending = (data.pending || []).map((userId: string) => ({
            userId,
            vehicleId: user.id,
            ts: Date.now(),
          }));
          setRequests(pending);
        })
        .catch(console.error);
    }
  }, [user]);

  // cleanup the interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
  window.clearInterval(timerRef.current);
  timerRef.current = null;
}
    };
  }, []);

  const handleGrantPermission = (userId: string) => {
    if (!socket || !user) return;

    socket.emit(
      'permission:granted',
      { userId, vehicleId: user.id },
      (response: any) => {
        if (response?.ok) {
          toast.success(`Access granted to User ${userId}`);
          setRequests((prev) => prev.filter((r) => r.userId !== userId));
          setAcceptedUsers((prev) => [...prev, userId]);
        } else {
          toast.error('Failed to grant permission');
        }
      }
    );
  };

  const handleDenyPermission = (userId: string) => {
    setRequests((prev) => prev.filter((r) => r.userId !== userId));
    toast.info(`Denied access to User ${userId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-foreground">Device Dashboard</h1>
          <div className={`flex items-center gap-2 text-sm ${connected ? 'text-accent' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent animate-pulse' : 'bg-muted-foreground'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Device: {user?.id}</span>

          {/* NEW: Start/Stop location sender */}
          {sending ? (
            <Button variant="destructive" size="sm" onClick={stopSending} title="Stop sending location">
              <Square className="w-4 h-4 mr-2" />
              Stop sending
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={startSending} title="Send location every 2s">
              <Play className="w-4 h-4 mr-2" />
              Start sending
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-4xl">
        <div className="grid gap-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Active Users</CardDescription>
                <CardTitle className="text-3xl">{acceptedUsers.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Pending Requests</CardDescription>
                <CardTitle className="text-3xl">{requests.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Permission Requests */}
          <Card>
            <CardHeader>
              <CardTitle>Permission Requests</CardTitle>
              <CardDescription>
                Users requesting access to view your location
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((req) => (
                    <div
                      key={`${req.userId}-${req.ts}`}
                      className="flex items-center justify-between p-4 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-foreground">User {req.userId}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(req.ts).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleGrantPermission(req.userId)}
                          className="bg-accent hover:bg-accent/90"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Grant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDenyPermission(req.userId)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accepted Users */}
          <Card>
            <CardHeader>
              <CardTitle>Authorized Users</CardTitle>
              <CardDescription>
                Users with access to view your location
              </CardDescription>
            </CardHeader>
            <CardContent>
              {acceptedUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No authorized users yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {acceptedUsers.map((userId) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                          <User className="w-4 h-4 text-accent" />
                        </div>
                        <span className="font-medium">User {userId}</span>
                      </div>
                      <Badge className="bg-accent text-accent-foreground">Active</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DeviceDashboard;

