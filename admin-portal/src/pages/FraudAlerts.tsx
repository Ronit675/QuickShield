import { useEffect, useMemo, useState } from 'react';
import './FraudAlerts.css';
import { api } from '../lib/api';
import type { FraudAlertItem } from '../types/admin';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function FraudAlerts() {
  const [alerts, setAlerts] = useState<FraudAlertItem[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'all' | FraudAlertItem['severity']>('all');
  const [status, setStatus] = useState<'all' | FraudAlertItem['status']>('all');
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadAlerts = async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get<FraudAlertItem[]>('/admin/fraud-alerts');

        if (cancelled) {
          return;
        }

        setAlerts(data);
        const firstAlert = data[0] ?? null;
        setSelectedAlertId((current) => current ?? firstAlert?.id ?? null);
        setResolutionDraft(firstAlert?.resolution ?? '');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load fraud alerts.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAlerts();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.id === selectedAlertId) ?? null,
    [alerts, selectedAlertId],
  );

  const visibleAlerts = useMemo(
    () =>
      alerts.filter(
        (alert) => (severity === 'all' || alert.severity === severity) && (status === 'all' || alert.status === status),
      ),
    [alerts, severity, status],
  );

  const refreshAlert = async (alertId: string) => {
    const { data } = await api.get<FraudAlertItem>(`/admin/fraud-alerts/${alertId}`);
    setAlerts((current) => current.map((alert) => (alert.id === alertId ? data : alert)));
    setSelectedAlertId(alertId);
    setResolutionDraft(data.resolution ?? '');
  };

  const handleSelectAlert = (alert: FraudAlertItem) => {
    setSelectedAlertId(alert.id);
    setResolutionDraft(alert.resolution ?? '');
    setMessage('');
    setError('');
  };

  const handleAssign = async () => {
    if (!selectedAlert) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.post<FraudAlertItem>(`/admin/fraud-alerts/${selectedAlert.id}/assign`);
      setAlerts((current) => current.map((alert) => (alert.id === data.id ? data : alert)));
      setSelectedAlertId(data.id);
      setMessage('Fraud alert assigned.');
      await refreshAlert(data.id);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to assign fraud alert.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (nextStatus: FraudAlertItem['status']) => {
    if (!selectedAlert) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.patch<FraudAlertItem>(`/admin/fraud-alerts/${selectedAlert.id}`, {
        status: nextStatus,
        resolution: resolutionDraft,
      });
      setAlerts((current) => current.map((alert) => (alert.id === data.id ? data : alert)));
      setSelectedAlertId(data.id);
      setMessage(`Fraud alert updated to ${nextStatus}.`);
      await refreshAlert(data.id);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to update fraud alert.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fraud-alerts-page">
      <div className="alerts-header card">
        <div className="card-header">
          <h2>Fraud Review Queue</h2>
          <span className="card-chip">FraudAlert table</span>
        </div>
        <p className="muted-copy">
          Live fraud alert records fetched from the database through the admin backend.
        </p>
        {message ? <p className="settings-success">{message}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </div>

      <div className="alerts-toolbar">
        <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
          <option value="all">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="REVIEWING">Reviewing</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      <div className="alerts-grid">
        <div className="card alerts-list">
          {loading ? (
            <p className="muted-copy">Loading fraud alerts...</p>
          ) : visibleAlerts.length > 0 ? (
            visibleAlerts.map((alert) => (
              <button
                key={alert.id}
                className={`alert-row ${selectedAlert?.id === alert.id ? 'selected' : ''}`}
                onClick={() => handleSelectAlert(alert)}
              >
                <span className={`severity-pill ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                <div className="alert-row-copy">
                  <strong>{alert.id}</strong>
                  <p>{alert.claimId} · {alert.zone}</p>
                </div>
                <span className="alert-risk">{Math.round(alert.riskScore * 100)}%</span>
              </button>
            ))
          ) : (
            <p className="muted-copy">No fraud alerts found in the database.</p>
          )}
        </div>

        {selectedAlert ? (
          <div className="card alert-detail">
            <div className="card-header">
              <div>
                <h2>{selectedAlert.id}</h2>
                <p className="muted-copy">Claim {selectedAlert.claimId}</p>
              </div>
              <span className={`severity-pill ${selectedAlert.severity.toLowerCase()}`}>{selectedAlert.severity}</span>
            </div>

            <div className="detail-grid">
              <DetailItem label="Risk score" value={`${Math.round(selectedAlert.riskScore * 100)}%`} />
              <DetailItem label="Claim amount" value={formatCurrency(selectedAlert.claimAmount)} />
              <DetailItem label="Zone" value={selectedAlert.zone} />
              <DetailItem label="Trigger" value={selectedAlert.disruptionType} />
              <DetailItem label="Status" value={selectedAlert.status} />
              <DetailItem label="Created" value={formatDateTime(selectedAlert.createdAt)} />
              <DetailItem label="Reviewed By" value={selectedAlert.reviewedBy ?? 'Unassigned'} />
              <DetailItem label="Resolved" value={formatDateTime(selectedAlert.resolvedAt)} />
            </div>

            <div className="detail-section">
              <h3>Fraud indicators</h3>
              <ul className="notes-list">
                {selectedAlert.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="detail-section">
              <h3>Resolution</h3>
              <textarea
                className="alert-resolution"
                value={resolutionDraft}
                onChange={(event) => setResolutionDraft(event.target.value)}
                placeholder="Add a review resolution or dismissal note..."
              />
            </div>

            <div className="detail-section">
              <h3>Actions</h3>
              <div className="payout-actions">
                <button className="secondary-btn" onClick={handleAssign} disabled={saving}>
                  Assign to Me
                </button>
                {(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const).map((nextStatus) => (
                  <button
                    key={nextStatus}
                    className={nextStatus === selectedAlert.status ? 'primary-btn' : 'secondary-btn'}
                    onClick={() => handleStatusUpdate(nextStatus)}
                    disabled={saving}
                  >
                    {nextStatus}
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <h3>Backend Endpoints</h3>
              <ul className="endpoint-list">
                <li><code>GET /admin/fraud-alerts</code></li>
                <li><code>GET /admin/fraud-alerts/:id</code></li>
                <li><code>PATCH /admin/fraud-alerts/:id</code></li>
                <li><code>POST /admin/fraud-alerts/:id/assign</code></li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
