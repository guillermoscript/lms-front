# LMS V2 Documentation

Welcome to the LMS V2 documentation! This documentation is designed to help developers and AI agents understand the project architecture, database schema, and development workflow.

## 📚 Documentation Structure

### For Getting Started
- **[Project Overview](./PROJECT_OVERVIEW.md)** - High-level project goals and architecture
- **[Getting Started](./GETTING_STARTED.md)** - Setup guide for new developers
- **[Development Workflow](./DEVELOPMENT_WORKFLOW.md)** - Day-to-day development practices

### Technical Reference
- **[Database Schema](./DATABASE_SCHEMA.md)** - Complete database structure and relationships
- **[Authentication & Authorization](./AUTH.md)** - How auth and role-based access works
- **[API Routes](./API_ROUTES.md)** - API endpoints and their purposes
- **[RLS Policies](./RLS_POLICIES.md)** - Row Level Security implementation (TODO)

### Feature Documentation
- **[Student Dashboard](./features/STUDENT_DASHBOARD.md)** - Student experience and features (TODO)
- **[Teacher Dashboard](./features/TEACHER_DASHBOARD.md)** - Teacher tools and workflows (TODO)
- **[Admin Dashboard](./features/ADMIN_DASHBOARD.md)** - Admin capabilities (TODO)
- **[AI Integration](./features/AI_INTEGRATION.md)** - How AI is used in the platform (TODO)

### For AI Agents
- **[AI Agent Guide](./AI_AGENT_GUIDE.md)** - Special instructions for AI assistants working on this codebase
- **[Common Tasks](./COMMON_TASKS.md)** - Frequent development tasks and how to accomplish them
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## 🎯 Quick Links

### Need to...
- **Add a new table?** → See [Database Schema](./DATABASE_SCHEMA.md#adding-new-tables)
- **Create a new dashboard page?** → See [Development Workflow](./DEVELOPMENT_WORKFLOW.md#creating-pages)
- **Add RLS policies?** → See [RLS Policies](./RLS_POLICIES.md)
- **Integrate AI features?** → See [AI Integration](./features/AI_INTEGRATION.md)
- **Debug auth issues?** → See [Authentication](./AUTH.md#troubleshooting)

## 🏗️ Project Status

**Current Phase**: Phase 5 Complete
- ✅ Phase 1: Fresh Next.js 16 + Shadcn UI (Lyra theme)
- ✅ Phase 2: Complete database schema (pulled from cloud)
- ✅ Phase 3: Authentication with role-based routing
- ✅ Phase 4: Basic Stripe payment integration
- ✅ Phase 5: Student Dashboard (complete with lessons, exams, progress tracking)
- 🔄 Phase 6: Teacher Dashboard (next priority)
- ⏳ Phase 7-11: Admin, Features, i18n, AI Docs, Testing

See [PHASE_5_SUMMARY.md](./PHASE_5_SUMMARY.md) for latest completion details.

## 🤝 Contributing

When contributing to this project:
1. Read the [Development Workflow](./DEVELOPMENT_WORKFLOW.md)
2. Understand the [Database Schema](./DATABASE_SCHEMA.md)
3. Follow the established patterns (see [AI Agent Guide](./AI_AGENT_GUIDE.md))
4. Test thoroughly before committing

## 📞 Support

For questions or issues:
- Check [Troubleshooting](./TROUBLESHOOTING.md)
- Review the relevant feature documentation
- Consult the [AI Agent Guide](./AI_AGENT_GUIDE.md) for AI-specific help
