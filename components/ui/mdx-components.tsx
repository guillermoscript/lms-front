import React from 'react';
import * as UI from './index';

// Mapeo de componentes que estarán disponibles automáticamente en MDX
export const mdxComponents = {
  // HTML básicos estilizados
  h1: (props: any) => <h1 className="text-3xl font-bold" {...props} />,
  h2: (props: any) => <h2 className="text-2xl font-semibold" {...props} />,
  p: (props: any) => <p className="leading-7" {...props} />,
  a: (props: any) => <a className="text-sky-600 underline" {...props} />,

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
