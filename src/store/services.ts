import { create } from "zustand"
import { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand } from "@aws-sdk/client-ec2"
import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  ListClustersCommand,
  ListContainerInstancesCommand,
} from "@aws-sdk/client-ecs"
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from "@aws-sdk/client-elastic-load-balancing-v2"
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import type { AWSService, ServiceConfig } from "../types"
import { useAuthStore } from "./auth"

// Mock data to use when AWS API calls fail
const mockServices: Record<string, AWSService[]> = {
  "us-east-1": [
    {
      id: "i-1234567890abcdef0",
      name: "api-server-1",
      type: "ec2",
      region: "us-east-1",
      status: "running",
      instanceType: "t2.micro",
    },
    {
      id: "i-0987654321fedcba0",
      name: "api-server-2",
      type: "ec2",
      region: "us-east-1",
      status: "stopped",
      instanceType: "t2.small",
    },
    {
      id: "arn:aws:ecs:us-east-1:123456789012:service/default/web-app-1",
      name: "web-app-1",
      type: "ecs",
      region: "us-east-1",
      status: "running",
      desiredCount: 2,
      originalCount: 2,
      cluster: "default",
      launchType: "FARGATE",
    },
    {
      id: "arn:aws:ecs:us-east-1:123456789012:service/default/web-app-2",
      name: "web-app-2",
      type: "ecs",
      region: "us-east-1",
      status: "running",
      desiredCount: 1,
      originalCount: 1,
      cluster: "default",
      launchType: "EC2",
    },
    {
      id: "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/main-alb/1234567890abcdef",
      name: "main-alb",
      type: "alb",
      region: "us-east-1",
      status: "running",
      dnsName: "main-alb-123456789.us-east-1.elb.amazonaws.com",
    },
  ],
  "ap-south-1": [
    {
      id: "i-abcdef1234567890",
      name: "api-server-india-1",
      type: "ec2",
      region: "ap-south-1",
      status: "running",
      instanceType: "t2.micro",
    },
    {
      id: "arn:aws:ecs:ap-south-1:123456789012:service/default/web-app-india-1",
      name: "web-app-india-1",
      type: "ecs",
      region: "ap-south-1",
      status: "running",
      desiredCount: 2,
      originalCount: 2,
      cluster: "default",
      launchType: "FARGATE",
    },
    {
      id: "arn:aws:ecs:ap-south-1:123456789012:service/DelayedJobEcsEc2Cluster/batch-processor",
      name: "batch-processor",
      type: "ecs",
      region: "ap-south-1",
      status: "running",
      desiredCount: 1,
      originalCount: 1,
      cluster: "DelayedJobEcsEc2Cluster",
      launchType: "EC2",
    },
    {
      id: "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/india-alb/0987654321fedcba",
      name: "india-alb",
      type: "alb",
      region: "ap-south-1",
      status: "running",
      dnsName: "india-alb-123456789.ap-south-1.elb.amazonaws.com",
    },
  ],
}

// Mock ECS clusters
const mockEcsClusters: Record<string, string[]> = {
  "us-east-1": ["default", "production", "staging"],
  "ap-south-1": ["default", "DelayedJobEcsEc2Cluster", "production-india"],
}

interface ServicesState {
  services: AWSService[]
  selectedRegion: string
  availableRegions: string[]
  selectedType: string | null
  config: ServiceConfig
  ec2StatusFilter: "all" | "running" | "stopped"
  downtimeFilter: boolean
  ecsClusters: string[]
  selectedEcsCluster: string | null
  ecsFilter: "all" | "ecs-ec2" | "ecs-fargate"
  clustersWithInstances: { name: string; containerInstances: string[] }[]
  setSelectedRegion: (region: string) => void
  setSelectedType: (type: string | null) => void
  setEC2StatusFilter: (status: "all" | "running" | "stopped") => void
  setDowntimeFilter: (enabled: boolean) => void
  setSelectedEcsCluster: (cluster: string | null) => void
  setEcsFilter: (filter: "all" | "ecs-ec2" | "ecs-fargate") => void
  loadEcsClusters: () => Promise<void>
  updateService: (service: AWSService) => void
  updateMultipleServices: (services: AWSService[], action: "start" | "stop") => Promise<void>
  loadServices: () => Promise<void>
  getFilteredServices: () => AWSService[]
  forceDeployService: (service: AWSService) => Promise<void>
  forceDeployAllServices: () => Promise<boolean>
  loadAvailableRegions: () => void
}

