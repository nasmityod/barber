export type AdminUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string;
};

// Cloudflare deployment mode uses the business owner identity directly.
export const ADMIN_USER: AdminUser = {
  userId: "cloudflare-public-admin",
  displayName: "Administrador",
  email: "admin@corteza.studio",
  fullName: "Administrador",
};
