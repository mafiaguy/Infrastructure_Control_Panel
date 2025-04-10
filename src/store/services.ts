import { create } from 'zustand';
import { 
  EC2Client, 
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand
} from '@aws-sdk/client-ec2';
import { 
  ECSClient, 
  ListServicesCommand, 
  DescribeServicesCommand,
  UpdateServiceCommand,
  ListClustersCommand,
  ListContainerInstancesCommand
} from '@aws-sdk/client-ecs';
import { 
  ElasticLoadBalancingV2Client, 
  DescribeLoadBalancersCommand 
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { 
  SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import { AWSService, ServiceConfig } from '../types';

interface ServicesState {
  services: AWSService[];
  selectedRegion: string;
  selectedType: string | null;
  config: ServiceConfig;
  ec2StatusFilter: 'all' | 'running' | 'stopped';
  downtimeFilter: boolean;
  ecsClusters: string[];
  selectedEcsCluster: string | null;
  ecsFilter: 'all' | 'ecs-ec2' | 'ecs-fargate';
  clustersWithInstances: { name: string; containerInstances: string[] }[];
  setSelectedRegion: (region: string) => void;
  setSelectedType: (type: string | null) => void;
  setEC2StatusFilter: (status: 'all' | 'running' | 'stopped') => void;
  setDowntimeFilter: (enabled: boolean) => void;
  setSelectedEcsCluster: (cluster: string | null) => void;
  setEcsFilter: (filter: 'all' | 'ecs-ec2' | 'ecs-fargate') => void;
  loadEcsClusters: () => Promise<void>;
  updateService: (service: AWSService) => void;
  updateMultipleServices: (services: AWSService[], action: 'start' | 'stop') => Promise<void>;
  loadServices: () => Promise<void>;
  getFilteredServices: () => AWSService[];
  forceDeployService: (service: AWSService) => Promise<void>;
  forceDeployAllServices: () => Promise<boolean>;
}

const defaultConfig: ServiceConfig = {
  regions: ['us-east-1', 'ap-south-1'],
  services: [
    { name: 'web-app-1', type: 'ecs' },
    { name: 'web-app-2', type: 'ecs' },
    { name: 'api-server-1', type: 'ec2' },
    { name: 'api-server-2', type: 'ec2' },
    { name: 'main-alb', type: 'alb' },
    { name: 'app-secrets', type: 'secrets-manager' }
  ],
  ecsClusterName: 'default'
};

const createAWSClients = (region: string) => {
  const config = {
    region,
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || ''
    }
  };

  return {
    ec2: new EC2Client(config),
    ecs: new ECSClient(config),
    elb: new ElasticLoadBalancingV2Client(config),
    secrets: new SecretsManagerClient(config)
  };
};

export const useServicesStore = create<ServicesState>((set, get) => ({
  services: [],
  selectedRegion: 'us-east-1',
  selectedType: null,
  config: defaultConfig,
  ec2StatusFilter: 'all',
  downtimeFilter: false,
  ecsClusters: [],
  selectedEcsCluster: null,
  ecsFilter: 'all',
  clustersWithInstances: [],
  setSelectedRegion: (region) => {
    set({ selectedRegion: region });
    get().loadServices();
  },
  setSelectedType: (type) => {
    set({ selectedType: type });
    if (type === 'ecs') {
      get().loadEcsClusters();
    }
  },
  setEC2StatusFilter: (status) => set({ ec2StatusFilter: status }),
  setDowntimeFilter: (enabled) => set({ downtimeFilter: enabled }),
  setSelectedEcsCluster: (cluster) => {
    set({ selectedEcsCluster: cluster });
    get().loadServices();
  },
  setEcsFilter: (filter) => {
    console.log(`Setting ECS filter to: ${filter}`);
    set({ ecsFilter: filter });
    
    // Always reload clusters when filter changes to ensure we have the right ones
    console.log('Reloading ECS clusters for filter:', filter);
    get().loadEcsClusters().then(() => {
      // After loading clusters, reload services to apply the filter
      console.log('Reloading services after loading clusters');
      get().loadServices();
    });
  },
  loadEcsClusters: async () => {
    const { selectedRegion, ecsFilter } = get();
    const clients = createAWSClients(selectedRegion);
    
    try {
      console.log('Loading ECS clusters...');
      
      // Initialize parameters for listing clusters
      let clusters: string[] = [];
      let nextToken: string | undefined;
      
      // Paginate through all clusters
      do {
        const listClustersResponse = await clients.ecs.send(new ListClustersCommand({
          nextToken
        }));
        
        if (listClustersResponse.clusterArns) {
          // Extract cluster names from ARNs
          const clusterNames = listClustersResponse.clusterArns.map(arn => {
            const parts = arn.split('/');
            return parts[parts.length - 1];
          });
          
          // If ecs-ec2 filter is selected, only include clusters with "DelayedJobEcsEc2Cluster" in their name
          if (ecsFilter === 'ecs-ec2') {
            const filteredClusters = clusterNames.filter(name => 
              name.includes('DelayedJobEcsEc2Cluster')
            );
            console.log(`Filtered clusters for ecs-ec2: ${filteredClusters.length} of ${clusterNames.length} match "DelayedJobEcsEc2Cluster"`);
            clusters = [...clusters, ...filteredClusters];
          } else {
            clusters = [...clusters, ...clusterNames];
          }
        }
        
        nextToken = listClustersResponse.nextToken;
      } while (nextToken);
      
      console.log('Found ECS clusters:', clusters);
      
      // For each cluster, get its container instances
      const clustersWithInstances = await Promise.all(clusters.map(async (clusterName) => {
        try {
          let containerInstances: string[] = [];
          let nextToken: string | undefined;
          
          do {
            const listInstancesResponse = await clients.ecs.send(new ListContainerInstancesCommand({
              cluster: clusterName,
              nextToken
            }));
            
            if (listInstancesResponse.containerInstanceArns) {
              containerInstances = [...containerInstances, ...listInstancesResponse.containerInstanceArns];
            }
            
            nextToken = listInstancesResponse.nextToken;
          } while (nextToken);
          
          console.log(`Found ${containerInstances.length} container instances in cluster ${clusterName}`);
          
          return {
            name: clusterName,
            containerInstances
          };
        } catch (error) {
          console.warn(`Failed to get container instances for cluster ${clusterName}:`, error);
          return {
            name: clusterName,
            containerInstances: []
          };
        }
      }));
      
      // If we have clusters and no cluster is selected, select the first one
      if (clusters.length > 0 && !get().selectedEcsCluster) {
        set({ 
          ecsClusters: clusters, 
          selectedEcsCluster: clusters[0],
          clustersWithInstances // Store the clusters with their container instances
        });
      } else {
        set({ 
          ecsClusters: clusters,
          clustersWithInstances // Store the clusters with their container instances
        });
      }
    } catch (error) {
      console.error('Failed to load ECS clusters:', error);
      set({ ecsClusters: [], clustersWithInstances: [] });
    }
  },
  updateService: async (service: AWSService) => {
    try {
      const { id, type, name, status, desiredCount, region } = service;
      const clients = createAWSClients(region);
      
      if (type === 'ec2') {
        const command = status === 'running'
          // ? new StopInstancesCommand({ InstanceIds: [id] })
          // : new StartInstancesCommand({ InstanceIds: [id] });
          ? new StartInstancesCommand({ InstanceIds: [id] })
          : new StopInstancesCommand({ InstanceIds: [id] });
        await clients.ec2.send(command);
      } else if (type === 'ecs') {
        const cluster = get().selectedEcsCluster || 'default';
        
        // Get the current task definition
        const describeServiceResponse = await clients.ecs.send(new DescribeServicesCommand({
          cluster,
          services: [name]
        }));
        
        const ecsService = describeServiceResponse.services?.[0];
        
        if (!ecsService) {
          throw new Error(`Service ${name} not found in cluster ${cluster}`);
        }
        
        const taskDefinition = ecsService.taskDefinition;
        
        // Update the service with the new desired count
        await clients.ecs.send(new UpdateServiceCommand({
          cluster,
          service: name,
          desiredCount: status === 'stopped' ? 0 : desiredCount,
          taskDefinition
        }));
      }
      
      // Refresh services after update
      await get().loadServices();
    } catch (error) {
      console.error('Error updating service:', error);
      throw error;
    }
  },
  forceDeployService: async (service: AWSService) => {
    const { selectedRegion } = get();
    const clients = createAWSClients(selectedRegion);

    try {
      if (service.type === 'ecs') {
        // Force a new deployment by updating the service with the same configuration
        await clients.ecs.send(new UpdateServiceCommand({
          cluster: service.cluster,
          service: service.name,
          forceNewDeployment: true
        }));
        console.log(`Force deployed service ${service.name} in cluster ${service.cluster}`);
      } else {
        throw new Error(`Force deploy not supported for service type: ${service.type}`);
      }
    } catch (error) {
      console.error(`Failed to force deploy service ${service.name}:`, error);
      throw error;
    }
  },
  forceDeployAllServices: async () => {
    try {
      const { services, selectedEcsCluster } = get();
      
      if (!selectedEcsCluster) {
        throw new Error('No ECS cluster selected');
      }
      
      // Filter for ECS services in the selected cluster
      const ecsServices = services.filter(service => 
        service.type === 'ecs' && service.cluster === selectedEcsCluster
      );
      
      if (ecsServices.length === 0) {
        throw new Error(`No ECS services found in cluster ${selectedEcsCluster}`);
      }
      
      console.log(`Force deploying ${ecsServices.length} services in cluster ${selectedEcsCluster}`);
      
      // Force deploy each service
      for (const service of ecsServices) {
        try {
          await get().forceDeployService(service);
          console.log(`Successfully force deployed service ${service.name}`);
        } catch (serviceError) {
          console.error(`Failed to force deploy service ${service.name}:`, serviceError);
          // Continue with other services even if one fails
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error during force deploy all:', error);
      throw error;
    }
  },
  updateMultipleServices: async (services, action) => {
    try {
      // Get the selected cluster name
      const { selectedEcsCluster } = get();
      
      // Group services by region
      const servicesByRegion = services.reduce((acc, service) => {
        if (!acc[service.region]) {
          acc[service.region] = [];
        }
        acc[service.region].push(service);
        return acc;
      }, {} as Record<string, AWSService[]>);
      
      // Process each region
      for (const [region, regionServices] of Object.entries(servicesByRegion)) {
        const regionClients = createAWSClients(region);
        
        // Group by service type
        const ec2Services = regionServices.filter(s => s.type === 'ec2');
        const ecsServices = regionServices.filter(s => s.type === 'ecs');
        
        // Handle EC2 instances
        if (ec2Services.length > 0) {
          const instanceIds = ec2Services.map(s => s.id);
          const command = action === 'start' 
            ? new StartInstancesCommand({ InstanceIds: instanceIds })
            : new StopInstancesCommand({ InstanceIds: instanceIds });
          await regionClients.ec2.send(command);
        }
        
        // Handle ECS services
        if (ecsServices.length > 0) {
          if (!selectedEcsCluster) {
            throw new Error('No ECS cluster selected');
          }
          
          console.log(`Updating ${ecsServices.length} ECS services in cluster ${selectedEcsCluster}`);
          for (const service of ecsServices) {
            const command = new UpdateServiceCommand({
              cluster: selectedEcsCluster,
              service: service.name,
              desiredCount: action === 'start' ? service.originalCount || 1 : 0
            });
            console.log(`Setting desired count for ${service.name} to ${action === 'start' ? service.originalCount || 1 : 0}`);
            await regionClients.ecs.send(command);
          }
        }
      }
      
      // Refresh services after updates
      await get().loadServices();
    } catch (error) {
      console.error(`Failed to ${action} multiple services:`, error);
      throw error;
    }
  },
  loadServices: async () => {
    const { selectedRegion, selectedEcsCluster, ecsClusters, selectedType, ecsFilter } = get();
    const clients = createAWSClients(selectedRegion);
    const services: AWSService[] = [];

    try {
      // Only load services of the selected type
      if (!selectedType || selectedType === 'ec2') {
        // Load EC2 instances
        const ec2Response = await clients.ec2.send(new DescribeInstancesCommand({}));
        const instances = ec2Response.Reservations?.flatMap(r => r.Instances || []) || [];
        services.push(...instances.map(instance => ({
          id: instance.InstanceId || '',
          name: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId || '',
          type: 'ec2' as const,
          region: selectedRegion,
          status: instance.State?.Name === 'running' ? ('running' as const) : ('stopped' as const),
          instanceType: instance.InstanceType
        })));
      }

      // Load ECS services - with error handling
      if (!selectedType || selectedType === 'ecs') {
        try {
          // If a specific cluster is selected, load services from that cluster
          if (selectedEcsCluster) {
            console.log(`Loading ECS services from cluster: ${selectedEcsCluster}`);
            
            const listServicesResponse = await clients.ecs.send(new ListServicesCommand({ 
              cluster: selectedEcsCluster 
            }));
            
            if (listServicesResponse.serviceArns?.length) {
              console.log(`Found ${listServicesResponse.serviceArns.length} ECS services`);
              
              const ecsResponse = await clients.ecs.send(new DescribeServicesCommand({
                cluster: selectedEcsCluster,
                services: listServicesResponse.serviceArns
              }));
              
              // Filter services based on ecsFilter
              const filteredServices = (ecsResponse.services || []).filter(service => {
                if (ecsFilter === 'all') return true;
                if (ecsFilter === 'ecs-ec2' && service.launchType === 'EC2') return true;
                if (ecsFilter === 'ecs-fargate' && service.launchType === 'FARGATE') return true;
                return false;
              });
              
              console.log(`Filtered to ${filteredServices.length} ECS services matching filter: ${ecsFilter}`);
              
              services.push(...filteredServices.map(service => ({
                id: service.serviceArn || '',
                name: service.serviceName || '',
                type: 'ecs' as const,
                region: selectedRegion,
                status: service.status === 'ACTIVE' ? ('running' as const) : ('stopped' as const),
                desiredCount: service.desiredCount,
                originalCount: service.desiredCount,
                cluster: selectedEcsCluster,
                launchType: service.launchType || 'EC2'
              })));
            } else {
              console.log('No ECS services found in cluster');
            }
          } 
          // If no specific cluster is selected but we have clusters, load services from all clusters
          else if (ecsClusters.length > 0) {
            console.log('Loading ECS services from all clusters');
            
            for (const cluster of ecsClusters) {
              try {
                const listServicesResponse = await clients.ecs.send(new ListServicesCommand({ 
                  cluster 
                }));
                
                if (listServicesResponse.serviceArns?.length) {
                  console.log(`Found ${listServicesResponse.serviceArns.length} ECS services in cluster ${cluster}`);
                  
                  const ecsResponse = await clients.ecs.send(new DescribeServicesCommand({
                    cluster,
                    services: listServicesResponse.serviceArns
                  }));
                  
                  // Filter services based on ecsFilter
                  const filteredServices = (ecsResponse.services || []).filter(service => {
                    if (ecsFilter === 'all') return true;
                    if (ecsFilter === 'ecs-ec2' && service.launchType === 'EC2') return true;
                    if (ecsFilter === 'ecs-fargate' && service.launchType === 'FARGATE') return true;
                    return false;
                  });
                  
                  console.log(`Filtered to ${filteredServices.length} ECS services in cluster ${cluster} matching filter: ${ecsFilter}`);
                  
                  services.push(...filteredServices.map(service => ({
                    id: service.serviceArn || '',
                    name: service.serviceName || '',
                    type: 'ecs' as const,
                    region: selectedRegion,
                    status: service.status === 'ACTIVE' ? ('running' as const) : ('stopped' as const),
                    desiredCount: service.desiredCount,
                    originalCount: service.desiredCount,
                    cluster,
                    launchType: service.launchType || 'EC2'
                  })));
                }
              } catch (clusterError) {
                console.warn(`Failed to load services from cluster ${cluster}:`, clusterError);
                // Continue with other clusters even if one fails
              }
            }
          } else if (selectedType === 'ecs') {
            console.log('No ECS clusters available');
          }
        } catch (ecsError) {
          console.warn('Failed to load ECS services:', ecsError);
          // Continue loading other services even if ECS fails
        }
      }

      // Load ALBs
      if (!selectedType || selectedType === 'alb') {
        const albResponse = await clients.elb.send(new DescribeLoadBalancersCommand({}));
        services.push(...(albResponse.LoadBalancers || []).map(lb => ({
          id: lb.LoadBalancerArn || '',
          name: lb.LoadBalancerName || '',
          type: 'alb' as const,
          region: selectedRegion,
          status: 'running' as const,
          dnsName: lb.DNSName
        })));
      }

      set({ services });
    } catch (error) {
      console.error('Failed to load services:', error);
      throw error;
    }
  },
  getFilteredServices: () => {
    const { 
      services, 
      selectedType, 
      ec2StatusFilter, 
      downtimeFilter,
      ecsFilter
    } = get();
    
    console.log('Filtering services with:', {
      selectedType,
      ec2StatusFilter,
      downtimeFilter,
      ecsFilter,
      totalServices: services.length
    });
    
    const filteredServices = services.filter(service => {
      // Filter by service type if selected
      if (selectedType && service.type !== selectedType) {
        return false;
      }
      
      // Filter EC2 instances by status
      if (service.type === 'ec2' && ec2StatusFilter !== 'all') {
        if (ec2StatusFilter === 'running' && service.status !== 'running') {
          return false;
        }
        if (ec2StatusFilter === 'stopped' && service.status !== 'stopped') {
          return false;
        }
      }
      
      // Filter ECS services by launch type
      if (service.type === 'ecs' && ecsFilter !== 'all') {
        console.log('Filtering ECS service:', {
          name: service.name,
          launchType: service.launchType,
          filter: ecsFilter
        });
        
        // For ecs-ec2 filter, only show services with launchType EC2
        if (ecsFilter === 'ecs-ec2' && service.launchType !== 'EC2') {
          console.log(`Filtering out ${service.name} - not EC2 (${service.launchType})`);
          return false;
        }
        
        // For ecs-fargate filter, only show services with launchType FARGATE
        if (ecsFilter === 'ecs-fargate' && service.launchType !== 'FARGATE') {
          console.log(`Filtering out ${service.name} - not FARGATE (${service.launchType})`);
          return false;
        }
      }
      
      // Filter for downtime management
      if (downtimeFilter && service.name.toLowerCase().includes('cron')) {
        return true;
      } else if (downtimeFilter) {
        return false;
      }
      
      return true;
    });
    
    console.log('Filtered services count:', filteredServices.length);
    return filteredServices;
  }
}));