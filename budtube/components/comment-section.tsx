"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addComment } from "@/actions/comments";
import { timeAgo } from "@/lib/format";

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  username: string;
};

export function CommentSection({
  videoId,
  comments,
  signedIn,
}: {
  videoId: string;
  comments: CommentItem[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addComment(videoId, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6">
      <h2 className="mb-4 text-lg font-semibold">
        {comments.length} comment{comments.length === 1 ? "" : "s"}
      </h2>

      {signedIn ? (
        <form ref={formRef} action={handleSubmit} className="mb-6">
          <textarea
            name="content"
            rows={2}
            maxLength={1000}
            placeholder="Drop a comment…"
            className="input resize-y"
            required
          />
          {error && (
            <p className="mt-1 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? "Posting…" : "Comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-6 text-sm text-bud-muted">
          <Link
            href={`/sign-in?next=/watch/${videoId}`}
            className="text-bud-primary hover:underline"
          >
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      <ul className="space-y-4">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bud-raised text-sm font-bold text-bud-primary">
              {comment.username[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm">
                <Link
                  href={`/channel/${comment.username}`}
                  className="font-semibold hover:text-bud-primary"
                >
                  @{comment.username}
                </Link>{" "}
                <span className="text-xs text-bud-muted">
                  {timeAgo(new Date(comment.createdAt))}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">
                {comment.content}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
