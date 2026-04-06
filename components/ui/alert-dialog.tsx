"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AlertDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

interface AlertDialogContentProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogHeaderProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogTitleProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

interface AlertDialogCancelProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  )
}

export function AlertDialogContent({ children, className }: AlertDialogContentProps) {
  return (
    <DialogContent className={className}>
      {children}
    </DialogContent>
  )
}

export function AlertDialogHeader({ children, className }: AlertDialogHeaderProps) {
  return (
    <DialogHeader className={className}>
      {children}
    </DialogHeader>
  )
}

export function AlertDialogTitle({ children, className }: AlertDialogTitleProps) {
  return (
    <DialogTitle className={className}>
      {children}
    </DialogTitle>
  )
}

export function AlertDialogDescription({ children, className }: AlertDialogDescriptionProps) {
  return (
    <DialogDescription className={className}>
      {children}
    </DialogDescription>
  )
}

export function AlertDialogAction({ children, className, ...props }: AlertDialogActionProps) {
  return (
    <Button className={cn("", className)} {...props}>
      {children}
    </Button>
  )
}

export function AlertDialogCancel({ children, className, ...props }: AlertDialogCancelProps) {
  return (
    <DialogClose asChild>
      <Button variant="outline" className={className} {...props}>
        {children}
      </Button>
    </DialogClose>
  )
}
