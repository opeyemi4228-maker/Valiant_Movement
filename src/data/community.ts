/* ============================================================
   Valiant Movement — Community (Feed + Communities) mock data
   Demoable without the DB, shaped to swap for posts / communities
   / profiles queries later. Mirrors the approach in mock-members.ts.
   ============================================================ */

export interface Person {
  id: string;
  name: string;
  handle: string;
  /** A tailwind-ish hex used for the initials avatar background. */
  color: string;
  role?: string;
  location?: string;
  verified?: boolean;
  /** Optional photo (we reuse event highlights as stand-in portraits). */
  photo?: string;
}

export type CommunityScope =
  | "National"
  | "State"
  | "LGA"
  | "Ward"
  | "Polling Unit"
  | "Interest";

export interface Community {
  id: string;
  name: string;
  scope: CommunityScope;
  location: string;
  members: number;
  online: number;
  cover: string;
  description: string;
  category: string;
  joined: boolean;
  unreadPosts?: number;
}

export interface Post {
  id: string;
  author: Person;
  time: string;
  text: string;
  image?: string;
  community?: string;
  likes: number;
  comments: number;
  reposts: number;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  /** Marks a post that just arrived in real time (entrance animation). */
  fresh?: boolean;
  /** A celebratory movement milestone — rendered with a distinct ribbon. */
  milestone?: boolean;
}

export interface Trend {
  scope: string;
  tag: string;
  posts: string;
}

/* --------------------------------- People -------------------------------- */

export const people: Person[] = [
  { id: "p1", name: "Adaeze Okonkwo", handle: "adaeze_leads", color: "#e07400", role: "Ward Coordinator", location: "Enugu", verified: true, photo: "/highlights/01-voice.jpg" },
  { id: "p2", name: "Ibrahim Suleiman", handle: "ib_suleiman", color: "#1faa59", role: "State Lead", location: "Kano", verified: true, photo: "/highlights/05-lead.jpg" },
  { id: "p3", name: "Chiamaka Eze", handle: "chiamaka_e", color: "#7c3aed", role: "Volunteer", location: "Anambra" },
  { id: "p4", name: "Tunde Bakare", handle: "tunde_b", color: "#0ea5e9", role: "LGA Organizer", location: "Lagos", verified: true, photo: "/highlights/03-recognition.jpg" },
  { id: "p5", name: "Fatima Abubakar", handle: "fatima_ab", color: "#e23d4e", role: "Member", location: "Kaduna" },
  { id: "p6", name: "Emeka Nwosu", handle: "emeka_nwosu", color: "#f5a524", role: "Polling Unit Agent", location: "Imo" },
  { id: "p7", name: "Aisha Mohammed", handle: "aisha_m", color: "#0d9488", role: "Youth Lead", location: "Abuja", verified: true },
  { id: "p8", name: "Segun Adeyemi", handle: "segun_a", color: "#db2777", role: "Member", location: "Oyo" },
];

const byId = (id: string) => people.find((p) => p.id === id)!;

/* --------------------------------- Posts --------------------------------- */

export const posts: Post[] = [
  {
    id: "post-1",
    author: byId("p2"),
    time: "12m",
    community: "Kano State Chapter",
    text: "Just wrapped our ward mobilization drive in Nassarawa LGA. 340 new verified members in a single weekend. This is what courage to lead looks like. 🦅 #ValiantMovement",
    image: "/highlights/02-movement.jpg",
    likes: 1284,
    comments: 96,
    reposts: 212,
    liked: true,
    milestone: true,
  },
  {
    id: "post-2",
    author: byId("p1"),
    time: "48m",
    community: "Enugu · Ward 4",
    text: "Reminder: our leadership town hall is this Saturday, 10am at the community center. Bring a friend, bring your NIN, bring your ideas. We are building something real.",
    likes: 542,
    comments: 38,
    reposts: 61,
  },
  {
    id: "post-3",
    author: byId("p7"),
    time: "2h",
    community: "Youth Vanguard",
    text: "The youth aren't the leaders of tomorrow — we are the leaders of today. Proud of every single one of you who showed up to serve this week. 💪",
    image: "/highlights/06-serve.jpg",
    likes: 2103,
    comments: 187,
    reposts: 488,
    bookmarked: true,
    milestone: true,
  },
  {
    id: "post-4",
    author: byId("p4"),
    time: "4h",
    community: "Lagos State Chapter",
    text: "Verification matters. When every member is a real, accountable person, trust becomes our default — not the exception. That's the whole point of the movement.",
    likes: 876,
    comments: 54,
    reposts: 133,
  },
  {
    id: "post-5",
    author: byId("p6"),
    time: "6h",
    community: "Imo · Polling Unit 012",
    text: "Door to door today across three streets. Every conversation counts. People are hungry for leadership that actually listens.",
    image: "/highlights/04-gather.jpg",
    likes: 412,
    comments: 22,
    reposts: 39,
  },
];

/* ------------------------------ Communities ------------------------------ */

export const communities: Community[] = [
  {
    id: "c1",
    name: "Lagos State Chapter",
    scope: "State",
    location: "Lagos",
    members: 48210,
    online: 1820,
    cover: "/highlights/02-movement.jpg",
    description: "The largest chapter in the federation. Coordinating all 20 LGAs across Lagos.",
    category: "Chapter",
    joined: true,
    unreadPosts: 12,
  },
  {
    id: "c2",
    name: "Youth Vanguard",
    scope: "Interest",
    location: "National",
    members: 31544,
    online: 2410,
    cover: "/highlights/06-serve.jpg",
    description: "For members under 35 driving the future of the movement.",
    category: "Interest",
    joined: true,
    unreadPosts: 5,
  },
  {
    id: "c3",
    name: "Kano State Chapter",
    scope: "State",
    location: "Kano",
    members: 39102,
    online: 1290,
    cover: "/highlights/05-lead.jpg",
    description: "Northern stronghold. Ward-by-ward mobilization and civic education.",
    category: "Chapter",
    joined: true,
  },
  {
    id: "c4",
    name: "Enugu · Ward 4",
    scope: "Ward",
    location: "Enugu",
    members: 2840,
    online: 142,
    cover: "/highlights/01-voice.jpg",
    description: "Grassroots organizing for Ward 4. Town halls, check-ins and local action.",
    category: "Ward",
    joined: false,
  },
  {
    id: "c5",
    name: "Women in Leadership",
    scope: "Interest",
    location: "National",
    members: 18760,
    online: 940,
    cover: "/highlights/03-recognition.jpg",
    description: "Amplifying women's voices and leadership across every level of the movement.",
    category: "Interest",
    joined: false,
  },
  {
    id: "c6",
    name: "Abuja FCT Chapter",
    scope: "State",
    location: "FCT Abuja",
    members: 27330,
    online: 1105,
    cover: "/highlights/04-gather.jpg",
    description: "The capital chapter. Policy, advocacy and national coordination.",
    category: "Chapter",
    joined: false,
  },
];

/* ------------------------------- Discovery ------------------------------- */

export const trends: Trend[] = [
  { scope: "Trending in Nigeria", tag: "#CourageToLead", posts: "24.1K posts" },
  { scope: "Politics · Trending", tag: "#ValiantMovement", posts: "18.6K posts" },
  { scope: "Lagos · Trending", tag: "#WardMobilization", posts: "9,204 posts" },
  { scope: "Trending", tag: "#NINVerified", posts: "6,880 posts" },
  { scope: "Youth · Trending", tag: "#LeadersOfToday", posts: "4,512 posts" },
];

export const suggestedPeople: Person[] = [byId("p3"), byId("p5"), byId("p8")];
