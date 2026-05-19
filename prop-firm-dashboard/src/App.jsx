import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, DollarSign, Percent, ShieldAlert, Target, 
  Activity, RefreshCw, BarChart2, Layers, AlertTriangle, Crosshair 
} from 'lucide-react';

// --- UI COMPONENTS ---

const Card = ({ children, className = '', title, icon: Icon }) => (
  <div className={`bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-full ${className}`}>
    {title && (
      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
        {Icon && <Icon size={16} className="text-blue-400" />}
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">{title}</h3>
      </div>
    )}
    <div className="p-4 flex-1 flex flex-col justify-center">{children}</div>
  </div>
);

const StatBox = ({ label, value, subtext, icon: Icon, color = 'text-blue-400', isCurrency = false }) => (
  <div className="flex items-start space-x-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:bg-slate-700/50 transition-colors">
    <div className={`p-3 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50 flex-shrink-0 ${color}`}>
      <Icon size={24} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1 truncate">{label}</p>
      <h4 className={`text-2xl font-black tracking-tight truncate ${isCurrency && value < 0 ? 'text-red-400' : 'text-white'}`}>
        {isCurrency ? (value < 0 ? `-$${Math.abs(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`) : value}
      </h4>
      {subtext && <p className="text-xs text-slate-500 mt-1 truncate">{subtext}</p>}
    </div>
  </div>
);

const ProgressBar = ({ label, percentage, colorClass = "bg-blue-500", suffix="%" }) => (
  <div className="mb-4 last:mb-0 w-full">
    <div className="flex justify-between mb-1">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <span className="text-xs font-bold text-white">{percentage.toFixed(1)}{suffix}</span>
    </div>
    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden shadow-inner border border-slate-700/30">
      <div className={`h-3 rounded-full ${colorClass} transition-all duration-1000 ease-out relative overflow-hidden`} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}>
         <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/20" style={{ transform: 'translateX(-100%)', animation: 'shimmer 2s infinite' }}></div>
      </div>
    </div>
  </div>
);

// --- MAIN APP COMPONENT ---

