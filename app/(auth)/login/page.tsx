"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: student } = await (supabase as any)
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()

        if (student) {
          router.push("/student-portal")
        } else {
          router.push("/dashboard")
        }
      } else {
        router.push("/dashboard")
      }
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-neutral-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-white">
            <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Tuta Educators</h1>
              <p className="text-neutral-600 text-sm">School Management System</p>
            </div>
          </div>
        </div>
        
        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-bold text-white leading-tight">
            Manage your school<br />with confidence
          </h2>
          <p className="text-neutral-300 text-lg leading-relaxed max-w-md">
            Streamline admissions, track attendance, manage fees, and gain insights with our comprehensive platform.
          </p>
          <div className="flex gap-8 pt-4">
            <div>
              <div className="text-3xl font-bold text-white">10K+</div>
              <div className="text-neutral-300 text-sm">Students</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">500+</div>
              <div className="text-neutral-300 text-sm">Schools</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">99%</div>
              <div className="text-neutral-300 text-sm">Uptime</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-neutral-400 text-sm">
          © 2026 Tuta Educators. All rights reserved.
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Tuta Educators</h1>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Welcome back</h2>
            <p className="text-neutral-500">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-refined h-11"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-refined h-11"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 border border-red-200 dark:border-red-800/50">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 font-medium bg-primary hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-neutral-500">
                New to Tuta Educators?
              </span>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/signup"
              className="text-sm font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
