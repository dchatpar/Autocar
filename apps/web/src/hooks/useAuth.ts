"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useLocalStorage } from "./useLocalStorage";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type UserRole = "owner" | "manager" | "salesperson" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  dealerId: string;
  dealerName: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupAccountInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface SignupDealerInput {
  dealerName: string;
  dealerType: "franchise" | "independent" | "used-only";
  phone: string;
  city: string;
  state: string;
}

export interface SignupTeamInput {
  invites: Array<{ email: string; role: UserRole }>;
}

export interface SignupInput extends SignupAccountInput, SignupDealerInput {
  invites: SignupTeamInput["invites"];
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface AuthError {
  message: string;
  code?: string;
  retryable?: boolean;
}

/* ------------------------------------------------------------------ */
/* Storage keys                                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEYS = {
  user: "dealeros.auth.user",
  token: "dealeros.auth.token",
} as const;

/* ------------------------------------------------------------------ */
/* Simulated API — replace with real fetch calls when backend lands.  */
/* Stays deterministic enough to drive forms through full lifecycle.  */
/* ------------------------------------------------------------------ */

const FAKE_LATENCY_MS = 600;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFakeUser(email: string, name: string, role: UserRole = "owner"): User {
  return {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email,
    name,
    role,
    dealerId: "dler_demo",
    dealerName: "Demo Motors",
    avatarUrl: undefined,
    createdAt: new Date().toISOString(),
  };
}

async function fakeLogin(input: LoginInput): Promise<{ user: User; token: string }> {
  await wait(FAKE_LATENCY_MS);
  if (!input.email.includes("@") || input.password.length < 6) {
    const err: AuthError = {
      message: "Invalid email or password.",
      code: "INVALID_CREDENTIALS",
      retryable: false,
    };
    throw err;
  }
  const user = makeFakeUser(input.email, input.email.split("@")[0] ?? "User");
  return { user, token: `tok_${user.id}` };
}

async function fakeSignup(input: SignupInput): Promise<{ user: User; token: string }> {
  await wait(FAKE_LATENCY_MS);
  const user = makeFakeUser(
    input.email,
    `${input.firstName} ${input.lastName}`.trim(),
    "owner"
  );
  user.dealerName = input.dealerName;
  return { user, token: `tok_${user.id}` };
}

async function fakeForgotPassword(_input: ForgotPasswordInput): Promise<{ ok: true }> {
  await wait(FAKE_LATENCY_MS);
  return { ok: true };
}

async function fakeResetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
  await wait(FAKE_LATENCY_MS);
  if (!input.token) {
    const err: AuthError = { message: "Reset link is invalid or has expired.", code: "BAD_TOKEN" };
    throw err;
  }
  return { ok: true };
}

async function fakeMe(token: string | null): Promise<User> {
  await wait(200);
  if (!token) throw new Error("Not authenticated");
  // The token is opaque here; in a real app this would validate the JWT.
  return makeFakeUser("demo@dealeros.app", "Demo User", "owner");
}

/* ------------------------------------------------------------------ */
/* Public hook                                                        */
/* ------------------------------------------------------------------ */

export interface UseAuth {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;

  login: UseMutationResult<{ user: User; token: string }, AuthError, LoginInput>;
  signup: UseMutationResult<{ user: User; token: string }, AuthError, SignupInput>;
  forgotPassword: UseMutationResult<{ ok: true }, AuthError, ForgotPasswordInput>;
  resetPassword: UseMutationResult<{ ok: true }, AuthError, ResetPasswordInput>;
  logout: () => void;
  clearError: () => void;
}

const AUTH_QUERY_KEY = ["auth", "me"] as const;

export function useAuth(): UseAuth {
  const queryClient = useQueryClient();
  const [storedUser, setStoredUser, removeUser] = useLocalStorage<User | null>(
    STORAGE_KEYS.user,
    null
  );
  const [storedToken, setStoredToken, removeToken] = useLocalStorage<string | null>(
    STORAGE_KEYS.token,
    null
  );

  // Validate / refresh the cached user on mount.
  const meQuery = useQuery<User, Error>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => fakeMe(storedToken),
    enabled: Boolean(storedToken),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // When the query fails, nuke the cached session.
  useEffect(() => {
    if (meQuery.isError && storedToken) {
      removeUser();
      removeToken();
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
    }
  }, [meQuery.isError, storedToken, removeUser, removeToken, queryClient]);

  // Successful me() supersedes whatever was in localStorage (e.g. avatar refresh).
  useEffect(() => {
    if (meQuery.data) setStoredUser(meQuery.data);
  }, [meQuery.data, setStoredUser]);

  const persistSession = useCallback(
    (user: User, token: string) => {
      setStoredUser(user);
      setStoredToken(token);
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
    [queryClient, setStoredToken, setStoredUser]
  );

  const login = useMutation<{ user: User; token: string }, AuthError, LoginInput>({
    mutationFn: (input) => fakeLogin(input),
    onSuccess: (data) => persistSession(data.user, data.token),
  });

  const signup = useMutation<{ user: User; token: string }, AuthError, SignupInput>({
    mutationFn: (input) => fakeSignup(input),
    onSuccess: (data) => persistSession(data.user, data.token),
  });

  const forgotPassword = useMutation<{ ok: true }, AuthError, ForgotPasswordInput>({
    mutationFn: (input) => fakeForgotPassword(input),
  });

  const resetPassword = useMutation<{ ok: true }, AuthError, ResetPasswordInput>({
    mutationFn: (input) => fakeResetPassword(input),
  });

  const logout = useCallback(() => {
    removeUser();
    removeToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
    queryClient.clear();
  }, [queryClient, removeToken, removeUser]);

  const clearError = useCallback(() => {
    login.reset();
    signup.reset();
    forgotPassword.reset();
    resetPassword.reset();
  }, [forgotPassword, login, resetPassword, signup]);

  const isLoading = useMemo(
    () =>
      meQuery.isLoading ||
      login.isPending ||
      signup.isPending ||
      forgotPassword.isPending ||
      resetPassword.isPending,
    [
      forgotPassword.isPending,
      login.isPending,
      meQuery.isLoading,
      resetPassword.isPending,
      signup.isPending,
    ]
  );

  // The freshest user we have: query server, then cache, then null.
  const user: User | null = meQuery.data ?? storedUser;

  const error: AuthError | null =
    (login.error as AuthError | null) ??
    (signup.error as AuthError | null) ??
    (forgotPassword.error as AuthError | null) ??
    (resetPassword.error as AuthError | null) ??
    null;

  return {
    user,
    isAuthenticated: Boolean(user && storedToken),
    isLoading,
    error,
    login,
    signup,
    forgotPassword,
    resetPassword,
    logout,
    clearError,
  };
}
