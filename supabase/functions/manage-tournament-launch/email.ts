const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER = "luke.zerona@11697146.brevosend.com";
const DEFAULT_LOGO_URL = "https://zmm-eta.vercel.app/zmm-logo.png";

export type CommunicationConfig = {
  commissioner_email: string;
  commissioner_name: string;
  commissioner_phone: string | null;
  venmo_handle: string;
  app_url: string;
};

export type EmailContent = {
  subject: string;
  textContent: string;
  htmlContent: string;
};

export type FieldSummary = {
  seasonYear: number;
  gameCount: number;
  entryDeadline: Date;
  regions: { region: string; games: number }[];
  finalFourPairings: string[];
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value: string, length = 2_000): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(deadline);
}

function venmoUrl(handle: string): string {
  return `https://venmo.com/u/${encodeURIComponent(handle.replace(/^@/, ""))}`;
}

function emailShell(input: {
  eyebrow: string;
  heading: string;
  preview: string;
  body: string;
  appUrl: string;
  actionLabel: string;
  actionUrl: string;
  footer?: string;
}) {
  const logoUrl = env("ZMM_LOGO_URL") || DEFAULT_LOGO_URL;
  return `<!doctype html>
<html>
  <body style="margin:0;background:#02070b;color:#f7fbfd;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#02070b;padding:30px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;background:#061722;border:1px solid #16445f;border-top:5px solid #16a9eb;border-radius:18px;">
          <tr><td style="padding:34px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img src="${escapeHtml(logoUrl)}" width="190" alt="ZMM — Zerona March Madness" style="display:inline-block;width:190px;max-width:70%;height:auto;border:0;">
            </div>
            <div style="color:#16a9eb;font-size:12px;font-weight:700;letter-spacing:2px;text-align:center;">${escapeHtml(input.eyebrow)}</div>
            <h1 style="margin:12px 0 22px;font-size:28px;line-height:1.2;color:#f7fbfd;text-align:center;">${escapeHtml(input.heading)}</h1>
            ${input.body}
            <div style="margin-top:26px;text-align:center;">
              <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:14px 24px;background:#16a9eb;color:#001018;text-decoration:none;font-size:16px;font-weight:700;border-radius:9px;">${escapeHtml(input.actionLabel)}</a>
            </div>
            ${input.footer ?? ""}
          </td></tr>
        </table>
        <div style="padding:18px 12px;color:#456273;font-size:11px;text-align:center;">Zerona March Madness &bull; Bragging rights start here.</div>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderCommissionerReadyEmail(
  config: CommunicationConfig,
  summary: FieldSummary,
): EmailContent {
  const deadline = formatDeadline(summary.entryDeadline);
  const reviewUrl =
    `${config.app_url.replace(/\/$/, "")}/commissioner?returnTo=/bracket#tournament-launch`;
  const regionRows = summary.regions.map((region) =>
    `<tr><td style="padding:8px 11px;border-bottom:1px solid #173b50;color:#c9dbe4;text-transform:capitalize;">${escapeHtml(region.region)}</td><td style="padding:8px 11px;border-bottom:1px solid #173b50;color:#ffffff;text-align:right;">${region.games} games</td></tr>`
  ).join("");
  const textContent = [
    `ZMM ${summary.seasonYear} field is ready for review`,
    "",
    `The automated checks found ${summary.gameCount} first-round games, all four regions, every expected seed matchup, and official Final Four region pairings.`,
    `Entry deadline: ${deadline}`,
    `Final Four: ${summary.finalFourPairings.join(" and ")}`,
    "",
    "No family announcement has been sent.",
    "Review the bracket and use the Commissioner screen when you are ready to approve the opening email.",
    "",
    `Review ZMM: ${reviewUrl}`,
  ].join("\n");
  const body = `
    <p style="margin:0 0 18px;color:#c8d7df;font-size:16px;line-height:1.65;">The automated field checks passed. ZMM found the full first round, valid seed matchups, and the official Final Four region pairings.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
      <tr><td style="padding:14px 16px;color:#83a1b1;">First-round games</td><td style="padding:14px 16px;color:#ffffff;font-weight:700;text-align:right;">${summary.gameCount}</td></tr>
      ${regionRows}
    </table>
    <div style="margin:0 0 14px;padding:16px;background:#092334;border:1px solid #1c5b7d;border-radius:10px;color:#d7e7ef;font-size:15px;line-height:1.55;">
      <strong style="color:#ffffff;">Entry deadline:</strong> ${escapeHtml(deadline)}
    </div>
    <div style="margin:0 0 20px;padding:16px;background:#020d14;border:1px solid #1c4d68;border-radius:10px;color:#9fb5c1;font-size:14px;line-height:1.55;">
      <strong style="color:#dcebf2;">Final Four:</strong> ${escapeHtml(summary.finalFourPairings.join(" and "))}
    </div>
    <p style="margin:0;color:#ffca85;font-size:15px;line-height:1.6;text-align:center;"><strong>Nothing has been sent to the family yet.</strong><br>Check the bracket, then approve the opening email from the Commissioner screen.</p>`;
  return {
    subject: `[ZMM] ${summary.seasonYear} bracket field is ready for review`,
    textContent,
    htmlContent: emailShell({
      eyebrow: "COMMISSIONER REVIEW",
      heading: `${summary.seasonYear} field is ready`,
      preview: "The ZMM bracket field passed validation and is waiting for your approval.",
      body,
      appUrl: config.app_url,
      actionLabel: "Review and approve",
      actionUrl: reviewUrl,
    }),
  };
}

