type AdminRecord = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  role: string;
};

export type AdminAuthUserResponse = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  role: string;
};

export const buildAdminUser = (admin: AdminRecord): AdminAuthUserResponse => ({
  id: admin.id,
  email: admin.email,
  phone: admin.phone,
  displayName: admin.displayName,
  role: admin.role,
});
