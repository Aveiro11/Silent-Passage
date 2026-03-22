import { LANG_ENDPOINT, LANG_KEY, LANG_PROJECT, LANG_DEPLOYMENT } from "./azure";

export async function detectIntent(text: string): Promise<string | null> {
  const url = `${LANG_ENDPOINT}/language/:analyze-conversations?api-version=2023-04-01`;

  const body = {
    kind: "Conversation",
    analysisInput: {
      conversationItem: {
        id: "1",
        text: text,
        language: "en",
        participantId: "user"
      }
    },
    parameters: {
      projectName: LANG_PROJECT,
      deploymentName: LANG_DEPLOYMENT
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": LANG_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error("NLU call failed", await res.text());
    return null;
  }

  const data = await res.json();

  const tryPaths = [
    () => data?.result?.prediction?.topIntent,
    () => data?.results?.[0]?.result?.prediction?.topIntent,
    () => data?.analysisResults?.[0]?.conversationResults?.[0]?.prediction?.topIntent,
    () => data?.results?.predictions?.[0]?.topClass,
    () => data?.prediction?.topIntent
  ];

  for (const p of tryPaths) {
    const v = p();
    if (v) return String(v);
  }

  try {
    const alt = data?.analysisResults?.[0]?.conversationResult?.prediction?.topIntent;
    if (alt) return String(alt);
  } catch (e) { /* ignore */ }

  return null;
}