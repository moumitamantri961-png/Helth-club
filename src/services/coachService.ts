import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateBodyPlan(profile: Partial<UserProfile>) {
  const model = "gemini-3.1-pro-preview";
  
  // Real formulas
  const weight = Number(profile.weight) || 70;
  const height = Number(profile.height) || 170;
  const age = Number(profile.age) || 25;
  const isMale = profile.gender === 'Male';
  const activityMap: Record<string, number> = {
    'Sedentary': 1.2,
    'Lightly Active': 1.375,
    'Moderately Active': 1.55,
    'Very Active': 1.725,
    'Extra Active': 1.9
  };
  const activityMultiplier = activityMap[profile.activityLevel || 'Sedentary'] || 1.2;

  // BMR (Mifflin-St Jeor Equation)
  let bmr = (10 * weight) + (6.25 * height) - (5 * age);
  bmr = isMale ? bmr + 5 : bmr - 161;

  const tdee = bmr * activityMultiplier;
  const bmi = weight / ((height / 100) ** 2);

  const prompt = `Act as an expert AI Body Coach. 
 Based on this user profile: ${JSON.stringify(profile)}, 
 Calculated Metrics: BMI: ${bmi.toFixed(2)}, BMR: ${bmr.toFixed(0)}, TDEE: ${tdee.toFixed(0)}.
 Generate a comprehensive nutrition and workout strategy.
 Use Indian food options predominantly.
 Return the response in JSON format.
 Include:
 - dailyCalorieGoal (Based on TDEE and goal: ${profile.goal})
 - dailyProteinGoal (Target higher for muscle gain)
 - dailyCarbsGoal
 - dailyFatGoal
 - dailyWaterGoal
 - bmi: ${bmi.toFixed(2)}
 - bmr: ${bmr.toFixed(0)}
 - tdee: ${tdee.toFixed(0)}
 - recommendedMeals (Breakfast, Lunch, Snacks, Pre-workout, Post-workout, Dinner)
 - Each meal must include: name, calories, protein, carbs, fat, portion, ingredients, and alternatives.
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
          bmi: { type: Type.NUMBER },
          bmr: { type: Type.NUMBER },
          tdee: { type: Type.NUMBER },
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
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                alternatives: { type: Type.STRING }
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
  { id: '2', field: 'age', question: "What is your current age?", type: 'number', unit: 'years' },
  { id: '3', field: 'gender', question: "What is your gender?", type: 'select', options: ['Male', 'Female', 'Other'] },
  { id: '4', field: 'height', question: "What is your current height (cm)?", type: 'number', unit: 'cm' },
  { id: '5', field: 'weight', question: "What is your current weight (kg)?", type: 'number', unit: 'kg' },
  { id: '6', field: 'activityLevel', question: "How would you describe your activity level?", type: 'select', options: ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'] },
  { id: '7', field: 'workoutsPerWeek', question: "How many workouts do you plan to do per week?", type: 'slider', min: 0, max: 7 },
  { id: '8', field: 'dietType', question: "Are you vegetarian or non-vegetarian?", type: 'select', options: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Eggitarian'] },
  { id: '9', field: 'allergies', question: "Do you have any food allergies?", type: 'text' },
  { id: '10', field: 'budget', question: "What is your budget level for food?", type: 'select', options: ['Low Budget', 'Medium Budget', 'High Budget'] },
  { id: '11', field: 'location', question: "Which country or city are you located in?", type: 'text' },
  { id: '12', field: 'sleepDuration', question: "How many hours of sleep do you get daily?", type: 'number', unit: 'hours' },
  { id: '13', field: 'injuries', question: "Do you have any current or past injuries?", type: 'text' },
  { id: '14', field: 'medicalRestrictions', question: "Any medical restrictions I should know about?", type: 'text' },
  { id: '15', field: 'dailySchedule', question: "Briefly describe your daily work/life schedule.", type: 'text' },
];
