import axios from 'axios';

// Separate axios instance for platform admin — uses platform_token
const platformApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('platform_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default platformApi;
