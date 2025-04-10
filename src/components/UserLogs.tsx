"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { RefreshCw, AlertTriangle, Clock, Filter, User, Activity } from "lucide-react"
import { useAuthStore } from "../store/auth"
import { Navbar } from "./Navbar"
import type { UserLog } from "../types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api"

export function UserLogs() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const [logs, setLogs] = useState<UserLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("")
  const [resourceFilter, setResourceFilter] = useState<string>("")
  const [actionFilter, setActionFilter] = useState<string>("")

  useEffect(() => {
    if (!user) {
      navigate("/")
      return
    }

    if (user.role !== "admin") {
      navigate("/dashboard")
      return
    }

    loadLogs()
  }, [user, navigate])

  const loadLogs = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await axios.get(`${API_URL}/user-logs`)
      setLogs(response.data.logs)
    } catch (err) {
      console.error("Error loading logs:", err)
      setError("Failed to load logs. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Get unique resources and actions for filtering
  const uniqueResources = [...new Set(logs.map((log) => log.resource))]
  const uniqueActions = [...new Set(logs.map((log) => log.action))]

  // Filter logs based on user input
  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filter === "" ||
      log.username.toLowerCase().includes(filter.toLowerCase()) ||
      log.action.toLowerCase().includes(filter.toLowerCase()) ||
      log.resource.toLowerCase().includes(filter.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(filter.toLowerCase()))

    const matchesResource = resourceFilter === "" || log.resource === resourceFilter
    const matchesAction = actionFilter === "" || log.action === actionFilter

    return matchesFilter && matchesResource && matchesAction
  })

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} onLogout={logout} />

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">User Activity Logs</h2>
              <button
                onClick={loadLogs}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-b border-red-200">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex-1">
                  <label htmlFor="filter" className="block text-sm font-medium text-gray-700">
                    Search
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Filter className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                      placeholder="Search logs..."
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="resourceFilter" className="block text-sm font-medium text-gray-700">
                    Resource
                  </label>
                  <select
                    id="resourceFilter"
                    value={resourceFilter}
                    onChange={(e) => setResourceFilter(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    <option value="">All Resources</option>
                    {uniqueResources.map((resource) => (
                      <option key={resource} value={resource}>
                        {resource}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="actionFilter" className="block text-sm font-medium text-gray-700">
                    Action
                  </label>
                  <select
                    id="actionFilter"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    <option value="">All Actions</option>
                    {uniqueActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4">
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No logs found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Time
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          User
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Action
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Resource
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1 text-gray-400" />
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-1 text-gray-400" />
                              {log.username}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center">
                              <Activity className="h-4 w-4 mr-1 text-gray-400" />
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  log.action.includes("approve")
                                    ? "bg-green-100 text-green-800"
                                    : log.action.includes("reject") || log.action.includes("stop")
                                      ? "bg-red-100 text-red-800"
                                      : log.action.includes("start") || log.action.includes("deploy")
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {log.action}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.resource}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