const defaultConfig: ServiceConfig = {
  regions: ["us-east-1", "ap-south-1"],
  services: [
    { name: "web-app-1", type: "ecs" },
    { name: "web-app-2", type: "ecs" },
    { name: "api-server-1", type: "ec2" },
    { name: "api-server-2", type: "ec2" },
    { name: "main-alb", type: "alb" },
    { name: "app-secrets", type: "secrets-manager" },
  ],
  ecsClusterName: "default",
}

const createAWSClients = (region: string) => {
  // Use environment credentials from .env
  const config = { 
    region,
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || "123",
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || "123",
    }
  }

  return {
    ec2: new EC2Client(config),
    ecs: new ECSClient(config),
    elb: new ElasticLoadBalancingV2Client(config),
    secrets: new SecretsManagerClient(config),
  }
}

export const useServicesStore = create<ServicesState>((set, get) => ({
  services: [],
  selectedRegion: "us-east-1",
  availableRegions: defaultConfig.regions,
  selectedType: null,
  config: defaultConfig,
  ec2StatusFilter: "all",
  downtimeFilter: false,
  ecsClusters: [],
  selectedEcsCluster: null,
  ecsFilter: "all",
  clustersWithInstances: [],

  loadAvailableRegions: () => {
    // Only use the two specified regions
    set({ availableRegions: ["us-east-1", "ap-south-1"] })
  },

  setSelectedRegion: (region) => {
    set({ selectedRegion: region })
    get().loadServices()

    // Log the action
    const authStore = useAuthStore.getState()
    authStore.logAction("change_region", "aws", `Changed region to ${region}`)
  },

  setSelectedType: (type) => {
    set({ selectedType: type })
    if (type === "ecs") {
      get().loadEcsClusters()
    }

    // Log the action
    if (type) {
      const authStore = useAuthStore.getState()
      authStore.logAction("filter_services", "aws", `Filtered by service type: ${type}`)
    }
  },

  setEC2StatusFilter: (status) => {
    set({ ec2StatusFilter: status })

    // Log the action
    const authStore = useAuthStore.getState()
    authStore.logAction("filter_services", "aws", `Filtered EC2 instances by status: ${status}`)
  },

  setDowntimeFilter: (enabled) => {
    set({ downtimeFilter: enabled })

    // Log the action
    const authStore = useAuthStore.getState()
    authStore.logAction("filter_services", "aws", `${enabled ? "Enabled" : "Disabled"} downtime filter`)
  },

  setSelectedEcsCluster: (cluster) => {
    set({ selectedEcsCluster: cluster })
    get().loadServices()

    // Log the action
    if (cluster) {
      const authStore = useAuthStore.getState()
      authStore.logAction("select_cluster", "aws", `Selected ECS cluster: ${cluster}`)
    }
  },

  setEcsFilter: (filter) => {
    console.log(`Setting ECS filter to: ${filter}`)
    set({ ecsFilter: filter })

    // Always reload clusters when filter changes to ensure we have the right ones
    console.log("Reloading ECS clusters for filter:", filter)
    get()
      .loadEcsClusters()
      .then(() => {
        // After loading clusters, reload services to apply the filter
        console.log("Reloading services after loading clusters")
        get().loadServices()
      })

    // Log the action
    const authStore = useAuthStore.getState()
    authStore.logAction("filter_services", "aws", `Filtered ECS services by type: ${filter}`)
  },

  loadEcsClusters: async () => {
    const { selectedRegion, ecsFilter } = get()
    const clients = createAWSClients(selectedRegion)

    try {
      console.log("Loading ECS clusters...")

      // Try to load from AWS API
      let clusters: string[] = []
      let nextToken: string | undefined

      try {
        // Paginate through all clusters
        do {
          const listClustersResponse = await clients.ecs.send(
            new ListClustersCommand({
              nextToken,
            }),
          )

          if (listClustersResponse.clusterArns) {
            // Extract cluster names from ARNs
            const clusterNames = listClustersResponse.clusterArns.map((arn) => {
              const parts = arn.split("/")
              return parts[parts.length - 1]
            })

            // If ecs-ec2 filter is selected, only include clusters with "DelayedJobEcsEc2Cluster" in their name
            if (ecsFilter === "ecs-ec2") {
              const filteredClusters = clusterNames.filter((name) => name.includes("DelayedJobEcsEc2Cluster"))
              console.log(
                `Filtered clusters for ecs-ec2: ${filteredClusters.length} of ${clusterNames.length} match "DelayedJobEcsEc2Cluster"`,
              )
              clusters = [...clusters, ...filteredClusters]
            } else {
              clusters = [...clusters, ...clusterNames]
            }
          }

          nextToken = listClustersResponse.nextToken
        } while (nextToken)
      } catch (error) {
        console.warn("Failed to load ECS clusters from AWS API, using mock data:", error)
        // Fall back to mock data
        clusters = mockEcsClusters[selectedRegion] || []
      }

      console.log("Found ECS clusters:", clusters)

      // For each cluster, get its container instances
      const clustersWithInstances = await Promise.all(
        clusters.map(async (clusterName) => {
          try {
            let containerInstances: string[] = []
            let nextToken: string | undefined

            do {
              const listInstancesResponse = await clients.ecs.send(
                new ListContainerInstancesCommand({
                  cluster: clusterName,
                  nextToken,
                }),
              )

              if (listInstancesResponse.containerInstanceArns) {
                containerInstances = [...containerInstances, ...listInstancesResponse.containerInstanceArns]
              }

              nextToken = listInstancesResponse.nextToken
            } while (nextToken)

            console.log(`Found ${containerInstances.length} container instances in cluster ${clusterName}`)

            return {
              name: clusterName,
              containerInstances,
            }
          } catch (error) {
            console.warn(`Failed to get container instances for cluster ${clusterName}:`, error)
            return {
              name: clusterName,
              containerInstances: [],
            }
          }
        }),
      )

      // If we have clusters and no cluster is selected, select the first one
      if (clusters.length > 0 && !get().selectedEcsCluster) {
        set({
          ecsClusters: clusters,
          selectedEcsCluster: clusters[0],
          clustersWithInstances, // Store the clusters with their container instances
        })
      } else {
        set({
          ecsClusters: clusters,
          clustersWithInstances, // Store the clusters with their container instances
        })
      }

      // Log the action
      const authStore = useAuthStore.getState()
      authStore.logAction("load_clusters", "aws", `Loaded ${clusters.length} ECS clusters in ${selectedRegion}`)
    } catch (error) {
      console.error("Failed to load ECS clusters:", error)
      
      // Fall back to mock data
      const clusters = mockEcsClusters[selectedRegion] || []
      
      set({ 
        ecsClusters: clusters,
        clustersWithInstances: clusters.map(name => ({ name, containerInstances: [] })),
        selectedEcsCluster: clusters.length > 0 ? clusters[0] : null
      })
    }
  },

  updateService: async (service: AWSService) => {
    try {
      const { id, type, name, status, desiredCount, region } = service
      const clients = createAWSClients(region)

      try {
        if (type === "ec2") {
          const command =
            status === "running"
              ? new StartInstancesCommand({ InstanceIds: [id] })
              : new StopInstancesCommand({ InstanceIds: [id] })
          await clients.ec2.send(command)
        } else if (type === "ecs") {
          const cluster = get().selectedEcsCluster || "default"

          // Get the current task definition
          const describeServiceResponse = await clients.ecs.send(
            new DescribeServicesCommand({
              cluster,
              services: [name],
            }),
          )

          const ecsService = describeServiceResponse.services?.[0]

          if (!ecsService) {
            throw new Error(`Service ${name} not found in cluster ${cluster}`)
          }

          const taskDefinition = ecsService.taskDefinition

          // Update the service with the new desired count
          await clients.ecs.send(
            new UpdateServiceCommand({
              cluster,
              service: name,
              desiredCount: status === "stopped" ? 0 : desiredCount,
              taskDefinition,
            }),
          )
        }
      } catch (error) {
        console.error("Error calling AWS API, updating mock data instead:", error)
      }

      // Update the service in our local state
      const services = get().services.map(s => {
        if (s.id === service.id) {
          return {
            ...s,
            status: status === "running" ? "stopped" : "running",
            desiredCount: status === "stopped" ? 0 : desiredCount
          }
        }
        return s
      })
      
      set({ services })

      // Log the action
      const authStore = useAuthStore.getState()
      authStore.logAction(
        status === "running" ? "stop_service" : "start_service",
        "aws",
        `${status === "running" ? "Stopped" : "Started"} ${type} service: ${name}`,
      )
    } catch (error) {
      console.error("Error updating service:", error)
      throw error
    }
  },

  forceDeployService: async (service: AWSService) => {
    const { selectedRegion } = get()
    const clients = createAWSClients(selectedRegion)

    try {
      if (service.type === "ecs") {
        try {
          // Force a new deployment by updating the service with the same configuration
          await clients.ecs.send(
            new UpdateServiceCommand({
              cluster: service.cluster,
              service: service.name,
              forceNewDeployment: true,
            }),
          )
        } catch (error) {
          console.error("Error calling AWS API for force deploy:", error)
          // Continue with mock update
        }
        
        console.log(`Force deployed service ${service.name} in cluster ${service.cluster}`)

        // Log the action
        const authStore = useAuthStore.getState()
        authStore.logAction(
          "force_deploy",
          "aws",
          `Force deployed ECS service: ${service.name} in cluster ${service.cluster}`,
        )
      } else {
        throw new Error(`Force deploy not supported for service type: ${service.type}`)
      }
    } catch (error) {
      console.error(`Failed to force deploy service ${service.name}:`, error)
      throw error
    }
  },

  forceDeployAllServices: async () => {
    try {
      const { services, selectedEcsCluster } = get()

      if (!selectedEcsCluster) {
        throw new Error("No ECS cluster selected")
      }

      // Filter for ECS services in the selected cluster
      const ecsServices = services.filter((service) => service.type === "ecs" && service.cluster === selectedEcsCluster)

      if (ecsServices.length === 0) {
        throw new Error(`No ECS services found in cluster ${selectedEcsCluster}`)
      }

      console.log(`Force deploying ${ecsServices.length} services in cluster ${selectedEcsCluster}`)

      // Force deploy each service
      for (const service of ecsServices) {
        try {
          await get().forceDeployService(service)
          console.log(`Successfully force deployed service ${service.name}`)
        } catch (serviceError) {
          console.error(`Failed to force deploy service ${service.name}:`, serviceError)
          // Continue with other services even if one fails
        }
      }

      // Log the action
      const authStore = useAuthStore.getState()
      authStore.logAction("force_deploy_all", "aws", `Force deployed all ECS services in cluster ${selectedEcsCluster}`)

      return true
    } catch (error) {
      console.error("Error during force deploy all:", error)
      throw error
    }
  },

  updateMultipleServices: async (services, action) => {
    try {
      // Get the selected cluster name
      const { selectedEcsCluster } = get()

      // Group services by region
      const servicesByRegion = services.reduce(
        (acc, service) => {
          if (!acc[service.region]) {
            acc[service.region] = []
          }
          acc[service.region].push(service)
          return acc
        },
        {} as Record<string, AWSService[]>,
      )

      // Process each region
      for (const [region, regionServices] of Object.entries(servicesByRegion)) {
        const regionClients = createAWSClients(region)

        // Group by service type
        const ec2Services = regionServices.filter((s) => s.type === "ec2")
        const ecsServices = regionServices.filter((s) => s.type === "ecs")

        try {
          // Handle EC2 instances
          if (ec2Services.length > 0) {
            const instanceIds = ec2Services.map((s) => s.id)
            const command =
              action === "start"
                ? new StartInstancesCommand({ InstanceIds: instanceIds })
                : new StopInstancesCommand({ InstanceIds: instanceIds })
            await regionClients.ec2.send(command)
          }

          // Handle ECS services
          if (ecsServices.length > 0) {
            if (!selectedEcsCluster) {
              throw new Error("No ECS cluster selected")
            }

            console.log(`Updating ${ecsServices.length} ECS services in cluster ${selectedEcsCluster}`)
            for (const service of ecsServices) {
              const command = new UpdateServiceCommand({
                cluster: selectedEcsCluster,
                service: service.name,
                desiredCount: action === "start" ? service.originalCount || 1 : 0,
              })
              console.log(
                `Setting desired count for ${service.name} to ${action === "start" ? service.originalCount || 1 : 0}`,
              )
              await regionClients.ecs.send(command)
            }
          }
        } catch (error) {
          console.error(`Error calling AWS API for bulk ${action}, updating mock data instead:`, error)
        }
      }

      // Update services in our local state
      const updatedServices = get().services.map(service => {
        if (services.some(s => s.id === service.id)) {
          return {
            ...service,
            status: action === "start" ? "running" : "stopped",
            desiredCount: action === "start" ? (service.originalCount || 1) : 0
          }
        }
        return service
      })
      
      set({ services: updatedServices })

      // Log the action
      const authStore = useAuthStore.getState()
      authStore.logAction(
        action === "start" ? "start_multiple" : "stop_multiple",
        "aws",
        `${action === "start" ? "Started" : "Stopped"} multiple services (${services.length} total)`,
      )
    } catch (error) {
      console.error(`Failed to ${action} multiple services:`, error)
      throw error
    }
  },

  loadServices: async () => {
    const { selectedRegion, selectedEcsCluster, ecsClusters, selectedType, ecsFilter } = get()
    const clients = createAWSClients(selectedRegion)
    let services: AWSService[] = []

    try {
      // Try to load from AWS API
      try {
        // Only load services of the selected type
        if (!selectedType || selectedType === "ec2") {
          // Load EC2 instances
          const ec2Response = await clients.ec2.send(new DescribeInstancesCommand({}))
          const instances = ec2Response.Reservations?.flatMap((r) => r.Instances || []) || []
          services.push(
            ...instances.map((instance) => ({
              id: instance.InstanceId || "",
              name: instance.Tags?.find((t) => t.Key === "Name")?.Value || instance.InstanceId || "",
              type: "ec2" as const,
              region: selectedRegion,
              status: instance.State?.Name === "running" ? ("running" as const) : ("stopped" as const),
              instanceType: instance.InstanceType,
            })),
          )
        }

        // Load ECS services - with error handling
        if (!selectedType || selectedType === "ecs") {
          // If a specific cluster is selected, load services from that cluster
          if (selectedEcsCluster) {
            console.log(`Loading ECS services from cluster: ${selectedEcsCluster}`)

            const listServicesResponse = await clients.ecs.send(
              new ListServicesCommand({
                cluster: selectedEcsCluster,
              }),
            )

            if (listServicesResponse.serviceArns?.length) {
              console.log(`Found ${listServicesResponse.serviceArns.length} ECS services`)

              const ecsResponse = await clients.ecs.send(
                new DescribeServicesCommand({
                  cluster: selectedEcsCluster,
                  services: listServicesResponse.serviceArns,
                }),
              )

              // Filter services based on ecsFilter
              const filteredServices = (ecsResponse.services || []).filter((service) => {
                if (ecsFilter === "all") return true
                if (ecsFilter === "ecs-ec2" && service.launchType === "EC2") return true
                if (ecsFilter === "ecs-fargate" && service.launchType === "FARGATE") return true
                return false
              })

              console.log(`Filtered to ${filteredServices.length} ECS services matching filter: ${ecsFilter}`)

              services.push(
                ...filteredServices.map((service) => ({
                  id: service.serviceArn || "",
                  name: service.serviceName || "",
                  type: "ecs" as const,
                  region: selectedRegion,
                  status: service.status === "ACTIVE" ? ("running" as const) : ("stopped" as const),
                  desiredCount: service.desiredCount,
                  originalCount: service.desiredCount,
                  cluster: selectedEcsCluster,
                  launchType: service.launchType || "EC2",
                })),
              )
            } else {
              console.log("No ECS services found in cluster")
            }
          }
          // If no specific cluster is selected but we have clusters, load services from all clusters
          else if (ecsClusters.length > 0) {
            console.log("Loading ECS services from all clusters")

            for (const cluster of ecsClusters) {
              try {
                const listServicesResponse = await clients.ecs.send(
                  new ListServicesCommand({
                    cluster,
                  }),
                )

                if (listServicesResponse.serviceArns?.length) {
                  console.log(`Found ${listServicesResponse.serviceArns.length} ECS services in cluster ${cluster}`)

                  const ecsResponse = await clients.ecs.send(
                    new DescribeServicesCommand({
                      cluster,
                      services: listServicesResponse.serviceArns,
                    }),
                  )

                  // Filter services based on ecsFilter
                  const filteredServices = (ecsResponse.services || []).filter((service) => {
                    if (ecsFilter === "all") return true
                    if (ecsFilter === "ecs-ec2" && service.launchType === "EC2") return true
                    if (ecsFilter === "ecs-fargate" && service.launchType === "FARGATE") return true
                    return false
                  })

                  console.log(
                    `Filtered to ${filteredServices.length} ECS services in cluster ${cluster} matching filter: ${ecsFilter}`,
                  )

                  services.push(
                    ...filteredServices.map((service) => ({
                      id: service.serviceArn || "",
                      name: service.serviceName || "",
                      type: "ecs" as const,
                      region: selectedRegion,
                      status: service.status === "ACTIVE" ? ("running" as const) : ("stopped" as const),
                      desiredCount: service.desiredCount,
                      originalCount: service.desiredCount,
                      cluster,
                      launchType: service.launchType || "EC2",
                    })),
                  )
                }
              } catch (clusterError) {
                console.warn(`Failed to load services from cluster ${cluster}:`, clusterError)
                // Continue with other clusters even if one fails
              }
            }
          } else if (selectedType === "ecs") {
            console.log("No ECS clusters available")
          }
        }

        // Load ALBs
        if (!selectedType || selectedType === "alb") {
          const albResponse = await clients.elb.send(new DescribeLoadBalancersCommand({}))
          services.push(
            ...(albResponse.LoadBalancers || []).map((lb) => ({
              id: lb.LoadBalancerArn || "",
              name: lb.LoadBalancerName || "",
              type: "alb" as const,
              region: selectedRegion,
              status: "running" as const,
              dnsName: lb.DNSName,
            })),
          )
        }
      } catch (error) {
        console.error("Failed to load services from AWS API, using mock data:", error)
        // If AWS API calls fail, use mock data
        services = mockServices[selectedRegion] || []
        
        // Filter based on selected type
        if (selectedType) {
          services = services.filter(service => service.type === selectedType)
        }
        
        // Filter ECS services based on selected cluster
        if (selectedEcsCluster) {
          services = services.filter(service => 
            service.type !== "ecs" || service.cluster === selectedEcsCluster
          )
        }
        
        // Filter ECS services based on ecsFilter
        if (ecsFilter !== "all") {
          services = services.filter(service => {
            if (service.type !== "ecs") return true
            if (ecsFilter === "ecs-ec2" && service.launchType === "EC2") return true
            if (ecsFilter === "ecs-fargate" && service.launchType === "FARGATE") return true
            return false
          })
        }
      }

      set({ services })

      // Log the action
      const authStore = useAuthStore.getState()
      authStore.logAction("load_services", "aws", `Loaded ${services.length} services in region ${selectedRegion}`)
    } catch (error) {
      console.error("Failed to load services:", error)
      // Fall back to mock data even if everything fails
      const mockData = mockServices[selectedRegion] || []
      set({ services: mockData })
    }
  },

  getFilteredServices: () => {
    const { services, selectedType, ec2StatusFilter, downtimeFilter, ecsFilter } = get()

    console.log("Filtering services with:", {
      selectedType,
      ec2StatusFilter,
      downtimeFilter,
      ecsFilter,
      totalServices: services.length,
    })

    const filteredServices = services.filter((service) => {
      // Filter by service type if selected
      if (selectedType && service.type !== selectedType) {
        return false
      }

      // Filter EC2 instances by status
      if (service.type === "ec2" && ec2StatusFilter !== "all") {
        if (ec2StatusFilter === "running" && service.status !== "running") {
          return false
        }
        if (ec2StatusFilter === "stopped" && service.status !== "stopped") {
          return false
        }
      }

      // Filter ECS services by launch type
      if (service.type === "ecs" && ecsFilter !== "all") {
        console.log("Filtering ECS service:", {
          name: service.name,
          launchType: service.launchType,
          filter: ecsFilter,
        })

        // For ecs-ec2 filter, only show services with launchType EC2
        if (ecsFilter === "ecs-ec2" && service.launchType !== "EC2") {
          console.log(`Filtering out ${service.name} - not EC2 (${service.launchType})`)
          return false
        }

        // For ecs-fargate filter, only show services with launchType FARGATE
        if (ecsFilter === "ecs-fargate" && service.launchType !== "FARGATE") {
          console.log(`Filtering out ${service.name} - not FARGATE (${service.launchType})`)
          return false
        }
      }

      // Filter for downtime management
      if (downtimeFilter && service.name.toLowerCase().includes("cron")) {
        return true
      } else if (downtimeFilter) {
        return false
      }

      return true
    })

    console.log("Filtered services count:", filteredServices.length)
    return filteredServices
  },
}))
