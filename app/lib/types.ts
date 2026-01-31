export type UserRole = "user" | "creator" | "admin";
export type UserStatus = "pending" | "active" | "disabled";

export interface User {
  _id: string;
  email: string;
  name?: string;
  username?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface EmailVerification {
  _id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export type TileVisibility = "public" | "unlisted" | "private";

export interface TileR2Info {
  masterKey: string;
  previewKey?: string;
  thumbKey?: string;
  sizeBytes?: number;
  etag?: string;
}

export interface TileStats {
  views: number;
  downloads: number;
}

export interface Tile {
  _id: string;
  ownerId: string;
  title: string;
  description?: string;
  tags: string[];
  contentHash?: string;
  width?: number;
  height?: number;
  format?: string;
  seamless: boolean;
  r2: TileR2Info;
  visibility: TileVisibility;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  stats?: TileStats;
}

export type EventType =
  | "view"
  | "download_attempt"
  | "download_success"
  | "search"
  | "upload"
  | "ai_generate"
  | "verify_sent"
  | "verify_success";

export interface Event {
  _id: string;
  type: EventType;
  userId?: string;
  tileId?: string;
  ipHash?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  name?: string;
  username?: string;
}
