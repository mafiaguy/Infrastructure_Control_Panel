export interface User {
  id: number
  username: string
  password: string // This will be hashed
  email: string
  role: UserRole
  isApproved: boolean
  createdAt: string
  lastLogin: string | null
}

export type UserRole = "admin" | "write" | "readonly"

export interface UserLog {
  id: number
  userId: number
  username: string
  action: string
  resource: string
  timestamp: string
  details: string
}

export interface ApprovalRequest {
  id: number
  userId: number
  username: string
  email: string
  requestedRole: UserRole
  requestedAt: string
  status: "pending" | "approved" | "rejected"
  reviewedBy: number | null
  reviewedAt: string | null
}

export interface AWSService {
  id: string
  name: string
  region: string
  type: "ec2" | "ecs" | "ecs-ec2" | "alb" | "secrets-manager"
  status: "running" | "stopped"
  desiredCount?: number
  originalCount?: number
  instanceType?: string
  dnsName?: string
  cluster?: string
  launchType?: "EC2" | "FARGATE" | "EXTERNAL"
}

export interface ServiceConfig {
  regions: string[]
  services: {
    name: string
    type: "ec2" | "ecs" | "ecs-ec2" | "alb" | "secrets-manager"
  }[]
  ecsClusterName: string
}

// Add the UserInvitation interface

export interface UserInvitation {
  id: number
  email: string
  username: string
  role: UserRole
  invitationToken: string
  invitedBy: number
  inviterUsername: string
  invitedAt: string
  expiresAt: string
  status: "pending" | "accepted" | "expired"
}
