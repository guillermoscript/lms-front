import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "../../components/Auth";
import classes from './index.module.css';

const Logout: React.FC = () => {
  const { logout } = useAuth();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const performLogout = async () => {
      try {
        await logout();
        setSuccess('Logged out successfully.');
      } catch (_) {
        setError('You are already logged out.');
      }
    }

    performLogout();
  }, [logout]);

  return (
    <React.Fragment>
      {success && (
        <h1>{success}</h1>
      )}
      {error && (
        <div className={classes.error}>
          {error}
        </div>
      )}
    </React.Fragment>
  )
}

export default Logout;