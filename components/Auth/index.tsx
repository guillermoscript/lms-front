import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { User } from '../../payload-types';
import axios from 'axios';

type Login = (args: { email: string; password: string }) => Promise<void>;

type Logout = () => Promise<void>;

type AuthContext = {
  user?: User | null;
  setUser: (user: User | null) => void;
  logout: Logout;
  login: Login;
};

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CMS_URL, 
});

const Context = createContext({} as AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>();

  const login = useCallback<Login>(async (args) => {
    const res = await client.post('/api/users/login', args, {
      // Make sure to include cookies with fetch
      withCredentials: true,
    });

    if (res.status === 200) {
      setUser(res.data.user);
    } else {
      throw new Error('There was a problem while logging in.');
    }
  }, []);

  const logout = useCallback<Logout>(async () => {
    const res = await client.post('/api/users/logout', {}, {
      // Make sure to include cookies with fetch
      withCredentials: true,
    });
    
    if (res.status === 200) {
      setUser(null);
    } else {
      throw new Error('There was a problem while logging out.');
    }
  }, []);

  // On mount, get user and set
  useEffect(() => {
    const fetchMe = async () => {
      const result = await client.get('/api/users/me', {
        // Make sure to include cookies with fetch
        withCredentials: true,
      })

      if (result.status === 200) {
        setUser(result.data.user);
      }
    };

    fetchMe();
  }, []);

  return (
    <Context.Provider
      value={{
        user,
        setUser,
        login,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
};

type UseAuth<T = User> = () => AuthContext;

export const useAuth: UseAuth = () => useContext(Context);
