require("dotenv").config();
const axios = require("axios");

const VAPI_API_KEY = process.env.VAPI_API_KEY;

async function test() {
  console.log("Finding Telnyx Irish number...");

  const numbers = await axios.get("https://api.vapi.ai/phone-number", {
    headers: { "Authorization": "Bearer " + VAPI_API_KEY }
  });

  const telnyxIreland = numbers.data.find(n => n.number.startsWith("+353") && n.provider === "telnyx");

  if (!telnyxIreland) {
    console.log("No Telnyx Irish number found!");
    console.log("Irish numbers:", numbers.data.filter(n => n.number.startsWith("+353")).map(n => n.number + " (" + n.provider + ")"));
    return;
  }

  console.log("Found:", telnyxIreland.number, "ID:", telnyxIreland.id);
  console.log("Making call to +353838454183...");

  const call = await axios.post("https://api.vapi.ai/call/phone", {
    phoneNumberId: telnyxIreland.id,
    customer: { number: "+353838454183" },
    assistant: {
      firstMessage: "Hello! This is a test call from Telnyx Ireland. Outbound calling is working perfectly! Goodbye!",
      model: { provider: "openai", model: "gpt-4", messages: [{ role: "system", content: "Confirm the Telnyx Ireland test call works, then say goodbye." }] },
      voice: { provider: "11labs", voiceId: "josh" },
      maxDurationSeconds: 60
    }
  }, {
    headers: { "Authorization": "Bearer " + VAPI_API_KEY, "Content-Type": "application/json" }
  });

  console.log("Call ID:", call.data.id);
  console.log("Waiting for call to complete...");

  await new Promise(r => setTimeout(r, 25000));

  const status = await axios.get("https://api.vapi.ai/call/" + call.data.id, {
    headers: { "Authorization": "Bearer " + VAPI_API_KEY }
  });

  console.log("\nResult:");
  console.log("Status:", status.data.status);
  console.log("Reason:", status.data.endedReason || "SUCCESS - Call completed normally");
  if (status.data.transcript) {
    console.log("Transcript:", status.data.transcript.substring(0, 300));
  }
}

test().catch(e => console.error("Error:", e.response?.data || e.message));
