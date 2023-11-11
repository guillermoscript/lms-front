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
            Account
          </Link>
        </li>
        <li>
          <Link href="/auth/logout">
            Logout
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
            Iniciar Sesión
          </Link>
        </li>
        <li>
          <Link href="/auth/create-account">
            Crear Cuenta
          </Link>
        </li>
      </>
    )
  }

  return null;
};
