import axios, { AxiosError } from "axios";
import { GetServerSidePropsContext } from "next";
import { parseCookies, setCookie } from "nookies";
import {
  AUTH_REFRESH_TOKEN,
  AUTH_TOKEN,
  EXPIRE_ERROR_RESPONSE,
} from "../constants";
import { signOut } from "../contexts/AuthContext";
import { AuthTokenError } from "../errors/AuthTokenError";

let isRefreshing = false;
let failedRequestsQueue = [];

type Context = undefined | GetServerSidePropsContext;

export function setupAPIClient(ctx: Context = undefined) {
  let cookies = parseCookies(ctx);

  const api = axios.create({
    baseURL: "http://localhost:3333",
    headers: {
      Authorization: `Bearer ${cookies[AUTH_TOKEN]}`,
    },
  });

  api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response.status === 401) {
        const response = error.response.data as any;

        if (response?.code === EXPIRE_ERROR_RESPONSE) {
          // renew token
          cookies = parseCookies(ctx);

          const { [AUTH_REFRESH_TOKEN]: refreshToken } = cookies;
          const originalConfig = error.config;

          if (!isRefreshing) {
            isRefreshing = true;

            api
              .post("/refresh", {
                refreshToken,
              })
              .then((response) => {
                const { token, refreshToken: newRefreshToken } = response.data;

                setCookie(ctx, AUTH_TOKEN, token, {
                  maxAge: 60 * 60 * 24 * 30, // 30 DIAS
                  path: "/",
                });

                setCookie(ctx, AUTH_REFRESH_TOKEN, newRefreshToken, {
                  maxAge: 60 * 60 * 24 * 30, // 30 DIAS
                  path: "/",
                });

                failedRequestsQueue.forEach((request) =>
                  request.onSuccess(token)
                );
              })
              .catch((err) => {
                failedRequestsQueue.forEach((request) =>
                  request.onFailure(err)
                );

                if (process.browser) {
                  signOut();
                } else {
                  return Promise.reject(new AuthTokenError());
                }
              })
              .finally(() => {
                isRefreshing = false;
                failedRequestsQueue = [];
              });
          }

          return new Promise((resolve, reject) => {
            failedRequestsQueue.push({
              onSuccess: (token: string) => {
                originalConfig.headers["Authorization"] = `Bearer ${token}`;

                resolve(api(originalConfig));
              },
              onFailure: (err: AxiosError) => {
                reject(err);
              },
            });
          });
        } else {
          if (process.browser) {
            signOut();
          } else {
            return Promise.reject(new AuthTokenError());
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return api;
}

export const api = setupAPIClient();
