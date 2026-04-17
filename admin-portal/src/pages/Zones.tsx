import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ZoneClaimItem, ZoneDisruptionItem, ZoneItem } from '../types/admin';
import './Zones.css';

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

export default function Zones() {
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [selectedZoneCode, setSelectedZoneCode] = useState<string | null>(null);
  const [zoneDisruptions, setZoneDisruptions] = useState<ZoneDisruptionItem[]>([]);
  const [zoneClaims, setZoneClaims] = useState<ZoneClaimItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadZones = async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get<ZoneItem[]>('/admin/zones');
        if (cancelled) {
          return;
        }

        setZones(data);
        const firstZone = data[0] ?? null;
        setSelectedZoneCode(firstZone?.code ?? null);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load zones.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadZones();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadZoneDetail = async () => {
      if (!selectedZoneCode) {
        setZoneDisruptions([]);
        setZoneClaims([]);
        return;
      }

      setDetailLoading(true);
      setError('');

      try {
        const [disruptionsResponse, claimsResponse] = await Promise.all([
          api.get<ZoneDisruptionItem[]>(`/admin/zones/${selectedZoneCode}/disruptions`),
          api.get<ZoneClaimItem[]>(`/admin/zones/${selectedZoneCode}/claims`),
        ]);

        if (cancelled) {
          return;
        }

        setZoneDisruptions(disruptionsResponse.data);
        setZoneClaims(claimsResponse.data);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Failed to load zone details.');
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    loadZoneDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedZoneCode]);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.code === selectedZoneCode) ?? null,
    [zones, selectedZoneCode],
  );

  return (
    <div className="zones-page">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Zone Risk Control</h2>
            <p className="muted-copy">
              Live service-zone records fetched from the database through the admin backend.
            </p>
          </div>
          <span className="card-chip">ServiceZone table</span>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}
      </div>

      <div className="zones-grid">
        <div className="card zone-list">
          {loading ? (
            <p className="muted-copy">Loading zones...</p>
          ) : zones.length > 0 ? (
            zones.map((zone) => (
              <button
                key={zone.code}
                className={`zone-row ${selectedZone?.code === zone.code ? 'selected' : ''}`}
                onClick={() => setSelectedZoneCode(zone.code)}
              >
                <div>
                  <strong>{zone.name}</strong>
                  <p>{zone.city} · {zone.code}</p>
                </div>
                <div className="zone-row-meta">
                  <span className="card-chip">{Math.round(zone.averageRiskScore * 100)}%</span>
                  <span>{zone.totalClaims} claims</span>
                </div>
              </button>
            ))
          ) : (
            <p className="muted-copy">No service zones found in the database.</p>
          )}
        </div>

        {selectedZone ? (
          <div className="zone-detail">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2>{selectedZone.name}</h2>
                  <p className="muted-copy">{selectedZone.city} · {selectedZone.code}</p>
                </div>
                <span className="card-chip">{selectedZone.isActive ? 'Active' : 'Inactive'}</span>
              </div>

              <div className="record-grid">
                <RecordItem label="Active Policies" value={String(selectedZone.activePoliciesCount)} />
                <RecordItem label="Total Claims" value={String(selectedZone.totalClaims)} />
                <RecordItem label="Suspicious Claims" value={String(selectedZone.suspiciousClaimsCount)} />
                <RecordItem label="Total Payouts" value={formatCurrency(selectedZone.totalPayoutAmount)} />
                <RecordItem label="Base Risk Score" value={`${Math.round(selectedZone.baseRiskScore * 100)}%`} />
                <RecordItem label="Alert Threshold" value={`${Math.round(selectedZone.alertThreshold * 100)}%`} />
              </div>
            </div>

            <div className="zones-detail-grid">
              <div className="card">
                <div className="card-header">
                  <h3>Disruptions</h3>
                  <span className="card-chip">{zoneDisruptions.length}</span>
                </div>
                {detailLoading ? (
                  <p className="muted-copy">Loading disruptions...</p>
                ) : zoneDisruptions.length > 0 ? (
                  <div className="zone-sublist">
                    {zoneDisruptions.map((disruption) => (
                      <div key={disruption.id} className="zone-subitem">
                        <strong>{disruption.triggerType}</strong>
                        <p>{formatDateTime(disruption.startTime)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No disruption records for this zone.</p>
                )}
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Zone Claims</h3>
                  <span className="card-chip">{zoneClaims.length}</span>
                </div>
                {detailLoading ? (
                  <p className="muted-copy">Loading claims...</p>
                ) : zoneClaims.length > 0 ? (
                  <div className="zone-sublist">
                    {zoneClaims.map((claim) => (
                      <div key={claim.id} className="zone-subitem">
                        <strong>{claim.userName}</strong>
                        <p>{claim.triggerType} · {formatCurrency(claim.payoutAmount)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No claim records for this zone.</p>
                )}
              </div>
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
