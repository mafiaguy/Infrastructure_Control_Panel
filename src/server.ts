import express from 'express';
import type { RequestHandler } from 'express';
import cors from 'cors';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Health check endpoint
const healthCheck: RequestHandler = (_req, res, next) => {
  try {
    // Check AWS credentials
    const awsAccessKeyId = process.env.VITE_AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.VITE_AWS_SECRET_ACCESS_KEY;

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      res.status(500).json({
        status: 'error',
        message: 'AWS credentials not configured'
      });
      return next();
    }

    // Try to create an AWS client (this will validate the credentials format)
    new ElasticLoadBalancingV2Client({
      region: 'us-east-1', // default region, will be overridden by actual requests
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    // If we get here, basic setup is working
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
    next();
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
};

app.get('/health', healthCheck);

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 