export function renderFieldChangedEmail(
  config: CommunicationConfig,
  summary: FieldSummary,
): EmailContent {
  const reviewUrl =
    `${config.app_url.replace(/\/$/, "")}/commissioner?returnTo=/march-madness#tournament-launch`;
  const textContent = [
    `ZMM ${summary.seasonYear} field changed after the family announcement`,
    "",
    "The first-round field or official region pairings changed after the brackets-open email was sent.",
    "Review ESPN, the official NCAA bracket, and ZMM immediately.",
    "",
    `Review ZMM: ${reviewUrl}`,
  ].join("\n");
  const body = `
    <div style="padding:18px;background:#38131a;border:1px solid #8b3544;border-radius:12px;color:#ffd9df;font-size:16px;line-height:1.65;">
      The first-round field or official region pairings changed after the brackets-open email was sent. Review ESPN, the official NCAA bracket, and ZMM immediately.
    </div>`;
  return {
    subject: `[ZMM URGENT] ${summary.seasonYear} field changed after launch`,
    textContent,
    htmlContent: emailShell({
      eyebrow: "FIELD CHANGED",
      heading: "Manual review required",
      preview: "The tournament field changed after the family announcement.",
      body,
      appUrl: config.app_url,
      actionLabel: "Review ZMM now",
      actionUrl: reviewUrl,
    }),
  };
}

