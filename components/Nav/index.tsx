import Link from 'next/link';
import React from 'react';
import { useAuth } from '../Auth';
import classes from './index.module.css';

export const Nav: React.FC = () => {
  
  const { user } = useAuth();

  if (user) {
    return (
      <>
        <li>
          <Link href="/dashboard/account">
            <a>Account</a>
          </Link>
        </li>
        <li>
          <Link href="/auth/logout">
            <a>Logout</a>
          </Link>
        </li>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <li>
          <Link href="/auth/login">
            <a>Iniciar Sesión</a>
          </Link>
        </li>
        <li>
          <Link href="/auth/create-account">
            <a>Crear Cuenta</a>
          </Link>
        </li>
      </>
    )
  }

  return null;
};
