import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Radio } from 'lucide-react';

const Login = () => {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleUserLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim()) {
      login(userId, 'user');
      navigate('/dashboard');
    }
  };

  const handleDeviceLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (deviceId.trim()) {
      login(deviceId, 'device');
      navigate('/device');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="w-full max-w-md p-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
            <MapPin className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">VehicleTrack Cloud</h1>
          <p className="text-muted-foreground mt-2">Real-time vehicle tracking system</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Choose your role to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="user" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user">
                  <MapPin className="w-4 h-4 mr-2" />
                  User
                </TabsTrigger>
                <TabsTrigger value="device">
                  <Radio className="w-4 h-4 mr-2" />
                  Device
                </TabsTrigger>
              </TabsList>

              <TabsContent value="user">
                <form onSubmit={handleUserLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="userId" className="text-sm font-medium">
                      User ID
                    </label>
                    <Input
                      id="userId"
                      placeholder="Enter your user ID"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Sign In as User
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="device">
                <form onSubmit={handleDeviceLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="deviceId" className="text-sm font-medium">
                      Device ID
                    </label>
                    <Input
                      id="deviceId"
                      placeholder="Enter device ID"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Sign In as Device
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
