import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Products (what a school sells) — admin only, mirroring
 * `app/actions/admin/products.ts` (`verifyAdminAccess`) and the products /
 * product_courses RLS policies (tenant admins only).
 *
 * The MCP server holds no payment-provider credentials and no service role, so
 * it can only manage rails WITHOUT a provider-owned catalog: `manual`
 * (offline), `lemonsqueezy` (admin pastes the variant id), `solana` and
 * `solana_subs` (need a configured wallet). Stripe/PayPal products need a
 * provider product + price created server-side, so those are created in the
 * admin dashboard; this tool can still re-link their courses.
 *
 * Money rules (same as the web action): price > 0, currency usd|eur, at least
 * one course, status `active|inactive` (never `is_active`), prices come ONLY
 * from tool input.
 */

export const MCP_PRODUCT_PROVIDERS = ["manual", "lemonsqueezy", "solana", "solana_subs"] as const;
/** Providers that own a remote catalog the MCP server cannot mutate. */
export const CATALOG_PROVIDERS: readonly string[] = ["stripe", "paypal"];

export const productCurrency = z.enum(["usd", "eur"]);

export const createProductInput = z.object({
  name: z.string().trim().min(1).max(200).describe("Product name shown at checkout"),
  description: z.string().max(5000).optional().describe("Product description"),
  price: z.number().positive().max(1_000_000).describe("Price in MAJOR units (e.g. 49.99). Must be > 0."),
  currency: productCurrency.default("usd").describe("usd or eur"),
  image: z.string().url().optional().describe("Product image URL"),
  course_ids: z.array(z.number().int()).min(1).max(50).describe("Courses the purchase unlocks (at least one)"),
  payment_provider: z
    .enum(MCP_PRODUCT_PROVIDERS)
    .default("manual")
    .describe(
      "manual (offline/bank transfer), lemonsqueezy (needs provider_price_id), solana / solana_subs (school wallet must be configured). Stripe and PayPal products are created in the admin dashboard."
    ),
  provider_price_id: z
    .string()
    .trim()
    .optional()
    .describe("Lemon Squeezy variant id (required for lemonsqueezy only)"),
});

export const updateProductInput = z.object({
  product_id: z.number().int().describe("The product ID"),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  price: z.number().positive().max(1_000_000).optional().describe("New price (major units)"),
  currency: productCurrency.optional(),
  image: z.string().url().optional().describe("Image URL; empty string is not accepted, omit to keep"),
  provider_price_id: z.string().trim().optional().describe("Lemon Squeezy variant id (lemonsqueezy only)"),
  course_ids: z
    .array(z.number().int())
    .min(1)
    .max(50)
    .optional()
    .describe("REPLACES the set of linked courses (at least one)"),
});

export const listProductsInput = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const PRODUCT_COLUMNS =
  "product_id, name, description, price, currency, image, status, payment_provider, provider_price_id, tenant_id";

type ProductRow = {
  product_id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  image: string | null;
  status: string;
  payment_provider: string;
  provider_price_id: string | null;
  tenant_id: string;
};

function requireAdmin(session: LmsSession): string | null {
  return session.isAdmin()
    ? null
    : "Products are managed by school admins only. Ask an admin to create or change them.";
}

/** Every course must exist in THIS tenant (RLS also hides foreign ones). */
async function verifyCoursesInTenant(
  session: LmsSession,
  courseIds: number[]
): Promise<string | null> {
  const unique = [...new Set(courseIds)];
  const { data, error } = await session
    .getClient()
    .from("courses")
    .select("course_id")
    .eq("tenant_id", session.getTenantId())
    .in("course_id", unique);
  if (error) return `Checking courses: ${error.message}`;
  const found = new Set((data ?? []).map((c: { course_id: number }) => c.course_id));
  const missing = unique.filter((id) => !found.has(id));
  return missing.length ? `Course(s) not found in this school: ${missing.join(", ")}` : null;
}

async function loadProduct(session: LmsSession, productId: number): Promise<ProductRow | null> {
  const { data } = await session
    .getClient()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("product_id", productId)
    .eq("tenant_id", session.getTenantId())
    .maybeSingle();
  return (data as ProductRow | null) ?? null;
}

async function loadCourseIds(session: LmsSession, productId: number): Promise<number[]> {
  // Never .single(): a product maps to many courses.
  const { data } = await session
    .getClient()
    .from("product_courses")
    .select("course_id")
    .eq("product_id", productId)
    .eq("tenant_id", session.getTenantId());
  return (data ?? []).map((r: { course_id: number }) => r.course_id);
}

function present(p: ProductRow, courseIds: number[]) {
  return {
    id: p.product_id,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    image: p.image,
    status: p.status,
    payment_provider: p.payment_provider,
    course_ids: courseIds,
  };
}

const line = (p: ProductRow) =>
  `- **${p.name}** (ID: ${p.product_id}) ${p.price} ${p.currency.toUpperCase()} via ${p.payment_provider} [${p.status}]`;

