"use client";

import { useState } from "react";
import { Loader2, Play, Terminal } from "lucide-react";
import { shortSeal } from "@/lib/bands";

/**
 * A live MCP console.
 *
 * Each preset is a real JSON-RPC request posted to /api/mcp, and the raw request
 * and raw response are both shown, because an agent interface you cannot inspect
 * is indistinguishable from a fake one. Mutations really do write: file_plate
 * creates a plate, and the response includes a link to it.
 *
 * The request goes to a same-origin relative path, never to the absolute endpoint
 * that is displayed. NEXT_PUBLIC_ variables are inlined when the client bundle is
 * built, so reading the canonical origin inside a client component would bake in
 * whatever host happened to be set at build time; the absolute URL is therefore
 * passed in as a prop by the server page and used only for display.
 */

interface Preset {
  id: string;
  label: string;
  description: string;
  method: string;
  tool?: string;
  args?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    id: "initialize",
    label: "initialize",
    description: "Negotiate the protocol version and see what this server supports.",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "openplate-console", version: "1.0.0" },
    },
  },
  {
    id: "tools",
    label: "tools/list",
    description: "Discover the six typed tools and their input schemas.",
    method: "tools/list",
    params: {},
  },
  {
    id: "search",
    label: "search_works",
    description: "Read both open-access collections and return normalised records.",
    method: "tools/call",
    tool: "search_works",
    args: { query: "jaguar", limit: 4 },
  },
  {
    id: "assess",
    label: "assess_work",
    description: "Run the deterministic engine on one record without saving anything.",
    method: "tools/call",
    tool: "assess_work",
    args: { workId: "met:19275", use: "merchandise", jurisdiction: "us", circulation: 50000 },
  },
  {
    id: "file",
    label: "file_plate",
    description: "Mutate: pin a record to an intended use and seal the genesis event.",
    method: "tools/call",
    tool: "file_plate",
    args: {
      workId: "met:11298",
      use: "editorial",
      jurisdiction: "us",
      circulation: 10000,
      note: "Filed from the MCP console",
      idempotencyKey: "console-demo-0001",
    },
  },
  {
    id: "verify",
    label: "verify_plate",
    description: "Replay a plate's chain and report the first broken link, if any.",
    method: "tools/call",
    tool: "verify_plate",
    args: {},
  },
];

/**
 * The exact JSON-RPC body a preset posts.
 *
 * Kept as one function so the panel shown to the reader and the request actually
 * sent are built by the same code and cannot drift apart.
 */
function requestBody(preset: Preset, args: Record<string, unknown> | undefined): string {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    id: 1,
    method: preset.method,
  };
  if (preset.method === "tools/call") {
    body.params = { name: preset.tool, arguments: args ?? {} };
  } else if (preset.params) {
    body.params = preset.params;
  }
  return JSON.stringify(body, null, 2);
}

