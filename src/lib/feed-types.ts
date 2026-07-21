/** Shared feed DTO shapes — usable from both server (store/actions) and client. */

export interface FeedComment {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorPhoto?: string;
  text: string;
  at: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorPhoto?: string;
  text: string;
  image?: string;
  community?: string;
  at: string;
  likes: number;
  liked: boolean;
  reposts: number;
  reposted: boolean;
  bookmarked: boolean;
  comments: FeedComment[];
}
