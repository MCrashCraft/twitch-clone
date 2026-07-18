"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "@/actions/admin";

export function RoleToggleButton({
  userId,
  isAdmin,
}: {
  userId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await setUserRole(userId, !isAdmin);
      if (result?.error) window.alert(result.error);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={isAdmin ? "btn-secondary" : "btn-primary"}
    >
      {isPending ? "Saving…" : isAdmin ? "Remove admin" : "Make admin"}
    </button>
  );
}
