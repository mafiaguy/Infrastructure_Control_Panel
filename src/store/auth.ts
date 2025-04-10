import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: async (username: string, password: string) => {
    if (username === 'admin' && password === 'admin') {
      set({ user: { username: 'admin', isAdmin: true, isApproved: true } });
    } else {
      // In a real app, this would be a database lookup
      set({ user: { username, isAdmin: false, isApproved: false } });
    }
  },
  logout: () => set({ user: null }),
}));