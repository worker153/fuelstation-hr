import { createContext, useContext, useState, useEffect } from 'react';
import platformApi from '../utils/platformApi';

const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [admin,   setAdmin]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('platform_user');
    const token  = localStorage.getItem('platform_token');
    if (stored && token) {
      const u = JSON.parse(stored);
      if (u.isPlatformAdmin) setAdmin(u);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await platformApi.post('/auth/login', { email, password });
    if (!data.user?.isPlatformAdmin) {
      throw new Error('This account does not have platform admin access.');
    }
    localStorage.setItem('platform_token', data.token);
    localStorage.setItem('platform_user',  JSON.stringify(data.user));
    setAdmin(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_user');
    setAdmin(null);
  };

  return (
    <PlatformAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export const usePlatformAuth = () => {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth must be inside <PlatformAuthProvider>');
  return ctx;
};
