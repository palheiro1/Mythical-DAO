import { env } from "cloudflare:workers";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config";
import { pollSnapshot } from "../src/snapshot";
import { network } from "./network";

const now = 1_700_000_000;

function snapshotResponse(state: "active" | "closed", scores = [0, 0]): object {
  return {
    data: {
      proposals: [
        {
          id: "snapshot-1",
          title: "<b>Season theme</b>",
          choices: ["Fire", "Water"],
          start: now - 3_600,
          end: now + 43_200,
          state,
          created: now - 7_200,
          scores,
          scores_total: scores.reduce((total, score) => total + score, 0),
        },
      ],
    },
  };
}

describe("Snapshot polling", () => {
  it("baselines silently, then emits one reminder and one result", async () => {
    let response = snapshotResponse("active");
    network.use(
      http.post("https://hub.snapshot.org/graphql", () => HttpResponse.json(response)),
    );
    const config = readConfig(env);

    await pollSnapshot(env, config, now);
    let count = await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_events").first<{
      count: number;
    }>();
    expect(count?.count).toBe(0);

    await pollSnapshot(env, config, now + 900);
    await pollSnapshot(env, config, now + 1_800);
    count = await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_events").first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);

    response = snapshotResponse("closed", [50, 50]);
    await pollSnapshot(env, config, now + 2_700);
    const rows = await env.DB
      .prepare("SELECT event_type, message_html FROM notification_events ORDER BY event_type")
      .all<{ event_type: string; message_html: string }>();
    expect(rows.results.map((row) => row.event_type)).toEqual(["reminder_24h", "succeeded"]);
    expect(rows.results[1]?.message_html).toContain("Tie: Fire / Water");
    expect(rows.results[1]?.message_html).toContain("&lt;b&gt;Season theme&lt;/b&gt;");
  });

  it("rejects malformed proposal data", async () => {
    network.use(
      http.post("https://hub.snapshot.org/graphql", () =>
        HttpResponse.json({ data: { proposals: [{ id: 42 }] } }),
      ),
    );
    await expect(pollSnapshot(env, readConfig(env), now)).rejects.toThrow("malformed proposal");
  });
});
