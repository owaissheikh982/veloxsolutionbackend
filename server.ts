import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3002", 10);

app.use(cors({
  origin: process.env.FRONTEND_URL || "*"
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

// In-memory persistent data for the session
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
  },
  {
    id: "lead-2",
    name: "Marcus Thorne",
    email: "mthorne@apexfin.io",
    company: "Apex Finance",
    service: "Cognitive Data Systems",
    budget: "$100k+",
    message: "Need a secure, enterprise-grade hybrid RAG solution with advanced semantic search.",
    status: "New",
    date: new Date(Date.now() - 4 * 3600000).toISOString()
  }
];

// Lazy Gemini API initialization to prevent startup crashes if key is absent
let aiClient: GoogleGenAI | null = null;
function getGenAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY is not defined in environment. Chatbot will operate in dynamic simulation mode.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// --- API ENDPOINTS ---

// Helper to generate simulated concierge responses when the offline fallback is activated
function getSimulatedReply(messages: any[]): string {
  const lastUserMessage = messages[messages.length - 1]?.content || "";
  const lastMsgLower = lastUserMessage.toLowerCase();

  if (lastMsgLower.includes("price") || lastMsgLower.includes("cost") || lastMsgLower.includes("budget")) {
    return "Our client engagements typically scale depending on project complexity:\n\n- **Websites & Landing Pages**: $5,000 to $15,000+\n- **UI/UX Design & Consulting**: $8,000 to $20,000+\n- **Web & Mobile Applications**: $25,000 to $75,000+\n- **Bespoke Multi-Agent Lattices & Custom AI/Automation Solutions**: $50,000 to $150,000+\n\nWe would be glad to compile a formal specification sheet and provide a custom quote. I recommend submitting a **Lead Specification** in our sidebar or using our **Project Planner** on the Contact page.";
  } else if (lastMsgLower.includes("website") || lastMsgLower.includes("web development") || lastMsgLower.includes("landing")) {
    return "Velox architects **high-performance websites, landing pages, and customized web solutions**. Our front-end and back-end architectures are fully optimized for maximum speed, seamless responsive layouts, search engine optimization, and robust scalability. We couple clean design with modern frameworks (like React, Next.js, and Tailwind CSS).";
  } else if (lastMsgLower.includes("app") || lastMsgLower.includes("mobile") || lastMsgLower.includes("android") || lastMsgLower.includes("ios")) {
    return "We develop premium **Web & Mobile Applications** tailored to match your specific corporate operational requirements. From robust database state management and cloud-native serverless backends to highly polished, touch-optimized user interfaces on iOS and Android platforms, we handle the entire product lifecycle.";
  } else if (lastMsgLower.includes("agent") || lastMsgLower.includes("multi-agent") || lastMsgLower.includes("orchestr") || lastMsgLower.includes("automation") || lastMsgLower.includes("ai")) {
    return "Velox is a pioneer in **AI and Automation Solutions**. We architect stateful multi-agent systems using state-of-the-art frameworks like LangGraph, AutoGen, and CrewAI to replace manual work with autonomous coordination loops, task decomposition, and continuous self-correction.";
  } else if (lastMsgLower.includes("design") || lastMsgLower.includes("ui") || lastMsgLower.includes("ux")) {
    return "Our elite **UI/UX Design** department crafts highly sophisticated, responsive, and minimalist user experiences. We prioritize typographic precision, responsive spacing, fluid transitions, and clear information hierarchy to ensure maximum user engagement across all devices.";
  } else if (lastMsgLower.includes("integration") || lastMsgLower.includes("system") || lastMsgLower.includes("api")) {
    return "Our **System Integration** services unify legacy corporate systems, proprietary databases, and third-party SaaS platforms. We build secure, high-speed API connectors and custom middle-tier routing services to ensure seamless real-time data sync with zero service disruption.";
  } else if (lastMsgLower.includes("support") || lastMsgLower.includes("maintenance")) {
    return "We offer premium long-term **Maintenance and Support** packages. Our dedicated SLA guarantees fast response times, continuous server-side security patching, dynamic API updates, and performance monitoring to keep your software optimal round-the-clock.";
  } else if (lastMsgLower.includes("book") || lastMsgLower.includes("consult") || lastMsgLower.includes("hire") || lastMsgLower.includes("contact")) {
    return "Excellent decision. To request a technical deep-dive and book a consultation:\n\n1. Please use the **Live Lead Form** on our website.\n2. Leave your Name, Company, Email, and Service of interest.\n3. Our core engineering team will contact you within **4 business hours** with custom scheduling links.";
  } else {
    return "Greetings! I am the **Velox Autonomous Concierge**. I am here to guide you through our cutting-edge full-service software house offerings. \n\nHow can I assist you with your digital infrastructure today?\n\n- **Website Development** (Landing Pages & Business Sites)\n- **Web & Mobile Application Development**\n- **Custom Software Solutions**\n- **AI and Automation Solutions** (Multi-Agent & RAG)\n- **UI/UX Design**\n- **System Integration & Maintenance**";
  }
}

// Gemini AI Chatbot Route
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
    }

    const systemInstruction = `You are the chief AI concierge and agentic consultant for Velox Solutions, an elite software house and AI agency. Your personality is hyper-professional, sophisticated, visionary, yet pragmatic and deeply knowledgeable.

Velox Solutions' core capabilities and services cover the full range of software house offerings:
1. Website Development: Crafting simple business websites, high-conversion landing pages, and fully customized web solutions.
2. Web Application Development: Designing and developing complex, high-performance web applications.
3. Mobile Application Development: Engineering premium iOS and Android applications.
4. Custom Software Solutions: Creating bespoke software engineered to meet unique business challenges.
5. AI and Automation Solutions: Deploying autonomous intelligent agents, multi-agent lattices, cognitive data systems, and advanced enterprise automation.
6. UI/UX Design: Designing sophisticated, intuitive, and modern user interfaces and experiences.
7. System Integration: Unifying legacy architectures, custom APIs, and cloud services into integrated pipelines.
8. Maintenance and Support: Providing ongoing optimization, support, and service-level agreements.

Services we offer (for drop-down selection / project matching):
- 'Website Development' (Simple sites, landing pages, business web solutions)
- 'Web Application Development' (Complex corporate platforms)
- 'Mobile Application Development' (Native/cross-platform mobile apps)
- 'Custom Software Solutions' (Bespoke systems, automation workflows)
- 'AI and Automation Solutions' (Autonomous agents, vector search RAG)
- 'UI/UX Design' (Sophisticated visual layout, typography & spacing)
- 'System Integration' (Legacy structures, custom APIs, cloud syncing)
- 'Maintenance and Support' (Dedicated SLA, continuous updates)

Lead collection instructions:
If a user expresses interest in booking an appointment, starting a project, or hiring Velox Solutions, you should gracefully guide them to provide their:
- Full Name
- Corporate Email
- Company Name
- Service Interest
- Projected Timeline or Message

Keep responses structured, concise, and beautifully styled with Markdown. Bullet points and bold text are excellent. Avoid long paragraphs.`;

    const client = getGenAIClient();
    if (client) {
      // Map frontend format {role, content} to Gemini's expected format {role, parts}
      const contents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      try {
        console.log("[VELOX AI] Attempting chat generation with gemini-1.5-flash...");
        const response = await client.models.generateContent({
          model: "gemini-1.5-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
          }
        });
        return res.json({ response: response.text });
      } catch (primaryError: any) {
        console.warn("[VELOX AI] Primary model (gemini-1.5-flash) failed or high demand. Attempting fallback to gemini-1.5-flash-8b...", primaryError.message || primaryError);

        try {
          const response = await client.models.generateContent({
            model: "gemini-1.5-flash-8b",
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
            }
          });
          return res.json({ response: response.text, fallback: true });
        } catch (secondaryError: any) {
          console.error("[VELOX AI] Fallback model (gemini-1.5-flash-8b) also failed:", secondaryError.message || secondaryError);
          // If both models fail, gracefully fallback to simulated concierge reply
          const simulatedReply = getSimulatedReply(messages);
          return res.json({ response: simulatedReply, simulated: true, error: secondaryError.message });
        }
      }
    } else {
      // Offline/simulation fallback mode when API key is missing
      const simulatedReply = getSimulatedReply(messages);
      return res.json({ response: simulatedReply, simulated: true });
    }
  } catch (error: any) {
    console.error("Express /api/chat error:", error);
    try {
      const simulatedReply = getSimulatedReply(req.body?.messages || []);
      return res.json({ response: simulatedReply, simulated: true, error: error.message });
    } catch (innerError) {
      return res.status(500).json({ error: "Internal Server Error during chat generation: " + error.message });
    }
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

    if (lead.message && lead.message.includes("Interactive Planner Config:")) {
      isPlanner = true;
      const parts = lead.message.split("User outline: ");
      if (parts.length > 1) {
        plannerSpecs = (parts[0] ?? "").replace("Interactive Planner Config: ", "").trim();
        displayMessage = parts[1] ?? "No message provided.";
      }
    }

    const fields = [
      {
        name: "👤 Full Name",
        value: lead.name,
        inline: true
      },
      {
        name: "🏢 Company / Entity",
        value: lead.company,
        inline: true
      },
      {
        name: "📧 Corporate Email",
        value: lead.email,
        inline: true
      },
      {
        name: "🛠️ Service Target",
        value: lead.service,
        inline: true
      },
      {
        name: "💰 Budget Tier",
        value: lead.budget,
        inline: true
      },
      {
        name: "📡 Source Channel",
        value: isPlanner ? "Interactive Project Planner" : "AI Concierge Chatbot",
        inline: true
      }
    ];

    if (isPlanner && plannerSpecs) {
      fields.push({
        name: "⚙️ Planner Parameters",
        value: plannerSpecs,
        inline: false
      });
    }

    fields.push({
      name: "📝 Requirements / Message",
      value: displayMessage,
      inline: false
    });

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

    const payload = {
      embeds: [embed]
    };

    console.log(`[DISCORD WEBHOOK] Dispatching lead registration payload for: ${lead.name}...`);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`[DISCORD WEBHOOK] Discord API returned non-OK status: ${response.status} - ${responseText}`);
    } else {
      console.log("[DISCORD WEBHOOK] Dispatch succeeded.");
    }
  } catch (err: any) {
    console.error("[DISCORD WEBHOOK] Dispatch encountered a network or processing exception:", err.message || err);
  }
}

