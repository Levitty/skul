"use client"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Student } from "@/lib/db/schema"
import Link from "next/link"

interface StudentsTableProps {
  students: Student[]
}

export function StudentsTable({ students }: StudentsTableProps) {
  if (students.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No students found. Add your first student to get started.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Admission Number</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Date of Birth</TableHead>
          <TableHead>Gender</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id}>
            <TableCell className="font-medium">
              {student.admission_number || "N/A"}
            </TableCell>
            <TableCell>
              {student.first_name} {student.last_name}
            </TableCell>
            <TableCell>
              {student.dob ? new Date(student.dob).toLocaleDateString() : "N/A"}
            </TableCell>
            <TableCell>{student.gender || "N/A"}</TableCell>
            <TableCell>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-800">
                {student.status}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/dashboard/admin/students/${student.id}`}>
                <Button variant="outline" size="sm">
                  View Details
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

