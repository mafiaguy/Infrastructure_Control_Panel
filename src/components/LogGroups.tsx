"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs"
import { RefreshCw, AlertTriangle, Search, ExternalLink, Filter } from "lucide-react"
import { useAuthStore } from "../store/auth"
import { useServicesStore } from "../store/services"
import { Navbar } from "./Navbar"

interface LogGroup {
  logGroupName: string
  arn: string
  creationTime?: number
  storedBytes?: number
  retentionInDays?: number
  region: string
}

const createAWSClients = (region: string) => {
  const config = { region }
  return {
    logs: new CloudWatchLogsClient(config),
  }
}

export function LogGroups() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const { availableRegions, services } = useServicesStore()
  const navigate = useNavigate()

  const [logGroups, setLogGroups] = useState<LogGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRegion, setSelectedRegion] = useState<string>("us-east-1")

  useEffect(() => {
    if (!user) {
      navigate("/")
      return
    }

    loadLogGroups()
  }, [user, navigate, selectedRegion])

  const loadLogGroups = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const clients = createAWSClients(selectedRegion)
      const response = await clients.logs.send(new DescribeLogGroupsCommand({}))

      // Get all ECS services from the services store
      const ecsServices = services.filter((service) => service.type === "ecs")

      if (response.logGroups && response.logGroups.length > 0) {
        const allLogGroups = response.logGroups.map((group) => ({
          ...group,
          region: selectedRegion,
        }))

        setLogGroups(allLogGroups)

        // Log the action
        await useAuthStore
          .getState()
          .logAction("view_log_groups", "cloudwatch", `Viewed ${allLogGroups.length} log groups in ${selectedRegion}`)
      } else {
        throw new Error("No log groups found")
      }
    } catch (error) {
      console.error("Failed to load log groups:", error)
      setError("Failed to load log groups. Using mock data instead.")

      // Generate mock data based on actual services in the store
      const mockLogGroups: LogGroup[] = []

      // Create mock log groups for each ECS service
      services.forEach((service, index) => {
        if (service.type === "ecs") {
          // Add main service log group
          mockLogGroups.push({
            logGroupName: `/ecs/${service.name}`,
            arn: `arn:aws:logs:${selectedRegion}:123456789012:log-group:/ecs/${service.name}:*`,
            creationTime: Date.now() - (30 - index) * 24 * 60 * 60 * 1000,
            storedBytes: 1024 * 1024 * (5 + index),
            retentionInDays: 30,
            region: selectedRegion,
          })

          // Add task definition log group
          mockLogGroups.push({
            logGroupName: `/aws/ecs/containerinsights/${service.name}-cluster/performance`,
            arn: `arn:aws:logs:${selectedRegion}:123456789012:log-group:/aws/ecs/containerinsights/${service.name}-cluster/performance:*`,
            creationTime: Date.now() - (25 - index) * 24 * 60 * 60 * 1000,
            storedBytes: 1024 * 1024 * (3 + index),
            retentionInDays: 14,
            region: selectedRegion,
          })
        }
      })

      // Add some generic ECS log groups if we don't have any services
      if (mockLogGroups.length === 0) {
        mockLogGroups.push(
          {
            logGroupName: "/ecs/web-app-service",
            arn: `arn:aws:logs:${selectedRegion}:123456789012:log-group:/ecs/web-app-service:*`,
            creationTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
            storedBytes: 1024 * 1024 * 5,
            retentionInDays: 30,
            region: selectedRegion,
          },
          {
            logGroupName: "/ecs/api-service",
            arn: `arn:aws:logs:${selectedRegion}:123456789012:log-group:/ecs/api-service:*`,
            creationTime: Date.now() - 15 * 24 * 60 * 60 * 1000,
            storedBytes: 1024 * 1024 * 8,
            retentionInDays: 14,
            region: selectedRegion,
          },
          {
            logGroupName: "/aws/ecs/containerinsights/main-cluster/performance",
            arn: `arn:aws:logs:${selectedRegion}:123456789012:log-group:/aws/ecs/containerinsights/main-cluster/performance:*`,
            creationTime: Date.now() - 60 * 24 * 60 * 60 * 1000,
            storedBytes: 1024 * 1024 * 15,
            retentionInDays: 90,
            region: selectedRegion,
          },
        )
      }

      setLogGroups(mockLogGroups)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredLogGroups = logGroups.filter((group) =>
    group.logGroupName?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return "N/A"

    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    if (bytes === 0) return "0 Bytes"

    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A"
    return new Date(timestamp).toLocaleString()
  }

  const getAwsConsoleUrl = (logGroup: LogGroup) => {
    return `https://${logGroup.region}.console.aws.amazon.com/cloudwatch/home?region=${logGroup.region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroup.logGroupName || "")}`
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} onLogout={logout} />

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">ECS Log Groups</h2>
              <div className="flex space-x-2">
                <div className="relative">
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableRegions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  <Filter className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
                <button
                  onClick={loadLogGroups}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-yellow-50 border-b border-yellow-200">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                  <p className="text-sm text-yellow-700">{error}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  placeholder="Search log groups..."
                />
              </div>
            </div>

            <div className="p-4">
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : filteredLogGroups.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No log groups found</div>
              ) : (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">ECS Service Log Groups</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Log Group Name
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Service
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Created
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Size
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Retention
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            Region
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
                        {filteredLogGroups.map((logGroup) => {
                          // Extract service name from log group name
                          const serviceName = logGroup.logGroupName?.includes("/ecs/")
                            ? logGroup.logGroupName.split("/ecs/")[1]
                            : logGroup.logGroupName?.includes("containerinsights/")
                              ? logGroup.logGroupName
                                  .split("containerinsights/")[1]
                                  .split("/")[0]
                                  .replace("-cluster", "")
                              : "Unknown"

                          return (
                            <tr key={logGroup.arn}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {logGroup.logGroupName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                  {serviceName}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(logGroup.creationTime)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatBytes(logGroup.storedBytes)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {logGroup.retentionInDays ? `${logGroup.retentionInDays} days` : "Never expire"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{logGroup.region}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <a
                                  href={getAwsConsoleUrl(logGroup)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-900"
                                  title="Open in AWS Console"
                                >
                                  <ExternalLink className="h-5 w-5" />
                                </a>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
