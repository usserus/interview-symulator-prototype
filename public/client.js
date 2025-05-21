// Funktion zum Vorlesen des Textes
function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
}

window.onclick = function () {
  let btnSend = document.querySelector("#send");
  btnSend.onclick = sendMessage;
};

let uploadedCVText = "";
let uploadedCVName = "";
let uploadedJobText = "";
let uploadedJobName = "";

function uploadCV() {
  const fileInput = document.getElementById("CVInput");
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      uploadedCVText = event.target.result;
      uploadedCVName = file.name;
      document.getElementById(
        "cvFileName"
      ).textContent = `✅ Hochgeladen: ${file.name}`;
      alert("Lebenslauf erfolgreich hochgeladen!");
    };
    reader.readAsText(file);
  }
}

function uploadJob() {
  const fileInput = document.getElementById("JobInput");
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      uploadedJobText = event.target.result;
      uploadedJobName = file.name;
      document.getElementById(
        "jobFileName"
      ).textContent = `✅ Hochgeladen: ${file.name}`;
      alert("Stellenbeschreibung erfolgreich hochgeladen!");
    };
    reader.readAsText(file);
  }
}

async function printAnswer(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let receivedText = "";

  // Fügt die Antwort des Interviewers zum Chat hinzu
  document.getElementById("chat").innerHTML += `<b>Interviewer*in: </b>`;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    document.getElementById("chat").innerHTML += chunk;
    receivedText += chunk;
    console.log("Received chunk:", chunk);
  }
  console.log("Final response:", receivedText);

  // Text des Interviewers vorlesen
  speakText(receivedText); // Sprachausgabe hinzufügen
}

async function sendMessage() {
  const input = document.getElementById("userInput").value;
  document.getElementById("userInput").value = "";
  let systemPrompt =
    'Du bist ein Recruiter und ich bin ein Bewerbungskandidat. " +\n' +
    '    "Wir befinden uns in einem Bewerbungsgespräch. Reagiere nach jeder meiner Antworten auf meine Antwort wie ein Recruiter in einer echten Bewerbungssituation. " +\n' +
    '    "Reagiere auf die Antworten wie ein Recruiter, wenn es passend ist, kannst du noch  maximal 1 eigene Follow-up Frage " +\n' +
    '    "dazu zu stellen, das muss aber nicht bei jeder Frage passieren. Außerdem sollen die Follow-up Fragen sich jeweils" +\n' +
    '    " nur auf die gerade aktuelle Überfrage beziehen, nicht auf vorhergegangene Fragen." +\n' +
    '    "Reflektiere alle Antworten am Ende kritisch und gib mir für jede Frage einzeln Feedback, was gut daran war, " +\n' +
    '    "was schlecht war und was ich verbessern könnte.';

  if (uploadedCVText) {
    systemPrompt += `\n\nHier ist der Lebenslauf des*der Bewerber*in:\n${uploadedCVText}`;
  }

  if (uploadedJobText) {
    systemPrompt += `\n\nHier ist die Stellenbeschreibung, auf die Sich der*die Bewerber*in bewirbt:\n${uploadedJobText}`;
  }

  //systemPrompt += `\n\nKannst du mir bitte immer am Ende ein Feedback zu den Antworten des*der Bewerber*in geben! Kann kritisch reflektiert werden und die Relevanz der Informationen beschreiben. Gebe vor dem Feedback kurze Info, dass nun ein Feedback folgt!`;

  if (!input) return;

  document.getElementById(
    "chat"
  ).innerHTML += `<p><b>Bewerber*in:</b> ${input}</p>`;

  const response = await fetch("http://localhost:3001/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input, systemPrompt: systemPrompt }),
  });
  await printAnswer(response);
}

let mediaRecorder;
let recordedChunks = [];

let recorder;
let isRecording = false;

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  recorder = RecordRTC(stream, {
    type: "audio",
    mimeType: "audio/wav", // WICHTIG
    recorderType: RecordRTC.StereoAudioRecorder,
    desiredSampRate: 16000, // optional: passend zu Whisper
  });

  recorder.startRecording();
  isRecording = true;

  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;
}

function stopRecording() {
  if (!recorder || !isRecording) return;

  recorder.stopRecording(async () => {
    const audioBlob = recorder.getBlob();
    const audioURL = URL.createObjectURL(audioBlob);
    document.getElementById("audioPlayer").src = audioURL;

    await uploadAudioBlob(audioBlob);
  });

  isRecording = false;
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
}

async function uploadAudioBlob(blob) {
  const formData = new FormData();
  formData.append("audio", blob, "audio.wav");
  const controller = new AbortController();
  //const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    console.log("Sende Audio-Datei an den Server...");
    const res = await fetch("http://localhost:3001/transcribe", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    //clearTimeout(timeoutId);
    console.log("Antwort erhalten:", res);

    if (!res.ok) {
      throw new Error(`Serverantwort nicht erfolgreich: ${res.statusText}`);
    }

    const data = await res.json();
    console.log("Serverantwort:", data);

    if (data.transcript) {
      document.getElementById("userInput").value = data.transcript;
    } else {
      alert("Keine Transkription erhalten.");
    }
  } catch (err) {
    console.error("Fehler beim Upload:", err.message);
    alert(`Fehler: ${err.message}`);
  }
}

let recognition;
let isTranscribing = false;

function sendAnswerForTranscription() {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Spracherkennung wird von deinem Browser nicht unterstützt.");
    return;
  }

  if (isTranscribing) {
    recognition.stop();
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.lang = "de-DE";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isTranscribing = true;
    console.log("Spracherkennung gestartet...");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("userInput").value = transcript;
  };

  recognition.onerror = (event) => {
    console.error("Fehler bei der Spracherkennung:", event.error);
  };

  recognition.onend = () => {
    isTranscribing = false;
    console.log("Spracherkennung beendet.");
  };

  recognition.start();
}
