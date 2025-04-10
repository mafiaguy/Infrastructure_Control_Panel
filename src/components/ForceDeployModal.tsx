import React, { useEffect, useState } from 'react';
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useServicesStore } from '../store/services';
import { AWSService } from '../types';

interface ForceDeployModalProps {
  onClose: () => void;
}

export function ForceDeployModal({ onClose }: ForceDeployModalProps) {
  const { 
    ecsClusters, 
    loadServices,
    forceDeployService
  } = useServicesStore();

  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [clusterServices, setClusterServices] = useState<Record<string, AWSService[]>>({});
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState(0);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [deploymentCompleted, setDeploymentCompleted] = useState(false);

  useEffect(() => {
    loadClusterServices();
  }, [ecsClusters]);

  const loadClusterServices = async () => {
    const servicesByCluster: Record<string, AWSService[]> = {};
    
    try {
      // Load all services first
      await loadServices();
      const allServices = useServicesStore.getState().services;
      
      // Filter services for each cluster
      for (const cluster of ecsClusters) {
        const clusterServices = allServices.filter((service: AWSService) => 
          service.type === 'ecs' && service.cluster === cluster
        );
        servicesByCluster[cluster] = clusterServices;
      }
      
      setClusterServices(servicesByCluster);
    } catch (error) {
      console.error('Failed to load services:', error);
      // Initialize empty services for each cluster
      ecsClusters.forEach(cluster => {
        servicesByCluster[cluster] = [];
      });
      setClusterServices(servicesByCluster);
    }
  };

  const toggleCluster = (cluster: string) => {
    const newExpandedClusters = new Set(expandedClusters);
    if (newExpandedClusters.has(cluster)) {
      newExpandedClusters.delete(cluster);
    } else {
      newExpandedClusters.add(cluster);
    }
    setExpandedClusters(newExpandedClusters);
  };

  const toggleService = (serviceId: string) => {
    const newSelectedServices = new Set(selectedServices);
    if (newSelectedServices.has(serviceId)) {
      newSelectedServices.delete(serviceId);
    } else {
      newSelectedServices.add(serviceId);
    }
    setSelectedServices(newSelectedServices);
  };

  const handleDeploy = async () => {
    if (selectedServices.size === 0) {
      setDeploymentError('Please select at least one service to deploy');
      return;
    }

    setIsDeploying(true);
    setDeploymentProgress(0);
    setDeploymentError(null);
    setDeploymentCompleted(false);

    const servicesToDeploy = Object.values(clusterServices)
      .flat()
      .filter(service => selectedServices.has(service.id));

    const totalServices = servicesToDeploy.length;
    let completedServices = 0;

    for (const service of servicesToDeploy) {
      try {
        await forceDeployService(service);
        completedServices++;
        setDeploymentProgress(Math.round((completedServices / totalServices) * 100));
      } catch (error) {
        console.error(`Failed to deploy service ${service.name}:`, error);
        setDeploymentError(`Failed to deploy some services. Please check the console for details.`);
      }
    }

    if (completedServices === totalServices) {
      setDeploymentCompleted(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    }

    setIsDeploying(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Force Deploy Services</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {ecsClusters.map(cluster => (
            <div key={cluster} className="mb-4">
              <button
                onClick={() => toggleCluster(cluster)}
                className="w-full flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <span className="font-medium text-gray-900">{cluster}</span>
                {expandedClusters.has(cluster) ? (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                )}
              </button>
              
              {expandedClusters.has(cluster) && (
                <div className="mt-2 ml-4 space-y-2">
                  {clusterServices[cluster]?.map(service => (
                    <div
                      key={service.id}
                      className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                      onClick={() => toggleService(service.id)}
                    >
                      <div className={`w-5 h-5 border rounded flex items-center justify-center ${
                        selectedServices.has(service.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {selectedServices.has(service.id) && (
                          <Check className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <span className="text-gray-700">{service.name}</span>
                    </div>
                  ))}
                  {(!clusterServices[cluster] || clusterServices[cluster].length === 0) && (
                    <p className="text-gray-500 text-sm">No services found in this cluster</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200">
          {isDeploying && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${deploymentProgress}%` }}
                />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                {deploymentError ? (
                  <span className="text-red-600">{deploymentError}</span>
                ) : deploymentCompleted ? (
                  <span className="text-green-600">Deployment completed successfully</span>
                ) : (
                  <span>Deploying selected services... {deploymentProgress}%</span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={isDeploying || selectedServices.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeploying ? 'Deploying...' : 'Deploy Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 