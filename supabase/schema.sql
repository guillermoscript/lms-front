
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

CREATE SCHEMA IF NOT EXISTS "public";

ALTER SCHEMA "public" OWNER TO "pg_database_owner";

CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

CREATE TYPE "public"."course_status" AS ENUM (
    'draft',
    'published',
    'archived'
);

ALTER TYPE "public"."course_status" OWNER TO "postgres";

CREATE TYPE "public"."enrollment_status" AS ENUM (
    'active',
    'completed',
    'inactive'
);

ALTER TYPE "public"."enrollment_status" OWNER TO "postgres";

CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'unpaid',
    'paid',
    'pending'
);

ALTER TYPE "public"."invoice_status" OWNER TO "postgres";

CREATE TYPE "public"."language_code" AS ENUM (
    'aa',
    'ab',
    'ac',
    'ad',
    'ae',
    'af',
    'ag',
    'ah',
    'ai',
    'aj',
    'ak',
    'al',
    'am',
    'an',
    'ao',
    'ap',
    'aq',
    'ar',
    'as',
    'at',
    'au',
    'av',
    'aw',
    'ax',
    'ay',
    'azba',
    'bb',
    'bc',
    'bd',
    'be',
    'bf',
    'bg',
    'bh',
    'bi',
    'bj',
    'bk',
    'bl',
    'bm',
    'bn',
    'bo',
    'bp',
    'bq',
    'br',
    'bs',
    'bt',
    'bu',
    'bv',
    'bw',
    'bx',
    'by',
    'bzca',
    'cb',
    'cc',
    'cd',
    'ce',
    'cf',
    'cg',
    'ch',
    'ci',
    'cj',
    'ck',
    'cl',
    'cm',
    'cn',
    'co',
    'cp',
    'cq',
    'cr',
    'cs',
    'ct',
    'cu',
    'cv',
    'cw',
    'cx',
    'cy',
    'czda',
    'db',
    'dc',
    'dd',
    'de',
    'df',
    'dg',
    'dh',
    'di',
    'dj',
    'dk',
    'dl',
    'dm',
    'dn',
    'do',
    'dp',
    'dq',
    'dr',
    'ds',
    'dt',
    'du',
    'dv',
    'dw',
    'dx',
    'dy',
    'dzea',
    'eb',
    'ec',
    'ed',
    'ee',
    'ef',
    'eg',
    'eh',
    'ei',
    'ej',
    'ek',
    'el',
    'em',
    'en',
    'eo',
    'ep',
    'eq',
    'er',
    'es',
    'et',
    'eu',
    'ev',
    'ew',
    'ex',
    'ey',
    'ezfa',
    'fb',
    'fc',
    'fd',
    'fe',
    'ff',
    'fg',
    'fh',
    'fi',
    'fj',
    'fk',
    'fl',
    'fm',
    'fn',
    'fo',
    'fp',
    'fq',
    'fr',
    'fs',
    'ft',
    'fu',
    'fv',
    'fw',
    'fx',
    'fy',
    'fzga',
    'gb',
    'gc',
    'gd',
    'ge',
    'gf',
    'gg',
    'gh',
    'gi',
    'gj',
    'gk',
    'gl',
    'gm',
    'gn',
    'go',
    'gp',
    'gq',
    'gr',
    'gs',
    'gt',
    'gu',
    'gv',
    'gw',
    'gx',
    'gy',
    'gzha',
    'hb',
    'hc',
    'hd',
    'he',
    'hf',
    'hg',
    'hh',
    'hi',
    'hj',
    'hk',
    'hl',
    'hm',
    'hn',
    'ho',
    'hp',
    'hq',
    'hr',
    'hs',
    'ht',
    'hu',
    'hv',
    'hw',
    'hx',
    'hy',
    'hzia',
    'ib',
    'ic',
    'id',
    'ie',
    'if',
    'ig',
    'ih',
    'ii',
    'ij',
    'ik',
    'il',
    'im',
    'in',
    'io',
    'ip',
    'iq',
    'ir',
    'is',
    'it',
    'iu',
    'iv',
    'iw',
    'ix',
    'iy',
    'izja',
    'jb',
    'jc',
    'jd',
    'je',
    'jf',
    'jg',
    'jh',
    'ji',
    'jj',
    'jk',
    'jl',
    'jm',
    'jn',
    'jo',
    'jp',
    'jq',
    'jr',
    'js',
    'jt',
    'ju',
    'jv',
    'jw',
    'jx',
    'jy',
    'jzka',
    'kb',
    'kc',
    'kd',
    'ke',
    'kf',
    'kg',
    'kh',
    'ki',
    'kj',
    'kk',
    'kl',
    'km',
    'kn',
    'ko',
    'kp',
    'kq',
    'kr',
    'ks',
    'kt',
    'ku',
    'kv',
    'kw',
    'kx',
    'ky',
    'kzla',
    'lb',
    'lc',
    'ld',
    'le',
    'lf',
    'lg',
    'lh',
    'li',
    'lj',
    'lk',
    'll',
    'lm',
    'ln',
    'lo',
    'lp',
    'lq',
    'lr',
    'ls',
    'lt',
    'lu',
    'lv',
    'lw',
    'lx',
    'ly',
    'lzma',
    'mb',
    'mc',
    'md',
    'me',
    'mf',
    'mg',
    'mh',
    'mi',
    'mj',
    'mk',
    'ml',
    'mm',
    'mn',
    'mo',
    'mp',
    'mq',
    'mr',
    'ms',
    'mt',
    'mu',
    'mv',
    'mw',
    'mx',
    'my',
    'mzna',
    'nb',
    'nc',
    'nd',
    'ne',
    'nf',
    'ng',
    'nh',
    'ni',
    'nj',
    'nk',
    'nl',
    'nm',
    'nn',
    'no',
    'np',
    'nq',
    'nr',
    'ns',
    'nt',
    'nu',
    'nv',
    'nw',
    'nx',
    'ny',
    'nzoa',
    'ob',
    'oc',
    'od',
    'oe',
    'of',
    'og',
    'oh',
    'oi',
    'oj',
    'ok',
    'ol',
    'om',
    'on',
    'oo',
    'op',
    'oq',
    'or',
    'os',
    'ot',
    'ou',
    'ov',
    'ow',
    'ox',
    'oy',
    'ozpa',
    'pb',
    'pc',
    'pd',
    'pe',
    'pf',
    'pg',
    'ph',
    'pi',
    'pj',
    'pk',
    'pl',
    'pm',
    'pn',
    'po',
    'pp',
    'pq',
    'pr',
    'ps',
    'pt',
    'pu',
    'pv',
    'pw',
    'px',
    'py',
    'pzqa',
    'qb',
    'qc',
    'qd',
    'qe',
    'qf',
    'qg',
    'qh',
    'qi',
    'qj',
    'qk',
    'ql',
    'qm',
    'qn',
    'qo',
    'qp',
    'qq',
    'qr',
    'qs',
    'qt',
    'qu',
    'qv',
    'qw',
    'qx',
    'qy',
    'qzra',
    'rb',
    'rc',
    'rd',
    're',
    'rf',
    'rg',
    'rh',
    'ri',
    'rj',
    'rk',
    'rl',
    'rm',
    'rn',
    'ro',
    'rp',
    'rq',
    'rr',
    'rs',
    'rt',
    'ru',
    'rv',
    'rw',
    'rx',
    'ry',
    'rzsa',
    'sb',
    'sc',
    'sd',
    'se',
    'sf',
    'sg',
    'sh',
    'si',
    'sj',
    'sk',
    'sl',
    'sm',
    'sn',
    'so',
    'sp',
    'sq',
    'sr',
    'ss',
    'st',
    'su',
    'sv',
    'sw',
    'sx',
    'sy',
    'szta',
    'tb',
    'tc',
    'td',
    'te',
    'tf',
    'tg',
    'th',
    'ti',
    'tj',
    'tk',
    'tl',
    'tm',
    'tn',
    'to',
    'tp',
    'tq',
    'tr',
    'ts',
    'tt',
    'tu',
    'tv',
    'tw',
    'tx',
    'ty',
    'tzua',
    'ub',
    'uc',
    'ud',
    'ue',
    'uf',
    'ug',
    'uh',
    'ui',
    'uj',
    'uk',
    'ul',
    'um',
    'un',
    'uo',
    'up',
    'uq',
    'ur',
    'us',
    'ut',
    'uu',
    'uv',
    'uw',
    'ux',
    'uy',
    'uzva',
    'vb',
    'vc',
    'vd',
    've',
    'vf',
    'vg',
    'vh',
    'vi',
    'vj',
    'vk',
    'vl',
    'vm',
    'vn',
    'vo',
    'vp',
    'vq',
    'vr',
    'vs',
    'vt',
    'vu',
    'vv',
    'vw',
    'vx',
    'vy',
    'vzwa',
    'wb',
    'wc',
    'wd',
    'we',
    'wf',
    'wg',
    'wh',
    'wi',
    'wj',
    'wk',
    'wl',
    'wm',
    'wn',
    'wo',
    'wp',
    'wq',
    'wr',
    'ws',
    'wt',
    'wu',
    'wv',
    'ww',
    'wx',
    'wy',
    'wzxa',
    'xb',
    'xc',
    'xd',
    'xe',
    'xf',
    'xg',
    'xh',
    'xi',
    'xj',
    'xk',
    'xl',
    'xm',
    'xn',
    'xo',
    'xp',
    'xq',
    'xr',
    'xs',
    'xt',
    'xu',
    'xv',
    'xw',
    'xx',
    'xy',
    'xzya',
    'yb',
    'yc',
    'yd',
    'ye',
    'yf',
    'yg',
    'yh',
    'yi',
    'yj',
    'yk',
    'yl',
    'ym',
    'yn',
    'yo',
    'yp',
    'yq',
    'yr',
    'ys',
    'yt',
    'yu',
    'yv',
    'yw',
    'yx',
    'yy',
    'yzza',
    'zb',
    'zc',
    'zd',
    'ze',
    'zf',
    'zg',
    'zh',
    'zi',
    'zj',
    'zk',
    'zl',
    'zm',
    'zn',
    'zo',
    'zp',
    'zq',
    'zr',
    'zs',
    'zt',
    'zu',
    'zv',
    'zw',
    'zx',
    'zy',
    'zz'
);

