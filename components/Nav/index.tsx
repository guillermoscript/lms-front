import Link from 'next/link';
import React from 'react';
import { useAuth } from '../Auth';
import classes from './index.module.css';

export const Nav: React.FC = () => {
  const { user } = useAuth();

  return (
    <nav className={classes.nav}>
      {user && (
        <React.Fragment>
          <Link href="/account">
            <a>Account</a>
          </Link>
          <Link href="/logout">
            <a>Logout</a>
          </Link>
        </React.Fragment>
      )}
      {!user && (
        <React.Fragment>
          <Link href="/login">
            <a>Login</a>
          </Link>
          <Link href="/create-account">
            <a>Create Account</a>
          </Link>
        </React.Fragment>
      )}
    </nav>
  );
};
