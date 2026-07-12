import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3002", 10);

// --- ENVIRONMENT-AWARE CORS CONFIGURATION ---
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:3002"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS via Velox Security Architecture"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Core API structures
interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  service: string;
  budget: string;
  message: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'In Progress';
  date: string;
}

const leads: Lead[] = [
  {
    id: "lead-1",
    name: "Helena Vance",
    email: "h.vance@vanguard-labs.com",
    company: "Vanguard Laboratories",
    service: "Autonomous Intelligent Agents",
    budget: "$50k - $100k",
    message: "Seeking multi-agent workforce orchestration for biotech supply chain analysis.",
    status: "Qualified",
    date: new Date(Date.now() - 36 * 3600000).toISOString()
  }
];

// Lazy Gemini API initialization
let aiClient: any = null;
function getGenAIClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY is missing. Operating in simulation mode.");
      return null;
    }
    try {
      aiClient = new GoogleGenAI({ apiKey: key });
    } catch (err) {
      console.error("Failed to initialize GoogleGenAI client:", err);
      return null;
    }
  }
  return aiClient;
}

function getSimulatedReply(messages: any[]): string {
  const lastUserMessage = messages[messages.length - 1]?.content || "";
  const lastMsgLower = lastUserMessage.toLowerCase();

  if (lastMsgLower.includes("price") || lastMsgLower.includes("cost") || lastMsgLower.includes("budget")) {
    return "Our client engagements typically scale depending on project complexity:\n\n- **Websites**: $5,000+\n- **Applications**: $25,000+\n- **AI Solutions**: $50,000+";
  }
  return "Greetings! I am the **Velox Autonomous Concierge**. How can I assist you with your digital infrastructure today?";
}

// Gemini AI Chatbot Route
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array." });
    }

    const systemInstruction = `You are the chief AI concierge for Velox Solutions, an elite software house. Be hyper-professional and concise. Style with Markdown.`;

    const client = getGenAIClient();
    if (client) {
      const contents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      try {
        console.log("[VELOX AI] Running generation with gemini-2.5-flash...");
        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
          }
        });

        const replyText = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) return res.json({ response: replyText });
        return res.json({ response: getSimulatedReply(messages), simulated: true });

      } catch (primaryError: any) {
        console.warn("[VELOX AI] gemini-2.5-flash failed, trying fallback gemini-2.0-flash...", primaryError.message);

        try {
          const response = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
            }
          });
          const replyText = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) return res.json({ response: replyText, fallback: true });
          return res.json({ response: getSimulatedReply(messages), simulated: true, fallback: true });
        } catch (secondaryError: any) {
          console.error("[VELOX AI] All models failed:", secondaryError.message);
          return res.json({ response: getSimulatedReply(messages), simulated: true, error: secondaryError.message });
        }
      }
    } else {
      return res.json({ response: getSimulatedReply(messages), simulated: true });
    }
  } catch (error: any) {
    console.error("Global chat route exception:", error);
    return res.json({ response: getSimulatedReply(req.body?.messages || []), simulated: true, error: error.message });
  }
});

// Helper to send new leads to the Discord channel webhook gracefully
async function sendDiscordWebhook(lead: Lead) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("[DISCORD WEBHOOK] No webhook URL configured.");
    return;
  }

  try {
    let isPlanner = false;
    let displayMessage = lead.message || "No message provided.";
    let plannerSpecs = "";

    // --- FIX: Safely parse planner configuration if present ---
    if (lead.message && lead.message.includes("Interactive Planner Config:")) {
      isPlanner = true;
      const parts = lead.message.split("User outline: ");
      if (parts.length > 1) {
        plannerSpecs = (parts[0] ?? "").replace("Interactive Planner Config: ", "").trim();
        displayMessage = parts[1] ?? "No message provided.";
      }
    }

    const fields = [
      { name: "👤 Full Name", value: lead.name, inline: true },
      { name: "🏢 Company / Entity", value: lead.company, inline: true },
      { name: "📧 Corporate Email", value: lead.email, inline: true },
      { name: "🛠️ Service Target", value: lead.service, inline: true },
      { name: "💰 Budget Tier", value: lead.budget, inline: true },
      { name: "📡 Source Channel", value: isPlanner ? "Interactive Project Planner" : "AI Concierge Chatbot", inline: true }
    ];

    if (isPlanner && plannerSpecs) {
      fields.push({ name: "⚙️ Planner Parameters", value: plannerSpecs, inline: false });
    }

    fields.push({ name: "📝 Requirements / Message", value: displayMessage, inline: false });

    const embed = {
      title: "⚡ New Corporate Lead Registered",
      description: "A new client has submitted their technical requirements on the Velox Solutions platform.",
      color: 47359, // #00B8FF (Velox Sky Blue)
      fields: fields,
      timestamp: lead.date,
      footer: {
        text: "Velox Solutions • Autonomous Gateway logs",
        icon_url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/26a1.png"
      }
    };

    console.log(`[DISCORD WEBHOOK] Dispatching lead registration payload for: ${lead.name}...`);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      console.error(`[DISCORD WEBHOOK] Discord API returned error: ${response.status}`);
    } else {
      console.log("[DISCORD WEBHOOK] Dispatch succeeded.");
    }
  } catch (err: any) {
    console.error("[DISCORD WEBHOOK] Exception:", err.message || err);
  }
}

// Leads Collection API
app.post("/api/leads", (req, res) => {
  try {
    const { name, email, company, service, budget, message } = req.body;
    if (!name || !email || !company || !service) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      name, email, company, service,
      budget: budget || "Not specified",
      message: message || "No message provided.",
      status: 'New',
      date: new Date().toISOString()
    };

    leads.unshift(newLead);

    // Fire Discord webhook (non-blocking)
    sendDiscordWebhook(newLead);

    return res.status(201).json({ success: true, lead: newLead });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to log lead: " + error.message });
  }
});

app.get("/api/leads", (req, res) => {
  return res.json({ leads });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[VELOX SERVER] Vite middleware attached.");
    } catch (viteErr) {
      console.warn("[VELOX SERVER] Vite not available, running in API-only mode.", viteErr);
    }
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(distPath) && fs.existsSync(indexPath)) {
      // Full-stack mode: serve frontend static files
      app.use(express.static(distPath));
      app.get('/*', (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      // Backend-only mode: just serve the API
      console.log("No frontend build found. Running in API-only mode.");
      app.get('/', (req, res) => {
        res.json({ message: "Velox Solutions API is running.", status: "healthy" });
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VELOX SERVER] Dynamic engine operational at port: ${PORT}`);
  });
}



startServer().catch((err) => {
  console.error("Failed to start application server:", err);
});