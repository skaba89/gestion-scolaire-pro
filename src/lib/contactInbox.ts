/** Messages reçus par les formulaires de contact publics (boîte « Messages reçus »). */
export interface SubmissionReply {
  id: string;
  author_name: string | null;
  body: string;
  status: "SENT" | "FAILED";
  created_at: string;
}

export interface Submission {
  id: string;
  page_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  replies?: SubmissionReply[];
}

/** Un message est « répondu » dès qu'une réponse a bien été envoyée (un échec ne compte pas). */
export function isAnswered(submission: Submission): boolean {
  return (submission.replies ?? []).some((reply) => reply.status === "SENT");
}
