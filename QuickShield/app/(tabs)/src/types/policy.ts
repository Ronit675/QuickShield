export default interface PolicyClaim {
  payoutAmount: number;
  triggerType: string;
  status: string;
  createdAt: string;
}

export default interface PolicySummary {
  id: string;
  status: string;
  coveragePerDay: number;
  weeklyPremium: number;
  weekStartDate: string;
  weekEndDate: string;
  claims?: PolicyClaim[];
}
