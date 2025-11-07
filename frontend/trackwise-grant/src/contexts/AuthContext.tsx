import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: { id: string; role: 'user' | 'device'; token: string } | null;
  login: (id: string, role: 'user' | 'device') => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; role: 'user' | 'device'; token: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('vehicletrack_auth');
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const login = (id: string, role: 'user' | 'device') => {
    // Create a simple fake JWT for demo purposes
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: id, role }));
    const token = `${header}.${payload}.fake-signature`;
    
    const userData = { id, role, token };
    setUser(userData);
    localStorage.setItem('vehicletrack_auth', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('vehicletrack_auth');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
