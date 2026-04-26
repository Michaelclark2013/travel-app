"use client";

// NOTE: This is a demo-grade auth that stores users in localStorage so the UX
// flow can be exercised end-to-end without a backend. It is not secure — swap
// for a real provider (NextAuth, Clerk, Supabase, etc.) before any production
// use.

const USERS_KEY = "voyage:users";
const SESSION_KEY = "voyage:session";

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

type StoredUser = User & { passwordHash: string };

async function hash(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loadUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function setSession(user: User | null) {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export async function signUp(
  email: string,
  password: string,
  name: string
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  if (!cleanEmail || !password || !cleanName) {
    return { ok: false, error: "All fields are required." };
  }
  if (!cleanEmail.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  const users = loadUsers();
  if (users.some((u) => u.email === cleanEmail)) {
    return { ok: false, error: "An account with that email already exists." };
  }
  const passwordHash = await hash(password);
  const user: StoredUser = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: cleanEmail,
    name: cleanName,
    createdAt: new Date().toISOString(),
    passwordHash,
  };
  users.push(user);
  saveUsers(users);
  const publicUser: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
  setSession(publicUser);
  return { ok: true, user: publicUser };
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { ok: false, error: "Email and password required." };
  }
  const users = loadUsers();
  const stored = users.find((u) => u.email === cleanEmail);
  if (!stored) return { ok: false, error: "Invalid email or password." };
  const passwordHash = await hash(password);
  if (passwordHash !== stored.passwordHash) {
    return { ok: false, error: "Invalid email or password." };
  }
  const publicUser: User = {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    createdAt: stored.createdAt,
  };
  setSession(publicUser);
  return { ok: true, user: publicUser };
}

export function signOut() {
  setSession(null);
}