// Leads Collection API
app.post("/api/leads", (req, res) => {
  try {
    const { name, email, company, service, budget, message } = req.body;
    if (!name || !email || !company || !service) {
      return res.status(400).json({ error: "Missing required fields: name, email, company, and service are mandatory." });
    }

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      name,
      email,
      company,
      service,
      budget: budget || "Not specified",
      message: message || "No message provided.",
      status: 'New',
      date: new Date().toISOString()
    };

    leads.unshift(newLead);
    console.log(`[VELOX CRM] New lead logged: ${name} (${company}) - ${service}`);

    // Non-blocking asynchronous dispatch of Discord Webhook
    sendDiscordWebhook(newLead);

    return res.status(201).json({ success: true, lead: newLead });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to log lead: " + error.message });
  }
});

// Get logged leads
app.get("/api/leads", (req, res) => {
  return res.json({ leads });
});

// Live Infrastructure Telemetry API
app.get("/api/infrastructure", (req, res) => {
  const gpuCount = 8;
  const activeGpus = 6;

  return res.json({
    timestamp: new Date().toISOString(),
    latency: Math.floor(Math.random() * 25) + 118, // 118ms - 143ms
    cpuUsage: Math.floor(Math.random() * 12) + 38, // 38% - 50%
    memoryUsage: Math.floor(Math.random() * 4) + 64, // 64% - 68%
    activeAgents: Math.floor(Math.random() * 8) + 26, // 26 - 34 active runs
    totalTokensProcessed: 14209502 + Math.floor((Date.now() % 1000000) / 10),
    gpuTemperature: Math.floor(Math.random() * 6) + 64, // 64C - 70C
    networkThroughput: (1.2 + Math.random() * 0.4).toFixed(2) + " GB/s",
    services: [
      { name: "Cognitive Gateway", status: "Healthy", uptime: "99.99%" },
      { name: "Agentic Router (v2.4)", status: "Healthy", uptime: "99.97%" },
      { name: "Vector Index Store", status: "Active", uptime: "100.00%" },
      { name: "Model Quantizer Engine", status: "Idle", uptime: "99.91%" }
    ],
    clusterHealth: "Operational"
  });
});

// --- FRAMEWORK MIDDLEWARES / INTEGRATION ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.log("No frontend build found at 'dist'. Serving API only.");
      app.get('/', (req, res) => {
        res.json({ message: "Velox Solutions API is running." });
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VELOX SERVER] Running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Velox application server:", err);
});
