/** Shared notification shapes — safe to import from client or server. */

export type NotifType =
  | "like"
  | "comment"
  | "repost"
  | "follow"
  | "mention"
  | "call"
  | "system"
  | "verified"
  | "message" // unread direct message
  | "post" // a member shared a new post
  | "finance" // deposit / withdrawal confirmations
  | "dues"; // monthly dues countdown, deduction, insufficient funds

export interface NotificationDTO {
  id: string;
  type: NotifType;
  actorName: string | null;
  body: string;
  href: string | null;
  read: boolean;
  at: string; // ISO
}

export interface NotifInput {
  type: NotifType;
  actorId?: string;
  actorName?: string | null;
  body: string;
  href?: string | null;
}
