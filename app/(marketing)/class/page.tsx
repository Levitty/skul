import type { Metadata } from "next"
import { ClassRoom } from "../class-room"

export const metadata: Metadata = {
  title: "Tutagora · Class",
  description:
    "Nine periods on how Tutagora runs a school as one record: the learner at the centre, fees, parents on WhatsApp, the fence, the staff, and management.",
}

export default function ClassPage() {
  return <ClassRoom />
}