export function renderFamilyLaunchEmail(
  config: CommunicationConfig,
  summary: FieldSummary,
): EmailContent {
  const deadline = formatDeadline(summary.entryDeadline);
  const appUrl = config.app_url.replace(/\/$/, "");
  const paymentUrl = venmoUrl(config.venmo_handle);
  const phoneLine = config.commissioner_phone
    ? `If you have any trouble, reply to this email or call or text Luke at ${config.commissioner_phone}.`
    : "If you have any trouble, reply to this email and Luke will help.";
  const textContent = [
    "Hello everyone!",
    "",
    `Welcome back to another great year of Zerona March Madness!`,
    "",
    "Sign in with your username and password. Your account begins with one bracket, and you can add or copy more brackets for other people in your family.",
    "Complete all 63 picks and the total-points tiebreaker, then remember to save your bracket.",
    "",
    `Picks are due by ${deadline}. After that, brackets are locked and cannot be created or changed.`,
    "",
    `Each bracket is $10. You do not pick the play-in games. Payouts go to the top three places: 60% / 30% / 10%.`,
    `Venmo ${config.venmo_handle}: ${paymentUrl}`,
    "",
    phoneLine,
    "",
    "Thanks for waiting and good luck!",
    config.commissioner_name,
    `Venmo: ${config.venmo_handle}`,
    "",
    `Make your picks: ${appUrl}/bracket`,
  ].join("\n");
  const body = `
    <p style="margin:0 0 16px;color:#f7fbfd;font-size:18px;line-height:1.6;">Hello everyone!</p>
    <p style="margin:0 0 22px;color:#c8d7df;font-size:16px;line-height:1.65;">Welcome back to another great year of <strong style="color:#ffffff;">Zerona March Madness!</strong></p>
    <div style="margin-bottom:18px;padding:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
      <div style="margin-bottom:9px;color:#16a9eb;font-size:11px;font-weight:700;letter-spacing:1.6px;">HOW TO ENTER</div>
      <p style="margin:0;color:#c8d7df;font-size:15px;line-height:1.65;">Sign in with your username and password. Your account begins with one bracket, and you can add or copy more brackets for other people in your family.</p>
      <p style="margin:10px 0 0;color:#ffffff;font-size:15px;line-height:1.65;"><strong>Complete all 63 picks and the total-points tiebreaker, then remember to save your bracket.</strong></p>
    </div>
    <div style="margin-bottom:18px;padding:18px;background:#092334;border:1px solid #1c5b7d;border-radius:12px;">
      <div style="margin-bottom:7px;color:#63cfff;font-size:11px;font-weight:700;letter-spacing:1.6px;">ENTRY DEADLINE</div>
      <div style="color:#ffffff;font-size:18px;font-weight:700;line-height:1.45;">${escapeHtml(deadline)}</div>
      <p style="margin:7px 0 0;color:#a9c0cd;font-size:14px;line-height:1.55;">After this time, brackets are locked and cannot be created or changed.</p>
    </div>
    <div style="margin-bottom:18px;padding:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;color:#c8d7df;font-size:15px;line-height:1.65;">
      <strong style="color:#ffffff;">Pool rules:</strong> Each bracket is $10. You do not pick the play-in games. Payouts go to the top three places: <strong style="color:#ffffff;">60% / 30% / 10%</strong>.
    </div>
    <div style="margin-bottom:20px;padding:18px;background:#0b291f;border:1px solid #236f55;border-radius:12px;color:#c8efe0;font-size:15px;line-height:1.6;text-align:center;">
      Please pay on Venmo at <a href="${escapeHtml(paymentUrl)}" style="color:#65e3b3;font-weight:700;">${escapeHtml(config.venmo_handle)}</a>. If you need to pay cash, contact Luke.
    </div>
    <p style="margin:0 0 18px;color:#9ab0be;font-size:15px;line-height:1.65;">${escapeHtml(phoneLine)}</p>
    <p style="margin:0;color:#dcebf2;font-size:15px;line-height:1.65;">Thanks for waiting and good luck!<br><strong>${escapeHtml(config.commissioner_name)}</strong><br>Venmo: <a href="${escapeHtml(paymentUrl)}" style="color:#55c9ff;">${escapeHtml(config.venmo_handle)}</a></p>`;
  return {
    subject: `${summary.seasonYear} Zerona March Madness is open — make your picks!`,
    textContent,
    htmlContent: emailShell({
      eyebrow: "BRACKETS ARE OPEN",
      heading: "Welcome back to the madness",
      preview: `The ${summary.seasonYear} ZMM bracket is ready. Make your picks before ${deadline}.`,
      body,
      appUrl,
      actionLabel: "Make your picks",
      actionUrl: `${appUrl}/bracket`,
    }),
  };
}

export async function sendBrevoEmail(input: {
  config: CommunicationConfig;
  toEmail: string;
  toName: string;
  content: EmailContent;
  idempotencyKey: string;
  tags: string[];
}): Promise<string | null> {
  const apiKey = env("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured.");
  const fromEmail = env("ZMM_ALERT_FROM_EMAIL") || DEFAULT_SENDER;
  const response = await fetch(BREVO_EMAIL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "Zerona March Madness" },
      to: [{ email: input.toEmail, name: input.toName }],
      replyTo: {
        email: input.config.commissioner_email,
        name: input.config.commissioner_name,
      },
      subject: input.content.subject,
      textContent: input.content.textContent,
      htmlContent: input.content.htmlContent,
      headers: { "Idempotency-Key": input.idempotencyKey },
      tags: ["zmm", ...input.tags],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Brevo returned HTTP ${response.status}: ${truncate(responseText, 500)}`,
    );
  }
  if (!responseText) return null;
  const value: unknown = JSON.parse(responseText);
  return typeof value === "object" && value !== null &&
      "messageId" in value && typeof value.messageId === "string"
    ? value.messageId
    : null;
}
