/**
 * SuperAdminTenants — Legacy redirect.
 * This page was tenant-scoped and used the old Supabase client.
 * SUPER_ADMIN tenants management is now at /super-admin (platform level).
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SuperAdminTenants = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/super-admin", { replace: true });
  }, [navigate]);

  return null;
};

export default SuperAdminTenants;
