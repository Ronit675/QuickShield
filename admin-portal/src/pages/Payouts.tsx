import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PayoutItem, PayoutStatus } from '../types/admin';
import './Payouts.css';

const statusOptions: Array<'all' | PayoutStatus> = [
  'all',
  'PENDING',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

const formatDateTime = (value: string | null) => {
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

export default function Payouts() {
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | PayoutStatus>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPayouts = async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get<PayoutItem[]>('/admin/payouts');

        if (cancelled) {
          return;
        }

        setPayouts(data);
        setSelectedPayoutId((current) => current ?? data[0]?.id ?? null);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load payouts.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPayouts();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPayout = useMemo(
    () => payouts.find((payout) => payout.id === selectedPayoutId) ?? null,
    [payouts, selectedPayoutId],
  );

  const visiblePayouts = useMemo(
    () => payouts.filter((payout) => statusFilter === 'all' || payout.status === statusFilter),
    [payouts, statusFilter],
  );

  const refreshPayout = async (payoutId: string) => {
    const { data } = await api.get<PayoutItem>(`/admin/payouts/${payoutId}`);
    setPayouts((current) => current.map((payout) => (payout.id === payoutId ? data : payout)));
    setSelectedPayoutId(payoutId);
  };

  const handleStatusUpdate = async (status: PayoutStatus) => {
    if (!selectedPayout) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.patch<PayoutItem>(`/admin/payouts/${selectedPayout.id}/status`, { status });
      setPayouts((current) => current.map((payout) => (payout.id === data.id ? data : payout)));
      setSelectedPayoutId(data.id);
      setMessage(`Payout status updated to ${status}.`);
      await refreshPayout(data.id);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to update payout status.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!selectedPayout) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.post(`/admin/payouts/${selectedPayout.id}/export`);
      setMessage(`Payout exported at ${formatDateTime(data.exportedAt)}.`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to export payout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payouts-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Payout Operations</h2>
            <p className="muted-copy">
              Live payout records fetched from the database through the admin backend.
            </p>
          </div>
          <span className="card-chip">Payout table</span>
        </div>
        {message ? <p className="settings-success">{message}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </div>

      <div className="payouts-toolbar">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? 'All statuses' : status}
            </option>
          ))}
        </select>
      </div>

      <div className="payouts-grid">
        <div className="card payouts-list">
          {loading ? (
            <p className="muted-copy">Loading payouts...</p>
          ) : visiblePayouts.length > 0 ? (
            visiblePayouts.map((payout) => (
              <button
                key={payout.id}
                className={`payout-row ${selectedPayout?.id === payout.id ? 'selected' : ''}`}
                onClick={() => setSelectedPayoutId(payout.id)}
              >
                <div>
                  <strong>{payout.id}</strong>
                  <p>{payout.zone} · {formatCurrency(payout.amount)}</p>
                </div>
                <span className={`card-chip payout-status ${payout.status.toLowerCase()}`}>{payout.status}</span>
              </button>
            ))
          ) : (
            <p className="muted-copy">No payout records found in the database.</p>
          )}
        </div>

        {selectedPayout ? (
          <div className="card payout-detail">
            <div className="card-header">
              <div>
                <h2>{selectedPayout.id}</h2>
                <p className="muted-copy">Claim {selectedPayout.claimId}</p>
              </div>
              <span className={`card-chip payout-status ${selectedPayout.status.toLowerCase()}`}>
                {selectedPayout.status}
              </span>
            </div>

            <div className="record-grid">
              <RecordItem label="Amount" value={formatCurrency(selectedPayout.amount)} />
              <RecordItem label="Zone" value={selectedPayout.zone} />
              <RecordItem label="Method" value={selectedPayout.method} />
              <RecordItem label="Trigger" value={selectedPayout.triggerType} />
              <RecordItem label="Claim Status" value={selectedPayout.claimStatus} />
              <RecordItem label="Processed By" value={selectedPayout.processedBy ?? 'Unassigned'} />
              <RecordItem label="Scheduled For" value={formatDateTime(selectedPayout.scheduledFor)} />
              <RecordItem label="Processed At" value={formatDateTime(selectedPayout.processedAt)} />
            </div>

            <div className="detail-section">
              <h3>Status Actions</h3>
              <div className="payout-actions">
                {statusOptions
                  .filter((status): status is PayoutStatus => status !== 'all')
                  .map((status) => (
                    <button
                      key={status}
                      className={status === selectedPayout.status ? 'primary-btn' : 'secondary-btn'}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={saving}
                    >
                      {status}
                    </button>
                  ))}
                <button className="ghost-btn" onClick={handleExport} disabled={saving}>
                  Export Payout
                </button>
              </div>
            </div>

            <div className="detail-section">
              <h3>Backend Endpoints</h3>
              <ul className="endpoint-list">
                <li><code>GET /admin/payouts</code></li>
                <li><code>GET /admin/payouts/:id</code></li>
                <li><code>PATCH /admin/payouts/:id/status</code></li>
                <li><code>POST /admin/payouts/:id/export</code></li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
