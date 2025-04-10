export interface User {
  username: string;
  isAdmin: boolean;
  isApproved: boolean;
}

export interface AWSService {
  id: string;
  name: string;
  region: string;
  type: 'ec2' | 'ecs' | 'ecs-ec2' | 'alb' | 'secrets-manager';
  status: 'running' | 'stopped';
  desiredCount?: number;
  originalCount?: number;
  instanceType?: string;
  dnsName?: string;
  cluster?: string;
  launchType?: 'EC2' | 'FARGATE' | 'EXTERNAL';
}

export interface ServiceConfig {
  regions: string[];
  services: {
    name: string;
    type: 'ec2' | 'ecs' | 'ecs-ec2' | 'alb' | 'secrets-manager';
  }[];
  ecsClusterName: string;
}