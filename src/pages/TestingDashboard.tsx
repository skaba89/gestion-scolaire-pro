/**
 * Testing Dashboard Page
 * Provides access to all testing and demo components
 * Useful for QA and validation testing
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ZodValidationDemo from "@/components/testing/ZodValidationDemo";

export default function TestingDashboard() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth/login");
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🧪 Testing Dashboard</h1>
          <p className="text-lg text-gray-600">
            Interactive components to test and validate improvements
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="zod" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="zod">Zod Validation</TabsTrigger>
            <TabsTrigger value="zustand" disabled>
              Zustand (Already Tested)
            </TabsTrigger>
            <TabsTrigger value="api" disabled>
              API Testing
            </TabsTrigger>
            <TabsTrigger value="database" disabled>
              Database
            </TabsTrigger>
          </TabsList>

          {/* Zod Validation Tab */}
          <TabsContent value="zod" className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <ZodValidationDemo />
            </div>
          </TabsContent>

          {/* Zustand Tab - Disabled (already tested) */}
          <TabsContent value="zustand" className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded p-6 text-center">
              <p className="text-gray-700">Zustand integration already tested. Check Redux DevTools.</p>
            </div>
          </TabsContent>

          {/* API Testing Tab - Coming Soon */}
          <TabsContent value="api" className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded p-6 text-center">
              <p className="text-gray-700">API Testing coming soon</p>
            </div>
          </TabsContent>

          {/* Database Tab - Coming Soon */}
          <TabsContent value="database" className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded p-6 text-center">
              <p className="text-gray-700">Database testing coming soon</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Info Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2">✅ Phase 4a Complete</h3>
            <p className="text-sm text-gray-600">
              Zustand integration verified with Redux DevTools. Sidebar and theme switching working.
            </p>
          </div>

          <div className="bg-white rounded border border-blue-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2">🧪 Phase 4b Current</h3>
            <p className="text-sm text-gray-600">
              Testing Zod validation. Use the demo above to test invalid/valid data.
            </p>
          </div>

          <div className="bg-white rounded border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2">⏭️ Phase 4c Next</h3>
            <p className="text-sm text-gray-600">
              Deploy database optimization indexes to Supabase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
