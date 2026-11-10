import { Resend } from "resend";

// const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const body = await req.json();

    const { full_name, email } = body;

    const data = await resend.emails.send({
      from: "SolarFlow <onboarding@resend.dev>",
      to: [email],
      subject: "Welcome to SolarFlow Waitlist",
      html: `
        <div style="font-family:sans-serif;padding:20px;">
          <h1>Welcome to SolarFlow ⚡</h1>
          <p>Hi ${full_name},</p>
          <p>Thanks for joining the SolarFlow waitlist.</p>
          <p>We’ll notify you once early access launches.</p>
        </div>
      `,
    });

    return Response.json(data);
  } catch (error) {
    return Response.json({ error });
  }
}
