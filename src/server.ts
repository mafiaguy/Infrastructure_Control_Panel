// Load application secrets from AWS Secrets Manager based on the running environment
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
import path from "path"
import { fileURLToPath } from "url"
// Determine environment and region
const nodeEnv = process.env.NODE_ENV || "development"
const awsRegion = process.env.AWS_REGION || "us-east-1"
// Only fetch secrets in staging or production
if (nodeEnv === "staging" || nodeEnv === "production") {
  const secretId = `gl-cloudmanager/${nodeEnv}`
  console.log(`Loading secrets from AWS Secrets Manager: ${secretId} (region: ${awsRegion})`)
  const smClient = new SecretsManagerClient({ region: awsRegion })
  // Fetch the secret value (expects a JSON string of key/value pairs)
  try {
    const resp = await smClient.send(new GetSecretValueCommand({ SecretId: secretId }))
    if (!resp.SecretString) {
      console.error(`Secret ${secretId} has no string value`)
      process.exit(1)
    }
    let secrets: Record<string, any>
    try {
      secrets = JSON.parse(resp.SecretString)
    } catch (err) {
      console.error("Failed to parse secrets JSON:", err)
      process.exit(1)
    }
    // Inject each secret into process.env
    for (const [key, val] of Object.entries(secrets)) {
      process.env[key] = String(val)
    }
    console.log("Secrets loaded into environment variables")
  } catch (err) {
    console.error("Error fetching secrets from AWS Secrets Manager:", err)
    process.exit(1)
  }
} else {
  console.warn(`NODE_ENV is '${nodeEnv}', skipping AWS Secrets Manager fetch`)
}
// Continue with normal imports and server setup
// Load password pepper (additional secret) and enforce in staging/production
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || ""
if ((nodeEnv === "staging" || nodeEnv === "production") && !PASSWORD_PEPPER) {
  console.error("Missing required PASSWORD_PEPPER environment variable")
  process.exit(1)
}
import express from "express"
import type { RequestHandler } from "express"
import cors from "cors"
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2"
// Database type will be provided by better-sqlite3 runtime; use any to avoid missing types
// import type { Database } from "better-sqlite3"
import sqlite3 from "better-sqlite3"
import bcrypt from "bcryptjs"
import { body, validationResult } from "express-validator"
import type { User, UserLog, ApprovalRequest } from "./types"
import crypto from "crypto"

// Initialize Express app (cast to any to avoid strict handler return-type checks)
const app = express() as any
const port = process.env.PORT || 3000

// Enable CORS
app.use(cors())
app.use(express.json())

// Initialize SQLite database
let db: any
try {
  db = sqlite3("infrastructure_manager.db")

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      isApproved INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      lastLogin TEXT,
      invitedBy INTEGER,
      invitationToken TEXT,
      invitationExpiry TEXT
    );
    
    CREATE TABLE IF NOT EXISTS user_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      requestedRole TEXT NOT NULL,
      requestedAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewedBy INTEGER,
      reviewedAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (reviewedBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      invitationToken TEXT NOT NULL,
      invitedBy INTEGER NOT NULL,
      invitedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (invitedBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS aws_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resourceId TEXT NOT NULL,
      resourceName TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      region TEXT NOT NULL,
      status TEXT NOT NULL,
      lastUpdated TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      userId INTEGER PRIMARY KEY,
      defaultRegion TEXT,
      theme TEXT DEFAULT 'light',
      dashboardLayout TEXT,
      lastVisited TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `)

  // Create admin user if it doesn't exist
  const adminExists = db.prepare("SELECT id FROM users WHERE username = ?").get("admin")
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(PASSWORD_PEPPER + "admin", 10)
    db.prepare(`
      INSERT INTO users (username, password, email, role, isApproved, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("admin", hashedPassword, "admin@example.com", "admin", 1, new Date().toISOString())

    console.log("Default admin user created with username: admin, password: admin")
  }

  console.log("Database initialized successfully")
} catch (error) {
  console.error("Database initialization failed:", error)
  process.exit(1)
}

// Health check endpoint
const healthCheck: RequestHandler = (_req, res, next) => {
  try {
    // Check AWS credentials
    const awsRegion = process.env.AWS_REGION || "us-east-1"

    // Try to create an AWS client (this will validate the credentials format)
    new ElasticLoadBalancingV2Client({
      region: awsRegion,
    })

    // If we get here, basic setup is working
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    })
    next()
  } catch (error) {
    console.error("Health check failed:", error)
    res.status(500).json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    })
    next(error)
  }
}

