import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'HaloAI - Context-Aware Desktop Assistant',
  description: 'Accelerate your workflow with intelligent AI agents that write, create, and optimize your work.',
  generator: 'v0.app',
  icons: {
    icon: '/images/favicon.png',
    apple: '/images/favicon.png', // Using same image for apple icon for now as explicit request was for this image
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
