
"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Download, Terminal, Sparkles, Zap, Command, Monitor } from "lucide-react"

const Step = ({ step, index }: { step: any; index: number }) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.8, delay: index * 0.1 }}
      className={`flex flex-col ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} gap-8 md:gap-20 items-center justify-between w-full max-w-6xl`}
    >
      {/* Text Section */}
      <div className="flex-1 flex flex-col gap-6 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-xl font-bold text-primary font-mono">0{index + 1}</span>
          </div>
          <span className="text-sm font-medium tracking-widest text-muted-foreground uppercase">{step.label}</span>
        </div>
        
        <h3 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
          {step.title}
        </h3>
        
        <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
          {step.description}
        </p>

        <ul className="flex flex-col gap-3 mt-2">
          {step.features.map((feature: string, i: number) => (
            <li key={i} className="flex items-center gap-3 text-sm font-medium text-foreground/80 justify-center md:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual Section */}
      <div className="flex-1 w-full relative group">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent rounded-3xl blur-2xl transform group-hover:scale-105 transition-transform duration-700 opacity-50" />
        <div className="relative aspect-[4/3] rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden shadow-2xl flex items-center justify-center p-8">
           {step.visual}
        </div>
      </div>
    </motion.div>
  )
}

const VisualMockup1 = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <div className="absolute inset-x-8 top-8 bottom-0 bg-background rounded-t-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
       <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
         <div className="w-3 h-3 rounded-full bg-red-500/50" />
         <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
         <div className="w-3 h-3 rounded-full bg-green-500/50" />
       </div>
       <div className="flex-1 p-6 flex items-center justify-center flex-col gap-4">
          <Download className="w-16 h-16 text-primary/50 animate-bounce" />
          <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
             <motion.div 
               initial={{ x: "-100%" }}
               animate={{ x: "100%" }}
               transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
               className="w-full h-full bg-primary/50"
             />
          </div>
          <span className="text-xs text-muted-foreground font-mono">Installing HaloAI...</span>
       </div>
    </div>
  </div>
)

const VisualMockup2 = () => (
   <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4">
        <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/10 shadow-xl flex items-center justify-center transform hover:translate-y-1 transition-transform cursor-default">
           <Command className="w-10 h-10 text-foreground" />
        </div>
         <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/10 shadow-xl flex items-center justify-center transform hover:translate-y-1 transition-transform cursor-default">
           <span className="text-xl font-bold">Space</span>
        </div>
      </div>
      <div className="text-sm text-primary font-mono bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
        Global Shortcut
      </div>
   </div>
)

const VisualMockup3 = () => (
  <div className="relative w-full max-w-sm aspect-video bg-background/50 rounded-lg border border-white/10 shadow-2xl p-4 flex flex-col gap-3 overflow-hidden">
     {/* Fake UI Elements */}
      <div className="w-2/3 h-4 bg-white/10 rounded" />
      <div className="w-full h-32 bg-white/5 rounded border border-white/5 relative overflow-hidden">
         <div className="absolute inset-0 flex items-center justify-center">
            <Monitor className="w-12 h-12 text-muted-foreground/20" />
         </div>
         {/* Scanning Effect */}
         <motion.div 
           initial={{ top: "0%" }}
           animate={{ top: "100%" }}
           transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
           className="absolute left-0 right-0 h-1 bg-primary/50 shadow-[0_0_20px_rgba(var(--primary),0.5)]"
         />
      </div>
      <div className="flex gap-2">
         <div className="flex-1 h-2 bg-white/10 rounded" />
         <div className="w-12 h-2 bg-primary/30 rounded" />
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] text-primary border border-primary/20">
         <Sparkles className="w-3 h-3" />
         Analyzing Context
      </div>
  </div>
)

const VisualMockup4 = () => (
  <div className="relative w-full h-full flex items-center justify-center p-6">
     <div className="absolute inset-0 bg-primary/5 rounded-3xl" />
      <div className="relative w-full bg-background rounded-xl border border-white/10 shadow-2xl p-4 flex flex-col gap-4">
        <div className="flex items-start gap-3">
           <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-primary" />
           </div>
           <div className="space-y-2 flex-1">
              <div className="text-sm font-medium text-foreground">Here is the generated code snippet:</div>
              <div className="bg-black/40 rounded-lg p-3 border border-white/5 font-mono text-xs text-muted-foreground">
                 <span className="text-purple-400">const</span> <span className="text-blue-400">App</span> = () ={">"} {"{"} <br/>
                 &nbsp;&nbsp;<span className="text-purple-400">return</span> <span className="text-green-400">"Hello World"</span><br/>
                 {"}"}
              </div>
              <div className="flex gap-2">
                 <div className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs">Copy</div>
                 <div className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold">Insert</div>
              </div>
           </div>
        </div>
      </div>
  </div>
)

export function HowItWorksSection() {
  const steps = [
    {
      label: "The Foundation",
      title: "Native Performance",
      description: "HaloAI isn't just a browser extension. It's a powerhouse native application built for speed, sitting quietly in your system tray until you need it.",
      features: ["Low memory footprint", "System-level integration", "Instant startup"],
      visual: <VisualMockup1 />
    },
    {
      label: "The Trigger",
      title: "Instant Access",
      description: "Summon your assistant without lifting your hands from the keyboard. A simple global shortcut brings HaloAI to your service immediately.",
      features: ["Customizable hotkeys", "Global availability", "Zero latency focus"],
      visual: <VisualMockup2 />
    },
    {
      label: "The Context",
      title: "Screen Intelligence",
      description: "HaloAI sees what you see. It intelligently analyzes your active window, capturing context from code editors, browsers, or documents.",
      features: ["Active window analysis", "Smart OCR & Accessibility integration", "Privacy-first processing"],
      visual: <VisualMockup3 />
    },
    {
      label: "The Execution",
      title: "AI Action",
      description: "Get relevant, actionable responses instantly, whether it's code generation, text refactoring, or complex problem solving.",
      features: ["Context-aware responses", "One-click insertion", "Multi-model support"],
      visual: <VisualMockup4 />
    }
  ]

  return (
    <section className="w-full py-24 md:py-32 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      
      <div className="container mx-auto px-4 flex flex-col items-center gap-24 md:gap-32">
        <div className="text-center max-w-3xl space-y-4">
           <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
             How HaloAI works
           </h2>
           <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
             From a keystroke to a solution in milliseconds. Experience the flow designed for power users.
           </p>
        </div>

        <div className="flex flex-col w-full items-center gap-24 md:gap-32 relative">
           {/* Connecting Line */}
           <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent hidden md:block" />

           {steps.map((step, index) => (
             <Step key={index} index={index} step={step} />
           ))}
        </div>
      </div>
    </section>
  )
}

