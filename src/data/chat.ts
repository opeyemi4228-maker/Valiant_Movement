/* ============================================================
   Valiant Movement — Chat (WhatsApp-style) mock data
   1:1 and group conversations. Shaped to swap for the
   conversations / conversation_members / messages tables.
   ============================================================ */

import { people, type Person } from "./community";

export type MessageStatus = "sent" | "delivered" | "read";

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  text: string;
  time: string;
  status?: MessageStatus;
  /** Image attachment (object URL or remote src). */
  image?: string;
  /** Voice note (object URL) + its length in seconds. */
  audioUrl?: string;
  audioDuration?: number;
  /** Generic file attachment. */
  file?: { name: string; size: string };
}

export interface Conversation {
  id: string;
  /** For 1:1 chats. */
  person?: Person;
  /** For group chats. */
  groupName?: string;
  groupAvatar?: string;
  isGroup: boolean;
  members?: number;
  lastTime: string;
  unread: number;
  online?: boolean;
  typing?: boolean;
  muted?: boolean;
  messages: ChatMessage[];
}

const byId = (id: string) => people.find((p) => p.id === id)!;

export const conversations: Conversation[] = [
  {
    id: "conv-1",
    person: byId("p1"),
    isGroup: false,
    lastTime: "09:42",
    unread: 2,
    online: true,
    typing: true,
    messages: [
      { id: "m1", fromMe: false, text: "Adaeze, are we still on for the Ward 4 town hall this Saturday?", time: "09:30" },
      { id: "m2", fromMe: true, text: "Yes! 10am sharp at the community center. I've confirmed the venue.", time: "09:33", status: "read" },
      { id: "m3", fromMe: false, text: "Perfect. I'll bring the registration tablets for NIN check-in.", time: "09:40" },
      { id: "m4", fromMe: false, text: "Should we expect the state lead to join?", time: "09:41" },
    ],
  },
  {
    id: "conv-2",
    isGroup: true,
    groupName: "Lagos State Coordinators",
    groupAvatar: "/highlights/02-movement.jpg",
    members: 24,
    lastTime: "08:58",
    unread: 9,
    messages: [
      { id: "m1", fromMe: false, text: "Tunde: Numbers from Ikeja LGA are in — 1,240 verified this week 🎉", time: "08:50" },
      { id: "m2", fromMe: false, text: "Aisha: Incredible work team 👏", time: "08:52" },
      { id: "m3", fromMe: true, text: "Let's push the same playbook to Surulere next.", time: "08:55", status: "delivered" },
      { id: "m4", fromMe: false, text: "Tunde: On it. Sending the mobilization deck now.", time: "08:58" },
    ],
  },
  {
    id: "conv-3",
    person: byId("p2"),
    isGroup: false,
    lastTime: "Yesterday",
    unread: 0,
    online: false,
    messages: [
      { id: "m1", fromMe: false, text: "Great drive in Nassarawa LGA. 340 new members 🦅", time: "Yesterday" },
      { id: "m2", fromMe: true, text: "Saw the post — phenomenal. Courage to lead 🔥", time: "Yesterday", status: "read" },
    ],
  },
  {
    id: "conv-4",
    isGroup: true,
    groupName: "Youth Vanguard 🇳🇬",
    groupAvatar: "/highlights/06-serve.jpg",
    members: 512,
    lastTime: "Yesterday",
    unread: 0,
    muted: true,
    messages: [
      { id: "m1", fromMe: false, text: "Aisha: The youth are the leaders of today 💪", time: "Yesterday" },
      { id: "m2", fromMe: false, text: "Segun: Count me in for the weekend serve 🙌", time: "Yesterday" },
    ],
  },
  {
    id: "conv-5",
    person: byId("p7"),
    isGroup: false,
    lastTime: "Mon",
    unread: 0,
    online: true,
    messages: [
      { id: "m1", fromMe: true, text: "Aisha, loved your message at the gathering.", time: "Mon", status: "read" },
      { id: "m2", fromMe: false, text: "Thank you 🙏 Means a lot coming from you.", time: "Mon" },
    ],
  },
  {
    id: "conv-6",
    person: byId("p4"),
    isGroup: false,
    lastTime: "Mon",
    unread: 0,
    online: false,
    messages: [
      { id: "m1", fromMe: false, text: "Verification is everything. Trust by default.", time: "Mon" },
    ],
  },
];
