import { GoogleGenAI, Type } from "@google/genai";
import { Confidence } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeFoodImage(base64Image: string, mimeType: string) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `You are a professional nutritionist and food recognition AI.
Analyze the food in this image and return a detailed nutritional breakdown.
If the image does not contain food or is unclear, provide a clear error result.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          foodName: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: Object.values(Confidence) },
          portionSize: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          proteinG: { type: Type.NUMBER },
          fatG: { type: Type.NUMBER },
          carbohydratesG: { type: Type.NUMBER },
          sugarG: { type: Type.NUMBER },
          sodiumMg: { type: Type.NUMBER },
          fiberG: { type: Type.NUMBER },
          allergens: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          healthTip: { type: Type.STRING },
          error: { type: Type.STRING, description: "Only set if no food is detected" }
        },
        required: ["foodName", "calories", "confidence", "portionSize"]
      },
    },
  });

  try {
    const data = JSON.parse(response.text);
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
}
