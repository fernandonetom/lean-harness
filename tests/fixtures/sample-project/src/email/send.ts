export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!to.includes("@")) return false;
  return true;
}
