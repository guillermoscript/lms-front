import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Direct authentication config (for stdio/local development)
export interface DirectAuthConfig {
  mode: "direct";
  supabaseUrl: string;
  supabaseAnonKey: string;
  email?: string;
  password?: string;
  accessToken?: string;
}

// Proxy authentication config (for HTTP server with API proxy)
export interface ProxyAuthConfig {
  mode: "proxy";
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string; // For audit logging
  proxySecret: string;
}

// OAuth resource server config (for HTTP server with OAuth 2.1 bearer tokens)
export interface OAuthResourceConfig {
  mode: "oauth-resource";
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string; // For audit logging
}

export type AuthConfig = DirectAuthConfig | ProxyAuthConfig | OAuthResourceConfig;

// User context passed from proxy
export interface UserContext {
  userId: string;
  userRole: "teacher" | "admin";
  tenantId: string;
}

export class AuthManager {
  private client: SupabaseClient;
  private adminClient: SupabaseClient | null = null;
  private userId: string | null = null;
  private userRole: string | null = null;
  private tenantId: string | null = null;

  constructor(
    private config: AuthConfig,
    userContext?: UserContext
  ) {
    if (config.mode === "proxy" || config.mode === "oauth-resource") {
      // Proxy/OAuth mode: use service role client for queries (anon client has no session,
      // so RLS policies checking auth.uid() would block all queries).
      // Auth is already validated by the proxy layer.
      this.adminClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      // Use admin client as the query client in proxy mode
      this.client = this.adminClient;

      // Use provided user context
      if (!userContext) {
        throw new Error("User context required for proxy/oauth-resource mode");
      }
      this.userId = userContext.userId;
      this.userRole = userContext.userRole;
      this.tenantId = userContext.tenantId;
    } else {
      // Direct mode: traditional authentication
      this.client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    }
  }

