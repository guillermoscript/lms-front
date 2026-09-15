-- #763: the theme kit is the only theming model. Data only, idempotent.
--
-- `tenant_settings.theme_preset` used to hold three shapes: a curated preset id
-- (`{"type":"curated","id":"emerald","radius":…,"fontFamily":…}`), a shadcn
-- preset code with inline variables (`"type":"custom"`), or a kit. On top of
-- that, `primary_color` / `secondary_color` settings rows overrode `--primary`.
-- The renderer now reads only `{"type":"kit","theme":…,"brand":…}`
-- (`parseStoredKitTheme` in lib/themes/kit.ts) and nothing reads the colour
-- rows, so every other shape is dead data.
--
-- 1. A curated preset becomes the kit swatch nearest to the preset's light
--    `--primary` by OKLab distance. Kódigo is excluded: no legacy preset had a
--    dark surface. A tie goes to the theme whose recommended swatch it is
--    (emerald → Andina #2F6B4F rather than Estructura's identical swatch). The
--    legacy radius / fontFamily overrides are dropped; the theme owns corners
--    and type now.
-- 2. Every remaining non-kit theme_preset row (shadcn codes, unknown curated
--    ids, malformed values) is deleted: no stored theme = platform palette.
-- 3. The primary_color / secondary_color settings rows are deleted.
--
-- The tenants.primary_color / secondary_color COLUMNS are left alone: MCP
-- widgets still read them (#765). tenant_settings carries only the
-- update_tenant_settings_updated_at trigger, so these writes fire nothing else.
-- A second run finds no curated row to convert and nothing left to delete.

UPDATE public.tenant_settings AS ts
SET setting_value = jsonb_build_object('type', 'kit', 'theme', m.theme, 'brand', m.brand)
FROM (
  VALUES
    ('default',  'luz',        '#7B2CBF'),
    ('violet',   'luz',        '#7B2CBF'),
    ('ocean',    'estructura', '#0E7C86'),
    ('emerald',  'andina',     '#2F6B4F'),
    ('rose',     'luz',        '#C2185B'),
    ('amber',    'luz',        '#E4572E'),
    ('midnight', 'estructura', '#3A50B8'),
    ('blue',     'estructura', '#3A50B8'),
    ('red',      'luz',        '#E4572E'),
    ('green',    'luz',        '#1F9D8F'),
    ('orange',   'luz',        '#E4572E'),
    ('pink',     'luz',        '#C2185B'),
    ('teal',     'luz',        '#1F9D8F'),
    ('yellow',   'luz',        '#F4A261')
) AS m (preset_id, theme, brand)
WHERE ts.setting_key = 'theme_preset'
  AND ts.setting_value->>'type' = 'curated'
  AND ts.setting_value->>'id' = m.preset_id;

-- `IS DISTINCT FROM` also catches a value that is not a JSON object.
DELETE FROM public.tenant_settings
WHERE setting_key = 'theme_preset'
  AND setting_value->>'type' IS DISTINCT FROM 'kit';

DELETE FROM public.tenant_settings
WHERE setting_key IN ('primary_color', 'secondary_color');