export function registerProductTools(server: LmsServer) {
  // ── lms_list_products ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_products",
      description:
        "List the school's sellable products (price, currency, provider, status, linked course IDs). Admin only.",
      schema: listProductsInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const denied = requireAdmin(session);
        if (denied) return errorResult(denied);
        const { status, limit, offset } = listProductsInput.parse(input);

        let q = session
          .getClient()
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("tenant_id", session.getTenantId())
          .order("product_id", { ascending: false })
          .range(offset, offset + limit - 1);
        if (status !== "all") q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return errorResult(`Listing products: ${error.message}`);
        const rows = (data ?? []) as ProductRow[];

        const links: Record<number, number[]> = {};
        if (rows.length) {
          const { data: pc } = await session
            .getClient()
            .from("product_courses")
            .select("product_id, course_id")
            .eq("tenant_id", session.getTenantId())
            .in("product_id", rows.map((r) => r.product_id));
          for (const l of (pc ?? []) as { product_id: number; course_id: number }[]) {
            (links[l.product_id] ??= []).push(l.course_id);
          }
        }
        const products = rows.map((r) => present(r, links[r.product_id] ?? []));
        return ok(
          { products, count: products.length },
          rows.length
            ? `${rows.length} product(s):\n${rows.map((r) => `${line(r)} courses: ${(links[r.product_id] ?? []).join(", ") || "none"}`).join("\n")}`
            : "No products found."
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_product ─────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_product",
      description: "Get one product with its linked course IDs. Admin only.",
      schema: z.object({ product_id: z.number().int().describe("The product ID") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const denied = requireAdmin(session);
        if (denied) return errorResult(denied);
        const p = await loadProduct(session, input.product_id);
        if (!p) return errorResult(`Product ${input.product_id} not found`);
        const courseIds = await loadCourseIds(session, p.product_id);
        return ok(present(p, courseIds), `${line(p)}\nCourses: ${courseIds.join(", ") || "none"}`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_create_product ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_product",
      description:
        "Create a sellable product (price + currency) that unlocks one or more courses. Admin only. The price comes only from this input. Supports manual/offline, lemonsqueezy, solana and solana_subs rails; Stripe/PayPal products must be created in the admin dashboard.",
      schema: createProductInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (rawInput, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const denied = requireAdmin(session);
        if (denied) return errorResult(denied);
        const input = createProductInput.parse(rawInput);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const courseErr = await verifyCoursesInTenant(session, input.course_ids);
        if (courseErr) return errorResult(courseErr);

        let providerPriceId: string | null = null;
        if (input.payment_provider === "lemonsqueezy") {
          if (!input.provider_price_id) {
            return errorResult(
              "Lemon Squeezy requires provider_price_id (the variant id from your Lemon Squeezy dashboard)."
            );
          }
          providerPriceId = input.provider_price_id;
        } else if (input.payment_provider === "solana" || input.payment_provider === "solana_subs") {
          const { data: wallet } = await supabase
            .from("tenant_payment_wallets")
            .select("wallet_address")
            .eq("tenant_id", tenantId)
            .eq("provider", input.payment_provider)
            .maybeSingle();
          if (!wallet?.wallet_address) {
            return errorResult(
              "Configure your Solana wallet in Settings → Payment before creating a Solana product."
            );
          }
        }

        const { data: product, error } = await supabase
          .from("products")
          .insert({
            name: input.name,
            description: input.description?.trim() || null,
            price: input.price,
            currency: input.currency,
            image: input.image ?? null,
            payment_provider: input.payment_provider,
            provider_product_id: null,
            provider_price_id: providerPriceId,
            status: "active",
            tenant_id: tenantId,
          })
          .select(PRODUCT_COLUMNS)
          .single();
        if (error || !product) return errorResult(`Creating product: ${error?.message ?? "no row returned"}`);

        const courseIds = [...new Set(input.course_ids)];
        const { error: linkError } = await supabase.from("product_courses").insert(
          courseIds.map((course_id) => ({
            product_id: (product as ProductRow).product_id,
            course_id,
            tenant_id: tenantId,
          }))
        );
        if (linkError) {
          // Best-effort rollback so no course-less product is left behind.
          await supabase
            .from("products")
            .delete()
            .eq("product_id", (product as ProductRow).product_id)
            .eq("tenant_id", tenantId);
          return errorResult(`Linking courses: ${linkError.message}`);
        }

        return ok(
          present(product as ProductRow, courseIds),
          `Product created.\n${line(product as ProductRow)}\nCourses: ${courseIds.join(", ")}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_update_product ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_update_product",
      description:
        "Update a product's name, description, image, price/currency or linked courses (course_ids replaces the set). Admin only. The payment provider is immutable. Stripe/PayPal products can only have their courses re-linked here (price/name sync with the provider catalog happens in the dashboard).",
      schema: updateProductInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (rawInput, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const denied = requireAdmin(session);
        if (denied) return errorResult(denied);
        const input = updateProductInput.parse(rawInput);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const existing = await loadProduct(session, input.product_id);
        if (!existing) return errorResult(`Product ${input.product_id} not found`);

        const catalog = CATALOG_PROVIDERS.includes(existing.payment_provider);
        const touchesProduct =
          input.name !== undefined ||
          input.description !== undefined ||
          input.image !== undefined ||
          input.price !== undefined ||
          input.currency !== undefined ||
          input.provider_price_id !== undefined;
        if (catalog && touchesProduct) {
          return errorResult(
            `This product is sold through ${existing.payment_provider}, which keeps its own catalog. Edit its name/price in the admin dashboard; only course_ids can change here.`
          );
        }
        if (input.provider_price_id !== undefined && existing.payment_provider !== "lemonsqueezy") {
          return errorResult("provider_price_id applies to lemonsqueezy products only.");
        }

        if (input.course_ids) {
          const courseErr = await verifyCoursesInTenant(session, input.course_ids);
          if (courseErr) return errorResult(courseErr);
        }

        const update: Record<string, unknown> = {};
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) update.description = input.description.trim() || null;
        if (input.image !== undefined) update.image = input.image;
        if (input.price !== undefined) update.price = input.price;
        if (input.currency !== undefined) update.currency = input.currency;
        if (input.provider_price_id !== undefined) update.provider_price_id = input.provider_price_id || null;

        if (Object.keys(update).length === 0 && !input.course_ids) {
          return ok({ id: existing.product_id }, "No fields to update.");
        }

        let product = existing;
        if (Object.keys(update).length) {
          const { data, error } = await supabase
            .from("products")
            .update(update)
            .eq("product_id", input.product_id)
            .eq("tenant_id", tenantId)
            .select(PRODUCT_COLUMNS)
            .single();
          if (error || !data) return errorResult(`Updating product: ${error?.message ?? "no row returned"}`);
          product = data as ProductRow;
        }

        let courseIds = await loadCourseIds(session, input.product_id);
        if (input.course_ids) {
          const wanted = [...new Set(input.course_ids)];
          const toAdd = wanted.filter((id) => !courseIds.includes(id));
          const toRemove = courseIds.filter((id) => !wanted.includes(id));
          // Add before removing so a failure never leaves the product empty.
          if (toAdd.length) {
            const { error } = await supabase.from("product_courses").insert(
              toAdd.map((course_id) => ({ product_id: input.product_id, course_id, tenant_id: tenantId }))
            );
            if (error) return errorResult(`Linking courses: ${error.message}`);
          }
          if (toRemove.length) {
            const { error } = await supabase
              .from("product_courses")
              .delete()
              .eq("product_id", input.product_id)
              .eq("tenant_id", tenantId)
              .in("course_id", toRemove);
            if (error) return errorResult(`Unlinking courses: ${error.message}`);
          }
          courseIds = wanted;
        }

        return ok(present(product, courseIds), `Product updated.\n${line(product)}\nCourses: ${courseIds.join(", ")}`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_archive_product / lms_restore_product ───────────────────────────────
  for (const [name, target] of [
    ["lms_archive_product", "inactive"],
    ["lms_restore_product", "active"],
  ] as const) {
    server.tool(
      {
        name,
        description:
          target === "inactive"
            ? "Archive a product (status 'inactive'): it stops being sold; existing buyers keep access. Admin only. Stripe/PayPal products are archived in the dashboard (their provider catalog must be archived too)."
            : "Restore an archived product (status 'active'). Admin only. Stripe/PayPal products are restored in the dashboard.",
        schema: z.object({ product_id: z.number().int().describe("The product ID") }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (input, ctx) => {
        try {
          const session = LmsSession.fromContext(ctx);
          const denied = requireAdmin(session);
          if (denied) return errorResult(denied);
          const existing = await loadProduct(session, (input as { product_id: number }).product_id);
          if (!existing) return errorResult(`Product ${(input as { product_id: number }).product_id} not found`);
          if (CATALOG_PROVIDERS.includes(existing.payment_provider)) {
            return errorResult(
              `${existing.payment_provider} products own a provider catalog; ${target === "inactive" ? "archive" : "restore"} it in the admin dashboard.`
            );
          }
          const { data, error } = await session
            .getClient()
            .from("products")
            .update({ status: target })
            .eq("product_id", existing.product_id)
            .eq("tenant_id", session.getTenantId())
            .select(PRODUCT_COLUMNS)
            .single();
          if (error || !data) return errorResult(`Updating product: ${error?.message ?? "no row returned"}`);
          const courseIds = await loadCourseIds(session, existing.product_id);
          return ok(
            present(data as ProductRow, courseIds),
            `Product ${target === "inactive" ? "archived" : "restored"}.\n${line(data as ProductRow)}`
          );
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      }
    );
  }

  // ── lms_list_course_categories ──────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_course_categories",
      description:
        "List course categories (id + name) so a course can be assigned one via lms_create_course / lms_update_course category_id.",
      schema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (_input, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const { data, error } = await session
          .getClient()
          .from("course_categories")
          .select("id, name")
          .eq("tenant_id", session.getTenantId())
          .is("deleted_at", null)
          .order("name");
        if (error) return errorResult(`Listing categories: ${error.message}`);
        const categories = (data ?? []) as { id: number; name: string }[];
        return ok(
          { categories },
          categories.length ? categories.map((c) => `- ${c.name} (ID: ${c.id})`).join("\n") : "No categories."
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
