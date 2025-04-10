# Infrastructure_Control_Panel
# Infrastructure Control Panel

A comprehensive dashboard for managing AWS cloud infrastructure resources across multiple regions.

![Infrastructure Control Panel](https://i.imgur.com/example.png)

## Features

- **Multi-Region Support**: Manage resources in us-east-1 and ap-south-1 regions
- **Service Management**: Start, stop, and monitor EC2 instances, ECS services, and ALBs
- **ECS Deployment**: Force deploy ECS services with a single click
- **Downtime Mode**: Easily stop multiple services during maintenance windows
- **User Management**: Role-based access control with admin, write, and read-only permissions
- **Audit Logging**: Track all user actions for compliance and troubleshooting
- **Invitation System**: Invite new users with specific roles and permissions

## Tech Stack

- React with TypeScript
- Vite for fast development and building
- Tailwind CSS for styling
- Zustand for state management
- AWS SDK for JavaScript v3
- Express.js backend with SQLite database

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- AWS credentials (for production use)

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/yourusername/infrastructure-control-panel.git
   cd infrastructure-control-panel
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Create a `.env` file in the root directory with the following content:
   \`\`\`
   VITE_AWS_ACCESS_KEY_ID=your_access_key_id
   VITE_AWS_SECRET_ACCESS_KEY=your_secret_access_key
   \`\`\`
   
   For development or demo purposes, you can use placeholder values:
   \`\`\`
   VITE_AWS_ACCESS_KEY_ID=123
   VITE_AWS_SECRET_ACCESS_KEY=123
   \`\`\`

4. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

5. In a separate terminal, start the backend server:
   \`\`\`bash
   npm run server
   \`\`\`

### Default Admin Login

- Username: `admin`
- Password: `admin`

## Usage

### Dashboard

The main dashboard displays all your AWS resources. You can:

- Filter resources by type (EC2, ECS, ALB)
- Switch between regions
- Start or stop services with a single click
- Update ECS service desired counts
- Force deploy ECS services

### User Management

Admins can:

- Approve or reject new user registrations
- Invite new users with specific roles
- View user activity logs
- Manage existing users

### Downtime Mode

Enable downtime mode to quickly identify and stop non-essential services during maintenance windows.

## Architecture

The application consists of:

1. **Frontend**: React SPA with Zustand for state management
2. **Backend**: Express.js server with SQLite database for user management
3. **AWS Integration**: Direct integration with AWS services using AWS SDK v3

## Security Considerations

- All AWS API calls are made with the credentials provided in the `.env` file
- User passwords are hashed using bcrypt
- Role-based access control prevents unauthorized actions
- All user actions are logged for audit purposes

## Development

### Mock Mode

The application includes a mock mode that simulates AWS API responses when real credentials are not available or when API calls fail. This is useful for development and demonstration purposes.

### Adding New AWS Services

To add support for additional AWS services:

1. Add the service type to the `AWSService` type in `src/types.ts`
2. Update the `loadServices` function in `src/store/services.ts`
3. Add UI components to display and manage the new service type

## License

This project is licensed under the MIT License - see the LICENSE file for details.
\`\`\`

Now the services store will properly handle the case where AWS API calls fail by falling back to mock data, ensuring that the UI always shows something even with dummy credentials. The README provides comprehensive documentation for the project.
\`\`\`

</CodeProject>

Please make sure to add the following environment variables to your project:

<AddEnvironmentVariables names={["PORT", "AWS_REGION"]} />

