"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleLike } from "@/actions/social";
import { formatCount } from "@/lib/format";

export function LikeButton({
  videoId,
  initialLiked,
  initialCount,
  signedIn,
}: {
  videoId: string;
  initialLiked: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!signedIn) {
      router.push(`/sign-in?next=/watch/${videoId}`);
      return;
    }
    // Optimistic flip; revert if the action fails.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    startTransition(async () => {
      const result = await toggleLike(videoId);
      if (result && "error" in result) {
        setLiked(!nextLiked);
        setCount((c) => c + (nextLiked ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={liked ? "btn-primary" : "btn-secondary"}
      aria-pressed={liked}
    >
      <span aria-hidden>{liked ? "🍃" : "👍"}</span>
      {formatCount(count)}
    </button>
  );
}
