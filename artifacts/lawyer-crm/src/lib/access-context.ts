import { createContext, useContext } from "react";
import type { TeamMember } from "@workspace/api-client-react";

export type AccessValue = {
  member: TeamMember;
  isAdmin: boolean;
  canManageStatus: boolean;
  canDeleteStages: boolean;
};

export const AccessContext = createContext<AccessValue | null>(null);

export function useAccess() {
  const access = useContext(AccessContext);
  if (!access) throw new Error("useAccess must be used inside an authorized CRM route");
  return access;
}
