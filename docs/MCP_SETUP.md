# MCP Server Setup Guide

## 📋 Overview

The LMS MCP (Model Context Protocol) Server enables AI assistants like Claude to interact with your LMS system. Teachers and admins can use AI to create courses, manage lessons, generate content, and more.

**Architecture**: HTTP Proxy Authentication
- **Client**: Claude web interface (claude.ai)
- **Proxy**: Next.js API route (`/api/mcp`)
- **MCP Server**: Node.js HTTP server (localhost:3001)
- **Database**: Supabase with RLS

---

## 🔐 Prerequisites

### 1. User Requirements
- ✅ LMS account with **teacher** or **admin** role
- ✅ Active session (logged in to LMS)

### 2. System Requirements
- ✅ Node.js 18+ installed
- ✅ LMS application running (Next.js dev server or production)
- ✅ Supabase instance accessible

### 3. Environment Setup
- ✅ `.env.local` configured with MCP settings (see below)
- ✅ `mcp-server/.env` configured (see below)

---

## ⚙️ Installation

### Step 1: Configure Main LMS Environment

Add these lines to `.env.local` in the root of your LMS project:

```bash
# MCP Server Configuration
MCP_SERVER_URL=http://127.0.0.1:3001
MCP_PROXY_SECRET=<your-secret-here>
```

**Generate a secure secret**:
```bash
openssl rand -hex 32
```

### Step 2: Configure MCP Server Environment

Create `mcp-server/.env`:

```bash
# Supabase Configuration
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MCP HTTP Server
MCP_HTTP_PORT=3001
MCP_HTTP_HOST=127.0.0.1

# Security (must match .env.local)
MCP_PROXY_SECRET=<same-secret-as-above>

# CORS
ALLOWED_ORIGIN=http://localhost:3000
```

**Important**: `MCP_PROXY_SECRET` must be identical in both files!

### Step 3: Build MCP Server

```bash
cd mcp-server
npm install
npm run build
```

### Step 4: Apply Database Migration

```bash
# From project root
supabase db push

# Or if using hosted Supabase
supabase migration up
```

This creates the `mcp_audit_log` table for tracking all MCP actions.

---

## 🚀 Running the MCP Server

### Option A: Local Development (Recommended)

**Terminal 1** - Start Next.js (if not already running):
```bash
npm run dev
```

**Terminal 2** - Start MCP HTTP Server:
```bash
cd mcp-server
npm run start:http
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║  LMS MCP HTTP Server                                       ║
╠════════════════════════════════════════════════════════════╣
║  Status:   READY                                           ║
║  Address:  http://127.0.0.1:3001                           ║
║  Mode:     Proxy Authentication                            ║
╠════════════════════════════════════════════════════════════╣
║  Registered:                                               ║
║    • 27 tools (courses, lessons, exams, etc.)              ║
║    • 3 resources (course, lesson, exam data)               ║
║    • 4 prompts (course creation, content gen, etc.)        ║
╠════════════════════════════════════════════════════════════╣
║  Security:                                                 ║
║    ✓ Shared secret validation enabled                      ║
║    ✓ Per-user authentication required                      ║
║    ✓ Audit logging enabled                                 ║
╚════════════════════════════════════════════════════════════╝
```

### Option B: Using Docker

```bash
cd mcp-server

# Build Docker image
npm run docker:build

# Run container
npm run docker:run

# Stop container
npm run docker:stop
```

---

## 🌐 Connecting Claude to the MCP Server

### Step 1: Log into LMS
1. Open your browser
2. Navigate to `http://localhost:3000`
3. Log in with a **teacher** or **admin** account

### Step 2: Open Claude
1. Go to https://claude.ai
2. Navigate to **Settings** → **Connectors**

### Step 3: Add Custom Connector
1. Click **"Add custom connector"**
2. Enter MCP Server URL: `http://localhost:3000/api/mcp`
3. Click **"Add"**

**Note**: Authentication uses your LMS session cookies automatically!

### Step 4: Configure Tool Permissions
1. In the Connectors settings, click on your LMS connector
2. Enable/disable specific tools as needed
3. Set usage preferences

### Step 5: Test the Connection
In a new Claude conversation:

**Example prompts**:
- "List all my courses"
- "Create a new course about Python basics"
- "Show me the lessons in course 5"
- "Generate lesson content about functions in Python"

---

## 🔧 Troubleshooting

### Issue: "Unauthorized" Error

**Symptoms**: API returns 401 error

**Solutions**:
1. ✅ Verify you're logged into the LMS
2. ✅ Check your session hasn't expired (refresh the page)
3. ✅ Ensure cookies are enabled in your browser

### Issue: "Forbidden: MCP access requires teacher or admin role"

**Symptoms**: API returns 403 error

**Solutions**:
1. ✅ Verify your user role:
   ```sql
   SELECT * FROM user_roles WHERE user_id = '<your-user-id>';
   ```
