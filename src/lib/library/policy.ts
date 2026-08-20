export type LibraryPolicy = {
  loanDays: number;
  maxOpenLoans: number;
  maxRenewals: number;
};

export const DEFAULT_LIBRARY_POLICY: LibraryPolicy = {
  loanDays: 14,
  maxOpenLoans: 3,
  maxRenewals: 2,
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function getLibraryPolicy(settings: unknown): LibraryPolicy {
  const root =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  const lib =
    root.library && typeof root.library === "object"
      ? (root.library as Record<string, unknown>)
      : {};
  return {
    loanDays: clampInt(lib.loanDays, DEFAULT_LIBRARY_POLICY.loanDays, 1, 90),
    maxOpenLoans: clampInt(
      lib.maxOpenLoans,
      DEFAULT_LIBRARY_POLICY.maxOpenLoans,
      1,
      20,
    ),
    maxRenewals: clampInt(
      lib.maxRenewals,
      DEFAULT_LIBRARY_POLICY.maxRenewals,
      0,
      10,
    ),
  };
}

export function withLibraryPolicy(
  settings: unknown,
  policy: LibraryPolicy,
): Record<string, unknown> {
  const root =
    settings && typeof settings === "object"
      ? { ...(settings as Record<string, unknown>) }
      : {};
  root.library = {
    loanDays: policy.loanDays,
    maxOpenLoans: policy.maxOpenLoans,
    maxRenewals: policy.maxRenewals,
  };
  return root;
}
