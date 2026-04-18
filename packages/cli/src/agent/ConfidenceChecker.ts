/**
 * ConfidenceChecker
 * Evaluates agent responses for confidence signals before sending to user.
 * Low-confidence responses trigger a verification tool call automatically.
 */

export interface ConfidenceResult {
  score: number;        // 0-100
  signals: string[];    // List of detected low-confidence phrases
  shouldVerify: boolean; // true if score < threshold
  suggestedTool?: string; // Which tool to call for verification
  suggestedArgs?: Record<string, any>;
}

// Phrases that indicate the model is uncertain or potentially hallucinating
const LOW_CONFIDENCE_SIGNALS = [
  // Uncertainty markers
  { pattern: /i think|i believe|probably|likely|might be|could be|should be/gi, weight: -15 },
  { pattern: /i'm not (sure|certain)|i'm unsure|not 100%/gi, weight: -20 },
  { pattern: /typically|usually|in most cases|generally speaking/gi, weight: -10 },
  // Vague references without explicit evidence
  { pattern: /the (file|function|class|method) (is|should|might|probably)/gi, weight: -15 },
  { pattern: /based on (my knowledge|typical|standard|common)/gi, weight: -20 },
  // Fabrication patterns
  { pattern: /as we can see|as shown|clearly|obviously/gi, weight: -10 },
  // Version/date claims
  { pattern: /version \d+\.\d+/gi, weight: -5 },
];

// High-confidence signals (positive weight)
const HIGH_CONFIDENCE_SIGNALS = [
  { pattern: /based on (package\.json|the file|line \d+|the output)/gi, weight: +20 },
  { pattern: /from (the tool output|the search result|line \d+)/gi, weight: +25 },
  { pattern: /i (read|ran|executed|searched)/gi, weight: +15 },
];

export class ConfidenceChecker {
  private readonly THRESHOLD = 60; // Scores below this trigger verification

  /**
   * Evaluate a response text and return confidence assessment.
   */
  evaluate(responseText: string, toolCallsMade: string[]): ConfidenceResult {
    let score = 70; // Start with neutral-high baseline
    const detectedSignals: string[] = [];

    // Check low confidence signals
    for (const signal of LOW_CONFIDENCE_SIGNALS) {
      if (signal.pattern.test(responseText)) {
        score += signal.weight;
        detectedSignals.push(`Low confidence: "${signal.pattern.source}"`);
      }
    }

    // Check high confidence signals
    for (const signal of HIGH_CONFIDENCE_SIGNALS) {
      if (signal.pattern.test(responseText)) {
        score += signal.weight;
        // Don't log high signals as warnings
      }
    }

    // Cross-reference: if response mentions a file that wasn't read in tool calls
    const fileMentions = responseText.match(/`?(\w+[\/\w\.-]+\.\w+)`?/g);
    if (fileMentions) {
      for (const mention of fileMentions) {
        const cleanPath = mention.replace(/`/g, '');
        if (!this.hasFileWasRead(cleanPath, toolCallsMade)) {
          score -= 25;
          detectedSignals.push(`Evidence gap: Mentioned "${cleanPath}" but never read it.`);
        }
      }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    const verification = this.suggestVerificationTool(responseText, toolCallsMade);

    return {
      score,
      signals: detectedSignals,
      shouldVerify: score < this.THRESHOLD,
      suggestedTool: verification?.tool,
      suggestedArgs: verification?.args,
    };
  }

  /**
   * Determine which tool to call for verification based on response content.
   */
  private suggestVerificationTool(
    response: string,
    toolCallsMade: string[]
  ): { tool: string; args: Record<string, any> } | null {
    // If mentions an unread file
    const fileMentions = response.match(/`?(\w+[\/\w\.-]+\.\w+)`?/g);
    if (fileMentions) {
      for (const mention of fileMentions) {
        const path = mention.replace(/`/g, '');
        if (!this.hasFileWasRead(path, toolCallsMade)) {
          return { tool: "read_file", args: { path } };
        }
      }
    }

    // If mentions current versions/dates but didn't search web
    if (response.match(/version|latest|current|since/i) && !toolCallsMade.includes("search_web")) {
      return { tool: "search_web", args: { query: "latest version of " + (response.match(/(\w+) package/i)?.[1] || "dependency") } };
    }

    return null;
  }

  /**
   * Check if a file path mentioned in response actually had a read_file call.
   */
  private hasFileWasRead(filePath: string, toolCallsMade: string[]): boolean {
    return toolCallsMade.some(call => call.includes("read_file") && call.includes(filePath));
  }
}
