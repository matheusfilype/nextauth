import { createContext, ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import Router from "next/router";
import { destroyCookie, parseCookies, setCookie } from "nookies";
import { AUTH_REFRESH_TOKEN, AUTH_TOKEN } from "../constants";

type User = {
  email: string;
  permissions: string[];
  roles: string[];
};

type SignInCredentials = {
  email: string;
  password: string;
};

type AuthContextData = {
  signIn(credentials: SignInCredentials): Promise<void>;
  // signOut: () => void;
  isAuthenticated: boolean;
  user: User;
};

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthContext = createContext({} as AuthContextData);

export function signOut() {
  destroyCookie(undefined, AUTH_TOKEN);
  destroyCookie(undefined, AUTH_REFRESH_TOKEN);

  Router.push("/");
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User>({} as User);
  const isAuthenticated = useMemo(() => !!user, [user]);

  useEffect(() => {
    const { [AUTH_TOKEN]: token } = parseCookies();

    if (token) {
      api
        .get("/me")
        .then((response) => {
          const { email, permissions, roles } = response.data;

          setUser({ email, permissions, roles });
        })
        .catch(() => {
          signOut();
        });
    }
  }, []);

  async function signIn({ email, password }: SignInCredentials) {
    try {
      const response = await api.post("/sessions", {
        email,
        password,
      });

      const { token, refreshToken, permissions, roles } = response.data;

      setUser({
        email,
        permissions,
        roles,
      });

      setCookie(undefined, AUTH_TOKEN, token, {
        maxAge: 60 * 60 * 24 * 30, // 30 DIAS
        path: "/",
      });

      setCookie(undefined, AUTH_REFRESH_TOKEN, refreshToken, {
        maxAge: 60 * 60 * 24 * 30, // 30 DIAS
        path: "/",
      });

      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      Router.push("/dashboard");
    } catch (err) {
      console.log(err);
    }
  }

  return (
    <AuthContext.Provider value={{ signIn, isAuthenticated, user }}>
      {children}
    </AuthContext.Provider>
  );
}
