/**
 * Demo fixtures for every MCP App widget in `resources/`.
 *
 * WHY THIS EXISTS
 *   Widget props normally come from live Supabase reads inside a tool handler,
 *   which means seeing a widget requires a seeded database, an OAuth login, and
 *   a course/lesson/exam that happens to exercise the branch you changed. That
 *   makes design work on the widgets slow and makes edge states (empty lists,
 *   locked lessons, null scores, unpublished pages) nearly impossible to look
 *   at on demand.
 *
 *   These fixtures are hand-written props that satisfy each widget's own
 *   `propsSchema`, exposed through dev-only `lms_demo_*` tools (see
 *   `src/tools/demo.ts`) so the MCP inspector can render any widget — including
 *   its edge states — with zero database and zero auth.
 *
 * INVARIANTS
 *   - Fixtures are DATA ONLY. They must never be imported by a production tool.
 *   - Every variant must satisfy the widget's `propsSchema` exactly. When you
 *     change a widget schema, update the fixture in the same commit — the
 *     fixtures double as the only committed example of each widget's payload.
 *   - Deliberately include awkward values (null descriptions, comma-string
 *     tags, 0%, ungraded rows) so the widgets get exercised, not flattered.
 */

export interface WidgetDemoVariant {
  /** Short id used as the `variant` tool argument. */
  id: string;
  /** Human label shown in the tool description / text output. */
  label: string;
  /** Props matching the widget's `propsSchema`. */
  props: Record<string, unknown>;
  /** Text the model sees alongside the widget. */
  output: string;
}

export interface WidgetDemo {
  /** Directory name under `resources/` — the registered widget name. */
  widget: string;
  /** Generated tool name. */
  tool: string;
  /** What the widget is for. */
  title: string;
  variants: WidgetDemoVariant[];
}

// ── Shared sample content ────────────────────────────────────────────────────

const LESSON_MDX = `Los *hooks* de React resuelven un problema concreto: compartir lógica con estado entre componentes sin heredar ni envolver.

## Por qué existen los hooks

Antes de 2019 la única forma de reutilizar lógica con estado era el patrón *render props* o los HOCs. Ambos funcionan, pero anidan el árbol de componentes hasta volverlo ilegible.

<Info title="Regla de oro">
Los hooks solo se llaman en el nivel superior de un componente o de otro hook. Nunca dentro de condicionales, bucles o funciones anidadas.
</Info>

### Los tres hooks que usarás el 90% del tiempo

| Hook | Para qué sirve | Se ejecuta |
| --- | --- | --- |
| \`useState\` | Estado local del componente | En cada render |
| \`useEffect\` | Sincronizar con sistemas externos | Después del render |
| \`useMemo\` | Cachear un cálculo costoso | Cuando cambian las dependencias |

\`\`\`tsx
export function Contador() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>Llevas {n}</button>
}
\`\`\`

<Warning>
\`useEffect\` sin array de dependencias corre en **cada** render. Es la causa número uno de bucles infinitos de fetch en los proyectos de este curso.
</Warning>

## Dependencias, el detalle que cuesta

<Steps>
<Step title="Escribe el efecto">
Empieza sin pensar en dependencias: qué tiene que pasar y cuándo.
</Step>
<Step title="Deja que el linter las complete">
\`react-hooks/exhaustive-deps\` casi siempre tiene razón.
</Step>
<Step title="Si te estorban, mueve el cálculo">
Una dependencia que no quieres declarar suele ser código que debería vivir fuera del efecto.
</Step>
</Steps>

<Quiz question="¿Cuándo se ejecuta un efecto con array de dependencias vacío?" options={["En cada render","Solo después del primer render","Nunca","Antes del primer render"]} answer={1}>
Un array vacío significa "no dependo de nada", así que React lo corre una sola vez tras el montaje.
</Quiz>

> El estado no es una variable, es una instantánea. Cada render ve su propia copia.

<Spoiler title="Ver la solución del ejercicio 3">
El bug estaba en \`setItems(items.push(nuevo))\`: \`push\` muta el array y devuelve la longitud, así que el estado quedaba en un número.
</Spoiler>

Cuando termines, marca la lección como completada y pasa a **Efectos y limpieza**.`;

/**
 * The two authoring shapes that used to blank a whole lesson (#566) — kept as a
 * regression fixture.
 *
 * The `<CodeBlock>` is the case teachers hit: its children are parsed as MDX, so
 * a sample whose first line starts at column 0 with `export`/`import` was read
 * as an ESM statement and handed to acorn, which choked on the closing tag and
 * failed the WHOLE document. `inlineCodeBlockBodies()` now moves the snippet to
 * a `code` prop, so it renders like any other block.
 *
 * The unclosed `<Callout>` below it still cannot be parsed by anything — it is
 * here so the per-block fallback stays inspectable: that one block degrades to
 * its source, everything around it renders.
 */
const BROKEN_LESSON_MDX = `Un módulo de ejemplo, pegado tal cual dentro de un bloque de código.

<CodeBlock language="tsx" title="contador.tsx">
export function Contador() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>Llevas {n}</button>
}
</CodeBlock>

<Callout type="warning">Esta etiqueta nunca se cierra.

El resto de la lección **sí** se renderiza: sólo el bloque roto cae a texto plano.

| Antes | Ahora |
| --- | --- |
| Documento entero en crudo | Sólo el bloque que falla |`;

const ARTIFACT_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: ui-sans-serif, system-ui; margin: 0; padding: 24px; background: #fafafa; color: #18181b; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { margin: 0 0 20px; color: #71717a; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    button { padding: 14px; font-size: 15px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; cursor: pointer; }
    button:hover { border-color: #7c3aed; }
    #out { margin-top: 18px; font-size: 14px; min-height: 22px; }
    .ok { color: #16a34a; } .bad { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Ordena el ciclo de vida de una petición</h1>
  <p class="sub">Haz clic en los pasos en el orden correcto.</p>
  <div class="grid">
    <button data-step="3">Renderizar datos</button>
    <button data-step="1">Montar componente</button>
    <button data-step="4">Limpiar efecto</button>
    <button data-step="2">Lanzar fetch</button>
  </div>
  <div id="out"></div>
  <script>
    let expected = 1;
    document.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const step = Number(b.dataset.step);
        const out = document.getElementById('out');
        if (step === expected) {
          b.disabled = true;
          expected += 1;
          out.className = 'ok';
          out.textContent = expected > 4 ? '¡Correcto! Secuencia completa.' : 'Bien, sigue.';
        } else {
          out.className = 'bad';
          out.textContent = 'Ese no es el siguiente paso. Vuelve a empezar.';
          expected = 1;
          document.querySelectorAll('button').forEach((x) => (x.disabled = false));
        }
      });
    });
  </script>
