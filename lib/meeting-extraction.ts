import Anthropic from "@anthropic-ai/sdk";
import { getLangfuse, flushLangfuse } from "./langfuse";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExtractedItem {
  task: string;
  description: string;
  assigneeName: string;
  clientName: string;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  contextFromTranscript: string;
}

/**
 * Uses Claude to extract action items from a meeting transcript.
 * Fuzzy-matches transcript names against actual client/team member lists.
 */
export async function extractActionItems(
  transcript: string,
  teamMemberNames: string[],
  clientNames: string[],
  meetingWith: string
): Promise<{ items: ExtractedItem[]; summary: string }> {
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "meeting-extraction",
    metadata: { meetingWith },
  });

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const systemPrompt = `You are an assistant that extracts action items from meeting transcripts for a digital marketing agency.

CONTEXT:
- Today's date is: ${today}
- This is a weekly 1-on-1 meeting between a manager and a team member.
- The meeting was with: ${meetingWith}
- The team member names in this agency are: ${teamMemberNames.join(", ")}
- The client names in this agency are: ${clientNames.join(", ")}

YOUR TASK:
1. Read the transcript carefully
2. Extract every actionable item mentioned — things that need to be done, delivered, or followed up on
3. For each item, determine WHO is responsible, WHICH CLIENT it relates to, and WHEN it's due
4. IMPORTANT: The transcript may have misspelled or misheard names. Match them to the closest name from the lists above. For example "FitFuel mills" → "FitFuel Meals", "Black Bear" → "BlackBird Security". Common voice-to-text mistakes: "Choker" = "Choquer" (the agency name)
5. If no client is mentioned for an item, set clientName to "Internal"
6. If no due date is mentioned, set dueDate to null
7. Include a brief excerpt from the transcript as context for each item

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "items": [
    {
      "task": "Short actionable title (imperative form)",
      "description": "What needs to be done, including any relevant details from the meeting",
      "assigneeName": "Exact name from the team member list",
      "clientName": "Exact name from the client list, or Internal",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "low|normal|high|urgent",
      "contextFromTranscript": "Relevant quote or paraphrase from the meeting"
    }
  ]
}

RULES:
- Use the EXACT names from the provided lists, never the misspelled transcript versions
- Every checkbox-worthy action item should be its own entry
- Set priority based on urgency cues: "urgent" for same-day/critical, "high" for this-week/important, "normal" for standard work, "low" for nice-to-have
- Keep task titles concise and actionable (start with a verb)
- The description should include enough context that someone reading only the ticket would understand what to do
- Include the transcript context so the manager can reference what was actually said
- CRITICAL: Today's date is ${today}. All dates MUST be relative to today. "Today" = ${today}, "tomorrow" = the next day, "Wednesday" = the upcoming Wednesday, "end of week" = this Friday. NEVER output dates in the past or in the wrong year. The current year is ${today.slice(0, 4)}.`;

  const generation = trace?.generation({
    name: "extract-action-items",
    model: "claude-sonnet-4-20250514",
    input: { transcript: transcript.slice(0, 500) + "..." },
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the meeting transcript:\n\n${transcript}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    generation?.end({ output: text.slice(0, 500) + "..." });

    // Parse JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as { summary: string; items: ExtractedItem[] };

    await flushLangfuse();

    return {
      summary: parsed.summary || "",
      items: parsed.items || [],
    };
  } catch (error) {
    generation?.end({ output: String(error), level: "ERROR" });
    await flushLangfuse();
    throw error;
  }
}
