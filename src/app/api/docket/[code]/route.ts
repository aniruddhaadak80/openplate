import type { NextRequest } from "next/server";
import { handle, jsonError, NO_STORE } from "@/lib/api-helpers";
import { getShareView } from "@/lib/service";
import {
  contentTypeFor,
  docketFileName,
  renderDocketCsv,
  renderDocketJson,
  renderDocketMarkdown,
  type DocketFormat,
} from "@/lib/export";
import { isShareCode } from "@/lib/validation";

interface Context {
  params: Promise<{ code: string }>;
}

/**
 * The downloadable artifact.
 *
 * Three renderings of one view: JSON for tooling, CSV for a spreadsheet,
 * Markdown for a person to paste into an email. They cannot disagree because
 * there is one set of numbers behind all three.
 */
export async function GET(request: NextRequest, context: Context) {
  return handle(async () => {
    const { code } = await context.params;
    if (!isShareCode(code)) {
      return jsonError(400, "bad_identifier", "That share code is malformed.");
    }

    const requested = request.nextUrl.searchParams.get("format");
    const format: DocketFormat =
      requested === "csv" || requested === "md" || requested === "json" ? requested : "json";

    const view = await getShareView(code);

    // A retired docket still renders, marked as retired, because its whole
    // purpose is to remain checkable after it stopped being live.
    const payload =
      format === "json"
        ? `${JSON.stringify(renderDocketJson(view), null, 2)}\n`
        : format === "csv"
          ? `${renderDocketCsv(view)}\n`
          : `${renderDocketMarkdown(view)}\n`;

    return new Response(payload, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(format),
        "content-disposition": `attachment; filename="${docketFileName(view.plate, format)}"`,
        ...NO_STORE.headers,
      },
    });
  });
}
