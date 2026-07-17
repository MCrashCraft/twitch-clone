"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendSupportMessage } from "@/actions/support";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

export default function SupportPage() {
  const [state, formAction] = useFormState(sendSupportMessage, undefined);

  return (
    <div className="mx-auto mt-6 max-w-lg">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-bold">Contact support</h1>
        <p className="mb-6 text-sm text-bud-muted">
          Questions, bug reports, takedown requests — drop us a line and
          we&apos;ll get back to you by email.
        </p>

        {state?.sent ? (
          <div className="rounded-lg border border-bud-primary/40 bg-bud-primary/10 p-4 text-sm">
            <p className="font-semibold text-bud-primary">Message sent 🌿</p>
            <p className="mt-1 text-zinc-300">
              Thanks for reaching out — we&apos;ll reply to your email soon.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Your email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="subject" className="mb-1 block text-sm font-medium">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                maxLength={150}
                placeholder="What's going on?"
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="message" className="mb-1 block text-sm font-medium">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={6}
                maxLength={5000}
                placeholder="Tell us the details…"
                className="input resize-y"
                required
              />
            </div>
            {state?.error && (
              <p className="text-sm text-red-400" role="alert">
                {state.error}
              </p>
            )}
            <SubmitButton />
          </form>
        )}
      </div>
    </div>
  );
}
