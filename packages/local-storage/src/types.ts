/** Lightweight listing shape — deliberately doesn't require validating the full project document. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
