/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, cloneElement } from 'react';
import { 
  Camera, 
  History, 
  Settings as SettingsIcon, 
  Upload, 
  Trash2, 
  ChevronRight, 
  Loader2, 
  LogOut,
  Flame,
  Dna,
  Droplets,
  Beef,
  Sparkles,
  MessageSquare,
  Utensils,
  Calendar,
  Activity,
  Award,
  Bell,
  Search,
  ChevronLeft,
  ArrowRight,
  Plus,
  TrendingUp,
  Volume2,
  VolumeX,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  Timestamp,
  getDoc,
  limit,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, signOut, handleRedirectResult } from './lib/firebase';

// Test Firestore connection on boot
const testConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Firestore is unreachable.");
    }
  }
};
testConnection();

import { analyzeFoodImage } from './services/geminiService';
import { generateBodyPlan, COACH_QUESTIONS, CoachQuestion, chatWithCoach } from './services/coachService';
import { Confidence, FoodScan, Page, UserProfile, WaterLog, MealPlan } from './types';
import { cn, formatTimestamp } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { AiPromptBox } from './components/ui/ai-prompt-box';
import { QuickActionSheet } from './components/QuickActionSheet';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [scans, setScans] = useState<FoodScan[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [progressLogs, setProgressLogs] = useState<{weight: number, timestamp: any}[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(1);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FoodScan | null>(null);
  const [proactiveAdvice, setProactiveAdvice] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('voiceEnabled') !== 'false');

  useEffect(() => {
    localStorage.setItem('voiceEnabled', String(voiceEnabled));
  }, [voiceEnabled]);
  
  // Coach Chat State
  const [coachStep, setCoachStep] = useState(0);
  const [coachChat, setCoachChat] = useState<{role: 'coach' | 'user', message: string}[]>([
    {role: 'coach', message: "Hi! I'm your AI Body Coach. Let's build your transformation plan. Ready?"}
  ]);
  const [onboardingData, setOnboardingData] = useState<Partial<UserProfile>>({});
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'warn'} | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [speakingMessage, setSpeakingMessage] = useState<number | null>(null);

  const speakMessage = (text: string, index: number) => {
    if (speakingMessage === index) {
      window.speechSynthesis.cancel();
      setSpeakingMessage(null);
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to detect language or just default to en-US/bn-BD
    // A simple regex for Bengali characters range: \u0980-\u09FF
    if (/[\u0980-\u09FF]/.test(text)) {
      utterance.lang = 'bn-BD';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onend = () => setSpeakingMessage(null);
    utterance.onerror = () => setSpeakingMessage(null);
    
    setSpeakingMessage(index);
    window.speechSynthesis.speak(utterance);
  };

  const speakLastCoachMessage = (messages: {role: string, message: string}[]) => {
    if (!voiceEnabled) return;
    const coachMessages = messages.filter(m => m.role === 'coach');
    if (coachMessages.length > 0) {
      const lastMsg = coachMessages[coachMessages.length - 1];
      speakMessage(lastMsg.message, messages.indexOf(lastMsg));
    }
  };

  useEffect(() => {
    const handleFocus = () => setIsKeyboardVisible(true);
    const handleBlur = () => setIsKeyboardVisible(false);
    window.addEventListener('focusin', handleFocus);
    window.addEventListener('focusout', handleBlur);
    return () => {
      window.removeEventListener('focusin', handleFocus);
      window.removeEventListener('focusout', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [coachChat]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    console.log("Auth initialized, watching state...");
    
    // Check for redirect result on boot
    const checkRedirect = async () => {
       try {
          const result = await handleRedirectResult();
          if (result?.user) {
             console.log("Redirect sign-in successful:", result.user.email);
          }
       } catch (error) {
          console.error("Redirect sign-in error:", error);
       }
    };
    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      console.log("Auth state change detected. User:", u?.email || "null");
      
      if (u) {
        setLoading(true);
        try {
          console.log("Fetching profile for UID:", u.uid);
          const profileDoc = await getDoc(doc(db, 'users', u.uid));
          if (profileDoc.exists()) {
            const pData = profileDoc.data() as UserProfile;
            console.log("Profile found:", pData.displayName);
            setProfile(pData);
            if (pData.onboardingComplete) {
              console.log("Profile verified, entering dashboard.");
              setCurrentPage(Page.HOME);
            } else {
              console.log("Onboarding incomplete, navigating to onboarding.");
              setCurrentPage(Page.ONBOARDING);
            }
          } else {
            console.warn("Profile document does not exist for existing user.");
            setCurrentPage(Page.ONBOARDING);
          }
        } catch (error) {
          console.error("Critical error fetching user profile:", error);
          setToast({ message: "Profile sync failed. Check your connection.", type: 'warn' });
          // If we can't fetch profile, we shouldn't necessarily block entry if it's a temp network error,
          // but we need the profile for most things.
        }
        setUser(u);
      } else {
        console.log("No user session. Resetting state.");
        setUser(null);
        setProfile(null);
        // Do not force HOME here if we want to remember where they were, 
        // but for safety during login screen it's fine.
        setCurrentPage(Page.HOME);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: any;
    if (currentPage === Page.COACH) {
      setIsImmersive(false);
      timer = setTimeout(() => setIsImmersive(true), 5000);
    } else {
      setIsImmersive(false);
    }
    return () => clearTimeout(timer);
  }, [currentPage]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', systemTheme);
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const caloriesToday = scans.reduce((acc, s) => {
    const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + s.calories;
    return acc;
  }, 0);

  const waterToday = waterLogs.reduce((acc, w) => {
    const d = w.timestamp?.toDate ? w.timestamp.toDate() : new Date(w.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + w.amountMl;
    return acc;
  }, 0);

  const proteinToday = scans.reduce((acc, s) => {
    const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    if (d.toDateString() === new Date().toDateString()) return acc + s.proteinG;
    return acc;
  }, 0);

  // Proactive Coaching Logic
  useEffect(() => {
    if (!profile || scans.length < 3) return;
    
    const recentScans = scans.slice(0, 5);
    const lowProteinCount = recentScans.filter(s => s.proteinG < 10).length;
    const highSugarCount = recentScans.filter(s => s.sugarG > 15).length;
    
    if (lowProteinCount >= 3) {
      setProactiveAdvice("Your protein intake seems low in your recent meals. Try adding some paneer or chicken! 🍗");
    } else if (highSugarCount >= 2) {
      setProactiveAdvice("Detected high sugar in multiple meals lately. Watching your glucose is key for your goal! 🍫");
    } else if (waterToday < (profile.dailyWaterGoal * 0.4)) {
      setProactiveAdvice("You're behind on hydration today. Grab a glass of water now! 💧");
    } else {
      setProactiveAdvice(null);
    }
  }, [scans, waterToday, profile]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch user profile
    const fetchProfile = async () => {
      const pDoc = await getDoc(doc(db, 'users', user.uid));
      if (pDoc.exists()) setProfile(pDoc.data() as UserProfile);
    };
    fetchProfile();

    // Scans listener
    const scansQ = query(
      collection(db, 'scans'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unscans = onSnapshot(scansQ, (snapshot) => {
      setScans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodScan)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'scans'));

    // Meal Plan listener
    const mealQ = query(
      collection(db, 'mealPlans'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unmeal = onSnapshot(mealQ, (snapshot) => {
      if (!snapshot.empty) {
        setMealPlan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MealPlan);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mealPlans'));

    const waterQ = query(
      collection(db, 'water'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unwater = onSnapshot(waterQ, (snapshot) => {
      setWaterLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterLog)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'water'));

    // Progress listener
    const progressQ = query(
      collection(db, 'progress'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unprogress = onSnapshot(progressQ, (snapshot) => {
      setProgressLogs(snapshot.docs.map(doc => doc.data() as any));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'progress'));

    // Chat listener
    const chatQ = query(
      collection(db, 'coach_chats'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unchat = onSnapshot(chatQ, (snapshot) => {
      if (!snapshot.empty) {
        const newChat = snapshot.docs.map(doc => doc.data() as any);
        setCoachChat(newChat);
        // Automatic TTS if enabled and last message is from coach
        if (newChat.length > 0 && newChat[newChat.length - 1].role === 'coach') {
          // Check if this is a new message to avoid repeat on every snapshot
          // Actually snapshots trigger on every change, better to check if we already spoke this
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'coach_chats'));

    return () => {
      unscans();
      unwater();
      unprogress();
      unmeal();
      unchat();
    };
  }, [user]);

  const handleCoachResponse = async (field: keyof UserProfile, value: any) => {
    const newData = { ...onboardingData, [field]: value };
    setOnboardingData(newData);
    const userMsg = { role: 'user' as const, message: String(value), timestamp: serverTimestamp(), userId: user!.uid };
    setCoachChat(prev => [...prev, userMsg]);
    try {
      await addDoc(collection(db, 'coach_chats'), userMsg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
    }
    
    if (coachStep < COACH_QUESTIONS.length - 1) {
      setCoachStep(prev => prev + 1);
      setTimeout(async () => {
        const nextQ = COACH_QUESTIONS[coachStep + 1].question;
        const coachMsg = { role: 'coach' as const, message: nextQ, timestamp: serverTimestamp(), userId: user!.uid };
        setCoachChat(prev => [...prev, coachMsg]);
        try {
          await addDoc(collection(db, 'coach_chats'), coachMsg);
          if (voiceEnabled) speakMessage(nextQ, coachChat.length + 1);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
        }
      }, 300);
    } else if (!profile?.coachOnboardingComplete) {
      // All questions finished, generate plan
      setIsGeneratingPlan(true);
      const startMsg = "Genius! Generating your personalized body transformation plan now...";
      setCoachChat(prev => [...prev, { role: 'coach', message: startMsg }]);
      if (voiceEnabled) speakMessage(startMsg, coachChat.length);
      
      try {
        const plan = await generateBodyPlan(newData);
        const fullProfile = {
          ...newData,
          uid: user!.uid,
          displayName: user!.displayName || 'Elite Athlete',
          onboardingComplete: true,
          coachOnboardingComplete: true,
          dailyCalorieGoal: plan.dailyCalorieGoal,
          dailyProteinGoal: plan.dailyProteinGoal,
          dailyCarbsGoal: plan.dailyCarbsGoal,
          dailyFatGoal: plan.dailyFatGoal,
          dailyWaterGoal: plan.dailyWaterGoal,
          isPremium: true
        };
        try {
          await setDoc(doc(db, 'users', user!.uid), fullProfile);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user!.uid}`);
        }
        try {
          await addDoc(collection(db, 'mealPlans'), {
            userId: user!.uid,
            meals: plan.recommendedMeals,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'mealPlans');
        }
        setProfile(fullProfile as UserProfile);
        
        const finalMsg = `Fantastic! Your plan is calculation-ready:
- BMI: ${plan.bmi}
- BMR: ${plan.bmr} kcal
- TDEE: ${plan.tdee} kcal

Check your dashboard for the full plan!`;
        setCoachChat(prev => [...prev, { role: 'coach', message: finalMsg }]);
        if (voiceEnabled) speakMessage(finalMsg, coachChat.length + 1);
        setToast({ message: "Body Transformation Plan Generated! 🔥", type: 'success' });
      } catch (err) {
        console.error("Onboarding Generation/Save Failed:", err);
        const errorMsg = "I hit a snag calculating your elite plan. This usually happens if your connection is unstable or your goal isn't supported. Can we try finishing this plan again?";
        setCoachChat(prev => [...prev, { role: 'coach', message: errorMsg }]);
        setToast({ message: "Plan generation failed. Please try again.", type: 'warn' });
      } finally {
        setIsGeneratingPlan(false);
      }
    }
  };

  const sendContinuousChatMessage = async (message: string, files?: File[]) => {
    if ((!message.trim() && (!files || files.length === 0)) || !profile) return;
    
    let fullMessage = message;
    let attachedScan: FoodScan | null = null;

    if (files && files.length > 0) {
      setIsGeneratingPlan(true);
      try {
        const file = files[0];
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        const analysis = await analyzeFoodImage(base64, file.type);
        attachedScan = {
          ...analysis,
          imageUrl: `data:${file.type};base64,${base64}`,
          timestamp: serverTimestamp(),
          userId: user!.uid
        } as FoodScan;
        await addDoc(collection(db, 'scans'), attachedScan);
        fullMessage = `${message}\n\n[Matched Meal: ${analysis.foodName}, ${analysis.calories} kcal]`;
      } catch (err) {
        console.error("Chat Image Analysis Failed:", err);
      }
    }

    const userMsg = { role: 'user' as const, message: fullMessage, timestamp: serverTimestamp(), userId: user!.uid };
    setCoachChat(prev => [...prev, userMsg]);
    try {
      await addDoc(collection(db, 'coach_chats'), userMsg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
    }
    
    setIsGeneratingPlan(true);
    try {
      const response = await chatWithCoach(profile, coachChat, fullMessage);
      const coachMsg = { role: 'coach' as const, message: response, timestamp: serverTimestamp(), userId: user!.uid };
      setCoachChat(prev => [...prev, coachMsg]);
      try {
        const docRef = await addDoc(collection(db, 'coach_chats'), coachMsg);
        // Speak automatically
        if (voiceEnabled) {
          speakMessage(response, coachChat.length + 1);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'coach_chats');
      }
    } catch (err) {
      console.error(err);
      setCoachChat(prev => [...prev, { role: 'coach', message: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const saveOnboarding = async () => {
    if (!user) return;
    const fullProfile: UserProfile = {
      ...onboardingData,
      uid: user.uid,
      displayName: user.displayName || 'User',
      onboardingComplete: true,
    } as UserProfile;
    
    try {
      await setDoc(doc(db, 'users', user.uid), fullProfile);
      setProfile(fullProfile);
      setCurrentPage(Page.HOME);
    } catch (error) {
      console.error("Onboarding Save Failed:", error);
      alert("Failed to save profile. Please check your connection.");
    }
  };

  const addWater = async (amount: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'water'), {
        amountMl: amount,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'water');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImage(file);
  };

  const processImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setSelectedImage(base64);
      setCurrentPage(Page.ANALYSIS);
      await performAnalysis(base64.split(',')[1], file.type);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg');
      
      // Stop camera stream
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      
      setShowCamera(false);
      setSelectedImage(base64);
      setCurrentPage(Page.ANALYSIS);
      performAnalysis(base64.split(',')[1], 'image/jpeg');
    }
  };

  const performAnalysis = async (base64Data: string, mimeType: string) => {
    setAnalyzing(true);
    setAnalysisStep(1);
    setAnalysisProgress(15);
    setLastResult(null);
    setCurrentPage(Page.ANALYSIS);
    
    try {
      // Step 1: Uploading
      setAnalysisStep(1);
      setAnalysisProgress(15);
      await new Promise(r => setTimeout(r, 800));

      // Step 2: Analyzing
      setAnalysisStep(2);
      setAnalysisProgress(45);
      
      const result = await analyzeFoodImage(base64Data, mimeType);
      
      // Step 3: Calculating
      setAnalysisStep(3);
      setAnalysisProgress(75);
      await new Promise(r => setTimeout(r, 600));

      const scanData: Omit<FoodScan, 'id'> = {
        ...result,
        imageUrl: `data:${mimeType};base64,${base64Data}`,
        timestamp: serverTimestamp(),
        userId: user!.uid
      };
      
      // Step 4: Generating
      setAnalysisStep(4);
      setAnalysisProgress(90);
      await new Promise(r => setTimeout(r, 400));
      
      try {
        const docRef = await addDoc(collection(db, 'scans'), scanData);
        setAnalysisStep(5);
        setAnalysisProgress(100);
        setLastResult({ id: docRef.id, ...scanData } as FoodScan);
        setToast({ message: "Food analyzed successfully! 🥗", type: 'success' });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'scans');
      }
    } catch (error) {
      console.error("Analysis Failed:", error);
      setToast({ message: "Analysis failed. Make it clearer!", type: 'warn' });
      setCurrentPage(Page.HOME);
    } finally {
      setTimeout(() => setAnalyzing(false), 500);
    }
  };

  const deleteScan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this entry?")) {
      try {
        await deleteDoc(doc(db, 'scans', id));
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  const handleQuickAction = async (actionId: string, data?: any) => {
    switch (actionId) {
      case 'scan':
        startCamera();
        break;
      case 'upload':
        fileInputRef.current?.click();
        break;
      case 'water':
        if (data) addWater(data);
        break;
      case 'weight':
        const weight = prompt("Enter your current weight (kg):");
        if (weight && user) {
          try {
            await addDoc(collection(db, 'progress'), {
              userId: user.uid,
              weight: parseFloat(weight),
              timestamp: serverTimestamp(),
            });
            setToast({ message: "Weight logged successfully! 💪", type: 'success' });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'progress');
          }
        }
        break;
      case 'coach':
        setCurrentPage(Page.COACH);
        break;
      case 'custom':
        // Future: Open custom meal modal
        setToast({ message: "Custom meal logging coming soon!", type: 'warn' });
        break;
    }
  };

  const [authLoading, setAuthLoading] = useState(false);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signIn();
    } catch (error: any) {
      console.error("Login failed:", error);
      setToast({ 
        message: error.message?.includes('popup-closed-by-user') 
          ? "Login cancelled. Try again!" 
          : "Login failed. Check your connection.", 
        type: 'warn' 
      });
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sage-50">
        <Loader2 className="h-10 w-10 animate-spin text-sage-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-bg">
        <div className="mb-8 rounded-full bg-brand/10 p-10 shadow-[0_0_50px_rgba(204,255,0,0.2)]">
          <Sparkles className="h-20 w-20 text-brand" />
        </div>
        <h1 className="mb-2 font-serif text-5xl font-bold text-white italic tracking-tight">PurePulse</h1>
        <p className="mb-10 max-w-xs text-text-dim text-sm leading-relaxed">
          Elite performance nutrition and body transformation, powered by Antigravity AI.
        </p>
        <button 
          onClick={handleSignIn}
          disabled={authLoading}
          className="flex w-full max-w-sm items-center justify-center gap-4 rounded-3xl bg-brand py-5 font-bold text-black transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {authLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <img src="https://www.google.com/favicon.ico" className="h-5 w-5" alt="Google" />
              Get Started with Google
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      {/* Redesigned Header - Hidden on Coach Page */}
      <AnimatePresence>
        {currentPage !== Page.COACH && !showCamera && (
          <motion.header 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="sticky top-0 z-50 flex items-center justify-between bg-bg/80 p-6 backdrop-blur-lg"
          >
            <button 
              onClick={() => setCurrentPage(Page.SETTINGS)}
              className="flex items-center gap-3 active:scale-95 transition-all text-left"
            >
              <img src={user.photoURL || ""} className="h-10 w-10 rounded-full border-2 border-brand" alt="Profile" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Good Morning!</span>
                <h2 className="text-sm font-bold">{user.displayName || "Elite User"}</h2>
              </div>
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setToast({ message: "No new notifications", type: 'warn' })}
                className="rounded-full bg-card p-2 shadow-inner active:scale-90 transition-all border border-white/5"
              >
                <Bell className="h-5 w-5 text-text-dim" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className={cn("flex-1 p-6", currentPage === Page.COACH && "p-0 overflow-hidden")}>
        <AnimatePresence mode="wait">
          {currentPage === Page.ONBOARDING && (
            <motion.div 
              key="onboarding"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col justify-center min-h-[70vh] space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-4xl font-bold font-serif italic">Transform Your Body</h1>
                <p className="text-text-dim">Our AI Coach builds a personalized nutrition and workout plan just for you.</p>
              </div>
              
              <div className="relative overflow-hidden rounded-[2.5rem] bg-brand p-8 text-black shadow-[0_0_50px_-10px_rgba(204,255,0,0.5)]">
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold mb-4">Ready to start?</h3>
                  <button 
                    onClick={() => setCurrentPage(Page.COACH)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 font-bold text-white transition-all active:scale-95"
                  >
                    Start My Body Plan
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white opacity-20 blur-3xl" />
              </div>
            </motion.div>
          )}

          {currentPage === Page.COACH && (
            <motion.div 
              key="coach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-bg flex flex-col h-[100dvh] safe-area-bottom"
            >
              {/* Immersive Mobile Header */}
              <AnimatePresence>
                {!isImmersive && (
                  <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="p-6 flex items-center justify-between border-b border-white/5 bg-bg/80 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setCurrentPage(Page.HOME)} 
                        className="p-3 bg-card rounded-full active:scale-95 transition-all text-text"
                      >
                        <ChevronLeft />
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-brand/20 flex items-center justify-center border border-brand/50">
                            <Sparkles className="h-5 w-5 text-brand" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-bg animate-pulse" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold leading-none">AI Body Coach</h2>
                          <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Active Now</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat Canvas */}
              <div 
                className="flex-1 overflow-y-auto space-y-6 scrollbar-hide px-6 py-6 pb-24" 
                id="coach-chat-container"
                onClick={() => setIsImmersive(false)}
              >
                {coachChat.map((chat, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={i} 
                    className={cn(
                      "group flex flex-col max-w-[85%] gap-1",
                      chat.role === 'coach' ? "self-start" : "self-end items-end ml-auto"
                    )}
                  >
                    <div className={cn(
                      "p-4 rounded-[2rem] text-sm leading-relaxed shadow-sm relative group/msg",
                      chat.role === 'coach' 
                        ? "bg-card text-text rounded-tl-sm" 
                        : "bg-brand text-black font-semibold rounded-tr-sm shadow-[0_4px_15px_rgba(204,255,0,0.2)]"
                    )}>
                      <ReactMarkdown>{chat.message}</ReactMarkdown>
                      {chat.role === 'coach' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            speakMessage(chat.message, i);
                          }}
                          className="absolute -right-12 top-2 p-2 bg-card rounded-full opacity-0 group-hover/msg:opacity-100 transition-opacity active:scale-95 shadow-lg border border-white/5"
                        >
                          {speakingMessage === i ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4 text-brand" />}
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isGeneratingPlan && (
                  <div className="flex items-center gap-3 px-2">
                     <div className="h-10 w-10 rounded-full bg-brand/10 animate-pulse flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-brand" />
                     </div>
                     <span className="text-[10px] font-bold text-brand uppercase tracking-widest">Coach is thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} className="h-10" />
              </div>

              {/* Mobile One-Hand Input Area */}
              <div className="absolute bottom-0 left-0 right-0 p-6 pt-10 bg-gradient-to-t from-bg via-bg/95 to-transparent pointer-events-none">
                <div className="relative flex flex-col gap-4 pointer-events-auto">
                  {!profile?.coachOnboardingComplete && coachStep < COACH_QUESTIONS.length && (
                    <motion.div 
                      layout
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="bg-card p-6 rounded-[2.5rem] shadow-2xl border border-brand/20 backdrop-blur-xl"
                    >
                      <p className="text-[10px] font-bold text-brand uppercase tracking-[0.2em] mb-3">Step {coachStep + 1} of {COACH_QUESTIONS.length}</p>
                      <h3 className="text-xl font-bold mb-6 leading-tight font-serif italic">{COACH_QUESTIONS[coachStep].question}</h3>
                      
                      <div className="grid gap-3 max-h-[30vh] overflow-y-auto pr-1">
                        {COACH_QUESTIONS[coachStep].type === 'select' && COACH_QUESTIONS[coachStep].options?.map(opt => (
                          <button 
                            key={opt}
                            onClick={() => handleCoachResponse(COACH_QUESTIONS[coachStep].field, opt)}
                            className="w-full py-5 px-6 rounded-2xl bg-card-light hover:bg-brand hover:text-black transition-all text-left font-bold border border-white/5 active:scale-[0.98] text-sm"
                          >
                            {opt}
                          </button>
                        ))}
                        {COACH_QUESTIONS[coachStep].type === 'number' && (
                          <div className="flex gap-2">
                            <input 
                              type="number" 
                              autoFocus
                              placeholder="Type score..."
                              onKeyDown={(e) => {
                                if(e.key === 'Enter') handleCoachResponse(COACH_QUESTIONS[coachStep].field, (e.target as any).value);
                              }}
                              className="flex-1 bg-card-light p-4 rounded-2xl focus:outline-none focus:ring-2 ring-brand/50 font-bold text-text text-sm" 
                            />
                            <button 
                              onClick={() => {
                                const val = (document.querySelector('input[type="number"]') as any).value;
                                if(val) handleCoachResponse(COACH_QUESTIONS[coachStep].field, val);
                              }}
                              className="bg-brand text-black p-4 rounded-2xl aspect-square flex items-center justify-center active:scale-90"
                            >
                              <ArrowRight />
                            </button>
                          </div>
                        )}
                        {COACH_QUESTIONS[coachStep].type === 'slider' && (
                          <div className="space-y-6 px-2 py-2">
                            <div className="text-6xl font-bold text-center text-brand font-serif italic">
                              <span id="slider-value-display">{onboardingData[COACH_QUESTIONS[coachStep].field] ?? (COACH_QUESTIONS[coachStep].min || 0)}</span>
                            </div>
                            <input 
                              type="range" 
                              min={COACH_QUESTIONS[coachStep].min ?? 0}
                              max={COACH_QUESTIONS[coachStep].max ?? 10}
                              defaultValue={(onboardingData[COACH_QUESTIONS[coachStep].field] as number) ?? (COACH_QUESTIONS[coachStep].min || 0)}
                              onChange={(e) => {
                                const display = document.getElementById('slider-value-display');
                                if (display) display.innerText = e.target.value;
                              }}
                              className="w-full accent-brand h-2 bg-card-light rounded-lg appearance-none cursor-pointer" 
                              id="onboarding-slider"
                            />
                            <button 
                              onClick={() => {
                                const val = (document.getElementById('onboarding-slider') as HTMLInputElement).value;
                                handleCoachResponse(COACH_QUESTIONS[coachStep].field, parseInt(val));
                              }}
                              className="w-full bg-brand text-black py-5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-brand/20 active:scale-95 transition-all text-sm mb-2"
                            >
                              Next Step <ArrowRight className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {profile?.coachOnboardingComplete && (
                    <div className="w-full max-w-lg mx-auto">
                      <AiPromptBox 
                        isLoading={isGeneratingPlan}
                        onSend={(msg, files) => sendContinuousChatMessage(msg, files)}
                        onCameraCapture={startCamera}
                        placeholder="Ask your coach anything..."
                        isTtsSpeaking={speakingMessage !== null}
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === Page.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 pb-44"
            >
              {/* PulseUp Aesthetic Nutrition Dashboard */}
              <section>
                {proactiveAdvice && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-4 bg-brand/10 border border-brand/20 p-4 rounded-[1.5rem] flex items-start gap-3"
                  >
                     <Sparkles className="h-5 w-5 text-brand shrink-0 mt-1" />
                     <p className="text-xs font-medium italic opacity-90">{proactiveAdvice}</p>
                  </motion.div>
                )}
                <h3 className="text-lg font-bold mb-4">Your Daily Nutrition</h3>
                <div className="grid grid-cols-3 gap-3">
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                         <Flame className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Calories</div>
                         <div className="text-lg font-bold">{caloriesToday} <span className="text-[10px] text-text-muted">Kcal</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyCalorieGoal || 2000} burned</div>
                      </div>
                   </div>
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                         <Dna className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Proteins</div>
                         <div className="text-lg font-bold">{proteinToday} <span className="text-[10px] text-text-muted">gm</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyProteinGoal || 100} Kcal</div>
                      </div>
                   </div>
                   <div className="aspect-[4/5] rounded-[2rem] bg-card p-4 flex flex-col justify-between border border-white/5">
                      <div className="h-8 w-8 rounded-xl bg-brand/20 flex items-center justify-center">
                         <Utensils className="h-4 w-4 text-brand" />
                      </div>
                      <div>
                         <div className="text-xs text-text-dim mb-1">Carbs</div>
                         <div className="text-lg font-bold">{scans.reduce((a,s) => a + (s.carbohydratesG || 0), 0)} <span className="text-[10px] text-text-muted">gm</span></div>
                         <div className="text-[8px] text-text-muted">/ {profile?.dailyCarbsGoal || 250} Kcal</div>
                      </div>
                   </div>
                </div>
              </section>

              {/* Central Progress Ring */}
              <div className="flex flex-col items-center py-6">
                <div className="relative">
                   <svg className="h-56 w-56 -rotate-90">
                      <circle cx="112" cy="112" r="95" fill="transparent" stroke="#1c1c1c" strokeWidth="15" />
                      <circle 
                        cx="112" cy="112" r="95" fill="transparent" stroke="#ccff00" strokeWidth="15" 
                        strokeDasharray={596}
                        strokeDashoffset={596 - (596 * (caloriesToday / (profile?.dailyCalorieGoal || 2000)))}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-text-dim mb-1 uppercase tracking-widest font-bold">Day 12</span>
                      <div className="flex items-center gap-2">
                         <Utensils className="h-5 w-5 text-brand" />
                         <span className="text-4xl font-bold">{caloriesToday}</span>
                      </div>
                      <span className="text-xs text-text-muted">{profile?.dailyCalorieGoal || 2000} Kcal</span>
                   </div>
                </div>
              </div>

              {/* Hydration Section */}
              <section className="bg-card p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold flex items-center gap-2">Hydration <Droplets className="h-4 w-4 text-blue-400" /></h3>
                    <span className="text-xs font-bold text-text-dim">{waterToday} / {(profile?.dailyWaterGoal || 3000)} ml</span>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="relative h-24 w-24">
                      <svg className="h-full w-full -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="transparent" stroke="#1c1c1c" strokeWidth="8" />
                        <circle 
                          cx="48" cy="48" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="8" 
                          strokeDasharray={251}
                          strokeDashoffset={251 - (251 * Math.min(waterToday / (profile?.dailyWaterGoal || 3000), 1))}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Droplets className="h-6 w-6 text-blue-400" />
                      </div>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      {[250, 500, 1000].map(ml => (
                        <button 
                          key={ml}
                          onClick={() => addWater(ml)}
                          className="py-3 rounded-2xl bg-card-light hover:bg-blue-500 hover:text-white transition-all text-[10px] font-bold border border-white/5 active:scale-95"
                        >
                          +{ml}ml
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-blue-500/10 blur-3xl rounded-full" />
              </section>

              {/* Daily Meal Plan */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Daily Meal</h3>
                  <button className="text-xs text-text-dim hover:text-brand">Edit plan 🗓️</button>
                </div>
                
                {mealPlan ? (
                  <div className="space-y-3">
                    {mealPlan.meals.map((meal, i) => (
                      <div key={i} className="glass-card flex items-center justify-between p-4 rounded-[2rem]">
                         <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-card-light flex items-center justify-center text-brand">
                               {meal.type === 'Breakfast' ? '🥣' : meal.type === 'Lunch' ? '🥗' : '🍱'}
                            </div>
                            <div>
                               <div className="font-bold">{meal.name}</div>
                               <div className="text-[10px] text-text-dim uppercase tracking-wider">{meal.type} • {meal.calories} kcal</div>
                            </div>
                         </div>
                         <button 
                           onClick={async () => {
                             const scanData: Omit<FoodScan, 'id'> = {
                               foodName: meal.name,
                               confidence: Confidence.HIGH,
                               calories: meal.calories,
                               proteinG: meal.protein,
                               fatG: meal.fat,
                               carbohydratesG: meal.carbs,
                               fiberG: 0,
                               sugarG: 0,
                               sodiumMg: 0,
                               healthTip: "Plan tracking",
                               allergens: [],
                               portionSize: meal.portion,
                               imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100",
                               timestamp: serverTimestamp(),
                               userId: user!.uid
                             };
                             try {
                               await addDoc(collection(db, 'scans'), scanData);
                               setToast({ message: "Meal logged to your history! 🍛", type: 'success' });
                             } catch (error) {
                               handleFirestoreError(error, OperationType.WRITE, 'scans');
                             }
                           }}
                           className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand active:scale-95 transition-all"
                         >
                            <Plus className="h-5 w-5" />
                         </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[2rem] bg-card p-6 border border-dashed border-white/10 text-center">
                     <p className="text-text-dim text-sm mb-4">You haven't generated a meal plan yet.</p>
                     <button 
                      onClick={() => setCurrentPage(Page.COACH)}
                      className="text-brand font-bold text-sm bg-brand/10 px-6 py-2 rounded-full"
                    >
                      Generate My Day
                    </button>
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {currentPage === Page.PROGRESS && (
            <motion.div 
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 pb-44"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-serif italic text-white">Transformation Journey</h2>
                <div className="flex items-center gap-2 text-[10px] text-text-dim font-bold uppercase tracking-widest">
                   <Sparkles className="h-3 w-3 text-brand" /> Use + to update weight
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card p-6 rounded-[2.5rem] border border-white/5">
                   <TrendingUp className="text-brand mb-3 h-5 w-5" />
                   <div className="text-3xl font-bold font-serif italic">
                      {progressLogs[0]?.weight || profile?.weight || '--'} 
                      <span className="text-xs text-text-dim ml-1 not-italic font-sans">kg</span>
                   </div>
                   <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold mt-1">Current weight</div>
                </div>
                <div className="bg-card p-6 rounded-[2.5rem] border border-white/5">
                   <Activity className="text-blue-500 mb-3 h-5 w-5" />
                   <div className="text-3xl font-bold font-serif italic">
                      {scans.length > 0 ? (new Set(scans.map(s => (s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp)).toDateString())).size) : 0}
                      <span className="text-xs text-text-dim ml-1 not-italic font-sans">days</span>
                   </div>
                   <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold mt-1">Active Streak</div>
                </div>
              </div>

              <section className="bg-card p-8 rounded-[3rem] border border-white/5">
                <div className="flex items-center justify-between mb-8">
                   <h3 className="font-bold flex items-center gap-2 tracking-tight">Weight Journey</h3>
                   <div className="flex items-center gap-2 text-[10px] text-text-dim font-bold uppercase">
                      <div className="h-2 w-2 rounded-full bg-brand" /> Weight (kg)
                   </div>
                </div>
                <div className="h-48 flex items-end justify-between gap-2">
                   {progressLogs.length > 0 ? (
                     [...progressLogs].reverse().slice(-7).map((log, i) => {
                       const max = Math.max(...progressLogs.map(l => l.weight));
                       const min = Math.min(...progressLogs.map(l => l.weight));
                       const range = max - min || 1;
                       const height = ((log.weight - min) / range * 60) + 40;
                       return (
                         <div key={i} className="flex-1 flex flex-col items-center gap-3">
                            <div className="w-full bg-brand/10 rounded-full relative group h-32 flex items-end">
                               <motion.div 
                                 initial={{ height: 0 }}
                                 animate={{ height: `${height}%` }}
                                 className="w-full bg-brand rounded-full relative shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-all group-hover:bg-white"
                               >
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold">
                                     {log.weight}
                                  </div>
                               </motion.div>
                            </div>
                            <span className="text-[8px] text-text-muted font-bold uppercase">
                               {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('en-US', {weekday: 'short'}) : '??'}
                            </span>
                         </div>
                       );
                     })
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-text-dim text-sm italic opacity-50">
                        No weight logs yet. Start today!
                     </div>
                   )}
                </div>
              </section>

              <div className="glass-card p-8 rounded-[3rem] border border-brand/20 bg-brand/5">
                 <div className="flex items-center gap-5 mb-6">
                    <div className="h-14 w-14 rounded-[1.5rem] bg-brand text-black flex items-center justify-center shadow-xl shadow-brand/20">
                       <Award className="h-7 w-7" />
                    </div>
                    <div className="flex-1">
                       <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-lg">Goal Progress</h4>
                          <span className="text-brand font-bold text-sm">
                            {profile?.weight && profile?.goalWeight ? 
                              Math.round(Math.abs((profile.weight - (progressLogs[0]?.weight || profile.weight)) / (profile.weight - profile.goalWeight)) * 100) : 0}%
                          </span>
                       </div>
                       <p className="text-xs text-text-dim">You're making steady progress towards your target.</p>
                    </div>
                 </div>
                 <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${profile?.weight && profile?.goalWeight ? 
                        Math.min(Math.round(Math.abs((profile.weight - (progressLogs[0]?.weight || profile.weight)) / (profile.weight - profile.goalWeight)) * 100), 100) : 0}%` }}
                      className="h-full bg-brand rounded-full shadow-[0_0_10px_rgba(204,255,0,0.5)]" 
                    />
                 </div>
              </div>
            </motion.div>
          )}

          {currentPage === Page.HISTORY && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pb-44">
               <div className="flex items-center gap-4 mb-2">
                  <button onClick={() => setCurrentPage(Page.SETTINGS)} className="p-3 bg-card rounded-full active:scale-95 transition-all text-text"><ChevronLeft /></button>
                  <h2 className="text-2xl font-bold font-serif italic text-white">Meal History</h2>
               </div>
               <div className="flex flex-col gap-4">
                  <div className="relative">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-brand" />
                     <input 
                      type="text" 
                      placeholder="Search your nutrients..." 
                      className="w-full bg-card py-4 pl-12 pr-4 rounded-2xl text-sm focus:outline-none focus:ring-1 ring-brand/50 shadow-inner border border-white/5"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                     />
                  </div>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                     {['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack'].map(f => (
                       <button 
                        key={f}
                        onClick={() => setSearchQuery(prev => prev === f ? '' : f)}
                        className={cn(
                          "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap",
                          searchQuery === f ? "bg-brand text-black border-brand" : "bg-card border-white/5 text-text-dim"
                        )}
                       >
                         {f}
                       </button>
                     ))}
                  </div>
               </div>
               
               <div className="space-y-3">
                 {scans.filter(s => s.foodName.toLowerCase().includes(searchQuery.toLowerCase())).map(scan => (
                    <div 
                     key={scan.id} 
                     onClick={() => {
                       setLastResult(scan);
                       setSelectedImage(scan.imageUrl);
                       setCurrentPage(Page.ANALYSIS);
                     }}
                     className="bg-card p-4 rounded-[2.5rem] flex items-center gap-4 active:scale-[0.98] transition-all border border-white/5 relative group"
                    >
                       <img src={scan.imageUrl} className="h-16 w-16 rounded-[1.5rem] object-cover shadow-lg" />
                       <div className="flex-1">
                          <div className="font-bold tracking-tight">{scan.foodName}</div>
                          <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">
                             {scan.calories} kcal • {scan.proteinG}g P • {scan.carbohydratesG}g C
                          </div>
                          <div className="text-[8px] text-text-dim mt-1 uppercase tracking-[0.2em]">{formatTimestamp(scan.timestamp)}</div>
                       </div>
                       <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => deleteScan(scan.id, e)}
                            className="p-3 bg-red-500/10 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                          >
                             <Trash2 className="h-4 w-4" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-text-muted" />
                       </div>
                    </div>
                 ))}
               </div>
               
               {scans.length === 0 && (
                 <div className="py-20 text-center text-text-dim">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No meals tracked yet.</p>
                 </div>
               )}
            </motion.div>
          )}

          {/* Analysis View (keeping it largely similar but matching theme) */}
          {currentPage === Page.ANALYSIS && (selectedImage || lastResult) && (
            <motion.div key="analysis" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 pb-44">
                <button onClick={() => setCurrentPage(Page.HOME)} className="p-2 bg-card rounded-full"><ChevronLeft /></button>
                
                <div className="relative aspect-square rounded-[3rem] overflow-hidden shadow-2xl">
                   <img src={selectedImage || lastResult?.imageUrl || ""} className="w-full h-full object-cover" />
                   
                   {analyzing && (
                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-full max-w-xs space-y-6">
                           <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
                              <motion.div 
                                className="absolute inset-0 bg-brand"
                                initial={{ width: '0%' }}
                                animate={{ width: `${analysisProgress}%` }}
                              />
                           </div>
                           <div className="space-y-1">
                              <div className="text-brand font-black uppercase tracking-[0.3em] text-xs">
                                 {analysisStep === 1 && "Uploading Image"}
                                 {analysisStep === 2 && "Analyzing Food"}
                                 {analysisStep === 3 && "Calculating Nutrition"}
                                 {analysisStep === 4 && "Generating Recommendations"}
                                 {analysisStep === 5 && "Analysis Complete"}
                              </div>
                              <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{analysisProgress}% Processed</div>
                           </div>
                           <div className="flex justify-center">
                              <Loader2 className="h-8 w-8 text-brand animate-spin" />
                           </div>
                        </div>
                     </div>
                   )}
                </div>

                {lastResult && !analyzing && (
                  <div className="space-y-6">
                     <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-bold font-serif italic">{lastResult.foodName}</h2>
                        <span className="px-4 py-1 bg-brand text-black font-bold rounded-full text-xs">{lastResult.calories} Kcal</span>
                     </div>
                     <div className="grid grid-cols-3 gap-4">
                        <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                           <div className="text-brand font-bold">{lastResult.proteinG}g</div>
                           <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Protein</div>
                        </div>
                        <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                           <div className="text-blue-500 font-bold">{lastResult.carbohydratesG}g</div>
                           <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Carbs</div>
                        </div>
                        <div className="bg-card p-4 rounded-3xl text-center border border-white/5">
                           <div className="text-orange-500 font-bold">{lastResult.fatG}g</div>
                           <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Fat</div>
                        </div>
                     </div>
                     <div className="bg-brand/10 p-6 rounded-[2.5rem] border border-brand/20">
                        <h4 className="font-bold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Insight</h4>
                        <p className="text-sm italic opacity-80">{lastResult.healthTip}</p>
                     </div>
                  </div>
                )}
                
                {analyzing && (
                  <div className="bg-card/50 p-6 rounded-[2.5rem] border border-dashed border-white/10 text-center">
                     <p className="text-text-dim text-sm italic">Sit tight! Elite AI is decoding your nutrients...</p>
                  </div>
                )}
            </motion.div>
          )}
          {currentPage === Page.SETTINGS && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 pb-44"
            >
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setCurrentPage(Page.HOME)} className="p-3 bg-card rounded-full active:scale-95 transition-all text-text"><ChevronLeft /></button>
                <h2 className="text-3xl font-bold font-serif italic text-white tracking-tight">PurePulse Settings</h2>
              </div>
              
              <div className="bg-card p-6 rounded-[2.5rem] flex items-center gap-5 border border-white/5 shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-brand/5 group-hover:bg-brand/10 transition-colors pointer-events-none" />
                 <div className="relative">
                   <img src={user.photoURL || ""} className="h-24 w-24 rounded-[2.2rem] border-2 border-brand object-cover shadow-2xl" />
                   <div className="absolute -bottom-1 -right-1 bg-brand text-black p-1.5 rounded-xl shadow-lg ring-4 ring-card">
                      <Sparkles className="h-4 w-4" />
                   </div>
                 </div>
                 <div className="flex-1 relative z-10">
                    <h3 className="text-2xl font-bold tracking-tight text-white">{user.displayName}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                       <span className="px-3 py-1 bg-brand/10 text-brand rounded-full text-[10px] font-black uppercase tracking-widest">{profile?.goal || 'Elite Athlete'}</span>
                       <span className="px-3 py-1 bg-white/5 text-text-dim rounded-full text-[10px] font-black uppercase tracking-widest">Premium Member</span>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <button 
                  onClick={() => setCurrentPage(Page.HISTORY)}
                  className="w-full flex items-center justify-between p-6 bg-brand/10 border border-brand/20 rounded-[2.5rem] shadow-xl active:scale-[0.98] transition-all group"
                 >
                    <div className="flex items-center gap-4">
                       <div className="h-12 w-12 rounded-2xl bg-brand text-black flex items-center justify-center shadow-lg">
                          <History className="h-6 w-6" />
                       </div>
                       <div className="text-left">
                          <div className="font-bold tracking-tight text-brand">Your Previous Food</div>
                          <div className="text-[10px] text-text-dim uppercase tracking-wider font-bold mt-0.5">View your full log history</div>
                       </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-brand opacity-50 group-hover:translate-x-1 transition-transform" />
                 </button>

                  <div className="bg-card p-8 rounded-[3rem] space-y-6 border border-white/5 shadow-xl">
                    <h3 className="font-bold flex items-center gap-2 tracking-tight text-lg text-white">
                       <Mic className="h-5 w-5 text-brand" /> Voice Coaching
                    </h3>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                       <div className="flex-1 pr-4">
                          <div className="text-sm font-bold text-white">Auto Voice Reply</div>
                          <div className="text-[10px] text-text-dim uppercase tracking-widest mt-1">AI reads answers automatically</div>
                       </div>
                       <button 
                        onClick={() => setVoiceEnabled(!voiceEnabled)}
                        className={cn("w-12 h-7 rounded-full p-1 transition-colors relative", voiceEnabled ? "bg-brand" : "bg-bg")}
                       >
                          <motion.div 
                            animate={{ x: voiceEnabled ? 20 : 0 }}
                            className="h-5 w-5 rounded-full bg-white shadow-md"
                          />
                       </button>
                    </div>
                 </div>

                 <div className="bg-card p-8 rounded-[3rem] space-y-6 border border-white/5 shadow-xl">
                    <div className="flex items-center justify-between">
                       <h3 className="font-bold flex items-center gap-2 tracking-tight text-lg text-white">
                          <Sparkles className="h-5 w-5 text-brand" /> Appearance
                       </h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                       {['light', 'dark', 'system'].map((t) => (
                         <button 
                          key={t}
                          onClick={() => setTheme(t as any)}
                          className={cn(
                            "py-4 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest active:scale-95",
                            theme === t 
                              ? "bg-brand text-black border-brand shadow-lg shadow-brand/20" 
                              : "bg-card-light border-white/5 text-text-dim hover:bg-white/10"
                          )}
                         >
                           {t}
                         </button>
                       ))}
                    </div>
                 </div>

                 <div className="bg-card p-8 rounded-[3rem] space-y-6 border border-white/5 shadow-xl">
                    <h3 className="font-bold flex items-center gap-2 tracking-tight text-lg text-white">
                       <Bell className="h-5 w-5 text-blue-400" /> Reminders
                    </h3>
                    <div className="space-y-4">
                       {[
                         { label: 'Meal Reminders', active: true },
                         { label: 'Water Reminders', active: true },
                         { label: 'Workout Reminders', active: false }
                       ].map((notif, i) => (
                         <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                            <span className="text-sm font-bold opacity-80 text-white">{notif.label}</span>
                            <div className={cn("w-10 h-6 rounded-full p-1 transition-colors relative", notif.active ? "bg-brand" : "bg-bg")}>
                               <div className={cn("h-4 w-4 rounded-full bg-white transition-all shadow-md", notif.active ? "translate-x-4" : "translate-x-0")} />
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-3">
                    {[
                      { icon: <Activity className="text-brand" />, label: 'Personal Goals', sub: 'Update height, weight & targets' },
                      { icon: <Droplets className="text-blue-500" />, label: 'Hydration Target', sub: 'Adjust daily water goal' },
                      { icon: <Flame className="text-orange-500" />, label: 'Nutrition Budget', sub: 'Modify macros & calories' },
                      { icon: <Award className="text-yellow-500" />, label: 'Privacy & Security', sub: 'Manage your personal data' },
                      { icon: <TrendingUp className="text-purple-400" />, label: 'Export Data', sub: 'Download history as CSV' },
                    ].map((item, i) => (
                      <button key={i} className="w-full flex items-center justify-between p-5 bg-card rounded-[2rem] border border-white/5 active:scale-[0.98] transition-all group hover:bg-white/5 shadow-lg">
                        <div className="flex items-center gap-4">
                           <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-brand/10 transition-colors shadow-inner">
                              {item.icon}
                           </div>
                           <div className="text-left">
                              <div className="font-bold tracking-tight text-white">{item.label}</div>
                              <div className="text-[10px] text-text-dim uppercase tracking-wider font-bold mt-0.5">{item.sub}</div>
                           </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-text-muted opacity-50 group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))}
                 </div>

                 <div className="pt-6 space-y-4">
                    <button 
                      onClick={() => {
                        if(confirm("Are you sure you want to delete your account? All data will be permanently wiped.")) {
                          setToast({ message: "Request received. Account will be deleted in 24h.", type: 'warn' });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 p-5 bg-card text-red-500 opacity-40 hover:opacity-100 transition-opacity rounded-2xl font-bold text-sm border border-white/5 shadow-lg"
                    >
                      Delete Account
                    </button>
                    <button 
                      onClick={() => signOut()}
                      className="w-full flex items-center justify-center gap-2 p-6 bg-red-500/10 text-red-500 rounded-[2.5rem] font-black uppercase tracking-widest text-sm active:scale-95 transition-all shadow-2xl shadow-red-500/5 hover:bg-red-500/20"
                    >
                      <LogOut className="h-5 w-5" />
                      Sign Out
                    </button>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Redesigned Camera Overlay */}
      {showCamera && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black"
        >
          <div className="flex items-center justify-between p-6">
            <button onClick={() => setShowCamera(false)} className="rounded-full bg-white/10 p-3 text-white">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="text-center">
               <h3 className="font-bold text-white uppercase tracking-widest text-xs">AI Vision</h3>
               <p className="text-[10px] text-white/50">Analyzing nutrients in real-time</p>
            </div>
            <div className="w-12" />
          </div>
          
          <div className="relative flex-1 overflow-hidden m-4 rounded-[3rem]">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            
            {/* Scanner Animation */}
            <motion.div 
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-brand shadow-[0_0_20px_#ccff00] z-20"
            />

            <div className="absolute inset-0 border-[2px] border-brand/20 m-12 rounded-3xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-brand rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-brand rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-brand rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-brand rounded-br-xl" />
            </div>
          </div>
          
          <div className="flex h-40 items-center justify-center p-6 bg-black">
            <button 
              onClick={capturePhoto}
              className="h-24 w-24 rounded-full border-4 border-white/20 p-2 active:scale-90 transition-transform"
            >
              <div className="h-full w-full rounded-full bg-brand shadow-[0_0_40px_rgba(204,255,0,0.4)] flex items-center justify-center">
                 <Camera className="h-8 w-8 text-black" />
              </div>
            </button>
          </div>
        </motion.div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className={cn(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2",
              toast.type === 'success' ? "bg-brand text-black" : "bg-red-500 text-white"
            )}
          >
            {toast.type === 'success' ? <Sparkles className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {currentPage !== Page.COACH && !showCamera && (
          <motion.nav 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
          >
              <div className="relative bg-card/90 backdrop-blur-3xl border border-white/10 rounded-[3rem] px-6 py-4 flex items-center justify-between shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
                {/* Specialized Cutout for floating button */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-28 h-28 bg-bg rounded-full border-t border-white/10 p-2" style={{ clipPath: 'inset(0 0 50% 0)' }}>
                   <div className="w-full h-full bg-card/90 backdrop-blur-3xl rounded-full border border-white/5" />
                </div>
                
                <div className="flex flex-1 items-center justify-around pr-4">
                   <NavButton icon={<Utensils size={20} />} active={currentPage === Page.HOME} onClick={() => setCurrentPage(Page.HOME)} />
                   <NavButton icon={<Sparkles size={20} />} active={currentPage === Page.COACH} onClick={() => setCurrentPage(Page.COACH)} />
                </div>
                
                <div className="relative -top-14 z-10 mx-2">
                  <button 
                    onClick={() => setIsActionSheetOpen(true)}
                    className="h-16 w-16 rounded-full bg-brand text-black shadow-[0_10px_40px_rgba(204,255,0,0.4)] flex items-center justify-center scale-[1.15] active:scale-95 transition-all ring-8 ring-bg"
                  >
                    <Plus className={cn("h-8 w-8 stroke-[3.5] transition-transform duration-300", isActionSheetOpen && "rotate-45")} />
                  </button>
                </div>
                
                <div className="flex flex-1 items-center justify-around pl-4">
                   <NavButton icon={<Activity size={20} />} active={currentPage === Page.PROGRESS} onClick={() => setCurrentPage(Page.PROGRESS)} />
                   <NavButton icon={<SettingsIcon size={20} />} active={currentPage === Page.SETTINGS} onClick={() => setCurrentPage(Page.SETTINGS)} />
                </div>
              </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <QuickActionSheet 
        isOpen={isActionSheetOpen} 
        onClose={() => setIsActionSheetOpen(false)} 
        onAction={handleQuickAction} 
      />

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function MiniStat({ label, current, target, unit, icon }: { label: string, current: number, target: number, unit: string, icon: React.ReactNode }) {
  const percentage = Math.min(Math.round((current / target) * 100), 100);
  return (
    <div className="flex flex-col items-center">
       <div className="mb-1 flex items-center gap-1">
         {icon}
         <span className="text-[8px] font-bold uppercase text-sage-400">{label}</span>
       </div>
       <div className="text-xs font-bold text-sage-900">{Math.round(current)}{unit}</div>
       <div className="mt-1 h-1 w-full max-w-[40px] rounded-full bg-sage-50 overflow-hidden">
         <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className="h-full bg-sage-400"
         />
       </div>
    </div>
  );
}

function NavButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 transition-all">
      <div className={cn(
        "p-2.5 rounded-2xl transition-all",
        active ? "text-brand scale-110" : "text-text-dim/40 hover:text-text-dim"
      )}>
        {icon}
      </div>
      {active && <motion.div layoutId="nav-dot" className="h-1 w-1 rounded-full bg-brand shadow-[0_0_5px_#ccff00]" />}
    </button>
  );
}

function NutritionMetric({ icon, label, value, unit, color, total }: { icon: React.ReactNode, label: string, value: number, unit: string, color: string, total?: number }) {
  const percentage = total ? Math.min(Math.round((value / total) * 100), 100) : 100;
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase text-sage-400 tracking-wider font-sans">{label}</span>
      </div>
      <div className="mb-3">
        <span className="text-xl font-bold">{value}</span>
        <span className="ml-1 text-xs text-sage-500">{unit}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sage-50">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={cn("h-full", color)} 
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value, unit }: { label: string, value: number, unit: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-sage-500">{label}</span>
      <span className="text-sm font-bold">{value}{unit}</span>
    </div>
  );
}