ALTER TYPE "public"."language_code" OWNER TO "postgres";

CREATE TYPE "public"."lesson_progress_status" AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);

ALTER TYPE "public"."lesson_progress_status" OWNER TO "postgres";

CREATE TYPE "public"."subscription_status" AS ENUM (
    'inactive',
    'active',
    'upgraded'
);

ALTER TYPE "public"."subscription_status" OWNER TO "postgres";

CREATE TYPE "public"."user_question_type" AS ENUM (
    'multiple_choices',
    'true_false',
    'fill_in'
);

ALTER TYPE "public"."user_question_type" OWNER TO "postgres";

CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'teacher',
    'student'
);

ALTER TYPE "public"."user_role" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."add_role_to_custom_claim"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM set_claim(NEW.user_id::UUID, 'user_role'::TEXT, ARRAY_TO_JSON(NEW.roles)::jsonb);
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."add_role_to_custom_claim"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."auth_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    user_role public.user_role;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$;

ALTER FUNCTION "public"."auth_role"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    user_has_role BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.roles
        JOIN public.user_roles ON roles.id = user_roles.role_id
        WHERE user_roles.profile_id = user_id
          AND roles.role = role_to_check::user_role -- Cast to user_role type
    ) INTO user_has_role;

    RETURN user_has_role;
END;
$$;

ALTER FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "public"."user_role") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    user_has_role BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.roles
        JOIN public.user_roles ON roles.id = user_roles.role_id
        WHERE user_roles.profile_id = user_id
          AND roles.role = role_to_check
    ) INTO user_has_role;

    RETURN user_has_role;
END;
$$;

ALTER FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "public"."user_role") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_user_permission"("user_id" "uuid", "permission" "public"."user_role") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $_$
    SELECT EXISTS ( SELECT p.id
    FROM profiles p
    WHERE ((p.id = $1) AND (p.role = $2)))
$_$;

ALTER FUNCTION "public"."check_user_permission"("user_id" "uuid", "permission" "public"."user_role") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN 'error: access denied';
      ELSE        
        update auth.users set raw_app_meta_data = 
          raw_app_meta_data - claim where id = uid;
        return 'OK';
      END IF;
    END;
$$;

ALTER FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE retval jsonb;
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN '{"error":"access denied"}'::jsonb;
      ELSE
        select coalesce(raw_app_meta_data->claim, null) from auth.users into retval where id = uid::uuid;
        return retval;
      END IF;
    END;
$$;

ALTER FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_claims"("uid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE retval jsonb;
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN '{"error":"access denied"}'::jsonb;
      ELSE
        select raw_app_meta_data from auth.users into retval where id = uid::uuid;
        return retval;
      END IF;
    END;
$$;

