"use client";

import { useFormState, useFormStatus } from "react-dom";
import { confirmAge, startIdVerification } from "@/actions/age-gate";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  id_unavailable:
    "ID verification is temporarily unavailable — please verify with your date of birth below.",
  id_failed:
    "ID verification couldn't be completed. Try again, or use the date-of-birth form.",
  id_declined: "Your ID could not be verified. You can try again.",
  id_pending:
    "Your verification is still being reviewed. Try again in a moment.",
  id_underage: "Sorry — you must be 21 or older to enter BudTube.",
};

export function AgeGateForm({
  next,
  diditAvailable,
  urlError,
}: {
  next: string;
  diditAvailable: boolean;
  urlError?: string;
}) {
  const [state, formAction] = useFormState(confirmAge, undefined);
  const errorMessage = state?.error ?? (urlError ? ERROR_MESSAGES[urlError] : undefined);

  return (
    <div className="mt-6 space-y-4 text-left">
      {errorMessage && (
        <p className="text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      )}

      {diditAvailable && (
        <>
          <form action={startIdVerification}>
            <input type="hidden" name="next" value={next} />
            <SubmitButton
              label="🪪 Verify with your ID"
              pendingLabel="Redirecting…"
            />
          </form>
          <div className="flex items-center gap-3 text-xs text-bud-muted">
            <span className="h-px flex-1 bg-bud-border" />
            or enter your date of birth
            <span className="h-px flex-1 bg-bud-border" />
          </div>
        </>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="dob" className="mb-1 block text-sm font-medium">
            Date of birth
          </label>
          <input id="dob" name="dob" type="date" className="input" required />
        </div>
        <SubmitButton label="Verify my age" pendingLabel="Checking…" />
      </form>
    </div>
  );
}
