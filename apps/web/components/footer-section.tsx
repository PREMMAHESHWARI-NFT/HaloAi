"use client"



export function FooterSection() {
  return (
    <div className="w-full flex flex-col items-center justify-center gap-8 py-20">
      <div className="text-center relative">
        <h1 className="text-[120px] md:text-[180px] font-bold text-foreground opacity-[0.03] select-none leading-none tracking-tighter">
          HaloAI
        </h1>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-2xl font-semibold text-foreground"></div>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">© {new Date().getFullYear()} HaloAI. All rights reserved.</p>
    </div>
  )
}
