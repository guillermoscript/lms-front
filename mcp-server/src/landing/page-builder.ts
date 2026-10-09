/**
 * MCP side of Page Architect (design §7 WP6, critique C1/C2/F1–F5).
 *
 * Every landing-page write the MCP tools make goes through here, on top of the shared
 * `@lms/core` page-builder (the same op reducer, block catalog and validation the web
 * editor and chat route use):
 *
 *   - external agents send friendly ops (`add` with an optional temp `ref`, `after_id`
 *     positioning, `duplicate`, `update_root`); `applyAgentOps` translates them into core
 *     `PageOp`s, assigns every block id on the server, validates each block STRICTLY with
 *     `pageCatalog.validateBlock` (refs against this tenant's ids) and applies them in order
 *     on a copy of the stored page. Any problem refuses the whole patch: nothing half-saves.
 *   - the result (and every created page) then passes the LENIENT `validatePage` (structure,
 *     unique ids, size caps, known types, URL schemes), so legacy props on human-edited pages
 *     never block an edit.
 *   - course/product/plan ids are checked against what THIS tenant owns and what the public
 *     render would show (courses published|draft and not deleted, products active, plans not
 *     deleted), queried with an explicit `tenant_id` filter on top of RLS.
 *
 * Pure apart from `loadRefLookup` / `freePlanPageCapError`, which take the session.
 */
import { z } from "zod";
import {
  PAGE_LIMITS,
  ROOT_ZONE,
  allItems,
  expandDuplicate,
  findNode,
  getZone,
  localizeDefaults,
  newBlockId,
  normalizeRefIds,
  pageCatalog,
  parseZone,
  applyOpInPlace,
  refKindOf,
  zoneKey,
  type IdFactory,
  type PageData,
  type PageOp,
  type RefIdSets,
  type RefKind,
  type TemplateLocale,
} from "@lms/core";
import type { LmsSession } from "../session.js";

// ── Agent op schema (the MCP wire shape) ─────────────────────────────────────

const propsRecord = z.record(z.string(), z.unknown());
const blockId = z.string().min(1).max(120);
const zoneField = z
  .string()
  .min(1)
  .max(200)
  .describe(`Zone: "${ROOT_ZONE}" (the page, default) or "<parentId>:<zoneName>" for a block nested in a layout block`);
const indexField = z.number().int().min(0).describe("Position in the zone (0 = first). Omit to append at the end.");
const afterIdField = blockId.describe("Place right after this block (same zone). Wins over zone/index.");

export const agentOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    type: z.string().min(1).max(64).describe("Block type from lms_get_landing_blocks"),
    props: propsRecord.optional().describe("The block's props. Omitted props use the block defaults."),
    ref: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "Optional temporary handle. Later ops in the SAME patch can use it as an id (or as the parent in a zone \"<ref>:<zoneName>\"). The server assigns the real id and returns the mapping."
      ),
    zone: zoneField.optional(),
    index: indexField.optional(),
    after_id: afterIdField.optional(),
  }),
  z.object({
    op: z.literal("update"),
    id: blockId.describe("Block id from the page outline"),
    props: propsRecord.describe("Props to change (shallow merge; a list prop is replaced whole)"),
  }),
  z.object({
    op: z.literal("update_root"),
    props: propsRecord.describe("Page settings: metaTitle (≤70 chars), metaDescription (≤160), ogImage (https URL)"),
  }),
  z.object({
    op: z.literal("move"),
    id: blockId,
    zone: zoneField.optional(),
    index: indexField.optional(),
    after_id: afterIdField.optional(),
  }),
  z.object({ op: z.literal("remove"), id: blockId.describe("Removes the block and everything nested in it") }),
  z.object({
    op: z.literal("duplicate"),
    id: blockId,
    ref: z.string().min(1).max(64).optional().describe("Optional temporary handle for the copy"),
  }),
]);

export type AgentOp = z.infer<typeof agentOpSchema>;

export const agentOpsSchema = z
  .array(agentOpSchema)
  .min(1)
  .max(PAGE_LIMITS.maxOpsPerTurn)
  .describe("Ops applied in order. If any op is invalid, NOTHING is saved and every problem is reported.");

