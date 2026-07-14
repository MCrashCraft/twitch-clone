"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toggleSubscribe } from "@/actions/social";

export function SubscribeButton({
  channelId,
  initialSubscribed,
  signedIn,
}: {
  channelId: string;
  initialSubscribed: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !subscribed;
    setSubscribed(next);
    startTransition(async () => {
      const result = await toggleSubscribe(channelId);
      if (result && "error" in result) setSubscribed(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={subscribed ? "btn-secondary" : "btn-primary"}
    >
      {subscribed ? "Subscribed ✓" : "Subscribe"}
    </button>
  );
}