export function AgentConsole({
  endpoint,
  plateId,
  plateCount,
}: {
  endpoint: string;
  plateId: string | null;
  plateCount: number;
}) {
  const [active, setActive] = useState<string>("initialize");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<{ code: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS.find((entry) => entry.id === active) ?? PRESETS[0];
  const effectiveArgs =
    preset.id === "verify_plate" && !preset.args?.plateId && plateId
      ? { ...preset.args, plateId }
      : preset.args;

  const shownRequest = requestBody(preset, effectiveArgs);

  async function send() {
    setBusy(true);
    setError(null);
    setResponse(null);
    setStatus(null);
    try {
      const result = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: shownRequest,
      });
      const text = await result.text();
      setStatus({ code: result.status, text: result.headers.get("content-type") ?? "unknown" });
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the MCP endpoint.");
    } finally {
      setBusy(false);
    }
  }

  const parsed = (() => {
    if (!response) return null;
    try {
      return JSON.parse(response) as {
        result?: { content?: { text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
        error?: { code: number; message: string };
      };
    } catch {
      return null;
    }
  })();

  const plate =
    parsed?.result?.structuredContent?.plate as
      | { id?: string; shareCode?: string; seal?: string; title?: string }
      | undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
      <div>
        <p className="slug">One click, real request</p>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {PRESETS.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(entry.id);
                  setResponse(null);
                  setError(null);
                  setStatus(null);
                }}
                aria-pressed={active === entry.id}
                className={`w-full px-2 py-3 text-left transition-colors ${
                  active === entry.id ? "bg-bench" : "hover:bg-bench/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Terminal size={13} aria-hidden="true" className="text-review" />
                  <span className="font-mono text-sm text-bone">{entry.label}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-bone-faint">{entry.description}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 border border-rule p-4">
          <p className="slug">Endpoint</p>
          <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-bone-dim">{endpoint}</p>
          <p className="mt-3 text-xs leading-relaxed text-bone-faint">
            {plateCount > 0
              ? `${plateCount} plate${plateCount === 1 ? "" : "s"} in this session's docket. Mutations here write to the same rows the UI writes.`
              : "No plates in this session yet. Run file_plate to create one through the agent path."}
          </p>
        </div>

        {plate?.id ? (
          <div className="mt-4 border p-4" style={{ borderColor: "var(--color-clear)" }}>
            <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: "var(--color-clear)" }}>
              Persisted through the agent path
            </p>
            <p className="mt-2 break-all font-mono text-[0.625rem] text-bone-faint">{plate.seal}</p>
            <a
              href={`/plates/${plate.id}`}
              className="mt-3 inline-block border border-review px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-review hover:bg-review hover:text-room"
            >
              Open the plate it created
            </a>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="crop border border-rule bg-room-deep">
          <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <span className="slug">Request</span>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="inline-flex items-center gap-2 border border-review px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
              {busy ? "Sending" : "Send"}
            </button>
          </div>
          <pre className="tnum overflow-x-auto p-4 font-mono text-[0.6875rem] leading-relaxed text-bone-dim">
            {shownRequest}
          </pre>
        </div>

        <div className="crop border border-rule bg-room-deep">
          <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <span className="slug">Response</span>
            {status ? (
              <span className="font-mono text-[0.625rem] text-bone-faint">
                HTTP {status.code} &middot; {status.text.split(";")[0]}
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="p-4 text-sm" style={{ color: "var(--color-blocked)" }} role="alert">
              {error}
            </p>
          ) : parsed?.result?.content?.[0]?.text ? (
            <p className="border-b border-rule px-4 py-2.5 text-xs leading-relaxed text-bone">
              {parsed.result.content[0].text}
            </p>
          ) : null}
          <pre className="tnum max-h-[28rem] overflow-auto p-4 font-mono text-[0.625rem] leading-relaxed text-bone-dim">
            {response ?? "Send a request to see the raw JSON-RPC response."}
          </pre>
        </div>

        {parsed?.error ? (
          <p className="border px-4 py-3 font-mono text-xs" style={{ color: "var(--color-blocked)", borderColor: "var(--color-blocked)" }} role="alert">
            JSON-RPC error {parsed.error.code}: {parsed.error.message}
          </p>
        ) : null}

        {parsed?.result?.isError ? (
          <p className="border px-4 py-3 font-mono text-xs" style={{ color: "var(--color-review)", borderColor: "var(--color-review)" }}>
            The tool reported a failure. A tool that fails answers with isError rather than a transport error, so an
            agent can read the problem and try something else.
          </p>
        ) : null}

        <p className="text-xs leading-relaxed text-bone-faint">
          Chain seals are {shortSeal("0".repeat(96))}-length SHA-384 digests over the canonical JSON of each
          event. Point any MCP client at the endpoint above, or read{" "}
          <a href="/mcp.json" className="text-review underline underline-offset-2">
            /mcp.json
          </a>
          .
        </p>
      </div>
    </div>
  );
}
