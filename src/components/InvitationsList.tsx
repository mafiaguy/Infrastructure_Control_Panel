"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Trash2, AlertTriangle, Mail } from "lucide-react"
import { useAuthStore } from "../store/auth"
import type { UserInvitation } from "../types"

interface InvitationsListProps {
  onInviteUser: () => void
}

export function InvitationsList({ onInviteUser }: InvitationsListProps) {
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const getInvitations = useAuthStore((state) => state.getInvitations)
  const deleteInvitation = useAuthStore((state) => state.deleteInvitation)

  const loadInvitations = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getInvitations()
      setInvitations(data)
    } catch (err) {
      console.error("Failed to load invitations:", err)
      setError("Failed to load invitations. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadInvitations()
  }, [])

  const handleDeleteInvitation = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteInvitation(id)
      // Remove the deleted invitation from the list
      setInvitations((prev) => prev.filter((inv) => inv.id !== id))
    } catch (err) {
      console.error("Failed to delete invitation:", err)
      setError("Failed to delete invitation. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">User Invitations</h3>
        <div className="flex space-x-2">
          <button
            onClick={loadInvitations}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={onInviteUser}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <Mail className="h-4 w-4 mr-2" />
            Invite User
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No pending invitations</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Username
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Role
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Invited By
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Expires
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invitation.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invitation.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          invitation.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : invitation.role === "write"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {invitation.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invitation.inviterUsername}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`${isExpired(invitation.expiresAt) ? "text-red-600 font-medium" : "text-gray-500"}`}
                      >
                        {new Date(invitation.expiresAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          invitation.status === "accepted"
                            ? "bg-green-100 text-green-800"
                            : invitation.status === "expired" || isExpired(invitation.expiresAt)
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {invitation.status === "pending" && isExpired(invitation.expiresAt)
                          ? "expired"
                          : invitation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => handleDeleteInvitation(invitation.id)}
                        disabled={deletingId === invitation.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
