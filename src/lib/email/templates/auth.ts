export function buildVerifyEmailTemplate(token: string): { subject: string; body: string } {
  return {
    subject: "Verify your JobScout24 account",
    body: `Use this verification token: ${token}`
  };
}

export function buildResetPasswordTemplate(token: string): { subject: string; body: string } {
  return {
    subject: "Reset your JobScout24 password",
    body: `Use this password reset token: ${token}`
  };
}
