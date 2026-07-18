"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  updateProfile,
  changePassword,
  type SettingsState,
} from "@/actions/settings";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function StateMessage({ state }: { state: SettingsState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {state.error}
      </p>
    );
  }
  return <p className="text-sm text-bud-primary">{state.success}</p>;
}

export function ProfileForm({
  initialEmail,
  initialBio,
}: {
  initialEmail: string;
  initialBio: string;
}) {
  const [state, formAction] = useFormState(updateProfile, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={initialEmail}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="bio" className="mb-1 block text-sm font-medium">
          Channel bio <span className="text-bud-muted">(max 300 chars)</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={300}
          defaultValue={initialBio}
          placeholder="Tell people what your channel is about…"
          className="input resize-y"
        />
      </div>
      <StateMessage state={state} />
      <SubmitButton label="Save profile" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useFormState(changePassword, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="currentPassword"
          className="mb-1 block text-sm font-medium"
        >
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">
          New password (8+ characters)
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className="input"
          required
        />
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="input"
          required
        />
      </div>
      <StateMessage state={state} />
      <SubmitButton label="Change password" />
    </form>
  );
}
