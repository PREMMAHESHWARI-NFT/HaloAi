

export function SocialProof() {
  return (
    <section className="self-stretch py-16 flex flex-col justify-center items-center gap-6 overflow-hidden">
      <div className="text-center text-gray-300 text-3xl font-medium leading-tight">
        Tech-stack being used
      </div>
      <div className="self-stretch flex flex-wrap justify-center items-center gap-8 md:gap-12 px-4">
        {[
          "Stellar",
          "Soroban",
          "Privy",
          "Electron",
          "Next.js",
          "TypeScript",
          "OpenRouter",
          "VS Code"
        ].map((tech) => (
          <span
            key={tech}
            className="text-gray-400 text-xl md:text-2xl font-bold opacity-70 hover:opacity-100 transition-opacity cursor-default"
          >
            {tech}
          </span>
        ))}
      </div>
    </section>
  )
}
