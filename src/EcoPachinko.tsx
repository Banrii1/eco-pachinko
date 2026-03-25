import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, Leaf, Droplets, Wind, Sun, Bike, ShoppingBasket, Recycle, 
  LogOut, Sprout, TreeDeciduous, Package, ShoppingBag, Flower2, Lightbulb 
} from 'lucide-react';
import { cn } from './lib/utils';

// --- Constants & Types ---
const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 600;
const BALL_RADIUS = 10;
const PIN_RADIUS = 6;
const SLOT_COUNT = 11;

type RewardType = 'tree' | 'sprout' | 'water' | 'compost' | 'solar' | 'bag' | 'bike' | 'wind' | 'flower' | 'bulb' | 'recycle';

interface Slot {
  id: number;
  label: string;
  reward: RewardType;
  value: string;
}

const SLOTS: Slot[] = [
  { id: 0, label: '100', reward: 'tree', value: '100' },
  { id: 1, label: '200', reward: 'sprout', value: '200' },
  { id: 2, label: '400', reward: 'water', value: '400' },
  { id: 3, label: '1k', reward: 'compost', value: '1k' },
  { id: 4, label: '2k', reward: 'solar', value: '2k' },
  { id: 5, label: 'JACKPOT', reward: 'bag', value: '1k' },
  { id: 6, label: '2k', reward: 'bike', value: '2k' },
  { id: 7, label: '1k', reward: 'wind', value: '1k' },
  { id: 8, label: '400', reward: 'flower', value: '400' },
  { id: 9, label: '200', reward: 'bulb', value: '200' },
  { id: 10, label: '100', reward: 'recycle', value: '100' },
];

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
  vr: number; // Rotation velocity
  rotation: number;
  size: number;
  life: number;
  type: 'spore' | 'sparkle' | 'leaf';
}

// --- Helper Components ---

const RewardIcon = ({ type, className }: { type: RewardType; className?: string }) => {
  switch (type) {
    case 'tree': return <TreeDeciduous className={cn("text-emerald-600", className)} />;
    case 'sprout': return <Sprout className={cn("text-lime-500", className)} />;
    case 'water': return <Droplets className={cn("text-blue-400", className)} />;
    case 'compost': return <Package className={cn("text-amber-700", className)} />;
    case 'solar': return <Sun className={cn("text-yellow-400", className)} />;
    case 'bag': return <ShoppingBag className={cn("text-emerald-700", className)} />;
    case 'bike': return <Bike className={cn("text-stone-600", className)} />;
    case 'wind': return <Wind className={cn("text-sky-300", className)} />;
    case 'flower': return <Flower2 className={cn("text-orange-400", className)} />;
    case 'bulb': return <Lightbulb className={cn("text-yellow-200", className)} />;
    case 'recycle': return <Recycle className={cn("text-emerald-500", className)} />;
  }
};

// --- Main Game Component ---

