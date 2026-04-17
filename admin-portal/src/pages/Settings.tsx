import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { api } from '../lib/api';
import type { AdminRole, AdminSettingsRecord } from '../types/admin';
import './Settings.css';

type AdminFormState = {
  displayName: string;
  email: string;
  phone: string;
  role: AdminRole;
  canViewClaims: boolean;
  canApproveClaims: boolean;
  canManageAdmins: boolean;
  canViewAnalytics: boolean;
  canManagePricing: boolean;
  isActive: boolean;
};

const initialFormState: AdminFormState = {
  displayName: '',
  email: '',
  phone: '',
  role: 'ADMIN',
  canViewClaims: true,
  canApproveClaims: false,
  canManageAdmins: false,
  canViewAnalytics: true,
  canManagePricing: false,
  isActive: true,
};

const roleOptions: AdminRole[] = [
  'ADMIN',
  'FRAUD_REVIEWER',
  'CLAIMS_OFFICER',
  'ANALYTICS_LEAD',
  'SUPERADMIN',
];

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Never';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const buildPayload = (formState: AdminFormState) => ({
  displayName: formState.displayName.trim(),
  email: formState.email.trim(),
  phone: formState.phone.trim(),
  role: formState.role,
  canViewClaims: formState.canViewClaims,
  canApproveClaims: formState.canApproveClaims,
  canManageAdmins: formState.canManageAdmins,
  canViewAnalytics: formState.canViewAnalytics,
  canManagePricing: formState.canManagePricing,
  isActive: formState.isActive,
});

