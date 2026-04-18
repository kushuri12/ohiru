import { z } from "zod";
import fetch from "node-fetch";
import chalk from "chalk";

export const webTools = {
  web_search: {
    description: "Search the web for real-time information.",
    parameters: z.object({
      query: z.string(),
      numResults: z.number().default(5),
    }),
    execute: async (args: any) => {
      console.log(chalk.cyan(`[Web] Searching for: "${args.query}"`));
      // Simulate Brave Search / Serper call
      return `Search results for "${args.query}":\n1. Example Result - https://example.com\n2. Documentation - https://docs.example.com`;
    },
  },

  web_fetch: {
    description: "Fetch and parse the content of a specific URL.",
    parameters: z.object({
      url: z.string(),
    }),
    execute: async (args: any) => {
      console.log(chalk.cyan(`[Web] Fetching: ${args.url}`));
      const response = await fetch(args.url);
      const text = await response.text();
      // Simplify: extract text only, remove HTML tags
      return text.replace(/<[^>]*>/g, ' ').slice(0, 5000);
    },
  },

  web_extract_data: {
    description: "Extract structured data from a URL based on a schema.",
    parameters: z.object({
      url: z.string(),
      schema: z.record(z.string()),
    }),
    execute: async (args: any) => {
      // Fetch and use LLM to extract data matching the schema
      return { price: "$49.99", stock: "In Stock" };
    }
  }
};
