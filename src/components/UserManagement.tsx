"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { CheckCircle, XCircle, RefreshCw, UserCheck, UserX, AlertTriangle, Trash2, AlertCircle } from "lucide-react"
import { useAuthStore } from "../store/auth"
import { Navbar } from "./Navbar"
import { InviteUserModal } from "./InviteUserModal"
import { InvitationsList } from "./InvitationsList"
import type { User, ApprovalRequest } from "../types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api"

export function UserManagement() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const [users, setUsers] = useState<Omit<User, "password">[]>([])
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"users" | "pending" | "invitations">("pending")
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Add this state for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false)
  const [userToDelete, setUserToDelete] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      navigate("/")
      return
    }

    if (user.role !== "admin") {
      navigate("/dashboard")
      return
    }

    loadData()
  }, [user, navigate])

  const loadData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [usersResponse, requestsResponse] = await Promise.all([
        axios.get(`${API_URL}/users`),
        axios.get(`${API_URL}/approval-requests`),
      ])

      setUsers(usersResponse.data.users)
      setPendingRequests(requestsResponse.data.requests)
    } catch (err) {
      console.error("Error loading data:", err)
      setError("Failed to load data. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveReject = async (requestId: number, status: "approved" | "rejected") => {
    if (!user) return

    setProcessingId(requestId)

    try {
      await axios.post(`${API_URL}/approval-requests/${requestId}`, {
        status,
        reviewerId: user.id,
      })

      // Log the action
      await useAuthStore
        .getState()
        .logAction(
          status === "approved" ? "approve_user" : "reject_user",
          "user_management",
          `${status === "approved" ? "Approved" : "Rejected"} user request #${requestId}`,
        )

      // Reload data
      await loadData()
    } catch (err) {
      console.error(`Error ${status} request:`, err)
      setError(`Failed to ${status} request. Please try again.`)
    } finally {
      setProcessingId(null)
    }
  }

  // Add this function to handle user deletion
  const handleDeleteUser = async (userId: number) => {
    setUserToDelete(userId)
    setShowDeleteConfirm(true)
    setDeleteError(null)
  }

  // Add this function to confirm user deletion
  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await useAuthStore.getState().deleteUser(userToDelete)
      setShowDeleteConfirm(false)
      setUserToDelete(null)
      // Reload users after deletion
      await loadData()
    } catch (err) {
      console.error("Error deleting user:", err)
      if (err instanceof Error) {
        setDeleteError(err.message)
      } else {
        setDeleteError("Failed to delete user")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} onLogout={logout} />

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  className={`px-6 py-4 text-sm font-medium ${
                    activeTab === "pending"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  onClick={() => setActiveTab("pending")}
                >
                  Pending Approvals
                  {pendingRequests.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
                <button
                  className={`px-6 py-4 text-sm font-medium ${
                    activeTab === "users"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  onClick={() => setActiveTab("users")}
                >
                  All Users
                </button>
                <button
                  className={`px-6 py-4 text-sm font-medium ${
                    activeTab === "invitations"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  onClick={() => setActiveTab("invitations")}
                >
                  Invitations
                </button>
                <div className="ml-auto px-4 py-2">
                  <button
                    onClick={loadData}
                    disabled={isLoading}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
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
              {isLoading && activeTab !== "invitations" ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : activeTab === "pending" ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Pending Approval Requests</h3>

                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No pending approval requests</div>
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
                              Requested At
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
                          {pendingRequests.map((request) => (
                            <tr key={request.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {request.username}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{request.email}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                  {request.requestedRole}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(request.requestedAt).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleApproveReject(request.id, "approved")}
                                    disabled={processingId === request.id}
                                    className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                                  >
                                    <UserCheck className="h-4 w-4 mr-1" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleApproveReject(request.id, "rejected")}
                                    disabled={processingId === request.id}
                                    className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                  >
                                    <UserX className="h-4 w-4 mr-1" />
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : activeTab === "users" ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">All Users</h3>

                  {users.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No users found</div>
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
                              Status
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              Last Login
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
                          {users.map((user) => (
                            <tr key={user.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {user.username}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span
                                  className={`px-2 py-1 text-xs rounded-full ${
                                    user.role === "admin"
                                      ? "bg-purple-100 text-purple-800"
                                      : user.role === "write"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {user.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.isApproved ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.username !== "admin" && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Delete User"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <InvitationsList onInviteUser={() => setShowInviteModal(true)} />
              )}
            </div>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InviteUserModal
          onClose={() => setShowInviteModal(false)}
          onInviteSuccess={() => {
            setActiveTab("invitations")
          }}
        />
      )}

      {showDeleteConfirm && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-200 flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">Confirm User Deletion</h2>
            </div>

            <div className="p-4">
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>

              {deleteError && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{deleteError}</div>}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteUser}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete User"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
