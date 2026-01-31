import { Resend } from "resend";
import { env } from "./env.server";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  const link = baseUrl + "/verify?email=" + encodeURIComponent(email);
  return resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your Seamless Tiles verification code",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 12px">Verify your email</h2>
        <p>Your code is:</p>
        <div style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</div>
        <p style="margin-top:12px">This code expires in 10 minutes.</p>
        <p><a href="${link}">Verify on Seamless Tiles</a></p>
      </div>
    `,
  });
}
