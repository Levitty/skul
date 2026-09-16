import type { Metadata } from "next"
import { ClassRoom } from "../class-room"

export const metadata: Metadata = {
  title: "Tutagora · Class",
  description:
    "Four periods on how Tutagora runs a school, worked with your own numbers: fees, the register, parents on WhatsApp, and the office.",
}

export default function ClassPage() {
  return <ClassRoom />
}
