import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import Layout from './pages/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Claims from './pages/Claims';
import FraudAlerts from './pages/FraudAlerts';
import Payouts from './pages/Payouts';
import Zones from './pages/Zones';
import PricingRisk from './pages/PricingRisk';
import Settings from './pages/Settings';
import './App.css';

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading admin session...</p>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/claims" element={<Claims />} />
            <Route path="/fraud-alerts" element={<FraudAlerts />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/pricing-risk" element={<PricingRisk />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <AppRoutes />
    </AdminAuthProvider>
  );
}