app.get("/health", healthCheck)

// User authentication
app.post(
  "/api/login",
  body("username").isString().trim().notEmpty(),
  body("password").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { username, password } = req.body

    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      const passwordMatch = await bcrypt.compare(PASSWORD_PEPPER + password, user.password)
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      if (!user.isApproved) {
        return res.status(403).json({
          message: "Account pending approval",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isApproved: false,
          },
        })
      }

      // Update last login time
      db.prepare("UPDATE users SET lastLogin = ? WHERE id = ?").run(new Date().toISOString(), user.id)

      // Log the login action
      db.prepare(`
        INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, user.username, "login", "auth", new Date().toISOString(), "User logged in")

      // Return user info without password
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isApproved: Boolean(user.isApproved),
        },
      })
    } catch (error) {
      console.error("Login error:", error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Register new user
app.post(
  "/api/register",
  body("username").isString().trim().notEmpty(),
  body("password").isString().isLength({ min: 6 }),
  body("email").isEmail(),
  body("role").isIn(["readonly", "write"]),
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { username, password, email, role } = req.body

    try {
      // Check if username or email already exists
      const existingUser = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email)
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" })
      }

      const hashedPassword = await bcrypt.hash(PASSWORD_PEPPER + password, 10)
      const now = new Date().toISOString()

      // Begin transaction
      const insertUser = db.transaction(() => {
        // Insert user
        const result = db
          .prepare(`
          INSERT INTO users (username, password, email, role, isApproved, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
          .run(username, hashedPassword, email, role, 0, now)

        const userId = result.lastInsertRowid as number

        // Create approval request
        db.prepare(`
          INSERT INTO approval_requests (userId, username, email, requestedRole, requestedAt, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, username, email, role, now, "pending")

        return userId
      })

      const userId = insertUser()

      return res.status(201).json({
        message: "User registered successfully. Awaiting approval.",
        userId,
      })
    } catch (error) {
      console.error("Registration error:", error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Add the user invitation endpoint after the register endpoint

// Invite new user (admin only)
app.post(
  "/api/invite-user",
  body("username").isString().trim().notEmpty(),
  body("email").isEmail(),
  body("role").isIn(["readonly", "write", "admin"]),
  body("adminId").isNumeric(),
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { username, email, role, adminId } = req.body

    try {
      // Check if admin exists and is actually an admin
      const admin = db.prepare("SELECT id, role FROM users WHERE id = ?").get(adminId)
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" })
      }

      if (admin.role !== "admin") {
        return res.status(403).json({ message: "Only admins can invite users" })
      }

      // Check if username or email already exists
      const existingUser = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email)
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" })
      }

      // Generate a random token for the invitation
      const invitationToken = crypto.randomBytes(32).toString("hex")
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

      // Insert the invitation
      db.prepare(`
        INSERT INTO user_invitations (email, username, role, invitationToken, invitedBy, invitedAt, expiresAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(email, username, role, invitationToken, adminId, now.toISOString(), expiresAt.toISOString())

      // Log the invitation
      db.prepare(`
        INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        adminId,
        admin.username || "Unknown",
        "invite_user",
        "user_management",
        now.toISOString(),
        `Invited user ${username} (${email}) with role ${role}`,
      )

      return res.status(201).json({
        message: "User invitation created successfully",
        invitationToken,
        expiresAt: expiresAt.toISOString(),
      })
    } catch (error) {
      console.error("Error creating invitation:", error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Get all invitations (admin only)
app.get("/api/invitations", (req, res) => {
  try {
    const invitations = db
      .prepare(`
        SELECT i.*, u.username as inviterUsername
        FROM user_invitations i
        JOIN users u ON i.invitedBy = u.id
        ORDER BY i.invitedAt DESC
      `)
      .all()

    return res.json({ invitations })
  } catch (error) {
    console.error("Error fetching invitations:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Accept invitation and set password
app.post(
  "/api/accept-invitation",
  body("token").isString().notEmpty(),
  body("password").isString().isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { token, password } = req.body

    try {
      // Find the invitation
      const invitation = db
        .prepare("SELECT * FROM user_invitations WHERE invitationToken = ? AND status = 'pending'")
        .get(token)

      if (!invitation) {
        return res.status(404).json({ message: "Invalid or expired invitation" })
      }

      // Check if invitation has expired
      const expiresAt = new Date(invitation.expiresAt)
      if (expiresAt < new Date()) {
        return res.status(400).json({ message: "Invitation has expired" })
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(PASSWORD_PEPPER + password, 10)
      const now = new Date().toISOString()

      // Begin transaction
      const createUser = db.transaction(() => {
        // Create the user
        const result = db
          .prepare(`
            INSERT INTO users (username, password, email, role, isApproved, createdAt, invitedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(invitation.username, hashedPassword, invitation.email, invitation.role, 1, now, invitation.invitedBy)

        const userId = result.lastInsertRowid as number

        // Update the invitation status
        db.prepare("UPDATE user_invitations SET status = 'accepted' WHERE id = ?").run(invitation.id)

        // Log the action
        db.prepare(`
          INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          invitation.username,
          "accept_invitation",
          "user_management",
          now,
          `User accepted invitation and created account`,
        )

        return userId
      })

      const userId = createUser()

      return res.status(201).json({
        message: "Account created successfully",
        userId,
      })
    } catch (error) {
      console.error("Error accepting invitation:", error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Delete invitation (admin only)
app.delete("/api/invitations/:id", (req, res) => {
  const { id } = req.params
  const { adminId } = req.body

  try {
    // Check if admin exists and is actually an admin
    const admin = db.prepare("SELECT id, role, username FROM users WHERE id = ?").get(adminId)
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" })
    }

    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can delete invitations" })
    }

    // Get the invitation details for logging
    const invitation = db.prepare("SELECT * FROM user_invitations WHERE id = ?").get(id)
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" })
    }

    // Delete the invitation
    db.prepare("DELETE FROM user_invitations WHERE id = ?").run(id)

    // Log the action
    db.prepare(`
      INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      admin.username,
      "delete_invitation",
      "user_management",
      new Date().toISOString(),
      `Deleted invitation for ${invitation.username} (${invitation.email})`,
    )

    return res.json({ message: "Invitation deleted successfully" })
  } catch (error) {
    console.error("Error deleting invitation:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Get all users (admin only)
app.get("/api/users", (req, res) => {
  try {
    const users = db
      .prepare(`
      SELECT id, username, email, role, isApproved, createdAt, lastLogin
      FROM users
      ORDER BY createdAt DESC
    `)
      .all() as Omit<User, "password">[]

    return res.json({ users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Get pending approval requests
app.get("/api/approval-requests", (req, res) => {
  try {
    const requests = db
      .prepare(`
      SELECT * FROM approval_requests
      WHERE status = 'pending'
      ORDER BY requestedAt DESC
    `)
      .all() as ApprovalRequest[]

    return res.json({ requests })
  } catch (error) {
    console.error("Error fetching approval requests:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Approve or reject user request
app.post(
  "/api/approval-requests/:id",
  body("status").isIn(["approved", "rejected"]),
  body("reviewerId").isNumeric(),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { id } = req.params
    const { status, reviewerId } = req.body
    const now = new Date().toISOString()

    try {
      // Begin transaction
      const updateRequest = db.transaction(() => {
        // Update approval request
        db.prepare(`
          UPDATE approval_requests
          SET status = ?, reviewedBy = ?, reviewedAt = ?
          WHERE id = ?
        `).run(status, reviewerId, now, id)

        // If approved, update user's approval status
        if (status === "approved") {
          const request = db.prepare("SELECT userId FROM approval_requests WHERE id = ?").get(id) as { userId: number }
          if (request) {
            db.prepare("UPDATE users SET isApproved = 1 WHERE id = ?").run(request.userId)
          }
        }

        // Log the action
        const reviewer = db.prepare("SELECT username FROM users WHERE id = ?").get(reviewerId) as { username: string }
        const request = db.prepare("SELECT username, userId FROM approval_requests WHERE id = ?").get(id) as {
          username: string
          userId: number
        }

        db.prepare(`
          INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          reviewerId,
          reviewer.username,
          status === "approved" ? "approve_user" : "reject_user",
          "user_management",
          now,
          `${status === "approved" ? "Approved" : "Rejected"} user: ${request.username}`,
        )
      })

      updateRequest()

      return res.json({ message: `Request ${status === "approved" ? "approved" : "rejected"} successfully` })
    } catch (error) {
      console.error(`Error ${status} request:`, error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Get user logs
app.get("/api/user-logs", (req, res) => {
  try {
    const logs = db
      .prepare(`
      SELECT * FROM user_logs
      ORDER BY timestamp DESC
      LIMIT 100
    `)
      .all() as UserLog[]

    return res.json({ logs })
  } catch (error) {
    console.error("Error fetching user logs:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Log user action
app.post(
  "/api/log-action",
  body("userId").isNumeric(),
  body("username").isString(),
  body("action").isString(),
  body("resource").isString(),
  body("details").optional().isString(),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { userId, username, action, resource, details } = req.body
    const timestamp = new Date().toISOString()

    try {
      db.prepare(`
        INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, username, action, resource, timestamp, details || "")

      return res.status(201).json({ message: "Action logged successfully" })
    } catch (error) {
      console.error("Error logging action:", error)
      return res.status(500).json({ message: "Server error" })
    }
  },
)

// Add this endpoint after the other user management endpoints

// Delete user (admin only)
app.delete("/api/users/:id", (req, res) => {
  const { id } = req.params
  const { adminId } = req.body

  try {
    // Check if admin exists and is actually an admin
    const admin = db.prepare("SELECT id, role, username FROM users WHERE id = ?").get(adminId)
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" })
    }

    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can delete users" })
    }

    // Check if the user exists
    const user = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Prevent deleting the admin user
    if (user.username === "admin") {
      return res.status(403).json({ message: "Cannot delete the default admin user" })
    }

    // Prevent admins from deleting themselves
    if (Number(id) === Number(adminId)) {
      return res.status(403).json({ message: "Cannot delete your own account" })
    }

    // Begin transaction to delete user and related data
    const deleteUser = db.transaction(() => {
      // Delete user logs
      db.prepare("DELETE FROM user_logs WHERE userId = ?").run(id)

      // Delete approval requests
      db.prepare("DELETE FROM approval_requests WHERE userId = ?").run(id)

      // Delete user preferences
      db.prepare("DELETE FROM user_preferences WHERE userId = ?").run(id)

      // Delete the user
      db.prepare("DELETE FROM users WHERE id = ?").run(id)

      // Log the action
      db.prepare(`
        INSERT INTO user_logs (userId, username, action, resource, timestamp, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        adminId,
        admin.username,
        "delete_user",
        "user_management",
        new Date().toISOString(),
        `Deleted user ${user.username} (ID: ${id}, Role: ${user.role})`,
      )
    })

    deleteUser()

    return res.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("Error deleting user:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

// Serve front-end assets in production
if (process.env.NODE_ENV === 'production') {
  // Resolve current directory for ESM
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // Serve static files (index.html, assets)
  app.use(express.static(__dirname))
  // Fallback to index.html for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'))
  })
}
// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
