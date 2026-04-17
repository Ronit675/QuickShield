import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ClaimItem, ClaimStatus } from '../types/admin';
import './Claims.css';

const claimStatusOptions: Array<'all' | ClaimStatus> = ['all', 'auto_approved', 'pending_review', 'paid'];

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

export default function Claims() {
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ClaimStatus>('all');
  const [noteDraft, setNoteDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadClaims = async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get<ClaimItem[]>('/admin/claims');

        if (cancelled) {
          return;
        }

        setClaims(data);
        const firstClaim = data[0] ?? null;
        setSelectedClaimId((current) => current ?? firstClaim?.id ?? null);
        setNoteDraft(firstClaim?.reviewNotes ?? '');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load claims.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadClaims();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedClaim = useMemo(
    () => claims.find((claim) => claim.id === selectedClaimId) ?? null,
    [claims, selectedClaimId],
  );

  const visibleClaims = useMemo(
    () => claims.filter((claim) => statusFilter === 'all' || claim.status === statusFilter),
    [claims, statusFilter],
  );

  const refreshClaim = async (claimId: string) => {
    const { data } = await api.get<ClaimItem>(`/admin/claims/${claimId}`);
    setClaims((current) => current.map((claim) => (claim.id === claimId ? data : claim)));
    setSelectedClaimId(claimId);
    setNoteDraft(data.reviewNotes ?? '');
  };

  const handleSelectClaim = (claim: ClaimItem) => {
    setSelectedClaimId(claim.id);
    setNoteDraft(claim.reviewNotes ?? '');
    setMessage('');
    setError('');
  };

  const handleStatusUpdate = async (status: ClaimStatus) => {
    if (!selectedClaim) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.patch<ClaimItem>(`/admin/claims/${selectedClaim.id}/status`, { status });
      setClaims((current) => current.map((claim) => (claim.id === data.id ? data : claim)));
      setSelectedClaimId(data.id);
      setMessage(`Claim status updated to ${status}.`);
      await refreshClaim(data.id);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to update claim status.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedClaim) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data } = await api.post<ClaimItem>(`/admin/claims/${selectedClaim.id}/notes`, { note: noteDraft });
      setClaims((current) => current.map((claim) => (claim.id === data.id ? data : claim)));
      setSelectedClaimId(data.id);
      setNoteDraft(data.reviewNotes ?? '');
      setMessage('Claim note saved.');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save claim note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="claims-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Claims Operations</h2>
            <p className="muted-copy">
              Live claim records fetched from the database through the admin backend.
            </p>
          </div>
          <span className="card-chip">Claim table</span>
        </div>
        {message ? <p className="settings-success">{message}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </div>

      <div className="claims-toolbar">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          {claimStatusOptions.map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? 'All statuses' : status}
            </option>
          ))}
        </select>
      </div>

      <div className="claims-grid">
        <div className="card claims-list">
          {loading ? (
            <p className="muted-copy">Loading claims...</p>
          ) : visibleClaims.length > 0 ? (
            visibleClaims.map((claim) => (
              <button
                key={claim.id}
                className={`claim-row ${selectedClaim?.id === claim.id ? 'selected' : ''}`}
                onClick={() => handleSelectClaim(claim)}
              >
                <div>
                  <strong>{claim.id}</strong>
                  <p>{claim.userName} · {claim.zone}</p>
                </div>
                <div className="claim-row-meta">
                  <span className={`card-chip claim-status ${claim.status}`}>{claim.status}</span>
                  <strong>{formatCurrency(claim.payoutAmount)}</strong>
                </div>
              </button>
            ))
          ) : (
            <p className="muted-copy">No claim records found in the database.</p>
          )}
        </div>

        {selectedClaim ? (
          <div className="card claim-detail">
            <div className="card-header">
              <div>
                <h2>{selectedClaim.id}</h2>
                <p className="muted-copy">{selectedClaim.userName} · Policy {selectedClaim.policyId}</p>
              </div>
              <span className={`card-chip claim-status ${selectedClaim.status}`}>{selectedClaim.status}</span>
            </div>

            <div className="record-grid">
              <RecordItem label="User" value={selectedClaim.userName} />
              <RecordItem label="Phone" value={selectedClaim.userPhone ?? 'Not provided'} />
              <RecordItem label="Email" value={selectedClaim.userEmail ?? 'Not provided'} />
              <RecordItem label="Zone" value={selectedClaim.zone} />
              <RecordItem label="Trigger" value={selectedClaim.triggerType} />
              <RecordItem label="Payout" value={formatCurrency(selectedClaim.payoutAmount)} />
              <RecordItem label="Risk Score" value={`${Math.round(selectedClaim.riskScore * 100)}%`} />
              <RecordItem label="Disrupted Hours" value={String(selectedClaim.disruptedHours)} />
              <RecordItem label="Reviewed By" value={selectedClaim.reviewedBy ?? 'Unassigned'} />
              <RecordItem label="Reviewed At" value={formatDateTime(selectedClaim.reviewedAt)} />
            </div>

            <div className="detail-section">
              <h3>Status Actions</h3>
              <div className="claim-actions">
                {claimStatusOptions
                  .filter((status): status is ClaimStatus => status !== 'all')
                  .map((status) => (
                    <button
                      key={status}
                      className={status === selectedClaim.status ? 'primary-btn' : 'secondary-btn'}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={saving}
                    >
                      {status}
                    </button>
                  ))}
              </div>
            </div>

            <div className="detail-section">
              <h3>Review Notes</h3>
              <textarea
                className="claim-notes"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add admin review notes..."
              />
              <div className="claim-actions">
                <button className="primary-btn" onClick={handleSaveNote} disabled={saving}>
                  Save Note
                </button>
              </div>
            </div>

            <div className="detail-section">
              <h3>Linked Records</h3>
              <ul className="endpoint-list">
                <li>Fraud alert: {selectedClaim.fraudAlert ? `${selectedClaim.fraudAlert.severity} / ${selectedClaim.fraudAlert.status}` : 'None'}</li>
                <li>Payout: {selectedClaim.payout ? `${selectedClaim.payout.id} / ${selectedClaim.payout.status}` : 'None'}</li>
                <li>Created: {formatDateTime(selectedClaim.createdAt)}</li>
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
