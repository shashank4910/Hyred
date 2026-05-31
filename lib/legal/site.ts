/** Public legal / contact constants — override via env where noted. */
export const PRODUCT_NAME = 'Hyred';
export const LEGAL_LAST_UPDATED = '31 May 2026';
export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? 'privacy@hyred.in';
export const LEGAL_OPERATOR_NAME =
  process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME ?? 'Hyred (operated from India)';