export default function Settings() {
  const { updateUser } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminSettingsRecord[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AdminFormState>(initialFormState);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadAdminSettings = async () => {
      setLoading(true);
      setError('');

      try {
        const [meResponse, adminsResponse] = await Promise.all([
          api.get('/admin/settings/me'),
          api.get<AdminSettingsRecord[]>('/admin/settings/admins'),
        ]);

        if (cancelled) {
          return;
        }

        const nextAdmins = adminsResponse.data;
        const me = meResponse.data;
        setCurrentAdminId(me.id);
        setAdmins(nextAdmins);
        const firstAdmin = nextAdmins[0] ?? null;
        setSelectedAdminId(firstAdmin?.id ?? null);
        setFormState(firstAdmin ? mapAdminToForm(firstAdmin) : initialFormState);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load admin settings.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAdminSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAdmin = useMemo(
    () => admins.find((admin) => admin.id === selectedAdminId) ?? null,
    [admins, selectedAdminId],
  );

  const handleFieldChange = <K extends keyof AdminFormState>(key: K, value: AdminFormState[K]) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSelectAdmin = (admin: AdminSettingsRecord) => {
    setSelectedAdminId(admin.id);
    setFormState(mapAdminToForm(admin));
    setMessage('');
    setError('');
  };

  const handleNewAdmin = () => {
    setSelectedAdminId(null);
    setFormState(initialFormState);
    setMessage('');
    setError('');
  };

  const refreshAdmins = async (nextSelectedId?: string | null) => {
    const adminsResponse = await api.get<AdminSettingsRecord[]>('/admin/settings/admins');
    const nextAdmins = adminsResponse.data;
    setAdmins(nextAdmins);

    if (nextSelectedId) {
      const nextSelectedAdmin = nextAdmins.find((admin) => admin.id === nextSelectedId) ?? null;
      setSelectedAdminId(nextSelectedAdmin?.id ?? null);
      if (nextSelectedAdmin) {
        setFormState(mapAdminToForm(nextSelectedAdmin));
      }
      return;
    }

    if (nextAdmins.length === 0) {
      setSelectedAdminId(null);
      setFormState(initialFormState);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (selectedAdminId) {
        const { data } = await api.patch(`/admin/settings/admins/${selectedAdminId}`, buildPayload(formState));
        if (data.admin.id === currentAdminId) {
          updateUser({
            id: data.admin.id,
            email: data.admin.email,
            phone: data.admin.phone,
            displayName: data.admin.displayName,
            role: data.admin.role,
          });
        }
        await refreshAdmins(data.admin.id);
        setMessage('Admin details updated.');
      } else {
        const { data } = await api.post('/admin/settings/admins', buildPayload(formState));
        await refreshAdmins(data.admin.id);
        setMessage('Admin created and stored in the database.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save admin details.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetOtp = async () => {
    if (!selectedAdminId) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.post(`/admin/settings/admins/${selectedAdminId}/reset-otp`);
      await refreshAdmins(selectedAdminId);
      setMessage(data.message ?? 'Admin OTP state reset.');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to reset admin OTP.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Admin Settings</h2>
            <p className="muted-copy">
              Create admins, edit permissions, and persist changes into the shared backend database.
            </p>
          </div>
        </div>

        {message ? <p className="settings-success">{message}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header">
            <h3>Admin Directory</h3>
            <button className="secondary-btn" onClick={handleNewAdmin} disabled={saving}>
              New Admin
            </button>
          </div>

          {loading ? (
            <p className="muted-copy">Loading admins...</p>
          ) : admins.length > 0 ? (
            <div className="admin-list">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  className={`admin-row ${admin.id === selectedAdminId ? 'selected' : ''}`}
                  onClick={() => handleSelectAdmin(admin)}
                >
                  <div>
                    <strong>{admin.displayName}</strong>
                    <p>{admin.email}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No admins found yet.</p>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>{selectedAdmin ? 'Edit Admin' : 'Create Admin'}</h3>
              <p className="muted-copy">
                Saving this form will write directly to the `Admin` table in Prisma.
              </p>
            </div>
            {selectedAdmin ? <span className="card-chip">{selectedAdmin.role}</span> : null}
          </div>

          <div className="settings-form">
            <label className="settings-field">
              <span>Display Name</span>
              <input
                value={formState.displayName}
                onChange={(event) => handleFieldChange('displayName', event.target.value)}
                placeholder="QuickShield Admin"
              />
            </label>

            <label className="settings-field">
              <span>Email</span>
              <input
                type="email"
                value={formState.email}
                onChange={(event) => handleFieldChange('email', event.target.value)}
                placeholder="admin@quickshield.com"
              />
            </label>

            <label className="settings-field">
              <span>Phone</span>
              <input
                value={formState.phone}
                onChange={(event) => handleFieldChange('phone', event.target.value)}
                placeholder="9876543210"
              />
            </label>

            <label className="settings-field">
              <span>Role</span>
              <select value={formState.role} onChange={(event) => handleFieldChange('role', event.target.value as AdminRole)}>
                {roleOptions.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </label>

            <div className="settings-check-grid">
              <ToggleField
                label="View Claims"
                checked={formState.canViewClaims}
                onChange={(checked) => handleFieldChange('canViewClaims', checked)}
              />
              <ToggleField
                label="Approve Claims"
                checked={formState.canApproveClaims}
                onChange={(checked) => handleFieldChange('canApproveClaims', checked)}
              />
              <ToggleField
                label="Manage Admins"
                checked={formState.canManageAdmins}
                onChange={(checked) => handleFieldChange('canManageAdmins', checked)}
              />
              <ToggleField
                label="View Analytics"
                checked={formState.canViewAnalytics}
                onChange={(checked) => handleFieldChange('canViewAnalytics', checked)}
              />
              <ToggleField
                label="Manage Pricing"
                checked={formState.canManagePricing}
                onChange={(checked) => handleFieldChange('canManagePricing', checked)}
              />
              <ToggleField
                label="Active Account"
                checked={formState.isActive}
                onChange={(checked) => handleFieldChange('isActive', checked)}
              />
            </div>

            <div className="settings-actions">
              <button className="primary-btn" onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Saving...' : selectedAdmin ? 'Save Changes' : 'Create Admin'}
              </button>
              {selectedAdmin ? (
                <button className="secondary-btn" onClick={handleResetOtp} disabled={saving}>
                  Reset OTP State
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {selectedAdmin ? (
        <div className="card">
          <div className="card-header">
            <h3>Admin Record</h3>
            <span className="card-chip">Database snapshot</span>
          </div>

          <div className="record-grid">
            <RecordItem label="Created" value={formatDateTime(selectedAdmin.createdAt)} />
            <RecordItem label="Last Login" value={formatDateTime(selectedAdmin.lastLoginAt)} />
            <RecordItem label="Login Attempts" value={String(selectedAdmin.loginAttempts)} />
            <RecordItem label="Status" value={selectedAdmin.isActive ? 'Active' : 'Disabled'} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function mapAdminToForm(admin: AdminSettingsRecord): AdminFormState {
  return {
    displayName: admin.displayName,
    email: admin.email,
    phone: admin.phone ?? '',
    role: admin.role,
    canViewClaims: admin.canViewClaims,
    canApproveClaims: admin.canApproveClaims,
    canManageAdmins: admin.canManageAdmins,
    canViewAnalytics: admin.canViewAnalytics,
    canManagePricing: admin.canManagePricing,
    isActive: admin.isActive,
  };
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function RecordItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="record-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