export default function App() {
  // 1. STATE FOR INPUTS
const [inputs, setInputs] = useState({
    accountSize: 10000,
    challengeCost: 71,
    phases: 2,
    phase1Target: 8.0,
    phase2Target: 4.0,
    maxDrawdown: 8.0, 
    dailyLimit: 4.0,
    profitSplit: 80, // Changed to 80 for whole number percentage input
    phase1Risk: 1.0,
    phase2Risk: 1.0,
    fundedRisk: 1.0, 
    winRate: 50.00,
    rrRatio: 1.0,
    nasVol: 250,
    tradeCost: -0.1,
    simsCount: 10000
  });

  const [results, setResults] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [sampleEquityCurve, setSampleEquityCurve] = useState([]);

  // 2. SIMULATION ENGINE
  const runSimulation = useCallback(() => {
    setIsCalculating(true);

    setTimeout(() => {
      const { 
        accountSize, challengeCost, phases, phase1Target, phase2Target, 
        maxDrawdown, profitSplit, phase1Risk, phase2Risk, fundedRisk, winRate, rrRatio, 
        nasVol, tradeCost, simsCount 
      } = inputs;

      // Force maxDrawdown to be negative for logic, regardless of user input
      const effectiveMaxDD = -Math.abs(maxDrawdown);

      const TOTAL_DAYS = 250;
      const NAS_WR_FRAC = winRate / 100.0;
      
      // Calculate independent net wins/losses for each phase
      const NAS_W_P1 = (phase1Risk * rrRatio) + tradeCost;
      const NAS_L_P1 = -phase1Risk + tradeCost;
      
      const NAS_W_P2 = (phase2Risk * rrRatio) + tradeCost;
      const NAS_L_P2 = -phase2Risk + tradeCost;

      const NAS_W_FUNDED = (fundedRisk * rrRatio) + tradeCost;
      const NAS_L_FUNDED = -fundedRisk + tradeCost;

      const numWins = Math.round(nasVol * NAS_WR_FRAC);
      const numLosses = Math.round(nasVol * (1 - NAS_WR_FRAC));
      const blanks = Math.max(0, TOTAL_DAYS - (numWins + numLosses));

      const buildMasterDays = (w, l) => {
        let days = [];
        for(let i=0; i<numWins; i++) days.push(w);
        for(let i=0; i<numLosses; i++) days.push(l);
        for(let i=0; i<blanks; i++) days.push(null);
        return days;
      };

      let master_days_p1 = buildMasterDays(NAS_W_P1, NAS_L_P1);
      let master_days_p2 = buildMasterDays(NAS_W_P2, NAS_L_P2);
      let master_days_funded = buildMasterDays(NAS_W_FUNDED, NAS_L_FUNDED);

      const shuffle = (array) => {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
          [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
      };

      shuffle(master_days_p1);
      shuffle(master_days_p2);
      shuffle(master_days_funded);

      const simMode = (mode="bootstrapping", skipProb=0.0, insertProb=0.0, sims=simsCount) => {
        let p1_passes = 0, p2_passes = 0, first_payout_hits = 0;
        let days_to_pass_list = [], trades_to_pass_list = [], funded_payouts = [];
        let pass_streaks = [], fail_streaks = [];
        let curr_pass = 0, curr_fail = 0;
        let sampleCurveFound = false;
        let bestCurve = [];
        let mcPaths = [];

        for(let s = 0; s < sims; s++) {
          let local_days_p1 = mode === "permutation" ? shuffle([...master_days_p1]) : master_days_p1;
          let local_days_p2 = mode === "permutation" ? shuffle([...master_days_p2]) : master_days_p2;
          
          let eq = 0.0, total_days = 0, total_trades = 0;
          let p1 = false, p2 = false;
          let currentSimCurve = [0];
          let phase1PathOnly = [0];

          // PHASE 1
          while (eq > effectiveMaxDD && eq < phase1Target && (mode !== "permutation" || total_days < local_days_p1.length)) {
            let trade = mode !== "permutation" ? master_days_p1[Math.floor(Math.random() * master_days_p1.length)] : local_days_p1[total_days];
            total_days++;

            if (trade !== null && Math.random() >= skipProb) {
              if (eq - phase1Risk <= effectiveMaxDD) {
                eq = effectiveMaxDD;
                currentSimCurve.push(eq);
                phase1PathOnly.push(eq);
                break;
              }
              eq += trade;
              total_trades++;
              currentSimCurve.push(eq);
              phase1PathOnly.push(eq);
              if (eq >= phase1Target) { p1 = true; break; }
              if (eq <= effectiveMaxDD) break;
            }
            if (mode === "insertion" && Math.random() < insertProb) {
               if (eq - phase1Risk <= effectiveMaxDD) {
                 eq = effectiveMaxDD;
                 currentSimCurve.push(eq);
                 phase1PathOnly.push(eq);
                 break;
               }
               let inserted = Math.random() < NAS_WR_FRAC ? NAS_W_P1 : NAS_L_P1;
               eq += inserted;
               total_trades++;
               currentSimCurve.push(eq);
               phase1PathOnly.push(eq);
               if (eq >= phase1Target) { p1 = true; break; }
               if (eq <= effectiveMaxDD) break;
            }
          }

          if (mode === "bootstrapping" && s < 50) {
              mcPaths.push([...phase1PathOnly]);
          }

          if (!p1) {
            if(curr_pass > 0) pass_streaks.push(curr_pass);
            curr_fail++; curr_pass = 0;
            continue;
          }
          p1_passes++;

          if (phases === 1) {
            p2 = true;
            p2_passes++;
            const calc_days = nasVol > 0 ? total_trades * (250 / nasVol) : 0;
            days_to_pass_list.push(calc_days);
            trades_to_pass_list.push(total_trades);
            
            if(curr_fail > 0) fail_streaks.push(curr_fail);
            curr_pass++; curr_fail = 0;

            if(!sampleCurveFound && mode === "bootstrapping") {
               bestCurve = [...currentSimCurve];
               sampleCurveFound = true;
            }
          } else {
            // PHASE 2
            eq = 0.0;
            currentSimCurve.push(null);
            currentSimCurve.push(0);

            while (eq > effectiveMaxDD && eq < phase2Target && (mode !== "permutation" || total_days < local_days_p2.length)) {
              let trade = mode !== "permutation" ? master_days_p2[Math.floor(Math.random() * master_days_p2.length)] : local_days_p2[total_days];
              total_days++;

              if (trade !== null && Math.random() >= skipProb) {
                if (eq - phase2Risk <= effectiveMaxDD) {
                  eq = effectiveMaxDD;
                  currentSimCurve.push(eq);
                  break;
                }
                eq += trade;
                total_trades++;
                currentSimCurve.push(eq);
                if (eq >= phase2Target) { p2 = true; break; }
                if (eq <= effectiveMaxDD) break;
              }
              if (mode === "insertion" && Math.random() < insertProb) {
                 if (eq - phase2Risk <= effectiveMaxDD) {
                   eq = effectiveMaxDD;
                   currentSimCurve.push(eq);
                   break;
                 }
                 let inserted = Math.random() < NAS_WR_FRAC ? NAS_W_P2 : NAS_L_P2;
                 eq += inserted;
                 total_trades++;
                 currentSimCurve.push(eq);
                 if (eq >= phase2Target) { p2 = true; break; }
                 if (eq <= effectiveMaxDD) break;
              }
            }

            if (!p2) {
               if(curr_pass > 0) pass_streaks.push(curr_pass);
               curr_fail++; curr_pass = 0;
               continue;
            }
            p2_passes++;
            const calc_days = nasVol > 0 ? total_trades * (250 / nasVol) : 0;
            days_to_pass_list.push(calc_days);
            trades_to_pass_list.push(total_trades);
            
            if(curr_fail > 0) fail_streaks.push(curr_fail);
            curr_pass++; curr_fail = 0;

            if(!sampleCurveFound && mode === "bootstrapping") {
               bestCurve = [...currentSimCurve];
               sampleCurveFound = true;
            }
          }

          // FUNDED MILKING PHASE
          eq = 0.0;
          let payouts = 0;
          while (eq > effectiveMaxDD) {
             let trade = master_days_funded[Math.floor(Math.random() * master_days_funded.length)];
             if (trade !== null && Math.random() >= skipProb) {
                if (eq - fundedRisk <= effectiveMaxDD) {
                   break;
                }
                eq += trade;
                if (eq <= effectiveMaxDD) break;
                if (eq >= NAS_W_FUNDED) { payouts++; eq = 0.0; }
             }
             if (mode === "insertion" && Math.random() < insertProb) {
                 if (eq - fundedRisk <= effectiveMaxDD) {
                    break;
                 }
                 let inserted = Math.random() < NAS_WR_FRAC ? NAS_W_FUNDED : NAS_L_FUNDED;
                 eq += inserted;
                 if (eq <= effectiveMaxDD) break;
                 if (eq >= NAS_W_FUNDED) { payouts++; eq = 0.0; }
             }
          }
          funded_payouts.push(payouts);
          if (payouts >= 1) first_payout_hits++;
        }

        const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
        
        if (mode === "bootstrapping") setSampleEquityCurve(bestCurve);

        return {
          p1_rate: p1_passes / sims,
          p2_rate: p1_passes > 0 ? p2_passes / p1_passes : 0,
          funded_rate: p2_passes / sims,
          prob_payout_scratch: first_payout_hits / sims,
          prob_payout_funded: p2_passes > 0 ? first_payout_hits / p2_passes : 0,
          avg_trades: avg(trades_to_pass_list),
          avg_days: avg(days_to_pass_list),
          mc_paths: mcPaths, 
          avg_payouts: avg(funded_payouts),
          best_streak: Math.max(0, ...pass_streaks),
          worst_streak: Math.max(0, ...fail_streaks),
          avg_pass_streak: avg(pass_streaks),
          avg_fail_streak: avg(fail_streaks)
        };
      };

      const run_mcdd = () => {
         let dd_hits = 0;
         const trades_in_40d = Math.round(nasVol * (40 / 250));
         
         if (trades_in_40d === 0) return 0;

         for(let i=0; i<simsCount; i++) {
            let eq = 0.0, max_eq = 0.0;
            for(let t=0; t<trades_in_40d; t++) {
               // Pick trade based strictly on probability (ignores empty days)
               let trade = Math.random() < NAS_WR_FRAC ? NAS_W_FUNDED : NAS_L_FUNDED;
               
               if (eq - max_eq - fundedRisk <= effectiveMaxDD) {
                  dd_hits++; break;
               }
               eq += trade;
               if(eq > max_eq) max_eq = eq;
               if(eq - max_eq <= effectiveMaxDD) {
                  dd_hits++; break;
               }
            }
         }
         return dd_hits / simsCount;
      };

      const resBoot = simMode("bootstrapping");
      const resPerm = simMode("permutation");
      const resSkip = simMode("skipping", 0.15);
      const resInsert = simMode("insertion", 0.0, 0.10);
      const mcddRisk = run_mcdd();

      // Financials (Converted profitSplit to percentage decimal, using Funded Risk expected payout)
      const AVG_PAYOUT_VAL = (accountSize * (NAS_W_FUNDED / 100)) * (profitSplit / 100);
      const spent10 = 10 * challengeCost;
      const fundedAccs10 = 10 * resBoot.funded_rate;
      const grossRev10 = fundedAccs10 * resBoot.avg_payouts * AVG_PAYOUT_VAL;
      const netProfit10 = grossRev10 - spent10;

      setResults({
        base: resBoot,
        stress: { perm: resPerm.funded_rate, skip: resSkip.funded_rate, insert: resInsert.funded_rate, mcdd: mcddRisk },
        financials: { avgVal: AVG_PAYOUT_VAL, spent10, fundedAccs10, grossRev10, netProfit10 },
        effectiveMaxDD,
        NAS_W_P1,
        NAS_L_P1,
        NAS_W_P2,
        NAS_L_P2,
        NAS_W_FUNDED,
        NAS_L_FUNDED
      });

      setIsCalculating(false);
    }, 50); 
  }, [inputs]);

  useEffect(() => {
    runSimulation();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value === '' ? '' : parseFloat(value) || 0 }));
  };

  // --- RENDER HELPERS ---
  
  const renderEquityCurve = () => {
    if (!sampleEquityCurve || sampleEquityCurve.length === 0) return null;
    
    const splitIndex = sampleEquityCurve.indexOf(null);
    const p1Curve = splitIndex !== -1 ? sampleEquityCurve.slice(0, splitIndex) : sampleEquityCurve;
    const p2Curve = splitIndex !== -1 ? sampleEquityCurve.slice(splitIndex + 1) : [];

    const getPolylinePoints = (arr, width, height, min, max) => {
      if(!arr.length) return "";
      const range = max - min || 1;
      return arr.map((val, i) => {
        const x = (i / (arr.length - 1 || 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
      }).join(' ');
    };

    const minEq = Math.min(...sampleEquityCurve.filter(v => v !== null), results.effectiveMaxDD);
    const maxEq = Math.max(...sampleEquityCurve.filter(v => v !== null), inputs.phase1Target);
    
    return (
      <div className="w-full h-48 bg-slate-900 rounded-lg relative overflow-hidden p-2 border border-slate-700 shadow-inner flex-shrink-0">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <line x1="0" y1={100 - ((0 - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((0 - minEq) / (maxEq - minEq)) * 100} stroke="#475569" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1={100 - ((inputs.phase1Target - minEq) / (maxEq - minEq)) * 100} x2={inputs.phases === 1 ? "100" : "50"} y2={100 - ((inputs.phase1Target - minEq) / (maxEq - minEq)) * 100} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" />
          {inputs.phases === 2 && (
            <line x1="50" y1={100 - ((inputs.phase2Target - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((inputs.phase2Target - minEq) / (maxEq - minEq)) * 100} stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="1,1" />
          )}
          <line x1="0" y1={100 - ((results.effectiveMaxDD - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((results.effectiveMaxDD - minEq) / (maxEq - minEq)) * 100} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1,1" />

          <polyline points={getPolylinePoints(p1Curve, inputs.phases === 1 ? 100 : 50, 100, minEq, maxEq)} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
          {p2Curve.length > 0 && inputs.phases === 2 && (
            <polyline points={getPolylinePoints(p2Curve, 50, 100, minEq, maxEq).split(' ').map(p => {const [x,y] = p.split(','); return `${parseFloat(x)+50},${y}`}).join(' ')} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
          )}
        </svg>
        <div className="absolute top-2 left-2 text-[10px] text-green-400 font-bold bg-slate-900/90 px-2 py-0.5 rounded border border-green-500/20">{inputs.phases === 1 ? 'Target' : 'Phase 1 Target'}</div>
        <div className="absolute bottom-2 left-2 text-[10px] text-red-400 font-bold bg-slate-900/90 px-2 py-0.5 rounded border border-red-500/20">Max Drawdown ({results.effectiveMaxDD}%)</div>
      </div>
    );
  };

  const renderSpaghettiChart = () => {
    if(!results || !results.base.mc_paths.length) return null;
    
    const paths = results.base.mc_paths;
    const maxLen = Math.max(...paths.map(p => p.length), 10);
    const minEq = results.effectiveMaxDD * 1.1;
    const maxEq = inputs.phase1Target * 1.1;

    return (
      <div className="w-full h-48 bg-slate-900 rounded-lg relative overflow-hidden p-2 border border-slate-700 shadow-inner flex-shrink-0">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <line x1="0" y1={100 - ((0 - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((0 - minEq) / (maxEq - minEq)) * 100} stroke="#475569" strokeWidth="1" />
          <line x1="0" y1={100 - ((inputs.phase1Target - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((inputs.phase1Target - minEq) / (maxEq - minEq)) * 100} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1={100 - ((results.effectiveMaxDD - minEq) / (maxEq - minEq)) * 100} x2="100" y2={100 - ((results.effectiveMaxDD - minEq) / (maxEq - minEq)) * 100} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2,2" />
          
          {paths.map((path, i) => {
            const isPass = path[path.length - 1] >= inputs.phase1Target;
            const isFail = path[path.length - 1] <= results.effectiveMaxDD;
            const strokeColor = isPass ? "#22c55e" : (isFail ? "#ef4444" : "#64748b");
            
            return (
              <polyline 
                key={i}
                points={path.map((val, j) => `${(j/maxLen)*100},${100 - ((val - minEq)/(maxEq - minEq)) * 100}`).join(' ')}
                fill="none" 
                stroke={strokeColor} 
                strokeWidth={isPass ? "1.5" : "0.5"} 
                strokeOpacity={isPass ? "0.8" : "0.3"}
                strokeLinejoin="round" 
              />
            )
          })}
        </svg>
        <div className="absolute top-2 left-2 text-[10px] text-slate-300 font-bold bg-slate-900/80 px-1 rounded shadow">Phase 1 Drift Map (50 Random Paths)</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-3 sm:p-4 md:p-8 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      
      {/* Background ambient glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/10 blur-[120px]"></div>
      </div>

      <div className="max-w-[1400px] w-full mx-auto space-y-6 relative z-10">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/80 backdrop-blur-md p-5 sm:p-6 rounded-2xl border border-slate-700/50 shadow-2xl">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 drop-shadow-sm">
              Prop Firm Stress Tester
            </h1>
            <p className="text-sm sm:text-base text-slate-400 mt-1 flex items-center gap-2 font-medium">
              <Activity size={16} className="text-blue-500 flex-shrink-0"/> Advanced Prop Firm Monte Carlo Engine
            </p>
          </div>
          <button 
            onClick={runSimulation}
            disabled={isCalculating}
            className={`w-full md:w-auto mt-5 md:mt-0 flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 rounded-xl font-bold transition-all shadow-xl
              ${isCalculating ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white hover:shadow-blue-500/25 border border-blue-500/50 hover:scale-[1.02]'}`}
          >
            <RefreshCw size={18} className={isCalculating ? 'animate-spin' : ''} />
            {isCalculating ? 'Simulating 10k Paths...' : 'Run Simulation'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN - INPUTS */}
          <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-6">
            <Card title="Strategy Metrics" icon={Crosshair}>
              <div className="space-y-4">
                {inputs.phases === 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Chal. Risk (%)</label>
                      <input type="number" step="0.1" name="phase1Risk" value={inputs.phase1Risk} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Funded Risk (%)</label>
                      <input type="number" step="0.1" name="fundedRisk" value={inputs.fundedRisk} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Ph 1 Risk (%)</label>
                      <input type="number" step="0.1" name="phase1Risk" value={inputs.phase1Risk} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner text-sm" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Ph 2 Risk (%)</label>
                      <input type="number" step="0.1" name="phase2Risk" value={inputs.phase2Risk} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner text-sm" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Funded Risk</label>
                      <input type="number" step="0.1" name="fundedRisk" value={inputs.fundedRisk} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner text-sm" />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Win Rate (%)</label>
                  <input type="number" step="0.1" name="winRate" value={inputs.winRate} onChange={handleInputChange} 
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Reward/Risk Ratio</label>
                  <input type="number" step="0.01" name="rrRatio" value={inputs.rrRatio} onChange={handleInputChange} 
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Trade Friction (%)</label>
                  <input type="number" step="0.01" name="tradeCost" value={inputs.tradeCost} onChange={handleInputChange} 
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Trades Per Year (Vol)</label>
                  <input type="number" step="1" name="nasVol" value={inputs.nasVol} onChange={handleInputChange} 
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                </div>
                
                {results && (
                  <div className="pt-4 border-t border-slate-700/50 mt-4 bg-slate-900/30 -mx-4 -mb-4 p-4">
                     <div className={`grid ${inputs.phases === 2 ? 'grid-cols-2 gap-x-4 gap-y-3' : 'grid-cols-2 gap-x-4'} text-[11px]`}>
                        <div>
                           <p className="text-slate-500 font-bold mb-1 border-b border-slate-700/50 pb-1">{inputs.phases === 2 ? 'Phase 1' : 'Challenge'}</p>
                           <div className="flex justify-between items-center"><span className="text-emerald-500/80">W:</span> <span className="text-emerald-400 font-black">+{results.NAS_W_P1.toFixed(2)}%</span></div>
                           <div className="flex justify-between items-center"><span className="text-red-500/80">L:</span> <span className="text-red-400 font-black">{results.NAS_L_P1.toFixed(2)}%</span></div>
                        </div>
                        
                        {inputs.phases === 2 ? (
                          <div>
                             <p className="text-slate-500 font-bold mb-1 border-b border-slate-700/50 pb-1">Phase 2</p>
                             <div className="flex justify-between items-center"><span className="text-emerald-500/80">W:</span> <span className="text-emerald-400 font-black">+{results.NAS_W_P2.toFixed(2)}%</span></div>
                             <div className="flex justify-between items-center"><span className="text-red-500/80">L:</span> <span className="text-red-400 font-black">{results.NAS_L_P2.toFixed(2)}%</span></div>
                          </div>
                        ) : (
                          <div>
                             <p className="text-slate-500 font-bold mb-1 border-b border-slate-700/50 pb-1">Funded</p>
                             <div className="flex justify-between items-center"><span className="text-emerald-500/80">W:</span> <span className="text-emerald-400 font-black">+{results.NAS_W_FUNDED.toFixed(2)}%</span></div>
                             <div className="flex justify-between items-center"><span className="text-red-500/80">L:</span> <span className="text-red-400 font-black">{results.NAS_L_FUNDED.toFixed(2)}%</span></div>
                          </div>
                        )}
                        
                        {inputs.phases === 2 && (
                          <div className="col-span-2 pt-1">
                             <p className="text-slate-500 font-bold mb-1 border-b border-slate-700/50 pb-1">Funded</p>
                             <div className="grid grid-cols-2 gap-4">
                               <div className="flex justify-between items-center"><span className="text-emerald-500/80">W:</span> <span className="text-emerald-400 font-black">+{results.NAS_W_FUNDED.toFixed(2)}%</span></div>
                               <div className="flex justify-between items-center"><span className="text-red-500/80">L:</span> <span className="text-red-400 font-black">{results.NAS_L_FUNDED.toFixed(2)}%</span></div>
                             </div>
                          </div>
                        )}
                     </div>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Firm Parameters" icon={Layers}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Acc Size ($)</label>
                    <input type="number" name="accountSize" value={inputs.accountSize} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Cost ($)</label>
                    <input type="number" name="challengeCost" value={inputs.challengeCost} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Phases</label>
                    <select name="phases" value={inputs.phases} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner">
                      <option value={1}>1-Phase</option>
                      <option value={2}>2-Phase</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Profit Split (%)</label>
                    <input type="number" step="1" name="profitSplit" value={inputs.profitSplit} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{inputs.phases === 1 ? 'Target (%)' : 'Ph 1 Tar (%)'}</label>
                    <input type="number" step="0.1" name="phase1Target" value={inputs.phase1Target} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                  </div>
                  {inputs.phases === 2 ? (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Ph 2 Tar (%)</label>
                      <input type="number" step="0.1" name="phase2Target" value={inputs.phase2Target} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex justify-between">
                        <span>Max DD (%)</span>
                        <span className="text-blue-400 text-[9px]">(Pos or Neg)</span>
                      </label>
                      <input type="number" step="0.1" name="maxDrawdown" value={inputs.maxDrawdown} onChange={handleInputChange} 
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                    </div>
                  )}
                </div>
                {inputs.phases === 2 && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex justify-between">
                      <span>Max Drawdown (%)</span>
                      <span className="text-blue-400 text-[9px]">(Pos or Neg)</span>
                    </label>
                    <input type="number" step="0.1" name="maxDrawdown" value={inputs.maxDrawdown} onChange={handleInputChange} 
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN - RESULTS & CHARTS */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            
            {/* TIER 1: MAIN KPIs */}
            {results && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatBox 
                  label="Overall Funded Rate" 
                  value={`${(results.base.funded_rate * 100).toFixed(1)}%`} 
                  subtext="From phase 1 start to funded"
                  icon={Target}
                  color="text-emerald-400"
                />
                <StatBox 
                  label="Avg Payouts per Acc" 
                  value={results.base.avg_payouts.toFixed(2)} 
                  subtext={`Worth $${results.financials.avgVal.toLocaleString(undefined, {maximumFractionDigits:0})} each`}
                  icon={DollarSign}
                  color="text-blue-400"
                />
                <StatBox 
                  label="Est. Timeline to Fund" 
                  value={`${(results.base.avg_days / 5).toFixed(1)} Weeks`} 
                  subtext={`${results.base.avg_days.toFixed(0)} trading days`}
                  icon={Activity}
                  color="text-purple-400"
                />
              </div>
            )}

            {/* TIER 2: CHARTS 2x2 GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Funnel */}
              <Card title="Pass Rate Funnel" icon={TrendingUp}>
                {results ? (
                  <div className="flex flex-col h-full justify-between">
                    <div className="space-y-6 w-full">
                      <ProgressBar label={inputs.phases === 1 ? "Passing Rate" : "Phase 1 Passing Rate"} percentage={results.base.p1_rate * 100} colorClass="bg-gradient-to-r from-emerald-600 to-emerald-400" />
                      {inputs.phases === 2 && (
                        <ProgressBar label="Phase 2 Passing Rate (Given P1)" percentage={results.base.p2_rate * 100} colorClass="bg-gradient-to-r from-blue-600 to-cyan-400" />
                      )}
                      <ProgressBar label="Overall Funded Rate" percentage={results.base.funded_rate * 100} colorClass="bg-gradient-to-r from-purple-600 to-purple-400" />
                    </div>
                    
                    <div className="mt-8 pt-4 border-t border-slate-700/50 bg-slate-900/30 -mx-4 -mb-4 p-4">
                      <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wide"><AlertTriangle className="inline w-4 h-4 mr-1 text-yellow-500 mb-0.5"/>Stress Testing (Funded Rates)</p>
                      <div className="grid grid-cols-3 gap-3 text-center text-xs">
                        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700/50 shadow-inner">
                          <span className="block text-slate-400 mb-1 font-medium">Permutation</span>
                          <span className="font-black text-white text-lg">{(results.stress.perm * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700/50 shadow-inner">
                          <span className="block text-slate-400 mb-1 font-medium">Miss 15%</span>
                          <span className="font-black text-white text-lg">{(results.stress.skip * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700/50 shadow-inner">
                          <span className="block text-slate-400 mb-1 font-medium">Tilt 10%</span>
                          <span className="font-black text-white text-lg">{(results.stress.insert * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : <div className="animate-pulse h-64 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

              {/* Probabilities Scaling */}
              <Card title="Probabilities Scaling" icon={Percent}>
                {results ? (
                  <div className="flex flex-col h-full w-full justify-center">
                    <p className="text-xs text-slate-400 mb-4 shrink-0">Likelihood of success based on number of attempts.</p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700/50 shadow-inner">
                      <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/80 border-b border-slate-700/50">
                          <tr>
                            <th className="px-4 py-3 font-bold">Attempts</th>
                            <th className="px-4 py-3 text-right font-bold">≥1 Funded</th>
                            <th className="px-4 py-3 text-right font-bold">≥1 Payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 bg-slate-800/30">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                            const probFunded = 1 - Math.pow(1 - results.base.funded_rate, num);
                            const probPayout = 1 - Math.pow(1 - results.base.prob_payout_scratch, num);
                            return (
                              <tr key={num} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-2 font-medium text-slate-300">{num} Challenge{num > 1 ? 's' : ''}</td>
                                <td className="px-4 py-2 text-right text-emerald-400 font-bold">{(probFunded * 100).toFixed(1)}%</td>
                                <td className="px-4 py-2 text-right text-blue-400 font-bold">{(probPayout * 100).toFixed(1)}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : <div className="animate-pulse h-64 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

              {/* Spaghetti */}
              <Card title="Monte Carlo Variance Map" icon={Activity}>
                {results ? (
                  <div className="flex flex-col h-full justify-center w-full">
                    {renderSpaghettiChart()}
                    <p className="text-[10px] text-slate-500 text-center mt-3 font-medium uppercase tracking-wider shrink-0">Simulates 50 independent parallel Phase 1 paths</p>
                  </div>
                ) : <div className="animate-pulse h-48 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

              {/* Equity Curve */}
              <Card title="Sample Success Trajectory" icon={TrendingUp}>
                {results ? (
                  <div className="flex flex-col h-full justify-center w-full">
                    {renderEquityCurve()}
                    <p className="text-[10px] text-slate-500 text-center mt-3 font-medium uppercase tracking-wider shrink-0">A randomly selected passing evaluation {inputs.phases === 2 ? '(Ph 1 + Ph 2)' : ''}</p>
                  </div>
                ) : <div className="animate-pulse h-48 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

            </div>

            {/* TIER 3: FINANCIALS & STREAKS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <Card title="Financial Milking Model (10 Challenges)" className="border-emerald-500/30" icon={DollarSign}>
                {results ? (
                  <div className="space-y-4 w-full flex-1 flex flex-col justify-center">
                     <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 shadow-inner">
                        <span className="text-slate-400 text-sm font-medium">Total Initial Cost</span>
                        <span className="text-white font-black text-lg">${results.financials.spent10.toLocaleString()}</span>
                     </div>
                     <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 shadow-inner">
                        <span className="text-slate-400 text-sm font-medium">Expected Funded Accs</span>
                        <span className="text-blue-400 font-black text-lg">{results.financials.fundedAccs10.toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 shadow-inner">
                        <span className="text-slate-400 text-sm font-medium">Expected Gross Rev</span>
                        <span className="text-emerald-400 font-black text-lg">${results.financials.grossRev10.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                     </div>
                     <div className="mt-4 pt-6 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
                        <span className="text-slate-300 font-black tracking-wide uppercase text-sm sm:text-base">Net Profit (Expected)</span>
                        <span className={`text-3xl sm:text-4xl font-black drop-shadow-md ${results.financials.netProfit10 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {results.financials.netProfit10 >= 0 ? '+' : '-'}${Math.abs(results.financials.netProfit10).toLocaleString(undefined, {maximumFractionDigits:0})}
                        </span>
                     </div>
                  </div>
                ) : <div className="animate-pulse h-64 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

              <Card title="Performance Streaks & Risk" icon={ShieldAlert}>
                {results ? (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 h-full w-full">
                    <div className="bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-700/50 shadow-inner flex flex-col items-center justify-center text-center hover:bg-slate-800/80 transition-colors">
                      <span className="text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2">Max Blown Streak</span>
                      <span className="text-3xl sm:text-4xl font-black text-red-400 drop-shadow">{results.base.worst_streak}</span>
                    </div>
                    <div className="bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-700/50 shadow-inner flex flex-col items-center justify-center text-center hover:bg-slate-800/80 transition-colors">
                      <span className="text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2">Max Pass Streak</span>
                      <span className="text-3xl sm:text-4xl font-black text-emerald-400 drop-shadow">{results.base.best_streak}</span>
                    </div>
                    <div className="bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-700/50 shadow-inner flex flex-col items-center justify-center text-center hover:bg-slate-800/80 transition-colors">
                      <span className="text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2">Avg Trades to Pass</span>
                      <span className="text-3xl sm:text-4xl font-black text-blue-400 drop-shadow">{results.base.avg_trades.toFixed(0)}</span>
                    </div>
                    <div className="bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-700/50 shadow-inner flex flex-col items-center justify-center text-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-red-500/5 group-hover:bg-red-500/10 transition-colors pointer-events-none"></div>
                      <span className="text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2 z-10">40-Day Ruin Risk</span>
                      <span className="text-3xl sm:text-4xl font-black text-red-400 drop-shadow z-10">{(results.stress.mcdd * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ) : <div className="animate-pulse h-64 bg-slate-800 rounded-lg w-full"></div>}
              </Card>

            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}