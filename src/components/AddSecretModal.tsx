import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useServicesStore } from '../store/services';
import { 
  SecretsManagerClient, 
  CreateSecretCommand,
  PutSecretValueCommand
} from '@aws-sdk/client-secrets-manager';

interface AddSecretModalProps {
  onClose: () => void;
}

// Function to create AWS clients with proper credentials
const createAWSClients = (region: string) => {
  const config = {
    region,
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || ''
    }
  };

  return {
    secrets: new SecretsManagerClient(config)
  };
};

export function AddSecretModal({ onClose }: AddSecretModalProps) {
  const { selectedRegion, loadServices } = useServicesStore();
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const clients = createAWSClients(selectedRegion);
      
      // Create new secret store
      const createSecretResponse = await clients.secrets.send(new CreateSecretCommand({
        Name: secretName,
        Description: `Secret created via dashboard on ${new Date().toISOString()}`,
      }));
      
      await clients.secrets.send(new PutSecretValueCommand({
        SecretId: createSecretResponse.ARN,
        SecretString: JSON.stringify({
          [secretName]: secretValue
        }),
      }));
      
      // Refresh the services list to show the new secret
      await loadServices();
      
      // Close the modal
      onClose();
    } catch (err) {
      setError('Failed to create secret. Please check your AWS credentials and permissions.');
      console.error('Error creating secret:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Add New Secret</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="secretName" className="block text-sm font-medium text-gray-700">
                Secret Name
              </label>
              <input
                type="text"
                id="secretName"
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter secret name"
                required
              />
            </div>

            <div>
              <label htmlFor="secretValue" className="block text-sm font-medium text-gray-700">
                Secret Value
              </label>
              <textarea
                id="secretValue"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter secret value"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : 'Add Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 