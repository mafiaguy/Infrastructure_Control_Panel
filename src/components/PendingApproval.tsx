"use client"
import { useNavigate } from "react-router-dom"
import { Clock } from "lucide-react"
import { useAuthStore } from "../store/auth"

export function PendingApproval() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  if (!user) {
    navigate("/")
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="flex items-center justify-center mb-8">
          <Clock className="w-12 h-12 text-yellow-500" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-4">Pending Approval</h2>
        <p className="text-gray-600 text-center mb-6">
          Your account is pending administrator approval. Please contact your administrator for access.
        </p>
        <button
          onClick={handleLogout}
          className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
