"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  Users,
  UserPlus,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ImportResult {
  row: number
  student_name: string
  status: "success" | "error"
  error?: string
}

interface ImportResponse {
  message: string
  total: number
  success_count: number
  error_count: number
  results: ImportResult[]
}

export function BulkImportClient() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please upload a .csv file")
      return
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File size must be under 5MB")
      return
    }

    setFile(selectedFile)
    setError(null)
    setResponse(null)

    // Parse preview (first 6 rows)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      const rows = lines.slice(0, 6).map((line) => {
        const values: string[] = []
        let current = ""
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') inQuotes = !inQuotes
          else if (char === "," && !inQuotes) {
            values.push(current.trim())
            current = ""
          } else current += char
        }
        values.push(current.trim())
        return values
      })
      setPreview(rows)
    }
    reader.readAsText(selectedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleImport = async () => {
    if (!file) return

    setImporting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/students/bulk-import", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Import failed")
        if (data.details) {
          setError(data.error + "\n" + data.details.join("\n"))
        }
      } else {
        setResponse(data)
      }
    } catch (err: any) {
      setError("Network error: " + err.message)
    } finally {
      setImporting(false)
    }
  }

  const clearFile = () => {
    setFile(null)
    setPreview([])
    setResponse(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const dataRowCount = preview.length > 1 ? preview.length - 1 : 0

  return (
    <div className="space-y-6">
      {/* Instructions Card */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50/60">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-sm text-neutral-900">Download Template</p>
                <p className="text-xs text-neutral-600 mt-1">
                  Get the CSV template with all the right columns
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50/60">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-sm text-neutral-900">Fill In Your Data</p>
                <p className="text-xs text-neutral-600 mt-1">
                  Add student names, classes, and guardian info
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50/60">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-sm text-neutral-900">Upload & Import</p>
                <p className="text-xs text-neutral-600 mt-1">
                  Upload the file and students are created instantly
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <a href="/templates/students-bulk-import-template.csv" download>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Download CSV Template
              </Button>
            </a>
            <p className="text-xs text-neutral-500">
              Includes 2 example rows you can delete. Max 500 students per import.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card className="border border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            Upload File
          </CardTitle>
          <CardDescription>
            Drop your filled CSV file here or click to browse
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
                dragActive
                  ? "border-emerald-400 bg-emerald-50/50"
                  : "border-neutral-300 hover:border-emerald-400 hover:bg-emerald-50/30"
              )}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-neutral-900">
                    {dragActive ? "Drop your file here" : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">CSV files only, up to 5MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0])
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="font-medium text-sm text-neutral-900">{file.name}</p>
                    <p className="text-xs text-neutral-500">
                      {(file.size / 1024).toFixed(1)}KB &middot; {dataRowCount} student{dataRowCount !== 1 ? "s" : ""} detected
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFile}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Preview table */}
              {preview.length > 1 && (
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-neutral-50">
                        {preview[0].slice(0, 8).map((header, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap"
                          >
                            {header}
                          </th>
                        ))}
                        {preview[0].length > 8 && (
                          <th className="px-3 py-2 text-left font-medium text-neutral-400">
                            +{preview[0].length - 8} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          {row.slice(0, 8).map((cell, j) => (
                            <td key={j} className="px-3 py-2 text-neutral-700 whitespace-nowrap">
                              {cell || <span className="text-neutral-300">—</span>}
                            </td>
                          ))}
                          {row.length > 8 && <td className="px-3 py-2 text-neutral-400">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Import button */}
              {!response && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="btn-primary gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing {dataRowCount} students...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Import {dataRowCount} Student{dataRowCount !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={clearFile} disabled={importing}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border border-red-200 bg-red-50/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Import Error</p>
                <pre className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{error}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {response && (
        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Import Results
            </CardTitle>
            <CardDescription>{response.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-xl bg-neutral-50 text-center">
                <p className="text-2xl font-bold text-neutral-900">{response.total}</p>
                <p className="text-xs text-neutral-500 mt-1">Total Rows</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 text-center">
                <p className="text-2xl font-bold text-emerald-700">{response.success_count}</p>
                <p className="text-xs text-emerald-600 mt-1">Imported Successfully</p>
              </div>
              <div className="p-4 rounded-xl bg-rose-50 text-center">
                <p className="text-2xl font-bold text-rose-700">{response.error_count}</p>
                <p className="text-xs text-rose-600 mt-1">Failed</p>
              </div>
            </div>

            {/* Detail list */}
            <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Row</th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Student</th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {response.results.map((result, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-4 py-2 text-neutral-500">{result.row}</td>
                      <td className="px-4 py-2 font-medium">{result.student_name}</td>
                      <td className="px-4 py-2">
                        {result.status === "success" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" /> Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <XCircle className="w-4 h-4" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-500 text-xs">
                        {result.error || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions after import */}
            <div className="flex items-center gap-3 pt-2">
              <a href="/dashboard/admin/students">
                <Button className="btn-primary gap-2">
                  <Users className="w-4 h-4" />
                  View All Students
                </Button>
              </a>
              <Button variant="outline" onClick={clearFile}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