ALTER FUNCTION "public"."get_claims"("uid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_course_progress"("course_id_arg" bigint, "user_id_arg" "uuid") RETURNS TABLE("user_id" "uuid", "course_id" bigint, "completed_lessons" integer, "total_lessons" integer, "progress_percentage" numeric, "total_tests" integer, "tests_submitted" integer, "tests_approved" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH total_lessons_cte AS (
        SELECT COUNT(*)::INT AS total
        FROM public.lessons AS l
        WHERE l.course_id = course_id_arg AND l.deleted_at IS NULL
    ),
    completed_lessons_cte AS (
        SELECT COUNT(*)::INT AS completed
        FROM public.lesson_progress AS lp
        INNER JOIN public.lessons AS l ON lp.lesson_id = l.id
        WHERE lp.user_id = user_id_arg AND lp.progress_status = 'completed'
          AND l.course_id = course_id_arg AND l.deleted_at IS NULL
    ),
    total_tests_cte AS (
        SELECT COUNT(*)::INT AS total
        FROM public.tests AS t
        WHERE t.course_id = course_id_arg
    ),
    tests_submissions_cte AS (
        SELECT COUNT(*)::INT AS submitted, COUNT(*) FILTER (WHERE ts.is_approved)::INT AS approved
        FROM public.test_submissions AS ts
        INNER JOIN public.tests AS t ON ts.test_id = t.id
        WHERE ts.user_id = user_id_arg AND ts.is_latest AND t.course_id = course_id_arg
    )
    SELECT
        user_id_arg AS user_id,
        course_id_arg AS course_id,
        COALESCE((SELECT completed FROM completed_lessons_cte), 0) AS completed_lessons,
        COALESCE((SELECT total FROM total_lessons_cte), 0) AS total_lessons,
        COALESCE(
            ROUND(
                COALESCE((SELECT completed FROM completed_lessons_cte), 0)::NUMERIC
                / GREATEST(COALESCE((SELECT total FROM total_lessons_cte), 1), 1) * 100.0,
                2
            ),
            0
        ) AS progress_percentage,
        COALESCE((SELECT total FROM total_tests_cte), 0) AS total_tests,
        COALESCE((SELECT submitted FROM tests_submissions_cte), 0) AS tests_submitted,
        COALESCE((SELECT approved FROM tests_submissions_cte), 0) AS tests_approved
    FROM
        total_lessons_cte, completed_lessons_cte, total_tests_cte, tests_submissions_cte;
END;
$$;

ALTER FUNCTION "public"."get_course_progress"("course_id_arg" bigint, "user_id_arg" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_claim"("claim" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  	coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' -> claim, null)
$$;

ALTER FUNCTION "public"."get_my_claim"("claim" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_claims"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  	coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata', '{}'::jsonb)::jsonb
$$;

ALTER FUNCTION "public"."get_my_claims"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE 
    role_name TEXT;
BEGIN
    SELECT r.role INTO role_name
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.profile_id = user_id;
    
    RETURN role_name;
END;
$$;

ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    user_role public.user_role;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN user_role = 'admin';
END;
$$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin_or_teacher"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Attempt to find a user role without invoking RLS on user_roles table
    SELECT INTO user_role roles.role
    FROM public.roles
    JOIN public.user_roles ON roles.id = user_roles.role_id
    WHERE user_roles.profile_id = user_id
    AND roles.role IN ('admin', 'teacher')
    LIMIT 1;

    -- Return whether the user is an admin or teacher
    RETURN user_role IS NOT NULL;
END;
$$;

ALTER FUNCTION "public"."is_admin_or_teacher"("user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_claims_admin"() RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    IF session_user = 'authenticator' THEN
      --------------------------------------------
      -- To disallow any authenticated app users
      -- from editing claims, delete the following
      -- block of code and replace it with:
      -- RETURN FALSE;
      --------------------------------------------
      IF extract(epoch from now()) > coalesce((current_setting('request.jwt.claims', true)::jsonb)->>'exp', '0')::numeric THEN
        return false; -- jwt expired
      END IF;
      If current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
        RETURN true; -- service role users have admin rights
      END IF;
      IF coalesce((current_setting('request.jwt.claims', true)::jsonb)->'app_metadata'->'claims_admin', 'false')::bool THEN
        return true; -- user has claims_admin set to true
      ELSE
        return false; -- user does NOT have claims_admin set to true
      END IF;
      --------------------------------------------
      -- End of block 
      --------------------------------------------
    ELSE -- not a user session, probably being called from a trigger or something
      return true;
    END IF;
  END;
$$;

ALTER FUNCTION "public"."is_claims_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer DEFAULT NULL::integer, "filter" "jsonb" DEFAULT '{}'::"jsonb", "match_threshold" double precision DEFAULT NULL::double precision) RETURNS TABLE("id" bigint, "content" "text", "metadata" "jsonb", "embedding" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    (embedding::text)::jsonb as embedding,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  and (match_threshold is null or (1 - (documents.embedding <=> query_embedding)) > match_threshold)
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

ALTER FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb", "match_threshold" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_purchase"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    _product_id BIGINT;
    _plan_id BIGINT;
    _is_subscription BOOLEAN;
    _billing_interval INTERVAL;
BEGIN
    FOR _product_id, _is_subscription IN
        SELECT p.id, p.is_subscription
        FROM invoice_line_items ili
        JOIN products p ON p.id = ili.product_id
        WHERE ili.invoice_id = NEW.id
    LOOP
        IF _is_subscription THEN
            SELECT billing_interval INTO _billing_interval FROM plans WHERE id = _product_id;

            INSERT INTO subscriptions (customer_id, plan_id, invoice_id, status, starts_at, ends_at)
            VALUES (NEW.customer_id, _product_id, NEW.id, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + _billing_interval);
        
            FOR _plan_id IN
                SELECT plan_id
                FROM plan_courses
                WHERE plan_id = _product_id
            LOOP
                -- Insert logic for plan_courses here
            END LOOP;        
        -- Handle course products (assuming one course per product)
        ELSE
            INSERT INTO course_enrollments (course_id, user_id, enrolled_at, status)
            VALUES (_plan_id, NEW.customer_id, CURRENT_TIMESTAMP, 'active');
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."process_purchase"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN 'error: access denied';
      ELSE        
        update auth.users set raw_app_meta_data = 
          raw_app_meta_data || 
            json_build_object(claim, value)::jsonb where id = uid;
        return 'OK';
      END IF;
    END;
$$;

ALTER FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_is_approved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.is_approved = NEW.score >= 9.5;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_is_approved"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."comment_reactions" (
    "id" "uuid" NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "comment_reactions_reaction_type_check" CHECK ((("reaction_type")::"text" = ANY (ARRAY[('like'::character varying)::"text", ('love'::character varying)::"text", ('insightful'::character varying)::"text", ('curious'::character varying)::"text"])))
);

ALTER TABLE "public"."comment_reactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "content_type" character varying(255) NOT NULL,
    "entity_type" character varying(255) NOT NULL,
    "entity_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "comments_content_type_check" CHECK ((("content_type")::"text" = ANY (ARRAY[('markdown'::character varying)::"text", ('text'::character varying)::"text"]))),
    CONSTRAINT "comments_entity_type_check" CHECK ((("entity_type")::"text" = ANY (ARRAY[('course'::character varying)::"text", ('lesson'::character varying)::"text", ('test'::character varying)::"text"])))
);

ALTER TABLE "public"."comments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."course_categories" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."course_categories" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."course_categories_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."course_categories_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."course_categories_id_seq" OWNED BY "public"."course_categories"."id";

CREATE TABLE IF NOT EXISTS "public"."course_enrollments" (
    "id" bigint NOT NULL,
    "course_id" bigint,
    "user_id" "uuid",
    "enrolled_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "progress" integer DEFAULT 0,
    "completed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "status" "public"."enrollment_status" DEFAULT 'active'::"public"."enrollment_status" NOT NULL,
    "last_accessed_lesson_id" bigint
);

ALTER TABLE "public"."course_enrollments" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."course_enrollments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."course_enrollments_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."course_enrollments_id_seq" OWNED BY "public"."course_enrollments"."id";

CREATE TABLE IF NOT EXISTS "public"."course_purchases" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "course_id" bigint,
    "purchased_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."course_purchases" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."course_purchases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."course_purchases_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."course_purchases_id_seq" OWNED BY "public"."course_purchases"."id";

CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" bigint NOT NULL,
    "product_id" bigint,
    "title" "text" NOT NULL,
    "description" "text",
    "thumbnail_url" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "author_id" "uuid",
    "status" "public"."course_status" DEFAULT 'draft'::"public"."course_status" NOT NULL,
    "archived_at" timestamp with time zone,
    "tags" "text"[],
    "category_id" bigint
);

ALTER TABLE "public"."courses" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."courses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."courses_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."courses_id_seq" OWNED BY "public"."courses"."id";

CREATE TABLE IF NOT EXISTS "public"."currencies" (
    "id" bigint NOT NULL,
    "code" character(3) NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."currencies" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."currencies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."currencies_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."currencies_id_seq" OWNED BY "public"."currencies"."id";

CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" bigint NOT NULL,
    "content" "text",
    "metadata" "jsonb",
    "embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "public"."documents" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."documents_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."documents_id_seq" OWNED BY "public"."documents"."id";

CREATE TABLE IF NOT EXISTS "public"."invoice_line_items" (
    "id" bigint NOT NULL,
    "invoice_id" integer NOT NULL,
    "product_id" bigint NOT NULL,
    "line_amount" integer DEFAULT 0 NOT NULL,
    "vat_amount" integer DEFAULT 0 NOT NULL,
    "vat_percentage" integer DEFAULT 0 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "quantity" numeric(12,2) DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."invoice_line_items" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."invoice_line_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."invoice_line_items_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."invoice_line_items_id_seq" OWNED BY "public"."invoice_line_items"."id";

CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" bigint NOT NULL,
    "status" "public"."invoice_status" DEFAULT 'unpaid'::"public"."invoice_status" NOT NULL,
    "invoice_number" integer NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "country" character varying(2) NOT NULL,
    "currency" bigint NOT NULL,
    "invoice_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_date" timestamp with time zone NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."invoices" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."invoices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."invoices_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."invoices_id_seq" OWNED BY "public"."invoices"."id";

ALTER TABLE "public"."invoices" ALTER COLUMN "invoice_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."invoices_invoice_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."lesson_localizations" (
    "lesson_id" bigint NOT NULL,
    "language_code" "public"."language_code" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text"
);

ALTER TABLE "public"."lesson_localizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "lesson_id" bigint,
    "progress_status" "public"."lesson_progress_status" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone
);

ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."lesson_progress_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."lesson_progress_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."lesson_progress_id_seq" OWNED BY "public"."lesson_progress"."id";

CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" bigint NOT NULL,
    "course_id" bigint,
    "video_url" "text",
    "sequence" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "embed" "text"
);

ALTER TABLE "public"."lessons" OWNER TO "postgres";

COMMENT ON COLUMN "public"."lessons"."embed" IS 'just plain html to embed on the front';

CREATE SEQUENCE IF NOT EXISTS "public"."lessons_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."lessons_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."lessons_id_seq" OWNED BY "public"."lessons"."id";

CREATE TABLE IF NOT EXISTS "public"."plan_courses" (
    "plan_id" bigint NOT NULL,
    "course_id" bigint NOT NULL
);

ALTER TABLE "public"."plan_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone,
    "billing_interval" interval DEFAULT '1 year'::interval NOT NULL
);

ALTER TABLE "public"."plans" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."plans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."plans_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."plans_id_seq" OWNED BY "public"."plans"."id";

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" bigint NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" character varying(1000),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone,
    "is_subscription" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."products" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."products_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."products_id_seq" OWNED BY "public"."products"."id";

CREATE TABLE IF NOT EXISTS "public"."products_pricing" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "from_date" "date" NOT NULL,
    "to_date" "date" NOT NULL,
    "price" integer NOT NULL,
    "currency" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."products_pricing" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."products_pricing_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."products_pricing_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."products_pricing_id_seq" OWNED BY "public"."products_pricing"."id";

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "website" "text",
    "bio" "text",
    "currency_id" bigint,
    "stripeCustomerID" "text",
    "preferred_language" "public"."language_code" DEFAULT 'en'::"public"."language_code",
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

COMMENT ON COLUMN "public"."profiles"."preferred_language" IS 'user language';

CREATE TABLE IF NOT EXISTS "public"."question_option_localizations" (
    "option_id" bigint NOT NULL,
    "language_code" "public"."language_code" NOT NULL,
    "option_text" "text" NOT NULL
);

ALTER TABLE "public"."question_option_localizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."question_options" (
    "id" bigint NOT NULL,
    "question_id" bigint,
    "is_correct" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."question_options" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."question_options_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."question_options_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."question_options_id_seq" OWNED BY "public"."question_options"."id";

CREATE TABLE IF NOT EXISTS "public"."related_courses" (
    "course_id" bigint NOT NULL,
    "related_course_id" bigint NOT NULL
);

ALTER TABLE "public"."related_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."related_lessons" (
    "lesson_id" bigint NOT NULL,
    "related_lesson_id" bigint NOT NULL
);

