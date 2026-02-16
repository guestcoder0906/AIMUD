import { GoogleGenAI } from "@google/genai";
import { FileSystem } from "./fileSystem";
import { AIResponse, CheckDef } from "../types";

const SYSTEM_PROMPT = `You are the backend engine for an AI-MUD system. Your role is to:

1. Create and manage text files as the source of truth. Every entity mentioned in narrative [References] MUST have a corresponding file created or updated in the 'files' object.
2. Generate world content on-demand based on player perception.
3. Verify actions against World Rules and Player stats.
4. Calculate time costs and update global time.
5. Manage status effects with expiration timestamps.
6. Track unique object instances.
7. Use hide[...] syntax for information not yet revealed to player.
8. Update files dynamically and accurately.
9. MANDATORY: Every single [Reference] mentioned in your 'narrative' MUST have a corresponding entry in the 'files' object if it is new or updated. If you mention a person, place, or item for the first time, you MUST create a .txt file for it in the same response.

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that references these instructions and acts as the internal operating manual.
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects.
- Create "Player.txt" with DYNAMIC attributes specific to the character.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting.
- Create files for EVERY entity that appears: NPCs, items, locations.
- Use hide[...] for secrets/traps/hidden info in files.
- Track unique instances: [ObjectType_ID(status)].
- Status effects: [Status:Type_ID(Expires: TIME)].

FILE REFERENCE SYNTAX:
Use [DisplayName] or [FileName] in narrative text - these become clickable links to files.

TIME SYSTEM:
- WorldTime.txt contains the CURRENT time/date/year.
- Calculate action duration and ADD to current time.
- Update WorldTime.txt with new current time after each action.

RESPONSE FORMAT:
Respond with JSON only:
{
  "narrative": "Story text with [DisplayName] references for all entities/items/locations",
  "updates": [
    {"type": "stat", "text": "Health -10", "value": -10},
    {"type": "item", "text": "Added Iron Key", "value": 1},
    {"type": "time", "text": "+30s", "value": 30}
  ],
  "files": {
    "filename.txt": {"content": "file content with hide[secrets]", "displayName": "Display Name"}
  },
  "gameOver": false,
  "checks": [] 
}

If probability checks are required, return empty narrative and fill the "checks" array. You can still provide initial file updates in this step if needed.
Set gameOver to true ONLY when player health/critical stat reaches 0.`;

export class AIEngine {
  private fs: FileSystem;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
  }

  async initialize(startingPrompt: string): Promise<AIResponse | null> {
    try {
      const prompt = `Initialize world: ${startingPrompt}`;
      return await this.handleRequest(prompt);
    } catch (e) {
      console.error("Initialization failed", e);
      return { narrative: "System initialization failed. Please check API Key." };
    }
  }

  async processAction(action: string): Promise<AIResponse | null> {
    try {
      const files = this.fs.getAll();
      const context = Object.entries(files)
        .map(([name, content]) => `=== ${name} ===\n${content}`)
        .join('\n\n');

      const prompt = `Current files:\n${context}\n\nPlayer action: ${action}\n\nProcess this action. If it requires rolls (probability/skill/luck), return "checks". If not, return "narrative" and updates. Ensure all referenced entities have files.`;

      return await this.handleRequest(prompt);
    } catch (e) {
      console.error("Processing failed", e);
      return { narrative: "Error processing action." };
    }
  }

  private async handleRequest(userPrompt: string): Promise<AIResponse | null> {
    const finalResponse: AIResponse = {
      narrative: "",
      updates: [],
      files: {},
      gameOver: false
    };

    const processStep = (stepData: AIResponse) => {
      if (stepData.narrative) finalResponse.narrative = stepData.narrative;
      if (stepData.updates) {
        finalResponse.updates = [...(finalResponse.updates || []), ...stepData.updates];
      }
      if (stepData.files) {
        finalResponse.files = { ...finalResponse.files, ...stepData.files };
        // Write to filesystem immediately so it's ready for the next step or for the UI
        this.processResponseData(stepData);
      }
      if (stepData.gameOver) finalResponse.gameOver = true;
    };

    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt);
    let data: AIResponse;

    try {
      data = this.parseAIResponse(responseText);
    } catch (e) {
      return { narrative: "System Error: AI returned invalid format." };
    }

    processStep(data);

    // Phase 2: If checks are required
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0) {
      const results = data.checks.map(check => {
        const roll = Math.floor(Math.random() * 1001);
        const outcome = this.determineOutcome(roll, check.thresholds);
        return {
          name: check.name,
          description: check.description,
          outcome: outcome,
          roll: roll,
          thresholds: check.thresholds
        };
      });

      const resultReport = results.map(r => 
        `Check: ${r.name}\nReason: ${r.description}\nRoll: ${r.roll} / 1000\nThresholds: ${JSON.stringify(r.thresholds)}\nRESULT: ${r.outcome}`
      ).join('\n\n');

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Checks Completed]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the narrative and file updates. Include the Check Name and Result (e.g. "[Jump: Failure]") in the narrative. IMPORTANT: Ensure ALL entities mentioned in your narrative have their files created or updated in the 'files' object.`;

      const secondResponseText = await this.callAI(followUpPrompt);
      try {
        const secondData = this.parseAIResponse(secondResponseText);
        processStep(secondData);
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { ...finalResponse, narrative: finalResponse.narrative + "\n[Error processing check results.]" };
      }
    }

    return finalResponse;
  }

  private parseAIResponse(text: string): AIResponse {
    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/```json([\s\S]*?)```/);
      if (match) return JSON.parse(match[1]);
      throw new Error("Invalid JSON format");
    }
  }

  private determineOutcome(roll: number, thresholds: { [outcome: string]: number }): string {
    const sorted = Object.entries(thresholds)
      .sort(([, valA], [, valB]) => valB - valA);
    
    for (const [outcome, minVal] of sorted) {
      if (roll >= minVal) return outcome;
    }
    return "Failure";
  }

  private processResponseData(data: AIResponse) {
    if (!data || !data.files) return;
    for (const [filename, fileData] of Object.entries(data.files)) {
      if (typeof fileData === 'string') {
        this.fs.write(filename, fileData);
      } else if (fileData && fileData.content) {
        this.fs.write(filename, fileData.content, fileData.displayName);
      }
    }
  }

  private async callAI(prompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });
      return response.text || "{}";
    } catch (e) {
      console.error("Gemini API Call Failed", e);
      throw e;
    }
  }
}