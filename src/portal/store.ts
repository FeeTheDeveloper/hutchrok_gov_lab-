// Portal persistence — a JSON user store on disk plus in-memory sessions.
// Zero-infrastructure by design, matching the Phase 1 ethos: no database.
// Data lives in .govready/ (gitignored).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface User {
  username: string;
  /** scrypt hash, hex */
  passwordHash: string;
  /** hex salt */
  salt: string;
  /** base32 TOTP secret — set during 2FA enrollment */
  totpSecret?: string;
  /** true once the user has confirmed a code against totpSecret */
  totpEnabled: boolean;
  createdAt: string;
}

interface Db {
  users: User[];
}

export type SessionStage = 'password' | 'full';

export interface Session {
  token: string;
  username: string;
  /** 'password' = passed factor 1 only; 'full' = passed TOTP too */
  stage: SessionStage;
  expiresAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // full session: 12h
const PREAUTH_TTL_MS = 5 * 60 * 1000; // between password and TOTP: 5min

export class Store {
  private dbPath: string;
  private db: Db;
  private sessions = new Map<string, Session>();
  private attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.dbPath = join(dataDir, 'portal-users.json');
    this.db = existsSync(this.dbPath)
      ? (JSON.parse(readFileSync(this.dbPath, 'utf8')) as Db)
      : { users: [] };
  }

  private persist(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  hasUsers(): boolean {
    return this.db.users.length > 0;
  }

  getUser(username: string): User | undefined {
    return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  createUser(username: string, password: string): User {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(password, salt, 64).toString('hex');
    const user: User = {
      username,
      passwordHash,
      salt,
      totpEnabled: false,
      createdAt: new Date().toISOString(),
    };
    this.db.users.push(user);
    this.persist();
    return user;
  }

  verifyPassword(username: string, password: string): boolean {
    const user = this.getUser(username);
    // Hash against a dummy salt even when the user doesn't exist so response
    // timing doesn't reveal which usernames are valid.
    const salt = user?.salt ?? 'deadbeefdeadbeefdeadbeefdeadbeef';
    const candidate = scryptSync(password, salt, 64);
    const expected = user ? Buffer.from(user.passwordHash, 'hex') : randomBytes(64);
    return timingSafeEqual(candidate, expected) && !!user;
  }

  setTotpSecret(username: string, secret: string): void {
    const user = this.getUser(username);
    if (!user) return;
    user.totpSecret = secret;
    user.totpEnabled = false;
    this.persist();
  }

  enableTotp(username: string): void {
    const user = this.getUser(username);
    if (!user) return;
    user.totpEnabled = true;
    this.persist();
  }

  // ---- sessions ----

  createSession(username: string, stage: SessionStage): Session {
    const token = randomBytes(32).toString('hex');
    const ttl = stage === 'full' ? SESSION_TTL_MS : PREAUTH_TTL_MS;
    const session: Session = { token, username, stage, expiresAt: Date.now() + ttl };
    this.sessions.set(token, session);
    return session;
  }

  getSession(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const s = this.sessions.get(token);
    if (!s) return undefined;
    if (Date.now() > s.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return s;
  }

  /** Elevate a password-stage session to a full session after TOTP passes. */
  elevate(token: string): Session | undefined {
    const s = this.sessions.get(token);
    if (!s) return undefined;
    this.sessions.delete(token);
    return this.createSession(s.username, 'full');
  }

  destroySession(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  // ---- brute-force throttle: 5 tries per key per 15 minutes ----

  throttled(key: string): boolean {
    const a = this.attempts.get(key);
    if (!a) return false;
    if (Date.now() > a.resetAt) {
      this.attempts.delete(key);
      return false;
    }
    return a.count >= 5;
  }

  recordFailure(key: string): void {
    const a = this.attempts.get(key);
    if (a && Date.now() <= a.resetAt) a.count += 1;
    else this.attempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  }

  clearFailures(key: string): void {
    this.attempts.delete(key);
  }
}
