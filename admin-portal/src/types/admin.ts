export type AdminRole =
  | 'ADMIN'
  | 'FRAUD_REVIEWER'
  | 'CLAIMS_OFFICER'
  | 'ANALYTICS_LEAD'
  | 'SUPERADMIN';

export type AdminUser = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  role: AdminRole;
};

export type AdminSettingsRecord = AdminUser & {
  isActive: boolean;
  lastLoginAt: string | null;
  loginAttempts: number;
  canViewClaims: boolean;
  canApproveClaims: boolean;
  canManageAdmins: boolean;
  canViewAnalytics: boolean;
  canManagePricing: boolean;
  createdAt: string;
};

export type LayoutFilters = {
  dateRange: 'today' | 'week' | 'month' | 'custom';
  zone: string;
  disruptionType: string;
  searchQuery: string;
};

export type DashboardStats = {
  totalClaims: number;
  pendingClaims: number;
  fraudAlerts: number;
  payoutsProcessing: number;
  totalPayouts: number;
  suspiciousClusters: number;
  averageRiskScore: number;
  claimsPerHour: number;
};

export type DashboardRiskZone = {
  zone: string;
  percentage: number;
  claims: number;
};

export type DashboardCluster = {
  id: string;
  location: string;
  claims: number;
  riskScore: number;
  status: 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export type DashboardOverviewResponse = {
  stats: DashboardStats;
  riskDistribution: DashboardRiskZone[];
  suspiciousClusters: DashboardCluster[];
};

export type RecentActivity = {
  id: string;
  type: 'claim' | 'alert' | 'payout';
  title: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  zone: string;
};

export type FraudAlertItem = {
  id: string;
  claimId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  reasons: string[];
  claimAmount: number;
  zone: string;
  disruptionType: string;
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  resolution?: string | null;
  reviewedBy?: string;
};

export type PayoutStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type PayoutItem = {
  id: string;
  claimId: string;
  amount: number;
  status: PayoutStatus;
  method: string;
  externalReference: string | null;
  processedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  processedBy: string | null;
  zone: string;
  triggerType: string;
  claimStatus: string;
  claimPayoutAmount: number;
};

export type ClaimStatus = 'auto_approved' | 'pending_review' | 'paid';

export type ClaimItem = {
  id: string;
  policyId: string;
  userId: string;
  userName: string;
  userPhone: string | null;
  userEmail: string | null;
  zone: string;
  city: string | null;
  triggerType: string;
  disruptedHours: number;
  payoutAmount: number;
  status: ClaimStatus;
  claimSessionKey: string | null;
  riskScore: number;
  isSuspicious: boolean;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  fraudAlert: { severity: string; status: string } | null;
  payout: { id: string; status: string } | null;
};

export type ZoneItem = {
  id: string;
  code: string;
  name: string;
  city: string;
  isActive: boolean;
  baseRiskScore: number;
  alertThreshold: number;
  activePoliciesCount: number;
  totalClaims: number;
  suspiciousClaimsCount: number;
  totalPayoutAmount: number;
  averageRiskScore: number;
  disruptionsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ZoneDisruptionItem = {
  id: string;
  triggerType: string;
  startTime: string;
  endTime: string | null;
  createdAt: string;
};

export type ZoneClaimItem = {
  id: string;
  userName: string;
  triggerType: string;
  payoutAmount: number;
  status: string;
  riskScore: number;
  isSuspicious: boolean;
  createdAt: string;
};
