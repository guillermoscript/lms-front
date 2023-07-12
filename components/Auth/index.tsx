import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { User } from '../../payload-types';
import payloadClient from '../../utils/axiosPayloadInstance';
import { useRouter } from 'next/router';
import { getCookies,getCookie, setCookie, deleteCookie } from 'cookies-next';
import Cookies from 'js-cookie';

type Login = (args: { email: string; password: string }) => Promise<void>;

type Logout = () => Promise<void>;

type AuthContext = {
  user?: User | null;
  setUser: (user: User | null) => void;
  logout: Logout;
  login: Login;
};

export type LoginResponse = {
  message: string
  user: User
  token: string
  exp: number
}

export type RefreshTokenResponse = {
  message: string
  refreshedToken: string
  exp: number
  user: UserRefresh
}

export type UserRefresh = {
  email: string
  id: string
  collection: string
  roles: string[]
}


const Context = createContext({} as AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>();
  const router = useRouter();

  const login = useCallback<Login>(async (args) => {
    try {
      const res = await payloadClient.post<LoginResponse>('/api/users/login', args, {
        // Make sure to include cookies with fetch
        withCredentials: true,
      });

      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
    } catch (error) {
      console.log(error)
      throw new Error('There was a problem while logging in.');
    }
  }, []);

  const logout = useCallback<Logout>(async () => {
    try {
      const res = await payloadClient.post('/api/users/logout', {}, {
        // Make sure to include cookies with fetch
        withCredentials: true,
      });  
      setUser(null);
      // Cookies.remove('token');
    } catch (error) {
      console.log(error)
      throw new Error('There was a problem while logging out.');
    }
  }, []);

  // const refresh = async () => {
  //   try {
  //     const res = await payloadClient.post<RefreshTokenResponse>('/api/users/refresh-token', {},{
  //       // Make sure to include cookies with fetch
  //       withCredentials: true,
  //     });
  //     setUser(prev => {
  //       if (prev) {
  //         return {
  //           ...prev,
  //           token: res.data.refreshedToken,
  //         }
  //       }
  //       return null;
  //     });
  //     localStorage.setItem('token', res.data.refreshedToken);
  //   } catch (error) {
  //     // throw new Error('There was a problem while refreshing the token.'); 
  //     console.log(error)
  //     setUser(null);
  //   }
  // }

  // On mount, get user and set
  useEffect(() => {
    const fetchMe = async () => {
      // console.log(getCookie('token'))
      try {
        const result = await payloadClient.get<LoginResponse>('/api/users/me', {
          // Make sure to include cookies with fetch
          withCredentials: true,
        })
        setUser(result.data.user);
      } catch (error) {
        console.log(error)
        // throw new Error('There was a problem while refreshing the token.');  
        setUser(null);
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


