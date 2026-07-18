"use client";

import { useFormState, useFormStatus } from "react-dom";
import { confirmAge } from "@/actions/age-gate";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Checking…" : "Verify my age"}
    </button>
  );
}

export function AgeGateForm({ next }: { next: string }) {
  const [state, formAction] = useFormState(confirmAge, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-3 text-left">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="dob" className="mb-1 block text-sm font-medium">
          Date of birth
        </label>
        <input id="dob" name="dob" type="date" className="input" required />
      </div>
      {state?.error && (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
