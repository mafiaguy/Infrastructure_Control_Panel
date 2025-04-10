"use client"

import { useState, useEffect } from "react"
import { X, Cloud, CheckCircle, AlertTriangle, RotateCw, Play, Square } from "lucide-react"
import type { AWSService } from "../types"
import { useServicesStore } from "../store/services"

interface EcsClusterModalProps {
  clusterName: string
  onClose: () => void
  isReadOnly?: boolean
}

export function EcsClusterModal({ clusterName, onClose, isReadOnly = false }: EcsClusterModalProps) {
  const { loadServices, updateService, forceDeployService, setSelectedEcsCluster } = useServicesStore()
  const [desiredCount, setDesiredCount] = useState<number>(0)
  const [isDeploying, setIsDeploying] = useState<boolean>(false)
  const [deploymentProgress, setDeploymentProgress] = useState<number>(0)
  const [deploymentCompleted, setDeploymentCompleted] = useState<boolean>(false)
  const [deploymentError, setDeploymentError] = useState<string | null>(null)
  const [services, setServices] = useState<AWSService[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Load services when modal opens
  useEffect(() => {
    const fetchServices = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Set the selected cluster in the store
        setSelectedEcsCluster(clusterName)
        // Load services for this cluster
        await loadServices()
        const allServices = useServicesStore.getState().services
        const clusterServices = allServices.filter(
          (service) => service.type === "ecs" && service.cluster === clusterName,
        )
        setServices(clusterServices)
      } catch (err) {
        setError("Failed to load services. Please try again.")
        console.error("Error loading services:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchServices()

    // Clean up when modal closes
    return () => {
      // Reset the selected cluster when modal closes
      setSelectedEcsCluster(null)
    }
  }, [clusterName, loadServices, setSelectedEcsCluster])

  // Filter services based on selected filter type and status
  const filteredServices = services.filter((service) => {
    // First filter by type
    if (filterType === "all") {
      // Then filter by status
      if (statusFilter === "all") return true
      if (statusFilter === "running") return service.status === "running"
      if (statusFilter === "stopped") return service.status === "stopped"
      return true
    }

    if (filterType === "ecs-ec2") {
      if (statusFilter === "all") return service.type === "ecs-ec2" || service.launchType === "EC2"
      if (statusFilter === "running")
        return (service.type === "ecs-ec2" || service.launchType === "EC2") && service.status === "running"
      if (statusFilter === "stopped")
        return (service.type === "ecs-ec2" || service.launchType === "EC2") && service.status === "stopped"
      return service.type === "ecs-ec2" || service.launchType === "EC2"
    }

    if (filterType === "ecs-fargate") {
      if (statusFilter === "all") return service.type === "ecs" && service.launchType === "FARGATE"
      if (statusFilter === "running")
        return service.type === "ecs" && service.launchType === "FARGATE" && service.status === "running"
      if (statusFilter === "stopped")
        return service.type === "ecs" && service.launchType === "FARGATE" && service.status === "stopped"
      return service.type === "ecs" && service.launchType === "FARGATE"
    }

    return true
  })

  const handleDesiredCountChange = async (service: AWSService) => {
    try {
      const updatedService = {
        ...service,
        desiredCount,
        originalCount: desiredCount,
      }
      await updateService(updatedService)
      setDesiredCount(0)
      // Refresh the services
      await loadServices()
      const allServices = useServicesStore.getState().services
      const clusterServices = allServices.filter((s) => s.type === "ecs" && s.cluster === clusterName)
      setServices(clusterServices)
    } catch (err) {
      console.error("Error updating desired count:", err)
    }
  }

  const handleForceDeploy = async (service: AWSService) => {
    setIsDeploying(true)
    setDeploymentProgress(0)
    setDeploymentCompleted(false)
    setDeploymentError(null)

    // Start progress animation
    const progressInterval = setInterval(() => {
      setDeploymentProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 5
      })
    }, 500)

    try {
      // Initiate the force deployment
      await forceDeployService(service)

      // Clear the initial progress animation
      clearInterval(progressInterval)

      // Set a timeout to automatically mark the deployment as completed after 1 minute
      setTimeout(() => {
        setDeploymentProgress(100)

        // Show completion message after progress bar reaches 100%
        setTimeout(() => {
          setDeploymentCompleted(true)
          setIsDeploying(false)

          // Reset completion status after 5 seconds
          setTimeout(() => {
            setDeploymentCompleted(false)
            setDeploymentProgress(0)
          }, 5000)

          // Refresh the services
          loadServices().then(() => {
            const allServices = useServicesStore.getState().services
            const clusterServices = allServices.filter((s) => s.type === "ecs" && s.cluster === clusterName)
            setServices(clusterServices)
          })
        }, 500) // Short delay after progress bar reaches 100%
      }, 60000) // 1 minute timeout
    } catch (err) {
      console.error("Error during force deployment:", err)
      clearInterval(progressInterval)
      setDeploymentProgress(0)
      setDeploymentError("Failed to initiate deployment")
      setIsDeploying(false)
    }
  }

  const handleServiceAction = async (service: AWSService) => {
    try {
      const newStatus = service.status === "running" ? "stopped" : "running"
      const updatedService = {
        ...service,
        status: newStatus as "running" | "stopped",
        desiredCount: newStatus === "stopped" ? 0 : service.originalCount,
      }
      await updateService(updatedService)
      // Refresh the services
      await loadServices()
      const allServices = useServicesStore.getState().services
      const clusterServices = allServices.filter((s) => s.type === "ecs" && s.cluster === clusterName)
      setServices(clusterServices)
    } catch (err) {
      console.error("Error updating service:", err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center">
            <Cloud className="h-5 w-5 mr-2 text-blue-500" />
            {clusterName} Services
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" disabled={isDeploying}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md">
              <p className="text-red-700">{error}</p>
            </div>
          ) : services.length === 0 ? (
            <div className="bg-yellow-50 p-4 rounded-md">
              <p className="text-yellow-700">No services found in this cluster.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredServices.map((service) => (
                <div key={service.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-gray-500">
                          <Cloud className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{service.name}</h3>
                          <p className="text-sm text-gray-500">
                            Type: ECS Service
                            {service.launchType && (
                              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-100">
                                {service.launchType}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      {service.status === "running" ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Current Desired Count: {service.desiredCount}</p>
                      <div className="flex space-x-2 mb-3">
                        <input
                          type="number"
                          min="0"
                          value={desiredCount}
                          onChange={(e) => setDesiredCount(Number.parseInt(e.target.value, 10))}
                          className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="Count"
                          disabled={isDeploying || isReadOnly}
                        />
                        <button
                          onClick={() => handleDesiredCountChange(service)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isDeploying || isReadOnly}
                        >
                          Update
                        </button>
                      </div>

                      <div className="mb-2">
                        <button
                          onClick={() => handleForceDeploy(service)}
                          disabled={isDeploying || isReadOnly}
                          className="w-full inline-flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCw className={`h-4 w-4 mr-2 ${isDeploying ? "animate-spin" : ""}`} />
                          Force Deployment
                        </button>
                      </div>

                      {/* Deployment Progress Bar */}
                      {isDeploying && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                              style={{ width: `${deploymentProgress}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-gray-500">
                            <span>Deploying...</span>
                            <span>{deploymentProgress}%</span>
                          </div>
                        </div>
                      )}

                      {/* Deployment Completed Message */}
                      {deploymentCompleted && (
                        <div className="mt-2 p-2 bg-green-50 rounded-md border border-green-200">
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                            <span className="text-sm text-green-700">Deployment completed successfully</span>
                          </div>
                        </div>
                      )}

                      {/* Deployment Error Message */}
                      {deploymentError && (
                        <div className="mt-2 p-2 bg-red-50 rounded-md border border-red-200">
                          <div className="flex items-center">
                            <AlertTriangle className="h-4 w-4 text-red-500 mr-2" />
                            <span className="text-sm text-red-700">{deploymentError}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleServiceAction(service)}
                        className={`flex-1 inline-flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                          service.status === "running"
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-green-600 hover:bg-green-700"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        disabled={isDeploying || isReadOnly}
                      >
                        {service.status === "running" ? (
                          <>
                            <Square className="h-4 w-4 mr-2" />
                            Stop Service
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Service
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
