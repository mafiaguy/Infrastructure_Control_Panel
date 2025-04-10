import type React from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { Login } from "./components/Login"
import { Register } from "./components/Register"
import { Dashboard } from "./components/Dashboard"
import { PendingApproval } from "./components/PendingApproval"
import { UserManagement } from "./components/UserManagement"
import { UserLogs } from "./components/UserLogs"
import { LogGroups } from "./components/LogGroups"
import { AcceptInvitation } from "./components/AcceptInvitation"
import { useAuthStore } from "./store/auth"

function ProtectedRoute({
  children,
  requiredRole = null,
}: {
  children: React.ReactNode
  requiredRole?: "admin" | "write" | "readonly" | null
}) {
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (!user.isApproved) {
    return <Navigate to="/pending" replace />
  }

  // If a specific role is required, check if the user has it
  if (requiredRole && user.role !== requiredRole && !(requiredRole === "write" && user.role === "admin")) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-management"
          element={
            <ProtectedRoute requiredRole="admin">
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-logs"
          element={
            <ProtectedRoute requiredRole="admin">
              <UserLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/log-groups"
          element={
            <ProtectedRoute>
              <LogGroups />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
