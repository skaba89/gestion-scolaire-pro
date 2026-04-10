import { useAuth } from "@/contexts/AuthContext";
import {
  AppRole,
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissionsForRoles
} from "@/lib/permissions";

export const usePermissions = () => {
  const { roles } = useAuth();

  const can = (permission: Permission): boolean => {
    return hasPermission(roles as AppRole[], permission);
  };

  const canAny = (permissions: Permission[]): boolean => {
    return hasAnyPermission(roles as AppRole[], permissions);
  };

  const canAll = (permissions: Permission[]): boolean => {
    return hasAllPermissions(roles as AppRole[], permissions);
  };

  const permissions = getPermissionsForRoles(roles as AppRole[]);

  return {
    can,
    canAny,
    canAll,
    permissions,
    roles: roles as AppRole[],
  };
};
