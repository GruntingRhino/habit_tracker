export interface ErrorReport {
  context: string;
  error: unknown;
  method?: string;
  url?: string;
  userId?: string;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split("?")[0];
  }
}

function safeReport(report: ErrorReport): ErrorReport {
  return {
    ...report,
    url: sanitizeUrl(report.url),
  };
}

async function sendToDiscord(report: ErrorReport): Promise<void> {
  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK;
  if (!webhookUrl) return;

  try {
    const safe = safeReport(report);
    const fields = [
      { name: "Context", value: safe.context, inline: true },
      { name: "Error", value: formatError(safe.error).slice(0, 1000), inline: false },
    ];
    if (safe.method && safe.url) {
      fields.push({ name: "Request", value: `${safe.method} ${safe.url}`, inline: true });
    }
    if (safe.userId) {
      fields.push({ name: "User", value: safe.userId, inline: true });
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "API Error",
            color: 0xe74c3c,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    // never let monitoring break the app
  }
}

export function reportError(report: ErrorReport): void {
  const safe = safeReport(report);
  const { context, error, method, url, userId } = safe;

  const structured: Record<string, unknown> = {
    ts: new Date().toISOString(),
    context,
    error: formatError(error),
  };
  if (method) structured.method = method;
  if (url) structured.url = url;
  if (userId) structured.userId = userId;
  if (error instanceof Error && error.stack && process.env.NODE_ENV !== "production") {
    structured.stack = error.stack;
  }

  console.error("[ERROR]", JSON.stringify(structured));

  if (process.env.NODE_ENV === "production") {
    void sendToDiscord(safe);
  }
}
