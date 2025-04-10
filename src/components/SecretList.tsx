import React from 'react';
import { Shield } from 'lucide-react';

export function SecretList() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-center space-x-3 text-gray-600">
        <Shield className="h-6 w-6" />
        <p className="text-lg">
          Secrets are managed securely and cannot be viewed for security reasons.
        </p>
      </div>
    </div>
  );
} 