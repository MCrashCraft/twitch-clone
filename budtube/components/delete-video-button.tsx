"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVideo } from "@/actions/videos";

export function DeleteVideoButton({
  videoId,
  redirectTo,
}: {
  videoId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Delete this video? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteVideo(videoId);
      if (result?.error) {
        window.alert(result.error);
      } else if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-900/40 disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
