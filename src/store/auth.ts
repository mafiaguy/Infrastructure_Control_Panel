import { create } from "zustand"
import axios from "axios"
import type { User, UserRole } from "../types"

interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  register: (username: string, password: string, email: string, role: UserRole) => Promise<void>
  logAction: (action: string, resource: string, details?: string) => Promise<void>
  inviteUser: (username: string, email: string, role: UserRole) => Promise<{ token: string; expiresAt: string }>
  getInvitations: () => Promise<any[]>
  deleteInvitation: (invitationId: number) => Promise<void>
  acceptInvitation: (token: string, password: string) => Promise<void>
  deleteUser: (userId: number) => Promise<void>
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api"

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password })
      set({ user: response.data.user, isLoading: false })
    } catch (error) {
      let errorMessage = "Login failed"
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage

        // If the user is pending approval, still set the user but with isApproved=false
        if (error.response.status === 403 && error.response.data.user) {
          set({ user: error.response.data.user, isLoading: false, error: errorMessage })
          return
        }
      }
      set({ isLoading: false, error: errorMessage })
      throw new Error(errorMessage)
    }
  },

  logout: async () => {
    const { user } = get()
    if (user) {
      try {
        // Log the logout action
        await axios.post(`${API_URL}/log-action`, {
          userId: user.id,
          username: user.username,
          action: "logout",
          resource: "auth",
          details: "User logged out",
        })
      } catch (error) {
        console.error("Failed to log logout action:", error)
      }
    }
    set({ user: null })
  },

  register: async (username: string, password: string, email: string, role: UserRole) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_URL}/register`, { username, password, email, role })
      set({ isLoading: false })
    } catch (error) {
      let errorMessage = "Registration failed"
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage
      }
      set({ isLoading: false, error: errorMessage })
      throw new Error(errorMessage)
    }
  },

  logAction: async (action: string, resource: string, details?: string) => {
    const { user } = get()
    if (!user) return

    try {
      await axios.post(`${API_URL}/log-action`, {
        userId: user.id,
        username: user.username,
        action,
        resource,
        details,
      })
    } catch (error) {
      console.error("Failed to log action:", error)
    }
  },

  inviteUser: async (username: string, email: string, role: UserRole) => {
    const { user } = get()
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can invite users")
    }

    set({ isLoading: true, error: null })
    try {
      const response = await axios.post(`${API_URL}/invite-user`, {
        username,
        email,
        role,
        adminId: user.id,
      })
      set({ isLoading: false })
      return {
        token: response.data.invitationToken,
        expiresAt: response.data.expiresAt,
      }
    } catch (error) {
      let errorMessage = "Failed to invite user"
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage
      }
      set({ isLoading: false, error: errorMessage })
      throw new Error(errorMessage)
    }
  },

  getInvitations: async () => {
    const { user } = get()
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view invitations")
    }

    try {
      const response = await axios.get(`${API_URL}/invitations`)
      return response.data.invitations
    } catch (error) {
      console.error("Failed to fetch invitations:", error)
      throw error
    }
  },

  deleteInvitation: async (invitationId: number) => {
    const { user } = get()
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete invitations")
    }

    try {
      await axios.delete(`${API_URL}/invitations/${invitationId}`, {
        data: { adminId: user.id },
      })
    } catch (error) {
      console.error("Failed to delete invitation:", error)
      throw error
    }
  },

  acceptInvitation: async (token: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_URL}/accept-invitation`, {
        token,
        password,
      })
      set({ isLoading: false })
    } catch (error) {
      let errorMessage = "Failed to accept invitation"
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage
      }
      set({ isLoading: false, error: errorMessage })
      throw new Error(errorMessage)
    }
  },
  deleteUser: async (userId: number) => {
    const { user } = get()
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete users")
    }

    try {
      await axios.delete(`${API_URL}/users/${userId}`, {
        data: { adminId: user.id },
      })

      // Log the action
      await get().logAction("delete_user", "user_management", `Deleted user with ID: ${userId}`)
    } catch (error) {
      let errorMessage = "Failed to delete user"
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage
      }
      throw new Error(errorMessage)
    }
  },
}))
