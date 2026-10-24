export function isValidEmail(value: string): boolean {
  const email = value.trim();
  const parts = email.split("@");
  if (email.length > 254 || parts.length !== 2) return false;

  const [local, domain] = parts;
  // Match the unquoted mailbox and DNS label rules enforced by user_service.rs.
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".")
    || local.includes("..") || /[^a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]/.test(local)) return false;

  return domain.includes(".") && domain.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-")
    && !/[^a-zA-Z0-9-]/.test(label));
}
