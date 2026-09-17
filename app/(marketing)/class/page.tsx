import type { Metadata } from "next"
import { ClassRoom } from "../class-room"
import { CLASS_TITLE, CLASS_DESC } from "../seo"

export const metadata: Metadata = {
  title: { absolute: CLASS_TITLE },
  description: CLASS_DESC,
  alternates: { canonical: "/class" },
  openGraph: { title: CLASS_TITLE, description: CLASS_DESC, url: "/class" },
}

export default function ClassPage() {
  return <ClassRoom />
}
