import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";

export const readWebPageTool: any = {
  description: `Read the content of a web page (URL) and return it as simplified Markdown and metadata.
Use this to understand the structure of a website, find element IDs, or read documentation.
For INTERACTING with a live browser on your screen, use 'inspect_ui' and 'move_mouse' instead.`,

  parameters: z.object({
    url: z.string().describe("The URL of the web page to read"),
    mode: z.enum(["markdown", "html", "summary"]).default("markdown").describe("Return format"),
  }),

  execute: async (args: any) => {
    const { url, mode = "markdown" } = args;

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Remove noisy elements
      $("script, style, nav, footer, noscript, iframe").remove();

      if (mode === "html") {
        return $("body").html()?.slice(0, 15000) || "Empty body";
      }

      const nhm = new NodeHtmlMarkdown();
      const markdown = nhm.translate($("body").html() || "");

      if (mode === "summary") {
        // Extract meta tags
        const title = $("title").text();
        const description = $('meta[name="description"]').attr("content") || "";
        const buttons = $("button").map((i, el) => $(el).text().trim()).get().join(", ");
        const inputs = $("input").map((i, el) => $(el).attr("name") || $(el).attr("placeholder")).get().join(", ");

        return `Title: ${title}\nDescription: ${description}\n\nInteractive Elements:\nButtons: [${buttons}]\nInputs: [${inputs}]\n\nContent Preview:\n${markdown.slice(0, 1000)}`;
      }

      return markdown.slice(0, 15000); // Token safety limit
    } catch (e: any) {
      return `Failed to read web page: ${e.message}`;
    }
  },
};
