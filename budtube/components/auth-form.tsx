"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AuthFormState } from "@/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "One sec…" : label}
    </button>
  );
}

type Field = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  autoComplete?: string;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  next,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  next: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {fields.map((field) => (
        <div key={field.name}>
          <label
            htmlFor={field.name}
            className="mb-1 block text-sm font-medium text-zinc-300"
          >
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            className="input"
            required
          />
        </div>
      ))}
      {state?.error && (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
