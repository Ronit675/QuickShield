import AdminPagePlaceholder from '../components/AdminPagePlaceholder';

export default function PricingRisk() {
  return (
    <AdminPagePlaceholder
      title="Pricing and Risk"
      description="Expose pricing strategies, risk multipliers, and ML-derived signals used by premium calculation without changing the rider purchase flow."
      endpoints={[
        'GET /admin/pricing-risk',
        'PATCH /admin/pricing-risk/:id',
        'GET /admin/pricing-risk/model-info',
        'GET /admin/pricing-risk/zones',
      ]}
      notes={[
        'The admin portal should read risk metadata through Nest, not by calling ml-service directly.',
        'Premium calculation remains owned by the existing PremiumService and policy purchase flow.',
      ]}
    />
  );
}
