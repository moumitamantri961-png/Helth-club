import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateBodyPlan(profile: Partial<UserProfile>) {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `Act as an expert AI Body Coach. 
Based on this user profile: ${JSON.stringify(profile)}, 
generate a comprehensive nutrition and workout strategy.
Return the response in JSON format.
Include:
- dailyCalorieGoal
- dailyProteinGoal
- dailyCarbsGoal
- dailyFatGoal
- dailyWaterGoal
- recommendedMeals (Breakfast, Lunch, Dinner, Snack, Pre-workout, Post-workout)
- healthTip`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dailyCalorieGoal: { type: Type.NUMBER },
          dailyProteinGoal: { type: Type.NUMBER },
          dailyCarbsGoal: { type: Type.NUMBER },
          dailyFatGoal: { type: Type.NUMBER },
          dailyWaterGoal: { type: Type.NUMBER },
          recommendedMeals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                name: { type: Type.STRING },
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
                portion: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["type", "name", "calories"]
            }
          },
          healthTip: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text);
}

export async function chatWithCoach(profile: UserProfile, history: {role: 'coach' | 'user', message: string}[], message: string) {
  const model = "gemini-3.1-pro-preview";
  
  const chatHistory = history.map(h => ({
    role: h.role === 'coach' ? 'model' : 'user',
    parts: [{ text: h.message }]
  }));

  // Add the current message to history
  chatHistory.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const response = await ai.models.generateContent({
    model,
    contents: chatHistory,
    config: {
      systemInstruction: `Act as an expert AI Body Coach. 
    User Profile: ${JSON.stringify(profile)}
    Your goal is to guide the user on their fitness journey. 
    Be supportive, scientific, and practical. 
    Answer questions about food replacements, skipped meals, budget options, etc.
    Keep answers concise and actionable.`
    }
  });

  return response.text || "I'm sorry, I couldn't generate a response.";
}

export type CoachQuestion = {
  id: string;
  field: keyof UserProfile;
  question: string;
  type: 'text' | 'number' | 'select' | 'slider';
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
};

export const COACH_QUESTIONS: CoachQuestion[] = [
  { id: '1', field: 'goal', question: "What is your main fitness goal?", type: 'select', options: ['Gain muscle', 'Lose fat', 'Weight gain', 'Weight loss', 'Athletic performance', 'General health'] },
  { id: '2', field: 'age', question: "How old are you?", type: 'number', unit: 'years' },
  { id: '3', field: 'gender', question: "What is your gender?", type: 'select', options: ['Male', 'Female', 'Other'] },
  { id: '4', field: 'height', question: "What is your height?", type: 'number', unit: 'cm' },
  { id: '5', field: 'weight', question: "Current weight?", type: 'number', unit: 'kg' },
  { id: '6', field: 'activityLevel', question: "Activity level?", type: 'select', options: ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'] },
  { id: '7', field: 'workoutsPerWeek', question: "Workouts per week?", type: 'slider', min: 0, max: 7 },
  { id: '8', field: 'dietType', question: "Dietary preference?", type: 'select', options: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Eggitarian'] },
  { id: '9', field: 'budget', question: "Budget level?", type: 'select', options: ['Low', 'Medium', 'High'] },
  { id: '10', field: 'location', question: "Where are you located?", type: 'text' },
  { id: '11', field: 'sleepDuration', question: "Average sleep duration?", type: 'number', unit: 'hours' },
];
