import React from 'react';
import * as UI from './index';

// Mapeo de componentes que estarán disponibles automáticamente en MDX
export const mdxComponents = {
  // HTML básicos estilizados
  h1: ({ className, ...props }: React.ComponentProps<"h1">) => (
    <h1 className="mt-2 scroll-m-20 text-3xl font-bold tracking-tight lg:text-4xl" {...props} />
  ),
  h2: ({ className, ...props }: React.ComponentProps<"h2">) => (
    <h2 className="mt-10 scroll-m-20 border-b pb-1 text-2xl font-semibold tracking-tight first:mt-0" {...props} />
  ),
  h3: ({ className, ...props }: React.ComponentProps<"h3">) => (
    <h3 className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight" {...props} />
  ),
  h4: ({ className, ...props }: React.ComponentProps<"h4">) => (
    <h4 className="mt-8 scroll-m-20 text-lg font-semibold tracking-tight" {...props} />
  ),
  h5: ({ className, ...props }: React.ComponentProps<"h5">) => (
    <h5 className="mt-8 scroll-m-20 text-lg font-semibold tracking-tight" {...props} />
  ),
  h6: ({ className, ...props }: React.ComponentProps<"h6">) => (
    <h6 className="mt-8 scroll-m-20 text-base font-semibold tracking-tight" {...props} />
  ),
  a: ({ className, ...props }: React.ComponentProps<"a">) => (
    <a className="font-medium underline underline-offset-4" {...props} />
  ),
  p: ({ className, ...props }: React.ComponentProps<"p">) => (
    <p className="leading-7 [&:not(:first-child)]:mt-6" {...props} />
  ),
  ul: ({ className, ...props }: React.ComponentProps<"ul">) => (
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props} />
  ),
  ol: ({ className, ...props }: React.ComponentProps<"ol">) => (
    <ol className="my-6 ml-6 list-decimal [&>li]:mt-2" {...props} />
  ),
  li: ({ className, ...props }: React.ComponentProps<"li">) => (
    <li className="mt-2" {...props} />
  ),
  blockquote: ({ className, ...props }: React.ComponentProps<"blockquote">) => (
    <blockquote className="mt-6 border-l-2 pl-6 italic" {...props} />
  ),
  img: ({ className, alt, ...props }: React.ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rounded-md border" alt={alt} {...props} />
  ),
  hr: ({ ...props }: React.ComponentProps<"hr">) => (
    <hr className="my-4 md:my-8" {...props} />
  ),
  table: ({ className, ...props }: React.ComponentProps<"table">) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className="w-full" {...props} />
    </div>
  ),
  tr: ({ className, ...props }: React.ComponentProps<"tr">) => (
    <tr className="m-0 border-t p-0 even:bg-muted" {...props} />
  ),
  th: ({ className, ...props }: React.ComponentProps<"th">) => (
    <th className="border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right" {...props} />
  ),
  td: ({ className, ...props }: React.ComponentProps<"td">) => (
    <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right" {...props} />
  ),
  pre: ({ className, ...props }: React.ComponentProps<"pre">) => (
    <pre className="mb-4 mt-6 overflow-x-auto rounded-lg border bg-black py-4 px-4 text-white" {...props} />
  ),
  code: ({ className, ...props }: React.ComponentProps<"code">) => (
    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold" {...props} />
  ),

  // Componentes UI exportados
  Button: UI.Button,
  Card: UI.Card,
  Alert: UI.Alert,
  Badge: UI.Badge,
  Tooltip: UI.Tooltip,
  Table: UI.Table,
  Tabs: UI.Tabs,
  // agrega más según sea necesario
};

export type MDXComponents = typeof mdxComponents;

export default mdxComponents;