</body>
</html>`;

// ── Fixtures ─────────────────────────────────────────────────────────────────

export const WIDGET_DEMOS: WidgetDemo[] = [
  // ───────────────────────────────────────────────────────── course-dashboard
  {
    widget: "course-dashboard",
    tool: "lms_demo_course_dashboard",
    title: "Teacher course grid (lms_list_courses)",
    variants: [
      {
        id: "default",
        label: "Mixed statuses, 6 courses",
        output: "Found 6 course(s).",
        props: {
          status: "all",
          total: 6,
          courses: [
            {
              id: 101,
              title: "React 19 en la práctica",
              description:
                "Server components, acciones de formulario y el nuevo compilador, construyendo una app real de principio a fin.",
              status: "published",
              tags: ["react", "frontend", "avanzado"],
              lesson_count: 24,
              enrollment_count: 318,
              created_at: "2026-02-11T09:20:00Z",
              updated_at: "2026-07-19T16:04:00Z",
            },
            {
              id: 102,
              title: "TypeScript de cero a estricto",
              description:
                "Tipos, genéricos e inferencia hasta poder activar strict en un proyecto heredado sin romperlo.",
              status: "published",
              // Comma-string tags: what older rows actually store.
              tags: "typescript, fundamentos, backend",
              lesson_count: 18,
              enrollment_count: 412,
              created_at: "2025-11-03T14:00:00Z",
              updated_at: "2026-07-24T11:47:00Z",
            },
            {
              id: 103,
              title: "Postgres y Row Level Security",
              description:
                "Diseñar esquemas multi-tenant que no filtren datos: políticas, claims de JWT y pruebas de aislamiento.",
              status: "published",
              tags: ["postgres", "seguridad", "supabase"],
              lesson_count: 15,
              enrollment_count: 97,
              created_at: "2026-04-28T08:15:00Z",
              updated_at: "2026-07-26T19:31:00Z",
            },
            {
              id: 104,
              title: "Diseño de APIs REST",
              // Null description: the widget must not print "null".
              description: null,
              status: "draft",
              tags: ["api", "backend"],
              lesson_count: 6,
              enrollment_count: 0,
              created_at: "2026-07-12T10:05:00Z",
              updated_at: "2026-07-25T09:12:00Z",
            },
            {
              id: 105,
              title: "Fundamentos de accesibilidad web",
              description:
                "WCAG AA sin dogmas: cómo auditar, qué priorizar y cómo justificar el trabajo ante producto.",
              status: "draft",
              tags: null,
              lesson_count: 9,
              enrollment_count: 0,
              created_at: "2026-06-30T13:40:00Z",
              updated_at: "2026-07-21T17:58:00Z",
            },
            {
              id: 106,
              title: "jQuery para aplicaciones modernas",
              description:
                "Curso retirado. Se mantiene por los alumnos con acceso vitalicio; sustituido por «React 19 en la práctica».",
              status: "archived",
              tags: ["legacy"],
              lesson_count: 31,
              enrollment_count: 1204,
              created_at: "2023-01-18T07:00:00Z",
              updated_at: "2026-01-09T12:00:00Z",
            },
          ],
        },
      },
      {
        id: "empty",
        label: "No courses yet (first-run state)",
        output: "No courses found.",
        props: { status: "all", total: 0, courses: [] },
      },
      {
        id: "long-titles",
        label: "Overflow stress test",
        output: "Found 2 course(s).",
        props: {
          status: "published",
          total: 2,
          courses: [
            {
              id: 201,
              title:
                "Programa intensivo de ingeniería de plataforma: infraestructura como código, observabilidad y confiabilidad para equipos que ya operan en producción",
              description:
                "Un temario deliberadamente largo para comprobar que la tarjeta trunca el texto en lugar de empujar la cuadrícula, incluso cuando el autor escribe una descripción entera sin un solo punto y aparte porque así es como la gente rellena los formularios en la vida real.",
              status: "published",
              tags: [
                "infraestructura",
                "observabilidad",
                "sre",
                "kubernetes",
                "terraform",
                "on-call",
                "postmortems",
              ],
              lesson_count: 96,
              enrollment_count: 12480,
              created_at: "2026-03-02T09:00:00Z",
              updated_at: "2026-07-26T22:10:00Z",
            },
            {
              id: 202,
              title: "Git",
              description: "Corto.",
              status: "published",
              tags: ["git"],
              lesson_count: 1,
              enrollment_count: 3,
              created_at: "2026-07-01T09:00:00Z",
              updated_at: "2026-07-01T09:00:00Z",
            },
          ],
        },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── course-detail
  {
    widget: "course-detail",
    tool: "lms_demo_course_detail",
    title: "Course detail with lessons + exams (lms_get_course)",
    variants: [
      {
        id: "default",
        label: "Published course, 8 lessons, 2 exams",
        output: "Course 101 — React 19 en la práctica.",
        props: {
          course: {
            id: 101,
            title: "React 19 en la práctica",
            description:
              "Server components, acciones de formulario y el nuevo compilador, construyendo una app real de principio a fin.",
            status: "published",
            tags: ["react", "frontend", "avanzado"],
            require_sequential_completion: true,
            enrollment_count: 318,
            created_at: "2026-02-11T09:20:00Z",
          },
          lessons: [
            { id: 5001, title: "Qué cambia realmente en React 19", sequence: 1, status: "published" },
            { id: 5002, title: "Server components: el modelo mental", sequence: 2, status: "published" },
            { id: 5003, title: "Hooks: estado y efectos", sequence: 3, status: "published" },
            { id: 5004, title: "Efectos y limpieza", sequence: 4, status: "published" },
            { id: 5005, title: "Acciones de formulario y useActionState", sequence: 5, status: "published" },
            { id: 5006, title: "Suspense y streaming", sequence: 6, status: "published" },
            { id: 5007, title: "El compilador: qué deja de hacer falta", sequence: 7, status: "draft" },
            { id: 5008, title: "Migrar una app de React 18", sequence: 8, status: "draft" },
          ],
          exams: [
            {
              id: 9001,
              title: "Evaluación parcial: modelo de renderizado",
              date: "2026-08-04T15:00:00Z",
              duration: 45,
              status: "published",
            },
            {
              id: 9002,
              title: "Examen final del curso",
              date: null,
              duration: 90,
              status: "draft",
            },
          ],
        },
      },
      {
        id: "empty",
        label: "Brand-new course, nothing authored yet",
        output: "Course 104 — Diseño de APIs REST (draft, no content yet).",
        props: {
          course: {
            id: 104,
            title: "Diseño de APIs REST",
            description: null,
            status: "draft",
            tags: null,
            require_sequential_completion: false,
            enrollment_count: 0,
            created_at: "2026-07-12T10:05:00Z",
          },
          lessons: [],
          exams: [],
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── lesson-preview
  {
    widget: "lesson-preview",
    tool: "lms_demo_lesson_preview",
    title: "Teacher lesson preview with resources (lms_get_lesson)",
    variants: [
      {
        id: "default",
        label: "Rich MDX lesson with video + 3 resources",
        output: "Lesson 5003 — Hooks: estado y efectos.",
        props: {
          lesson: {
            id: 5003,
            title: "Hooks: estado y efectos",
            description:
              "Por qué existen los hooks, las dos reglas que no se pueden romper y los tres que cubren casi todo.",
            video_url: "https://www.youtube.com/watch?v=dpw9EHDh2bM",
            embed_code: null,
            content: LESSON_MDX,
            status: "published",
            sequence: 3,
          },
          resources: [
            { id: 7001, file_name: "hooks-cheatsheet.pdf", file_size: 284_512, mime_type: "application/pdf" },
            { id: 7002, file_name: "ejercicios-hooks.zip", file_size: 1_884_204, mime_type: "application/zip" },
            { id: 7003, file_name: "diagrama-ciclo-de-vida.png", file_size: null, mime_type: null },
          ],
        },
      },
      {
        id: "bare",
        label: "Draft lesson: no content, no video, no resources",
        output: "Lesson 5007 — El compilador (draft, empty).",
        props: {
          lesson: {
            id: 5007,
            title: "El compilador: qué deja de hacer falta",
            description: null,
            video_url: null,
            embed_code: null,
            content: null,
            status: "draft",
            sequence: 7,
          },
          resources: [],
        },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── lesson-viewer
  {
    widget: "lesson-viewer",
    tool: "lms_demo_lesson_viewer",
    title: "Student lesson reader with mark-complete (lms_view_lesson)",
    variants: [
      {
        id: "default",
        label: "Unlocked, not yet completed",
        output: "Lesson 5003 of React 19 en la práctica.",
        props: {
          lesson: {
            id: 5003,
            course_id: 101,
            title: "Hooks: estado y efectos",
            description:
              "Por qué existen los hooks, las dos reglas que no se pueden romper y los tres que cubren casi todo.",
            summary:
              "Al terminar sabrás elegir entre useState, useEffect y useMemo, y detectar por qué un efecto se repite.",
            content: LESSON_MDX,
            video_url: "https://www.youtube.com/watch?v=dpw9EHDh2bM",
            embed_code: null,
            sequence: 3,
          },
          course_title: "React 19 en la práctica",
          completed: false,
          locked: false,
          locked_by: null,
        },
      },
      {
        id: "completed",
        label: "Already completed",
        output: "Lesson 5002 — already completed.",
        props: {
          lesson: {
            id: 5002,
            course_id: 101,
            title: "Server components: el modelo mental",
            description: "Dónde corre cada cosa y por qué el árbol se parte en dos.",
            summary: null,
            content:
              "Un server component no se rehidrata: se serializa el resultado, no el componente.\n\n<Tip>Si necesitas `useState`, ese componente vive en el cliente. No hay término medio.</Tip>\n\nEso es todo por hoy.",
            video_url: null,
            embed_code: null,
            sequence: 2,
          },
          course_title: "React 19 en la práctica",
          completed: true,
          locked: false,
          locked_by: null,
        },
      },
      {
        id: "broken-mdx",
        label: "Module in <CodeBlock> + one unparseable block",
        output: "Lesson 5009 — one block of the content could not be parsed as MDX.",
        props: {
          lesson: {
            id: 5009,
            course_id: 101,
            title: "Un contador con estado",
            description: "Lección con un módulo en <CodeBlock> y una etiqueta sin cerrar.",
            summary: null,
            content: BROKEN_LESSON_MDX,
            video_url: null,
            embed_code: null,
            sequence: 9,
          },
          course_title: "React 19 en la práctica",
          completed: false,
          locked: false,
          locked_by: null,
        },
      },
      {
        id: "locked",
        label: "Locked by sequential completion",
        output: "Lesson 5005 is locked until lesson 5004 is completed.",
        props: {
          lesson: {
            id: 5005,
            course_id: 101,
            title: "Acciones de formulario y useActionState",
            description: "Formularios sin estado manual ni handlers de submit.",
            summary: null,
            content: null,
            video_url: null,
            embed_code: null,
            sequence: 5,
          },
          course_title: "React 19 en la práctica",
          completed: false,
          locked: true,
          locked_by: { id: 5004, title: "Efectos y limpieza" },
        },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────── my-learning
  {
    widget: "my-learning",
    tool: "lms_demo_my_learning",
    title: "Student learning dashboard (lms_my_learning)",
    variants: [
      {
        id: "default",
        label: "3 courses in progress",
        output: "You are enrolled in 3 course(s).",
        props: {
          total: 3,
          average_progress: 47,
          courses: [
            {
              id: 101,
              title: "React 19 en la práctica",
              description: "Server components, acciones de formulario y el nuevo compilador.",
              thumbnail_url: null,
              enrolled_at: "2026-05-02T10:12:00Z",
              lessons_total: 24,
              lessons_completed: 17,
              progress: 71,
              next_lesson: { id: 5018, title: "Suspense en listas largas", sequence: 18 },
            },
            {
              id: 102,
              title: "TypeScript de cero a estricto",
              description: "Tipos, genéricos e inferencia hasta activar strict sin romper nada.",
              thumbnail_url: null,
              enrolled_at: "2026-06-18T08:44:00Z",
              lessons_total: 18,
              lessons_completed: 12,
              progress: 67,
              next_lesson: { id: 6013, title: "Tipos condicionales", sequence: 13 },
            },
            {
              id: 103,
              title: "Postgres y Row Level Security",
              description: null,
              thumbnail_url: null,
              enrolled_at: "2026-07-24T19:03:00Z",
              lessons_total: 15,
              lessons_completed: 0,
              // Just enrolled: 0% and lesson 1 is next.
              progress: 0,
              next_lesson: { id: 6501, title: "Qué es realmente una política RLS", sequence: 1 },
            },
          ],
        },
      },
      {
        id: "finished",
        label: "One course fully completed",
        output: "You are enrolled in 1 course.",
        props: {
          total: 1,
          average_progress: 100,
          courses: [
            {
              id: 102,
              title: "TypeScript de cero a estricto",
              description: "Tipos, genéricos e inferencia hasta activar strict sin romper nada.",
              thumbnail_url: null,
              enrolled_at: "2026-01-08T08:44:00Z",
              lessons_total: 18,
              lessons_completed: 18,
              progress: 100,
              next_lesson: null,
            },
          ],
        },
      },
      {
        id: "empty",
        label: "Not enrolled in anything",
        output: "You are not enrolled in any courses yet.",
        props: { total: 0, average_progress: 0, courses: [] },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── course-catalog
  {
    widget: "course-catalog",
    tool: "lms_demo_course_catalog",
    title: "Student catalog with access badges (lms_browse_catalog)",
    variants: [
      {
        id: "subscriber",
        label: "Student on a plan",
        output: "6 course(s) in the catalog.",
        props: {
          total: 6,
          has_subscription: true,
          courses: [
            {
              id: 101,
              title: "React 19 en la práctica",
              description: "Server components, acciones de formulario y el nuevo compilador.",
              thumbnail_url: null,
              tags: ["react", "frontend"],
              lesson_count: 24,
              enrolled: true,
              has_access: true,
              covered_by_plan: true,
              price: 49,
              currency: "usd",
            },
            {
              id: 102,
              title: "TypeScript de cero a estricto",
              description: "Tipos, genéricos e inferencia hasta activar strict sin romper nada.",
              thumbnail_url: null,
              tags: "typescript, fundamentos",
              lesson_count: 18,
              enrolled: true,
              has_access: true,
              covered_by_plan: true,
              price: 39,
              currency: "usd",
            },
            {
              id: 103,
              title: "Postgres y Row Level Security",
              description: "Esquemas multi-tenant que no filtran datos.",
              thumbnail_url: null,
              tags: ["postgres", "seguridad"],
              lesson_count: 15,
              enrolled: false,
              has_access: true,
              covered_by_plan: true,
              price: 45,
              currency: "usd",
            },
            {
              id: 107,
              title: "Arquitectura de sistemas distribuidos",
              description:
                "Consistencia, particiones y colas: cuándo cada patrón es la respuesta correcta y cuándo es sobreingeniería.",
              thumbnail_url: null,
              tags: ["arquitectura", "avanzado"],
              lesson_count: 22,
              enrolled: false,
              // Sold separately: on a plan, but this one is not covered.
              has_access: false,
              covered_by_plan: false,
              price: 89,
              currency: "usd",
            },
            {
              id: 108,
              title: "Introducción a la programación",
              description: "Gratis para toda la escuela. Variables, bucles y funciones desde cero.",
              thumbnail_url: null,
              tags: ["principiantes", "gratis"],
              lesson_count: 12,
              enrolled: false,
              has_access: true,
              covered_by_plan: false,
              // A $0 product: free, but still a product.
              price: 0,
              currency: "usd",
            },
            {
              id: 109,
              title: "Entrevistas técnicas: algoritmos",
              description: null,
              thumbnail_url: null,
              tags: null,
              lesson_count: 30,
              enrolled: false,
              has_access: false,
              covered_by_plan: false,
              // No active product covers it — nothing to sell, so no CTA.
              price: null,
              currency: null,
            },
          ],
        },
      },
      {
        id: "no-plan",
        label: "Student with no subscription",
        output: "3 course(s) in the catalog.",
        props: {
          total: 3,
          has_subscription: false,
          courses: [
            {
              id: 101,
              title: "React 19 en la práctica",
              description: "Server components, acciones de formulario y el nuevo compilador.",
              thumbnail_url: null,
              tags: ["react", "frontend"],
              lesson_count: 24,
              enrolled: false,
              has_access: false,
              covered_by_plan: false,
              price: 49,
              currency: "usd",
            },
            {
              id: 108,
              title: "Introducción a la programación",
              description: "Gratis para toda la escuela.",
              thumbnail_url: null,
              tags: ["gratis"],
              lesson_count: 12,
              enrolled: true,
              has_access: true,
              covered_by_plan: false,
              price: 0,
              currency: "usd",
            },
            {
              id: 109,
              title: "Entrevistas técnicas: algoritmos",
              description: "Patrones de problemas, no soluciones memorizadas.",
              thumbnail_url: null,
              tags: ["entrevistas"],
              lesson_count: 30,
              enrolled: false,
              has_access: false,
              covered_by_plan: false,
              price: 129,
              currency: "usd",
            },
          ],
        },
      },
      {
        id: "empty",
        label: "Empty catalog",
        output: "No courses available yet.",
        props: { total: 0, has_subscription: false, courses: [] },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── exam-submissions
  {
    widget: "exam-submissions",
    tool: "lms_demo_exam_submissions",
    title: "Teacher submission list (lms_list_exam_submissions)",
    variants: [
      {
        id: "default",
        label: "8 submissions, mixed review status",
        output: "8 submission(s) for exam 9001.",
        props: {
          exam_id: 9001,
          total: 8,
          submissions: [
            { id: 4101, student_name: "Alicia Nguyen", score: 92, submission_date: "2026-07-24T14:02:00Z", review_status: "reviewed" },
            { id: 4102, student_name: "Bruno Salas", score: 78, submission_date: "2026-07-24T14:11:00Z", review_status: "reviewed" },
            { id: 4103, student_name: "Camila Rojas", score: 64, submission_date: "2026-07-24T14:19:00Z", review_status: "ai_reviewed" },
            { id: 4104, student_name: "Diego Fernández", score: null, submission_date: "2026-07-24T14:26:00Z", review_status: "pending" },
            { id: 4105, student_name: "Emma Whitfield", score: 100, submission_date: "2026-07-25T09:40:00Z", review_status: "reviewed" },
            { id: 4106, student_name: "Farid Haddad", score: 41, submission_date: "2026-07-25T10:03:00Z", review_status: "ai_reviewed" },
            { id: 4107, student_name: "Grace Okoye", score: null, submission_date: "2026-07-26T08:12:00Z", review_status: null },
            { id: 4108, student_name: "Hugo Marín", score: 87, submission_date: "2026-07-26T11:55:00Z", review_status: "reviewed" },
          ],
        },
      },
      {
        id: "empty",
        label: "Nobody has taken the exam",
        output: "No submissions yet for exam 9002.",
        props: { exam_id: 9002, total: 0, submissions: [] },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── submission-grader
  {
    widget: "submission-grader",
    tool: "lms_demo_submission_grader",
    title: "Grade one submission (lms_get_submission → lms_grade_submission)",
    variants: [
      {
        id: "default",
        label: "AI-graded, awaiting teacher review",
        output: "Submission 4103 by Camila Rojas — 64/100, ai_reviewed.",
        props: {
          submission: {
            id: 4103,
            exam_id: 9001,
            exam_title: "Evaluación parcial: modelo de renderizado",
            student_id: "5f2a91c4-1d3e-4f88-9b0a-7c6d5e4f3a21",
            student_name: "Camila Rojas",
            score: 64,
            feedback:
              "Dominas la parte conceptual de server components, pero las respuestas sobre efectos mezclan el momento de ejecución con el orden de limpieza. Repasa la lección 4 antes del final.",
            review_status: "ai_reviewed",
            date: "2026-07-24T14:19:00Z",
          },
          questions: [
            {
              question_id: 8801,
              text: "¿Cuál de estas afirmaciones sobre los server components es correcta?",
              type: "multiple_choice",
              options: [
                { text: "Se rehidratan en el cliente igual que los componentes clásicos", is_correct: false },
                { text: "Su resultado se serializa; el componente nunca llega al navegador", is_correct: true },
                { text: "Solo pueden usarse en rutas estáticas", is_correct: false },
                { text: "Necesitan useEffect para leer datos", is_correct: false },
              ],
              student_answer: "Su resultado se serializa; el componente nunca llega al navegador",
              points_earned: 20,
              points_possible: 20,
              is_correct: true,
              ai_feedback: null,
              ai_confidence: null,
              is_overridden: false,
            },
            {
              question_id: 8802,
              text: "Verdadero o falso: un efecto con array de dependencias vacío se ejecuta en cada render.",
              type: "true_false",
              options: [
                { text: "Verdadero", is_correct: false },
                { text: "Falso", is_correct: true },
              ],
              student_answer: "Falso",
              points_earned: 10,
              points_possible: 10,
              is_correct: true,
              ai_feedback: null,
              ai_confidence: null,
              is_overridden: false,
            },
            {
              question_id: 8803,
              text: "Explica con tus palabras por qué el estado se comporta como una instantánea dentro de un render.",
              type: "free_text",
              options: [],
              student_answer:
                "Porque cuando el componente se vuelve a ejecutar, las variables se crean otra vez, así que el valor que lee el handler es el que existía cuando se creó ese render, no el más nuevo.",
              points_earned: 24,
              points_possible: 30,
              is_correct: null,
              ai_feedback:
                "Idea correcta y bien explicada. Falta mencionar que por eso las actualizaciones basadas en el valor anterior deben usar la forma funcional de setState; sin eso la respuesta queda a medias.",
              ai_confidence: 0.82,
              is_overridden: false,
            },
            {
              question_id: 8804,
              text: "Describe un caso en el que useMemo empeora el rendimiento.",
              type: "free_text",
              options: [],
              student_answer:
                "Cuando el cálculo es barato, porque igual tienes que comparar dependencias.",
              points_earned: 6,
              points_possible: 25,
              is_correct: null,
              ai_feedback:
                "Respuesta demasiado breve para el valor de la pregunta. La comparación de dependencias es solo una parte; falta el coste de memoria y el de mantener el array correcto.",
              ai_confidence: 0.41,
              // Teacher already bumped this one by hand.
              is_overridden: true,
            },
            {
              question_id: 8805,
              text: "Ordena las fases: montaje, efecto, limpieza, render.",
              type: "order",
              options: [],
              student_answer: null,
              points_earned: null,
              points_possible: 15,
              is_correct: null,
              ai_feedback: null,
              ai_confidence: null,
              is_overridden: false,
            },
          ],
          summary: {
            question_count: 5,
            graded_count: 4,
            total_points_earned: 60,
            total_points_possible: 100,
          },
        },
      },
    ],
  },

  // ────────────────────────────────────────────────────────── my-exam-results
  {
    widget: "my-exam-results",
    tool: "lms_demo_my_exam_results",
    title: "Student exam results (lms_my_exam_results)",
    variants: [
      {
        id: "default",
        label: "4 results, one still pending",
        output: "You have 4 exam result(s), averaging 79.",
        props: {
          total: 4,
          average_score: 79,
          results: [
            {
              submission_id: 4108,
              exam_id: 9001,
              exam_title: "Evaluación parcial: modelo de renderizado",
              course_title: "React 19 en la práctica",
              score: 87,
              feedback:
                "Muy sólido en el modelo de renderizado. Perdiste puntos solo en la pregunta de limpieza de efectos: repasa qué devuelve la función de un efecto y cuándo se llama.",
              review_status: "reviewed",
              submitted_at: "2026-07-26T11:55:00Z",
            },
            {
              submission_id: 3902,
              exam_id: 8801,
              exam_title: "Tipos genéricos",
              course_title: "TypeScript de cero a estricto",
              score: 94,
              feedback: "Impecable. Nada que corregir.",
              review_status: "reviewed",
              submitted_at: "2026-07-10T16:20:00Z",
            },
            {
              submission_id: 3711,
              exam_id: 8802,
              exam_title: "Inferencia y estrechamiento de tipos",
              course_title: "TypeScript de cero a estricto",
              score: 56,
              feedback:
                "Confundes el estrechamiento por type guard con las aserciones. La diferencia importa: una la comprueba el compilador, la otra la prometes tú.",
              review_status: "ai_reviewed",
              submitted_at: "2026-06-28T10:02:00Z",
            },
            {
              submission_id: 4210,
              exam_id: 9003,
              exam_title: "Diagnóstico inicial de Postgres",
              course_title: null,
              score: null,
              feedback: null,
              review_status: "pending",
              submitted_at: "2026-07-27T08:31:00Z",
            },
          ],
        },
      },
      {
        id: "empty",
        label: "No exams taken",
        output: "You have not submitted any exams yet.",
        props: { total: 0, average_score: null, results: [] },
      },
    ],
  },

  // ────────────────────────────────────────────────────── gamification-profile
  {
    widget: "gamification-profile",
    tool: "lms_demo_gamification_profile",
    title: "XP, level, streak and achievements (lms_my_gamification)",
    variants: [
      {
        id: "default",
        label: "Level 7, 12-day streak, 6 achievements",
        output: "Level 7 · 4,820 XP · 12-day streak.",
        props: {
          has_profile: true,
          total_xp: 4820,
          level: 7,
          level_title: "Constructor",
          level_icon: "🛠️",
          next_level: { level: 8, min_xp: 5500 },
          xp_into_level: 320,
          xp_needed: 680,
          coins: 138,
          current_streak: 12,
          longest_streak: 29,
          rank: 4,
          participants: 217,
          achievements: [
            {
              slug: "first-lesson",
              title: "Primera lección",
              description: "Completaste tu primera lección.",
              tier: "bronze",
              icon: "🎓",
              xp_reward: 50,
              earned_at: "2026-05-02T10:40:00Z",
            },
            {
              slug: "week-streak",
              title: "Semana perfecta",
              description: "Siete días seguidos estudiando.",
              tier: "silver",
              icon: "🔥",
              xp_reward: 150,
              earned_at: "2026-05-09T21:12:00Z",
            },
            {
              slug: "exam-ace",
              title: "Nota perfecta",
              description: "Sacaste 100 en un examen.",
              tier: "gold",
              icon: "🏆",
              xp_reward: 400,
              earned_at: "2026-06-14T18:03:00Z",
            },
            {
              slug: "night-owl",
              title: "Búho nocturno",
              description: "Diez lecciones completadas después de medianoche.",
              tier: "bronze",
              icon: "🦉",
              xp_reward: 75,
              earned_at: "2026-06-22T02:47:00Z",
            },
            {
              slug: "helper",
              title: "Buena gente",
              description: null,
              tier: null,
              icon: null,
              xp_reward: null,
              earned_at: "2026-07-01T13:20:00Z",
            },
            {
              slug: "course-complete",
              title: "Curso terminado",
              description: "Completaste todas las lecciones de un curso.",
              tier: "gold",
              icon: "✅",
              xp_reward: 500,
              earned_at: "2026-07-19T17:35:00Z",
            },
          ],
        },
      },
      {
        id: "new",
        label: "Brand-new student, no profile row yet",
        output: "No gamification profile yet — complete a lesson to start earning XP.",
        props: {
          has_profile: false,
          total_xp: 0,
          level: 1,
          level_title: null,
          level_icon: null,
          next_level: { level: 2, min_xp: 100 },
          xp_into_level: 0,
          xp_needed: 100,
          coins: 0,
          current_streak: 0,
          longest_streak: 0,
          rank: null,
          participants: 217,
          achievements: [],
        },
      },
      {
        id: "maxed",
        label: "Top of the leaderboard, no next level",
        output: "Level 20 · 128,400 XP · rank 1 of 217.",
        props: {
          has_profile: true,
          total_xp: 128_400,
          level: 20,
          level_title: "Leyenda",
          level_icon: "👑",
          next_level: null,
          xp_into_level: 8400,
          xp_needed: null,
          coins: 9042,
          current_streak: 214,
          longest_streak: 214,
          rank: 1,
          participants: 217,
          achievements: [
            {
              slug: "year-streak",
              title: "Un año sin fallar",
              description: "365 días consecutivos de actividad.",
              tier: "platinum",
              icon: "💎",
              xp_reward: 5000,
              earned_at: "2026-07-20T09:00:00Z",
            },
          ],
        },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── exam-readiness
  {
    widget: "exam-readiness",
    tool: "lms_demo_exam_readiness",
    title: "Readiness score + topic heatmap (lms_get_exam_readiness)",
    variants: [
      {
        id: "default",
        label: "68% ready, upcoming exam, 6 topics",
        output: "Readiness for «Evaluación parcial»: 68/100.",
        props: {
          course_id: 101,
          course_title: "React 19 en la práctica",
          exam: {
            exam_id: 9001,
            title: "Evaluación parcial: modelo de renderizado",
            exam_date: "2026-08-04T15:00:00Z",
          },
          readiness: 68,
          components: {
            exam_history: 74,
            practice: 61,
            lesson_coverage: 71,
            weights: { exam_history: 0.4, practice: 0.35, lesson_coverage: 0.25 },
          },
          formula:
            "readiness = 0.40 × historial de exámenes + 0.35 × práctica + 0.25 × cobertura de lecciones",
          topics: [
            { label: "Server components", mastery: 88, source: "exam", evidence: "3 preguntas acertadas de 3" },
            { label: "Hooks: estado", mastery: 79, source: "practice", evidence: "22 de 28 intentos correctos" },
            { label: "Efectos y limpieza", mastery: 44, source: "practice", evidence: "9 de 21 intentos correctos" },
            { label: "Suspense y streaming", mastery: 35, source: "exam", evidence: "1 pregunta acertada de 3" },
            { label: "Acciones de formulario", mastery: 62, source: "practice", evidence: "13 de 21 intentos correctos" },
            { label: "Compilador de React", mastery: 12, source: "practice", evidence: "1 de 8 intentos correctos" },
          ],
          lessons: { completed: 17, total: 24 },
        },
      },
      {
        id: "no-signal",
        label: "No data yet — readiness null",
        output: "Not enough signal to compute readiness yet.",
        props: {
          course_id: 103,
          course_title: "Postgres y Row Level Security",
          exam: null,
          readiness: null,
          components: {
            exam_history: null,
            practice: null,
            lesson_coverage: 0,
            weights: { exam_history: 0.4, practice: 0.35, lesson_coverage: 0.25 },
          },
          formula:
            "readiness = 0.40 × historial de exámenes + 0.35 × práctica + 0.25 × cobertura de lecciones",
          topics: [],
          lessons: { completed: 0, total: 15 },
        },
      },
      {
        id: "ready",
        label: "94% — exam tomorrow",
        output: "Readiness for «Examen final»: 94/100.",
        props: {
          course_id: 102,
          course_title: "TypeScript de cero a estricto",
          exam: {
            exam_id: 8803,
            title: "Examen final de TypeScript",
            exam_date: "2026-07-28T15:00:00Z",
          },
          readiness: 94,
          components: {
            exam_history: 96,
            practice: 91,
            lesson_coverage: 94,
            weights: { exam_history: 0.4, practice: 0.35, lesson_coverage: 0.25 },
          },
          formula:
            "readiness = 0.40 × historial de exámenes + 0.35 × práctica + 0.25 × cobertura de lecciones",
          topics: [
            { label: "Genéricos", mastery: 97, source: "exam", evidence: "8 preguntas acertadas de 8" },
            { label: "Tipos condicionales", mastery: 90, source: "practice", evidence: "27 de 30 intentos correctos" },
            { label: "Inferencia", mastery: 84, source: "practice", evidence: "21 de 25 intentos correctos" },
          ],
          lessons: { completed: 17, total: 18 },
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── practice-player
  {
    widget: "practice-player",
    tool: "lms_demo_practice_player",
    title: "Interactive practice quiz (lms_practice_quiz)",
    variants: [
      {
        id: "all-types",
        label: "One question of each of the 6 types",
        output: "Practice session on «Hooks» — 6 questions.",
        props: {
          topic: "Hooks: estado y efectos",
          mode: "focused",
          course_id: 101,
          lesson_id: 5003,
          source_exercise_id: 3301,
          questions: [
            {
              id: "q1",
              type: "multiple_choice",
              prompt: "¿Qué devuelve la función que pasas a useEffect?",
              options: [
                "El valor del estado actualizado",
                "Una función de limpieza que React ejecuta antes del siguiente efecto",
                "Nada, siempre debe ser void",
                "Una promesa que React espera",
              ],
              correct: "Una función de limpieza que React ejecuta antes del siguiente efecto",
              explanation:
                "El valor de retorno de un efecto es su limpieza. React la llama al desmontar y antes de volver a ejecutar el efecto.",
            },
            {
              id: "q2",
              type: "true_false",
              prompt: "Los hooks pueden llamarse dentro de un if siempre que la condición sea constante.",
              correct: false,
              explanation:
                "No. React identifica cada hook por su orden de llamada; una condicional puede alterar ese orden entre renders.",
            },
            {
              id: "q3",
              type: "fill_blank",
              prompt: "Para cachear un cálculo costoso entre renders se usa el hook ______.",
              correct: "useMemo",
              explanation: "useMemo recalcula solo cuando cambian sus dependencias.",
            },
            {
              id: "q4",
              type: "match",
              prompt: "Empareja cada hook con su propósito.",
              pairs: [
                { left: "useState", right: "Estado local del componente" },
                { left: "useEffect", right: "Sincronizar con un sistema externo" },
                { left: "useMemo", right: "Cachear un cálculo" },
                { left: "useRef", right: "Guardar un valor sin provocar render" },
              ],
              explanation: "useRef es el único de los cuatro que no dispara un nuevo render al cambiar.",
            },
            {
              id: "q5",
              type: "order",
              prompt: "Ordena lo que ocurre al montar un componente con un efecto.",
              sequence: [
                "React ejecuta el cuerpo del componente",
                "React aplica los cambios al DOM",
                "El navegador pinta",
                "React ejecuta el efecto",
              ],
              explanation: "Los efectos corren después del pintado; por eso no bloquean la primera imagen.",
            },
            {
              id: "q6",
              type: "free_text",
              prompt:
                "Un compañero dice que useEffect «se ejecuta cuando cambia el estado». ¿Qué le corregirías?",
              explanation:
                "Se ejecuta después de un render en el que alguna dependencia declarada cambió — no por cambiar el estado en sí.",
            },
          ],
        },
      },
      {
        id: "mixed",
        label: "Interleaved session across topics",
        output: "Mixed practice — 4 questions across 3 topics.",
        props: {
          topic: "Repaso mezclado",
          mode: "mixed",
          course_id: 101,
          lesson_id: null,
          source_exercise_id: null,
          questions: [
            {
              id: "m1",
              type: "multiple_choice",
              topic: "Server components",
              prompt: "¿Dónde se ejecuta un server component?",
              options: ["En el navegador", "En el servidor", "En ambos", "En un web worker"],
              correct: "En el servidor",
              explanation: "Por eso puede leer la base de datos directamente y nunca llega su código al cliente.",
            },
            {
              id: "m2",
              type: "true_false",
              topic: "Efectos y limpieza",
              prompt: "La limpieza de un efecto se ejecuta también antes de cada re-ejecución del efecto.",
              correct: true,
              explanation: "No solo al desmontar: React limpia el efecto anterior antes de aplicar el nuevo.",
            },
            {
              id: "m3",
              type: "fill_blank",
              topic: "Acciones de formulario",
              prompt: "El hook que expone el estado de una acción de formulario es ______.",
              correct: "useActionState",
              explanation: "Devuelve el estado, la acción envuelta y un booleano de pendiente.",
            },
            {
              id: "m4",
              type: "free_text",
              topic: "Suspense",
              prompt: "¿Qué problema resuelve Suspense que no resolvía un estado `isLoading` manual?",
            },
          ],
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────── flashcards
  {
    widget: "flashcards",
    tool: "lms_demo_flashcards",
    title: "FSRS review session (lms_get_due_reviews)",
    variants: [
      {
        id: "default",
        label: "6 cards due out of 23",
        output: "6 card(s) in this session, 23 due in total.",
        props: {
          total_due: 23,
          cards: [
            {
              id: 2201,
              front: "¿Qué hace `useEffect` sin array de dependencias?",
              back: "Se ejecuta después de **cada** render. Es la causa habitual de bucles infinitos de fetch.",
              repetitions: 4,
              interval_days: 9,
            },
            {
              id: 2202,
              front: "¿Qué es una política RLS?",
              back: "Una expresión SQL que Postgres añade a cada consulta sobre la tabla, por rol y por operación. Si devuelve falso, la fila no existe para ese usuario.",
              repetitions: 1,
              interval_days: 1,
            },
            {
              id: 2203,
              front: "Diferencia entre `unknown` y `any`",
              back: "`any` desactiva el chequeo; `unknown` obliga a estrechar el tipo antes de usarlo. `unknown` es el `any` seguro.",
              repetitions: 7,
              interval_days: 34,
            },
            {
              id: 2204,
              front: "¿Cuándo se serializa un server component?",
              back: "Al renderizar en el servidor: viaja el resultado (el árbol), nunca el código del componente.",
              repetitions: 0,
              interval_days: 0,
            },
            {
              id: 2205,
              front: "¿Qué devuelve `useActionState`?",
              back: "Una tupla: `[state, formAction, isPending]`.",
              repetitions: 2,
              interval_days: 3,
            },
            {
              id: 2206,
              front:
                "Explica por qué `setItems(items.push(nuevo))` deja el estado en un número en lugar de un array",
              back: "`Array.prototype.push` muta el array y devuelve la **nueva longitud**, así que eso es lo que acaba guardado. Lo correcto es `setItems([...items, nuevo])`.",
              repetitions: 3,
              interval_days: 6,
            },
          ],
        },
      },
      {
        id: "empty",
        label: "Nothing due today",
        output: "No cards are due right now.",
        props: { total_due: 0, cards: [] },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────── study-plan
  {
    widget: "study-plan",
    tool: "lms_demo_study_plan",
    title: "Weekly study plan (lms_get_study_plan)",
    variants: [
      {
        id: "default",
        label: "Mid-week, 3 of 7 goals done",
        output: "Study plan for the week of 2026-07-27 — 43% complete.",
        props: {
          week_start: "2026-07-27",
          progress: 43,
          goals: [
            {
              id: 601,
              title: "Terminar «Efectos y limpieza»",
              kind: "lesson",
              course_id: 101,
              required: true,
              done: true,
              done_at: "2026-07-27T19:12:00Z",
            },
            {
              id: 602,
              title: "Ver «Acciones de formulario y useActionState»",
              kind: "lesson",
              course_id: 101,
              required: true,
              done: true,
              done_at: "2026-07-28T08:05:00Z",
            },
            {
              id: 603,
              title: "Practicar efectos hasta 70% de dominio",
              kind: "practice",
              course_id: 101,
              required: true,
              done: false,
              done_at: null,
            },
            {
              id: 604,
              title: "Repasar las 23 tarjetas pendientes",
              kind: "review",
              course_id: null,
              required: false,
              done: true,
              done_at: "2026-07-28T21:40:00Z",
            },
            {
              id: 605,
              title: "Simulacro del parcial del 4 de agosto",
              kind: "exam_prep",
              course_id: 101,
              required: true,
              done: false,
              done_at: null,
            },
            {
              id: 606,
              title: "Leer el capítulo 3 de «Tipos condicionales»",
              kind: "lesson",
              course_id: 102,
              required: false,
              done: false,
              done_at: null,
            },
            {
              id: 607,
              title: "Escribir un resumen de lo aprendido para el blog del grupo",
              kind: "custom",
              course_id: null,
              required: false,
              done: false,
              done_at: null,
            },
          ],
          context: {
            next_lessons: [
              {
                course_id: 101,
                course_title: "React 19 en la práctica",
                lesson_id: 5018,
                lesson_title: "Suspense en listas largas",
              },
              {
                course_id: 102,
                course_title: "TypeScript de cero a estricto",
                lesson_id: 6013,
                lesson_title: "Tipos condicionales",
              },
            ],
            due_reviews: 23,
          },
        },
      },
      {
        id: "done",
        label: "Week finished — 100%",
        output: "Study plan for the week of 2026-07-20 — complete.",
        props: {
          week_start: "2026-07-20",
          progress: 100,
          goals: [
            { id: 501, title: "Terminar el módulo de genéricos", kind: "lesson", course_id: 102, required: true, done: true, done_at: "2026-07-21T18:00:00Z" },
            { id: 502, title: "Practicar inferencia", kind: "practice", course_id: 102, required: true, done: true, done_at: "2026-07-23T20:15:00Z" },
            { id: 503, title: "Repasar tarjetas", kind: "review", course_id: null, required: false, done: true, done_at: "2026-07-25T09:00:00Z" },
          ],
          context: { next_lessons: [], due_reviews: 0 },
        },
      },
      {
        id: "empty",
        label: "No plan set for this week",
        output: "No study plan for this week yet.",
        props: {
          week_start: "2026-07-27",
          progress: 0,
          goals: [],
          context: {
            next_lessons: [
              {
                course_id: 101,
                course_title: "React 19 en la práctica",
                lesson_id: 5018,
                lesson_title: "Suspense en listas largas",
              },
            ],
            due_reviews: 23,
          },
        },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────── school-overview
  {
    widget: "school-overview",
    tool: "lms_demo_school_overview",
    title: "Admin school KPIs (lms_get_school_stats)",
    variants: [
      {
        id: "default",
        label: "Healthy school, 6 courses",
        output: "Code Academy Pro — 6 courses, 1,043 active enrollments.",
        props: {
          school: {
            name: "Code Academy Pro",
            courses_total: 6,
            courses_published: 3,
            courses_draft: 2,
            courses_archived: 1,
            active_enrollments: 1043,
            students: 612,
            published_lessons: 88,
            completion_rate: 54,
            exam_submissions: 2417,
            avg_exam_score: 76,
            at_risk_students: 87,
          },
          courses: [
            {
              id: 102,
              title: "TypeScript de cero a estricto",
              status: "published",
              active_enrollments: 412,
              published_lessons: 18,
              completion_rate: 68,
              exam_avg: 81,
              submission_count: 1104,
            },
            {
              id: 101,
              title: "React 19 en la práctica",
              status: "published",
              active_enrollments: 318,
              published_lessons: 22,
              completion_rate: 47,
              exam_avg: 74,
              submission_count: 902,
            },
            {
              id: 103,
              title: "Postgres y Row Level Security",
              status: "published",
              active_enrollments: 97,
              published_lessons: 15,
              completion_rate: 22,
              exam_avg: null,
              submission_count: 0,
            },
            {
              id: 106,
              title: "jQuery para aplicaciones modernas",
              status: "archived",
              active_enrollments: 216,
              published_lessons: 31,
              completion_rate: 91,
              exam_avg: 69,
              submission_count: 411,
            },
            {
              id: 104,
              title: "Diseño de APIs REST",
              status: "draft",
              active_enrollments: 0,
              published_lessons: 0,
              completion_rate: 0,
              exam_avg: null,
              submission_count: 0,
            },
            {
              id: 105,
              title: "Fundamentos de accesibilidad web",
              status: "draft",
              active_enrollments: 0,
              published_lessons: 2,
              completion_rate: 0,
              exam_avg: null,
              submission_count: 0,
            },
          ],
        },
      },
      {
        id: "new-school",
        label: "Freshly created school, no data",
        output: "Escuela Nueva — no activity yet.",
        props: {
          school: {
            name: "Escuela Nueva",
            courses_total: 1,
            courses_published: 0,
            courses_draft: 1,
            courses_archived: 0,
            active_enrollments: 0,
            students: 0,
            published_lessons: 0,
            completion_rate: 0,
            exam_submissions: 0,
            avg_exam_score: null,
            at_risk_students: 0,
          },
          courses: [
            {
              id: 900,
              title: "Mi primer curso",
              status: "draft",
              active_enrollments: 0,
              published_lessons: 0,
              completion_rate: 0,
              exam_avg: null,
              submission_count: 0,
            },
          ],
        },
      },
    ],
  },

  // ────────────────────────────────────────────────────── student-progress-roster
  {
    widget: "student-progress-roster",
    tool: "lms_demo_student_progress_roster",
    title: "Per-course student roster (lms_get_student_progress)",
    variants: [
      {
        id: "default",
        label: "10 students, 3 at risk",
        output: "Roster for React 19 en la práctica — 10 students, 3 at risk.",
        props: {
          course: { id: 101, title: "React 19 en la práctica", published_lessons: 22 },
          summary: { total: 10, at_risk: 3, avg_progress: 52 },
          students: [
            { student_id: "u-001", student_name: "Alicia Nguyen", status: "active", enrolled: "2026-03-04T09:00:00Z", completed_lessons: 22, progress_pct: 100, exam_avg: 92, exam_count: 3, last_active: "2026-07-26T20:11:00Z", at_risk: false },
            { student_id: "u-002", student_name: "Bruno Salas", status: "active", enrolled: "2026-03-04T09:02:00Z", completed_lessons: 19, progress_pct: 86, exam_avg: 78, exam_count: 3, last_active: "2026-07-25T18:44:00Z", at_risk: false },
            { student_id: "u-003", student_name: "Camila Rojas", status: "active", enrolled: "2026-03-11T14:20:00Z", completed_lessons: 14, progress_pct: 64, exam_avg: 64, exam_count: 2, last_active: "2026-07-24T14:19:00Z", at_risk: false },
            { student_id: "u-004", student_name: "Diego Fernández", status: "active", enrolled: "2026-04-01T08:00:00Z", completed_lessons: 3, progress_pct: 14, exam_avg: null, exam_count: 0, last_active: "2026-05-30T11:02:00Z", at_risk: true },
            { student_id: "u-005", student_name: "Emma Whitfield", status: "active", enrolled: "2026-04-15T16:30:00Z", completed_lessons: 21, progress_pct: 95, exam_avg: 100, exam_count: 3, last_active: "2026-07-27T07:55:00Z", at_risk: false },
            { student_id: "u-006", student_name: "Farid Haddad", status: "active", enrolled: "2026-04-22T10:10:00Z", completed_lessons: 6, progress_pct: 27, exam_avg: 41, exam_count: 1, last_active: "2026-07-04T09:31:00Z", at_risk: true },
            { student_id: "u-007", student_name: "Grace Okoye", status: "active", enrolled: "2026-05-02T12:00:00Z", completed_lessons: 11, progress_pct: 50, exam_avg: null, exam_count: 1, last_active: "2026-07-26T08:12:00Z", at_risk: false },
            // No display name on the profile row.
            { student_id: "u-008", student_name: null, status: "active", enrolled: "2026-05-19T09:45:00Z", completed_lessons: 0, progress_pct: 0, exam_avg: null, exam_count: 0, last_active: null, at_risk: true },
            { student_id: "u-009", student_name: "Hugo Marín", status: "active", enrolled: "2026-06-02T13:15:00Z", completed_lessons: 13, progress_pct: 59, exam_avg: 87, exam_count: 2, last_active: "2026-07-26T11:55:00Z", at_risk: false },
            { student_id: "u-010", student_name: "Irene Castaño", status: "completed", enrolled: "2026-02-20T08:30:00Z", completed_lessons: 22, progress_pct: 100, exam_avg: 89, exam_count: 3, last_active: "2026-07-12T15:20:00Z", at_risk: false },
          ],
        },
      },
      {
        id: "empty",
        label: "Nobody enrolled yet",
        output: "No students enrolled in Diseño de APIs REST.",
        props: {
          course: { id: 104, title: "Diseño de APIs REST", published_lessons: 0 },
          summary: { total: 0, at_risk: 0, avg_progress: 0 },
          students: [],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────────────── confusion-hotspots
  {
    widget: "confusion-hotspots",
    tool: "lms_demo_confusion_hotspots",
    title: "Where students struggle (lms_get_confusion_hotspots)",
    variants: [
      {
        id: "default",
        label: "8 hotspots, 3 mislabelled items",
        output:
          "8 hotspot(s) (last 30 days), worst first: useEffect cleanup (7 student(s), severity 88); Memoiza la lista de resultados (6 student(s), severity 84); Parcial 1: ¿Cuándo se vuelve a ejecutar un efecto? (9 student(s), severity 79).",
        props: {
          course: { id: 101, title: "React 19 en la práctica" },
          window_days: 30,
          truncated: false,
          sources: {
            practice_attempts: 214,
            exercise_evaluations: 96,
            exam_submissions: 31,
          },
          severity_formula:
            "severity = round(intensity * 60 + min(students_affected, 10) * 4), capped at 100.",
          hotspots: [
            { scope: "practice", ref: 5012, label: "useEffect cleanup", students_affected: 7, severity: 88, evidence: "41 attempt(s) by 9 student(s), avg score 38; 7 student(s) below 70" },
            { scope: "exercise", ref: 3301, label: "Memoiza la lista de resultados", students_affected: 6, severity: 84, evidence: "6 of 7 student(s) not passing on their latest attempt; avg 4.3 attempt(s) per student" },
            { scope: "exam_question", ref: 9104, label: "Parcial 1: ¿Cuándo se vuelve a ejecutar un efecto con array de dependencias vacío?", students_affected: 9, severity: 79, evidence: "9 of 12 student(s) missed it on their latest submission (75% miss rate)" },
            { scope: "exercise", ref: 3307, label: "Extrae un custom hook de este componente", students_affected: 5, severity: 66, evidence: "5 of 9 student(s) not passing on their latest attempt; avg 2.8 attempt(s) per student" },
            { scope: "practice", ref: 5019, label: "Server Components vs Client Components", students_affected: 4, severity: 58, evidence: "27 attempt(s) by 8 student(s), avg score 61; 4 student(s) below 70" },
            { scope: "exam_question", ref: 9111, label: "Parcial 1: Explica por qué esta lista pierde el estado al reordenarse", students_affected: 4, severity: 47, evidence: "4 of 12 student(s) missed it on their latest submission (33% miss rate)" },
            // A long-tail item: real but not worth reteaching for.
            { scope: "exercise", ref: 3312, label: "Añade una key estable al map", students_affected: 1, severity: 22, evidence: "1 of 8 student(s) not passing on their latest attempt; avg 1.2 attempt(s) per student" },
            // Practice topic with no lesson mapping — ref is null.
            { scope: "practice", ref: null, label: "Suspense y streaming", students_affected: 2, severity: 19, evidence: "9 attempt(s) by 5 student(s), avg score 74; 2 student(s) below 70" },
          ],
          hardest_items: [
            // Labelled easy, plays hard — the headline case this widget exists for.
            { item_type: "exercise", item_id: 3301, title: "Memoiza la lista de resultados", rating: 1782, attempt_count: 31, difficulty_level: "easy", mismatch: "harder_than_labeled" },
            { item_type: "exam_question", item_id: 9104, title: "¿Cuándo se vuelve a ejecutar un efecto con array de dependencias vacío?", rating: 1704, attempt_count: 12, difficulty_level: null, mismatch: null },
            { item_type: "exercise", item_id: 3307, title: "Extrae un custom hook de este componente", rating: 1691, attempt_count: 25, difficulty_level: "medium", mismatch: "harder_than_labeled" },
            { item_type: "exercise", item_id: 3305, title: "Corrige el bucle infinito de useEffect", rating: 1612, attempt_count: 18, difficulty_level: "hard", mismatch: null },
            { item_type: "exercise", item_id: 3309, title: "Convierte la clase a función", rating: 1544, attempt_count: 22, difficulty_level: "medium", mismatch: null },
            // Labelled hard, everyone passes it first try.
            { item_type: "exercise", item_id: 3312, title: "Añade una key estable al map", rating: 1301, attempt_count: 40, difficulty_level: "hard", mismatch: "easier_than_labeled" },
          ],
        },
      },
      {
        id: "all-clear",
        label: "Activity, but nobody stuck",
        output:
          "No confusion hotspots in the last 30 day(s) — no low practice scores, stuck students, or missed exam questions on record for this course.",
        props: {
          course: { id: 102, title: "Fundamentos de TypeScript" },
          window_days: 30,
          truncated: false,
          sources: {
            practice_attempts: 88,
            exercise_evaluations: 44,
            exam_submissions: 12,
          },
          severity_formula:
            "severity = round(intensity * 60 + min(students_affected, 10) * 4), capped at 100.",
          hotspots: [],
          hardest_items: [
            { item_type: "exercise", item_id: 4401, title: "Tipa esta función genérica", rating: 1522, attempt_count: 14, difficulty_level: "medium", mismatch: null },
            { item_type: "exercise", item_id: 4405, title: "Estrecha el tipo con un type guard", rating: 1488, attempt_count: 11, difficulty_level: "medium", mismatch: null },
          ],
        },
      },
      {
        id: "empty",
        label: "No student activity at all",
        output:
          "No confusion hotspots in the last 30 day(s) — no low practice scores, stuck students, or missed exam questions on record for this course.",
        props: {
          course: { id: 104, title: "Diseño de APIs REST" },
          window_days: 30,
          truncated: false,
          sources: {
            practice_attempts: 0,
            exercise_evaluations: 0,
            exam_submissions: 0,
          },
          severity_formula:
            "severity = round(intensity * 60 + min(students_affected, 10) * 4), capped at 100.",
          hotspots: [],
          hardest_items: [],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── artifact-sandbox
  {
    widget: "artifact-sandbox",
    tool: "lms_demo_artifact_sandbox",
    title: "Artifact exercise sandbox (lms_preview_artifact)",
    variants: [
      {
        id: "default",
        label: "Interactive ordering exercise",
        output: "Artifact preview for exercise 3301.",
        props: {
          exercise: {
            id: 3301,
            title: "Ordena el ciclo de vida de una petición",
            instructions:
              "Haz clic en los cuatro pasos en el orden en que ocurren cuando un componente monta y pide datos. Si te equivocas, la secuencia se reinicia.",
            difficulty: "intermediate",
          },
          artifact: {
            type: "html",
            html: ARTIFACT_HTML,
            evaluation_criteria:
              "Correcto si el estudiante completa la secuencia montar → fetch → renderizar → limpiar sin reiniciar más de una vez. Se penaliza reiniciar tres o más veces (indica ensayo y error, no comprensión).",
            system_prompt:
              "Eres el evaluador de este artefacto. Recibes el registro de clics. Devuelve una puntuación 0-100 y una frase de retroalimentación en español, sin revelar el orden correcto si la puntuación es menor que la de aprobado.",
            passing_score: 70,
          },
        },
      },
    ],
  },

  // ───────────────────────────────────────────────────── landing-page-preview
  {
    widget: "landing-page-preview",
    tool: "lms_demo_landing_page_preview",
    title: "Landing page wireframe (lms_get_landing_page)",
    variants: [
      {
        id: "published",
        label: "Live homepage, 8 sections",
        output: "«Aprende a programar de verdad» (/home) — PUBLISHED, 8 sections.",
        props: {
          title: "Aprende a programar de verdad",
          slug: "home",
          is_published: true,
          public_path: "/",
          preview_path: "/dashboard/admin/landing-page/preview/pg_7fa21c",
          preview_url: "https://code-academy.lmsplatform.com/dashboard/admin/landing-page/preview/pg_7fa21c",
          brand_color: "#7c3aed",
          warnings: [],
          sections: [
            {
              type: "Hero",
              layout: "hero",
              heading: "Aprende a programar de verdad",
              subtitle: "Cursos guiados por profesionales en activo, con proyectos que puedes enseñar en una entrevista.",
              ctas: ["Empezar gratis", "Ver el temario"],
              items: [],
              itemCount: 0,
              color: null,
            },
            {
              type: "LogoCloud",
              layout: "band",
              heading: "Nuestros alumnos trabajan en",
              subtitle: "",
              ctas: [],
              items: ["Mercado Libre", "Globant", "Rappi", "Nubank", "Platzi"],
              itemCount: 5,
              color: null,
            },
            {
              type: "Stats",
              layout: "stats",
              heading: "Los números",
              subtitle: "Actualizados cada trimestre",
              ctas: [],
              items: ["612 alumnos activos", "88 lecciones", "76% nota media", "4.8/5 satisfacción"],
              itemCount: 4,
              color: "#0f172a",
            },
            {
              type: "FeatureGrid",
              layout: "grid",
              heading: "Por qué esta escuela y no otra",
              subtitle: "Tres cosas que hacemos distinto",
              ctas: [],
              items: ["Proyectos reales", "Revisión de código humana", "Bolsa de empleo"],
              itemCount: 3,
              color: null,
            },
            {
              type: "CourseList",
              layout: "list",
              heading: "Cursos disponibles",
              subtitle: "",
              ctas: ["Ver todos"],
              items: [
                "React 19 en la práctica",
                "TypeScript de cero a estricto",
                "Postgres y Row Level Security",
              ],
              itemCount: 3,
              color: null,
            },
            {
              type: "Testimonials",
              layout: "media",
              heading: "Lo que dicen quienes ya pasaron",
              subtitle: "",
              ctas: [],
              items: ["Alicia N. — «Conseguí trabajo en 4 meses»", "Bruno S. — «El feedback humano cambia todo»"],
              itemCount: 2,
              color: null,
            },
            {
              type: "FAQ",
              layout: "list",
              heading: "Preguntas frecuentes",
              subtitle: "",
              ctas: [],
              items: [
                "¿Necesito experiencia previa?",
                "¿Los cursos son en vivo?",
                "¿Hay certificado?",
                "¿Puedo pagar en cuotas?",
              ],
              itemCount: 4,
              color: null,
            },
            {
              type: "CTA",
              layout: "band",
              heading: "Empieza hoy, cancela cuando quieras",
              subtitle: "Primera semana gratis, sin tarjeta.",
              ctas: ["Crear mi cuenta"],
              items: [],
              itemCount: 0,
              color: "#7c3aed",
            },
          ],
        },
      },
      {
        id: "draft-warnings",
        label: "Draft with generator warnings",
        output: "«Bootcamp de verano» (/bootcamp-verano) — draft, 3 sections, 2 warnings.",
        props: {
          title: "Bootcamp de verano",
          slug: "bootcamp-verano",
          is_published: false,
          public_path: "/p/bootcamp-verano",
          preview_path: "/dashboard/admin/landing-page/preview/pg_c40b18",
          preview_url: null,
          brand_color: null,
          warnings: [
            "El bloque «Pricing» referencia el plan «summer-2026», que no existe en este tenant. Se renderizará vacío.",
            "«Hero» no define imagen de fondo; se usará el color de marca.",
          ],
          sections: [
            {
              type: "Hero",
              layout: "hero",
              heading: "Bootcamp intensivo de verano",
              subtitle: "Seis semanas, un proyecto, plazas limitadas.",
              ctas: ["Reservar plaza"],
              items: [],
              itemCount: 0,
              color: null,
            },
            {
              type: "Pricing",
              layout: "grid",
              heading: "Planes",
              subtitle: "",
              ctas: [],
              items: [],
              itemCount: 0,
              color: null,
            },
            {
              type: "RichText",
              layout: "text",
              heading: "Condiciones",
              subtitle: "Letra pequeña que nadie lee pero que tiene que estar",
              ctas: [],
              items: [],
              itemCount: 0,
              color: null,
            },
          ],
        },
      },
    ],
  },

  // ────────────────────────────────────────────────────────── my-certificates
  {
    widget: "my-certificates",
    tool: "lms_demo_my_certificates",
    title: "A student's own certificates (lms_my_certificates)",
    variants: [
      {
        id: "default",
        label: "3 certificates: valid, expiring, revoked",
        output: "3 certificate(s), 1 currently valid.",
        props: {
          total: 3,
          valid: 1,
          certificates: [
            {
              certificate_id: "c1f0a4de-1b21-4a55-9a6e-2b0d7e4c1101",
              course_id: 101,
              course_title: "React 19 en la práctica",
              verification_code: "A7K2M9QX4R1TB6VZ0P3N",
              verify_url: "https://code-academy.lmsplatform.com/verify/A7K2M9QX4R1TB6VZ0P3N",
              pdf_url: "https://cdn.lmsplatform.com/certs/c1f0a4de.pdf",
              issued_at: "2026-06-18T10:22:00Z",
              expires_at: null,
              revoked_at: null,
              revoke_reason: null,
              status: "valid",
              share_count: 4,
              view_count: 37,
            },
            {
              // Expiry is the branch schools forget exists: expiration_days is
              // optional, so most certificates never expire and this one must
              // not read like an error.
              certificate_id: "c1f0a4de-1b21-4a55-9a6e-2b0d7e4c1102",
              course_id: 102,
              course_title: "Fundamentos de bases de datos",
              verification_code: "B3D8W1LC5H7YE2QM6F0S",
              verify_url: "https://code-academy.lmsplatform.com/verify/B3D8W1LC5H7YE2QM6F0S",
              pdf_url: null,
              issued_at: "2025-02-02T09:00:00Z",
              expires_at: "2026-02-02T09:00:00Z",
              revoked_at: null,
              revoke_reason: null,
              status: "expired",
              share_count: 0,
              view_count: 2,
            },
            {
              // No course title: certificates.course_id is ON DELETE SET NULL,
              // so a deleted course leaves a real, still-verifiable credential
              // with nothing to name it.
              certificate_id: "c1f0a4de-1b21-4a55-9a6e-2b0d7e4c1103",
              course_id: null,
              course_title: null,
              verification_code: "Z9V4T2GK8J6XN1RA5C7U",
              verify_url: null,
              pdf_url: null,
              issued_at: "2026-01-14T16:40:00Z",
              expires_at: null,
              revoked_at: "2026-03-01T11:05:00Z",
              revoke_reason: "Issued in error during a data import.",
              status: "revoked",
              share_count: 0,
              view_count: 11,
            },
          ],
        },
      },
      {
        id: "empty",
        label: "No certificates yet",
        output: "You have no certificates yet.",
        props: { total: 0, valid: 0, certificates: [] },
      },
    ],
  },

  // ────────────────────────────────────────────────────── course-certificates
  {
    widget: "course-certificates",
    tool: "lms_demo_course_certificates",
    title: "Course certificate roster (lms_list_course_certificates)",
    variants: [
      {
        id: "default",
        label: "Template active, 3 issued, 3 awaiting",
        output:
          "3 certificate(s) issued for «React 19 en la práctica»; 3 of 6 active student(s) still awaiting one.",
        props: {
          course: { id: 101, title: "React 19 en la práctica" },
          template: {
            name: "Certificado de finalización",
            issuer_name: "Code Academy",
            is_active: true,
            min_lesson_completion_pct: 100,
            min_exam_pass_score: 70,
            requires_all_exams: true,
            expiration_days: null,
          },
          summary: { issued: 3, revoked: 1, active_students: 6, awaiting: 3 },
          certificates: [
            {
              certificate_id: "d2e1b5cf-2c32-4b66-8b7f-3c1e8f5d2201",
              student_id: "u-001",
              student_name: "Alicia Nguyen",
              verification_code: "A7K2M9QX4R1TB6VZ0P3N",
              verify_url: "https://code-academy.lmsplatform.com/verify/A7K2M9QX4R1TB6VZ0P3N",
              issued_at: "2026-06-18T10:22:00Z",
              expires_at: null,
              revoked_at: null,
              revoke_reason: null,
              status: "valid",
            },
            {
              certificate_id: "d2e1b5cf-2c32-4b66-8b7f-3c1e8f5d2202",
              student_id: "u-005",
              student_name: "Emma Whitfield",
              verification_code: "M4P8R2XW9K1LQ7ZC3B6T",
              verify_url: "https://code-academy.lmsplatform.com/verify/M4P8R2XW9K1LQ7ZC3B6T",
              issued_at: "2026-07-02T08:15:00Z",
              expires_at: "2027-07-02T08:15:00Z",
              revoked_at: null,
              revoke_reason: null,
              status: "valid",
            },
            {
              // The profile row has no full_name — the widget must say so
              // rather than invent a name out of the user id.
              certificate_id: "d2e1b5cf-2c32-4b66-8b7f-3c1e8f5d2203",
              student_id: "u-008",
              student_name: null,
              verification_code: "Q1N6H3JD7S9WF2VK8Y5R",
              verify_url: null,
              issued_at: "2026-07-11T19:03:00Z",
              expires_at: null,
              revoked_at: null,
              revoke_reason: null,
              status: "valid",
            },
          ],
          awaiting: [
            { student_id: "u-002", student_name: "Bruno Salas" },
            { student_id: "u-004", student_name: "Diego Fernández" },
            { student_id: "u-006", student_name: null },
          ],
        },
      },
      {
        id: "no-template",
        label: "No template — the course issues nothing",
        output:
          "Course «Diseño de APIs REST» has no active certificate template, so nothing is issued automatically.",
        props: {
          course: { id: 104, title: "Diseño de APIs REST" },
          template: null,
          summary: { issued: 0, revoked: 0, active_students: 4, awaiting: 4 },
          certificates: [],
          awaiting: [
            { student_id: "u-011", student_name: "Lucía Ferrer" },
            { student_id: "u-012", student_name: "Marc Oliver" },
            { student_id: "u-013", student_name: "Nadia Rahmani" },
            { student_id: "u-014", student_name: "Oscar Peña" },
          ],
        },
      },
    ],
  },
];

/** Look a demo up by tool name. */
export function findDemoByTool(tool: string): WidgetDemo | undefined {
  return WIDGET_DEMOS.find((d) => d.tool === tool);
}
