export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  apiTimeout: Number(import.meta.env.VITE_API_TIMEOUT ?? 30000),
  sessionTimeoutMinutes: Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES ?? 30),
  otpExpiryMinutes: Number(import.meta.env.VITE_OTP_EXPIRY_MINUTES ?? 10),
  analyticsEnabled: String(import.meta.env.VITE_ENABLE_ANALYTICS ?? 'true') === 'true',
};
