# LMS MCP Server

A secure Model Context Protocol (MCP) server that provides AI assistants with controlled access to your Learning Management System. Designed for integration with Claude and other MCP-compatible AI tools.

## 🔒 Security Architecture

This MCP server uses an **HTTP Proxy Authentication** model for maximum security:

- **No credential storage**: Users authenticate through your existing LMS session (cookies)
- **Per-user attribution**: All actions are tracked and logged per user
- **Role-based access**: Only teachers and admins can use MCP tools
- **Rate limiting**: 100 requests/minute per user
- **Audit logging**: Complete compliance trail in database
- **Shared secret validation**: Ensures requests come from your authenticated proxy

### How It Works

```
User Browser → Claude Web (claude.ai)
    ↓ (Session cookies)
Next.js API Proxy (/api/mcp)
    ↓ (Validates auth + role + rate limit)
    ↓ (Injects X-User-ID, X-User-Role, X-MCP-Secret headers)
MCP HTTP Server (localhost:3001)
    ↓ (Validates secret + enforces RLS per user)
Supabase Database
```

**Key Benefits:**
- Users never enter credentials into Claude or external tools
- Your LMS session security is preserved
- Supabase RLS policies enforce data access per user
- Full audit trail for compliance

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Running LMS instance with Supabase
- `.env` file configured (see Setup)

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
# Supabase Configuration
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# HTTP Proxy Mode (Recommended)
MCP_PROXY_SECRET=your-shared-secret-here
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=127.0.0.1
```

**Important**: The `MCP_PROXY_SECRET` must match the value in your main LMS `.env.local` file.

### 3. Build the Server

```bash
npm run build
```

### 4. Start the Server

```bash
npm run start:http
```

You should see:

```
╔════════════════════════════════════════════╗
║       MCP Server - HTTP Proxy Mode         ║
╠════════════════════════════════════════════╣
║ Port:   3001                               ║
║ Mode:   HTTP Proxy Authentication          ║
║ Status: Ready for connections              ║
╚════════════════════════════════════════════╝

Server capabilities:
✓ 27 tools available
✓ 3 resources available
✓ 4 prompts available
```

### 5. Connect Claude

See the comprehensive setup guide: [docs/MCP_SETUP.md](../docs/MCP_SETUP.md#connecting-claude-web)

## 📚 Available Capabilities

### Tools (27)

**Course Management:**
- `list_courses` - List all courses with filtering
- `get_course` - Get detailed course information
- `create_course` - Create a new course
- `update_course` - Update course details
- `delete_course` - Delete a course
- `publish_course` - Publish a draft course

**Lesson Management:**
- `list_lessons` - List lessons for a course
- `get_lesson` - Get lesson content and metadata
- `create_lesson` - Create a new lesson
- `update_lesson` - Update lesson content
- `delete_lesson` - Delete a lesson
- `reorder_lessons` - Change lesson sequence

**Exercise Management:**
- `list_exercises` - List exercises for a lesson
- `get_exercise` - Get exercise details
- `create_exercise` - Create a new exercise
- `update_exercise` - Update exercise content
- `delete_exercise` - Delete an exercise

**Exam Management:**
- `list_exams` - List all exams
- `get_exam` - Get exam with questions
- `create_exam` - Create a new exam
- `update_exam` - Update exam details
- `delete_exam` - Delete an exam
- `create_exam_question` - Add question to exam
- `update_exam_question` - Update exam question
- `delete_exam_question` - Remove exam question

**Student Data:**
- `list_students` - List students with progress
- `get_student_progress` - Get detailed student progress
- `list_exam_submissions` - View exam submissions with scores

### Resources (3)

- `course://{id}` - Access course details
- `lesson://{id}` - Access lesson content
- `exam://{id}` - Access exam structure

### Prompts (4)

- `create-course` - Interactive course creation wizard
- `create-lesson` - Guided lesson creation with MDX
- `create-exam` - Exam builder with question templates
- `analyze-progress` - Student progress analysis

## 🐳 Docker Deployment

### Build Image

```bash
npm run docker:build
```

### Run Container

```bash
npm run docker:run
```

### Stop Container

```bash
npm run docker:stop
```

### Manual Docker Commands

```bash
# Build
docker build -t lms-mcp-server .

# Run with environment file
docker run -d \
  --name lms-mcp-server \
  -p 3001:3001 \
  --env-file .env \
  lms-mcp-server

# View logs
docker logs -f lms-mcp-server

# Stop
docker stop lms-mcp-server
docker rm lms-mcp-server
```

## 🔧 Development

### Project Structure

```
mcp-server/
├── src/
│   ├── index.ts           # Stdio mode entry (deprecated)
│   ├── http-server.ts     # HTTP server with proxy auth
│   ├── auth.ts            # Authentication manager
│   ├── tools/             # Tool implementations
│   ├── resources/         # Resource handlers
│   └── prompts/           # Prompt templates
├── build/                 # Compiled output
├── .env                   # Environment config (git-ignored)
├── .env.example           # Template
├── package.json
└── tsconfig.json
```

