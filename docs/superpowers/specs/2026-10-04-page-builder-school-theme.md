# Page builder school-theme alignment

School branding is the default for editor-created pages, including existing published pages. Explicit author overrides remain supported. Shared renderers are used in preview and public pages, so there is no database migration or content rewrite.

New Card, Image, and Video blocks use school corner tokens. Missing style values inherit the school. Stored numeric corners and selected shadows are retained because legacy data contains no provenance distinguishing an old default from an author choice. Authors can select School theme to reset corners. Automatic decorative shadows and movement are removed from shared blocks.

AI generation inherits theme colors and corners unless the user requests an override. Generated catalog mirrors must remain synchronized. Contact forms get instance-specific label/control IDs. CTA navigation uses semantic links with shared button variants.

Verify with typecheck, build, catalog bridge tests, school-theme rendering and explicit overrides, light/dark and mobile preview. Scope does not include changing the currently non-submitting contact form behavior.
