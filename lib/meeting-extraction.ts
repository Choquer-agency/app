import Anthropic from "@anthropic-ai/sdk";
import { getLangfuse, flushLangfuse } from "./langfuse";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExtractedItem {
  task: string;
  description: string;
  assigneeNames: string[];
  clientName: string;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  sourceContext: string | null;
  links: string[];
}

/** @deprecated Use assigneeNames instead. Kept for backward compat with web UI. */
export interface LegacyExtractedItem {
  task: string;
  description: string;
  assigneeName: string;
  clientName: string;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  contextFromTranscript: string;
}

export type ExpansionLevel = "none" | "light" | "full";

export interface ExtractionOptions {
  inputType?: "transcript" | "direct_task" | "task_with_expansion";
  expansionLevel?: ExpansionLevel;
  source?: "slack" | "web";
}

/**
 * Uses Claude to extract action items from text input.
 * Adapts behavior based on input type — meeting transcripts, direct task assignments, or AI-expanded tasks.
 */
export async function extractActionItems(
  transcript: string,
  teamMemberNames: string[],
  clientNames: string[],
  meetingWith: string,
  options: ExtractionOptions = {}
): Promise<{ items: ExtractedItem[]; summary: string }> {
  const {
    inputType = "transcript",
    expansionLevel = "none",
    source = "web",
  } = options;

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "meeting-extraction",
    metadata: { meetingWith, inputType, expansionLevel, source },
  });

  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Build adaptive context based on source and input type
  let contextBlock: string;
  if (source === "slack") {
    contextBlock = `- This is a message from the agency owner sent via Slack (possibly voice-to-text).
- The input type is: ${inputType === "transcript" ? "a meeting transcript or detailed briefing" : inputType === "task_with_expansion" ? "a task request where the owner wants YOU to expand and add detail" : "a direct task assignment"}`;
  } else {
    contextBlock = `- This is a weekly 1-on-1 meeting between a manager and a team member.
- The meeting was with: ${meetingWith}`;
  }

  // Build expansion instructions
  let expansionBlock = "";
  if (expansionLevel === "light") {
    expansionBlock = `\nAI EXPANSION (light mode):
- Clean up the owner's words, add structure, fill in obvious gaps.
- Stay close to what they said — polish, don't rewrite.
- Add brief context where helpful but don't generate new content.`;
  } else if (expansionLevel === "full") {
    expansionBlock = `\nAI EXPANSION (full mode):
- The owner is asking YOU to think through this and add your own knowledge.
- Write a thorough, detailed description with best practices, recommendations, and step-by-step guidance.
- MAX 300-500 words. Heavily structured with headings and bullets — scannable, not an essay.
- Use your expertise to make this a genuinely useful brief that the assignee can execute from.`;
  }

  const systemPrompt = `You are an assistant that processes messages and extracts action items for a digital marketing agency called Choquer Agency.

CONTEXT:
- Today is: ${dayOfWeek}, ${today}
${contextBlock}
- Team members: ${teamMemberNames.join(", ")}
- Clients: ${clientNames.join(", ")}

YOUR TASK:
1. Read the input carefully
2. Extract actionable items — things that need to be done, delivered, or followed up on
3. For each item, determine WHO is responsible, WHICH CLIENT it relates to, and WHEN it's due
4. Preserve ALL URLs/links from the input — Loom videos, Google Drive folders, website URLs, etc.

VOICE-TO-TEXT: This input may come from voice-to-text and contain transcription errors. Interpret intent over literal words. Common mistakes: "Choker" = "Choquer", numbers may be mangled ("for hours" vs "four hours"), punctuation absent, run-on sentences. Fuzzy-match all names against the provided team/client lists.

CONSOLIDATION RULES:
- If the message is about ONE project/client with multiple sub-tasks → create ONE ticket with all sub-tasks in the description
- If the message is a meeting transcript covering MULTIPLE clients/projects → create SEPARATE tickets per actionable item
- EXCEPTION: If the same message tags multiple people with genuinely independent work streams (e.g., "Johnny handle the dev, Lauren handle the image editing"), split by assignee even within the same project. Each person gets their own ticket with only their relevant instructions.
- Signals for 1 ticket: single topic, "add this as a task", one client mentioned, coherent single directive
- Signals for many tickets: multiple clients, unrelated topics, different people with different work
${expansionBlock}
DESCRIPTION FORMAT — use markdown with clear visual hierarchy:
- ## Headings for major sections
- **Bold** for key points, names, and emphasis
- Bullet points for sub-items and lists
${inputType === "transcript" ? '- > Blockquotes for direct quotes from the transcript' : '- Keep the owner\'s original language/tone — polish grammar but don\'t rewrite their voice'}
- A "## Resources" section at the bottom for ALL links/URLs from the input
- Never drop a URL — if a link appears in the input, it MUST appear in the description

URGENCY SIGNALS → set priority="urgent" AND dueDate="${today}":
- "all hands on deck", "ASAP", "today", "drop everything", "emergency"
- CEO/owner/boss upset, negative client feedback, critical issue
- Explicit "due today" or "need this done today"

DATE RULES:
- Today is ${dayOfWeek}, ${today}. Current year is ${today.slice(0, 4)}.
- "today" = ${today}, "tomorrow" = the next day
- Day names: if that day has ALREADY PASSED this week, use NEXT week's occurrence. Example: if today is Thursday and they say "due Wednesday" → next Wednesday. If today is Monday and they say "due Friday" → this Friday.
- "end of week" = this Friday. "next week" = next Monday.
- NEVER output dates in the past.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "summary": "2-3 sentence summary",
  "items": [
    {
      "task": "Short 5-8 word title in imperative form (e.g., 'Revamp AARC West website imagery')",
      "description": "Markdown-formatted description with headings, bullets, and a Resources section for links",
      "assigneeNames": ["Name1", "Name2"],
      "clientName": "Exact name from client list, or Internal",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "low|normal|high|urgent",
      "sourceContext": ${inputType === "transcript" ? '"Relevant quote or paraphrase from the transcript"' : "null"},
      "links": ["https://...", "https://..."]
    }
  ]
}

RULES:
- Use EXACT names from the provided lists, never misspelled transcript versions
- Task titles: 5-8 words max, imperative form, start with a verb
- assigneeNames is an ARRAY — include all people responsible for this specific item
- Set priority based on urgency cues: "urgent" for same-day/critical, "high" for this-week/important, "normal" for standard work, "low" for nice-to-have
- links array: every URL from the input that relates to this item
- The description should be self-contained — someone reading only the ticket should know exactly what to do`;

  const generation = trace?.generation({
    name: "extract-action-items",
    model: "claude-sonnet-4-20250514",
    input: { transcript: transcript.slice(0, 500) + "..." },
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the input:\n\n${transcript}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    generation?.end({ output: text.slice(0, 500) + "..." });

    // Parse JSON from response (handle potential markdown code blocks)
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as { summary: string; items: ExtractedItem[] };

    // Normalize items — ensure arrays
    const items = (parsed.items || []).map((item) => ({
      ...item,
      assigneeNames: Array.isArray(item.assigneeNames)
        ? item.assigneeNames
        : [(item as unknown as { assigneeName?: string }).assigneeName || ""].filter(Boolean),
      links: Array.isArray(item.links) ? item.links : [],
      sourceContext: item.sourceContext ?? null,
    }));

    await flushLangfuse();

    return {
      summary: parsed.summary || "",
      items,
    };
  } catch (error) {
    generation?.end({ output: String(error), level: "ERROR" });
    await flushLangfuse();
    throw error;
  }
}

/**
 * Convert new ExtractedItem[] to legacy format for backward compatibility with web UI.
 */
export function toLegacyItems(items: ExtractedItem[]): LegacyExtractedItem[] {
  return items.map((item) => ({
    task: item.task,
    description: item.description,
    assigneeName: item.assigneeNames[0] || "",
    clientName: item.clientName,
    dueDate: item.dueDate,
    priority: item.priority,
    contextFromTranscript: item.sourceContext || "",
  }));
}