// ── Tenant id refs ───────────────────────────────────────────────────────────

/** Prop key → ref kind, across every block (courseId → course, productIds → product, …). */
const REF_KEY_KIND: ReadonlyMap<string, RefKind> = (() => {
  const out = new Map<string, RefKind>();
  for (const type of pageCatalog.types) {
    for (const { key, ref } of pageCatalog.refFields(type)) out.set(key, refKindOf(ref));
  }
  return out;
})();

export type RefIdBuckets = Record<RefKind, Set<string>>;

function emptyBuckets(): RefIdBuckets {
  return { course: new Set(), product: new Set(), plan: new Set() };
}

/** Every course/product/plan id referenced by these props (any accepted shape). */
export function collectPropRefIds(props: Record<string, unknown> | undefined, into: RefIdBuckets = emptyBuckets()): RefIdBuckets {
  for (const [key, value] of Object.entries(props ?? {})) {
    const kind = REF_KEY_KIND.get(key);
    if (!kind) continue;
    for (const id of normalizeRefIds(value)) into[kind].add(id);
  }
  return into;
}

/** Every id referenced anywhere on the page (content and zones). */
export function collectPageRefIds(page: PageData, into: RefIdBuckets = emptyBuckets()): RefIdBuckets {
  for (const { item } of allItems(page)) collectPropRefIds(item?.props, into);
  return into;
}

export function collectOpRefIds(ops: readonly AgentOp[], into: RefIdBuckets = emptyBuckets()): RefIdBuckets {
  for (const op of ops) if (op.op === "add" || op.op === "update") collectPropRefIds(op.props, into);
  return into;
}

/**
 * The referenced ids this tenant actually owns, with their display names. A missing id is
 * foreign, deleted, archived or inactive — the public render would not show it either.
 */
export interface RefLookup {
  course: Map<string, string>;
  product: Map<string, string>;
  plan: Map<string, string>;
}

export function emptyRefLookup(): RefLookup {
  return { course: new Map(), product: new Map(), plan: new Map() };
}

export function refIdSets(lookup: RefLookup): RefIdSets {
  return { course: [...lookup.course.keys()], product: [...lookup.product.keys()], plan: [...lookup.plan.keys()] };
}

const MAX_LOOKUP_IDS = 200;

function integerIds(ids: Set<string>): number[] {
  return [...ids].filter((id) => /^\d{1,15}$/.test(id)).slice(0, MAX_LOOKUP_IDS).map(Number);
}

export async function loadRefLookup(session: LmsSession, wanted: RefIdBuckets): Promise<RefLookup> {
  const client = session.getClient();
  const tenantId = session.getTenantId();
  const lookup = emptyRefLookup();
  const courseIds = integerIds(wanted.course);
  const productIds = integerIds(wanted.product);
  const planIds = integerIds(wanted.plan);

  const [courses, products, plans] = await Promise.all([
    courseIds.length
      ? client
          .from("courses")
          .select("course_id, title")
          .eq("tenant_id", tenantId)
          .in("course_id", courseIds)
          .in("status", ["published", "draft"])
          .is("deleted_at", null)
      : null,
    productIds.length
      ? client
          .from("products")
          .select("product_id, name")
          .eq("tenant_id", tenantId)
          .in("product_id", productIds)
          .eq("status", "active")
      : null,
    planIds.length
      ? client
          .from("plans")
          .select("plan_id, plan_name")
          .eq("tenant_id", tenantId)
          .in("plan_id", planIds)
          .is("deleted_at", null)
      : null,
  ]);
  for (const res of [courses, products, plans]) {
    if (res?.error) throw new Error(`Checking referenced ids: ${res.error.message}`);
  }
  for (const r of (courses?.data ?? []) as { course_id: number; title: string | null }[]) {
    lookup.course.set(String(r.course_id), r.title ?? "");
  }
  for (const r of (products?.data ?? []) as { product_id: number; name: string | null }[]) {
    lookup.product.set(String(r.product_id), r.name ?? "");
  }
  for (const r of (plans?.data ?? []) as { plan_id: number; plan_name: string | null }[]) {
    lookup.plan.set(String(r.plan_id), r.plan_name ?? "");
  }
  return lookup;
}