ALTER TABLE "public"."related_lessons" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "public"."user_role" NOT NULL
);

ALTER TABLE "public"."roles" OWNER TO "postgres";

ALTER TABLE "public"."roles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."submission_answers" (
    "id" bigint NOT NULL,
    "submission_id" bigint,
    "question_id" bigint,
    "given_answer" "text",
    "is_correct" boolean,
    "teacher_comment" "text"
);

ALTER TABLE "public"."submission_answers" OWNER TO "postgres";

COMMENT ON COLUMN "public"."submission_answers"."teacher_comment" IS 'The comment from the teacher about the user anwser';

CREATE SEQUENCE IF NOT EXISTS "public"."submission_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."submission_answers_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."submission_answers_id_seq" OWNED BY "public"."submission_answers"."id";

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" bigint NOT NULL,
    "status" "public"."subscription_status" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "plan_id" bigint NOT NULL,
    "invoice_id" bigint NOT NULL,
    "starts_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ends_at" timestamp with time zone,
    "renewed_at" timestamp with time zone,
    "renewed_subscription_id" bigint,
    "downgraded_at" timestamp with time zone,
    "downgraded_to_plan_id" bigint,
    "upgraded_at" timestamp with time zone,
    "upgraded_to_plan_id" bigint,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."subscriptions_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."subscriptions_id_seq" OWNED BY "public"."subscriptions"."id";

