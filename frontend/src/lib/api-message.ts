// Shared helper for turning an axios error (or anything else caught from a
// mutation/query) into a user-facing message. Every call site was previously
// copy-pasting this same body with its own fallback string — this is the
// single source of truth now; pass a fallback specific to the action that
// failed.
export function apiMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const candidate = error as {
    response?: { data?: { error?: { message?: string }; message?: string } };
    message?: string;
  };
  return (
    candidate.response?.data?.error?.message ||
    candidate.response?.data?.message ||
    candidate.message ||
    fallback
  );
}
