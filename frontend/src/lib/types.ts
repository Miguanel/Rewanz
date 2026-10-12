/** Typy odpowiedzi API – odpowiadają schematom Pydantic w backendzie.
 *  Przy rozbudowie można je generować z /openapi.json (np. openapi-typescript). */

export interface UserBrief {
  id: number;
  username: string;
  display_name: string;
  reputation: number;
}

export interface UserPublic extends UserBrief {
  bio: string;
  location: string;
  website: string;
  skills: string;
  created_at: string;
}

export interface UserPrivate extends UserPublic {
  email: string;
}

export interface Tag {
  id: number;
  name: string;
  usage_count: number;
}

export interface CategoryBrief {
  id: number;
  slug: string;
  name: string;
}

export type ProblemStatus = "open" | "solved" | "closed";

export interface ProblemListItem {
  id: number;
  title: string;
  excerpt: string;
  status: ProblemStatus;
  score: number;
  answer_count: number;
  view_count: number;
  created_at: string;
  last_activity_at: string;
  author: UserBrief;
  category: CategoryBrief | null;
  tags: Tag[];
  lat: number | null;
  lng: number | null;
  location_label: string;
}

export interface ProblemDetail extends ProblemListItem {
  body: string;
  upvotes: number;
  downvotes: number;
  accepted_answer_id: number | null;
  my_vote: number;
}

export interface Facets {
  tags: { name: string; count: number }[];
  status: Record<string, number>;
  categories: { slug: string; name: string; count: number }[];
}

export interface SearchResult {
  items: ProblemListItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  sort: string;
  facets?: Facets | null;
}

export interface AnswerNode {
  id: number;
  problem_id: number;
  parent_id: number | null;
  body: string;
  score: number;
  upvotes: number;
  downvotes: number;
  depth: number;
  reply_count: number;
  is_accepted: boolean;
  created_at: string;
  author: UserBrief;
  my_vote: number;
  descendant_count: number;
  collapsed: boolean;
  has_more: boolean;
  children: AnswerNode[];
  /** tylko po stronie klienta: wpis z kolejki offline */
  pending?: boolean;
}

export interface Thread {
  problem_id: number;
  root_id: number | null;
  sort: string;
  total: number;
  items: AnswerNode[];
}

export interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  description: string;
  parent_id: number | null;
  direct_count: number;
  total_count: number;
  children: CategoryNode[];
}

export interface CategorySummary {
  category: { id: number; slug: string; name: string; description: string };
  headline: string;
  stats: { total: number; open: number; solved: number; unanswered: number; answers: number; solved_ratio: number };
  top_tags: { name: string; count: number }[];
  top_problems: { id: number; title: string; score: number; answer_count: number; status: ProblemStatus }[];
  recent_problems: { id: number; title: string; score: number; answer_count: number; status: ProblemStatus }[];
  subcategories: { slug: string; name: string; total: number }[];
}

export interface Marker {
  id: number;
  title: string;
  lat: number;
  lng: number;
  status: ProblemStatus;
  score: number;
  answer_count: number;
  location_label: string;
}

export interface PortfolioItem {
  id: number;
  title: string;
  description: string;
  url: string;
  tags: string;
  position: number;
}

export interface Portfolio {
  user: UserPublic;
  stats: { problems: number; answers: number; accepted_answers: number; total_answer_score: number };
  top_tags: { name: string; count: number }[];
  portfolio: PortfolioItem[];
  recent_problems: ProblemListItem[];
  top_answers: { id: number; problem_id: number; problem_title: string; score: number; is_accepted: boolean; excerpt: string }[];
}

export interface VoteResult {
  target_type: "problem" | "answer";
  target_id: number;
  score: number;
  upvotes: number;
  downvotes: number;
  my_vote: number;
}