CREATE TABLE IF NOT EXISTS "public"."supported_languages" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "public"."language_code" DEFAULT 'en'::"public"."language_code" NOT NULL
);

ALTER TABLE "public"."supported_languages" OWNER TO "postgres";

COMMENT ON COLUMN "public"."supported_languages"."code" IS 'ISO 639-1 alpha-2 language code';

CREATE TABLE IF NOT EXISTS "public"."test_localizations" (
    "test_id" bigint NOT NULL,
    "language_code" "public"."language_code" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text"
);

ALTER TABLE "public"."test_localizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."test_question_localizations" (
    "question_id" bigint NOT NULL,
    "language_code" "public"."language_code" NOT NULL,
    "question_text" "text" NOT NULL,
    "id" bigint
);

ALTER TABLE "public"."test_question_localizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."test_questions" (
    "id" bigint NOT NULL,
    "test_id" bigint,
    "question_type" "public"."user_question_type",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."test_questions" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."test_questions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."test_questions_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."test_questions_id_seq" OWNED BY "public"."test_questions"."id";

CREATE TABLE IF NOT EXISTS "public"."test_submissions" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "test_id" bigint,
    "submitted_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "score" real,
    "is_latest" boolean DEFAULT true,
    "teacher_review" "text",
    "is_approved" boolean DEFAULT false,
    CONSTRAINT "test_submissions_score_check" CHECK ((("score" >= (0)::double precision) AND ("score" <= (20)::double precision)))
);

ALTER TABLE "public"."test_submissions" OWNER TO "postgres";

COMMENT ON COLUMN "public"."test_submissions"."teacher_review" IS 'Optional field to leave a review for the test of the user';

CREATE SEQUENCE IF NOT EXISTS "public"."test_submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."test_submissions_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."test_submissions_id_seq" OWNED BY "public"."test_submissions"."id";

CREATE TABLE IF NOT EXISTS "public"."tests" (
    "id" bigint NOT NULL,
    "course_id" bigint,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "retake_interval" interval,
    "time_for_test" smallint DEFAULT '20'::smallint NOT NULL
);

ALTER TABLE "public"."tests" OWNER TO "postgres";

COMMENT ON COLUMN "public"."tests"."time_for_test" IS 'the time the user has to submit the tes in minutes';

CREATE SEQUENCE IF NOT EXISTS "public"."tests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."tests_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."tests_id_seq" OWNED BY "public"."tests"."id";

CREATE OR REPLACE VIEW "public"."user_progress_for_course" AS
 SELECT "u"."id" AS "user_id",
    "c"."id" AS "course_id",
    COALESCE("count"(DISTINCT "lp"."lesson_id") FILTER (WHERE ("lp"."progress_status" = 'completed'::"public"."lesson_progress_status")), (0)::bigint) AS "completed_lessons",
    "count"(DISTINCT "l"."id") AS "total_lessons",
    COALESCE("round"(((("count"(DISTINCT "lp"."lesson_id") FILTER (WHERE ("lp"."progress_status" = 'completed'::"public"."lesson_progress_status")))::numeric * 100.0) / (NULLIF("count"(DISTINCT "l"."id"), 0))::numeric), 2), (0)::numeric) AS "progress_percentage"
   FROM ((("public"."courses" "c"
     LEFT JOIN "public"."lessons" "l" ON ((("l"."course_id" = "c"."id") AND ("l"."deleted_at" IS NULL))))
     LEFT JOIN "public"."lesson_progress" "lp" ON (("lp"."lesson_id" = "l"."id")))
     LEFT JOIN "auth"."users" "u" ON (("lp"."user_id" = "u"."id")))
  WHERE (("c"."deleted_at" IS NULL) AND (("lp"."user_id" = "u"."id") OR ("lp"."user_id" IS NULL)))
  GROUP BY "u"."id", "c"."id";

ALTER TABLE "public"."user_progress_for_course" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "profile_id" "uuid" NOT NULL,
    "role_id" bigint NOT NULL
);

ALTER TABLE "public"."user_roles" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."vw_user_test_submissions" AS
 SELECT "ts"."user_id",
    "ts"."test_id",
    "ts"."submitted_at",
    "ts"."is_approved",
    "tq"."id" AS "question_id",
    "tql"."question_text",
    "sa"."given_answer",
    "tq"."question_type",
        CASE
            WHEN ("tq"."question_type" = 'multiple_choices'::"public"."user_question_type") THEN ( SELECT "qol"."option_text"
               FROM "public"."question_option_localizations" "qol"
              WHERE (("qol"."option_id" = ("sa"."given_answer")::bigint) AND ("qol"."language_code" = ( SELECT "profiles"."preferred_language"
                       FROM "public"."profiles"
                     LIMIT 1))))
            ELSE NULL::"text"
        END AS "option_text",
        CASE
            WHEN ("tq"."question_type" = 'multiple_choices'::"public"."user_question_type") THEN (EXISTS ( SELECT 1
               FROM "public"."question_options" "qo"
              WHERE (("qo"."question_id" = "tq"."id") AND ("qo"."is_correct" = true) AND ("lower"(("qo"."id")::"text") = "lower"("sa"."given_answer")))))
            WHEN ("tq"."question_type" = 'true_false'::"public"."user_question_type") THEN (EXISTS ( SELECT 1
               FROM "public"."question_options" "qo"
              WHERE (("qo"."question_id" = "tq"."id") AND ("lower"(("qo"."is_correct")::"text") = "lower"("sa"."given_answer")))))
            WHEN ("tq"."question_type" = 'fill_in'::"public"."user_question_type") THEN "sa"."is_correct"
            ELSE false
        END AS "is_correct"
   FROM ((("public"."test_submissions" "ts"
     JOIN "public"."submission_answers" "sa" ON (("ts"."id" = "sa"."submission_id")))
     JOIN "public"."test_questions" "tq" ON (("sa"."question_id" = "tq"."id")))
     LEFT JOIN "public"."test_question_localizations" "tql" ON (("tq"."id" = "tql"."question_id")))
  WHERE ("ts"."is_latest" = true)
  ORDER BY "ts"."submitted_at" DESC, "tq"."id";

