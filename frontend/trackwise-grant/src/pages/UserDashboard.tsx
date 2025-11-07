import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { VehicleMap } from '@/components/VehicleMap';
import { VehicleList } from '@/components/VehicleList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LogOut, Plus, Menu, X } from 'lucide-react';
import { toast } from 'sonner';

interface VehicleData {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number;
  ts: number;
  status: 'accepted' | 'pending';
}

const UserDashboard = () => {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [newVehicleId, setNewVehicleId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!socket || !user) return;

    // Listen for live location updates
    socket.on('location:live', (data: VehicleData) => {
      console.log('📍 Location update:', data);
      setVehicles((prev) => {
        const existing = prev.find((v) => v.vehicleId === data.vehicleId);
        if (existing) {
          return prev.map((v) =>
            v.vehicleId === data.vehicleId ? { ...data, status: 'accepted' } : v
          );
        }
        return [...prev, { ...data, status: 'accepted' }];
      });
    });

    // Listen for permission granted
    socket.on('permission:granted', ({ vehicleId }: { vehicleId: string }) => {
      console.log('✅ Permission granted:', vehicleId);
      toast.success(`Access granted for vehicle ${vehicleId}`);
      setVehicles((prev) =>
        prev.map((v) => (v.vehicleId === vehicleId ? { ...v, status: 'accepted' } : v))
      );
    });

    return () => {
      socket.off('location:live');
      socket.off('permission:granted');
    };
  }, [socket, user]);

  useEffect(() => {
    // Fetch user permissions on mount
    if (user) {
      fetch(`http://13.126.62.128/api/user/${user.id}/permissions`)
        .then((res) => res.json())
        .then((data) => {
          const accepted = data.accepted?.map((vid: string) => ({
            vehicleId: vid,
            status: 'accepted' as const,
          })) || [];
          const pending = data.pending?.map((vid: string) => ({
            vehicleId: vid,
            status: 'pending' as const,
          })) || [];
          setVehicles([...accepted, ...pending]);
        })
        .catch(console.error);
    }
  }, [user]);

  const handleRequestAccess = (vehicleId: string) => {
    if (!socket) return;

    socket.emit('location:request', { vehicleId, userId: user.id }, (response) => {
      if (response?.ok) {
        toast.success('Access request sent');
        setVehicles((prev) =>
          prev.some((v) => v.vehicleId === vehicleId)
            ? prev
            : [...prev, { vehicleId, status: 'pending' } as VehicleData]
        );
      } else {
        toast.error(response?.error || 'Failed to request access');
      }
    });
  };

  const handleAddVehicle = () => {
    if (newVehicleId.trim()) {
      handleRequestAccess(newVehicleId.trim());
      setNewVehicleId('');
      setDialogOpen(false);
    }
  };

  const activeVehicles = vehicles.filter((v) => v.status === 'accepted' && v.lat && v.lng);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden"
          >
            {sidebarOpen ? <X /> : <Menu />}
          </Button>
          <h1 className="text-xl font-bold text-foreground">VehicleTrack Dashboard</h1>
          <div className={`flex items-center gap-2 text-sm ${connected ? 'text-accent' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent animate-pulse' : 'bg-muted-foreground'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">User: {user?.id}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 transition-transform fixed lg:relative z-20 w-80 bg-card border-r border-border p-6 overflow-y-auto h-[calc(100vh-73px)]`}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">My Vehicles</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="default">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Vehicle
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Request Vehicle Access</DialogTitle>
                  <DialogDescription>
                    Enter the vehicle ID to request tracking access
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Input
                    placeholder="Enter Vehicle ID"
                    value={newVehicleId}
                    onChange={(e) => setNewVehicleId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddVehicle()}
                  />
                  <Button onClick={handleAddVehicle} className="w-full" disabled={!newVehicleId.trim()}>
                    Request Access
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <VehicleList
            vehicles={vehicles}
            onSelectVehicle={(id) => console.log('Selected:', id)}
            onRequestAccess={handleRequestAccess}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 p-6">
  <div
    className="h-full bg-card rounded-lg border border-border overflow-hidden relative z-0"
  >
    <VehicleMap vehicles={activeVehicles} />
  </div>
</main>
      </div>
    </div>
  );
};

export default UserDashboard;