// ── Applying agent ops ───────────────────────────────────────────────────────

export interface ApplyAgentOpsResult {
  data: PageData;
  /** Fatal: the patch must not be saved. */
  errors: string[];
  /** Non-fatal notes from the lenient whole-page check. */
  warnings: string[];
  /** Temp `ref` (and duplicated source) → server-assigned id. */
  idMap: Record<string, string>;
  /** The core ops actually applied (what the editor would dispatch). */
  applied: PageOp[];
}

function clonePage(data: PageData | null | undefined): PageData {
  const copy = data && typeof data === "object" ? (JSON.parse(JSON.stringify(data)) as PageData) : null;
  const page: PageData = copy ?? { root: { props: {} }, content: [], zones: {} };
  if (!Array.isArray(page.content)) page.content = [];
  if (!page.root || typeof page.root !== "object") page.root = { props: {} };
  if (!page.zones || typeof page.zones !== "object") page.zones = {};
  return page;
}

/**
 * Translate and apply agent ops to a copy of `stored`. Block ids are always minted here;
 * a temp `ref` lets later ops in the same patch address a new block. Validation errors
 * and ops the reducer had to skip are both fatal — the caller saves nothing. With a
 * `locale`, the defaults an `add` fills in are in the page's language.
 */
export function applyAgentOps(
  stored: PageData | null | undefined,
  ops: readonly AgentOp[],
  opts: { refs: RefIdSets; idFactory?: IdFactory; locale?: TemplateLocale }
): ApplyAgentOpsResult {
  const idFactory = opts.idFactory ?? newBlockId;
  const catalog = localizeDefaults(pageCatalog, opts.locale);
  const page = clonePage(stored);
  const errors: string[] = [];
  const idMap: Record<string, string> = {};
  const applied: PageOp[] = [];

  const resolveId = (id: string) => idMap[id] ?? id;
  const resolveZone = (zone: string | undefined): string => {
    if (!zone || zone === ROOT_ZONE) return ROOT_ZONE;
    const parsed = parseZone(zone);
    return parsed ? zoneKey(resolveId(parsed.parentId), parsed.zoneName) : zone;
  };
  /** Where `after_id` / zone+index point, on the page as it is NOW. */
  const position = (
    op: { zone?: string; index?: number; after_id?: string },
    movingId?: string
  ): { zone: string; index: number } | string => {
    if (op.after_id) {
      if (movingId && resolveId(op.after_id) === movingId) return "after_id cannot be the block being moved";
      const anchor = findNode(page, resolveId(op.after_id));
      if (!anchor) return `after_id "${op.after_id}" is not on the page`;
      // A move removes the block first: an earlier sibling shifts the anchor up by one.
      const self = movingId ? findNode(page, movingId) : null;
      const shift = self && self.zone === anchor.zone && self.index < anchor.index ? 0 : 1;
      return { zone: anchor.zone, index: anchor.index + shift };
    }
    const zone = resolveZone(op.zone);
    return { zone, index: op.index ?? (getZone(page, zone) ?? []).length };
  };
  const apply = (label: string, op: PageOp): boolean => {
    const warning = applyOpInPlace(page, op, catalog);
    if (warning) {
      errors.push(`${label}: ${warning}`);
      return false;
    }
    applied.push(op);
    return true;
  };

  ops.forEach((op, i) => {
    switch (op.op) {
      case "add": {
        const label = `ops[${i}] add ${op.type}`;
        const v = pageCatalog.validateBlock(op.type, op.props ?? {}, { mode: "add", refs: opts.refs });
        if (!v.ok) {
          errors.push(...v.errors.map((e) => `${label}: ${e}`));
          return;
        }
        const pos = position(op);
        if (typeof pos === "string") {
          errors.push(`${label}: ${pos}`);
          return;
        }
        const id = idFactory(op.type);
        if (apply(label, { op: "add", id, type: op.type, zone: pos.zone, index: pos.index, props: v.props }) && op.ref) {
          idMap[op.ref] = id;
        }
        return;
      }
      case "update": {
        const id = resolveId(op.id);
        const node = findNode(page, id);
        const label = `ops[${i}] update ${op.id}`;
        if (!node) {
          errors.push(`${label}: no block with this id (read the outline with lms_get_landing_page)`);
          return;
        }
        const v = pageCatalog.validateBlock(node.item.type, op.props, { mode: "update", refs: opts.refs });
        if (!v.ok) {
          errors.push(...v.errors.map((e) => `${label} (${node.item.type}): ${e}`));
          return;
        }
        apply(label, { op: "update", id, props: v.props });
        return;
      }
      case "update_root": {
        const label = `ops[${i}] update_root`;
        const v = pageCatalog.validateRoot(op.props);
        if (!v.ok) {
          errors.push(...v.errors.map((e) => `${label}: ${e}`));
          return;
        }
        apply(label, { op: "updateRoot", props: v.props });
        return;
      }
      case "move": {
        const id = resolveId(op.id);
        const label = `ops[${i}] move ${op.id}`;
        if (!findNode(page, id)) {
          errors.push(`${label}: no block with this id`);
          return;
        }
        const pos = position(op, id);
        if (typeof pos === "string") {
          errors.push(`${label}: ${pos}`);
          return;
        }
        apply(label, { op: "move", id, zone: pos.zone, index: pos.index });
        return;
      }
      case "remove": {
        apply(`ops[${i}] remove ${op.id}`, { op: "remove", id: resolveId(op.id) });
        return;
      }
      case "duplicate": {
        const label = `ops[${i}] duplicate ${op.id}`;
        const expanded = expandDuplicate(page, resolveId(op.id), idFactory);
        if (!expanded) {
          errors.push(`${label}: no block with this id`);
          return;
        }
        for (const add of expanded.ops) if (!apply(label, add)) return;
        if (op.ref) idMap[op.ref] = expanded.newId;
        return;
      }
    }
  });

  const check = pageCatalog.validatePage(page);
  errors.push(...check.errors);
  return { data: page, errors, warnings: check.warnings, idMap, applied };
}

