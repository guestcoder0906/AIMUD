import { GoogleGenAI } from "@google/genai";
import { FileSystem } from "./fileSystem";
import { AIResponse, CheckDef } from "../types";

const SYSTEM_PROMPT = `You are the backend engine for an AI-MUD system. Your role is to:

1. Create and manage text files as the source of truth
2. Generate world content on-demand based on player perception
3. Verify actions against World Rules and Player stats
4. Calculate time costs and update global time
5. Manage status effects with expiration timestamps
6. Track unique object instances
7. Use hide[...] syntax for information not yet revealed to player
8. Update files dynamically and accurately
9. NEVER forget to create/update files for NPCs, items, locations, or any entities that appear

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that references these instructions and acts as the internal operating manual
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects
- Create "Player.txt" with DYNAMIC attributes specific to the character (health, energy, body parts relevant to their form, inventory, knowledge, etc.)
  * For a dog: nose sensitivity, tail status, paw health, etc.
  * For a human: hands, legs, stamina, etc.
  * For a robot: battery, circuits, sensors, etc.
  * NEVER use generic attributes that don't match the entity's nature
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting
  * Future setting: year 2076+
  * WW2 setting: 1940s
  * Medieval: appropriate historical year
  * Format: "HH:MM:SS AM/PM - Mon DD, YYYY"
- Create files for EVERY entity that appears: NPCs (including background NPCs like guards, townsfolk, crowds), items, locations
  * "KingsGuard_1.txt" gets displayName: "King's Guard"
  * "TownsPerson_5.txt" gets displayName: "John" (or their actual name)
- Use hide[...] for secrets/traps/hidden info in files - this content is completely hidden from player view
- Track unique instances: [ObjectType_ID(status)]
- Status effects: [Status:Type_ID(Expires: TIME)]
- Apply encumbrance effects realistically when inventory weight matters

FILE REFERENCE SYNTAX:
Use [DisplayName] or [FileName] in narrative text - these become clickable links to files
Examples: [Player], [King's Guard], [Iron Sword], [Old Church]

TIME SYSTEM:
- WorldTime.txt contains the CURRENT time/date/year, not elapsed time
- Calculate action duration and ADD to current time
- Update WorldTime.txt with new current time after each action
- Check and expire status effects against current time

UPDATE VALUES:
- Health changes: negative for damage, positive for healing
- Energy: negative when spent, positive for restored
- Time: always show the time cost in seconds (e.g., "+30s" for 30 second action)
- Inventory: "+1" when adding, "-1" when removing

CRITICAL: Before EVERY action, check:
1. Does this entity have a file? If not, CREATE it immediately
2. Is the Player.txt accurate for this specific character type?
3. Are status effects expired based on current WorldTime?
4. Does this action respect WorldRules physics/magic/tech?
5. Does player have required stats/items/energy?

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

If probability checks are required, return empty narrative and fill the "checks" array.
Set gameOver to true ONLY when player health/critical stat reaches 0.
For starting prompt, create initial world files with appropriate time/year and set the scene.`;

export class AIEngine {
  private fs: FileSystem;
  private ai: GoogleGenAI;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
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

      const prompt = `Current files:\n${context}\n\nPlayer action: ${action}\n\nProcess this action. If it requires rolls (probability/skill/luck), return "checks". If not, return "narrative" and updates.`;

      return await this.handleRequest(prompt);
    } catch (e) {
      console.error("Processing failed", e);
      return { narrative: "Error processing action." };
    }
  }

  private async handleRequest(userPrompt: string): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt);
    let data: AIResponse;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON Parse Error", e, responseText);
      // Attempt to clean markdown json blocks if present
      const match = responseText.match(/```json([\s\S]*?)```/);
      if (match) {
        try {
          data = JSON.parse(match[1]);
        } catch (e2) {
           return { narrative: "System Error: AI returned invalid JSON." };
        }
      } else {
        return { narrative: "System Error: AI returned invalid format." };
      }
    }

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

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Checks Completed]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the narrative and file updates. Include the Check Name and Result (e.g. "[Jump: Failure]") in the narrative, but do NOT state the raw roll numbers.`;

      // We make a fresh call with the context combined, as we don't maintain a full chat history object here 
      // (The FS is the history source of truth).
      responseText = await this.callAI(followUpPrompt);
      try {
        const match = responseText.match(/```json([\s\S]*?)```/);
        data = match ? JSON.parse(match[1]) : JSON.parse(responseText);
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { narrative: "Error processing check results." };
      }
    }

    this.processResponseData(data);
    return data;
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
    if (!data) return;
    
    if (data.files) {
      for (const [filename, fileData] of Object.entries(data.files)) {
        if (typeof fileData === 'string') {
          this.fs.write(filename, fileData);
        } else if (fileData && fileData.content) {
          this.fs.write(filename, fileData.content, fileData.displayName);
        }
      }
    }
  }

  private async callAI(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
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