ALTER TABLE "public"."vw_user_test_submissions" OWNER TO "postgres";

ALTER TABLE ONLY "public"."course_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."course_categories_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."course_enrollments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."course_enrollments_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."course_purchases" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."course_purchases_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."courses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."courses_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."currencies" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."currencies_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documents_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."invoice_line_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."invoice_line_items_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."invoices" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."invoices_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."lesson_progress" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lesson_progress_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."lessons" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lessons_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."plans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."plans_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."products" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."products_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."products_pricing" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."products_pricing_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."question_options" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."question_options_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."submission_answers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."submission_answers_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."subscriptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."subscriptions_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."test_questions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."test_questions_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."test_submissions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."test_submissions_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."tests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tests_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_comment_id_user_id_reaction_type_key" UNIQUE ("comment_id", "user_id", "reaction_type");

ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."course_categories"
    ADD CONSTRAINT "course_categories_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."course_categories"
    ADD CONSTRAINT "course_categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."course_purchases"
    ADD CONSTRAINT "course_purchases_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."currencies"
    ADD CONSTRAINT "currencies_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "plan_courses_pkey" PRIMARY KEY ("plan_id", "course_id");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."products_pricing"
    ADD CONSTRAINT "products_pricing_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");

ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."related_courses"
    ADD CONSTRAINT "related_courses_pkey" PRIMARY KEY ("course_id", "related_course_id");

ALTER TABLE ONLY "public"."related_lessons"
    ADD CONSTRAINT "related_lessons_pkey" PRIMARY KEY ("lesson_id", "related_lesson_id");

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_role_key" UNIQUE ("role");

ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supported_languages"
    ADD CONSTRAINT "supported_languages_code_key" UNIQUE ("code");

ALTER TABLE ONLY "public"."supported_languages"
    ADD CONSTRAINT "supported_languages_pkey" PRIMARY KEY ("code");

ALTER TABLE ONLY "public"."test_question_localizations"
    ADD CONSTRAINT "test_question_localizations_id_key" UNIQUE ("id");

ALTER TABLE ONLY "public"."test_questions"
    ADD CONSTRAINT "test_questions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."test_submissions"
    ADD CONSTRAINT "test_submissions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tests"
    ADD CONSTRAINT "tests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "unique_lesson_sequence" UNIQUE ("course_id", "sequence");

ALTER TABLE ONLY "public"."products_pricing"
    ADD CONSTRAINT "unique_price_in_interval" EXCLUDE USING "gist" ("product_id" WITH =, "currency" WITH =, "daterange"("from_date", "to_date", '[]'::"text") WITH &&) WHERE (("deleted_at" IS NULL));

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "unique_subscription_in_interval" EXCLUDE USING "gist" ("customer_id" WITH =, "tstzrange"("starts_at", "ends_at", '[]'::"text") WITH &&) WHERE ((("deleted_at" IS NULL) AND ("status" = 'active'::"public"."subscription_status")));

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("profile_id", "role_id");

CREATE OR REPLACE TRIGGER "after_invoice_paid" AFTER UPDATE OF "status" ON "public"."invoices" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = 'paid'::"public"."invoice_status"))) EXECUTE FUNCTION "public"."process_purchase"();

CREATE OR REPLACE TRIGGER "set_is_approved" BEFORE INSERT OR UPDATE ON "public"."test_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_is_approved"();

ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");

ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_last_accessed_lesson_id_fkey" FOREIGN KEY ("last_accessed_lesson_id") REFERENCES "public"."lessons"("id");

ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."course_purchases"
    ADD CONSTRAINT "course_purchases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");

ALTER TABLE ONLY "public"."course_purchases"
    ADD CONSTRAINT "course_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "fk_category" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id");

ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "fk_course" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."lesson_localizations"
    ADD CONSTRAINT "fk_lesson_localization_language" FOREIGN KEY ("language_code") REFERENCES "public"."supported_languages"("code");

ALTER TABLE ONLY "public"."lesson_localizations"
    ADD CONSTRAINT "fk_lesson_localization_lesson" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."question_option_localizations"
    ADD CONSTRAINT "fk_option_localization_language" FOREIGN KEY ("language_code") REFERENCES "public"."supported_languages"("code");

ALTER TABLE ONLY "public"."question_option_localizations"
    ADD CONSTRAINT "fk_option_localization_option" FOREIGN KEY ("option_id") REFERENCES "public"."question_options"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."plan_courses"
    ADD CONSTRAINT "fk_plan" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "fk_profile" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."test_question_localizations"
    ADD CONSTRAINT "fk_question_localization_language" FOREIGN KEY ("language_code") REFERENCES "public"."supported_languages"("code");

ALTER TABLE ONLY "public"."test_question_localizations"
    ADD CONSTRAINT "fk_question_localization_question" FOREIGN KEY ("question_id") REFERENCES "public"."test_questions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "fk_role" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."test_localizations"
    ADD CONSTRAINT "fk_test_localization_language" FOREIGN KEY ("language_code") REFERENCES "public"."supported_languages"("code");

ALTER TABLE ONLY "public"."test_localizations"
    ADD CONSTRAINT "fk_test_localization_test" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_currency_fkey" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id");

ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."products_pricing"
    ADD CONSTRAINT "products_pricing_currency_fkey" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."products_pricing"
    ADD CONSTRAINT "products_pricing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."test_questions"("id");

ALTER TABLE ONLY "public"."related_courses"
    ADD CONSTRAINT "related_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");

ALTER TABLE ONLY "public"."related_courses"
    ADD CONSTRAINT "related_courses_related_course_id_fkey" FOREIGN KEY ("related_course_id") REFERENCES "public"."courses"("id");

ALTER TABLE ONLY "public"."related_lessons"
    ADD CONSTRAINT "related_lessons_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id");

ALTER TABLE ONLY "public"."related_lessons"
    ADD CONSTRAINT "related_lessons_related_lesson_id_fkey" FOREIGN KEY ("related_lesson_id") REFERENCES "public"."lessons"("id");

ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."test_questions"("id");

ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."test_submissions"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_downgraded_to_plan_id_fkey" FOREIGN KEY ("downgraded_to_plan_id") REFERENCES "public"."plans"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_renewed_subscription_id_fkey" FOREIGN KEY ("renewed_subscription_id") REFERENCES "public"."subscriptions"("id");

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_upgraded_to_plan_id_fkey" FOREIGN KEY ("upgraded_to_plan_id") REFERENCES "public"."plans"("id");