  async initialize(): Promise<void> {
    if (this.config.mode === "proxy" || this.config.mode === "oauth-resource") {
      // Already initialized with user context in constructor
      console.error(`[${this.config.mode} Auth] ${this.userRole} (user: ${this.userId})`);
      return;
    }

    // Direct authentication mode
    if (this.config.accessToken) {
      const { data, error } = await this.client.auth.setSession({
        access_token: this.config.accessToken,
        refresh_token: "",
      });
      if (error) throw new Error(`Auth failed with access token: ${error.message}`);
      if (!data.user) throw new Error("No user returned from access token");
      this.userId = data.user.id;
    } else if (this.config.email && this.config.password) {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: this.config.email,
        password: this.config.password,
      });
      if (error) throw new Error(`Auth failed: ${error.message}`);
      if (!data.user) throw new Error("No user returned from sign in");
      this.userId = data.user.id;
    } else {
      throw new Error(
        "Auth config requires either SUPABASE_USER_EMAIL + SUPABASE_USER_PASSWORD or SUPABASE_ACCESS_TOKEN"
      );
    }

    const { data: roleData, error: roleError } = await this.client
      .from("user_roles")
      .select("role")
      .eq("user_id", this.userId)
      .limit(1)
      .single();

    if (roleError || !roleData) {
      throw new Error(`Could not fetch user role: ${roleError?.message ?? "no role found"}`);
    }

    this.userRole = roleData.role;

    if (this.userRole !== "teacher" && this.userRole !== "admin") {
      throw new Error(
        `Access denied: user role is '${this.userRole}'. Only teachers and admins can use the LMS MCP server.`
      );
    }

    console.error(`[Direct Auth] ${this.userRole} (user: ${this.userId})`);
  }

  /**
   * Log an MCP action to the audit table (proxy mode only)
   */
  async logAction(
    method: string,
    toolName: string | null,
    params: any,
    success: boolean,
    error?: string,
    durationMs?: number
  ): Promise<void> {
    if (!this.adminClient) {
      // Only log in proxy mode
      console.error("[Audit] Skipping log - no admin client (not in proxy mode)");
      return;
    }

    try {
      // Sanitize sensitive data from params
      const sanitizedParams = this.sanitizeParams(params);

      console.error(`[Audit] Logging: ${method} -> ${toolName} (success: ${success}, duration: ${durationMs}ms)`);
      
      const { error: insertError } = await this.adminClient.from("mcp_audit_log").insert({
        user_id: this.userId,
        user_role: this.userRole,
        method,
        tool_name: toolName,
        request_params: sanitizedParams,
        success,
        error_message: error,
        duration_ms: durationMs,
      });
      
      if (insertError) {
        console.error("[Audit] Insert error:", insertError);
      } else {
        console.error("[Audit] Successfully logged to database");
      }
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error("Failed to log action:", logError);
    }
  }

  /**
   * Remove sensitive data from params before logging
   */
  private sanitizeParams(params: any): any {
    if (!params || typeof params !== "object") return params;

    const sanitized = { ...params };
    const sensitiveKeys = ["password", "secret", "token", "key", "credential"];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getUserId(): string {
    if (!this.userId) throw new Error("Not authenticated");
    return this.userId;
  }

  getRole(): string {
    if (!this.userRole) throw new Error("Not authenticated");
    return this.userRole;
  }

  isAdmin(): boolean {
    return this.userRole === "admin";
  }

  getTenantId(): string {
    if (!this.tenantId) throw new Error("Tenant context not available");
    return this.tenantId;
  }

  async verifyCourseOwnership(courseId: number): Promise<void> {
    const { data, error } = await this.client
      .from("courses")
      .select("author_id, tenant_id")
      .eq("course_id", courseId)
      .single();

    if (error || !data) {
      throw new Error(`Course ${courseId} not found`);
    }

    // Always verify tenant scope
    if (this.tenantId && data.tenant_id !== this.tenantId) {
      throw new Error(`Access denied: course ${courseId} belongs to a different tenant`);
    }

    // Admins can access any course in their tenant
    if (this.isAdmin()) return;

    if (data.author_id !== this.userId) {
      throw new Error(`Access denied: you don't own course ${courseId}`);
    }
  }

  async verifyLessonOwnership(lessonId: number): Promise<number> {
    const { data, error } = await this.client
      .from("lessons")
      .select("course_id")
      .eq("id", lessonId)
      .single();

    if (error || !data) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    await this.verifyCourseOwnership(data.course_id);
    return data.course_id;
  }

  async verifyExamOwnership(examId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exams")
      .select("course_id")
      .eq("exam_id", examId)
      .single();

    if (error || !data) {
      throw new Error(`Exam ${examId} not found`);
    }

    await this.verifyCourseOwnership(data.course_id);
    return data.course_id;
  }

  async verifyExerciseOwnership(exerciseId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exercises")
      .select("course_id")
      .eq("id", exerciseId)
      .single();

    if (error || !data) {
      throw new Error(`Exercise ${exerciseId} not found`);
    }

    await this.verifyCourseOwnership(data.course_id!);
    return data.course_id!;
  }

  async verifyQuestionOwnership(questionId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exam_questions")
      .select("exam_id")
      .eq("question_id", questionId)
      .single();

    if (error || !data) {
      throw new Error(`Question ${questionId} not found`);
    }

    return await this.verifyExamOwnership(data.exam_id);
  }
}

/**
 * Load direct auth config for stdio mode (local development/testing)
 */
export function loadDirectAuthConfig(): DirectAuthConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required");
  if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY environment variable is required");

  const email = process.env.SUPABASE_USER_EMAIL;
  const password = process.env.SUPABASE_USER_PASSWORD;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!accessToken && (!email || !password)) {
    throw new Error(
      "Either SUPABASE_ACCESS_TOKEN or SUPABASE_USER_EMAIL + SUPABASE_USER_PASSWORD must be set"
    );
  }

  return { mode: "direct", supabaseUrl, supabaseAnonKey, email, password, accessToken };
}

/**
 * Load proxy auth config for HTTP mode (production)
 */
export function loadProxyAuthConfig(): ProxyAuthConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const proxySecret = process.env.MCP_PROXY_SECRET;

  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required");
  if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY environment variable is required");
  if (!supabaseServiceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  if (!proxySecret) throw new Error("MCP_PROXY_SECRET environment variable is required");

  return { mode: "proxy", supabaseUrl, supabaseAnonKey, supabaseServiceKey, proxySecret };
}

/**
 * Load OAuth resource server config (for OAuth 2.1 bearer token mode)
 */
export function loadOAuthResourceConfig(): OAuthResourceConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required");
  if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY environment variable is required");
  if (!supabaseServiceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required");

  return { mode: "oauth-resource", supabaseUrl, supabaseAnonKey, supabaseServiceKey };
}

/**
 * Backward compatibility: load direct auth config
 * @deprecated Use loadDirectAuthConfig() instead
 */
export function loadAuthConfig(): DirectAuthConfig {
  return loadDirectAuthConfig();
}
