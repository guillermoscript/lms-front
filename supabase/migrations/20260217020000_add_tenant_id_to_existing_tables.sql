-- Add tenant_id column to all existing content tables for multi-tenant support
-- This migration adds tenant_id to tables that the app code queries with .eq('tenant_id', ...)
-- Note: profiles is intentionally excluded (global table, no tenant_id per CLAUDE.md)

-- Default tenant for backfilling existing rows
DO $$ BEGIN RAISE NOTICE 'Adding tenant_id to existing tables...'; END $$;

-- Disable content_versions triggers during migration to avoid NOT NULL constraint on changed_by
ALTER TABLE courses DISABLE TRIGGER USER;
ALTER TABLE lessons DISABLE TRIGGER USER;
ALTER TABLE exams DISABLE TRIGGER USER;
ALTER TABLE exercises DISABLE TRIGGER USER;
ALTER TABLE prompt_templates DISABLE TRIGGER USER;

-- =====================================================
-- 1. COURSES
-- =====================================================
ALTER TABLE courses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE courses SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE courses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE courses ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses(tenant_id);

-- =====================================================
-- 2. ENROLLMENTS
-- =====================================================
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE enrollments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE enrollments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE enrollments ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON enrollments(tenant_id);

-- =====================================================
-- 3. PRODUCTS
-- =====================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE products SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- =====================================================
-- 4. PLANS
-- =====================================================
ALTER TABLE plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE plans SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE plans ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE plans ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_plans_tenant ON plans(tenant_id);

-- =====================================================
-- 5. TRANSACTIONS
-- =====================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE transactions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE transactions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);

-- =====================================================
-- 6. SUBSCRIPTIONS
-- =====================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE subscriptions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE subscriptions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

-- =====================================================
-- 7. LESSONS
-- =====================================================
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE lessons SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE lessons ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lessons ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_lessons_tenant ON lessons(tenant_id);

-- =====================================================
-- 8. EXAMS
-- =====================================================
ALTER TABLE exams ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE exams SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE exams ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE exams ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_exams_tenant ON exams(tenant_id);

-- =====================================================
-- 9. EXAM_SUBMISSIONS
-- =====================================================
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE exam_submissions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE exam_submissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE exam_submissions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_exam_submissions_tenant ON exam_submissions(tenant_id);

-- =====================================================
-- 10. EXERCISES
-- =====================================================
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE exercises SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE exercises ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE exercises ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_exercises_tenant ON exercises(tenant_id);

-- =====================================================
-- 11. COURSE_CATEGORIES
-- =====================================================
ALTER TABLE course_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE course_categories SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE course_categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE course_categories ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_course_categories_tenant ON course_categories(tenant_id);

-- =====================================================
-- 12. PRODUCT_COURSES
-- =====================================================
ALTER TABLE product_courses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE product_courses SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE product_courses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE product_courses ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_product_courses_tenant ON product_courses(tenant_id);

-- =====================================================
-- 13. CERTIFICATES
-- =====================================================
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE certificates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE certificates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE certificates ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_certificates_tenant ON certificates(tenant_id);

-- =====================================================
-- 14. PAYMENT_REQUESTS
-- =====================================================
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE payment_requests SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE payment_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_requests ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant ON payment_requests(tenant_id);

-- =====================================================
-- 15. PROMPT_TEMPLATES
-- =====================================================
ALTER TABLE prompt_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE prompt_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
-- prompt_templates can be global (null tenant_id) or tenant-scoped, so don't set NOT NULL
CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant ON prompt_templates(tenant_id);

-- =====================================================
-- 16. NOTIFICATION_TEMPLATES (from notifications system)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_templates' AND table_schema = 'public') THEN
    ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    UPDATE notification_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON notification_templates(tenant_id);
  END IF;
END $$;

-- Re-enable triggers
ALTER TABLE courses ENABLE TRIGGER USER;
ALTER TABLE lessons ENABLE TRIGGER USER;
ALTER TABLE exams ENABLE TRIGGER USER;
ALTER TABLE exercises ENABLE TRIGGER USER;
ALTER TABLE prompt_templates ENABLE TRIGGER USER;

DO $$ BEGIN RAISE NOTICE 'tenant_id columns added to all content tables.'; END $$;
