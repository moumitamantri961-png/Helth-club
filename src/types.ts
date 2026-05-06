export enum Confidence {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export interface FoodScan {
  id?: string;
  foodName: string;
  confidence: Confidence;
  portionSize: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbohydratesG: number;
  sugarG: number;
  sodiumMg: number;
  fiberG: number;
  allergens: string[];
  healthTip: string;
  imageUrl: string;
  timestamp: any; // Firestore Timestamp
  userId: string;
}

export enum Page {
  HOME = 'home',
  ANALYSIS = 'analysis',
  HISTORY = 'history',
  SETTINGS = 'settings'
}
