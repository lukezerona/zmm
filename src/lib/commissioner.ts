const COMMISSIONER_EMAIL = "luke.zerona@gmail.com";

type CommissionerCandidate = {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export function isCommissionerUser(user: CommissionerCandidate) {
  return (
    user.app_metadata?.role === "commissioner" ||
    user.email?.trim().toLowerCase() === COMMISSIONER_EMAIL
  );
}
