import express from "express";
import cors from "cors";
import { LMStudioClient } from "@lmstudio/sdk";
import { Chat } from "@lmstudio/sdk";
import multer from "multer";
import fs from "fs";
import { nodewhisper } from "nodejs-whisper";
import path from "path";
import os from "os";
import { exec } from "child_process";
import util from "util";
import { fileURLToPath } from "url";
import { dirname } from "path";
import e from "express";
const execAsync = util.promisify(exec);

const app = express();
const client = new LMStudioClient();
const model = await client.llm.model();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, "uploads"));
    },
    filename: (req, file, cb) => {
      cb(null, "audio.wav");
    },
  }),
});

const whisperCmd = `${path.resolve()}/whisper.cpp/build/bin/whisper-cli \
  -m ${path.resolve()}/whisper.cpp/models/ggml-large-v2.bin \
  -l de \
  ${path.resolve()}/uploads/audio.wav \
  > ${path.resolve()}/uploads/audio.wav.txt`;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

app.post("/chat", async (req, res) => {
  const { message, systemPrompt } = req.body;
  console.log(systemPrompt);
  console.log(message);

  const chat = Chat.empty();
  chat.append("system", systemPrompt);
  chat.append("user", message);

  try {
    res.setHeader("Content-Type", "application/json");

    const prediction = model.respond(chat, {
      onMessage: (message) => chat.append(message),
    });

    for await (const { content } of prediction) {
      console.log(content);
      res.write(content.replace(/"/g, '\\"')); // Escape quotes for JSON
    }
    res.end();
  } catch (error) {
    console.error(error);
    res.write(`{"error": "${error.message}"}`);
    res.end();
  }
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen." });
    }

    const uploadedFilePath = req.file.path; // path zu der hochgeladenen Datei
    console.log("Hochgeladene Datei:", uploadedFilePath);

    await execAsync(
      whisperCmd.replace(
        "${path.resolve()}/uploads/audio.wav",
        uploadedFilePath
      )
    );

    const transcriptPath = uploadedFilePath + ".txt";
    const transcript = fs.readFileSync(transcriptPath, "utf-8");

    let cleanText = transcript
      .replace(/\[.*? --> .*?\]/g, "") // Entferne Zeitstempel
      .replace(/\s+/g, " ") // Reduziere Whitespace auf Einzel-Leerzeichen
      .trim(); // Entferne führende/trailende Leerzeichen

    console.log("Transkkript:", cleanText);

    // 3) Antwort ans Frontend
    res.setHeader("Content-Type", "application/json");
    res.json({ transcript: cleanText });
  } catch (error) {
    console.error("Fehler bei der Transkription:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
