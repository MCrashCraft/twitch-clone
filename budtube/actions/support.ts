"use server";

import { isMailConfigured, sendSupportEmail } from "@/lib/mail";

export type SupportFormState = { error?: string; sent?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendSupportMessage(
  _prevState: SupportFormState | undefined,
  formData: FormData
): Promise<SupportFormState> {
  const fromEmail = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!EMAIL_RE.test(fromEmail)) return { error: "Enter a valid email so we can reply." };
  if (subject.length < 1 || subject.length > 150) {
    return { error: "Subject must be 1-150 characters." };
  }
  if (message.length < 10 || message.length > 5000) {
    return { error: "Message must be 10-5000 characters." };
  }

  if (!isMailConfigured()) {
    return {
      error:
        "Support email isn't configured on this server yet (SMTP settings missing).",
    };
  }

  try {
    await sendSupportEmail({ fromEmail, subject, message });
    return { sent: true };
  } catch (error) {
    console.error("Support email failed:", error);
    return { error: "Couldn't send your message right now. Try again later." };
  }
}