export default function EcoPachinko() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  
  const [score, setScore] = useState(0);
  const [triesLeft, setTriesLeft] = useState(10);
  const [inputTries, setInputTries] = useState(10);
  const [gameStarted, setGameStarted] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dropperX, setDropperX] = useState(BOARD_WIDTH / 2);
  const [activeMushrooms, setActiveMushrooms] = useState<Record<string, number>>({});
  const [ballsInBaskets, setBallsInBaskets] = useState<Record<number, number>>({});
  const [pins, setPins] = useState<{x: number, y: number, id: string}[]>([]);
  const [isJackpotSeedActive, setIsJackpotSeedActive] = useState(false);
  const [lifetimeTries, setLifetimeTries] = useState(0);

  const resetGame = () => {
    setTriesLeft(inputTries);
    setScore(0);
    setBallsInBaskets({});
    setShowCongrats(false);
    if (engineRef.current) {
      const world = engineRef.current.world;
      const balls = Matter.Composite.allBodies(world).filter(b => b.label === 'ball' || b.label === 'ball-jackpot');
      balls.forEach(ball => Matter.World.remove(world, ball));
    }
  };

  const startGame = () => {
    setTriesLeft(inputTries);
    setGameStarted(true);
    setScore(0);
    setBallsInBaskets({});
  };

  // Dropper Swinging Logic
  useEffect(() => {
    let startTime = Date.now();
    const swing = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      // Oscillate between 100 and 700 (BOARD_WIDTH - 100)
      const newX = BOARD_WIDTH / 2 + Math.sin(elapsed * 1.5) * (BOARD_WIDTH / 2 - 100);
      setDropperX(newX);
      requestAnimationFrame(swing);
    };
    const frameId = requestAnimationFrame(swing);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Game Over Detection: Return to start screen when tries are out and balls are cleared
  useEffect(() => {
    if (gameStarted && triesLeft === 0) {
      const checkEnd = setInterval(() => {
        if (engineRef.current) {
          const balls = Matter.Composite.allBodies(engineRef.current.world).filter(b => b.label === 'ball' || b.label === 'ball-jackpot');
          if (balls.length === 0) {
            setGameStarted(false);
            clearInterval(checkEnd);
          }
        }
      }, 2000);
      return () => clearInterval(checkEnd);
    }
  }, [gameStarted, triesLeft]);

  // Initialize Physics Engine
  useEffect(() => {
    if (!sceneRef.current) return;

    const engine = Matter.Engine.create();
    engine.gravity.y = 0.7; // Increased gravity for 15% faster fall
    const world = engine.world;
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        wireframes: false,
        background: 'transparent',
      },
    });
    renderRef.current = render;

    // Walls (Bamboo Frame)
    const wallOptions = { isStatic: true, restitution: 0.6, friction: 0.1, render: { visible: false } };
    const leftWall = Matter.Bodies.rectangle(0, BOARD_HEIGHT / 2, 20, BOARD_HEIGHT, wallOptions);
    const rightWall = Matter.Bodies.rectangle(BOARD_WIDTH, BOARD_HEIGHT / 2, 20, BOARD_HEIGHT, wallOptions);
    const bottomWall = Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + 10, BOARD_WIDTH, 20, { ...wallOptions, isSensor: true });
    
    // Symmetrical Pin Layout (Classic Staggered Grid) - Wider and clear of baskets
    const pinBodies: Matter.Body[] = [];
    const pinData: {x: number, y: number, id: string}[] = [];
    
    const ROWS = 9; // Increased rows for more density
    const PINS_PER_ROW = 15; // Increased for more side coverage
    const ROW_SPACING = 50;
    const PIN_SPACING = 52;
    const START_Y = 80;

    for (let row = 0; row < ROWS; row++) {
      const isStaggered = row % 2 !== 0;
      const count = isStaggered ? PINS_PER_ROW - 1 : PINS_PER_ROW;
      const rowWidth = (count - 1) * PIN_SPACING;
      const startX = (BOARD_WIDTH - rowWidth) / 2;

      for (let i = 0; i < count; i++) {
        const x = startX + i * PIN_SPACING;
        const y = START_Y + row * ROW_SPACING;
        
        const id = `pin-${row}-${i}`;
        
        // Skip pins that overlap with the basket UI
        if (y > BOARD_HEIGHT - 140) continue;

        const pin = Matter.Bodies.circle(x, y, PIN_RADIUS, {
          isStatic: true,
          label: id,
          restitution: 1.1, // Increased bounciness for pins
          friction: 0.01,
          render: { visible: false }
        });
        pinBodies.push(pin);
        pinData.push({ x, y, id });
      }
    }
    setPins(pinData);

    // Slots (Bamboo Cups)
    const slots: Matter.Body[] = [];
    const slotWidth = BOARD_WIDTH / SLOT_COUNT;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const x = i * slotWidth + slotWidth / 2;
      const slot = Matter.Bodies.rectangle(x, BOARD_HEIGHT - 30, slotWidth - 10, 60, {
        isStatic: true,
        isSensor: true,
        label: `slot-${i}`,
        render: { visible: false }
      });
      slots.push(slot);
    }

    Matter.World.add(world, [leftWall, rightWall, bottomWall, ...pinBodies, ...slots]);

    // Collision Events
    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const labels = [bodyA.label, bodyB.label];
        
        // Pin Hit Effect (Mushroom Squish)
        const pinBody = bodyA.label?.startsWith('pin-') ? bodyA : (bodyB.label?.startsWith('pin-') ? bodyB : null);
        if (pinBody) {
          const id = pinBody.label;
          setActiveMushrooms(prev => ({ ...prev, [id]: Date.now() }));
          createParticles(pinBody.position.x, pinBody.position.y, '#99f6e4', 'spore'); // Spore puff
        }

        // Slot Scoring
        const slotLabel = labels.find(l => l && l.startsWith('slot-'));
        if (slotLabel) {
          const ball = (bodyA.label === 'ball' || bodyA.label === 'ball-jackpot') ? bodyA : 
                       ((bodyB.label === 'ball' || bodyB.label === 'ball-jackpot') ? bodyB : null);
          if (ball) {
            const slotIndex = parseInt(slotLabel.split('-')[1]);
            const slotData = SLOTS[slotIndex];
            
            // Add score based on slot value
            let val = slotData.value.endsWith('k') ? parseInt(slotData.value) * 1000 : parseInt(slotData.value);
            let isJackpotWin = ball.label === 'ball-jackpot';

            if (isJackpotWin) {
              val = 10000;
              setShowCongrats(true);
            }
            
            setScore(prev => prev + val);
            setBallsInBaskets(prev => ({
              ...prev,
              [slotIndex]: (prev[slotIndex] || 0) + 1
            }));
            
            Matter.World.remove(world, ball);
            createParticles(ball.position.x, ball.position.y, isJackpotWin ? '#fbbf24' : '#10b981', 'leaf');
            createParticles(ball.position.x, ball.position.y, isJackpotWin ? '#fef08a' : '#fbbf24', 'sparkle');
          }
        }
      });
    });

    // Stuck Ball Prevention (Nudge)
    const ballLastPositions = new Map<number, { x: number, y: number, time: number }>();
    Matter.Events.on(engine, 'afterUpdate', () => {
      const balls = Matter.Composite.allBodies(world).filter(b => b.label === 'ball' || b.label === 'ball-jackpot');
      const now = Date.now();
      
      balls.forEach(ball => {
        const last = ballLastPositions.get(ball.id);
        if (last) {
          const dist = Math.hypot(ball.position.x - last.x, ball.position.y - last.y);
          if (dist < 0.5) {
            if (now - last.time > 1500) { // Stuck for 1.5s
              Matter.Body.applyForce(ball, ball.position, { 
                x: (Math.random() - 0.5) * 0.005, 
                y: -0.002 
              });
              ballLastPositions.set(ball.id, { x: ball.position.x, y: ball.position.y, time: now });
            }
          } else {
            ballLastPositions.set(ball.id, { x: ball.position.x, y: ball.position.y, time: now });
          }
        } else {
          ballLastPositions.set(ball.id, { x: ball.position.x, y: ball.position.y, time: now });
        }
      });
    });

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);
    runnerRef.current = runner;

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      render.canvas.remove();
    };
  }, []);

  const createParticles = (x: number, y: number, color: string, type: 'spore' | 'sparkle' | 'leaf' = 'sparkle') => {
    const newParticles: Particle[] = [];
    const count = type === 'spore' ? 15 : (type === 'leaf' ? 8 : 10);
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (type === 'spore' ? 2 : 4) + 1;
      
      newParticles.push({
        id: Math.random(),
        x,
        y,
        color: type === 'spore' ? '#f0fdf4' : (type === 'leaf' ? '#4ade80' : '#fef08a'),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'spore' ? 1 : 0), // Spores drift up
        vr: (Math.random() - 0.5) * 10,
        rotation: Math.random() * 360,
        size: Math.random() * (type === 'leaf' ? 8 : 4) + 2,
        life: 1,
        type,
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  // Particle Animation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy + (p.type === 'leaf' ? 0.1 : 0), // Leaves fall slowly
            vx: p.vx * 0.98 + (p.type === 'spore' ? Math.sin(Date.now() / 500) * 0.05 : 0), // Spores drift
            vy: p.vy * 0.98,
            rotation: p.rotation + p.vr,
            life: p.life - (p.type === 'spore' ? 0.015 : 0.025),
          }))
          .filter(p => p.life > 0)
      );
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const dropBall = useCallback(() => {
    if (!engineRef.current || triesLeft <= 0 || !gameStarted) return;
    
    const nextLifetimeTries = lifetimeTries + 1;
    const isJackpot = nextLifetimeTries % 200 === 0;
    setLifetimeTries(nextLifetimeTries);
    
    const ball = Matter.Bodies.circle(dropperX, 40, BALL_RADIUS, {
      restitution: 1.05, // Even bouncier ball
      friction: 0.01,
      frictionAir: 0.015, // Reduced air friction for faster movement
      label: isJackpot ? 'ball-jackpot' : 'ball',
      render: {
        fillStyle: isJackpot ? '#fbbf24' : '#4ade80', // Golden for jackpot, green for normal
        strokeStyle: isJackpot ? '#d97706' : '#16a34a',
        lineWidth: isJackpot ? 4 : 2,
      }
    });

    if (isJackpot) {
      setIsJackpotSeedActive(true);
      setTimeout(() => setIsJackpotSeedActive(false), 3000);
    }
    
    Matter.World.add(engineRef.current.world, ball);
    setTriesLeft(prev => prev - 1);
  }, [dropperX, triesLeft, gameStarted, lifetimeTries]);

  return (
    <div className="fixed inset-0 bg-[#a5f3fc] flex items-center justify-center overflow-hidden font-sans select-none">
      {/* Background Texture (Light Blue with Leaves) */}
      <div className="absolute inset-0 opacity-40 pointer-events-none" 
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/leaf.png")' }} />
      
      {/* Main Game Interface */}
      <div className="relative flex flex-row items-center justify-center w-full h-full max-w-[1400px] px-4">
        
        {/* Left Sidebar: Score & Tries */}
        <div className="flex flex-col items-center justify-center h-[90%] w-48 py-4 gap-8">
            {/* Score Display (Stone Style) */}
            <div className="bg-[#e2e8f0] px-6 py-3 rounded-2xl border-4 border-stone-300 shadow-[0_6px_0_#94a3b8] flex flex-col items-center w-full">
               <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Total Score</span>
               <div className="flex items-center gap-1 mb-1">
                 <Leaf className="text-emerald-500 w-5 h-5 fill-emerald-500" />
               </div>
               <span className="text-2xl font-black text-stone-700 tabular-nums tracking-tight">{score.toLocaleString()}</span>
            </div>

            {/* Tries Left Display */}
            <div className="bg-[#e2e8f0] px-6 py-3 rounded-2xl border-4 border-stone-300 shadow-[0_6px_0_#94a3b8] flex flex-col items-center w-full">
               <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Seeds Left</span>
               <span className="text-3xl font-black text-emerald-600 tabular-nums tracking-tight">{triesLeft}</span>
            </div>
        </div>

        {/* Center: Game Board with Bamboo Frame */}
        <div className="relative flex items-center justify-center flex-1 h-full">
          {/* Detailed Bamboo Frame */}
          <div className="relative p-10">
            {/* Horizontal Bamboo Rails */}
            <div className="absolute top-0 left-0 right-0 h-14 bg-[#d4d699] border-y-4 border-[#8B7355] rounded-full z-0 flex items-center px-6">
               <div className="w-full h-5 bg-[#8B7355]/30 rounded-full" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-14 bg-[#d4d699] border-y-4 border-[#8B7355] rounded-full z-0" />
            
            {/* Vertical Bamboo Rails */}
            <div className="absolute top-0 bottom-0 left-0 w-14 bg-[#d4d699] border-x-4 border-[#8B7355] rounded-full z-0" />
            <div className="absolute top-0 bottom-0 right-0 w-14 bg-[#d4d699] border-x-4 border-[#8B7355] rounded-full z-0" />

            {/* Corner Caps (Stone Style) */}
            <div className="absolute top-0 left-0 w-16 h-16 bg-[#cbd5e1] rounded-2xl border-4 border-stone-400 z-10 flex items-center justify-center shadow-md">
               <div className="w-5 h-5 bg-stone-500 rounded-full border-2 border-stone-600" />
            </div>
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#cbd5e1] rounded-2xl border-4 border-stone-400 z-10 flex items-center justify-center shadow-md">
               <div className="w-5 h-5 bg-stone-500 rounded-full border-2 border-stone-600" />
            </div>

            {/* Board Content */}
            <div 
              className="relative bg-[#0d5c63] rounded-2xl overflow-hidden shadow-[inset_0_10px_30px_rgba(0,0,0,0.4)]"
              style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}
            >
              {/* Mossy/Yellow Patches Background */}
              <div className="absolute inset-0 opacity-40 pointer-events-none">
                <div className="absolute top-20 left-40 w-80 h-40 bg-yellow-400 blur-[80px] rounded-full" />
                <div className="absolute bottom-40 right-20 w-64 h-64 bg-emerald-400 blur-[80px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[#083344]/50" />
                <div className="absolute inset-0" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/dark-wood.png")' }} />
              </div>

              {/* Dropper Crane */}
              <motion.div 
                className="absolute -top-10 z-30 flex flex-col items-center"
                animate={{ x: dropperX - 60 }}
                transition={{ type: 'spring', stiffness: 500, damping: 50 }}
              >
                <div className="relative flex flex-col items-center">
                   {/* Crane Arm */}
                   <div className="w-40 h-8 bg-[#8B7355] rounded-full border-4 border-stone-700 shadow-xl" />
                   <div className="w-6 h-14 bg-stone-600 -mt-1 shadow-inner" />
                   
                   {/* Greenhouse Dropper */}
                   <div className={cn(
                     "relative w-24 h-28 bg-white/20 backdrop-blur-md border-4 rounded-2xl flex items-center justify-center overflow-hidden shadow-2xl transition-colors",
                     isJackpotSeedActive ? "border-yellow-400 bg-yellow-400/20" : "border-stone-400"
                   )}>
                      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-1 opacity-50">
                         <div className={cn("rounded-sm", isJackpotSeedActive ? "bg-yellow-500/40" : "bg-emerald-500/40")} />
                         <div className={cn("rounded-sm", isJackpotSeedActive ? "bg-yellow-500/40" : "bg-emerald-500/40")} />
                         <div className={cn("rounded-sm", isJackpotSeedActive ? "bg-yellow-500/40" : "bg-emerald-500/40")} />
                         <div className={cn("rounded-sm", isJackpotSeedActive ? "bg-yellow-500/40" : "bg-emerald-500/40")} />
                      </div>
                      <div className={cn(
                        "relative w-10 h-10 rounded-full animate-pulse shadow-2xl",
                        isJackpotSeedActive ? "bg-yellow-400 shadow-[0_0_35px_rgba(251,191,36,1)]" : "bg-emerald-400 shadow-[0_0_25px_rgba(52,211,153,1)]"
                      )} />
                   </div>
                   <div className="w-6 h-8 bg-stone-600 rounded-b-full shadow-md" />
                </div>
                
                {/* Jackpot Alert */}
                <AnimatePresence>
                  {isJackpotSeedActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute top-32 whitespace-nowrap bg-yellow-400 text-yellow-900 px-4 py-1 rounded-full font-black text-xs shadow-lg border-2 border-yellow-600"
                    >
                      JACKPOT SEED!
                    </motion.div>
                  )}
                </AnimatePresence>
             </motion.div>

              {/* Matter.js Canvas Container */}
              <div ref={sceneRef} className="absolute inset-0 z-10" />

              {/* Circular Pins Visuals */}
              {pins.map(pin => {
                const hitTime = activeMushrooms[pin.id];
                const isAnimating = hitTime && (Date.now() - hitTime < 1000);
                
                return (
                  <motion.div
                    key={pin.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex items-center justify-center"
                    style={{ 
                      left: pin.x, 
                      top: pin.y,
                      width: PIN_RADIUS * 4,
                      height: PIN_RADIUS * 4
                    }}
                    animate={isAnimating ? {
                      scale: [1, 1.2, 1],
                      borderRadius: ["50%", "10%", "50%"],
                      backgroundColor: ['#34d399', '#fbbf24', '#34d399'],
                    } : { 
                      scale: 1,
                      borderRadius: "50%",
                      backgroundColor: '#34d399'
                    }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                  >
                    {/* Outer Glow */}
                    <div className={cn(
                      "absolute inset-0 bg-emerald-400/20 blur-md transition-all duration-300",
                      isAnimating ? "rounded-sm scale-125 bg-yellow-400/40" : "rounded-full"
                    )} />
                    
                    {/* Main Pin Shape */}
                    <div className={cn(
                      "relative w-full h-full border-2 border-emerald-500/50 bg-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.5)] flex items-center justify-center overflow-hidden transition-all duration-300",
                      isAnimating ? "rounded-sm rotate-45 border-yellow-500 bg-yellow-400" : "rounded-full"
                    )}>
                       {/* Inner Highlight */}
                       <div className="absolute top-1 left-1 w-1/3 h-1/3 bg-white/40 rounded-full blur-[1px]" />
                       
                       {/* Subtle Pattern */}
                       <div className="w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #064e3b 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
                    </div>
                  </motion.div>
                );
              })}

              {/* Particles Overlay */}
              <div className="absolute inset-0 pointer-events-none z-40">
                {particles.map(p => (
                  <div 
                    key={p.id}
                    className={cn(
                      "absolute shadow-[0_0_10px_currentColor]",
                      p.type === 'leaf' ? "rounded-tr-full rounded-bl-full" : "rounded-full"
                    )}
                    style={{ 
                      left: p.x, 
                      top: p.y, 
                      width: p.size,
                      height: p.size * (p.type === 'leaf' ? 1.5 : 1),
                      backgroundColor: p.color,
                      color: p.color,
                      opacity: p.life * 0.8,
                      transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.life})`,
                      filter: p.type === 'spore' ? 'blur(1px)' : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Slots Visuals (Baskets) */}
              <div className="absolute bottom-0 left-0 right-0 h-32 flex z-30 px-3 pb-3">
                {SLOTS.map((slot, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end px-1">
                    <div className="relative w-full h-full bg-amber-100 rounded-t-3xl border-x-4 border-t-4 border-amber-300 flex flex-col items-center justify-between py-3 shadow-[0_-5px_15px_rgba(0,0,0,0.2)] overflow-hidden">
                       {/* Basket Weave Pattern */}
                       <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/woven.png")' }} />
                       
                       <RewardIcon type={slot.reward} className="w-8 h-8 drop-shadow-sm z-10" />
                       
                       {/* Stored Balls Visual */}
                       <div className="absolute bottom-10 left-0 right-0 flex flex-wrap justify-center gap-1 px-2">
                          {Array.from({ length: Math.min(ballsInBaskets[i] || 0, 12) }).map((_, idx) => (
                            <motion.div 
                              key={idx}
                              initial={{ scale: 0, y: -20 }}
                              animate={{ scale: 1, y: 0 }}
                              className="w-3 h-3 bg-emerald-400 rounded-full border border-emerald-600 shadow-sm"
                            />
                          ))}
                          {(ballsInBaskets[i] || 0) > 12 && (
                            <span className="text-[8px] font-bold text-amber-800">+{ballsInBaskets[i] - 12}</span>
                          )}
                       </div>

                       <div className={cn(
                         "px-3 py-1 rounded-lg border-2 shadow-inner z-10 transition-colors",
                         slot.value === '10k' ? "bg-yellow-100 border-yellow-400" : "bg-white/90 border-stone-300"
                       )}>
                          <span className={cn(
                            "text-[12px] font-black tracking-tighter",
                            slot.value === '10k' ? "text-yellow-700" : "text-stone-700"
                          )}>{slot.label}</span>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: GO Button */}
        <div className="flex flex-col items-center justify-center h-[90%] w-64 py-4">
          {/* Bottom Right: GO Button Bin */}
          <div className="relative w-full flex flex-col items-center">
             <div className="relative w-56 h-64 bg-[#dcfce7] rounded-[40px] border-4 border-emerald-300 shadow-[0_12px_0_#86efac] flex flex-col items-center justify-end p-6 overflow-hidden">
                {/* Bin Details */}
                <div className="absolute top-6 w-40 h-10 bg-emerald-200 rounded-full border-2 border-emerald-300 shadow-inner" />
                <div className="absolute top-20 left-6 right-6 h-28 bg-white/60 rounded-2xl border-4 border-emerald-200 flex items-center justify-center p-4 shadow-sm">
                   <span className="text-5xl font-black text-emerald-800 tracking-tighter drop-shadow-sm">GO!</span>
                </div>
                
                {/* Actual Button (Invisible overlay for interaction) */}
                <button 
                  onClick={dropBall}
                  disabled={triesLeft <= 0}
                  className={cn(
                    "absolute inset-0 w-full h-full transition-all active:bg-emerald-500/10",
                    triesLeft > 0 ? "cursor-pointer" : "cursor-not-allowed"
                  )}
                />
             </div>

             {/* Wheels */}
             <div className="mt-4 flex gap-12">
                <div className="w-8 h-8 bg-stone-500 rounded-full border-4 border-stone-600 shadow-md" />
                <div className="w-8 h-8 bg-stone-500 rounded-full border-4 border-stone-600 shadow-md" />
             </div>
          </div>
        </div>
      </div>

      {/* Floating Decorative Elements */}
      <div className="fixed top-20 left-1/4 pointer-events-none opacity-20">
         <Leaf className="w-32 h-32 text-emerald-900 rotate-45" />
      </div>
      <div className="fixed bottom-20 right-1/4 pointer-events-none opacity-20">
         <Leaf className="w-48 h-48 text-emerald-900 -rotate-12" />
      </div>

      {/* Start Screen Overlay */}
      <AnimatePresence>
        {!gameStarted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0d5c63]/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-12 rounded-[40px] border-8 border-emerald-400 shadow-2xl flex flex-col items-center max-w-md text-center"
            >
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Sprout className="w-16 h-16 text-emerald-500" />
              </div>
              <h2 className="text-4xl font-black text-emerald-800 mb-2">READY TO PLANT?</h2>
              <p className="text-stone-500 mb-8 font-medium">Choose how many seeds you want to drop in this session.</p>
              
              <div className="flex flex-col items-center gap-4 w-full mb-8">
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest">Number of Tries</label>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setInputTries(prev => Math.max(1, prev - 5))}
                    className="w-12 h-12 bg-stone-100 rounded-xl border-2 border-stone-200 flex items-center justify-center text-2xl font-black text-stone-600 hover:bg-stone-200 transition-colors"
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    value={inputTries}
                    onChange={(e) => setInputTries(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 h-16 bg-stone-50 rounded-2xl border-4 border-emerald-200 text-center text-3xl font-black text-emerald-700 focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                  <button 
                    onClick={() => setInputTries(prev => Math.min(100, prev + 5))}
                    className="w-12 h-12 bg-stone-100 rounded-xl border-2 border-stone-200 flex items-center justify-center text-2xl font-black text-stone-600 hover:bg-stone-200 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="w-full py-5 bg-emerald-500 text-white font-black text-xl rounded-2xl border-4 border-emerald-600 shadow-[0_8px_0_#059669] hover:translate-y-1 active:shadow-none transition-all"
              >
                START GAME
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Congratulations Overlay */}
      <AnimatePresence>
        {showCongrats && (
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              className="bg-white p-12 rounded-[40px] border-8 border-yellow-400 shadow-2xl flex flex-col items-center max-w-lg text-center"
              layoutId="congrats-modal"
            >
              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
                <Sun className="w-16 h-16 text-yellow-500 animate-spin-slow" />
              </div>
              <h2 className="text-5xl font-black text-emerald-800 mb-4 leading-tight">CONGRATULATIONS!</h2>
              <p className="text-xl font-bold text-stone-600 mb-8">
                You hit the legendary 10,000 slot! Your contribution to the ecosystem is massive.
              </p>
              <button 
                onClick={() => setShowCongrats(false)}
                className="px-10 py-5 bg-emerald-500 text-white font-black text-xl rounded-2xl border-4 border-emerald-600 shadow-[0_8px_0_#059669] hover:translate-y-1 active:shadow-none transition-all"
              >
                KEEP GROWING
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
