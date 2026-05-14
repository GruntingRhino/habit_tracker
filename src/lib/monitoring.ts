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

async function sendToDiscord(report: ErrorReport): Promise<void> {
  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK;
  if (!webhookUrl) return;

  try {
    const fields = [
      { name: "Context", value: report.context, inline: true },
      { name: "Error", value: formatError(report.error).slice(0, 1000), inline: false },
    ];
    if (report.method && report.url) {
      fields.push({ name: "Request", value: `${report.method} ${report.url}`, inline: true });
    }
    if (report.userId) {
      fields.push({ name: "User", value: report.userId, inline: true });
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
  const { context, error, method, url, userId } = report;

  const structured: Record<string, unknown> = {
    ts: new Date().toISOString(),
    context,
    error: formatError(error),
  };
  if (method) structured.method = method;
  if (url) structured.url = url;
  if (userId) structured.userId = userId;
  if (error instanceof Error && error.stack) structured.stack = error.stack;

  console.error("[ERROR]", JSON.stringify(structured));

  if (process.env.NODE_ENV === "production") {
    void sendToDiscord(report);
  }
}
