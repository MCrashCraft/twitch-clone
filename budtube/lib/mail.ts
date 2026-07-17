import nodemailer from "nodemailer";

export function isMailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

export function supportAddress() {
  return process.env.SUPPORT_EMAIL ?? process.env.SMTP_USER ?? "";
}

export async function sendSupportEmail({
  fromEmail,
  subject,
  message,
}: {
  fromEmail: string;
  subject: string;
  message: string;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"BudTube Support" <${process.env.SMTP_USER}>`,
    to: supportAddress(),
    replyTo: fromEmail,
    subject: `[BudTube support] ${subject}`,
    text: `From: ${fromEmail}\n\n${message}`,
  });
}
