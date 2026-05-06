/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  User as UserIcon
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
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, signOut } from './lib/firebase';
import { analyzeFoodImage } from './services/geminiService';
import { Confidence, FoodScan, Page } from './types';
import { cn, formatTimestamp } from './lib/utils';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [scans, setScans] = useState<FoodScan[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FoodScan | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'scans'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodScan));
      setScans(docs);
    });
    return () => unsubscribe();
  }, [user]);

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
    setLastResult(null);
    try {
      const result = await analyzeFoodImage(base64Data, mimeType);
      const scanData: Omit<FoodScan, 'id'> = {
        ...result,
        imageUrl: `data:${mimeType};base64,${base64Data}`,
        timestamp: serverTimestamp(),
        userId: user!.uid
      };
      const docRef = await addDoc(collection(db, 'scans'), scanData);
      setLastResult({ id: docRef.id, ...scanData } as FoodScan);
    } catch (error) {
      console.error("Analysis Failed:", error);
      alert("Oops! We couldn't analyze the food. Make sure it's clear and try again.");
      setCurrentPage(Page.HOME);
    } finally {
      setAnalyzing(false);
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sage-50">
        <Loader2 className="h-10 w-10 animate-spin text-sage-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="mb-8 rounded-full bg-sage-100 p-6">
          <Camera className="h-16 w-16 text-sage-600" />
        </div>
        <h1 className="mb-2 font-serif text-4xl font-bold text-sage-900">NutriSnap AI</h1>
        <p className="mb-8 max-w-xs text-sage-600">
          Analyze any dish instantly. Track your calories and stay healthy with the power of AI.
        </p>
        <button 
          onClick={signIn}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-sage-900 py-4 font-semibold text-white transition-all hover:bg-sage-800 active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" className="h-5 w-5" alt="Google" />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-sage-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-sage-50/80 p-4 backdrop-blur-md">
        <h2 className="font-serif text-xl font-bold text-sage-900">NutriSnap</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-sage-600">Daily Goal: 2000 kcal</span>
          <button onClick={signOut} className="rounded-full p-2 hover:bg-sage-100">
            <LogOut className="h-5 w-5 text-sage-500" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden p-4">
        <AnimatePresence mode="wait">
          {currentPage === Page.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Daily Stats Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <Flame className="mb-2 h-6 w-6 text-orange-500" />
                  <div className="text-2xl font-bold">
                    {scans.reduce((acc, s) => {
                      const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
                      if (d.toDateString() === new Date().toDateString()) return acc + s.calories;
                      return acc;
                    }, 0)}
                  </div>
                  <div className="text-xs text-sage-500 uppercase tracking-wider">Kcal Today</div>
                </div>
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <Beef className="mb-2 h-6 w-6 text-red-500" />
                  <div className="text-2xl font-bold">
                    {scans.reduce((acc, s) => {
                      const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
                      if (d.toDateString() === new Date().toDateString()) return acc + s.proteinG;
                      return acc;
                    }, 0).toFixed(1)}g
                  </div>
                  <div className="text-xs text-sage-500 uppercase tracking-wider">Protein Today</div>
                </div>
              </div>

              {/* Main Action Card */}
              <div className="relative overflow-hidden rounded-[2.5rem] bg-sage-900 p-8 text-white">
                <div className="relative z-10">
                  <h3 className="mb-2 font-serif text-3xl italic">What's on your plate?</h3>
                  <p className="mb-8 opacity-70">Capture or upload a photo to see the metrics.</p>
                  
                  <div className="flex gap-4">
                    <button 
                      onClick={startCamera}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sage-900 font-bold active:scale-95 transition-transform"
                    >
                      <Camera className="h-5 w-5" />
                      Camera
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sage-800 py-4 text-white font-bold active:scale-95 transition-transform"
                    >
                      <Upload className="h-5 w-5" />
                      Upload
                    </button>
                  </div>
                </div>
                <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-sage-800 opacity-20 blur-3xl" />
              </div>

              {/* Recent History */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-bold">Recent Scans</h4>
                  <button onClick={() => setCurrentPage(Page.HISTORY)} className="text-sm font-medium text-sage-600">View All</button>
                </div>
                <div className="space-y-3">
                  {scans.slice(0, 3).map((scan) => (
                    <div 
                      key={scan.id} 
                      onClick={() => {
                        setLastResult(scan);
                        setCurrentPage(Page.ANALYSIS);
                      }}
                      className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-sm active:bg-sage-50 transition-colors"
                    >
                      <img src={scan.imageUrl} className="h-16 w-16 rounded-xl object-cover" alt={scan.foodName} />
                      <div className="flex-1">
                        <div className="font-bold">{scan.foodName}</div>
                        <div className="text-xs text-sage-500">{formatTimestamp(scan.timestamp)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sage-700">{scan.calories} kcal</div>
                        <div className="text-[10px] uppercase text-sage-400 font-semibold">{scan.confidence} Match</div>
                      </div>
                    </div>
                  ))}
                  {scans.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-sage-200 py-12 text-center text-sage-400">
                      No scans yet. Start by snapping a photo!
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {currentPage === Page.ANALYSIS && (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <button 
                onClick={() => {
                  setCurrentPage(Page.HOME);
                  setAnalyzing(false);
                  setLastResult(null);
                }} 
                className="mb-2 text-sm font-bold text-sage-600"
              >
                ← Back to Home
              </button>

              <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-sage-200 shadow-xl">
                {selectedImage && <img src={selectedImage} className="h-full w-full object-cover" alt="Selected food" />}
                {analyzing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-white" />
                    <p className="font-bold text-white">AI is digesting the image...</p>
                    <p className="text-sm text-white/70">Identifying ingredients and portion sizes</p>
                  </div>
                )}
              </div>

              {lastResult && (
                <div className="space-y-6 pb-8">
                  <header>
                    <div className="flex items-center gap-2 mb-1">
                       <h3 className="font-serif text-3xl font-bold">{lastResult.foodName}</h3>
                       {lastResult.confidence === Confidence.HIGH && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                    </div>
                    <div className="flex gap-2">
                       <span className="rounded-full bg-sage-200 px-3 py-1 text-xs font-semibold text-sage-700">Portion: {lastResult.portionSize}</span>
                       <span className={cn(
                         "rounded-full px-3 py-1 text-xs font-semibold",
                         lastResult.confidence === Confidence.HIGH ? "bg-green-100 text-green-700" : 
                         lastResult.confidence === Confidence.MEDIUM ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                       )}>
                         {lastResult.confidence} Confidence
                       </span>
                    </div>
                  </header>

                  <div className="grid grid-cols-2 gap-4">
                    <NutritionMetric icon={<Flame className="text-orange-500" />} label="Calories" value={lastResult.calories} unit="kcal" color="bg-orange-500" />
                    <NutritionMetric icon={<Beef className="text-red-500" />} label="Protein" value={lastResult.proteinG} unit="g" color="bg-red-500" total={50} />
                    <NutritionMetric icon={<Droplets className="text-yellow-600" />} label="Fats" value={lastResult.fatG} unit="g" color="bg-yellow-600" total={70} />
                    <NutritionMetric icon={<Dna className="text-blue-500" />} label="Carbs" value={lastResult.carbohydratesG} unit="g" color="bg-blue-500" total={250} />
                  </div>

                  <div className="rounded-3xl bg-white p-6 shadow-sm">
                    <h5 className="mb-4 font-bold flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-sage-500" />
                      Detailed Stats
                    </h5>
                    <div className="space-y-3">
                      <DetailRow label="Sugar" value={lastResult.sugarG} unit="g" />
                      <DetailRow label="Fiber" value={lastResult.fiberG} unit="g" />
                      <DetailRow label="Sodium" value={lastResult.sodiumMg} unit="mg" />
                      <hr className="my-2 border-sage-100" />
                      <div>
                        <div className="mb-1 text-xs font-bold uppercase text-sage-400">Allergen Warnings</div>
                        <div className="flex flex-wrap gap-2">
                          {lastResult.allergens.length > 0 ? lastResult.allergens.map(a => (
                            <span key={a} className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 uppercase">{a}</span>
                          )) : <span className="text-xs text-sage-500">None detected</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-sage-900 p-6 text-white shadow-xl">
                    <h5 className="mb-2 font-bold italic font-serif text-lg">💡 Health Tip</h5>
                    <p className="text-sm leading-relaxed opacity-90">{lastResult.healthTip}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentPage === Page.HISTORY && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 pb-20"
            >
              <div className="flex items-center justify-between sticky top-14 bg-sage-50/90 py-2 backdrop-blur-sm z-10">
                <h3 className="font-serif text-2xl font-bold">History</h3>
                <div className="text-sm text-sage-500">{scans.length} Entries</div>
              </div>

              {scans.map((scan) => (
                <div 
                  key={scan.id} 
                  onClick={() => {
                    setLastResult(scan);
                    setSelectedImage(scan.imageUrl);
                    setCurrentPage(Page.ANALYSIS);
                  }}
                  className="group relative flex gap-4 rounded-3xl bg-white p-4 shadow-sm active:bg-sage-50 transition-all"
                >
                  <img src={scan.imageUrl} className="h-24 w-24 rounded-2xl object-cover" alt={scan.foodName} />
                  <div className="flex flex-1 flex-col justify-center">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-lg">{scan.foodName}</div>
                      <button 
                        onClick={(e) => deleteScan(scan.id!, e)}
                        className="p-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-xs text-sage-500 mb-2">{formatTimestamp(scan.timestamp)}</div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm font-bold text-sage-900">
                        <Flame className="h-4 w-4 text-orange-500" />
                        {scan.calories}
                      </div>
                      <div className="flex items-center gap-1 text-sm font-bold text-sage-900">
                        <Beef className="h-4 w-4 text-red-500" />
                        {scan.proteinG}g
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {scans.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-sage-400">
                  <History className="mb-4 h-12 w-12 opacity-20" />
                  <p>Your history is empty.</p>
                </div>
              )}
            </motion.div>
          )}

          {currentPage === Page.SETTINGS && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <h3 className="font-serif text-2xl font-bold">Settings</h3>
              
              <div className="space-y-4">
                <section className="rounded-3xl bg-white p-6 shadow-sm">
                  <h5 className="mb-4 font-bold flex items-center gap-2">
                    <UserIcon className="h-5 w-5 text-sage-500" />
                    Account
                  </h5>
                  <div className="flex items-center gap-4">
                    <img src={user.photoURL || ""} className="h-12 w-12 rounded-full" alt="Profile" />
                    <div>
                      <div className="font-bold">{user.displayName || "User"}</div>
                      <div className="text-sm text-sage-500">{user.email}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl bg-white p-6 shadow-sm">
                  <h5 className="mb-4 font-bold flex items-center gap-2">
                    <SettingsIcon className="h-5 w-5 text-sage-500" />
                    System Information
                  </h5>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-sage-50">
                      <span className="text-sm font-medium">Model</span>
                      <span className="text-sm text-sage-500 font-mono">gemini-3-flash-preview</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-sage-50">
                      <span className="text-sm font-medium">Database</span>
                      <span className="text-sm text-sage-500 font-mono">Firestore Enterprise</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Region</span>
                      <span className="text-sm text-sage-500 font-mono">asia-southeast1</span>
                    </div>
                  </div>
                </section>

                <div className="p-4 text-center">
                   <p className="text-[10px] uppercase tracking-widest text-sage-300 font-bold mb-4">NutriSnap AI v1.0.0</p>
                   <button 
                    onClick={signOut}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 font-bold text-red-600 transition-colors hover:bg-red-100"
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

      {/* Camera Overlay */}
      {showCamera && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="flex items-center justify-between p-4">
            <button onClick={() => setShowCamera(false)} className="rounded-full bg-white/10 p-2 text-white">
              <ChevronRight className="h-6 w-6 rotate-180" />
            </button>
            <h3 className="font-bold text-white">Scanner</h3>
            <div className="w-10" />
          </div>
          <div className="relative flex-1 overflow-hidden rounded-b-[3rem]">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <div className="absolute inset-0 border-[3px] border-white/20 m-12 rounded-3xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
            </div>
          </div>
          <div className="flex h-32 items-center justify-center">
            <button 
              onClick={capturePhoto}
              className="h-20 w-20 rounded-full border-4 border-white/20 p-1 active:scale-90 transition-transform"
            >
              <div className="h-full w-full rounded-full bg-white shadow-xl" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-sage-200 bg-white/95 px-8 pt-4 pb-6 backdrop-blur-lg">
        <NavButton icon={<Camera />} active={currentPage === Page.HOME} onClick={() => setCurrentPage(Page.HOME)} />
        <NavButton icon={<History />} active={currentPage === Page.HISTORY} onClick={() => setCurrentPage(Page.HISTORY)} />
        <NavButton icon={<SettingsIcon />} active={currentPage === Page.SETTINGS} onClick={() => setCurrentPage(Page.SETTINGS)} />
      </nav>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function NavButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 transition-all">
      <div className={cn(
        "p-2 rounded-2xl transition-all",
        active ? "bg-sage-900 text-white shadow-xl scale-110" : "text-sage-400 hover:text-sage-600"
      )}>
        {icon}
      </div>
      {active && <motion.div layoutId="nav-dot" className="h-1 w-1 rounded-full bg-sage-900" />}
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
