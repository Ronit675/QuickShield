import { useEffect, useState } from 'react';
import './Dashboard.css';
import { api } from '../lib/api';
import type {
  DashboardCluster,
  DashboardOverviewResponse,
  DashboardRiskZone,
  RecentActivity,
} from '../types/admin';

const LIVE_REFRESH_INTERVAL_MS = 15_000;

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const formatRelativeTime = (timestamp: string) => {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  const diffMs = parsedDate.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
};

const formatAbsoluteTime = (timestamp: string | null) => {
  if (!timestamp) {
    return 'Waiting for first sync';
  }

  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
};

export default function Dashboard() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async (isBackgroundRefresh = false) => {
      if (isBackgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!isBackgroundRefresh) {
        setError('');
      }

      try {
        const [overviewResponse, activityResponse] = await Promise.all([
          api.get<DashboardOverviewResponse>('/admin/dashboard/overview'),
          api.get<RecentActivity[]>('/admin/dashboard/activity'),
        ]);

        if (cancelled) {
          return;
        }

        setOverview(overviewResponse.data);
        setRecentActivity(activityResponse.data);
        setLastUpdated(new Date().toISOString());
        setError('');
      } catch (err: any) {
        if (cancelled) {
          return;
        }

        setError(err.response?.data?.message ?? err.message ?? 'Failed to load dashboard data.');
      } finally {
        if (!cancelled && !isBackgroundRefresh) {
          setLoading(false);
        }

        if (!cancelled && isBackgroundRefresh) {
          setRefreshing(false);
        }
      }
    };

    loadDashboard();
    const intervalId = window.setInterval(() => {
      void loadDashboard(true);
    }, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const stats = overview?.stats;
  const riskDistribution = overview?.riskDistribution ?? [];
  const suspiciousClusters = overview?.suspiciousClusters ?? [];
  const topZone = riskDistribution[0];
  const latestActivity = recentActivity[0];

  return (
    <div className="dashboard-page">
      {error ? <div className="card"><p className="muted-copy">{error}</p></div> : null}

      <div className="stats-grid">
        <StatCard
          label="Total Claims"
          value={loading ? '...' : String(stats?.totalClaims ?? 0)}
          trend={loading ? 'Loading' : 'From claims table'}
        />
        <StatCard
          label="Pending Review"
          value={loading ? '...' : String(stats?.pendingClaims ?? 0)}
          trend={loading ? 'Loading' : 'Status: pending_review'}
        />
        <StatCard
          label="Fraud Alerts"
          value={loading ? '...' : String(stats?.fraudAlerts ?? 0)}
          trend={loading ? 'Loading' : 'Open + reviewing'}
          accent="danger"
        />
        <StatCard
          label="Payouts (₹)"
          value={loading ? '...' : formatCompactCurrency(stats?.totalPayouts ?? 0)}
          trend={loading ? 'Loading' : `${stats?.payoutsProcessing ?? 0} in progress`}
        />
        <StatCard
          label="Avg Risk Score"
          value={loading ? '...' : `${Math.round((stats?.averageRiskScore ?? 0) * 100)}%`}
          trend={loading ? 'Loading' : `${stats?.suspiciousClusters ?? 0} active clusters`}
        />
        <StatCard
          label="Claims / Hour"
          value={loading ? '...' : String(stats?.claimsPerHour ?? 0)}
          trend={loading ? 'Loading' : 'Last 24 hours'}
        />
      </div>

      <div className="dashboard-columns">
        <div className="card">
          <div className="card-header">
            <h2>Live Sync Status</h2>
            <span className={`card-chip ${refreshing ? 'live' : ''}`}>{refreshing ? 'Refreshing' : 'Live'}</span>
          </div>
          <ul className="notes-list">
            <li>Source: Prisma-backed admin endpoints fed by <code>Claim</code>, <code>Policy</code>, <code>FraudAlert</code>, and <code>Payout</code>.</li>
            <li>Last sync: {loading ? 'Loading...' : formatAbsoluteTime(lastUpdated)}</li>
            <li>Refresh cadence: every {Math.round(LIVE_REFRESH_INTERVAL_MS / 1000)} seconds.</li>
            <li>Latest event: {latestActivity ? `${latestActivity.title} in ${latestActivity.zone}` : 'No recent activity yet.'}</li>
          </ul>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Database Signals</h2>
            <span className="card-chip">Database-backed</span>
          </div>
          <ul className="endpoint-list">
            <li>Overview: {loading ? 'Loading...' : `${stats?.totalClaims ?? 0} claims, ${stats?.fraudAlerts ?? 0} active alerts, ${stats?.payoutsProcessing ?? 0} payouts in flight.`}</li>
            <li>Activity: {loading ? 'Loading...' : `${recentActivity.length} recent events returned from live tables.`}</li>
            <li>Top risk zone: {topZone ? `${topZone.zone} at ${topZone.percentage}% average risk across ${topZone.claims} claims.` : 'No zone-linked claims yet.'}</li>
            <li>Suspicious clusters: {loading ? 'Loading...' : `${suspiciousClusters.length} active clusters in the latest backend window.`}</li>
          </ul>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h2>Risk Distribution</h2>
            <span className="card-chip">By zone</span>
          </div>
          {riskDistribution.length > 0 ? (
            riskDistribution.map((zone) => (
              <RiskBar key={zone.zone} zone={zone.zone} percentage={zone.percentage} claims={zone.claims} />
            ))
          ) : (
            <p className="muted-copy">No zone-linked claims available yet.</p>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Suspicious Clusters</h2>
            <span className="card-chip">Database-derived</span>
          </div>
          {suspiciousClusters.length > 0 ? (
            suspiciousClusters.map((cluster) => (
              <ClusterItem
                key={cluster.id}
                id={cluster.id}
                location={cluster.location}
                claims={cluster.claims}
                riskScore={cluster.riskScore}
                status={cluster.status}
              />
            ))
          ) : (
            <p className="muted-copy">No suspicious claim clusters detected in the latest window.</p>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Activity Feed</h2>
            <span className="card-chip">Latest events</span>
          </div>
          <div className="activity-list">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <ActivityItem key={`${activity.type}-${activity.id}`} activity={activity} />
              ))
            ) : (
              <p className="muted-copy">No recent admin or claim activity to show yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  accent = 'primary',
}: {
  label: string;
  value: string;
  trend: string;
  accent?: 'primary' | 'danger';
}) {
  return (
    <div className={`stat-card ${accent}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-trend">{trend}</span>
    </div>
  );
}

function RiskBar({ zone, percentage, claims }: DashboardRiskZone) {
  return (
    <div className="risk-row">
      <div className="risk-labels">
        <strong>{zone}</strong>
        <span>{claims} claims</span>
      </div>
      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="risk-score">{percentage}%</span>
    </div>
  );
}

function ClusterItem({ id, location, claims, riskScore, status }: DashboardCluster) {
  return (
    <div className="cluster-card">
      <div className="cluster-top">
        <strong>{id}</strong>
        <span className="card-chip danger">{status}</span>
      </div>
      <p>{location}</p>
      <div className="cluster-meta">
        <span>{claims} claims</span>
        <span>Risk {Math.round(riskScore * 100)}%</span>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: RecentActivity }) {
  return (
    <div className="activity-item">
      <span className={`activity-dot ${activity.severity ?? 'medium'}`} />
      <div>
        <strong>{activity.title}</strong>
        <p>{activity.zone} · {formatRelativeTime(activity.timestamp)}</p>
      </div>
    </div>
  );
}