ALTER TABLE ONLY "public"."test_questions"
    ADD CONSTRAINT "test_questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id");

ALTER TABLE ONLY "public"."test_submissions"
    ADD CONSTRAINT "test_submissions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id");

ALTER TABLE ONLY "public"."test_submissions"
    ADD CONSTRAINT "test_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."tests"
    ADD CONSTRAINT "tests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");

CREATE POLICY "ADMIN FULL ACCESS" ON "public"."roles" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Admin Full Access" ON "public"."supported_languages" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Enable insert for admin users only" ON "public"."course_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Enable insert for authenticated users only" ON "public"."comment_reactions" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."course_enrollments" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."invoice_line_items" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."related_courses" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Enable insert for authenticated users only" ON "public"."related_lessons" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Enable read access for all  auth users" ON "public"."related_courses" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Enable read access for all  auth users" ON "public"."related_lessons" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Enable read access for all  auth users" ON "public"."test_submissions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Enable read access for all users" ON "public"."comment_reactions" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."comments" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."course_categories" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."currencies" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."supported_languages" FOR SELECT USING (true);

CREATE POLICY "Enable update for admin users" ON "public"."course_categories" FOR UPDATE TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Enable update for users that are authenticaded" ON "public"."comment_reactions" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

CREATE POLICY "Full access for admin" ON "public"."user_roles" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Full access for admins" ON "public"."lessons" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Full admin access" ON "public"."lesson_localizations" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "Update user own " ON "public"."lesson_progress" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" IN ( SELECT "lessons"."course_id"
           FROM "public"."lessons"
          WHERE ("lessons"."id" = "lesson_progress"."lesson_id"))) AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" IN ( SELECT "lessons"."course_id"
           FROM "public"."lessons"
          WHERE ("lessons"."id" = "lesson_progress"."lesson_id"))) AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "User can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "access_own_lessons" ON "public"."lessons" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" = "lessons"."course_id") AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status") AND (("course_enrollments"."completed_at" IS NULL) OR ("course_enrollments"."completed_at" > CURRENT_TIMESTAMP))))) OR (EXISTS ( SELECT 1
   FROM ("public"."subscriptions"
     JOIN "public"."plan_courses" ON (("subscriptions"."plan_id" = "plan_courses"."plan_id")))
  WHERE (("subscriptions"."customer_id" = "auth"."uid"()) AND ("plan_courses"."course_id" = "lessons"."course_id") AND ("subscriptions"."status" = 'active'::"public"."subscription_status") AND (("subscriptions"."ends_at" IS NULL) OR ("subscriptions"."ends_at" > CURRENT_TIMESTAMP)))))));

CREATE POLICY "admin_access_lesson_progress" ON "public"."lesson_progress" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_access_tests" ON "public"."tests" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."course_enrollments" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."courses" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."currencies" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."invoice_line_items" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."invoices" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."plan_courses" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."plans" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."products" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."products_pricing" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."question_option_localizations" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."question_options" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."submission_answers" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."subscriptions" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."test_localizations" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."test_question_localizations" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."test_questions" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

CREATE POLICY "admin_full_access" ON "public"."test_submissions" TO "authenticated" USING ("public"."check_role"("auth"."uid"(), 'admin'::"text")) WITH CHECK ("public"."check_role"("auth"."uid"(), 'admin'::"text"));

ALTER TABLE "public"."comment_reactions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."course_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."course_enrollments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."currencies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."invoice_line_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lesson_localizations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."plan_courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."products_pricing" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_products" ON "public"."products" FOR SELECT USING (true);

CREATE POLICY "public_read_products_pricing" ON "public"."products_pricing" FOR SELECT USING (true);

ALTER TABLE "public"."related_courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."related_lessons" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_admin_roles" ON "public"."profiles" FOR SELECT USING ("public"."check_role"(( SELECT "uid"."uid"
   FROM "auth"."uid"() "uid"("uid")), 'admin'::"text"));

CREATE POLICY "select_own_role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "uid"."uid"
   FROM "auth"."uid"() "uid"("uid"))));

CREATE POLICY "student_read_courses" ON "public"."courses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" = "courses"."id") AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "student_read_enrollments" ON "public"."course_enrollments" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "student_read_invoice_line_items" ON "public"."invoice_line_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("auth"."uid"() = "invoices"."customer_id")))));

CREATE POLICY "student_read_invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "customer_id"));

CREATE POLICY "student_read_lesson_localizations" ON "public"."lesson_localizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" IN ( SELECT "lessons"."course_id"
           FROM "public"."lessons"
          WHERE ("lessons"."id" = "lesson_localizations"."lesson_id"))) AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "student_read_lesson_progress" ON "public"."lesson_progress" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" IN ( SELECT "lessons"."course_id"
           FROM "public"."lessons"
          WHERE ("lessons"."id" = "lesson_progress"."lesson_id"))) AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "student_read_tests" ON "public"."tests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_enrollments"
  WHERE (("course_enrollments"."user_id" = "auth"."uid"()) AND ("course_enrollments"."course_id" = "tests"."course_id") AND ("course_enrollments"."status" = 'active'::"public"."enrollment_status")))));

ALTER TABLE "public"."submission_answers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supported_languages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_access" ON "public"."test_submissions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "user_read_question_option_localizations" ON "public"."question_option_localizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."question_options" "qo"
     JOIN "public"."test_questions" "tq" ON (("qo"."question_id" = "tq"."id")))
     JOIN "public"."tests" "t" ON (("tq"."test_id" = "t"."id")))
     JOIN "public"."course_enrollments" "ce" ON (("t"."course_id" = "ce"."course_id")))
  WHERE (("ce"."user_id" = "auth"."uid"()) AND ("qo"."id" = "question_option_localizations"."option_id") AND ("ce"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "user_read_question_options" ON "public"."question_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."course_enrollments" "ce"
     JOIN "public"."tests" "t" ON (("ce"."course_id" = "t"."course_id")))
     JOIN "public"."test_questions" "tq" ON (("t"."id" = "tq"."test_id")))
  WHERE (("ce"."user_id" = "auth"."uid"()) AND ("tq"."id" = "question_options"."question_id") AND ("ce"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "user_read_test_localizations" ON "public"."test_localizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tests" "t"
     JOIN "public"."course_enrollments" "ce" ON (("t"."course_id" = "ce"."course_id")))
  WHERE (("ce"."user_id" = "auth"."uid"()) AND ("t"."id" = "test_localizations"."test_id") AND ("ce"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "user_read_test_question_localizations" ON "public"."test_question_localizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."test_questions" "tq"
     JOIN "public"."tests" "t" ON (("tq"."test_id" = "t"."id")))
     JOIN "public"."course_enrollments" "ce" ON (("t"."course_id" = "ce"."course_id")))
  WHERE (("ce"."user_id" = "auth"."uid"()) AND ("tq"."id" = "test_question_localizations"."question_id") AND ("ce"."status" = 'active'::"public"."enrollment_status")))));

