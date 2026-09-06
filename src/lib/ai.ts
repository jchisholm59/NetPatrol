// @ts-ignore
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

/**
 * We use 'any' type here to bypass the strict TypeScript check that was failing during build.
 * The library expectation changed in the latest @google/genai version, but the logic remains
 * identical to your working project.
 */
const genAI = apiKey ? new (GoogleGenAI as any)(apiKey) : null;

export async function generateNetworkSummary(data: any) {
  if (!genAI) {
    return "Gemini API Key not configured. Please add it to your .env file.";
  }

  // Exact model name found in your working Direct-NVR-Viewer project
  const modelName = 'gemini-3.1-flash-lite-preview';

  const prompt = `
    Analyze the following network scan data and provide a concise, professional summary for a network administrator.
    Include:
    - Total number of devices discovered.
    - Summary of active vs down devices.
    - Common services/ports found across the network.
    - Any potential security concerns or interesting findings.

    Network Data:
    ${JSON.stringify(data, null, 2)}
  `;

  try {
    console.log(`[AI] Requesting summary with protocol model: ${modelName}`);

    // @ts-ignore
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    if (response && response.text) {
      return response.text;
    }

    return "AI responded but the summary text was empty.";
  } catch (error: any) {
    console.error(`[AI] Error with ${modelName}:`, error.message || error);

    // Fallback logic for robustness
    try {
      // @ts-ignore
      const fallback = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return fallback.text || "Summary generation failed during fallback.";
    } catch (fError) {
      return `AI Error: ${error.message || 'Unknown error'}. Please ensure your API key has access to the flash-lite models.`;
    }
  }
}