### NPM Scripts

```bash
npm run build           # Compile TypeScript
npm run start:http      # Start HTTP server (recommended)
npm run start:stdio     # Start stdio mode (legacy)
npm run docker:build    # Build Docker image
npm run docker:run      # Run Docker container
npm run docker:stop     # Stop and remove container
```

### Adding New Tools

1. Create tool file in `src/tools/your-tool.ts`:

```typescript
import { AuthManager } from '../auth'

export async function yourTool(auth: AuthManager, args: any) {
  const supabase = auth.getSupabaseClient()
  
  // Log the action for audit trail
  await auth.logAction('tool', 'your_tool', true, 0, args)
  
  // Implement your logic
  const { data, error } = await supabase
    .from('your_table')
    .select('*')
  
  if (error) throw error
  return data
}
```

2. Register in `src/http-server.ts`:

```typescript
server.tool('your-tool', 'Description', { /* schema */ }, async (args) => {
  return await yourTool(auth, args)
})
```

3. Rebuild and restart:

```bash
npm run build
npm run start:http
```

## 🔍 Monitoring

### Check Server Health

```bash
curl http://localhost:3001/health
```

### View Audit Logs

Connect to your Supabase database and query:

```sql
-- Recent actions
SELECT * FROM mcp_audit_log
ORDER BY created_at DESC
LIMIT 50;

-- Actions by user
SELECT * FROM mcp_audit_log
WHERE user_id = 'user-uuid-here'
ORDER BY created_at DESC;

-- Failed actions
SELECT * FROM mcp_audit_log
WHERE success = false
ORDER BY created_at DESC;

-- Summary statistics
SELECT * FROM mcp_audit_summary;
```

### Rate Limiting

Rate limits are enforced at the API proxy level:
- **Limit**: 100 requests per minute per user
- **Scope**: Per user_id
- **Response**: HTTP 429 with Retry-After header

## 🐛 Troubleshooting

### Server won't start

**Problem**: Port already in use

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

**Problem**: Missing environment variables

```bash
# Verify .env file exists
cat .env

# Check required variables
grep -E "SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|MCP_PROXY_SECRET" .env
```

### Claude can't connect

**Problem**: MCP server URL incorrect

- Verify in Claude settings: `http://localhost:3001/mcp` (NOT just `http://localhost:3001`)
- Ensure server is running: `curl http://localhost:3001/health`

**Problem**: Authentication failing

- Check shared secret matches in both `.env` files:
  - `mcp-server/.env` → `MCP_PROXY_SECRET`
  - `.env.local` → `MCP_PROXY_SECRET`
- Verify you're logged into the LMS in your browser
- Check role: Only teachers and admins can use MCP tools

**Problem**: Rate limited

- Wait 60 seconds and try again
- Check recent activity: Query `mcp_audit_log` for your user_id
- Contact admin if limit is too restrictive

### Database errors

**Problem**: RLS policy denying access

- This is expected behavior - RLS enforces data access per user
- Teachers can only access their own courses
- Admins have broader access
- Check your role: `SELECT * FROM user_roles WHERE user_id = 'your-id'`

**Problem**: Audit log table doesn't exist

```bash
# Apply migration from project root
cd ..
supabase db push
```

## 📖 Documentation

- **[MCP Setup Guide](../docs/MCP_SETUP.md)** - Comprehensive setup and usage
- **[Database Schema](../docs/DATABASE_SCHEMA.md)** - LMS database structure
- **[Auth Guide](../docs/AUTH.md)** - Authentication and authorization
- **[AI Agent Guide](../docs/AI_AGENT_GUIDE.md)** - Development patterns

## 🔐 Security Best Practices

1. **Never share your service role key** - It bypasses RLS
2. **Keep shared secret secure** - Treat it like a password
3. **Use HTTPS in production** - Encrypt traffic between proxy and MCP server
4. **Monitor audit logs** - Review for suspicious activity
5. **Limit network access** - MCP server binds to 127.0.0.1 by default
6. **Regular updates** - Keep dependencies updated

## 📝 License

This MCP server is part of the LMS V2 project. See the main project LICENSE file for details.

## 🤝 Contributing

This server is actively developed as part of the LMS V2 rebuild. For questions or contributions, see the main project repository.

## 🆘 Support

- Check troubleshooting section above
- Review [docs/MCP_SETUP.md](../docs/MCP_SETUP.md)
- Check audit logs for error details
- Review server logs for detailed error messages

---

**Note**: The legacy stdio mode (direct authentication) is deprecated. All new deployments should use HTTP proxy mode for security and auditability.
