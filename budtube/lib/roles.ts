export function isStaff(role?: string | null): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export function isOwner(role?: string | null): boolean {
  return role === "OWNER";
}