CREATE POLICY "user_read_test_questions" ON "public"."test_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tests" "t"
     JOIN "public"."course_enrollments" "ce" ON (("t"."course_id" = "ce"."course_id")))
  WHERE (("ce"."user_id" = "auth"."uid"()) AND ("t"."id" = "test_questions"."test_id") AND ("ce"."status" = 'active'::"public"."enrollment_status")))));

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_view_own_answers" ON "public"."submission_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."test_submissions"
  WHERE (("test_submissions"."id" = "submission_answers"."submission_id") AND ("test_submissions"."user_id" = "auth"."uid"())))));

CREATE POLICY "user_view_own_subscriptions" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "customer_id"));

CREATE POLICY "user_view_plan_courses" ON "public"."plan_courses" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "user_view_plans" ON "public"."plans" FOR SELECT USING (true);

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."add_role_to_custom_claim"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_role_to_custom_claim"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_role_to_custom_claim"() TO "service_role";

GRANT ALL ON FUNCTION "public"."auth_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "service_role";

GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";

GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_role"("user_id" "uuid", "role_to_check" "public"."user_role") TO "service_role";

GRANT ALL ON FUNCTION "public"."check_user_permission"("user_id" "uuid", "permission" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_permission"("user_id" "uuid", "permission" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_permission"("user_id" "uuid", "permission" "public"."user_role") TO "service_role";

GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";

GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_course_progress"("course_id_arg" bigint, "user_id_arg" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_course_progress"("course_id_arg" bigint, "user_id_arg" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_course_progress"("course_id_arg" bigint, "user_id_arg" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";

GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin_or_teacher"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_teacher"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_teacher"("user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "service_role";

GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb", "match_threshold" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb", "match_threshold" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb", "match_threshold" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";

GRANT ALL ON FUNCTION "public"."process_purchase"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_purchase"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_purchase"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."update_is_approved"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_is_approved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_is_approved"() TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";

GRANT ALL ON TABLE "public"."comment_reactions" TO "anon";
GRANT ALL ON TABLE "public"."comment_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reactions" TO "service_role";

GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";

GRANT ALL ON TABLE "public"."course_categories" TO "anon";
GRANT ALL ON TABLE "public"."course_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."course_categories" TO "service_role";

GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."course_categories_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."course_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."course_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_enrollments" TO "service_role";

GRANT ALL ON SEQUENCE "public"."course_enrollments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."course_enrollments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."course_enrollments_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."course_purchases" TO "anon";
GRANT ALL ON TABLE "public"."course_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."course_purchases" TO "service_role";

GRANT ALL ON SEQUENCE "public"."course_purchases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."course_purchases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."course_purchases_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";

GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."currencies" TO "anon";
GRANT ALL ON TABLE "public"."currencies" TO "authenticated";
GRANT ALL ON TABLE "public"."currencies" TO "service_role";

GRANT ALL ON SEQUENCE "public"."currencies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."currencies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."currencies_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";

GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."invoice_line_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "service_role";

GRANT ALL ON SEQUENCE "public"."invoice_line_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_line_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_line_items_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";

GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "service_role";

GRANT ALL ON SEQUENCE "public"."invoices_invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoices_invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoices_invoice_number_seq" TO "service_role";

GRANT ALL ON TABLE "public"."lesson_localizations" TO "anon";
GRANT ALL ON TABLE "public"."lesson_localizations" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_localizations" TO "service_role";

GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";

GRANT ALL ON SEQUENCE "public"."lesson_progress_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lesson_progress_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lesson_progress_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";

GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."plan_courses" TO "anon";
GRANT ALL ON TABLE "public"."plan_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_courses" TO "service_role";

GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";

GRANT ALL ON SEQUENCE "public"."plans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."plans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."plans_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";

GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."products_pricing" TO "anon";
GRANT ALL ON TABLE "public"."products_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."products_pricing" TO "service_role";

GRANT ALL ON SEQUENCE "public"."products_pricing_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_pricing_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_pricing_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."question_option_localizations" TO "anon";
GRANT ALL ON TABLE "public"."question_option_localizations" TO "authenticated";
GRANT ALL ON TABLE "public"."question_option_localizations" TO "service_role";

GRANT ALL ON TABLE "public"."question_options" TO "anon";
GRANT ALL ON TABLE "public"."question_options" TO "authenticated";
GRANT ALL ON TABLE "public"."question_options" TO "service_role";

GRANT ALL ON SEQUENCE "public"."question_options_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."question_options_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."question_options_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."related_courses" TO "anon";
GRANT ALL ON TABLE "public"."related_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."related_courses" TO "service_role";

GRANT ALL ON TABLE "public"."related_lessons" TO "anon";
GRANT ALL ON TABLE "public"."related_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."related_lessons" TO "service_role";

GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";

GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."submission_answers" TO "anon";
GRANT ALL ON TABLE "public"."submission_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_answers" TO "service_role";

GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subscriptions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."supported_languages" TO "anon";
GRANT ALL ON TABLE "public"."supported_languages" TO "authenticated";
GRANT ALL ON TABLE "public"."supported_languages" TO "service_role";

GRANT ALL ON TABLE "public"."test_localizations" TO "anon";
GRANT ALL ON TABLE "public"."test_localizations" TO "authenticated";
GRANT ALL ON TABLE "public"."test_localizations" TO "service_role";

GRANT ALL ON TABLE "public"."test_question_localizations" TO "anon";
GRANT ALL ON TABLE "public"."test_question_localizations" TO "authenticated";
GRANT ALL ON TABLE "public"."test_question_localizations" TO "service_role";

GRANT ALL ON TABLE "public"."test_questions" TO "anon";
GRANT ALL ON TABLE "public"."test_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_questions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."test_questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."test_questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."test_questions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."test_submissions" TO "anon";
GRANT ALL ON TABLE "public"."test_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_submissions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."test_submissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."test_submissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."test_submissions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."tests" TO "anon";
GRANT ALL ON TABLE "public"."tests" TO "authenticated";
GRANT ALL ON TABLE "public"."tests" TO "service_role";

GRANT ALL ON SEQUENCE "public"."tests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tests_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."user_progress_for_course" TO "anon";
GRANT ALL ON TABLE "public"."user_progress_for_course" TO "authenticated";
GRANT ALL ON TABLE "public"."user_progress_for_course" TO "service_role";

GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";

GRANT ALL ON TABLE "public"."vw_user_test_submissions" TO "anon";
GRANT ALL ON TABLE "public"."vw_user_test_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_user_test_submissions" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";

RESET ALL;
