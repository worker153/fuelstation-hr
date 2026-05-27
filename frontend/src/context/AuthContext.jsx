import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('hr_user');
    const token  = localStorage.getItem('hr_token');
    if (stored && token) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('hr_token', data.token);
    localStorage.setItem('hr_user',  JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('hr_token', data.token);
    localStorage.setItem('hr_user',  JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    setUser(null);
  };

  // ── Permission helpers ──────────────────────────────────────────────────────
  const isSuperAdmin = () =>
    user && ['super_admin', 'admin'].includes(user.role);

  const can = (permission) => {
    if (!user) return false;
    if (['super_admin', 'admin'].includes(user.role)) return true;
    return !!user.permissions?.[permission];
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isSuperAdmin, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
