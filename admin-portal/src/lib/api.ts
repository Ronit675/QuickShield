import axios from 'axios';
import { env } from './env';

const ACCESS_TOKEN_KEY = 'adminAccessToken';
const REFRESH_TOKEN_KEY = 'adminRefreshToken';
const USER_KEY = 'adminUser';

export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: env.apiTimeout,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export const adminStorage = {
  accessTokenKey: ACCESS_TOKEN_KEY,
  refreshTokenKey: REFRESH_TOKEN_KEY,
  userKey: USER_KEY,
};