2. ✅ If you're a student, ask an admin to upgrade your role
3. ✅ Admins can assign roles via admin dashboard or SQL:
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('<user-id>', 'teacher')
   ON CONFLICT DO NOTHING;
   ```

### Issue: "Rate limit exceeded"

**Symptoms**: API returns 429 error

**Solutions**:
1. ✅ Wait 1 minute for the rate limit window to reset
2. ✅ You're limited to 100 requests per minute
3. ✅ If you need higher limits, modify `lib/rate-limit.ts`

### Issue: "MCP server error" / Connection Refused

**Symptoms**: API returns 502 error

**Solutions**:
1. ✅ Check MCP server is running:
   ```bash
   curl http://127.0.0.1:3001
   ```
2. ✅ Verify `MCP_SERVER_URL` in `.env.local` is correct
3. ✅ Check MCP server logs for errors
4. ✅ Restart MCP server:
   ```bash
   cd mcp-server && npm run start:http
   ```

### Issue: "Invalid secret" (401 from MCP server)

**Symptoms**: MCP server rejects requests

**Solutions**:
1. ✅ Verify `MCP_PROXY_SECRET` matches in both:
   - `.env.local` (main project)
   - `mcp-server/.env`
2. ✅ No spaces or quotes around the secret
3. ✅ Regenerate secret if needed:
   ```bash
   openssl rand -hex 32
   ```

### Issue: Database Migration Fails

**Symptoms**: Can't create `mcp_audit_log` table

**Solutions**:
1. ✅ Check Supabase connection:
   ```bash
   supabase db pull
   ```
2. ✅ Verify migration file exists:
   ```bash
   ls supabase/migrations/*mcp_audit_log*
   ```
3. ✅ Manually apply migration:
   ```bash
   supabase db push
   ```

---

## 📊 Monitoring & Auditing

### View Audit Logs

**As a Teacher** (view your own actions):
```sql
SELECT 
  created_at,
  method,
  tool_name,
  success,
  duration_ms
FROM mcp_audit_log
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 50;
```

**As an Admin** (view all actions):
```sql
SELECT 
  created_at,
  user_role,
  tool_name,
  success,
  COUNT(*) OVER (PARTITION BY tool_name) as usage_count
FROM mcp_audit_log
ORDER BY created_at DESC
LIMIT 100;
```

### Hourly Summary View

```sql
SELECT * FROM mcp_audit_summary
WHERE hour >= NOW() - INTERVAL '24 hours'
ORDER BY hour DESC;
```

### Check Rate Limit Status

Rate limits are per-user and reset every minute. To check current usage:
- Look at server logs in real-time
- Or add monitoring via the audit log timestamps

---

## 🔒 Security Best Practices

### 1. Keep Secrets Secret
- ✅ Never commit `.env` or `.env.local` to git
- ✅ Use different secrets for dev/staging/production
- ✅ Rotate secrets regularly (monthly recommended)

### 2. Use HTTPS in Production
- ✅ Never expose MCP server publicly
- ✅ Always use HTTPS for the Next.js API endpoint
- ✅ Configure CORS properly (`ALLOWED_ORIGIN`)

### 3. Monitor Audit Logs
- ✅ Review logs weekly for suspicious activity
- ✅ Set up alerts for failed authentication attempts
- ✅ Archive old logs (>90 days) to keep table small

### 4. Principle of Least Privilege
- ✅ Only grant teacher role when necessary
- ✅ Admin role should be limited to actual admins
- ✅ Review user roles quarterly

---

## 🚢 Production Deployment

### Remote Deployment Checklist

- [ ] Generate new production secrets
- [ ] Set `MCP_SERVER_URL` to production URL
- [ ] Configure `ALLOWED_ORIGIN` to your domain
- [ ] Use HTTPS for all endpoints
- [ ] Set up proper firewall rules
- [ ] Configure monitoring and alerts
- [ ] Set up log rotation for audit table
- [ ] Test failover scenarios
- [ ] Document rollback procedure

### Environment Variables for Production

**Next.js** (`.env.production`):
```bash
MCP_SERVER_URL=http://internal-mcp-server:3001
MCP_PROXY_SECRET=<production-secret>
```

**MCP Server**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<prod-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<prod-service-key>
MCP_PROXY_SECRET=<same-production-secret>
ALLOWED_ORIGIN=https://your-domain.com
```

---

## 📚 Available MCP Tools

The server exposes 27 tools across 5 categories:

### Courses (5 tools)
- `list_courses` - List your courses
- `get_course` - Get course details
- `create_course` - Create new course
- `update_course` - Update course details
- `delete_course` - Delete course

### Lessons (6 tools)
- `list_lessons` - List lessons in course
- `get_lesson` - Get lesson details
- `create_lesson` - Create new lesson
- `update_lesson` - Update lesson content
- `delete_lesson` - Delete lesson
- `reorder_lessons` - Change lesson sequence

### Exams (7 tools)
- `list_exams` - List exams
- `get_exam` - Get exam details
- `create_exam` - Create exam with questions
- `update_exam` - Update exam details
- `delete_exam` - Delete exam
- `add_question` - Add question to exam
- `update_question` - Update exam question

### Exercises (5 tools)
- `list_exercises` - List exercises
- `get_exercise` - Get exercise details
- `create_exercise` - Create new exercise
- `update_exercise` - Update exercise
- `delete_exercise` - Delete exercise

### Analytics (4 tools)
- `get_course_stats` - Course enrollment/completion stats
- `get_lesson_stats` - Lesson completion stats
- `get_exam_stats` - Exam submission stats
- `get_student_progress` - Individual student progress

---

## 🤝 Getting Help

- **Issues**: Check troubleshooting section above
- **Questions**: Contact your LMS administrator
- **Bugs**: Report to development team
- **Feature Requests**: Submit via proper channels

---

## 📖 Additional Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Claude MCP Integration](https://support.anthropic.com/en/articles/custom-connectors)

---

**Last Updated**: February 2026  
**Version**: 1.0.0
