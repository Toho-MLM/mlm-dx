export function initialAdminRegistrationError(
  requestedEmail: string,
  configuredEmail: string | undefined,
): 'SETUP_NOT_CONFIGURED' | 'INITIAL_ADMIN_EMAIL_MISMATCH' | null {
  const allowedEmail = configuredEmail?.trim().toLowerCase();
  if (!allowedEmail) return 'SETUP_NOT_CONFIGURED';
  if (requestedEmail.trim().toLowerCase() !== allowedEmail) return 'INITIAL_ADMIN_EMAIL_MISMATCH';
  return null;
}