/**
 * Apply server-built core ops (a template's or preset's blocks) to a copy of `stored`.
 * These are our own assets, so they skip the strict per-block AI check (template blocks
 * carry legacy/editor props) and pass the lenient whole-page check instead. Their only
 * tenant ids come from bindings, which the caller checks against the tenant first.
 */
export function applyServerOps(stored: PageData | null | undefined, ops: readonly PageOp[]): ApplyAgentOpsResult {
  const page = clonePage(stored);
  const errors: string[] = [];
  const applied: PageOp[] = [];
  ops.forEach((op, i) => {
    const warning = applyOpInPlace(page, op, pageCatalog);
    if (warning) errors.push(`ops[${i}]: ${warning}`);
    else applied.push(op);
  });
  const check = pageCatalog.validatePage(page);
  errors.push(...check.errors);
  return { data: page, errors, warnings: check.warnings, idMap: {}, applied };
}

// ── Concurrency (critique F4) ────────────────────────────────────────────────

/** Same instant? Exact string first (the DB's own value), then by parsed time. */
export function sameTimestamp(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && ta === tb && !/\.\d{4,}/.test(a) && !/\.\d{4,}/.test(b);
}

// ── Plan cap (design §6: the free plan's 1-page cap, also enforced on MCP) ───

export const FREE_PLAN_PAGE_LIMIT = 1;

/** Upgrade message when a free-plan school already has its one page; null otherwise. */
export async function freePlanPageCapError(session: LmsSession): Promise<string | null> {
  const client = session.getClient();
  const tenantId = session.getTenantId();
  const { data: planResult, error: planError } = await client.rpc("get_plan_features", { _tenant_id: tenantId });
  if (planError) throw new Error(`Loading the school's plan: ${planError.message}`);
  const plan = (planResult as { plan?: string } | null)?.plan ?? "free";
  if (plan !== "free") return null;
  const { count, error } = await client
    .from("landing_pages")
    .select("page_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Counting landing pages: ${error.message}`);
  if ((count ?? 0) >= FREE_PLAN_PAGE_LIMIT) {
    return "The free plan includes 1 landing page and this school already has it. Edit that page with lms_patch_landing_page, or upgrade the plan to create more pages.";
  }
  return null;
}
