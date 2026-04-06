import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { runDiagnostics } from "@/lib/actions/diagnostics"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function DiagnosticsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const diagnostics = await runDiagnostics()

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">System Diagnostics</h1>
        <p className="text-muted-foreground">
          Check your account status and troubleshoot save issues
        </p>
      </div>

      <div className="space-y-6">
        {/* Authentication Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {diagnostics.hasAuth ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Authentication Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {diagnostics.hasAuth ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Status:</span> Authenticated
                </p>
                <p className="text-sm">
                  <span className="font-medium">User ID:</span>{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {diagnostics.userId}
                  </code>
                </p>
                <p className="text-sm">
                  <span className="font-medium">Email:</span> {diagnostics.userEmail}
                </p>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Not Authenticated</AlertTitle>
                <AlertDescription>{diagnostics.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* School Association Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {diagnostics.hasSchoolAssociation ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              School Association
            </CardTitle>
          </CardHeader>
          <CardContent>
            {diagnostics.hasSchoolAssociation ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Status:</span> Associated with school
                </p>
                <p className="text-sm">
                  <span className="font-medium">School ID:</span>{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {diagnostics.schoolId}
                  </code>
                </p>
                <p className="text-sm">
                  <span className="font-medium">Role:</span>{" "}
                  <span className="capitalize">{diagnostics.role}</span>
                </p>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No School Association</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="mb-4">
                    Your account is not linked to any school. This is why you cannot save
                    anything in the system.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium mb-2">To fix this issue:</p>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Go to your Supabase project SQL Editor</li>
                        <li>Run the following SQL script (replace YOUR_EMAIL with your email):</li>
                      </ol>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-xs overflow-x-auto">
                        {`-- Step 1: Create a school (if you don't have one)
INSERT INTO schools (name, code, address, phone, email, is_active, deployment_mode)
VALUES (
  'My School',
  'SCHOOL001',
  '123 School Street',
  '+254700000000',
  '${diagnostics.userEmail}',
  true,
  'shared'
)
RETURNING id;

-- Step 2: Link your user to the school
INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'school_admin' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = '${diagnostics.userEmail}'
  AND s.code = 'SCHOOL001'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'school_admin'
RETURNING user_id, school_id, role;

-- Step 3: Create user profile
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = '${diagnostics.userEmail}'
  AND s.code = 'SCHOOL001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id;`}
                      </pre>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild>
                        <Link href="/dashboard/admin/school-setup">
                          Go to School Setup
                        </Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Supabase Dashboard
                        </a>
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Available Schools */}
        {diagnostics.schoolsAvailable.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                Available Schools
              </CardTitle>
              <CardDescription>
                Schools found in your database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {diagnostics.schoolsAvailable.map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{school.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Code: {school.code} | ID: {school.id.substring(0, 8)}...
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {!diagnostics.hasSchoolAssociation && diagnostics.schoolsAvailable.length > 0 && (
                <Alert className="mt-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Quick Fix</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">
                      You can link your account to an existing school using this SQL:
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {`INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id,
  '${diagnostics.schoolsAvailable[0].id}',
  'school_admin'
FROM auth.users u
WHERE u.email = '${diagnostics.userEmail}'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'school_admin';`}
                    </pre>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {diagnostics.error && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <XCircle className="h-5 w-5" />
                Error Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{diagnostics.error}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
