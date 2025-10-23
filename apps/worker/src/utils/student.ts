/**
 * Generate student number from email address
 * Takes the first 6 characters of the email and converts them to uppercase
 * @param email - The email address to generate student number from
 * @returns The generated student number (e.g., "tanaka@example.com" -> "TANAKA")
 */
export function generateStudentNumber(email: string): string {
  return email.substring(0, 6).toUpperCase();
}
