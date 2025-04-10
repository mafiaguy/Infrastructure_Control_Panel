import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  CheckCircle, 
  Server, 
  Cloud, 
  Globe, 
  ChevronDown,
  RefreshCw,
  Clock,
  Play
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useServicesStore } from '../store/services';
import { AWSService } from '../types';
import { EcsClusterModal } from './EcsClusterModal';
import { ForceDeployModal } from './ForceDeployModal';
import { AlbRulesModal } from './AlbRulesModal';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { 
    selectedRegion, 
    selectedType,
    ec2StatusFilter,
    downtimeFilter,
    ecsClusters,
    selectedEcsCluster,
    ecsFilter,
    setSelectedRegion, 
    setSelectedType,
    setEC2StatusFilter,
    setDowntimeFilter,
    setSelectedEcsCluster,
    setEcsFilter,
    loadServices, 
    updateService,
    updateMultipleServices,
    getFilteredServices
  } = useServicesStore();
  const [desiredCount, setDesiredCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isBulkActionInProgress, setIsBulkActionInProgress] = useState<boolean>(false);
  const [selectedClusterForModal, setSelectedClusterForModal] = useState<string | null>(null);
  const [showForceDeployModal, setShowForceDeployModal] = useState(false);
  const [selectedAlb, setSelectedAlb] = useState<AWSService | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    if (!user.isApproved) {
      navigate('/pending');
      return;
    }
    loadServices();
  }, [user, navigate, loadServices]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadServices();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleServiceAction = async (service: AWSService) => {
    const newStatus = service.status === 'running' ? 'stopped' : 'running';
    const updatedService = {
      ...service,
      status: newStatus as 'running' | 'stopped',
      desiredCount: newStatus === 'stopped' ? 0 : service.originalCount
    };
    await updateService(updatedService);
    // Refresh the services to get the actual AWS state
    await loadServices();
  };

  const handleDesiredCountChange = async (service: AWSService) => {
    const updatedService = {
      ...service,
      desiredCount,
      originalCount: desiredCount
    };
    await updateService(updatedService);
    setDesiredCount(0);
    // Refresh the services to get the actual AWS state
    await loadServices();
  };

  const handleBulkAction = async (action: 'start' | 'stop') => {
    setIsBulkActionInProgress(true);
    try {
      const filteredServices = getFilteredServices();
      await updateMultipleServices(filteredServices, action);
    } finally {
      setIsBulkActionInProgress(false);
    }
  };

  const handleClusterClick = (cluster: string) => {
    setSelectedClusterForModal(cluster);
    setSelectedEcsCluster(cluster);
  };

  const handleAlbClick = (alb: AWSService) => {
    setSelectedAlb(alb);
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'ec2':
        return <Server className="h-6 w-6" />;
      case 'ecs':
        return <Cloud className="h-6 w-6" />;
      case 'alb':
        return <Globe className="h-6 w-6" />;
      default:
        return <Server className="h-6 w-6" />;
    }
  };

  const filteredServices = getFilteredServices();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Infrastructure Control Panel</h2>
              <div className="flex space-x-4">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <div className="relative">
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ap-south-1">ap-south-1</option>
                    <option value="us-east-1">us-east-1</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
                <div className="relative">
                  <select
                    value={selectedType || ''}
                    onChange={(e) => setSelectedType(e.target.value || null)}
                    className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Services</option>
                    <option value="ec2">EC2</option>
                    <option value="ecs">ECS</option>
                    <option value="alb">ALB</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
                {selectedType === 'ec2' && (
                  <div className="relative">
                    <select
                      value={ec2StatusFilter}
                      onChange={(e) => setEC2StatusFilter(e.target.value as 'all' | 'running' | 'stopped')}
                      className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All EC2 Instances</option>
                      <option value="running">Running Instances</option>
                      <option value="stopped">Stopped Instances</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={() => setDowntimeFilter(!downtimeFilter)}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      downtimeFilter 
                        ? 'text-white bg-purple-600 hover:bg-purple-700' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500`}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Downtime
                  </button>
                </div>
              </div>
            </div>

            {downtimeFilter && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h3 className="text-lg font-medium text-purple-800 mb-2">Downtime Mode</h3>
                <p className="text-purple-700 mb-4">
                  Downtime mode is active. Services will be filtered to show only those that can be safely stopped.
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleBulkAction('stop')}
                    disabled={isBulkActionInProgress}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Stop All Services
                  </button>
                  <button
                    onClick={() => handleBulkAction('start')}
                    disabled={isBulkActionInProgress}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Start All Services
                  </button>
                </div>
              </div>
            )}

            {selectedType === 'ecs' && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">ECS Clusters</h3>
                  <div className="flex space-x-2">
                    <div className="relative">
                      <select
                        value={ecsFilter}
                        onChange={(e) => setEcsFilter(e.target.value as 'all' | 'ecs-ec2' | 'ecs-fargate')}
                        className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All ECS Services</option>
                        <option value="ecs-ec2">ECS-EC2</option>
                        <option value="ecs-fargate">ECS-Fargate</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                    </div>
                    <button
                      onClick={() => setShowForceDeployModal(true)}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Force Deploy All
                    </button>
                  </div>
                </div>
                {ecsClusters.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {ecsClusters.map((cluster) => (
                      <div
                        key={cluster}
                        className={`p-4 border rounded-lg cursor-pointer ${
                          selectedEcsCluster === cluster
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => handleClusterClick(cluster)}
                      >
                        <div className="flex items-center">
                          <Cloud className={`h-5 w-5 mr-2 ${
                            selectedEcsCluster === cluster ? 'text-blue-500' : 'text-gray-400'
                          }`} />
                          <span className={`font-medium ${
                            selectedEcsCluster === cluster ? 'text-blue-700' : 'text-gray-700'
                          }`}>
                            {cluster}
                          </span>
                          {selectedEcsCluster === cluster && (
                            <CheckCircle className="h-5 w-5 ml-auto text-blue-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                      <p className="text-sm text-yellow-700">
                        No ECS clusters available in the selected region.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedType === 'alb' && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="text-gray-500">
                            {getServiceIcon(service.type)}
                          </div>
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {service.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              Type: {service.type.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        {service.status === 'running' ? (
                          <CheckCircle className="h-6 w-6 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-red-500" />
                        )}
                      </div>

                      {service.dnsName && (
                        <p className="text-sm text-gray-600 mb-4">
                          DNS Name: {service.dnsName}
                        </p>
                      )}

                      <button
                        onClick={() => handleAlbClick(service)}
                        className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Manage Rules
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedType !== 'ecs' && selectedType !== 'alb' && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="text-gray-500">
                            {getServiceIcon(service.type)}
                          </div>
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {service.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              Type: {service.type.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        {service.status === 'running' ? (
                          <CheckCircle className="h-6 w-6 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-red-500" />
                        )}
                      </div>

                      {service.type === 'ecs' && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-600 mb-2">
                            Current Desired Count: {service.desiredCount}
                          </p>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={desiredCount}
                              onChange={(e) => setDesiredCount(parseInt(e.target.value, 10))}
                              className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              placeholder="Count"
                            />
                            <button
                              onClick={() => handleDesiredCountChange(service)}
                              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              Update
                            </button>
                          </div>
                        </div>
                      )}

                      {service.instanceType && (
                        <p className="text-sm text-gray-600 mb-4">
                          Instance Type: {service.instanceType}
                        </p>
                      )}

                      <button
                        onClick={() => handleServiceAction(service)}
                        className={`w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                          service.status === 'running'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {service.status === 'stopped' ? 'Start Service' : 'Stop Service'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ECS Cluster Modal */}
      {selectedClusterForModal && (
        <EcsClusterModal 
          clusterName={selectedClusterForModal} 
          onClose={() => setSelectedClusterForModal(null)} 
        />
      )}
      {showForceDeployModal && (
        <ForceDeployModal onClose={() => setShowForceDeployModal(false)} />
      )}

      {selectedAlb && (
        <AlbRulesModal
          albArn={selectedAlb.id}
          albName={selectedAlb.name}
          onClose={() => setSelectedAlb(null)}
        />
      )}
    </div>
  );
}